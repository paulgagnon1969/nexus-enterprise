import { fetch } from "@tauri-apps/plugin-http";
import { loadAuth, saveAuth, clearAuth, setCachedCredentials, clearCachedCredentials } from "./auth";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let baseUrl = "";
let accessToken = "";
let appVersion = "1.0.0"; // Updated on init from Tauri
let deviceId = ""; // Set after device fingerprint is computed
let licenseStatus = "ACTIVE"; // Updated from X-License-Status response header
let graceEndsAt: string | null = null;

export function setAppVersion(v: string) { appVersion = v; }
export function setDeviceId(id: string) { deviceId = id; }
export function getLicenseStatus() { return licenseStatus; }
export function getGraceEndsAt() { return graceEndsAt; }

export function setApiConfig(url: string, token: string) {
  baseUrl = url.replace(/\/$/, "");
  accessToken = token;
  setCachedCredentials(token, baseUrl);
}

export function getAccessToken() {
  return accessToken;
}

// ---------------------------------------------------------------------------
// Core request helper (Tauri HTTP + automatic token refresh)
// ---------------------------------------------------------------------------
async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || text.trim() === "") return null as unknown as T;
  return JSON.parse(text) as T;
}

function platformHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "X-App-Platform": "nexbridge",
    "X-App-Version": appVersion,
  };
  if (deviceId) h["X-Device-Id"] = deviceId;
  return h;
}

function readLicenseHeaders(res: Response) {
  const status = res.headers.get("x-license-status");
  if (status) licenseStatus = status;
  const grace = res.headers.get("x-grace-ends-at");
  if (grace) graceEndsAt = grace;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  console.log(`[api] ${options.method || "GET"} ${baseUrl}${path}`);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...platformHeaders(),
        ...(options.headers as Record<string, string>),
      },
    });
  } catch (fetchErr) {
    console.error(`[api] fetch() threw:`, fetchErr);
    throw fetchErr;
  }

  readLicenseHeaders(res);

  // 426 Upgrade Required
  if (res.status === 426) {
    const body = await parseJson<any>(res);
    throw Object.assign(new Error(body?.message || "Update required"), {
      code: "UPDATE_REQUIRED",
      minVersion: body?.minVersion,
      downloadUrl: body?.downloadUrl,
    });
  }

  // 402 License lapsed / locked
  if (res.status === 402) {
    const body = await parseJson<any>(res);
    throw Object.assign(new Error(body?.message || "License expired"), {
      code: body?.error || "LICENSE_ERROR",
      exportOnly: body?.exportOnly ?? false,
    });
  }

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retry = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...platformHeaders(),
          ...(options.headers as Record<string, string>),
        },
      });
      readLicenseHeaders(retry);
      if (!retry.ok) throw new Error(`API error: ${retry.status}`);
      return parseJson<T>(retry);
    }
    await clearAuth();
    clearCachedCredentials();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return parseJson<T>(res);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  company: { id: string; name: string };
}

export async function login(
  apiUrl: string,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const url = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...platformHeaders() },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(res.status === 401 ? "Invalid credentials" : `Login failed: ${body}`);
  }

  const data = JSON.parse(await res.text()) as LoginResponse;

  setApiConfig(url, data.accessToken);
  await saveAuth({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    apiUrl: url,
    userEmail: data.user.email,
    companyName: data.company.name,
  });

  return data;
}

async function refreshAccessToken(): Promise<boolean> {
  const stored = await loadAuth();
  if (!stored?.refreshToken) return false;

  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    });
    if (!res.ok) return false;

    const data = JSON.parse(await res.text()) as { accessToken: string; refreshToken: string };
    accessToken = data.accessToken;
    setCachedCredentials(data.accessToken, baseUrl);

    await saveAuth({ ...stored, accessToken: data.accessToken, refreshToken: data.refreshToken });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export interface PersonalContact {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  allEmails: string[] | null;
  allPhones: string[] | null;
  source: string;
}

export interface ImportContactInput {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  allEmails?: string[] | null;
  allPhones?: string[] | null;
  source: "MACOS" | "WINDOWS" | "IOS" | "ANDROID" | "UPLOAD";
}

export interface ImportResult {
  count: number;
  createdCount: number;
  updatedCount: number;
  contacts: PersonalContact[];
}

