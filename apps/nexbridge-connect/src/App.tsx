import { useState, useEffect, useCallback } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "./hooks/useAuth";
import { startAutoUpdater, installAndRelaunch, type UpdateStatus } from "./lib/auto-updater";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import VideoAssessment from "./pages/VideoAssessment";
import { ContactList } from "./components/contacts/ContactList";
import { DocumentsTab } from "./components/documents/DocumentsTab";
import { AssetsTab } from "./components/assets/AssetsTab";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import { exportMyData } from "./lib/api";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { UpsellCard, MODULE_INFO } from "./components/UpsellCard";
import { NexPlanTab } from "./components/nexplan/NexPlanTab";
import type { MeshStatus } from "./lib/mesh-client";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** If set, the nav item is only visible when this module code is enabled. */
  requiresModule?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Assessments", icon: "\uD83C\uDFAF", requiresModule: "NEXBRIDGE_ASSESS" },
  { to: "/contacts", label: "Contacts", icon: "\uD83D\uDC65" },
  { to: "/documents", label: "Documents", icon: "\uD83D\uDCC4" },
  { to: "/assets", label: "Assets", icon: "\uD83D\uDDC2\uFE0F" },
  { to: "/nexplan", label: "NexPLAN", icon: "\uD83D\uDCD0", requiresModule: "NEXBRIDGE_NEXPLAN" },
  { to: "/support", label: "Support", icon: "\uD83D\uDEE0\uFE0F" },
  { to: "/settings", label: "Settings", icon: "\u2699\uFE0F" },
];

// ---------------------------------------------------------------------------
// Mesh status indicator
// ---------------------------------------------------------------------------

const MESH_COLORS: Record<MeshStatus, { dot: string; label: string }> = {
  connected: { dot: "bg-emerald-400", label: "Mesh: Connected" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Mesh: Connecting\u2026" },
  disconnected: { dot: "bg-slate-300", label: "Mesh: Offline" },
  error: { dot: "bg-red-400", label: "Mesh: Error" },
};

function MeshStatusBadge({ status }: { status: MeshStatus }) {
  const { dot, label } = MESH_COLORS[status];
  return (
    <div className="flex items-center gap-1" title={label}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gating screens (rendered before the main app shell)
// ---------------------------------------------------------------------------

function UpdateRequiredScreen({ minVersion, downloadUrl }: { minVersion: string | null; downloadUrl: string | null }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-8 text-center">
      <div className="text-4xl">\u26A0\uFE0F</div>
      <h1 className="text-xl font-bold text-slate-900">Update Required</h1>
      <p className="max-w-md text-sm text-slate-600">
        A new version of NexBRIDGE Connect is required{minVersion ? ` (v${minVersion}+)` : ""}. Please update to continue.
      </p>
      {downloadUrl && (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700"
        >
          Download Update
        </a>
      )}
    </div>
  );
}

function EntitlementBlockedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-8 text-center">
      <div className="text-4xl">\uD83D\uDD12</div>
      <h1 className="text-xl font-bold text-slate-900">NexBRIDGE Not Enabled</h1>
      <p className="max-w-md text-sm text-slate-600">
        Your organization does not have the NexBRIDGE module enabled. Contact your administrator to enable it.
      </p>
      <button onClick={onLogout} className="rounded-lg border border-slate-300 px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
        Sign Out
      </button>
    </div>
  );
}

