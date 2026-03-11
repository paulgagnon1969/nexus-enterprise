import * as SQLite from "expo-sqlite";
import type {
  Account,
  Transaction,
  SyncState,
  ExportTarget,
  SpendingByCategory,
  MonthlySpending,
  MerchantSummary,
} from "../types/models";

let db: SQLite.SQLiteDatabase | null = null;

/** Open (or create) the NexCard database and run migrations */
export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync("nexcard.db");

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK(source IN ('financekit', 'plaid')),
      source_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      mask TEXT,
      type TEXT NOT NULL DEFAULT 'other',
      current_balance REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      merchant TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      category TEXT,
      pending INTEGER NOT NULL DEFAULT 0,
      source_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_source_id ON transactions(source_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      cursor TEXT,
      last_sync_at TEXT
    );

    CREATE TABLE IF NOT EXISTS export_targets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_export_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

// ── Accounts ──

export async function getAllAccounts(): Promise<Account[]> {
  const rows = await getDb().getAllAsync<any>("SELECT * FROM accounts ORDER BY institution_name, account_name");
  return rows.map(mapAccount);
}

export async function getAccount(id: string): Promise<Account | null> {
  const row = await getDb().getFirstAsync<any>("SELECT * FROM accounts WHERE id = ?", [id]);
  return row ? mapAccount(row) : null;
}

export async function upsertAccount(account: Account): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO accounts (id, source, source_id, institution_name, account_name, mask, type, current_balance, currency, last_synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       institution_name = excluded.institution_name,
       account_name = excluded.account_name,
       mask = excluded.mask,
       type = excluded.type,
       current_balance = excluded.current_balance,
       last_synced_at = excluded.last_synced_at`,
    [
      account.id, account.source, account.sourceId, account.institutionName,
      account.accountName, account.mask, account.type, account.currentBalance,
      account.currency, account.lastSyncedAt, account.createdAt,
    ],
  );
}

export async function deleteAccount(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM accounts WHERE id = ?", [id]);
}

// ── Transactions ──

export async function getTransactions(opts?: {
  accountId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Transaction[]> {
  const clauses: string[] = [];
  const params: any[] = [];

  if (opts?.accountId) {
    clauses.push("account_id = ?");
    params.push(opts.accountId);
  }
  if (opts?.search) {
    clauses.push("(description LIKE ? OR merchant LIKE ? OR category LIKE ?)");
    const term = `%${opts.search}%`;
    params.push(term, term, term);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const rows = await getDb().getAllAsync<any>(
    `SELECT * FROM transactions ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.map(mapTransaction);
}

export async function upsertTransaction(tx: Transaction): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO transactions (id, account_id, date, description, merchant, amount, currency, category, pending, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       description = excluded.description,
       merchant = excluded.merchant,
       amount = excluded.amount,
       category = excluded.category,
       pending = excluded.pending`,
    [
      tx.id, tx.accountId, tx.date, tx.description, tx.merchant,
      tx.amount, tx.currency, tx.category, tx.pending ? 1 : 0,
      tx.sourceId, tx.createdAt,
    ],
  );
}

export async function upsertTransactions(txs: Transaction[]): Promise<void> {
  const d = getDb();
  for (const tx of txs) {
    await upsertTransaction(tx);
  }
}

export async function deleteTransactionsByAccount(accountId: string): Promise<void> {
  await getDb().runAsync("DELETE FROM transactions WHERE account_id = ?", [accountId]);
}

// ── Sync State ──

export async function getSyncState(accountId: string): Promise<SyncState | null> {
  const row = await getDb().getFirstAsync<any>(
    "SELECT * FROM sync_state WHERE account_id = ?",
    [accountId],
  );
  return row ? { accountId: row.account_id, cursor: row.cursor, lastSyncAt: row.last_sync_at } : null;
}

export async function upsertSyncState(state: SyncState): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO sync_state (account_id, cursor, last_sync_at) VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET cursor = excluded.cursor, last_sync_at = excluded.last_sync_at`,
    [state.accountId, state.cursor, state.lastSyncAt],
  );
}

// ── Export Targets ──

export async function getAllExportTargets(): Promise<ExportTarget[]> {
  const rows = await getDb().getAllAsync<any>("SELECT * FROM export_targets ORDER BY label");
  return rows.map(mapExportTarget);
}

export async function upsertExportTarget(target: ExportTarget): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO export_targets (id, type, label, config_json, enabled, last_export_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       config_json = excluded.config_json,
       enabled = excluded.enabled,
       last_export_at = excluded.last_export_at`,
    [target.id, target.type, target.label, target.configJson, target.enabled ? 1 : 0, target.lastExportAt, target.createdAt],
  );
}

export async function deleteExportTarget(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM export_targets WHERE id = ?", [id]);
}

// ── Analytics ──

export async function getSpendingByCategory(daysBack: number = 30): Promise<SpendingByCategory[]> {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
  return getDb().getAllAsync<SpendingByCategory>(
    `SELECT COALESCE(category, 'Uncategorized') as category, SUM(ABS(amount)) as total, COUNT(*) as count
     FROM transactions WHERE date >= ? AND amount < 0
     GROUP BY category ORDER BY total DESC`,
    [cutoff],
  );
}

export async function getMonthlySpending(monthsBack: number = 6): Promise<MonthlySpending[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = cutoff.toISOString().slice(0, 7); // YYYY-MM
  return getDb().getAllAsync<MonthlySpending>(
    `SELECT SUBSTR(date, 1, 7) as month, SUM(ABS(amount)) as total
     FROM transactions WHERE SUBSTR(date, 1, 7) >= ? AND amount < 0
     GROUP BY month ORDER BY month`,
    [cutoffStr],
  );
}

export async function getTopMerchants(limit: number = 10, daysBack: number = 30): Promise<MerchantSummary[]> {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
  return getDb().getAllAsync<MerchantSummary>(
    `SELECT COALESCE(merchant, description) as merchant, SUM(ABS(amount)) as total, COUNT(*) as count
     FROM transactions WHERE date >= ? AND amount < 0 AND merchant IS NOT NULL
     GROUP BY merchant ORDER BY total DESC LIMIT ?`,
    [cutoff, limit],
  );
}

// ── Row Mappers ──

function mapAccount(row: any): Account {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    institutionName: row.institution_name,
    accountName: row.account_name,
    mask: row.mask,
    type: row.type,
    currentBalance: row.current_balance,
    currency: row.currency,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
  };
}

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    description: row.description,
    merchant: row.merchant,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    pending: !!row.pending,
    sourceId: row.source_id,
    createdAt: row.created_at,
  };
}

function mapExportTarget(row: any): ExportTarget {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    configJson: row.config_json,
    enabled: !!row.enabled,
    lastExportAt: row.last_export_at,
    createdAt: row.created_at,
  };
}
