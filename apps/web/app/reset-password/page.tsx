"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: "2rem", maxWidth: 520, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Reset password</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>
        </main>
      }
    >
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => !!email.trim(), [email]);
  const canSave = useMemo(() => token && password.length >= 8 && password === confirm, [token, password, confirm]);

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSend) return;

    try {
      setSending(true);
      const res = await fetch(`${API_BASE}/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to request reset (${res.status})`);
      }
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to request reset");
    } finally {
      setSending(false);
    }
  }

  async function saveNewPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSave) return;

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to reset password (${res.status})`);
      }
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to reset password");
    } finally {
      setSaving(false);
    }
  }

  if (token) {
    return (
      <main style={{ padding: "2rem", maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Set a new password</h1>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Enter a new password for your account.
        </p>

        <form onSubmit={saveNewPassword} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 14 }}>
            New password (min 8 characters)
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
            />
          </label>

          <button
            type="submit"
            disabled={!canSave || saving || saved}
            style={{
              marginTop: 6,
              padding: "10px 14px",
              borderRadius: 6,
              border: "none",
              backgroundColor: !canSave || saving || saved ? "#e5e7eb" : "#2563eb",
              color: !canSave || saving || saved ? "#4b5563" : "#f9fafb",
              cursor: !canSave || saving || saved ? "default" : "pointer",
              fontSize: 14,
            }}
          >
            {saved ? "Password updated" : saving ? "Saving…" : "Update password"}
          </button>

          {error && <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}
          {saved && (
            <p style={{ margin: 0, color: "#16a34a", fontSize: 13 }}>
              Your password has been updated. You can now <a href="/login">sign in</a>.
            </p>
          )}
        </form>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Reset password</h1>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        Enter your email and well send a password reset link.
      </p>

      <form onSubmit={requestReset} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 14 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
          />
        </label>

        <button
          type="submit"
          disabled={!canSend || sending}
          style={{
            marginTop: 6,
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            backgroundColor: !canSend || sending ? "#e5e7eb" : "#2563eb",
            color: !canSend || sending ? "#4b5563" : "#f9fafb",
            cursor: !canSend || sending ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {sending ? "Sending…" : "Email me a reset link"}
        </button>

        {error && <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}
        {sent && (
          <p style={{ margin: 0, color: "#16a34a", fontSize: 13 }}>
            If an account exists for that email, a reset link has been sent.
          </p>
        )}
      </form>

      <div style={{ marginTop: 18, fontSize: 12, color: "#6b7280" }}>
        Back to <a href="/login">sign in</a>.
      </div>
    </main>
  );
}