export async function importContacts(contacts: ImportContactInput[]): Promise<ImportResult> {
  return request("/personal-contacts/import", {
    method: "POST",
    body: JSON.stringify({ contacts }),
  });
}

export async function listContacts(search?: string, limit = 200): Promise<PersonalContact[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  return request(`/personal-contacts?${params.toString()}`);
}

export async function updatePrimaryContact(
  contactId: string,
  primaryEmail?: string | null,
  primaryPhone?: string | null,
): Promise<PersonalContact> {
  return request(`/personal-contacts/${contactId}/primary`, {
    method: "PATCH",
    body: JSON.stringify({ email: primaryEmail, phone: primaryPhone }),
  });
}

// ---------------------------------------------------------------------------
// Video Assessment
// ---------------------------------------------------------------------------
export type AssessmentType = "EXTERIOR" | "INTERIOR" | "DRONE_ROOF" | "TARGETED";

export interface GeminiAssessmentResult {
  summary: {
    narrative: string;
    overallCondition: number;
    confidence: number;
    materialIdentified: string[];
    zonesAssessed: string[];
    primaryCausation: string;
    estimatedAge?: string;
  };
  findings: Array<{
    zone: string;
    category: string;
    severity: string;
    causation: string;
    description: string;
    frameIndex: number;
    boundingBox?: { x: number; y: number; w: number; h: number } | null;
    costbookItemCode?: string | null;
    estimatedQuantity?: number | null;
    estimatedUnit?: string | null;
    confidence: number;
  }>;
}

export interface AnalyzeFramesPayload {
  frames: Array<{ base64?: string; gcsUri?: string; mimeType: string }>;
  assessmentType: AssessmentType;
  weatherContext?: string;
  captureDate?: string;
}

export interface AnalyzeFramesResponse {
  assessment: GeminiAssessmentResult;
  rawResponse: string;
}

