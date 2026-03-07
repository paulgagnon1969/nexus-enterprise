import { apiJson } from "./client";

// ─── Types ─────────────────────────────────────────────────────

export interface PlanningRoomListItem {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  floorPlanUrl: string | null;
  status: "ACTIVE" | "ARCHIVED";
  sourceType: "MANUAL" | "ROOM_SCAN" | "PLAN_SHEET" | "PHOTO";
  sourceId: string | null;
  pipelineStatus: PipelineStatus | null;
  aiReview: AiReview | null;
  extractedDimensions: Record<string, any> | null;
  createdAt: string;
  _count: { selections: number; messages: number };
  selections: Array<{
    id: string;
    status: string;
    vendorProduct: { price: number | null } | null;
  }>;
}

export interface PipelineStatus {
  capture: { status: string; deviceOrigin: string | null; capturedAt: string | null };
  dimensionExtraction: { status: string };
  layoutProposal: { status: string; deviceOrigin: string | null };
  aiReview: { status: string; score: number | null };
  sheetGeneration: { status: string };
}

export interface AiReview {
  score: number;
  grade: string;
  checks: Array<{ name: string; status: "pass" | "warn" | "fail"; details: string | null }>;
  reviewedAt: string;
}

export interface SelectionItem {
  id: string;
  roomId: string;
  position: number;
  quantity: number;
  status: "PROPOSED" | "APPROVED" | "ORDERED" | "DELIVERED" | "INSTALLED" | "REJECTED";
  notes: string | null;
  vendorProduct: VendorProductItem | null;
  room?: { id: string; name: string };
}

export interface VendorCatalogItem {
  id: string;
  vendorName: string;
  productLine: string;
  vendorUrl: string | null;
  logoUrl: string | null;
  _count: { products: number };
}

export interface VendorProductItem {
  id: string;
  catalogId: string;
  sku: string;
  name: string;
  category: string;
  width: number | null;
  height: number | null;
  depth: number | null;
  imageUrl: string | null;
  price: number | null;
  priceDiscounted: number | null;
  metadata: Record<string, any> | null;
}

export interface SelectionSheetItem {
  id: string;
  roomId: string;
  version: number;
  documentId: string | null;
  generatedAt: string;
  room: { id: string; name: string };
}

// ─── Planning Rooms ────────────────────────────────────────────

export async function listPlanningRooms(
  projectId: string,
): Promise<PlanningRoomListItem[]> {
  return apiJson<PlanningRoomListItem[]>(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms`,
  );
}

export async function createPlanningRoom(
  projectId: string,
  data: {
    name: string;
    description?: string;
    floorPlanUrl?: string;
    sourceType?: "MANUAL" | "ROOM_SCAN" | "PLAN_SHEET" | "PHOTO";
    sourceId?: string;
    extractedDimensions?: Record<string, any>;
    deviceOrigin?: "MOBILE";
  },
): Promise<PlanningRoomListItem> {
  return apiJson<PlanningRoomListItem>(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
}

// ─── Selections ────────────────────────────────────────────────

export async function getRoomSelections(
  projectId: string,
  roomId: string,
): Promise<SelectionItem[]> {
  // Room detail includes selections — extract from room endpoint
  const room = await apiJson<any>(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}`,
  );
  return room.selections ?? [];
}

export async function createSelection(
  projectId: string,
  roomId: string,
  data: {
    vendorProductId?: string;
    position: number;
    quantity?: number;
    notes?: string;
  },
): Promise<SelectionItem> {
  return apiJson<SelectionItem>(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}/selections`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
}

export async function updateSelectionStatus(
  projectId: string,
  selectionId: string,
  status: SelectionItem["status"],
): Promise<SelectionItem> {
  return apiJson<SelectionItem>(
    `/projects/${encodeURIComponent(projectId)}/selections/${encodeURIComponent(selectionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
}

// ─── Selection Sheets ──────────────────────────────────────────

export async function generateSheet(
  projectId: string,
  roomId: string,
): Promise<any> {
  return apiJson(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}/generate-sheet`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

export async function listSelectionSheets(
  projectId: string,
): Promise<SelectionSheetItem[]> {
  return apiJson<SelectionSheetItem[]>(
    `/projects/${encodeURIComponent(projectId)}/selection-sheets`,
  );
}

// ─── Vendor Catalog ────────────────────────────────────────────

export async function listVendorCatalogs(): Promise<VendorCatalogItem[]> {
  return apiJson<VendorCatalogItem[]>("/vendor-catalogs");
}

export async function listProducts(
  catalogId: string,
  category?: string,
  search?: string,
): Promise<VendorProductItem[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const qs = params.toString();
  return apiJson<VendorProductItem[]>(
    `/vendor-catalogs/${encodeURIComponent(catalogId)}/products${qs ? `?${qs}` : ""}`,
  );
}
