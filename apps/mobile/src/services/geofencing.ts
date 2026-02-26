import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GEOFENCE_TASK = 'JOB_SITE_GEOFENCE';
const BACKGROUND_AUTH_KEY = '@nexus_bg_auth';
const GEOFENCE_CONFIG_KEY = '@nexus_geofence_config';
const CLOCK_STATE_KEY = '@nexus_clock_state';

export interface BackgroundAuth {
  token: string;
  userId: string;
  apiBaseUrl: string;
  lastRefresh: number;
}

export interface GeofenceConfig {
  enabled: boolean;
  autoClockIn: boolean;
  autoClockOut: boolean;
  dwellTimeMinutes: number; // Min time at site before auto clock-in
  graceTimeMinutes: number; // Time after leaving before auto clock-out
  workHoursStart: number; // Hour (0-23)
  workHoursEnd: number; // Hour (0-23)
  projects: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number; // meters
  }>;
}

export interface ClockState {
  [projectId: string]: {
    clockedIn: boolean;
    clockInTime?: number;
    pendingClockOut?: number; // Timestamp when grace period expires
    enteredAt?: number; // Timestamp when entered geofence (for dwell time)
  };
}

const DEFAULT_CONFIG: GeofenceConfig = {
  enabled: false,
  autoClockIn: true,
  autoClockOut: true,
  dwellTimeMinutes: 5,
  graceTimeMinutes: 10,
  workHoursStart: 6,
  workHoursEnd: 20,
  projects: [],
};

// ──────────────────────────────────────────────────────────────────────
// Background Task Definition (runs even when app is closed)
// ──────────────────────────────────────────────────────────────────────

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[Geofence] Background task error:', error);
    return;
  }

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.GeofencingRegion;
  };

  console.log('[Geofence] Event:', eventType, 'Region:', region.identifier);

  try {
    // Load auth and config from AsyncStorage (accessible in background)
    const authJson = await AsyncStorage.getItem(BACKGROUND_AUTH_KEY);
    const configJson = await AsyncStorage.getItem(GEOFENCE_CONFIG_KEY);
    const stateJson = await AsyncStorage.getItem(CLOCK_STATE_KEY);

    if (!authJson || !configJson) {
      console.warn('[Geofence] Missing auth or config, skipping');
      return;
    }

    const auth: BackgroundAuth = JSON.parse(authJson);
    const config: GeofenceConfig = JSON.parse(configJson);
    const state: ClockState = stateJson ? JSON.parse(stateJson) : {};

    // Check if within work hours
    const now = new Date();
    const hour = now.getHours();
    if (hour < config.workHoursStart || hour >= config.workHoursEnd) {
      console.log('[Geofence] Outside work hours, ignoring');
      return;
    }

    const projectId = region.identifier;
    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      console.warn('[Geofence] Unknown project:', projectId);
      return;
    }

    const currentState = state[projectId] || { clockedIn: false };

    if (eventType === Location.GeofencingEventType.Enter) {
      await handleGeofenceEnter(auth, config, project, currentState, state);
    } else if (eventType === Location.GeofencingEventType.Exit) {
      await handleGeofenceExit(auth, config, project, currentState, state);
    }
  } catch (err) {
    console.error('[Geofence] Task error:', err);
  }
});

// ──────────────────────────────────────────────────────────────────────
// Geofence Event Handlers
// ──────────────────────────────────────────────────────────────────────

