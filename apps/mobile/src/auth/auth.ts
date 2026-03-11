import { apiJson } from "../api/client";
import type { LoginResponse, LoginRequest, AuthTokens } from "../types/api";
import { clearTokens, setTokens, setSyncCredentials, clearAllAuth } from "../storage/tokens";
import { setupGeofencing, stopGeofencing } from "../services/geofencing";
import { getApiBaseUrl } from "../api/config";
import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Generate a stable device fingerprint from hardware identifiers.
 * Combines device model + OS + a stable "device type" indicator.
 * Not cryptographically unique but sufficient for trust tracking.
 */
export function getDeviceFingerprint(): string {
  const parts = [
    Device.modelName || "unknown",
    Platform.OS,
    Device.osVersion || "",
    Device.deviceName || "",
  ];
  // Simple hash: join parts and base64-encode for a stable fingerprint
  const raw = parts.join("|");
  // Use a basic numeric hash for compactness
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return `${Platform.OS}-${Device.modelName || "device"}-${Math.abs(hash).toString(36)}`;
}

export function getDevicePlatform(): string {
  return `mobile-${Platform.OS}`;
}

export function getDeviceDisplayName(): string {
  return Device.deviceName || Device.modelName || `${Platform.OS} device`;
}

export async function login(req: LoginRequest): Promise<LoginResponse> {
  // Attach device fingerprint for trust evaluation
  const enrichedReq: LoginRequest = {
    ...req,
    deviceFingerprint: req.deviceFingerprint || getDeviceFingerprint(),
    devicePlatform: req.devicePlatform || getDevicePlatform(),
    deviceName: req.deviceName || getDeviceDisplayName(),
  };

  const res = await apiJson<LoginResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enrichedReq),
    // no bearer token yet
    skipAuth: true,
  });

  // If the server requires a device challenge, return early without storing tokens
  if (res.challengeRequired) {
    return res;
  }

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

/**
 * Verify a device challenge code and complete login.
 * Called when login() returns { challengeRequired: true }.
 */
export async function verifyDeviceChallenge(params: {
  email: string;
  code: string;
  deviceFingerprint?: string;
  devicePlatform?: string;
  deviceName?: string;
}): Promise<LoginResponse> {
  const res = await apiJson<LoginResponse>("/auth/verify-device-challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      code: params.code,
      deviceFingerprint: params.deviceFingerprint || getDeviceFingerprint(),
      devicePlatform: params.devicePlatform || getDevicePlatform(),
      deviceName: params.deviceName || getDeviceDisplayName(),
    }),
    skipAuth: true,
  });

  const tokens: AuthTokens = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
  };

  await setTokens(tokens);

  if (res.syncCredentials) {
    await setSyncCredentials(res.syncCredentials);
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
