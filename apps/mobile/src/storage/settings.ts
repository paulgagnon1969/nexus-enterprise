import AsyncStorage from "@react-native-async-storage/async-storage";

const WIFI_ONLY_SYNC_KEY = "nexus.wifiOnlySync";
const PREFERRED_MAP_APP_KEY = "nexus.preferredMapApp";

export type MapAppType = "apple" | "google" | "waze" | null;

export async function getWifiOnlySync(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(WIFI_ONLY_SYNC_KEY);
  return raw === "1";
}

export async function setWifiOnlySync(value: boolean): Promise<void> {
  await AsyncStorage.setItem(WIFI_ONLY_SYNC_KEY, value ? "1" : "0");
}

export async function getPreferredMapApp(): Promise<MapAppType> {
  const raw = await AsyncStorage.getItem(PREFERRED_MAP_APP_KEY);
  if (raw === "apple" || raw === "google" || raw === "waze") {
    return raw;
  }
  return null;
}

export async function setPreferredMapApp(value: MapAppType): Promise<void> {
  if (value) {
    await AsyncStorage.setItem(PREFERRED_MAP_APP_KEY, value);
  } else {
    await AsyncStorage.removeItem(PREFERRED_MAP_APP_KEY);
  }
}

export async function clearPreferredMapApp(): Promise<void> {
  await AsyncStorage.removeItem(PREFERRED_MAP_APP_KEY);
}

// ---- Favorite Projects ----

const FAVORITE_PROJECTS_KEY = "nexus.favoriteProjects";
const LAST_SELECTED_PROJECT_KEY = "nexus.lastSelectedProject";

export async function getFavoriteProjectIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITE_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleFavoriteProject(projectId: string): Promise<boolean> {
  const ids = await getFavoriteProjectIds();
  const idx = ids.indexOf(projectId);
  if (idx >= 0) {
    ids.splice(idx, 1);
    await AsyncStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(ids));
    return false; // removed
  } else {
    ids.push(projectId);
    await AsyncStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(ids));
    return true; // added
  }
}

export async function getLastSelectedProjectId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SELECTED_PROJECT_KEY);
}

export async function setLastSelectedProjectId(projectId: string | null): Promise<void> {
  if (projectId) {
    await AsyncStorage.setItem(LAST_SELECTED_PROJECT_KEY, projectId);
  } else {
    await AsyncStorage.removeItem(LAST_SELECTED_PROJECT_KEY);
  }
}

// ---- Last-active Project (persists across sessions/restarts) ----

const LAST_PROJECT_KEY = "nexus.lastProject";

export interface LastProject {
  id: string;
  name: string;
}

export async function getLastProject(): Promise<LastProject | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") {
      return parsed as LastProject;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setLastProject(project: { id: string; name: string } | null): Promise<void> {
  if (project) {
    await AsyncStorage.setItem(LAST_PROJECT_KEY, JSON.stringify({ id: project.id, name: project.name }));
  } else {
    await AsyncStorage.removeItem(LAST_PROJECT_KEY);
  }
}

// ---- Last-selected Company (tenant auto-select) ----

const LAST_SELECTED_COMPANY_KEY = "nexus.lastSelectedCompany";

export async function getLastSelectedCompanyId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SELECTED_COMPANY_KEY);
}

export async function setLastSelectedCompanyId(companyId: string | null): Promise<void> {
  if (companyId) {
    await AsyncStorage.setItem(LAST_SELECTED_COMPANY_KEY, companyId);
  } else {
    await AsyncStorage.removeItem(LAST_SELECTED_COMPANY_KEY);
  }
}

// ---- Default Project Zoom ----

const DEFAULT_PROJECT_ZOOM_KEY = "nexus.defaultProjectZoom";

/** Get the user's preferred default zoom diameter (miles) when focusing a project.
 *  Returns null if the user has never set a default. */
export async function getDefaultProjectZoom(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_PROJECT_ZOOM_KEY);
    return raw != null ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function setDefaultProjectZoom(miles: number): Promise<void> {
  await AsyncStorage.setItem(DEFAULT_PROJECT_ZOOM_KEY, String(miles));
}

// ---- Map Layer Visibility ----

const MAP_LAYERS_KEY = "nexus.mapLayerVisibility";

/** All layers default to visible. Only disabled layers are persisted. */
export async function getMapLayerVisibility(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(MAP_LAYERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function setMapLayerVisibility(layers: Record<string, boolean>): Promise<void> {
  await AsyncStorage.setItem(MAP_LAYERS_KEY, JSON.stringify(layers));
}
