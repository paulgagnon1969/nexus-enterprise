import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("nexus_mobile.db");
  return db;
}

export async function initDb(): Promise<void> {
  const d = await getDb();

  // Cache table: arbitrary JSON blobs keyed by a string.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  // Simple KV table for cursors/state.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);

  // Outbox table for offline mutations.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      status TEXT NOT NULL,
      lastError TEXT
    );
  `);

  await d.execAsync(`CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox(status);`);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS outbox_createdAt_idx ON outbox(createdAt);`);

  // Usage tracking for smart-browse / frequent projects.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL,
      action TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
  `);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS usage_project_idx ON usage_events(projectId);`);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS usage_ts_idx ON usage_events(ts);`);
}
