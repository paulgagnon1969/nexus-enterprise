"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function ClientOrgOnboardingPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Organization Setup</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>
        </main>
      }
    >
      <ClientOrgOnboardingInner />
    </Suspense>
  );
}

function ClientOrgOnboardingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{
    companyName: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing onboarding token. Please use the link from your invitation email.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/client-org-onboarding?token=${encodeURIComponent(token)}`
        );
        if (!res.ok) {
          const text = await res.text();
          let message = "Invalid or expired invitation";
          try {
            const json = JSON.parse(text);
            message = json.message || message;
          } catch {
            // ignore
          }
          setError(message);
          return;
        }
        const data = await res.json();
        setInfo(data);
      } catch (err: any) {
        setError(err.message || "Failed to validate invitation");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const canSubmit = useMemo(
    () => password.length >= 8 && password === confirm,
    [password, confirm]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/client-org-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = "Failed to complete setup";
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          // ignore
        }
        setError(message);
        return;
      }

      const data = await res.json();

      // Store tokens so the user is logged in immediately
      if (data.accessToken) {
        try {
          localStorage.setItem("accessToken", data.accessToken);
          if (data.refreshToken) {
            localStorage.setItem("refreshToken", data.refreshToken);
          }
        } catch {
          // localStorage might be unavailable
        }
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to complete setup");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Organization Setup</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>Validating your invitation…</p>
      </main>
    );
  }

  if (error && !info) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Organization Setup</h1>
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>{error}</p>
        </div>
        <p style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          If you believe this is an error, please contact the company that invited you.
        </p>
      </main>
    );
  }

  if (success) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Welcome to NEXUS!</h1>
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: "#ecfdf5",
            border: "1px solid #a7f3d0",
          }}
        >
          <p style={{ margin: 0, color: "#065f46", fontSize: 14, fontWeight: 500 }}>
            ✓ Your organization is set up!
          </p>
          <p style={{ margin: "8px 0 0", color: "#047857", fontSize: 13 }}>
            <strong>{info?.companyName}</strong> is ready. You can now view projects, communicate with your contractors, and manage your team.
          </p>
        </div>
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <a
            href="/portal"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 6,
              backgroundColor: "#7c3aed",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Go to your portal
          </a>
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 6,
              backgroundColor: "#f3f4f6",
              color: "#374151",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Set Up Your Organization</h1>

      {info?.companyName && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            backgroundColor: "#f5f3ff",
            border: "1px solid #ddd6fe",
            marginBottom: 20,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#5b21b6" }}>
            Setting up <strong>{info.companyName}</strong> on Nexus Contractor-Connect.
          </p>
        </div>
      )}

      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        Create a password to activate your organization account. You'll be able to view projects,
        communicate with your contractors, and invite your team.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Pre-filled info (read-only) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Organization
          </label>
          <input
            type="text"
            value={info?.companyName || ""}
            readOnly
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              fontSize: 14,
              color: "#374151",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={info?.email || ""}
            readOnly
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              fontSize: 14,
              color: "#374151",
            }}
          />
        </div>

        {(info?.firstName || info?.lastName) && (
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                First Name
              </label>
              <input
                type="text"
                value={info?.firstName || ""}
                readOnly
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  fontSize: 14,
                  color: "#374151",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Last Name
              </label>
              <input
                type="text"
                value={info?.lastName || ""}
                readOnly
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  fontSize: 14,
                  color: "#374151",
                }}
              />
            </div>
          </div>
        )}

        {/* Password fields */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Create Password{" "}
            <span style={{ color: "#6b7280", fontWeight: 400 }}>(min 8 characters)</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border:
                password && confirm && password !== confirm
                  ? "1px solid #f87171"
                  : "1px solid #d1d5db",
              fontSize: 14,
            }}
          />
          {password && confirm && password !== confirm && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#dc2626" }}>
              Passwords do not match
            </p>
          )}
        </div>

        {error && (
          <p style={{ margin: "0 0 16px", color: "#dc2626", fontSize: 13 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 6,
            border: "none",
            backgroundColor: !canSubmit || submitting ? "#e5e7eb" : "#7c3aed",
            color: !canSubmit || submitting ? "#6b7280" : "#fff",
            fontSize: 14,
            fontWeight: 500,
            cursor: !canSubmit || submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Setting up…" : "Activate Organization"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
        By completing setup, you agree to the NEXUS terms of service.
      </p>
    </main>
  );
}
