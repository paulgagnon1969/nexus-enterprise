import { getDb } from "./db";

export type OutboxStatus = "PENDING" | "PROCESSING" | "DONE" | "ERROR";

export interface OutboxRow {
  id: string;
  type: string;
  payload: string;
  createdAt: number;
  status: OutboxStatus;
  lastError: string | null;
}

function makeId(): string {
  // Good enough for client-side uniqueness.
  return `ob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOutbox(type: string, payload: unknown): Promise<string> {
  const db = await getDb();
  const id = makeId();
  await db.runAsync(
    "INSERT INTO outbox (id, type, payload, createdAt, status, lastError) VALUES (?, ?, ?, ?, ?, ?)",
    [id, type, JSON.stringify(payload), Date.now(), "PENDING", null],
  );
  return id;
}

export async function getPendingOutbox(limit = 50): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT id, type, payload, createdAt, status, lastError FROM outbox WHERE status IN ('PENDING','ERROR') ORDER BY createdAt ASC LIMIT ?",
    [limit],
  );
  return rows || [];
}

export async function countPendingOutbox(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(1) as c FROM outbox WHERE status IN ('PENDING','ERROR')",
  );
  return Number(row?.c ?? 0);
}

export async function markOutboxProcessing(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status='PROCESSING', lastError=NULL WHERE id=?", [id]);
}

export async function markOutboxDone(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status='DONE', lastError=NULL WHERE id=?", [id]);
}

export async function markOutboxError(id: string, err: unknown): Promise<void> {
  const db = await getDb();
  const msg = err instanceof Error ? err.message : String(err);
  await db.runAsync("UPDATE outbox SET status='ERROR', lastError=? WHERE id=?", [msg, id]);
}

export async function listOutboxRecent(limit = 100): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT id, type, payload, createdAt, status, lastError FROM outbox ORDER BY createdAt DESC LIMIT ?",
    [limit],
  );
  return rows || [];
}

/**
 * Recover items stuck in PROCESSING status (e.g., app was killed mid-sync).
 * Call this on app startup before running sync.
 */
export async function recoverStuckProcessing(): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "UPDATE outbox SET status='PENDING', lastError='Recovered from stuck PROCESSING state' WHERE status='PROCESSING'",
  );
  return result.changes ?? 0;
}
