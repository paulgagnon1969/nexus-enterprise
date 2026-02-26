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

  // Update geofencing with fresh auth token and latest projects
  // This keeps background auth fresh but geofencing continues running
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
        // This updates auth and projects, but geofencing task keeps running
        await setupGeofencing(
          res.accessToken,
          res.user.id,
          apiBaseUrl,
          projectsWithCoords,
        );
        console.log(`[auth] Geofencing updated for ${projectsWithCoords.length} projects`);
      }
    } catch (err) {
      console.warn('[auth] Geofencing update failed (non-fatal):', err);
    }
  }

  return res;
}

export async function logout(): Promise<void> {
  // DO NOT stop geofencing on logout!
  // Geofencing should continue running in background even when logged out
  // This allows automatic clock-in/out without requiring active login
  
  // Clear all auth data (JWT + sync credentials)
  await clearAllAuth();
  
  console.log('[auth] Logged out (geofencing still active)');
}
