import { apiJson, apiFetch } from "./client";

// ── Types ──────────────────────────────────────────────────

export interface BankConnection {
  id: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string | null;
  accountSubtype: string | null;
  status: "ACTIVE" | "REQUIRES_REAUTH" | "DISCONNECTED";
  lastSyncedAt: string | null;
  createdAt: string;
  _count: { transactions: number };
}

export interface BankTransaction {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  isoCurrencyCode: string;
  primaryCategory: string | null;
  detailedCategory: string | null;
  pending: boolean;
}

export interface TransactionPage {
  transactions: BankTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TransactionSummary {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  transactionCount: number;
  byCategory: Record<string, { inflow: number; outflow: number; count: number }>;
}

export interface PlaidLinkSuccessMetadata {
  publicToken: string;
  account: {
    id: string;
    name?: string;
    mask?: string;
    type?: string;
    subtype?: string;
  };
  institution?: {
    institution_id?: string;
    name?: string;
  };
}

// ── API calls ──────────────────────────────────────────────

/** Create a Plaid Link token for the Transactions product. */
export async function createLinkToken(): Promise<{ linkToken: string }> {
  return apiJson("/banking/link-token", { method: "POST" });
}

/** Exchange Plaid public token and connect the account. */
export async function exchangeAndConnect(meta: PlaidLinkSuccessMetadata): Promise<BankConnection> {
  return apiJson("/banking/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicToken: meta.publicToken,
      account: meta.account,
      institution: meta.institution,
    }),
  });
}

/** Sync all active connections. */
export async function syncAllConnections(): Promise<
  Array<{ connectionId: string; added: number; modified: number; removed: number }>
> {
  return apiJson("/banking/sync", { method: "POST" });
}

/** Get all bank connections. */
export async function getConnections(): Promise<BankConnection[]> {
  return apiJson("/banking/connections");
}

/** Disconnect a bank connection. */
export async function disconnectBank(connectionId: string): Promise<{ ok: boolean }> {
  return apiJson(`/banking/connections/${connectionId}`, { method: "DELETE" });
}

/** Get paginated transactions with optional filters. */
export async function getTransactions(params?: {
  startDate?: string;
  endDate?: string;
  search?: string;
  category?: string;
  connectionId?: string;
  page?: number;
  pageSize?: number;
}): Promise<TransactionPage> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set("startDate", params.startDate);
  if (params?.endDate) qs.set("endDate", params.endDate);
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (params?.connectionId) qs.set("connectionId", params.connectionId);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return apiJson(`/banking/transactions${query ? `?${query}` : ""}`);
}

/** Get transaction summary (inflow/outflow/net). */
export async function getTransactionSummary(
  startDate?: string,
  endDate?: string,
): Promise<TransactionSummary> {
  const qs = new URLSearchParams();
  if (startDate) qs.set("startDate", startDate);
  if (endDate) qs.set("endDate", endDate);
  const query = qs.toString();
  return apiJson(`/banking/transactions/summary${query ? `?${query}` : ""}`);
}
