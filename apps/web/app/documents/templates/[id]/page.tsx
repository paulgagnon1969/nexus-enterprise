"use client";

import { useEffect, useMemo, useState } from "react";
import { PageCard } from "../../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type DocTemplateType = "INVOICE" | "QUOTE" | "SOP" | "GENERIC";

interface DocTemplateVersion {
  id: string;
  templateId: string;
  versionNo: number;
  label?: string | null;
  notes?: string | null;
  html: string;
  createdAt: string;
  createdByUserId?: string | null;
}

interface DocTemplateDetail {
  id: string;
  companyId: string;
  type: DocTemplateType;
  code: string;
  label: string;
  description?: string | null;
  active: boolean;
  currentVersionId?: string | null;
  currentVersion?: DocTemplateVersion | null;
  versions: DocTemplateVersion[];
  createdAt: string;
  updatedAt: string;
}

export default function DocumentTemplateDetailPage({ params }: { params: { id: string } }) {
  const templateId = params.id;

  const [tpl, setTpl] = useState<DocTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myRole, setMyRole] = useState<string | null>(null);
  const canEdit = myRole === "OWNER" || myRole === "ADMIN";

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const selectedVersion = useMemo(() => {
    if (!tpl) return null;
    const id = selectedVersionId || tpl.currentVersionId || tpl.currentVersion?.id || null;
    return (tpl.versions ?? []).find((v) => v.id === id) || tpl.currentVersion || null;
  }, [tpl, selectedVersionId]);

  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<DocTemplateType>("GENERIC");
  const [editActive, setEditActive] = useState(true);

  const [draftHtml, setDraftHtml] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [versionNotes, setVersionNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/documents/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to load template (${res.status}) ${text}`);
      }
      const json = (await res.json()) as DocTemplateDetail;
      setTpl(json);

      setEditLabel(String(json.label ?? ""));
      setEditDescription(String(json.description ?? ""));
      setEditType((json.type as DocTemplateType) || "GENERIC");
      setEditActive(Boolean(json.active));

      const currentHtml = String(json.currentVersion?.html ?? "");
      setDraftHtml(currentHtml);
      setSelectedVersionId(json.currentVersion?.id ?? null);

      setVersionLabel("");
      setVersionNotes("");
      setMessage(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load template");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRole();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    // When selecting a historical version, load it into the editor for preview/copy.
    if (!selectedVersion) return;
    setDraftHtml(String(selectedVersion.html ?? ""));
  }, [selectedVersion?.id]);

  const buildHtmlDocument = (rawHtml: string, title: string) => {
    const trimmed = String(rawHtml ?? "").trim();
    const looksLikeFullDoc = /<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed);

    if (looksLikeFullDoc) {
      return trimmed;
    }

    // If the template is just a fragment, wrap it so preview/print behave consistently.
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${rawHtml}</body></html>`;
  };

  const openPreviewWindow = (html: string, title: string) => {
    const win = window.open("about:blank", "_blank");
    if (!win) {
      setMessage("Popup blocked. Allow popups to preview/print.");
      return;
    }

    win.document.open();
    win.document.write(buildHtmlDocument(html, title));
    win.document.close();
    win.focus();
  };

  const printHtml = (html: string, title: string) => {
    // Use a hidden iframe so the printed result is a clean document.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      return;
    }

    doc.open();
    doc.write(buildHtmlDocument(html, title));
    doc.close();

    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        window.setTimeout(() => iframe.remove(), 5000);
      }
    }, 120);
  };

  const saveMetaOnly = async () => {
    if (!tpl) return;
    if (!canEdit) {
      setMessage("Only Admin/Owner can edit templates.");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE}/documents/templates/${tpl.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: editType,
          label: editLabel,
          description: editDescription,
          active: editActive,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}) ${text}`);
      }
      const json = await res.json();
      setTpl(json);
      setMessage("Saved.");
    } catch (e: any) {
      setMessage(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveNewVersion = async () => {
    if (!tpl) return;
    if (!canEdit) {
      setMessage("Only Admin/Owner can edit templates.");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE}/documents/templates/${tpl.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          templateHtml: draftHtml,
          versionLabel: versionLabel.trim() || undefined,
          versionNotes: versionNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}) ${text}`);
      }
      const json = await res.json();
      setTpl(json);
      setSelectedVersionId(json.currentVersion?.id ?? null);
      setVersionLabel("");
      setVersionNotes("");
      setMessage("Saved new version.");
    } catch (e: any) {
      setMessage(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setAsCurrent = async (versionId: string) => {
    if (!tpl) return;
    if (!canEdit) {
      setMessage("Only Admin/Owner can change current version.");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE}/documents/templates/${tpl.id}/set-current`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Set current failed (${res.status}) ${text}`);
      }
      const json = await res.json();
      setTpl(json);
      setSelectedVersionId(versionId);
      setMessage("Set current version.");
    } catch (e: any) {
      setMessage(e?.message ?? "Set current failed");
    } finally {
      setSaving(false);
    }
  };

  const currentVersionId = tpl?.currentVersion?.id ?? tpl?.currentVersionId ?? null;

  return (
    <PageCard>
      {loading ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
      ) : !tpl ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>Not found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{tpl.type} · {tpl.code}</div>
              <h2 style={{ marginTop: 4, marginBottom: 0, fontSize: 18 }}>{tpl.label}</h2>
              {tpl.description && (
                <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>{tpl.description}</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={load}
                disabled={saving}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: 12,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => openPreviewWindow(draftHtml, `Preview: ${tpl.code}`)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #2563eb",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => printHtml(draftHtml, `Print: ${tpl.code}`)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Print / Save PDF
              </button>
            </div>
          </header>

          {message && (
            <div style={{ fontSize: 12, color: message.toLowerCase().includes("fail") ? "#b91c1c" : "#4b5563" }}>
              {message}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 12, alignItems: "start" }}>
            {/* Left: versions */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#ffffff", overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", background: "#f3f4f6", fontSize: 13, fontWeight: 700 }}>
                Versions
              </div>
              <div style={{ maxHeight: 520, overflow: "auto" }}>
                {(tpl.versions ?? []).map((v) => {
                  const isCurrent = v.id === currentVersionId;
                  const isSelected = v.id === (selectedVersionId || currentVersionId);

                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVersionId(v.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderTop: "1px solid #e5e7eb",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                          v{v.versionNo}{isCurrent ? " (current)" : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {new Date(v.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {v.label && <div style={{ fontSize: 12, color: "#374151" }}>{v.label}</div>}
                      {v.notes && <div style={{ marginTop: 2, fontSize: 11, color: "#6b7280" }}>{v.notes}</div>}

                      {canEdit && !isCurrent && (
                        <div style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void setAsCurrent(v.id);
                            }}
                            disabled={saving}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              background: "#ffffff",
                              cursor: saving ? "default" : "pointer",
                              fontSize: 11,
                            }}
                          >
                            Set current
                          </button>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: editor */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#ffffff", padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Template</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    Editing always creates a new version.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={!canEdit || saving}
                    onClick={saveMetaOnly}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      cursor: !canEdit || saving ? "default" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    Save settings
                  </button>

                  <button
                    type="button"
                    disabled={!canEdit || saving}
                    onClick={saveNewVersion}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #0f172a",
                      background: !canEdit || saving ? "#e5e7eb" : "#0f172a",
                      color: !canEdit || saving ? "#4b5563" : "#f9fafb",
                      cursor: !canEdit || saving ? "default" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {saving ? "Saving…" : "Save new version"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ flex: "2 1 240px" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Label</div>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    disabled={!canEdit}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  />
                </label>

                <label style={{ flex: "1 1 160px" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Type</div>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as DocTemplateType)}
                    disabled={!canEdit}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  >
                    <option value="INVOICE">Invoice</option>
                    <option value="QUOTE">Quote</option>
                    <option value="SOP">SOP</option>
                    <option value="GENERIC">Generic</option>
                  </select>
                </label>

                <label style={{ flex: "0 0 120px" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Active</div>
                  <select
                    value={editActive ? "1" : "0"}
                    onChange={(e) => setEditActive(e.target.value === "1")}
                    disabled={!canEdit}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  >
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "block", marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Description</div>
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={!canEdit}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                />
              </label>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 220px" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>New version label</div>
                  <input
                    placeholder="Optional"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    disabled={!canEdit}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  />
                </label>
                <label style={{ flex: "2 1 320px" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>New version notes</div>
                  <input
                    placeholder="What changed?"
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    disabled={!canEdit}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  />
                </label>
              </div>

              <label style={{ display: "block", marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>HTML</div>
                <textarea
                  value={draftHtml}
                  onChange={(e) => setDraftHtml(e.target.value)}
                  disabled={!canEdit}
                  style={{
                    width: "100%",
                    minHeight: 420,
                    padding: 8,
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                  }}
                />
              </label>

              {!canEdit && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280" }}>
                  Read-only: Admin/Owner can edit templates.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageCard>
  );
}
