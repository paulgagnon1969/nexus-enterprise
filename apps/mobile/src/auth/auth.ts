import { apiJson } from "../api/client";
import type { LoginResponse, LoginRequest, AuthTokens } from "../types/api";
import { clearTokens, setTokens } from "../storage/tokens";

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
  return res;
}

export async function logout(): Promise<void> {
  await clearTokens();
}
