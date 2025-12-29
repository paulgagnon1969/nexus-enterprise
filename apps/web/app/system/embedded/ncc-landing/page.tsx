"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface MeDto {
  id: string;
  email: string;
  globalRole?: string;
  memberships?: {
    companyId: string;
    role: string;
  }[];
}

interface CompanyMeDto {
  id: string;
  name: string;
  kind?: string; // SYSTEM vs ORGANIZATION
}

// Minimal shape of a future landing config. We can extend this gradually.
interface LandingConfigDto {
  logoUrl?: string | null;
  headline?: string | null;
  subheadline?: string | null;
}

interface LandingConfigEnvelope {
  login?: LandingConfigDto | null;
  worker?: LandingConfigDto | null;
}

export default function NccLandingEditorPage() {
  const [me, setMe] = useState<MeDto | null>(null);
  const [company, setCompany] = useState<CompanyMeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loginConfig, setLoginConfig] = useState<LandingConfigDto>({});
  const [workerConfig, setWorkerConfig] = useState<LandingConfigDto>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const resolvedLoginLogoUrl = loginConfig.logoUrl
    ? loginConfig.logoUrl.startsWith("/uploads/")
      ? `${API_BASE}${loginConfig.logoUrl}`
      : loginConfig.logoUrl
    : null;

  const resolvedWorkerLogoUrl = workerConfig.logoUrl
    ? workerConfig.logoUrl.startsWith("/uploads/")
      ? `${API_BASE}${workerConfig.logoUrl}`
      : workerConfig.logoUrl
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [meRes, companyRes] = await Promise.all([
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/companies/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const meJson: MeDto | null = meRes.ok ? await meRes.json() : null;
        const companyJson: CompanyMeDto | null = companyRes.ok ? await companyRes.json() : null;

        setMe(meJson);
        setCompany(companyJson);

        if (!meJson || !companyJson) {
          setError("Unable to load user or company context.");
          return;
        }

        const isSuperAdmin = meJson.globalRole === "SUPER_ADMIN";
        const isOrgAdminOrOwner = (meJson.memberships || []).some(m =>
          m.companyId === companyJson.id && (m.role === "OWNER" || m.role === "ADMIN"),
        );

        if (!isSuperAdmin && !isOrgAdminOrOwner) {
          setError("You do not have permission to edit landing content for this organization.");
          return;
        }

        // Load any existing landing configuration for this company.
        const cfgRes = await fetch(`${API_BASE}/companies/me/landing-config`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cfgRes.ok) {
          const json: LandingConfigEnvelope = await cfgRes.json();
          setLoginConfig(json.login ?? {});
          setWorkerConfig(json.worker ?? {});
        } else if (cfgRes.status !== 404) {
          // 404 means no config yet; treat as empty. Other failures surface as an error.
          const text = await cfgRes.text().catch(() => "");
          throw new Error(text || `Failed to load landing configuration (${cfgRes.status})`);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load editor context.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const isSuperAdmin = me?.globalRole === "SUPER_ADMIN";

  if (loading) {
    return (
      <main style={{ padding: 16 }}>
        <h1 style={{ marginTop: 0, fontSize: 18 }}>NCC landing configuration</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>Loading editor…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: 16 }}>
        <h1 style={{ marginTop: 0, fontSize: 18 }}>NCC landing configuration</h1>
        <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 960 }}>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>NCC landing configuration</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Control the branding for the Nexus system login and worker registration pages. Changes
        apply to the current organization. NEXUS Superusers can override settings for any tenant.
      </p>

      {company && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontSize: 12,
          }}
        >
          <div>
            <strong>Organization:</strong> {company.name} ({company.id})
          </div>
          <div style={{ color: "#6b7280" }}>
            Kind: {company.kind || "ORGANIZATION"}
          </div>
          {isSuperAdmin && (
            <div style={{ marginTop: 4, color: "#0f172a" }}>
              You are a NEXUS Superuser and can edit landing content for this tenant.
            </div>
          )}
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>System login landing</h2>
        {saveMessage && (
          <p style={{ fontSize: 12, color: "#16a34a", marginBottom: 8 }}>{saveMessage}</p>
        )}
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          This controls the visuals around the main Nexus login experience (username + password
          stay the same). Use this for global Nexus branding and per-tenant overlays.
        </p>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Headline</span>
              <input
                type="text"
                value={loginConfig.headline || ""}
                onChange={e => setLoginConfig(c => ({ ...c, headline: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                }}
                placeholder="e.g. Nexus Contractor-Connect"
              />
            </label>

            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Subheadline</span>
              <input
                type="text"
                value={loginConfig.subheadline || ""}
                onChange={e => setLoginConfig(c => ({ ...c, subheadline: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                }}
                placeholder="Short supporting copy for the login page"
              />
            </label>

            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Logo</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={loginConfig.logoUrl || ""}
                  onChange={e => setLoginConfig(c => ({ ...c, logoUrl: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                  placeholder="https://example.com/logo.png"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (typeof window === "undefined") return;
                    const token = window.localStorage.getItem("accessToken");
                    if (!token) {
                      setError("Missing access token. Please login again.");
                      return;
                    }
                    try {
                      setSaving(true);
                      setSaveMessage(null);
                      const form = new FormData();
                      form.append("file", file);
                      const res = await fetch(`${API_BASE}/companies/me/logo`, {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                        },
                        body: form,
                      });
                      if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        throw new Error(text || `Failed to upload logo (${res.status})`);
                      }
                      const json: { url?: string } = await res.json();
                      if (json.url) {
                        setLoginConfig(c => ({ ...c, logoUrl: json.url || c.logoUrl }));
                      }
                      setSaveMessage("Logo uploaded.");
                    } catch (e: any) {
                      setError(e?.message ?? "Failed to upload logo.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  style={{ fontSize: 11 }}
                />
              </div>
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (typeof window === "undefined") return;
                const token = window.localStorage.getItem("accessToken");
                if (!token) {
                  setError("Missing access token. Please login again.");
                  return;
                }
                try {
                  setSaving(true);
                  setSaveMessage(null);
                  const res = await fetch(`${API_BASE}/companies/me/landing-config`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ login: loginConfig, worker: workerConfig }),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || `Failed to save landing configuration (${res.status})`);
                  }
                  const json: LandingConfigEnvelope = await res.json();
                  setLoginConfig(json.login ?? {});
                  setWorkerConfig(json.worker ?? {});
                  setSaveMessage("Landing configuration saved.");
                } catch (e: any) {
                  setError(e?.message ?? "Failed to save landing configuration.");
                } finally {
                  setSaving(false);
                }
              }}
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                backgroundColor: saving ? "#e5e7eb" : "#2563eb",
                color: saving ? "#4b5563" : "#f9fafb",
                fontSize: 12,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save branding"}
            </button>
          </div>

          {/* Simple preview scaffold */}
          <div
            style={{
              flex: 1,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              padding: 12,
              background: "#ffffff",
              fontSize: 12,
            }}
          >
            <div style={{ marginBottom: 8, color: "#6b7280" }}>Login preview (read-only)</div>
            <div
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: 12,
                textAlign: "center",
              }}
            >
              {resolvedLoginLogoUrl ? (
                <img
                  src={resolvedLoginLogoUrl}
                  alt="Login logo preview"
                  style={{ maxWidth: "60%", height: "auto", marginBottom: 8 }}
                />
              ) : (
                <div
                  style={{
                    height: 60,
                    borderRadius: 4,
                    border: "1px dashed #d1d5db",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: "#9ca3af" }}>Logo preview</span>
                </div>
              )}

              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {loginConfig.headline || "NEXUS Contractor-Connect"}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {loginConfig.subheadline || "Sign in with your Nexus account"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Worker registration landing</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          This controls the branding for the public worker registration / applicant pool entry
          page. The underlying form and workflow stay the same.
        </p>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Headline</span>
              <input
                type="text"
                value={workerConfig.headline || ""}
                onChange={e => setWorkerConfig(c => ({ ...c, headline: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                }}
                placeholder="e.g. Join the Acme Restoration network"
              />
            </label>

            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Subheadline</span>
              <input
                type="text"
                value={workerConfig.subheadline || ""}
                onChange={e => setWorkerConfig(c => ({ ...c, subheadline: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                }}
                placeholder="Short supporting copy for the worker registration page"
              />
            </label>

            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Logo</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={workerConfig.logoUrl || ""}
                  onChange={e => setWorkerConfig(c => ({ ...c, logoUrl: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                  placeholder="https://example.com/logo.png"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (typeof window === "undefined") return;
                    const token = window.localStorage.getItem("accessToken");
                    if (!token) {
                      setError("Missing access token. Please login again.");
                      return;
                    }
                    try {
                      setSaving(true);
                      setSaveMessage(null);
                      const form = new FormData();
                      form.append("file", file);
                      const res = await fetch(`${API_BASE}/companies/me/logo`, {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                        },
                        body: form,
                      });
                      if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        throw new Error(text || `Failed to upload logo (${res.status})`);
                      }
                      const json: { url?: string } = await res.json();
                      if (json.url) {
                        setWorkerConfig(c => ({ ...c, logoUrl: json.url || c.logoUrl }));
                      }
                      setSaveMessage("Logo uploaded.");
                    } catch (e: any) {
                      setError(e?.message ?? "Failed to upload logo.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  style={{ fontSize: 11 }}
                />
              </div>
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (typeof window === "undefined") return;
                const token = window.localStorage.getItem("accessToken");
                if (!token) {
                  setError("Missing access token. Please login again.");
                  return;
                }
                try {
                  setSaving(true);
                  setSaveMessage(null);
                  const res = await fetch(`${API_BASE}/companies/me/landing-config`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ login: loginConfig, worker: workerConfig }),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || `Failed to save landing configuration (${res.status})`);
                  }
                  const json: LandingConfigEnvelope = await res.json();
                  setLoginConfig(json.login ?? {});
                  setWorkerConfig(json.worker ?? {});
                  setSaveMessage("Landing configuration saved.");
                } catch (e: any) {
                  setError(e?.message ?? "Failed to save landing configuration.");
                } finally {
                  setSaving(false);
                }
              }}
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                backgroundColor: saving ? "#e5e7eb" : "#2563eb",
                color: saving ? "#4b5563" : "#f9fafb",
                fontSize: 12,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save branding"}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              padding: 12,
              background: "#ffffff",
              fontSize: 12,
            }}
          >
            <div style={{ marginBottom: 8, color: "#6b7280" }}>
              Worker registration preview (read-only)
            </div>
            <div
              style={{
                borderRadius: 6,
                border: "1px solid #d1d5db",
                padding: 12,
                textAlign: "center",
              }}
            >
              {resolvedWorkerLogoUrl ? (
                <img
                  src={resolvedWorkerLogoUrl}
                  alt="Worker registration logo preview"
                  style={{ maxWidth: "60%", height: "auto", marginBottom: 8 }}
                />
              ) : (
                <div
                  style={{
                    height: 60,
                    borderRadius: 4,
                    border: "1px dashed #d1d5db",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: "#9ca3af" }}>Logo preview</span>
                </div>
              )}

              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {workerConfig.headline || "Nexus Contractor-Connect"}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {workerConfig.subheadline || "Apply to join Nexus Assets and People"}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
