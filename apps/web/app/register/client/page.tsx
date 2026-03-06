"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const PAGE_BG: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const CARD: React.CSSProperties = {
  background: "rgba(30, 41, 59, 0.8)",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: "40px 36px",
  width: "100%",
  maxWidth: 440,
  backdropFilter: "blur(8px)",
};

export default function ClientRegisterPage() {
  return (
    <div style={PAGE_BG}>
      <Suspense fallback={
        <div style={CARD}>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: 0 }}>Loading your invitation…</p>
        </div>
      }>
        <ClientRegisterPageInner />
      </Suspense>
    </div>
  );
}

function ClientRegisterPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<{
    email: string;
    firstName?: string;
    lastName?: string;
    companyName: string;
    projectName?: string;
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
          try { const json = JSON.parse(text); message = json.message || message; } catch { /* ignore */ }
          setError(message);
          return;
        }
        setInviteInfo(await res.json());
      } catch (err: any) {
        setError(err.message || "Failed to validate invitation");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const canSubmit = useMemo(() => password.length >= 8 && password === confirm, [password, confirm]);

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
        try { const json = JSON.parse(text); message = json.message || message; } catch { /* ignore */ }
        setError(message);
        return;
      }
      const data = await res.json();
      // Auto-login: store tokens if the API returns them, then redirect
      try {
        if (data.accessToken) {
          localStorage.setItem("accessToken", data.accessToken);
          if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
          if (data.company?.id) localStorage.setItem("companyId", data.company.id);
          if (data.userType) localStorage.setItem("userType", data.userType);
          window.dispatchEvent(new Event("nexus-auth-change"));
        }
      } catch { /* ignore storage errors */ }
      setSuccess(true);
      // Brief success flash then redirect
      setTimeout(() => router.push("/client-portal"), 1800);
    } catch (err: any) {
      setError(err.message || "Failed to complete registration");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "rgba(15, 23, 42, 0.6)",
    color: "#f1f5f9",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  if (loading) {
    return (
      <div style={CARD}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 36, width: "auto" }} />
        </div>
        <p style={{ color: "#94a3b8", fontSize: 14, margin: 0, textAlign: "center" }}>Validating your invitation…</p>
      </div>
    );
  }

  if (error && !inviteInfo) {
    return (
      <div style={CARD}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 36, width: "auto" }} />
        </div>
        <div style={{ padding: 16, borderRadius: 8, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", marginBottom: 16 }}>
          <p style={{ margin: 0, color: "#fca5a5", fontSize: 14 }}>{error}</p>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Please use the original link from your invitation email, or contact the company that invited you.
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div style={CARD}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 36, width: "auto" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>You&apos;re all set!</h2>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 4px" }}>Taking you to your project portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={CARD}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img src="/nexconnect-logo.png" alt="Nexus Contractor Connect" style={{ height: 36, width: "auto" }} />
      </div>

      {/* Invitation context */}
      {inviteInfo?.companyName && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.25)",
          marginBottom: 24,
          textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: 13, color: "#93c5fd", lineHeight: 1.5 }}>
            <strong style={{ color: "#dbeafe", fontWeight: 600 }}>{inviteInfo.companyName}</strong>
            {inviteInfo.projectName
              ? <> has invited you to view <strong style={{ color: "#dbeafe" }}>{inviteInfo.projectName}</strong> on Nexus</>
              : " has invited you to view your project on Nexus"
            }
          </p>
        </div>
      )}

      <h1 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Set up your account</h1>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>Create a password to access your project portal.</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Email read-only */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email</label>
          <input type="email" value={inviteInfo?.email || ""} readOnly
            style={{ ...inputStyle, color: "#64748b", cursor: "default" }} />
        </div>

        {/* Password */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Password <span style={{ color: "#475569", textTransform: "none", fontWeight: 400 }}>(min 8 characters)</span>
          </label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="new-password" autoFocus style={inputStyle} />
        </div>

        {/* Confirm */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            style={{ ...inputStyle, border: password && confirm && password !== confirm ? "1px solid #f87171" : "1px solid #334155" }} />
          {password && confirm && password !== confirm && (
            <p style={{ margin: "5px 0 0", fontSize: 12, color: "#f87171" }}>Passwords do not match</p>
          )}
        </div>

        {error && <p style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>{error}</p>}

        <button type="submit" disabled={!canSubmit || submitting} style={{
          marginTop: 4,
          padding: "13px 16px",
          borderRadius: 8,
          border: "none",
          background: !canSubmit || submitting ? "#1e293b" : "#3b82f6",
          color: !canSubmit || submitting ? "#475569" : "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: !canSubmit || submitting ? "default" : "pointer",
          transition: "background 0.15s",
        }}>
          {submitting ? "Creating your account…" : "Access My Project Portal"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 11, color: "#475569", textAlign: "center" }}>
        By continuing you agree to the{" "}
        <a href="/welcome#privacy" style={{ color: "#60a5fa", textDecoration: "none" }}>Nexus Privacy Policy</a>.
      </p>
    </div>
  );
}
