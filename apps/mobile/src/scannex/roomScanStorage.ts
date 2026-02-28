/**
 * roomScanStorage.ts
 *
 * Local persistence for ScanNEXRoomResult (room scans).
 * Stores in Documents dir at: scannex/{projectId}/rooms/{roomId}/result.json
 * Same pattern as measurement storage (storage.ts).
 */

import * as FileSystem from "expo-file-system/legacy";
import type { ScanNEXRoomResult } from "./types";

// ── Paths ────────────────────────────────────────────────────

const SCANNEX_DIR = `${FileSystem.documentDirectory}scannex`;

function projectDir(projectId: string): string {
  return `${SCANNEX_DIR}/${projectId}`;
}

function roomsDir(projectId: string): string {
  return `${projectDir(projectId)}/rooms`;
}

function roomDir(projectId: string, roomId: string): string {
  return `${roomsDir(projectId)}/${roomId}`;
}

// ── Write ────────────────────────────────────────────────────

/**
 * Save a room scan result to local storage.
 */
export async function saveRoomScan(result: ScanNEXRoomResult): Promise<void> {
  const dir = roomDir(result.projectId, result.roomId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(
    `${dir}/result.json`,
    JSON.stringify(result, null, 2),
  );
}

/**
 * Update an existing room scan (e.g. after user edits room name, marks affected areas,
 * overrides materials, or adjusts fixture counts).
 */
export async function updateRoomScan(result: ScanNEXRoomResult): Promise<void> {
  const path = `${roomDir(result.projectId, result.roomId)}/result.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(result, null, 2));
}

/**
 * Mark a room scan as synced to the API.
 */
export async function markRoomScanSynced(
  projectId: string,
  roomId: string,
): Promise<void> {
  const path = `${roomDir(projectId, roomId)}/result.json`;
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const scan: ScanNEXRoomResult = JSON.parse(raw);
    scan.synced = true;
    await FileSystem.writeAsStringAsync(path, JSON.stringify(scan, null, 2));
  } catch (err) {
    console.warn("[ScanNEX] Failed to mark room synced:", err);
  }
}

// ── Read ─────────────────────────────────────────────────────

/**
 * Read a single room scan from local storage.
 */
export async function readRoomScan(
  projectId: string,
  roomId: string,
): Promise<ScanNEXRoomResult | null> {
  const path = `${roomDir(projectId, roomId)}/result.json`;
  try {
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as ScanNEXRoomResult;
  } catch {
    return null;
  }
}

/**
 * List all room scans for a project (most recent first).
 */
export async function listRoomScans(
  projectId: string,
): Promise<ScanNEXRoomResult[]> {
  const dir = roomsDir(projectId);
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];

    const ids = await FileSystem.readDirectoryAsync(dir);
    const scans: ScanNEXRoomResult[] = [];

    for (const id of ids) {
      const scan = await readRoomScan(projectId, id);
      if (scan) scans.push(scan);
    }

    scans.sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
    );
    return scans;
  } catch {
    return [];
  }
}

/**
 * List unsynced room scans (for background sync).
 */
export async function listUnsyncedRoomScans(
  projectId: string,
): Promise<ScanNEXRoomResult[]> {
  const all = await listRoomScans(projectId);
  return all.filter((s) => !s.synced);
}

// ── Delete ───────────────────────────────────────────────────

/**
 * Delete a room scan from local storage.
 */
export async function deleteRoomScan(
  projectId: string,
  roomId: string,
): Promise<void> {
  const dir = roomDir(projectId, roomId);
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch (err) {
    console.warn("[ScanNEX] Failed to delete room scan:", err);
  }
}
