"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SystemDocModuleEntry {
  id: string;
  title: string;
  file?: string;
}

interface SystemDocDetail {
  id: string;
  title: string;
  content: string;
}

export default function SystemDocsPage() {
  const [modules, setModules] = useState<SystemDocModuleEntry[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [modulesError, setModulesError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doc, setDoc] = useState<SystemDocDetail | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    async function loadModules() {
      setLoadingModules(true);
      setModulesError(null);

      const token =
        typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
      if (!token) {
        setModulesError("Missing access token. Please log in again as a Nexus System admin.");
        setLoadingModules(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/system-docs/modules`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load modules (${res.status}) ${text}`);
        }

        const json = (await res.json()) as SystemDocModuleEntry[];
        setModules(json);
        if (json.length && !selectedId) {
          setSelectedId(json[0].id);
        }
      } catch (err: any) {
        setModulesError(err?.message ?? "Failed to load Nexus System docs modules.");
      } finally {
        setLoadingModules(false);
      }
    }

    void loadModules();
  }, [selectedId]);

  useEffect(() => {
    async function loadDoc(id: string) {
      setDocLoading(true);
      setDocError(null);

      const token =
        typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
      if (!token) {
        setDocError("Missing access token. Please log in again as a Nexus System admin.");
        setDocLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/system-docs/modules/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load document (${res.status}) ${text}`);
        }

        const json = (await res.json()) as SystemDocDetail;
        setDoc(json);
      } catch (err: any) {
        setDocError(err?.message ?? "Failed to load module document.");
      } finally {
        setDocLoading(false);
      }
    }

    if (selectedId) {
      void loadDoc(selectedId);
    }
  }, [selectedId]);

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "stretch",
        minHeight: "calc(100vh - 120px)",
        fontSize: 13,
      }}
    >
      {/* Left: module list */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRadius: 6,
          background: "#ffffff",
          border: "1px solid #0f172a",
          padding: 8,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Nexus System Docs</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Internal modules – SUPER_ADMIN / Support only
          </div>
        </div>

        {loadingModules ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading modules…</div>
        ) : modulesError ? (
          <div style={{ fontSize: 12, color: "#b91c1c" }}>{modulesError}</div>
        ) : modules.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>No modules registered yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {modules.map((m) => {
              const active = selectedId === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 8px",
                      marginBottom: 4,
                      borderRadius: 4,
                      border: "1px solid #e5e7eb",
                      backgroundColor: active ? "#0f172a" : "#ffffff",
                      color: active ? "#f9fafb" : "#111827",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {m.title || m.id}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* Right: document view */}
      <section
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          padding: 12,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {docLoading && <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading document…</div>}
        {docError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{docError}</div>}

        {!docLoading && !docError && doc && (
          <div style={{ overflow: "auto", maxHeight: "calc(100vh - 140px)" }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 0 }}>{doc.title}</h1>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 12,
              }}
            >
              {doc.content}
            </pre>
          </div>
        )}

        {!docLoading && !docError && !doc && (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Select a module on the left to view its Nexus System journal.
          </div>
        )}
      </section>
    </div>
  );
}
