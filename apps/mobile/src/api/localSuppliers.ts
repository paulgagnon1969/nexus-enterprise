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

// ─── NexFIND API ────────────────────────────────────────────────────────────

export interface NearbySupplier {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  category: string | null;
  source: string | null;
  distanceMiles: number;
  status: "ACTIVE" | "PENDING_REMOVAL" | "PERMANENTLY_CLOSED";
}

export interface DiscoverResult {
  newCount: number;
  existingCount: number;
  totalSuppliers: number;
}

/** Record that the user navigated to a supplier (NexFIND capture). */
export async function navigateToSupplier(
  supplierId: string,
  projectId?: string,
): Promise<{ ok: boolean; supplier: LocalSupplier | null }> {
  return apiJson(`/nexfind/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ supplierId, projectId }),
  });
}

/** Search for nearby suppliers matching a product query. */
export async function searchNearbyProducts(
  query: string,
  lat: number,
  lng: number,
  radiusMiles?: number,
): Promise<NearbySupplier[]> {
  const params = new URLSearchParams({
    q: query,
    lat: String(lat),
    lng: String(lng),
  });
  if (radiusMiles) params.set("radiusMiles", String(radiusMiles));
  return apiJson<NearbySupplier[]>(`/nexfind/search?${params}`);
}

/** Manually trigger supplier discovery near a location. */
export async function discoverSuppliers(
  lat: number,
  lng: number,
  radiusMeters?: number,
): Promise<DiscoverResult> {
  return apiJson<DiscoverResult>(`/nexfind/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, radiusMeters }),
  });
}