export async function analyzeFrames(payload: AnalyzeFramesPayload): Promise<AnalyzeFramesResponse> {
  return request("/video-assessment/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPresignedUploadUrl(opts: {
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; fileUri: string }> {
  return request("/video-assessment/presigned-upload", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export interface CreateAssessmentPayload {
  projectId?: string;
  sourceType: "DRONE" | "HANDHELD" | "OTHER";
  videoFileName?: string;
  videoDurationSecs?: number;
  videoResolution?: string;
  frameCount?: number;
  thumbnailUrls?: string[];
  assessmentJson: GeminiAssessmentResult;
  rawAiResponse?: string;
  confidenceScore?: number;
  weatherContext?: string;
  captureDate?: string;
  notes?: string;
  findings: Array<{
    zone: string;
    category: string;
    severity: string;
    causation?: string;
    description?: string;
    frameTimestamp?: number;
    thumbnailUrl?: string;
    boundingBoxJson?: any;
    costbookItemCode?: string;
    estimatedQuantity?: number;
    estimatedUnit?: string;
    confidenceScore?: number;
    sortOrder?: number;
  }>;
}

export interface VideoAssessmentFinding {
  id: string;
  zone: string;
  category: string;
  severity: string;
  causation: string;
  description: string | null;
  frameTimestamp: number | null;
  thumbnailUrl: string | null;
  confidenceScore: number | null;
  sortOrder: number;
}

export interface VideoAssessmentRecord {
  id: string;
  status: string;
  sourceType: string;
  videoFileName: string | null;
  createdAt: string;
  confidenceScore: number | null;
  assessmentJson: any | null;
  findings: VideoAssessmentFinding[];
}

export interface ListAssessmentsResponse {
  items: VideoAssessmentRecord[];
  total: number;
}

export async function createAssessment(payload: CreateAssessmentPayload): Promise<VideoAssessmentRecord> {
  return request("/video-assessment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAssessments(): Promise<ListAssessmentsResponse> {
  return request("/video-assessment");
}

// ---------------------------------------------------------------------------
// Zoom & Teach
// ---------------------------------------------------------------------------
export interface TeachPayload {
  frameIndex: number;
  cropBox?: { x: number; y: number; w: number; h: number };
  imageUri: string;
  userHint: string;
  assessmentType?: string;
}

export interface TeachResponse {
  teachingExample: {
    id: string;
    userHint: string;
    aiRefinedFinding: any;
    webSourcesUsed: Array<{ url: string; title: string }>;
    confirmed: boolean;
  };
  finding: VideoAssessmentFinding | null;
  narrative: string;
  webSources: Array<{ url: string; title: string }>;
}

export async function teachAssessment(
  assessmentId: string,
  payload: TeachPayload,
): Promise<TeachResponse> {
  return request(`/video-assessment/${assessmentId}/teach`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function confirmTeach(
  assessmentId: string,
  teachId: string,
  confirmed: boolean,
  correctionJson?: any,
): Promise<any> {
  return request(`/video-assessment/${assessmentId}/teach/${teachId}/confirm`, {
    method: "PATCH",
    body: JSON.stringify({ confirmed, correctionJson }),
  });
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
export interface AssetListItem {
  id: string;
  name: string;
  code: string | null;
  serialNumberOrVin: string | null;
  assetType: string;
  isActive: boolean;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  disposition?: { id: string; label: string; color: string } | null;
}

export async function listAssets(ownershipFilter?: "COMPANY" | "PERSONAL"): Promise<AssetListItem[]> {
  const params = new URLSearchParams();
  if (ownershipFilter) params.set("ownershipType", ownershipFilter);
  const qs = params.toString();
  return request(`/assets${qs ? `?${qs}` : ""}`);
}

export interface AssetAttachmentRecord {
  id: string;
  assetId: string;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  storageKey: string;
  category: string;
  notes: string | null;
  createdAt: string;
}

/**
 * Upload a file as an asset attachment via multipart POST.
 * Uses the Tauri HTTP plugin's fetch which supports FormData-like bodies.
 */
export async function uploadAssetAttachment(
  assetId: string,
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string,
  category: string,
): Promise<AssetAttachmentRecord[]> {
  // Build a multipart/form-data body manually using Blob + FormData
  const formData = new FormData();
  const blob = new Blob([fileBytes.buffer as ArrayBuffer], { type: mimeType });
  formData.append("files", blob, fileName);
  formData.append("category", category);

  const res = await fetch(`${baseUrl}/assets/${assetId}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...platformHeaders(),
      // Do NOT set Content-Type — fetch sets it with the boundary automatically
    },
    body: formData,
  });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error("Session expired");
    const retry = await fetch(`${baseUrl}/assets/${assetId}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, ...platformHeaders() },
      body: formData,
    });
    if (!retry.ok) throw new Error(`Upload failed: ${retry.status}`);
    return parseJson<AssetAttachmentRecord[]>(retry);
  }

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`Upload failed ${res.status}: ${body}`);
  }

  return parseJson<AssetAttachmentRecord[]>(res);
}

// ---------------------------------------------------------------------------
// Device registration
// ---------------------------------------------------------------------------
export interface UserDeviceRecord {
  id: string;
  deviceId: string;
  platform: string;
  deviceName: string;
  appVersion: string;
  licenseType: string;
  lastSeenAt: string;
  createdAt: string;
}

export async function registerDevice(payload: {
  deviceId: string;
  platform: string;
  deviceName: string;
  appVersion: string;
}): Promise<UserDeviceRecord> {
  return request("/auth/register-device", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listDevices(): Promise<UserDeviceRecord[]> {
  return request("/auth/my-devices");
}

export async function revokeDevice(deviceRecordId: string): Promise<void> {
  return request(`/auth/devices/${deviceRecordId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------
export interface NexBridgeFeatures {
  nexbridge: boolean;
  assess: boolean;
  nexplan: boolean;
  ai: boolean;
}

export interface EntitlementInfo {
  modules: string[];
  features: NexBridgeFeatures;
  hasNexBridge: boolean;
}

const DEFAULT_FEATURES: NexBridgeFeatures = {
  nexbridge: false,
  assess: false,
  nexplan: false,
  ai: false,
};

export async function checkEntitlements(): Promise<EntitlementInfo> {
  const data = await request<{ modules: string[]; features?: NexBridgeFeatures }>("/billing/entitlements");
  const modules = data.modules || [];
  const features = data.features || {
    ...DEFAULT_FEATURES,
    nexbridge: modules.includes("NEXBRIDGE"),
    assess: modules.includes("NEXBRIDGE_ASSESS"),
    nexplan: modules.includes("NEXBRIDGE_NEXPLAN"),
    ai: modules.includes("NEXBRIDGE_AI"),
  };
  return {
    modules,
    features,
    hasNexBridge: features.nexbridge,
  };
}

// ---------------------------------------------------------------------------
// Rental pool
// ---------------------------------------------------------------------------
export async function offerRental(
  assetId: string,
  dailyRate?: number,
  notes?: string,
): Promise<void> {
  return request(`/assets/${assetId}/offer-rental`, {
    method: "POST",
    body: JSON.stringify({ dailyRate, notes }),
  });
}

export async function withdrawRental(assetId: string): Promise<void> {
  return request(`/assets/${assetId}/offer-rental`, { method: "DELETE" });
}

export async function listRentalPool(): Promise<AssetListItem[]> {
  return request("/assets/rental-pool");
}

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------
export interface ExportPayload {
  assets: any[];
  contacts: any[];
  devices: any[];
  metadata: Record<string, any>;
}

export async function exportMyData(): Promise<ExportPayload> {
  return request("/export/my-data");
}

// ---------------------------------------------------------------------------
// Projects (lightweight list for NexPLAN project picker)
// ---------------------------------------------------------------------------
export interface ProjectListItem {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  status: string;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  return request("/projects");
}

// ---------------------------------------------------------------------------
// NexPLAN — Planning Rooms
// ---------------------------------------------------------------------------
export interface PlanningRoomItem {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  floorPlanUrl: string | null;
  status: string;
  sourceType: string;
  pipelineStatus: any;
  aiReview: any;
  createdAt: string;
  _count: { selections: number; messages: number };
  selections: Array<{
    id: string;
    status: string;
    vendorProduct: { price: number | null } | null;
  }>;
}

export interface PlanningRoomDetail extends PlanningRoomItem {
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  selections: SelectionItem[];
  selectionSheets: Array<{ id: string; version: number; generatedAt: string }>;
}

export interface SelectionItem {
  id: string;
  roomId: string;
  position: number;
  quantity: number;
  status: string;
  notes: string | null;
  vendorProduct: VendorProductItem | null;
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
  metadata: any;
}

export async function listPlanningRooms(projectId: string): Promise<PlanningRoomItem[]> {
  return request(`/projects/${encodeURIComponent(projectId)}/planning-rooms`);
}

export async function getPlanningRoom(projectId: string, roomId: string): Promise<PlanningRoomDetail> {
  return request(`/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}`);
}

export async function createPlanningRoom(
  projectId: string,
  data: { name: string; description?: string; sourceType?: string },
): Promise<PlanningRoomItem> {
  return request(`/projects/${encodeURIComponent(projectId)}/planning-rooms`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function archivePlanningRoom(projectId: string, roomId: string): Promise<void> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// NexPLAN — Selections
// ---------------------------------------------------------------------------
export async function addSelection(
  projectId: string,
  roomId: string,
  data: { vendorProductId?: string; position: number; quantity?: number; notes?: string },
): Promise<SelectionItem> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}/selections`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateSelection(
  projectId: string,
  selectionId: string,
  data: { status?: string; notes?: string; quantity?: number },
): Promise<SelectionItem> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/selections/${encodeURIComponent(selectionId)}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export async function deleteSelection(projectId: string, selectionId: string): Promise<void> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/selections/${encodeURIComponent(selectionId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// NexPLAN — Vendor Catalog
// ---------------------------------------------------------------------------
export async function listVendorCatalogs(): Promise<VendorCatalogItem[]> {
  return request("/vendor-catalogs");
}

export async function listVendorProducts(
  catalogId: string,
  category?: string,
  search?: string,
): Promise<VendorProductItem[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const qs = params.toString();
  return request(`/vendor-catalogs/${encodeURIComponent(catalogId)}/products${qs ? `?${qs}` : ""}`);
}

// ---------------------------------------------------------------------------
// NexPLAN — Selection Sheets
// ---------------------------------------------------------------------------
export async function generateSelectionSheet(
  projectId: string,
  roomId: string,
  title?: string,
): Promise<any> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/planning-rooms/${encodeURIComponent(roomId)}/generate-sheet`,
    { method: "POST", body: JSON.stringify({ title }) },
  );
}
