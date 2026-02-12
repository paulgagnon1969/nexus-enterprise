import { getApiBaseUrl } from "./config";
import type { RefreshResponse } from "../types/api";
import { getTokens, setTokens, clearTokens, getSyncCredentials } from "../storage/tokens";

let refreshPromise: Promise<RefreshResponse> | null = null;

async function runRefresh(): Promise<RefreshResponse> {
  const base = getApiBaseUrl();
  const tokens = await getTokens();
  if (!tokens?.refreshToken) {
    throw new Error("Missing refresh token");
  }

  const res = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status}`);
  }

  const json = (await res.json()) as any;
  if (!json?.accessToken || !json?.refreshToken) {
    throw new Error("Refresh response missing tokens");
  }

  const next: RefreshResponse = {
    accessToken: json.accessToken,
    refreshToken: json.refreshToken,
  };

  await setTokens(next);
  return next;
}

/**
 * Try request with DeviceSync permanent tokens.
 * This is the last-resort fallback when JWT and refresh both fail.
 */
async function tryDeviceSync(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  const syncCreds = await getSyncCredentials();
  if (!syncCreds) {
    console.log(`[apiFetch] No DeviceSync credentials available`);
    return null;
  }

  console.log(`[apiFetch] Trying DeviceSync authentication...`);

  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `DeviceSync ${syncCreds.userToken}:${syncCreds.companyToken}`);

  const res = await fetch(url, { ...(init || {}), headers });
  console.log(`[apiFetch] DeviceSync response status: ${res.status}`);

  return res;
}

export type ApiRequestInit = RequestInit & { skipAuth?: boolean };

export async function apiFetch(
  path: string,
  init?: ApiRequestInit,
): Promise<Response> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const tokens = init?.skipAuth ? null : await getTokens();

  // DEBUG: Log request details
  console.log(`[apiFetch] ${init?.method || "GET"} ${url}`);
  console.log(`[apiFetch] hasAccessToken=${!!tokens?.accessToken}, hasRefreshToken=${!!tokens?.refreshToken}`);

  const headers = new Headers(init?.headers || {});
  if (!init?.skipAuth && tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const first = await fetch(url, { ...(init || {}), headers });

  console.log(`[apiFetch] Response status: ${first.status}`);

  if (first.status !== 401 || init?.skipAuth) {
    return first;
  }

  // Attempt refresh + retry once.
  console.log(`[apiFetch] Got 401, attempting token refresh...`);
  try {
    if (!refreshPromise) {
      refreshPromise = runRefresh();
    }
    const refreshed = await refreshPromise;
    console.log(`[apiFetch] Refresh succeeded, retrying request...`);

    const retryHeaders = new Headers(init?.headers || {});
    retryHeaders.set("Authorization", `Bearer ${refreshed.accessToken}`);

    const retryRes = await fetch(url, { ...(init || {}), headers: retryHeaders });
    console.log(`[apiFetch] Retry response status: ${retryRes.status}`);
    return retryRes;
  } catch (refreshErr) {
    console.log(`[apiFetch] Refresh FAILED:`, refreshErr instanceof Error ? refreshErr.message : refreshErr);

    // Fallback to DeviceSync (permanent tokens)
    const deviceSyncRes = await tryDeviceSync(url, init);
    if (deviceSyncRes && deviceSyncRes.ok) {
      return deviceSyncRes;
    }

    // All auth methods failed
    await clearTokens();
    return deviceSyncRes || first;
  } finally {
    refreshPromise = null;
  }
}

export async function apiJson<T>(
  path: string,
  init?: ApiRequestInit,
): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}
