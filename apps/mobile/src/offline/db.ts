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

  // Media upload progress tracking.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS media_uploads (
      id TEXT PRIMARY KEY NOT NULL,
      outboxId TEXT NOT NULL,
      fileUri TEXT NOT NULL,
      fileName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      mediaType TEXT NOT NULL DEFAULT 'image',
      bytesTotal INTEGER NOT NULL DEFAULT 0,
      bytesUploaded INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      networkTier TEXT NOT NULL DEFAULT 'cellular',
      wifiOnly INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
  `);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS media_uploads_status_idx ON media_uploads(status);`);

  // Tab usage tracking for smart default tab.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS tab_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabKey TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
  `);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS tab_events_ts_idx ON tab_events(ts);`);

  // Receipt capture: local receipts accumulated before consolidation into a Daily Log.
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY NOT NULL,
      projectId TEXT NOT NULL,
      imageUri TEXT NOT NULL,
      imageName TEXT NOT NULL,
      vendor TEXT,
      amount REAL,
      subtotal REAL,
      taxAmount REAL,
      receiptDate TEXT,
      currency TEXT DEFAULT 'USD',
      paymentMethod TEXT,
      lineItemsJson TEXT,
      ocrConfidence REAL,
      ocrRaw TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      dailyLogId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS receipts_project_idx ON receipts(projectId);`);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS receipts_status_idx ON receipts(status);`);
  await d.execAsync(`CREATE INDEX IF NOT EXISTS receipts_date_idx ON receipts(createdAt);`);
}
