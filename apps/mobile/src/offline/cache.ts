import { getDb } from "./db";

export async function setCache(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  const json = JSON.stringify(value);
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO cache (key, json, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt;`,
    [key, json, now],
  );
}

export async function getCache<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(
    "SELECT json FROM cache WHERE key = ?",
    [key],
  );
  if (!row?.json) return null;
  try {
    return JSON.parse(row.json) as T;
  } catch {
    return null;
  }
}

export async function deleteCache(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM cache WHERE key = ?", [key]);
}