async function handleGeofenceEnter(
  auth: BackgroundAuth,
  config: GeofenceConfig,
  project: GeofenceConfig['projects'][0],
  currentState: ClockState[string],
  allState: ClockState,
) {
  console.log('[Geofence] Entered:', project.name);

  // If already clocked in, do nothing
  if (currentState.clockedIn) {
    console.log('[Geofence] Already clocked in');
    return;
  }

  // Cancel any pending clock-out
  if (currentState.pendingClockOut) {
    console.log('[Geofence] Cancelled pending clock-out (returned to site)');
    delete currentState.pendingClockOut;
    await saveClockState(project.id, currentState, allState);
    return;
  }

  // Mark entry time (for dwell time check)
  currentState.enteredAt = Date.now();
  await saveClockState(project.id, currentState, allState);

  // If dwell time required, schedule a delayed check
  if (config.dwellTimeMinutes > 0) {
    console.log(`[Geofence] Dwell time required: ${config.dwellTimeMinutes} min`);
    // Schedule notification to check dwell time later
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Ready to clock in at ${project.name}?`,
        body: `Tap to confirm you're working at this job site.`,
        data: { type: 'clock_in_confirm', projectId: project.id, projectName: project.name },
      },
      trigger: { seconds: config.dwellTimeMinutes * 60 },
    });
    return;
  }

  // Auto clock-in immediately if no dwell time required
  if (config.autoClockIn) {
    await performClockIn(auth, project, currentState, allState);
  } else {
    // Show notification asking user to confirm
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Arrived at ${project.name}`,
        body: 'Tap to clock in',
        data: { type: 'clock_in_confirm', projectId: project.id, projectName: project.name },
      },
      trigger: null,
    });
  }
}

async function handleGeofenceExit(
  auth: BackgroundAuth,
  config: GeofenceConfig,
  project: GeofenceConfig['projects'][0],
  currentState: ClockState[string],
  allState: ClockState,
) {
  console.log('[Geofence] Exited:', project.name);

  // If not clocked in, do nothing
  if (!currentState.clockedIn) {
    console.log('[Geofence] Not clocked in, ignoring exit');
    // Clear entry time if they left before dwell period
    delete currentState.enteredAt;
    await saveClockState(project.id, currentState, allState);
    return;
  }

  // Start grace period
  const gracePeriodMs = config.graceTimeMinutes * 60 * 1000;
  currentState.pendingClockOut = Date.now() + gracePeriodMs;
  await saveClockState(project.id, currentState, allState);

  console.log(`[Geofence] Grace period started: ${config.graceTimeMinutes} min`);

  if (config.autoClockOut) {
    // Schedule auto clock-out after grace period
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Left ${project.name}`,
        body: `You'll be clocked out in ${config.graceTimeMinutes} minutes unless you return.`,
        data: { type: 'clock_out_pending', projectId: project.id },
      },
      trigger: null,
    });

    // Schedule the actual clock-out
    setTimeout(async () => {
      // Re-check if still outside after grace period
      const updatedStateJson = await AsyncStorage.getItem(CLOCK_STATE_KEY);
      const updatedState: ClockState = updatedStateJson ? JSON.parse(updatedStateJson) : {};
      const latestState = updatedState[project.id];

      if (latestState?.pendingClockOut && Date.now() >= latestState.pendingClockOut) {
        await performClockOut(auth, project, latestState, updatedState);
      }
    }, gracePeriodMs);
  } else {
    // Show notification asking user to confirm
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Left ${project.name}`,
        body: 'Tap to clock out',
        data: { type: 'clock_out_confirm', projectId: project.id, projectName: project.name },
      },
      trigger: null,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Clock In/Out Actions
// ──────────────────────────────────────────────────────────────────────

async function performClockIn(
  auth: BackgroundAuth,
  project: GeofenceConfig['projects'][0],
  currentState: ClockState[string],
  allState: ClockState,
) {
  console.log('[Geofence] Clocking in:', project.name);

  try {
    // Call API to clock in
    const response = await fetch(`${auth.apiBaseUrl}/timecards/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        timestamp: new Date().toISOString(),
        source: 'geofence_auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Clock-in failed: ${response.status}`);
    }

    // Update state
    currentState.clockedIn = true;
    currentState.clockInTime = Date.now();
    delete currentState.enteredAt;
    await saveClockState(project.id, currentState, allState);

    // Show notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Clocked In',
        body: `You're now clocked in at ${project.name}`,
        data: { type: 'clocked_in', projectId: project.id },
      },
      trigger: null,
    });
  } catch (error) {
    console.error('[Geofence] Clock-in error:', error);
    // Show error notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Clock-In Failed',
        body: `Could not auto clock-in at ${project.name}. Please clock in manually.`,
        data: { type: 'clock_in_error', projectId: project.id },
      },
      trigger: null,
    });
  }
}

async function performClockOut(
  auth: BackgroundAuth,
  project: GeofenceConfig['projects'][0],
  currentState: ClockState[string],
  allState: ClockState,
) {
  console.log('[Geofence] Clocking out:', project.name);

  try {
    // Call API to clock out
    const response = await fetch(`${auth.apiBaseUrl}/timecards/clock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        timestamp: new Date().toISOString(),
        source: 'geofence_auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Clock-out failed: ${response.status}`);
    }

    // Update state
    currentState.clockedIn = false;
    delete currentState.clockInTime;
    delete currentState.pendingClockOut;
    await saveClockState(project.id, currentState, allState);

    // Show notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏹️ Clocked Out',
        body: `You've been clocked out from ${project.name}`,
        data: { type: 'clocked_out', projectId: project.id },
      },
      trigger: null,
    });
  } catch (error) {
    console.error('[Geofence] Clock-out error:', error);
    // Show error notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Clock-Out Failed',
        body: `Could not auto clock-out from ${project.name}. Please clock out manually.`,
        data: { type: 'clock_out_error', projectId: project.id },
      },
      trigger: null,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
