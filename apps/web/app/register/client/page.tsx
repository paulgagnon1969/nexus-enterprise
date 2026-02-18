"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function ClientRegisterPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Client Portal Access</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>
        </main>
      }
    >
      <ClientRegisterPageInner />
    </Suspense>
  );
}

function ClientRegisterPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing invite token. Please use the link from your invitation email.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/client-register?token=${encodeURIComponent(token)}`);
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
        setInviteInfo(data);
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
      const res = await fetch(`${API_BASE}/auth/client-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = "Failed to complete registration";
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          // ignore
        }
        setError(message);
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to complete registration");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Client Portal Access</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>Validating your invitation…</p>
      </main>
    );
  }

  if (error && !inviteInfo) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Client Portal Access</h1>
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
            ✓ Your account is ready!
          </p>
          <p style={{ margin: "8px 0 0", color: "#047857", fontSize: 13 }}>
            You can now sign in to view your projects.
          </p>
        </div>
        <div style={{ marginTop: 24 }}>
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 6,
              backgroundColor: "#2563eb",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Sign in to your portal
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Complete Your Registration</h1>
      
      {inviteInfo?.companyName && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            marginBottom: 20,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#1e40af" }}>
            <strong>{inviteInfo.companyName}</strong> has invited you to their client portal.
          </p>
        </div>
      )}

      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        Set a password to access your projects and communications.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Pre-filled info (read-only) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={inviteInfo?.email || ""}
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

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              First Name
            </label>
            <input
              type="text"
              value={inviteInfo?.firstName || ""}
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
              value={inviteInfo?.lastName || ""}
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

        {/* Password fields */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Create Password <span style={{ color: "#6b7280", fontWeight: 400 }}>(min 8 characters)</span>
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
              border: password && confirm && password !== confirm ? "1px solid #f87171" : "1px solid #d1d5db",
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
            backgroundColor: !canSubmit || submitting ? "#e5e7eb" : "#2563eb",
            color: !canSubmit || submitting ? "#6b7280" : "#fff",
            fontSize: 14,
            fontWeight: 500,
            cursor: !canSubmit || submitting ? "default" : "pointer",
          }}
        >
          {submitting ? "Creating account…" : "Complete Registration"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
        By completing registration, you agree to the NEXUS terms of service.
      </p>
    </main>
  );
}
