import { fetch } from "@tauri-apps/plugin-http";
import { loadAuth, saveAuth, clearAuth, setCachedCredentials, clearCachedCredentials } from "./auth";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let baseUrl = "";
let accessToken = "";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  console.log(`[api] ${options.method || "GET"} ${baseUrl}${path}`);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers as Record<string, string>),
      },
    });
  } catch (fetchErr) {
    console.error(`[api] fetch() threw:`, fetchErr);
    throw fetchErr;
  }

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retry = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(options.headers as Record<string, string>),
        },
      });
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
    headers: { "Content-Type": "application/json" },
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
