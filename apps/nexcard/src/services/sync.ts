import { apiJson } from "../api/client";
import {
  getAllAccounts,
  upsertTransactions,
  upsertSyncState,
  upsertAccount,
} from "../db/database";
import type { Transaction } from "../types/models";

// ── Types (NCC API response shapes) ─────────────────────────

interface NccTransaction {
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

interface NccTransactionPage {
  transactions: NccTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface NccSyncResult {
  connectionId: string;
  added: number;
  modified: number;
  removed: number;
}

// ── Sync Functions ──────────────────────────────────────────

/**
 * Sync a single account: triggers server-side Plaid sync, then
 * fetches all transactions and upserts into local SQLite.
 */
export async function syncAccount(accountId: string): Promise<{ added: number; total: number }> {
  // 1. Trigger server-side sync for this connection
  const results = await apiJson<NccSyncResult[]>("/banking/sync", { method: "POST" });
  const result = results.find((r) => r.connectionId === accountId);

  // 2. Pull all transactions for this account from NCC API
  let page = 1;
  let totalFetched = 0;
  const pageSize = 100;

  while (true) {
    const txPage = await apiJson<NccTransactionPage>(
      `/banking/transactions?connectionId=${accountId}&page=${page}&pageSize=${pageSize}`,
    );

    if (txPage.transactions.length === 0) break;

    // Map NCC transactions to local format
    const localTxs: Transaction[] = txPage.transactions.map((tx) => ({
      id: tx.id,
      accountId,
      date: tx.date,
      description: tx.name,
      merchant: tx.merchantName,
      amount: tx.amount * -1, // Plaid: positive = outflow; NexCard: negative = outflow
      currency: tx.isoCurrencyCode || "USD",
      category: tx.primaryCategory?.replace(/_/g, " ") ?? null,
      pending: tx.pending,
      sourceId: tx.id,
      createdAt: new Date().toISOString(),
    }));

    await upsertTransactions(localTxs);
    totalFetched += localTxs.length;

    if (page >= txPage.totalPages) break;
    page++;
  }

  // 3. Update sync state
  await upsertSyncState({
    accountId,
    cursor: null, // Server manages Plaid cursors
    lastSyncAt: new Date().toISOString(),
  });

  // 4. Update account's lastSyncedAt
  const accounts = await getAllAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    await upsertAccount({ ...account, lastSyncedAt: new Date().toISOString() });
  }

  return { added: result?.added ?? 0, total: totalFetched };
}

/**
 * Sync all Plaid accounts. Returns summary of sync results.
 */
export async function syncAllAccounts(): Promise<{
  synced: number;
  totalTransactions: number;
  errors: string[];
}> {
  const accounts = await getAllAccounts();
  const plaidAccounts = accounts.filter((a) => a.source === "plaid");

  let totalTransactions = 0;
  const errors: string[] = [];

  // Trigger server-side sync once for all connections
  try {
    await apiJson<NccSyncResult[]>("/banking/sync", { method: "POST" });
  } catch (err: any) {
    errors.push(`Server sync failed: ${err.message}`);
    return { synced: 0, totalTransactions: 0, errors };
  }

  // Pull transactions for each account
  for (const account of plaidAccounts) {
    try {
      const result = await syncAccount(account.id);
      totalTransactions += result.total;
    } catch (err: any) {
      errors.push(`${account.institutionName}: ${err.message}`);
    }
  }

  return { synced: plaidAccounts.length - errors.length, totalTransactions, errors };
}
