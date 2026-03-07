import { useState, useEffect, useCallback, useRef } from "react";
import { loadAuth, clearAuth, clearCachedCredentials } from "../lib/auth";
import {
  setApiConfig,
  setAppVersion,
  setDeviceId,
  getLicenseStatus,
  getGraceEndsAt,
  login as apiLogin,
  registerDevice,
  listDevices,
  revokeDevice as apiRevokeDevice,
  checkEntitlements,
  type LoginResponse,
  type UserDeviceRecord,
  type NexBridgeFeatures,
} from "../lib/api";
import { getOrCreateDeviceId, getDeviceName, getDevicePlatform } from "../lib/device";
import { getVersion } from "@tauri-apps/api/app";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  userEmail: string | null;
  companyName: string | null;
  // License & entitlement gating
  licenseStatus: string; // ACTIVE | GRACE_PERIOD | EXPORT_ONLY | LOCKED
  graceEndsAt: string | null;
  entitlementBlocked: boolean;
  // Per-feature entitlements (NexBRIDGE modules)
  enabledModules: string[];
  features: NexBridgeFeatures;
  // Device limit
  deviceLimitReached: boolean;
  existingDevices: UserDeviceRecord[];
  // Update required
  updateRequired: boolean;
  updateMinVersion: string | null;
  updateDownloadUrl: string | null;
}

const DEFAULT_FEATURES: NexBridgeFeatures = {
  nexbridge: false,
  assess: false,
  nexplan: false,
  ai: false,
};

const INITIAL: AuthState = {
  loading: true,
  authenticated: false,
  userEmail: null,
  companyName: null,
  licenseStatus: "ACTIVE",
  graceEndsAt: null,
  entitlementBlocked: false,
  enabledModules: [],
  features: DEFAULT_FEATURES,
  deviceLimitReached: false,
  existingDevices: [],
  updateRequired: false,
  updateMinVersion: null,
  updateDownloadUrl: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(INITIAL);
  const licenseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set app version from Tauri on mount
  useEffect(() => {
    getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => {});
  }, []);

  // Poll license status from api module headers every 30s when authenticated
  useEffect(() => {
    if (!state.authenticated) return;
    const poll = () => {
      const ls = getLicenseStatus();
      const ge = getGraceEndsAt();
      setState((s) => {
        if (s.licenseStatus !== ls || s.graceEndsAt !== ge) {
          return { ...s, licenseStatus: ls, graceEndsAt: ge };
        }
        return s;
      });
    };
    poll();
    licenseTimer.current = setInterval(poll, 30_000);
    return () => {
      if (licenseTimer.current) clearInterval(licenseTimer.current);
    };
  }, [state.authenticated]);

  /** Post-login: register device, check entitlements. */
  const postLoginSetup = useCallback(async (appVer: string) => {
    // --- Device registration ---
    try {
      const devId = await getOrCreateDeviceId();
      setDeviceId(devId);
      await registerDevice({
        deviceId: devId,
        platform: getDevicePlatform(),
        deviceName: getDeviceName(),
        appVersion: appVer,
      });
    } catch (err: any) {
      if (err?.message?.includes("DEVICE_LIMIT_REACHED")) {
        try {
          const devices = await listDevices();
          setState((s) => ({ ...s, deviceLimitReached: true, existingDevices: devices }));
        } catch {
          setState((s) => ({ ...s, deviceLimitReached: true }));
        }
        return; // don't proceed to entitlement check
      }
      console.warn("[auth] device registration failed:", err);
    }

    // --- Entitlement check ---
    try {
      const ent = await checkEntitlements();
      if (!ent.hasNexBridge) {
        setState((s) => ({ ...s, entitlementBlocked: true }));
      } else {
        setState((s) => ({
          ...s,
          enabledModules: ent.modules,
          features: ent.features,
        }));
      }
    } catch (err: any) {
      if (err?.code === "UPDATE_REQUIRED") {
        setState((s) => ({
          ...s,
          updateRequired: true,
          updateMinVersion: err.minVersion ?? null,
          updateDownloadUrl: err.downloadUrl ?? null,
        }));
        return;
      }
      console.warn("[auth] entitlement check failed:", err);
    }
  }, []);

  // Restore session on mount (with timeout so app never hangs)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setState((s) => (s.loading ? { ...s, loading: false } : s));
    }, 5000);

    (async () => {
      try {
        const appVer = await getVersion().catch(() => "1.0.0");
        setAppVersion(appVer);

        const stored = await loadAuth();
        if (stored) {
          setApiConfig(stored.apiUrl, stored.accessToken);
          setState((s) => ({
            ...s,
            loading: false,
            authenticated: true,
            userEmail: stored.userEmail,
            companyName: stored.companyName,
          }));
          await postLoginSetup(appVer);
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch {
        setState((s) => ({ ...s, loading: false }));
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => clearTimeout(timeout);
  }, [postLoginSetup]);

  const login = useCallback(
    async (apiUrl: string, email: string, password: string): Promise<LoginResponse> => {
      const data = await apiLogin(apiUrl, email, password);
      const appVer = await getVersion().catch(() => "1.0.0");
      setState((s) => ({
        ...s,
        loading: false,
        authenticated: true,
        userEmail: data.user.email,
        companyName: data.company.name,
      }));
      await postLoginSetup(appVer);
      return data;
    },
    [postLoginSetup],
  );

  const logout = useCallback(async () => {
    await clearAuth();
    clearCachedCredentials();
    setState({ ...INITIAL, loading: false });
  }, []);

  /** Revoke a device and retry registration. */
  const revokeDeviceAndRetry = useCallback(async (deviceRecordId: string) => {
    await apiRevokeDevice(deviceRecordId);
    const appVer = await getVersion().catch(() => "1.0.0");
    const devId = await getOrCreateDeviceId();
    setDeviceId(devId);
    await registerDevice({
      deviceId: devId,
      platform: getDevicePlatform(),
      deviceName: getDeviceName(),
      appVersion: appVer,
    });
    setState((s) => ({ ...s, deviceLimitReached: false, existingDevices: [] }));
  }, []);

  const hasFeature = useCallback(
    (code: string): boolean => state.enabledModules.includes(code),
    [state.enabledModules],
  );

  return { ...state, login, logout, revokeDeviceAndRetry, hasFeature };
}
