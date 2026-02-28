import * as FileSystem from "expo-file-system/legacy";
import type { ARMeasurement, ARMeasureResult } from "../../modules/nexus-ar-measure";

// ── Types ────────────────────────────────────────────────────

export interface MeasurementSession {
  sessionId: string;
  projectId: string;
  measurements: ARMeasurement[];
  usedLiDAR: boolean;
  screenshotUri: string | null;
  /** User-assigned labels for each measurement, keyed by measurement ID. */
  labels: Record<string, string>;
  createdAt: string;
  synced: boolean;
}

// ── Paths ────────────────────────────────────────────────────

const SCANNEX_DIR = `${FileSystem.documentDirectory}scannex`;

function projectDir(projectId: string): string {
  return `${SCANNEX_DIR}/${projectId}`;
}

function measurementsDir(projectId: string): string {
  return `${projectDir(projectId)}/measurements`;
}

function sessionDir(projectId: string, sessionId: string): string {
  return `${measurementsDir(projectId)}/${sessionId}`;
}

// ── Write ────────────────────────────────────────────────────

/**
 * Save a measurement session to local storage.
 * Creates the directory structure and copies the screenshot from temp to Documents.
 */
export async function saveMeasurementSession(
  projectId: string,
  result: ARMeasureResult,
  labels?: Record<string, string>,
): Promise<MeasurementSession> {
  const sessionId = `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = sessionDir(projectId, sessionId);

  // Ensure directory exists
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  // Copy screenshot from temp to Documents dir (temp gets cleaned by iOS)
  let screenshotUri: string | null = null;
  if (result.screenshotUri) {
    const destUri = `${dir}/screenshot.jpg`;
    try {
      await FileSystem.copyAsync({ from: result.screenshotUri, to: destUri });
      screenshotUri = destUri;
    } catch (err) {
      console.warn("[ScanNEX] Failed to copy screenshot:", err);
    }
  }

  const session: MeasurementSession = {
    sessionId,
    projectId,
    measurements: result.measurements ?? [],
    usedLiDAR: result.usedLiDAR ?? false,
    screenshotUri,
    labels: labels ?? {},
    createdAt: new Date().toISOString(),
    synced: false,
  };

  // Write result.json
  await FileSystem.writeAsStringAsync(`${dir}/result.json`, JSON.stringify(session, null, 2));

  return session;
}

/**
 * Update labels for measurements in an existing session.
 */
export async function updateSessionLabels(
  projectId: string,
  sessionId: string,
  labels: Record<string, string>,
): Promise<void> {
  const dir = sessionDir(projectId, sessionId);
  const resultPath = `${dir}/result.json`;

  try {
    const raw = await FileSystem.readAsStringAsync(resultPath);
    const session: MeasurementSession = JSON.parse(raw);
    session.labels = labels;
    await FileSystem.writeAsStringAsync(resultPath, JSON.stringify(session, null, 2));
  } catch (err) {
    console.warn("[ScanNEX] Failed to update labels:", err);
  }
}

/**
 * Mark a session as synced to the API.
 */
export async function markSessionSynced(
  projectId: string,
  sessionId: string,
): Promise<void> {
  const dir = sessionDir(projectId, sessionId);
  const resultPath = `${dir}/result.json`;

  try {
    const raw = await FileSystem.readAsStringAsync(resultPath);
    const session: MeasurementSession = JSON.parse(raw);
    session.synced = true;
    await FileSystem.writeAsStringAsync(resultPath, JSON.stringify(session, null, 2));
  } catch (err) {
    console.warn("[ScanNEX] Failed to mark synced:", err);
  }
}

// ── Read ─────────────────────────────────────────────────────

/**
 * Read a single measurement session from local storage.
 */
export async function readMeasurementSession(
  projectId: string,
  sessionId: string,
): Promise<MeasurementSession | null> {
  const resultPath = `${sessionDir(projectId, sessionId)}/result.json`;
  try {
    const raw = await FileSystem.readAsStringAsync(resultPath);
    return JSON.parse(raw) as MeasurementSession;
  } catch {
    return null;
  }
}

/**
 * List all measurement sessions for a project (most recent first).
 */
export async function listMeasurementSessions(
  projectId: string,
): Promise<MeasurementSession[]> {
  const dir = measurementsDir(projectId);

  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];

    const sessionIds = await FileSystem.readDirectoryAsync(dir);
    const sessions: MeasurementSession[] = [];

    for (const id of sessionIds) {
      const session = await readMeasurementSession(projectId, id);
      if (session) sessions.push(session);
    }

    // Sort newest first
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sessions;
  } catch {
    return [];
  }
}

/**
 * Delete a measurement session from local storage.
 */
export async function deleteMeasurementSession(
  projectId: string,
  sessionId: string,
): Promise<void> {
  const dir = sessionDir(projectId, sessionId);
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch (err) {
    console.warn("[ScanNEX] Failed to delete session:", err);
  }
}
