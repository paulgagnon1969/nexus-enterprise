import { apiJson } from "../api/client";
import type { LoginResponse, LoginRequest, AuthTokens } from "../types/api";
import { clearTokens, setTokens, setSyncCredentials, clearAllAuth } from "../storage/tokens";
import { setupGeofencing, stopGeofencing } from "../services/geofencing";
import { getApiBaseUrl } from "../api/config";

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

  // Set up automatic geofencing for all projects (runs in background)
  if (res.user?.projects && res.user.projects.length > 0) {
    try {
      const apiBaseUrl = await getApiBaseUrl();
      const projectsWithCoords = res.user.projects
        .filter((p: any) => p.latitude != null && p.longitude != null)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
        }));

      if (projectsWithCoords.length > 0) {
        await setupGeofencing(
          res.accessToken,
          res.user.id,
          apiBaseUrl,
          projectsWithCoords,
        );
        console.log(`[auth] Geofencing enabled for ${projectsWithCoords.length} projects`);
      }
    } catch (err) {
      console.warn('[auth] Geofencing setup failed (non-fatal):', err);
    }
  }

  return res;
}

export async function logout(): Promise<void> {
  // Stop geofencing
  try {
    await stopGeofencing();
    console.log('[auth] Geofencing stopped');
  } catch (err) {
    console.warn('[auth] Failed to stop geofencing:', err);
  }

  // Clear all auth data (JWT + sync credentials)
  await clearAllAuth();
}
