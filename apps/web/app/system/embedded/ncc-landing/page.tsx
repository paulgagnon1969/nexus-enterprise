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
  // Optional secondary image used today by the worker apply page for an
  // additional GIF/banner.
  secondaryLogoUrl?: string | null;
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

  // Worker registration link sharing helpers
  const [shareEmail, setShareEmail] = useState("");
  const [sharePhone, setSharePhone] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [workerApplyUrl, setWorkerApplyUrl] = useState<string>("/apply");

  // Build a non-null payload for the API so config actually persists.
  const buildLandingPayload = () => {
    const coerce = (c: LandingConfigDto | null | undefined): LandingConfigDto => ({
      logoUrl: c?.logoUrl ?? null,
      headline: c?.headline ?? null,
      subheadline: c?.subheadline ?? null,
      secondaryLogoUrl: c?.secondaryLogoUrl ?? null,
    });

    return {
      login: coerce(loginConfig),
      worker: coerce(workerConfig),
    };
  };

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

  const resolvedWorkerSecondaryLogoUrl = workerConfig.secondaryLogoUrl
    ? workerConfig.secondaryLogoUrl.startsWith("/uploads/")
      ? `${API_BASE}${workerConfig.secondaryLogoUrl}`
      : workerConfig.secondaryLogoUrl
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWorkerApplyUrl(`${window.location.origin}/apply`);
  }, []);

  async function copyWorkerApplyUrl() {
    const text = workerApplyUrl || "/apply";

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.top = "-1000px";
        el.style.left = "-1000px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }

      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  }

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

        if (!meJson || meJson.globalRole !== "SUPER_ADMIN") {
          setError("Only Nexus Superusers can edit system landing configuration.");
          return;
        }

        // Load system landing configuration (Nexus System only).
        const cfgRes = await fetch(`${API_BASE}/companies/system-landing-config`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cfgRes.ok) {
          const json: LandingConfigEnvelope = await cfgRes.json();
          setLoginConfig(json.login ?? {});
          setWorkerConfig(json.worker ?? {});
        } else if (cfgRes.status !== 404) {
          const text = await cfgRes.text().catch(() => "");
          throw new Error(text || `Failed to load landing configuration (${cfgRes.status})`);
        }

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
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
        Control the global branding for the Nexus system login and worker registration pages.
        Only Nexus Superusers can edit this configuration.
      </p>

      {/* Worker registration link sender (email / SMS helper) */}
      <section
        aria-label="Send worker registration link"
        style={{
          marginBottom: 20,
          padding: 10,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontSize: 12,
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Send worker registration link</div>
          <p style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}>
            Use this to send the public worker registration / applicant pool entry page to someone
            by email or text. The link below goes to <code>/apply</code>.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Registration URL</div>
            <div
              style={{
                marginTop: 2,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
              }}
            >
              {workerApplyUrl}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void copyWorkerApplyUrl()}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Copy link
          </button>

          {copyState === "copied" && (
            <span style={{ fontSize: 11, color: "#16a34a" }}>Copied</span>
          )}
          {copyState === "error" && (
            <span style={{ fontSize: 11, color: "#b91c1c" }}>Copy failed</span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
            <span>Email (optional)</span>
            <input
              type="email"
              value={shareEmail}
              onChange={e => setShareEmail(e.target.value)}
              placeholder="worker@example.com"
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <button
            type="button"
            disabled={!shareEmail}
            onClick={() => {
              if (!shareEmail || typeof window === "undefined") return;
              const subject = encodeURIComponent("Nexus worker registration link");
              const body = encodeURIComponent(
                `Hi,%0D%0A%0D%0AUse this link to start worker registration:%0D%0A${workerApplyUrl}%0D%0A%0D%0AThanks,%0D%0A`,
              );
              const href = `mailto:${encodeURIComponent(shareEmail)}?subject=${subject}&body=${body}`;
              window.location.href = href;
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              background: !shareEmail ? "#e5e7eb" : "#0f172a",
              color: !shareEmail ? "#4b5563" : "#f9fafb",
              fontSize: 12,
              cursor: !shareEmail ? "default" : "pointer",
            }}
          >
            Open email draft
          </button>

          <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 160 }}>
            <span>Mobile (optional)</span>
            <input
              type="tel"
              value={sharePhone}
              onChange={e => setSharePhone(e.target.value)}
              placeholder="555-123-4567"
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <button
            type="button"
            disabled={!sharePhone}
            onClick={() => {
              if (!sharePhone || typeof window === "undefined") return;
              const body = encodeURIComponent(
                `Use this link to start worker registration: ${workerApplyUrl}`,
              );
              const href = `sms:${encodeURIComponent(sharePhone)}?&body=${body}`;
              window.location.href = href;
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              background: !sharePhone ? "#e5e7eb" : "#0f172a",
              color: !sharePhone ? "#4b5563" : "#f9fafb",
              fontSize: 12,
              cursor: !sharePhone ? "default" : "pointer",
            }}
          >
            Open SMS draft
          </button>
        </div>
      </section>

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
                  const res = await fetch(`${API_BASE}/companies/system-landing-config`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(buildLandingPayload()),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || `Failed to save landing configuration (${res.status})`);
                  }
                  // Keep local state as the source of truth; server echoes can be ignored for now.
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

      <section id="worker-registration">
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
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Primary image / logo</span>
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
                  placeholder="https://example.com/primary.gif"
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
                      setSaveMessage("Primary worker image uploaded.");
                    } catch (e: any) {
                      setError(e?.message ?? "Failed to upload primary worker image.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  style={{ fontSize: 11 }}
                />
              </div>
            </label>

            <label style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                Secondary image / GIF (worker page only)
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={workerConfig.secondaryLogoUrl || ""}
                  onChange={e => setWorkerConfig(c => ({ ...c, secondaryLogoUrl: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                  placeholder="https://example.com/secondary.gif"
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
                        throw new Error(text || `Failed to upload secondary image (${res.status})`);
                      }
                      const json: { url?: string } = await res.json();
                      if (json.url) {
                        setWorkerConfig(c => ({ ...c, secondaryLogoUrl: json.url || c.secondaryLogoUrl }));
                      }
                      setSaveMessage("Secondary worker image uploaded.");
                    } catch (e: any) {
                      setError(e?.message ?? "Failed to upload secondary worker image.");
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
                    body: JSON.stringify(buildLandingPayload()),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || `Failed to save landing configuration (${res.status})`);
                  }
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
                  alt="Worker registration primary image preview"
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
                  <span style={{ color: "#9ca3af" }}>Primary image preview</span>
                </div>
              )}

              {resolvedWorkerSecondaryLogoUrl && (
                <img
                  src={resolvedWorkerSecondaryLogoUrl}
                  alt="Worker registration secondary image preview"
                  style={{ maxWidth: "60%", height: "auto", marginBottom: 8 }}
                />
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
