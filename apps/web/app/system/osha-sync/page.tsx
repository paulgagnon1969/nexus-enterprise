"use client";

import { useEffect, useState, useCallback } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SyncStatus {
  cfrTitle: number;
  cfrPart: number;
  syncStatus: string;
  lastSyncedAt: string | null;
  lastAmendedDate: string | null;
  sectionCount: number;
  manualId: string | null;
  lastError: string | null;
}

interface UpdateCheck {
  hasUpdates: boolean;
  ecfrDate: string | null;
  storedDate: string | null;
  syncStatus: string;
}

interface SyncResult {
  manualId: string;
  totalSections: number;
  newSections: number;
  updatedSections: number;
  unchangedSections: number;
  subpartCount: number;
  ecfrAmendedDate: string | null;
}

export default function OshaSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system/osha/status`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleCheckUpdates = async () => {
    setChecking(true);
    setError(null);
    setUpdateCheck(null);
    try {
      const res = await fetch(`${API_BASE}/system/osha/check-updates`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to check updates");
      }
      setUpdateCheck(await res.json());
    } catch (err: any) {
      setError(err.message || "Failed to check updates");
    } finally {
      setChecking(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch(`${API_BASE}/system/osha/sync`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Sync failed");
      }
      const result: SyncResult = await res.json();
      setSyncResult(result);
      // Refresh status
      loadStatus();
    } catch (err: any) {
      setError(err.message || "Sync failed");
      loadStatus();
    } finally {
      setSyncing(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "SUCCESS": return { bg: "#dcfce7", color: "#166534", border: "#86efac" };
      case "SYNCING": return { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" };
      case "ERROR": return { bg: "#fef2f2", color: "#991b1b", border: "#fca5a5" };
      default: return { bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db" };
    }
  };

  if (loading) {
    return (
      <PageCard>
        <p style={{ color: "#6b7280" }}>Loading OSHA sync status...</p>
      </PageCard>
    );
  }

  const sc = statusColor(status?.syncStatus || "NEVER");

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <a href="/system/documents" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
                ← Documents
              </a>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, display: "flex", alignItems: "center", gap: 10 }}>
              <span>🛡️</span> OSHA Construction Standards Sync
            </h1>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
              Import and synchronize 29 CFR 1926 from the Electronic Code of Federal Regulations (eCFR).
            </p>
          </div>
        </div>

        {/* Status Card */}
        <div
          style={{
            padding: 20,
            borderRadius: 8,
            border: `1px solid ${sc.border}`,
            backgroundColor: sc.bg,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  color: sc.color,
                  backgroundColor: "rgba(255,255,255,0.6)",
                }}
              >
                {status?.syncStatus || "NEVER"}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: sc.color }}>
                29 CFR Part 1926
              </span>
            </div>
            {status?.manualId && (
              <a
                href={`/system/documents/manuals/${status.manualId}`}
                style={{
                  fontSize: 13,
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                View Manual →
              </a>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Last Synced</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>
                {status?.lastSyncedAt
                  ? new Date(status.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "Never"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>eCFR Amended Date</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>
                {status?.lastAmendedDate || "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Sections Imported</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>
                {status?.sectionCount || 0}
              </div>
            </div>
          </div>

          {status?.lastError && (
            <div style={{ marginTop: 12, padding: 10, backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 6, fontSize: 13, color: "#991b1b" }}>
              <strong>Last Error:</strong> {status.lastError}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCheckUpdates}
            disabled={checking}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: checking ? "wait" : "pointer",
              opacity: checking ? 0.7 : 1,
            }}
          >
            {checking ? "Checking..." : "🔍 Check for Updates"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: syncing ? "#9ca3af" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: syncing ? "wait" : "pointer",
            }}
          >
            {syncing ? "⏳ Syncing from eCFR..." : "🔄 Sync Now"}
          </button>
          {status?.manualId && (
            <a
              href={`/system/documents/manuals/${status.manualId}/preview`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "#f3f4f6",
                color: "#374151",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              👁️ Preview Manual
            </a>
          )}
        </div>

        {/* Update check result */}
        {updateCheck && (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${updateCheck.hasUpdates ? "#fcd34d" : "#86efac"}`,
              backgroundColor: updateCheck.hasUpdates ? "#fffbeb" : "#ecfdf5",
            }}
          >
            {updateCheck.hasUpdates ? (
              <>
                <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 6 }}>
                  ⚠️ Updates Available
                </div>
                <div style={{ fontSize: 13, color: "#78350f" }}>
                  eCFR latest amendment: <strong>{updateCheck.ecfrDate}</strong>
                  {updateCheck.storedDate && (
                    <> • Our last sync: <strong>{updateCheck.storedDate}</strong></>
                  )}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#92400e" }}>
                  Click "Sync Now" to pull the latest OSHA content.
                </p>
              </>
            ) : (
              <div style={{ fontWeight: 600, color: "#065f46" }}>
                ✅ Up to date — no new amendments since last sync ({updateCheck.storedDate}).
              </div>
            )}
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid #86efac",
              backgroundColor: "#ecfdf5",
            }}
          >
            <div style={{ fontWeight: 600, color: "#065f46", marginBottom: 8, fontSize: 15 }}>
              ✅ Sync Complete
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>Subparts</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#065f46" }}>{syncResult.subpartCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>Total Sections</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#065f46" }}>{syncResult.totalSections}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>New</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#2563eb" }}>{syncResult.newSections}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>Updated</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#d97706" }}>{syncResult.updatedSections}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>Unchanged</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#6b7280" }}>{syncResult.unchangedSections}</div>
              </div>
            </div>
            {syncResult.ecfrAmendedDate && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                eCFR amended date: {syncResult.ecfrAmendedDate}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: 12, backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#991b1b", fontSize: 13 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Info */}
        <div style={{ padding: 16, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>About this data</h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
            <li>Source: <a href="https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1926" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>eCFR — 29 CFR Part 1926</a></li>
            <li>Content is U.S. Government work (public domain) — no copyright restrictions</li>
            <li>The eCFR is updated daily by the Office of the Federal Register</li>
            <li>Each section is stored as a versioned SystemDocument; content changes create new revisions</li>
            <li>The generated manual supports Views, PDF export, and tenant publishing</li>
          </ul>
        </div>
      </div>
    </PageCard>
  );
}
