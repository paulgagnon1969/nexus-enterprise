"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PublicOnboardingForm from "../onboarding/public-onboarding-form";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function ApplyPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>NEXUS Contractor-Connect</h1>
          <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
        </main>
      }
    >
      <ApplyPageInner />
    </Suspense>
  );
}

function ApplyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
 
  const token = searchParams.get("token") || "";
  const referralToken = searchParams.get("referralToken") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [referrerEmail, setReferrerEmail] = useState<string | null>(null);

  const [brandingHeadline, setBrandingHeadline] = useState<string | null>(null);
  const [brandingSubheadline, setBrandingSubheadline] = useState<string | null>(null);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [brandingSecondaryLogoUrl, setBrandingSecondaryLogoUrl] = useState<string | null>(null);

  // Load global branding for the Nexus Contractor-Connect worker registration
  // landing page. This is driven by the Nexus System landing configuration,
  // not per-tenant.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/companies/system-landing-config-public`);
        if (!res.ok) return;

        const json: {
          worker?: {
            headline?: string | null;
            subheadline?: string | null;
            logoUrl?: string | null;
            secondaryLogoUrl?: string | null;
          } | null;
        } = await res.json();
        const worker = json.worker ?? null;
        if (worker) {
          setBrandingHeadline(worker.headline ?? null);
          setBrandingSubheadline(worker.subheadline ?? null);
          if (worker.logoUrl) {
            const url = worker.logoUrl.startsWith("/uploads/")
              ? `${API_BASE}${worker.logoUrl}`
              : worker.logoUrl;
            setBrandingLogoUrl(url);
          }
          if (worker.secondaryLogoUrl) {
            const secondaryUrl = worker.secondaryLogoUrl.startsWith("/uploads/")
              ? `${API_BASE}${worker.secondaryLogoUrl}`
              : worker.secondaryLogoUrl;
            setBrandingSecondaryLogoUrl(secondaryUrl);
          }
        }
      } catch {
        // ignore branding failures; keep default look
      }
    })();
  }, []);

  // If this apply flow was launched from a referral link, look up the referrer
  // so we can show "You were referred by ..." on the page.
  useEffect(() => {
    if (!referralToken) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/referrals/lookup/${encodeURIComponent(referralToken)}`);
        if (!res.ok) return;
        const json: any = await res.json();
        const r = json?.referrer ?? null;
        if (r) {
          const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || null;
          setReferrerName(name);
          setReferrerEmail(r.email ?? null);
        }
      } catch {
        // Non-fatal; we simply skip showing referrer info.
      }
    })();
  }, [referralToken]);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (!password || password.length < 8) return false;
    if (password !== passwordConfirm) return false;
    return true;
  }, [email, password, passwordConfirm]);

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/onboarding/start-public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          referralToken: referralToken || undefined,
        }),
      });

      // If this email is already registered, treat the form as a normal login
      // attempt so the candidate can flow straight into their portfolio without
      // needing to visit /login manually.
      if (res.status === 409) {
        try {
          const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), password }),
          });

          if (!loginRes.ok) {
            setError(
              "An account with this email already exists, but the password did not match. Please use /login or reset your password.",
            );
            return;
          }

          const data = await loginRes.json();
          if (typeof window !== "undefined") {
            window.localStorage.setItem("accessToken", data.accessToken);
            window.localStorage.setItem("refreshToken", data.refreshToken);
            if (data.company?.id) {
              window.localStorage.setItem("companyId", data.company.id);
            }

            // Fetch user context so navigation behaves consistently with /login.
            try {
              const meRes = await fetch(`${API_BASE}/users/me`, {
                headers: { Authorization: `Bearer ${data.accessToken}` },
              });
              const me = meRes.ok ? await meRes.json() : null;

              if (me) {
                if (me.globalRole) {
                  window.localStorage.setItem("globalRole", me.globalRole);
                }
                if (me.userType) {
                  window.localStorage.setItem("userType", me.userType);
                }
              }

              if (me?.userType === "APPLICANT") {
                router.push("/settings/profile");
              } else if (me?.globalRole === "SUPER_ADMIN") {
                router.push("/system");
              } else {
                router.push("/projects");
              }
            } catch {
              // Fallback: send to main projects workspace if we cannot read /users/me.
              router.push("/projects");
            }
          }

          return;
        } finally {
          setSubmitting(false);
        }
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to start application (${res.status})`);
      }

      const json = await res.json();
      const nextToken = json?.token;
      if (!nextToken) {
        throw new Error("API did not return a token.");
      }

      // Remember credentials in sessionStorage so we can auto-login after the
      // Nexis profile form is submitted and take the candidate straight into
      // their portal.
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("nexisApplyEmail", email.trim());
          window.sessionStorage.setItem("nexisApplyPassword", password);
        }
      } catch {
        // best-effort only
      }

      router.replace(`/apply?token=${encodeURIComponent(nextToken)}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start application.");
    } finally {
      setSubmitting(false);
    }
  }

  if (token) {
    return <PublicOnboardingForm token={token} />;
  }

  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: 720,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <img
        src="/nexus-deconstruct-hires.gif"
        alt="NEXUS DECONSTRUCT HIRES"
        style={{ width: 360, maxWidth: "100%", height: "auto", display: "block" }}
      />

      <h1 style={{ marginTop: 16, textAlign: "center" }}>
        {brandingHeadline || "NEXUS Contractor-Connect"}
      </h1>

      {brandingSubheadline && (
        <p style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: "#6b7280" }}>
          {brandingSubheadline}
        </p>
      )}

      {brandingLogoUrl ? (
        <img
          src={brandingLogoUrl}
          alt="Worker registration primary image"
          style={{
            width: 520,
            maxWidth: "100%",
            height: "auto",
            display: "block",
            marginTop: 12,
          }}
        />
      ) : (
        <img
          src="/contractor-connect.gif"
          alt="Contractor-Connect"
          style={{
            width: 520,
            maxWidth: "100%",
            height: "auto",
            display: "block",
            marginTop: 12,
          }}
        />
      )}

        {referrerName || referrerEmail ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            fontSize: 13,
            color: "#374151",
            width: "100%",
            maxWidth: 520,
          }}
        >
          <strong>You were referred to Nexis</strong>
          <div style={{ marginTop: 4 }}>
            by {referrerName ? (
              <>
                {referrerName}
                {referrerEmail && (
                  <>
                    {" ("}
                    <a
                      href={`mailto:${referrerEmail}`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {referrerEmail}
                    </a>
                    {")"}
                  </>
                )}
              </>
            ) : referrerEmail ? (
              <a
                href={`mailto:${referrerEmail}`}
                style={{ color: "#2563eb", textDecoration: "none" }}
              >
                {referrerEmail}
              </a>
            ) : (
              "someone"
            )}
            .
          </div>
        </div>
      ) : null}

      <form onSubmit={start} style={{ marginTop: 16, width: "100%", maxWidth: 520 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 14, width: "100%", textAlign: "left" }} htmlFor="apply-email">
            Email
            <input
              id="apply-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
              required
            />
          </label>

          <label style={{ fontSize: 14, width: "100%", textAlign: "left" }} htmlFor="apply-password">
            Password (min 8 characters)
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                id="apply-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 34px 8px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
                required
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

          <label style={{ fontSize: 14, width: "100%", textAlign: "left" }} htmlFor="apply-confirm-password">
            Confirm password
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                id="apply-confirm-password"
                name="confirmPassword"
                type={showPasswordConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 34px 8px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPasswordConfirm(v => !v)}
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
                aria-label={showPasswordConfirm ? "Hide password" : "Show password"}
              >
                {showPasswordConfirm ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            style={{
              marginTop: 8,
              padding: "10px 14px",
              borderRadius: 6,
              border: "none",
              backgroundColor: submitting || !canSubmit ? "#e5e7eb" : "#2563eb",
              color: submitting || !canSubmit ? "#4b5563" : "#f9fafb",
              fontSize: 14,
              cursor: submitting || !canSubmit ? "default" : "pointer",
              width: "100%",
            }}
          >
            {submitting ? "Startingeee" : "Start application"}
          </button>

          {error && (
            <p style={{ marginTop: 8, fontSize: 13, color: "#b91c1c", textAlign: "center" }}>{error}</p>
          )}
        </div>
      </form>

      <div style={{ marginTop: 18, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
        Already a member of the Network? Log in at <a href="/login">/login</a>.
      </div>

      {brandingSecondaryLogoUrl && (
        <img
          src={brandingSecondaryLogoUrl}
          alt="Worker registration secondary image"
          style={{
            width: 520,
            maxWidth: "100%",
            height: "auto",
            display: "block",
            marginTop: 12,
          }}
        />
      )}
    </main>
  );
}
