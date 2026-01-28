"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type DocTemplateType = "INVOICE" | "QUOTE" | "SOP" | "GENERIC";

interface DocTemplateRow {
  id: string;
  companyId: string;
  type: DocTemplateType;
  code: string;
  label: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion?: { id: string; versionNo: number; createdAt: string; label?: string | null } | null;
}

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<DocTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myRole, setMyRole] = useState<string | null>(null);
  const canEdit = myRole === "OWNER" || myRole === "ADMIN";

  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<DocTemplateType>("INVOICE");
  const [newCode, setNewCode] = useState("INVOICE");
  const [newLabel, setNewLabel] = useState("Invoice Template");
  const [newDesc, setNewDesc] = useState("Client invoice template");
  const [newHtml, setNewHtml] = useState<string>(
    "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\" />\n  <title>Invoice</title>\n</head>\n<body>\n  <h1>Invoice</h1>\n  <p>Replace this with your template HTML.</p>\n</body>\n</html>\n",
  );
  const [newError, setNewError] = useState<string | null>(null);

  const loadRole = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      const meRes = await fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!meRes.ok) return;
      const me: any = await meRes.json();
      const companyId = typeof window !== "undefined" ? localStorage.getItem("companyId") : null;
      const membership = (me?.memberships ?? []).find((m: any) => String(m.companyId) === String(companyId));
      if (membership?.role) setMyRole(String(membership.role));
    } catch {
      // ignore
    }
  };

  const load = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/documents/templates`, {
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
    void loadRole();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keep newCode/newLabel defaults in sync with type
    if (!showNew) return;
    if (newType === "INVOICE") {
      setNewCode("INVOICE");
      setNewLabel("Invoice Template");
      setNewDesc("Client invoice template");
    } else if (newType === "QUOTE") {
      setNewCode("QUOTE");
      setNewLabel("Quotation Template");
      setNewDesc("Client quotation template");
    } else if (newType === "SOP") {
      setNewCode("SOP");
      setNewLabel("SOP Template");
      setNewDesc("Standard Operating Procedure (internal) template");
    }
  }, [newType, showNew]);

  const grouped = useMemo(() => {
    const byType = new Map<string, DocTemplateRow[]>();
    for (const t of templates) {
      const key = String(t.type || "GENERIC");
      const bucket = byType.get(key) ?? [];
      bucket.push(t);
      byType.set(key, bucket);
    }
    const order: DocTemplateType[] = ["INVOICE", "QUOTE", "SOP", "GENERIC"];
    return order
      .filter((k) => (byType.get(k) ?? []).length > 0)
      .map((k) => ({ type: k, items: (byType.get(k) ?? []).sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [templates]);

  const createTemplate = async () => {
    if (!canEdit) {
      setNewError("Only Admin/Owner can create templates.");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    setNewError(null);

    if (!newCode.trim() || !newLabel.trim()) {
      setNewError("Type, code and label are required.");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(`${API_BASE}/documents/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: newType,
          code: newCode.trim(),
          label: newLabel.trim(),
          description: newDesc.trim(),
          templateHtml: newHtml,
          versionLabel: "v1",
          versionNotes: "Initial template",
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

  return (
    <PageCard>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Documents — Templates</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
            Company-scoped document templates with version history. Print any template to PDF.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 12,
              cursor: loading ? "default" : "pointer",
              height: 36,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => {
              setNewError(null);
              setShowNew(true);
            }}
            disabled={!canEdit}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: canEdit ? "#0f172a" : "#e5e7eb",
              color: canEdit ? "#f9fafb" : "#4b5563",
              fontSize: 12,
              cursor: canEdit ? "pointer" : "default",
              height: 36,
            }}
          >
            New template
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div>}

      {showNew && (
        <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "0 0 160px" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Type</div>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as DocTemplateType)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
              >
                <option value="INVOICE">Invoice</option>
                <option value="QUOTE">Quote</option>
                <option value="SOP">SOP</option>
                <option value="GENERIC">Generic</option>
              </select>
            </label>

            <label style={{ flex: "1 1 180px" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Code</div>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
              />
            </label>

            <label style={{ flex: "2 1 260px" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Label</div>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Description</div>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>

          <label style={{ display: "block", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Initial HTML (v1)</div>
            <textarea
              value={newHtml}
              onChange={(e) => setNewHtml(e.target.value)}
              style={{
                width: "100%",
                minHeight: 160,
                padding: 8,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              }}
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
                cursor: creating ? "default" : "pointer",
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
        ) : error ? null : templates.length === 0 ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>No templates yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {grouped.map((g) => (
              <div key={g.type} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: "#f3f4f6", padding: "8px 10px", fontSize: 13, fontWeight: 700 }}>
                  {g.type}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Template</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Current version</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Active</th>
                      <th style={{ textAlign: "right", padding: "10px 12px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((t) => (
                      <tr key={t.id}>
                        <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
                          <div style={{ fontWeight: 600 }}>{t.label}</div>
                          <div style={{ color: "#6b7280" }}>{t.code}</div>
                          {t.description && (
                            <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>{t.description}</div>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
                          {t.currentVersion?.versionNo ? `v${t.currentVersion.versionNo}` : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb" }}>
                          {t.active ? "Yes" : "No"}
                        </td>
                        <td style={{ padding: "8px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          <Link
                            href={`/documents/templates/${t.id}`}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "#6b7280" }}>
        Permissions: Admin/Owner can create & edit templates. Everyone else can view.
      </div>
    </PageCard>
  );
}
