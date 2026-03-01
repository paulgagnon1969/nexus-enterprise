import { fetch } from "@tauri-apps/plugin-http";
import { loadAuth, saveAuth, clearAuth } from "./auth";

let baseUrl = "";
let accessToken = "";

export function setApiConfig(url: string, token: string) {
  baseUrl = url.replace(/\/$/, "");
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || text.trim() === "") return [] as unknown as T;
  return JSON.parse(text) as T;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  console.log(`[api] request: ${options.method || "GET"} ${baseUrl}${path}`);
  console.log(`[api] token present: ${!!accessToken}, length: ${accessToken.length}`);

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

  console.log(`[api] response status: ${res.status}`);

  if (res.status === 401) {
    console.log(`[api] 401 — attempting token refresh`);
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
    throw new Error("Session expired");
  }

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`API error ${res.status}: ${body}`);
  }

  try {
    const result = await parseJson<T>(res);
    console.log(`[api] parseJson success`);
    return result;
  } catch (parseErr) {
    console.error(`[api] parseJson threw:`, parseErr);
    throw parseErr;
  }
}

// ---------- Auth ----------

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  company: { id: string; name: string };
}

export async function login(
  apiUrl: string,
  email: string,
  password: string
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

  const text = await res.text();
  const data = JSON.parse(text) as LoginResponse;

  // Persist
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

    const txt = await res.text();
    const data = JSON.parse(txt) as { accessToken: string; refreshToken: string };
    accessToken = data.accessToken;

    await saveAuth({
      ...stored,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return true;
  } catch {
    return false;
  }
}

// ---------- Video Assessment ----------

export interface AnalyzeFramesPayload {
  frames: { base64: string; mimeType: string; timestampSecs: number }[];
  promptType: "EXTERIOR" | "INTERIOR" | "DRONE_ROOF" | "TARGETED";
  videoFileName: string;
  durationSecs: number;
}

export interface AnalyzeFramesResponse {
  findings: Array<{
    zone: string;
    category: string;
    severity: string;
    causation: string;
    description: string;
    confidence: number;
    timestampSecs: number;
    costbookItemCode: string | null;
    suggestedQuantity: number | null;
    suggestedUnit: string | null;
    frameIndex: number;
  }>;
  summary: string;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function analyzeFrames(
  payload: AnalyzeFramesPayload
): Promise<AnalyzeFramesResponse> {
  return request<AnalyzeFramesResponse>("/video-assessment/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface CreateAssessmentPayload {
  sourceType: "DRONE" | "HANDHELD" | "UPLOAD" | "SECURITY_CAM";
  videoFileName: string;
  videoDurationSecs: number;
  videoResolution: string;
  frameCount: number;
  promptType: string;
  findings: AnalyzeFramesResponse["findings"];
  aiSummary: string;
  projectId?: string;
}

export interface VideoAssessmentRecord {
  id: string;
  status: string;
  sourceType: string;
  videoFileName: string;
  createdAt: string;
  aiSummary: string | null;
  findingsCount: number;
}

export async function createAssessment(
  payload: CreateAssessmentPayload
): Promise<VideoAssessmentRecord> {
  return request<VideoAssessmentRecord>("/video-assessment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAssessments(): Promise<VideoAssessmentRecord[]> {
  return request<VideoAssessmentRecord[]>("/video-assessment");
}
