"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface TemplateRow {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  currentVersion?: { id: string; versionNo: number; dayKey: string } | null;
}

export default function SystemTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("NEXUS_SYSTEM");
  const [newLabel, setNewLabel] = useState("Nexus System Template");
  const [newDesc, setNewDesc] = useState("Canonical Nexus System template (SORM-managed)");
  const [newError, setNewError] = useState<string | null>(null);

  const load = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/admin/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to load templates (${res.status}) ${text}`);
      }
      const json = await res.json();
      setTemplates(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTemplate = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    setNewError(null);

    if (!newCode.trim() || !newLabel.trim()) {
      setNewError("Code and label are required.");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/admin/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newCode.trim(),
          label: newLabel.trim(),
          description: newDesc.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Create failed (${res.status}) ${text}`);
      }

      setShowNew(false);
      await load();
    } catch (e: any) {
      setNewError(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const syncFromSystem = async (templateId: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/admin/templates/${templateId}/sync-from-system`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Sync failed (${res.status}) ${text}`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Sync failed");
    }
  };

  return (
    <PageCard>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>SORM — Templates</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
            Templates are daily-coalesced snapshots of Nexus System defaults (modules, admin articles, and standard role profiles/permissions).
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewError(null);
            setShowNew(true);
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#f9fafb",
            fontSize: 12,
            cursor: "pointer",
            height: 36,
          }}
        >
          New template
        </button>
      </div>

      {showNew && (
        <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 180px" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Code</div>
              <input
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ flex: "2 1 260px" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Label</div>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Description</div>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          {newError && <div style={{ marginTop: 8, color: "#b91c1c" }}>{newError}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={createTemplate}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                background: creating ? "#e5e7eb" : "#2563eb",
                color: creating ? "#4b5563" : "#f9fafb",
              }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
        ) : error ? (
          <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>No templates yet.</div>
        ) : (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px" }}>Template</th>
                  <th style={{ textAlign: "left", padding: "10px 12px" }}>Current version</th>
                  <th style={{ textAlign: "right", padding: "10px 12px" }} />
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id}>
                    <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
                      <div style={{ fontWeight: 600 }}>{t.label}</div>
                      <div style={{ color: "#6b7280" }}>{t.code}</div>
                    </td>
                    <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
                      {t.currentVersion?.versionNo
                        ? `v${t.currentVersion.versionNo} (${t.currentVersion.dayKey})`
                        : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                      <Link
                        href={`/system/templates/${t.id}`}
                        style={{ marginRight: 10, color: "#2563eb", textDecoration: "none" }}
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => syncFromSystem(t.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid #0f172a",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Sync from Nexus System
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageCard>
  );
}
