/** Data source for an account — FinanceKit (Apple) or Plaid (all banks) */
export type AccountSource = "financekit" | "plaid";

/** Account type from financial institution */
export type AccountType = "credit" | "checking" | "savings" | "investment" | "loan" | "other";

/** Export target type */
export type ExportTargetType = "ncc" | "quickbooks" | "xero" | "csv" | "ofx" | "sheets";

/** Sync status for background operations */
export type SyncStatus = "idle" | "syncing" | "error" | "success";

// ── Core Models ──

export interface Account {
  id: string;
  source: AccountSource;
  /** Plaid item_id or FinanceKit account identifier */
  sourceId: string;
  institutionName: string;
  accountName: string;
  /** Last 4 digits */
  mask: string | null;
  type: AccountType;
  currentBalance: number | null;
  currency: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  currency: string;
  category: string | null;
  pending: boolean;
  /** Original ID from source (Plaid transaction_id or FinanceKit id) */
  sourceId: string;
  createdAt: string;
}

export interface SyncState {
  accountId: string;
  /** Plaid cursor or FinanceKit anchor */
  cursor: string | null;
  lastSyncAt: string | null;
}

export interface ExportTarget {
  id: string;
  type: ExportTargetType;
  label: string;
  /** JSON blob for target-specific config (OAuth tokens, file paths, etc.) */
  configJson: string;
  enabled: boolean;
  lastExportAt: string | null;
  createdAt: string;
}

// ── UI / Dashboard Types ──

export interface SpendingByCategory {
  category: string;
  total: number;
  count: number;
}

export interface MonthlySpending {
  month: string; // YYYY-MM
  total: number;
}

export interface MerchantSummary {
  merchant: string;
  total: number;
  count: number;
}
