import { getDb } from "./db";

export async function getKv(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM kv WHERE key = ?",
    [key],
  );
  return typeof row?.value === "string" ? row.value : null;
}

export async function setKv(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO kv (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value],
  );
}
