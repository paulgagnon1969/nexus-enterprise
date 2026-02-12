import { apiJson } from "../api/client";
import type { LoginResponse, LoginRequest, AuthTokens } from "../types/api";
import { clearTokens, setTokens, setSyncCredentials, clearAllAuth } from "../storage/tokens";

export async function login(req: LoginRequest): Promise<LoginResponse> {
  const res = await apiJson<LoginResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    // no bearer token yet
    skipAuth: true,
  });

  const tokens: AuthTokens = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
  };

  await setTokens(tokens);

  // Store permanent sync credentials for DeviceSync fallback
  if (res.syncCredentials) {
    await setSyncCredentials(res.syncCredentials);
    console.log("[auth] Stored DeviceSync credentials");
  }

  return res;
}

export async function logout(): Promise<void> {
  // Clear all auth data (JWT + sync credentials)
  await clearAllAuth();
}
