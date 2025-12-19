"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface TemplateDetail {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  currentVersion?: {
    id: string;
    versionNo: number;
    dayKey: string;
    modules: { id: string; moduleCode: string; enabled: boolean }[];
    articles: { id: string; slug: string; title: string; active: boolean }[];
    roleProfiles: {
      id: string;
      code: string;
      label: string;
      active: boolean;
      permissions: { id: string; resourceCode: string }[];
    }[];
  } | null;
}

export default function SystemTemplateDetailPage({ params }: { params: { id: string } }) {
  const templateId = params.id;

  const [tpl, setTpl] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/admin/templates/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load template (${res.status}) ${text}`);
        }
        const json = await res.json();
        setTpl(json);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load template");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [templateId]);

  return (
    <PageCard>
      {loading ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
      ) : !tpl ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>Not found.</div>
      ) : (
        <>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            Template: {tpl.label} ({tpl.code})
          </h2>
          {tpl.description && (
            <p style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>{tpl.description}</p>
          )}

          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
            Current version:{" "}
            {tpl.currentVersion?.versionNo
              ? `v${tpl.currentVersion.versionNo} (${tpl.currentVersion.dayKey})`
              : "—"}
          </div>

          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

          <h3 style={{ fontSize: 14, margin: 0 }}>Modules</h3>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(tpl.currentVersion?.modules ?? []).map(m => (
              <span
                key={m.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 12,
                  background: m.enabled ? "#dcfce7" : "#fee2e2",
                  borderColor: m.enabled ? "#16a34a" : "#b91c1c",
                  color: m.enabled ? "#166534" : "#991b1b",
                }}
              >
                {m.moduleCode}: {m.enabled ? "enabled" : "disabled"}
              </span>
            ))}
            {(tpl.currentVersion?.modules ?? []).length === 0 && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>No modules (run sync).</span>
            )}
          </div>

          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

          <h3 style={{ fontSize: 14, margin: 0 }}>Admin articles</h3>
          <div style={{ marginTop: 8 }}>
            {(tpl.currentVersion?.articles ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>No articles yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                {(tpl.currentVersion?.articles ?? []).map(a => (
                  <li key={a.id}>
                    <strong>{a.title}</strong> ({a.slug}){a.active ? "" : " — inactive"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

          <h3 style={{ fontSize: 14, margin: 0 }}>Role profiles</h3>
          <div style={{ marginTop: 8 }}>
            {(tpl.currentVersion?.roleProfiles ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>No role profiles (run sync).</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Code</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Label</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {(tpl.currentVersion?.roleProfiles ?? []).map(rp => (
                    <tr key={rp.id}>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                        {rp.code}
                      </td>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                        {rp.label}
                      </td>
                      <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                        {rp.permissions?.length ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </PageCard>
  );
}
