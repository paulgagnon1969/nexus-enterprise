"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CertificationTypeDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  issuingAuthority?: string | null;
  certificateTemplateHtml?: string | null;
}

export default function SystemCertificationsPage() {
  const [types, setTypes] = useState<CertificationTypeDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [previewCertId, setPreviewCertId] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);

  function getTokenOrThrow() {
    const t = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!t) throw new Error("Missing access token. Please login again.");
    return t;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/referrals/system/certification-types`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load certification types (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        const mapped: CertificationTypeDto[] = (json || []).map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          description: c.description ?? null,
          issuingAuthority: c.issuingAuthority ?? null,
          certificateTemplateHtml: c.certificateTemplateHtml ?? null,
        }));
        setTypes(mapped);
        if (mapped.length > 0 && !selectedId) {
          const first = mapped[0];
          setSelectedId(first.id);
          setTemplateHtml(first.certificateTemplateHtml ?? "");
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load certification types.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // When selectedId changes, sync templateHtml from the loaded list
    const current = types.find(t => t.id === selectedId);
    if (current) {
      setTemplateHtml(current.certificateTemplateHtml ?? "");
      setSaveMessage(null);
    }
  }, [selectedId, types]);

  async function handleSave() {
    setSaveMessage(null);
    if (!selectedId) return;

    let token: string;
    try {
      token = getTokenOrThrow();
    } catch (e: any) {
      setSaveMessage(e?.message ?? "Missing access token.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/referrals/system/certification-types/${selectedId}/template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ certificateTemplateHtml: templateHtml }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}) ${text}`);
      }
      setSaveMessage("Template saved.");
      // Update local cache
      setTypes(prev =>
        prev.map(t => (t.id === selectedId ? { ...t, certificateTemplateHtml: templateHtml } : t)),
      );
    } catch (e: any) {
      setSaveMessage(e?.message ?? "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  const current = types.find(t => t.id === selectedId) || null;

  async function handlePreview() {
    setPreviewError(null);
    const id = previewCertId.trim();
    if (!id) {
      setPreviewError("Enter a CandidateCertification ID to preview.");
      return;
    }

    let token: string;
    try {
      token = getTokenOrThrow();
    } catch (e: any) {
      setPreviewError(e?.message ?? "Missing access token.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/referrals/system/certifications/${id}/preview-html`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Preview failed (${res.status}) ${text}`);
      }
      const json: any = await res.json();
      const html: string = json?.html || "";
      if (!html) {
        throw new Error("No HTML returned from preview endpoint.");
      }

      const win = window.open("about:blank", "_blank");
      if (!win) {
        throw new Error("Popup blocked. Allow popups for this site to preview certificates.");
      }

      // Minimal print-friendly wrapper around the returned HTML.
      win.document.open();
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate Preview</title><style>html,body{margin:0;padding:0;}@page{margin:0;}</style></head><body>${html}</body></html>`);
      win.document.close();
      win.focus();
    } catch (e: any) {
      setPreviewError(e?.message ?? "Failed to preview certificate.");
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <header>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 18 }}>Certification templates</h2>
          <p style={{ marginTop: 0, fontSize: 13, color: "#6b7280" }}>
            Manage HTML certificate templates for each certification type. Changes here affect how issued certificates
            are rendered for Nex-Net candidates.
          </p>
        </header>

        {loading && <p style={{ fontSize: 12, color: "#6b7280" }}>Loading certification types…</p>}
        {error && !loading && <p style={{ fontSize: 12, color: "#b91c1c" }}>{error}</p>}

        {!loading && !error && types.length === 0 && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No certification types found.</p>
        )}

        {!loading && !error && types.length > 0 && (
          <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
            {/* Left: type list */}
            <aside
              style={{
                width: 260,
                flexShrink: 0,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                padding: 8,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Certification types</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Select a type to edit its HTML template.
                </div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 360, overflowY: "auto" }}>
                {types.map(t => {
                  const active = t.id === selectedId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 8px",
                          marginBottom: 4,
                          borderRadius: 6,
                          border: active ? "1px solid #0f172a" : "1px solid transparent",
                          background: active ? "#eff6ff" : "transparent",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{t.code}</div>
                        <div style={{ fontSize: 11, color: "#4b5563" }}>{t.name}</div>
                        {t.issuingAuthority && (
                          <div style={{ fontSize: 10, color: "#6b7280" }}>{t.issuingAuthority}</div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Right: HTML editor */}
            <section
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {current ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{current.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                      Code: <code>{current.code}</code>
                      {current.issuingAuthority && <> · Issuing authority: {current.issuingAuthority}</>}
                    </div>
                  </div>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>HTML template</span>
                    <textarea
                      value={templateHtml}
                      onChange={e => setTemplateHtml(e.target.value)}
                      spellCheck={false}
                      style={{
                        flex: 1,
                        minHeight: 300,
                        fontFamily: "monospace",
                        fontSize: 11,
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        resize: "vertical",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      Paste the contents of the NEXUS CERTIFICATE TEMPLATE HTML here. You can use placeholders like
                      <code>{" {{candidate_name}} "}</code>, <code>{" {{cert_name}} "}</code>, etc. Rendering logic
                      will replace them when issuing certificates.
                    </span>
                  </label>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <div style={{ fontWeight: 500 }}>Preview certificate by ID</div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          placeholder="CandidateCertification.id"
                          value={previewCertId}
                          onChange={e => setPreviewCertId(e.target.value)}
                          style={{
                            minWidth: 220,
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 11,
                          }}
                        />
                        <button
                          type="button"
                          onClick={handlePreview}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            backgroundColor: "#ffffff",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Open preview window
                        </button>
                      </div>
                      {previewError && (
                        <span style={{ color: "#b91c1c" }}>{previewError}</span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {saveMessage && (
                        <span
                          style={{
                            alignSelf: "center",
                            fontSize: 11,
                            color: saveMessage.includes("failed") ? "#b91c1c" : "#16a34a",
                          }}
                        >
                          {saveMessage}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "none",
                          backgroundColor: saving ? "#e5e7eb" : "#2563eb",
                          color: saving ? "#4b5563" : "#f9fafb",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: saving ? "default" : "pointer",
                        }}
                      >
                        {saving ? "Saving…" : "Save template"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "#6b7280" }}>Select a certification type to edit its template.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </PageCard>
  );
}
