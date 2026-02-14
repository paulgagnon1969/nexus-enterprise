"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpIcon } from "../components/help-icon";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://ncc-nexus-contractor-connect.com";

// Hard-coded IDs for Nexus System and Nexus Fortified Structures tenants.
const NEXUS_SYSTEM_COMPANY_ID = "cmjr7o4zs000101s6z1rt1ssz";
const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [brandingHeadline, setBrandingHeadline] = useState<string | null>(null);
  const [brandingSubheadline, setBrandingSubheadline] = useState<string | null>(null);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [brandingLogoFailed, setBrandingLogoFailed] = useState(false);

  // Load global branding for the Nexus Contractor-Connect login screen.
  // This is driven by the Nexus System landing configuration, not per-tenant.
  useEffect(() => {
    // Pre-fill email from query string if present (e.g. redirected from /apply).
    try {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search || "");
        const emailFromQuery = params.get("email");
        if (emailFromQuery) {
          setEmail(emailFromQuery);
        }
      }
    } catch {
      // ignore
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/companies/system-landing-config-public`);
        if (!res.ok) return;

        const json: {
          login?: { headline?: string | null; subheadline?: string | null; logoUrl?: string | null } | null;
        } = await res.json();
        const login = json.login ?? null;
        if (login) {
          setBrandingHeadline(login.headline ?? null);
          setBrandingSubheadline(login.subheadline ?? null);
          if (login.logoUrl) {
            const url = login.logoUrl.startsWith("/uploads/")
              ? `${API_BASE}${login.logoUrl}`
              : login.logoUrl;
            setBrandingLogoUrl(url);
          }
        }
      } catch {
        // ignore branding failures; keep default look
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        setError("Login failed");
        return;
      }

      const data = await res.json();
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("companyId", data.company.id);

      // Notify other components (e.g. UserMenu) that auth state changed.
      window.dispatchEvent(new Event("nexus-auth-change"));

      // Route by user context:
      // - APPLICANT: candidate portal
      // - SUPER_ADMIN: Nexus System
      // - everyone else: project workspace
      try {
        const meRes = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        const me = meRes.ok ? await meRes.json() : null;

        if (me) {
          if (me.globalRole) {
            localStorage.setItem("globalRole", me.globalRole);
          }
          if (me.userType) {
            localStorage.setItem("userType", me.userType);
          }

          // For admins and above in the Nexus System tenant, default their
          // preferred organization to Nexus Fortified Structures on first login.
          try {
            const memberships = Array.isArray((me as any).memberships)
              ? (me as any).memberships
              : [];
            const isNexusSystemAdminOrAbove = memberships.some(
              (m: any) =>
                m?.companyId === NEXUS_SYSTEM_COMPANY_ID &&
                (m?.role === "OWNER" || m?.role === "ADMIN"),
            );
            const hasLastCompany = !!localStorage.getItem("lastCompanyId");
            if (isNexusSystemAdminOrAbove && !hasLastCompany) {
              localStorage.setItem("lastCompanyId", FORTIFIED_COMPANY_ID);
            }
          } catch {
            // best-effort only
          }
        }

        if (me?.globalRole === "SUPER_ADMIN") {
          router.push("/system");
        } else if (me?.userType === "APPLICANT") {
          router.push("/settings/profile");
        } else {
          router.push("/projects");
        }
      } catch {
        router.push("/projects");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "32px",
      }}
    >
      <div className="app-card" style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {brandingLogoUrl && !brandingLogoFailed ? (
            <img
              src={brandingLogoUrl}
              alt="Login branding logo"
              onError={() => setBrandingLogoFailed(true)}
              style={{ maxWidth: "260px", width: "100%", height: "auto" }}
            />
          ) : (
            <img
              src="/ncc-login.gif"
              alt="Nexus Contractor Connect login animation"
              style={{ maxWidth: "260px", width: "100%", height: "auto" }}
            />
          )}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: 16, fontSize: 24 }}>
          {brandingHeadline || "Sign in"}
        </h1>
        <p style={{ marginTop: 0, marginBottom: 24, color: "#6b7280", fontSize: 14 }}>
          {brandingSubheadline || "Use your Nexus Enterprise account to continue."}
        </p>
        <form
          onSubmit={onSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label style={{ fontSize: 14 }}>
            <span style={{ display: "block", marginBottom: 4 }}>Email</span>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14
              }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            <span style={{ display: "block", marginBottom: 4 }}>Password</span>
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 34px 8px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#6b7280",
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {error && (
            <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "#2563eb",
              color: "white",
              fontWeight: 500,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.8 : 1
            }}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: 12, fontSize: 12, display: "flex", gap: 16, alignItems: "center" }}>
          <a href="/reset-password" style={{ color: "#2563eb", textDecoration: "none" }}>
            Forgot password?
          </a>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <a href="/apply" style={{ color: "#2563eb", textDecoration: "none" }}>
              Self Register
            </a>
            <HelpIcon featureId="self-registration" tooltip="Learn about self-registration" />
          </span>
        </div>

        <p
          style={{
            marginTop: 16,
            marginBottom: 0,
            fontSize: 12,
            color: "#6b7280",
          }}
        >
          If you&apos;ve been logged out unexpectedly, your security token has
          expired. Simply sign in again to get a fresh, secure session.
        </p>

        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 11,
            color: "#16a34a",
          }}
        >
          Deployment pipeline check: if you can see this message on Vercel,
          the Nexus web + GitHub workflow is deploying correctly.
        </p>

        {process.env.NODE_ENV === "development" && (
          <div
            style={{
              marginTop: 24,
              padding: 12,
              borderRadius: 6,
              background: "#020617",
              border: "1px solid #f97316",
              color: "#f9fafb",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Dev server reset helper
            </div>
            <p style={{ marginTop: 0, marginBottom: 8 }}>
              If you see connection errors to <code>localhost:8000</code> or
              <code> localhost:3000</code>, reset the dev servers from your
              terminal, then refresh this page and sign in again.
            </p>
            <p style={{ marginTop: 0, marginBottom: 8, opacity: 0.85 }}>
              This helper is for developers only; if everything is working,
              you can safely ignore it.
            </p>
            <pre
              style={{
                margin: 0,
                padding: 8,
                borderRadius: 4,
                background: "#0f172a",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                overflowX: "auto",
              }}
            >
              cd /Users/pg/nexus-enterprise
{"\n"}npm run dev:clean
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
