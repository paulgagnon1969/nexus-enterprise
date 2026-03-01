/**
 * receiptStore.ts
 *
 * Local SQLite storage for captured receipts.
 * Receipts accumulate throughout the day, then get consolidated
 * into a single "Receipt Daily Log" when the user is ready.
 *
 * Flow: capture photo → OCR → insert pending → user reviews/approves → consolidate → DL
 */

import { getDb } from "../offline/db";

// ── Types ────────────────────────────────────────────────────

export type ReceiptStatus = "pending" | "approved" | "rejected";

export interface ReceiptLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

export interface LocalReceipt {
  id: string;
  projectId: string;
  imageUri: string;
  imageName: string;
  vendor: string | null;
  amount: number | null;
  subtotal: number | null;
  taxAmount: number | null;
  receiptDate: string | null;
  currency: string;
  paymentMethod: string | null;
  lineItems: ReceiptLineItem[];
  ocrConfidence: number | null;
  ocrRaw: string | null;
  notes: string | null;
  status: ReceiptStatus;
  dailyLogId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConsolidatedSummary {
  receiptCount: number;
  totalAmount: number;
  totalTax: number;
  totalSubtotal: number;
  vendors: string[];
  receipts: LocalReceipt[];
}

// ── Helpers ──────────────────────────────────────────────────

function makeId(): string {
  return `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToReceipt(row: any): LocalReceipt {
  return {
    id: row.id,
    projectId: row.projectId,
    imageUri: row.imageUri,
    imageName: row.imageName,
    vendor: row.vendor ?? null,
    amount: row.amount ?? null,
    subtotal: row.subtotal ?? null,
    taxAmount: row.taxAmount ?? null,
    receiptDate: row.receiptDate ?? null,
    currency: row.currency ?? "USD",
    paymentMethod: row.paymentMethod ?? null,
    lineItems: row.lineItemsJson ? JSON.parse(row.lineItemsJson) : [],
    ocrConfidence: row.ocrConfidence ?? null,
    ocrRaw: row.ocrRaw ?? null,
    notes: row.notes ?? null,
    status: row.status ?? "pending",
    dailyLogId: row.dailyLogId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Insert ───────────────────────────────────────────────────

export interface InsertReceiptParams {
  projectId: string;
  imageUri: string;
  imageName: string;
  vendor?: string | null;
  amount?: number | null;
  subtotal?: number | null;
  taxAmount?: number | null;
  receiptDate?: string | null;
  currency?: string;
  paymentMethod?: string | null;
  lineItems?: ReceiptLineItem[];
  ocrConfidence?: number | null;
  ocrRaw?: string | null;
  notes?: string | null;
}

export async function insertReceipt(params: InsertReceiptParams): Promise<LocalReceipt> {
  const db = await getDb();
  const id = makeId();
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO receipts (id, projectId, imageUri, imageName, vendor, amount, subtotal, taxAmount,
     receiptDate, currency, paymentMethod, lineItemsJson, ocrConfidence, ocrRaw, notes, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id,
    params.projectId,
    params.imageUri,
    params.imageName,
    params.vendor ?? null,
    params.amount ?? null,
    params.subtotal ?? null,
    params.taxAmount ?? null,
    params.receiptDate ?? null,
    params.currency ?? "USD",
    params.paymentMethod ?? null,
    params.lineItems ? JSON.stringify(params.lineItems) : null,
    params.ocrConfidence ?? null,
    params.ocrRaw ?? null,
    params.notes ?? null,
    now,
    now,
  );

  return getReceiptById(id) as Promise<LocalReceipt>;
}

// ── Read ─────────────────────────────────────────────────────

export async function getReceiptById(id: string): Promise<LocalReceipt | null> {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT * FROM receipts WHERE id = ?", id);
  return row ? rowToReceipt(row) : null;
}

export async function listReceipts(projectId: string, status?: ReceiptStatus): Promise<LocalReceipt[]> {
  const db = await getDb();
  if (status) {
    const rows = await db.getAllAsync(
      "SELECT * FROM receipts WHERE projectId = ? AND status = ? ORDER BY createdAt DESC",
      projectId,
      status,
    );
    return rows.map(rowToReceipt);
  }
  const rows = await db.getAllAsync(
    "SELECT * FROM receipts WHERE projectId = ? ORDER BY createdAt DESC",
    projectId,
  );
  return rows.map(rowToReceipt);
}

export async function listPendingReceipts(projectId: string): Promise<LocalReceipt[]> {
  return listReceipts(projectId, "pending");
}

export async function listApprovedReceipts(projectId: string): Promise<LocalReceipt[]> {
  return listReceipts(projectId, "approved");
}

/**
 * List all approved receipts for a project that haven't been assigned to a Daily Log yet.
 */
export async function listUnsubmittedReceipts(projectId: string): Promise<LocalReceipt[]> {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT * FROM receipts WHERE projectId = ? AND status = 'approved' AND dailyLogId IS NULL ORDER BY createdAt DESC",
    projectId,
  );
  return rows.map(rowToReceipt);
}

// ── Update ───────────────────────────────────────────────────

export async function updateReceipt(
  id: string,
  updates: Partial<Pick<LocalReceipt, "vendor" | "amount" | "subtotal" | "taxAmount" | "receiptDate" | "paymentMethod" | "notes" | "lineItems">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (updates.vendor !== undefined) { sets.push("vendor = ?"); values.push(updates.vendor); }
  if (updates.amount !== undefined) { sets.push("amount = ?"); values.push(updates.amount); }
  if (updates.subtotal !== undefined) { sets.push("subtotal = ?"); values.push(updates.subtotal); }
  if (updates.taxAmount !== undefined) { sets.push("taxAmount = ?"); values.push(updates.taxAmount); }
  if (updates.receiptDate !== undefined) { sets.push("receiptDate = ?"); values.push(updates.receiptDate); }
  if (updates.paymentMethod !== undefined) { sets.push("paymentMethod = ?"); values.push(updates.paymentMethod); }
  if (updates.notes !== undefined) { sets.push("notes = ?"); values.push(updates.notes); }
  if (updates.lineItems !== undefined) { sets.push("lineItemsJson = ?"); values.push(JSON.stringify(updates.lineItems)); }

  if (sets.length === 0) return;

  sets.push("updatedAt = ?");
  values.push(Date.now());
  values.push(id);

  await db.runAsync(`UPDATE receipts SET ${sets.join(", ")} WHERE id = ?`, ...values);
}

export async function approveReceipt(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE receipts SET status = 'approved', updatedAt = ? WHERE id = ?", Date.now(), id);
}

export async function rejectReceipt(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE receipts SET status = 'rejected', updatedAt = ? WHERE id = ?", Date.now(), id);
}

export async function resetReceipt(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE receipts SET status = 'pending', updatedAt = ? WHERE id = ?", Date.now(), id);
}

/**
 * Mark receipts as consolidated into a Daily Log.
 */
export async function markReceiptsConsolidated(receiptIds: string[], dailyLogId: string): Promise<void> {
  const db = await getDb();
  const placeholders = receiptIds.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE receipts SET dailyLogId = ?, updatedAt = ? WHERE id IN (${placeholders})`,
    dailyLogId,
    Date.now(),
    ...receiptIds,
  );
}

// ── Delete ───────────────────────────────────────────────────

export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM receipts WHERE id = ?", id);
}

// ── Consolidation ────────────────────────────────────────────

/**
 * Get a consolidated summary of all approved, unsubmitted receipts for a project.
 * This is what gets turned into a Daily Log.
 */
export async function getConsolidatedSummary(projectId: string): Promise<ConsolidatedSummary> {
  const receipts = await listUnsubmittedReceipts(projectId);

  const totalAmount = receipts.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const totalTax = receipts.reduce((sum, r) => sum + (r.taxAmount ?? 0), 0);
  const totalSubtotal = receipts.reduce((sum, r) => sum + (r.subtotal ?? 0), 0);
  const vendors = [...new Set(receipts.map((r) => r.vendor).filter(Boolean))] as string[];

  return {
    receiptCount: receipts.length,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalSubtotal: Math.round(totalSubtotal * 100) / 100,
    vendors,
    receipts,
  };
}