function DeviceLimitScreen({
  devices,
  onRevoke,
  revoking,
}: {
  devices: { id: string; deviceName: string; platform: string; lastSeenAt: string }[];
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-8 text-center">
      <div className="text-4xl">\uD83D\uDCBB</div>
      <h1 className="text-xl font-bold text-slate-900">Device Limit Reached</h1>
      <p className="max-w-md text-sm text-slate-600">
        You have reached the maximum of 3 registered devices. Remove one to activate this device.
      </p>
      <div className="w-full max-w-md space-y-2">
        {devices.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-left">
              <p className="text-sm font-medium text-slate-900">{d.deviceName}</p>
              <p className="text-xs text-slate-500">{d.platform} — Last seen {new Date(d.lastSeenAt).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => onRevoke(d.id)}
              disabled={revoking}
              className="rounded bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LockedScreen({ onLogout, onExport }: { onLogout: () => void; onExport: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-8 text-center">
      <div className="text-4xl">\uD83D\uDEAB</div>
      <h1 className="text-xl font-bold text-slate-900">License Expired</h1>
      <p className="max-w-md text-sm text-slate-600">
        Your NexBRIDGE license has expired and the grace period has ended. You can export your data before signing out.
      </p>
      <div className="flex gap-3">
        <button onClick={onExport} className="rounded-lg bg-nexus-600 px-6 py-2 text-sm font-medium text-white hover:bg-nexus-700">
          Export My Data
        </button>
        <button onClick={onLogout} className="rounded-lg border border-slate-300 px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          Sign Out
        </button>
      </div>
    </div>
  );
}

function UpdateBanner({ status }: { status: UpdateStatus }) {
  if (status.state === "downloading") {
    return (
      <div className="flex items-center justify-center gap-2 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-800">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        <span>Downloading update… {status.progress}%</span>
      </div>
    );
  }
  if (status.state === "ready") {
    return (
      <div className="flex items-center justify-center gap-2 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-800">
        <span>✅</span>
        <span>Version {status.version} is ready.</span>
        <button
          onClick={() => installAndRelaunch()}
          className="ml-1 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
        >
          Restart Now
        </button>
      </div>
    );
  }
  return null;
}

function GracePeriodBanner({ endsAt }: { endsAt: string }) {
  const date = new Date(endsAt);
  const daysLeft = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
      <span>\u26A0\uFE0F</span>
      <span>Your subscription has lapsed. You have {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining before data export-only mode.</span>
    </div>
  );
}

function ExportOnlyBanner({ onExport }: { onExport: () => void }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-red-50 px-4 py-2 text-xs font-medium text-red-800">
      <span>\uD83D\uDCE6</span>
      <span>Read-only mode — your subscription has lapsed.</span>
      <button onClick={onExport} className="ml-2 underline hover:text-red-900">Export My Data</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const auth = useAuth();
  const location = useLocation();
  const [revoking, setRevoking] = useState(false);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [archLabel, setArchLabel] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: "idle" });

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    // Detect runtime architecture (compile-time constant baked into binary)
    invoke<{ platform: string }>("get_system_info")
      .then((info) => {
        const p = info.platform; // e.g. "macos-aarch64" or "macos-x86_64"
        if (p.includes("aarch64")) setArchLabel("arm64");
        else if (p.includes("x86_64")) setArchLabel("x86_64");
        else setArchLabel(p.split("-").pop() ?? null);
      })
      .catch(() => {});
  }, []);

  // Start background auto-updater
  useEffect(() => {
    return startAutoUpdater(setUpdateStatus);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const data = await exportMyData();
      const json = JSON.stringify(data, null, 2);
      const filePath = await save({
        defaultPath: `nexbridge-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, json);
      }
    } catch (err) {
      console.error("[export] failed:", err);
    }
  }, []);

  const handleRevokeDevice = useCallback(
    async (deviceRecordId: string) => {
      setRevoking(true);
      try {
        await auth.revokeDeviceAndRetry(deviceRecordId);
      } catch (err) {
        console.error("[device] revoke failed:", err);
      } finally {
        setRevoking(false);
      }
    },
    [auth],
  );

  // --- Loading ---
  if (auth.loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-nexus-200 border-t-nexus-600" />
        <div className="text-nexus-700 text-lg font-bold tracking-tight">
          NexBRIDGE Connect
        </div>
        <div className="text-sm text-gray-400">Initializing\u2026</div>
      </div>
    );
  }

  // --- Not authenticated ---
  if (!auth.authenticated) {
    return <Login onLogin={auth.login} />;
  }

  // --- Gating: Update required (426) ---
  if (auth.updateRequired) {
    return <UpdateRequiredScreen minVersion={auth.updateMinVersion} downloadUrl={auth.updateDownloadUrl} />;
  }

  // --- Gating: Entitlement blocked ---
  if (auth.entitlementBlocked) {
    return <EntitlementBlockedScreen onLogout={auth.logout} />;
  }

  // --- Gating: Device limit ---
  if (auth.deviceLimitReached) {
    return <DeviceLimitScreen devices={auth.existingDevices} onRevoke={handleRevokeDevice} revoking={revoking} />;
  }

  // --- Gating: License LOCKED (past grace period) ---
  if (auth.licenseStatus === "LOCKED") {
    return <LockedScreen onLogout={auth.logout} onExport={handleExport} />;
  }

  // Hide sidebar on the /assess route (full-screen video assessment)
  const isAssessRoute = location.pathname === "/assess";
  const showGraceBanner = auth.licenseStatus === "GRACE_PERIOD" && auth.graceEndsAt;
  const showExportOnlyBanner = auth.licenseStatus === "EXPORT_ONLY";

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Update banner (highest priority — shows above license banners) */}
      <UpdateBanner status={updateStatus} />
      {/* License banners */}
      {showGraceBanner && <GracePeriodBanner endsAt={auth.graceEndsAt!} />}
      {showExportOnlyBanner && <ExportOnlyBanner onExport={handleExport} />}

      {/* Top bar with version + mesh status */}
      <div className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-1">
        <MeshStatusBadge status={auth.meshStatus} />
        {archLabel && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
              archLabel === "arm64"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
            title={archLabel === "arm64" ? "Native Apple Silicon" : "Running via Rosetta (x86_64)"}
          >
            {archLabel === "arm64" ? "\u{1F34F} arm64" : "\u26A0\uFE0F x86_64"}
          </span>
        )}
        <span className="text-[10px] font-mono text-slate-400">v{appVersion}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {!isAssessRoute && (
          <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
            {/* Brand */}
            <div className="flex items-center gap-2 px-4 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-nexus-600">
                <span className="text-sm font-bold text-white">N</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900">NexBRIDGE Connect</h1>
              <span className="text-[10px] text-slate-400">v{appVersion}{archLabel ? ` (${archLabel})` : ""}</span>
              </div>
            </div>

            {/* Nav links */}
            <nav className="flex-1 space-y-1 px-2 py-2">
              {NAV_ITEMS.map((item) => {
                // Hide nav items for modules the user doesn't have
                if (item.requiresModule && !auth.hasFeature(item.requiresModule)) {
                  return null;
                }
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-nexus-50 text-nexus-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* User footer */}
            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs text-slate-600">{auth.userEmail}</p>
                  {auth.companyName && (
                    <p className="truncate text-[10px] text-slate-400">{auth.companyName}</p>
                  )}
                </div>
                <button
                  onClick={auth.logout}
                  className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {isAssessRoute && (
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2">
              <NavLink to="/" className="text-sm text-nexus-600 hover:text-nexus-700">
                \u2190 Back
              </NavLink>
              <span className="text-xs text-slate-400">{auth.userEmail}</span>
            </div>
          )}
          <Routes>
            <Route path="/" element={
              auth.features.assess ? <Dashboard /> : (
                <div className="p-4 h-full">
                  <UpsellCard moduleCode="NEXBRIDGE_ASSESS" {...MODULE_INFO.NEXBRIDGE_ASSESS} />
                </div>
              )
            } />
            <Route path="/assess" element={
              auth.features.assess ? <VideoAssessment /> : (
                <div className="p-4 h-full">
                  <UpsellCard moduleCode="NEXBRIDGE_ASSESS" {...MODULE_INFO.NEXBRIDGE_ASSESS} />
                </div>
              )
            } />
            <Route path="/contacts" element={<div className="p-4 h-full"><ContactList /></div>} />
            <Route path="/documents" element={<div className="p-4 h-full"><DocumentsTab /></div>} />
            <Route path="/assets" element={<div className="p-4 h-full"><AssetsTab /></div>} />
            <Route path="/nexplan" element={
              auth.features.nexplan ? (
                <div className="p-4 h-full overflow-auto">
                  <NexPlanTab />
                </div>
              ) : (
                <div className="p-4 h-full">
                  <UpsellCard moduleCode="NEXBRIDGE_NEXPLAN" {...MODULE_INFO.NEXBRIDGE_NEXPLAN} />
                </div>
              )
            } />
            <Route path="/support" element={<div className="p-4 h-full"><Support /></div>} />
            <Route path="/settings" element={<div className="p-4"><Settings /></div>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
