import { apiJson } from "./client";

export interface LocalSupplier {
  id: string;
  companyId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  category: string | null;
  source: string | null;
  placeId: string | null;
  status: "ACTIVE" | "PENDING_REMOVAL" | "PERMANENTLY_CLOSED";
  flaggedByUserId: string | null;
  flaggedAt: string | null;
  flagReason: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  flaggedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  reviewedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Fetch all local suppliers for the user's company, optionally filtered by status. */
export async function fetchLocalSuppliers(
  status?: LocalSupplier["status"],
): Promise<LocalSupplier[]> {
  const query = status ? `?status=${status}` : "";
  return apiJson<LocalSupplier[]>(`/local-suppliers${query}`);
}

/** Flag a supplier as no longer in business. */
export async function flagSupplierClosed(
  supplierId: string,
  reason: string,
): Promise<LocalSupplier> {
  return apiJson<LocalSupplier>(
    `/local-suppliers/${encodeURIComponent(supplierId)}/flag`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
}

/** Approve supplier removal (PM+ only). */
export async function approveSupplierRemoval(
  supplierId: string,
  note?: string,
): Promise<LocalSupplier> {
  return apiJson<LocalSupplier>(
    `/local-suppliers/${encodeURIComponent(supplierId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    },
  );
}

/** Deny supplier removal (PM+ only). */
export async function denySupplierRemoval(
  supplierId: string,
  note?: string,
): Promise<LocalSupplier> {
  return apiJson<LocalSupplier>(
    `/local-suppliers/${encodeURIComponent(supplierId)}/deny`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    },
  );
}