// State Management
// ──────────────────────────────────────────────────────────────────────

async function saveClockState(
  projectId: string,
  projectState: ClockState[string],
  allState: ClockState,
) {
  allState[projectId] = projectState;
  await AsyncStorage.setItem(CLOCK_STATE_KEY, JSON.stringify(allState));
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

export async function setupGeofencing(
  token: string,
  userId: string,
  apiBaseUrl: string,
  projects: Array<{ id: string; name: string; latitude: number; longitude: number }>,
) {
  console.log('[Geofence] Setting up for', projects.length, 'projects');

  // Request permissions
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    throw new Error('Location permission denied');
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    throw new Error('Background location permission denied');
  }

  // Request notification permission
  await Notifications.requestPermissionsAsync();

  // Store auth data for background task
  const auth: BackgroundAuth = {
    token,
    userId,
    apiBaseUrl,
    lastRefresh: Date.now(),
  };
  await AsyncStorage.setItem(BACKGROUND_AUTH_KEY, JSON.stringify(auth));

  // Load or create config
  const configJson = await AsyncStorage.getItem(GEOFENCE_CONFIG_KEY);
  const config: GeofenceConfig = configJson ? JSON.parse(configJson) : { ...DEFAULT_CONFIG };

  // Update projects
  config.projects = projects.map((p) => ({
    ...p,
    radius: 150, // Default 150 meter radius
  }));
  config.enabled = true;
  await AsyncStorage.setItem(GEOFENCE_CONFIG_KEY, JSON.stringify(config));

  // Define geofence regions
  const regions: Location.LocationRegion[] = config.projects.map((p) => ({
    identifier: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    radius: p.radius,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  // Start geofencing
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);

  console.log('[Geofence] Started monitoring', regions.length, 'regions');
  return config;
}

export async function stopGeofencing() {
  console.log('[Geofence] Stopping');
  await Location.stopGeofencingAsync(GEOFENCE_TASK);
  
  const config = await getGeofenceConfig();
  config.enabled = false;
  await AsyncStorage.setItem(GEOFENCE_CONFIG_KEY, JSON.stringify(config));
}

export async function getGeofenceConfig(): Promise<GeofenceConfig> {
  const json = await AsyncStorage.getItem(GEOFENCE_CONFIG_KEY);
  return json ? JSON.parse(json) : { ...DEFAULT_CONFIG };
}

export async function updateGeofenceConfig(updates: Partial<GeofenceConfig>) {
  const config = await getGeofenceConfig();
  const updated = { ...config, ...updates };
  await AsyncStorage.setItem(GEOFENCE_CONFIG_KEY, JSON.stringify(updated));
  
  // Restart geofencing if enabled
  if (updated.enabled && updated.projects.length > 0) {
    const auth = await getBackgroundAuth();
    if (auth) {
      await setupGeofencing(auth.token, auth.userId, auth.apiBaseUrl, updated.projects);
    }
  }
  
  return updated;
}

export async function getBackgroundAuth(): Promise<BackgroundAuth | null> {
  const json = await AsyncStorage.getItem(BACKGROUND_AUTH_KEY);
  return json ? JSON.parse(json) : null;
}

export async function getClockState(): Promise<ClockState> {
  const json = await AsyncStorage.getItem(CLOCK_STATE_KEY);
  return json ? JSON.parse(json) : {};
}

export async function isGeofencingActive(): Promise<boolean> {
  const hasTask = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (!hasTask) return false;
  
  const config = await getGeofenceConfig();
  return config.enabled;
}

// Manual clock in/out (for user override)
export async function manualClockIn(projectId: string) {
  const auth = await getBackgroundAuth();
  const config = await getGeofenceConfig();
  const state = await getClockState();
  const project = config.projects.find((p) => p.id === projectId);
  
  if (!auth || !project) throw new Error('Not configured');
  
  const projectState = state[projectId] || { clockedIn: false };
  await performClockIn(auth, project, projectState, state);
}

export async function manualClockOut(projectId: string) {
  const auth = await getBackgroundAuth();
  const config = await getGeofenceConfig();
  const state = await getClockState();
  const project = config.projects.find((p) => p.id === projectId);
  
  if (!auth || !project) throw new Error('Not configured');
  
  const projectState = state[projectId] || { clockedIn: false };
  await performClockOut(auth, project, projectState, state);
}
