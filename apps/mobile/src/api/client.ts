import { getApiBaseUrl } from "./config";
import type { RefreshResponse } from "../types/api";
import { getTokens, setTokens, clearTokens } from "../storage/tokens";

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

export type ApiRequestInit = RequestInit & { skipAuth?: boolean };

export async function apiFetch(
  path: string,
  init?: ApiRequestInit,
): Promise<Response> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const tokens = init?.skipAuth ? null : await getTokens();

  const headers = new Headers(init?.headers || {});
  if (!init?.skipAuth && tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const first = await fetch(url, { ...(init || {}), headers });

  if (first.status !== 401 || init?.skipAuth) {
    return first;
  }

  // Attempt refresh + retry once.
  try {
    if (!refreshPromise) {
      refreshPromise = runRefresh();
    }
    const refreshed = await refreshPromise;

    const retryHeaders = new Headers(init?.headers || {});
    retryHeaders.set("Authorization", `Bearer ${refreshed.accessToken}`);

    return fetch(url, { ...(init || {}), headers: retryHeaders });
  } catch {
    await clearTokens();
    return first;
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
