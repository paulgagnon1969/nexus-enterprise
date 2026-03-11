import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// ── Config ──────────────────────────────────────────────────

const DEFAULT_API_URL = __DEV__
  ? "http://localhost:8001"
  : "https://staging-api.nfsgrp.com";

function getApiBaseUrl(): string {
  return (
    Constants.expoConfig?.extra?.apiBaseUrl ??
    DEFAULT_API_URL
  );
}

// ── Token Storage ───────────────────────────────────────────

const ACCESS_TOKEN_KEY = "nexcard_access_token";
const REFRESH_TOKEN_KEY = "nexcard_refresh_token";

export async function getTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// ── Refresh ─────────────────────────────────────────────────

let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;

async function runRefresh(): Promise<{ accessToken: string; refreshToken: string }> {
  const base = getApiBaseUrl();
  const tokens = await getTokens();
  if (!tokens?.refreshToken) throw new Error("No refresh token");

  const res = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);

  const json = (await res.json()) as any;
  if (!json?.accessToken || !json?.refreshToken) {
    throw new Error("Refresh response missing tokens");
  }

  const next = { accessToken: json.accessToken, refreshToken: json.refreshToken };
  await setTokens(next);
  return next;
}

// ── Fetch Wrapper ───────────────────────────────────────────

export interface ApiRequestInit extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch(path: string, init?: ApiRequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const tokens = init?.skipAuth ? null : await getTokens();
  const headers = new Headers(init?.headers || {});
  if (!init?.skipAuth && tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const first = await fetch(url, { ...(init || {}), headers });

  if (first.status !== 401 || init?.skipAuth) return first;

  // Attempt refresh + retry
  try {
    if (!refreshPromise) refreshPromise = runRefresh();
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

export async function apiJson<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// ── Auth ────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Login failed: ${res.status}`);
  }
  const json = (await res.json()) as any;
  await setTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken });
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokens();
  return !!tokens?.accessToken;
}
