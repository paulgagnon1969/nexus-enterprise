"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PublicOnboardingForm from "../onboarding/public-onboarding-form";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function ApplyPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>NEXUS Contractor Connect</h1>
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.status === 409) {
        setError(
          "An account with this email already exists. Please log in instead. If you forgot your password, use /reset-password."
        );
        return;
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

      <h1 style={{ marginTop: 16, textAlign: "center" }}>NEXUS Contractor Connect</h1>

      <img
        src="/contractor-connect.gif"
        alt="Contractor Connect"
        style={{
          width: 520,
          maxWidth: "100%",
          height: "auto",
          display: "block",
          marginTop: 12,
        }}
      />

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
            <input
              id="apply-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
              required
            />
          </label>

          <label style={{ fontSize: 14, width: "100%", textAlign: "left" }} htmlFor="apply-confirm-password">
            Confirm password
            <input
              id="apply-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
              required
            />
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
        Already in the pool? Log in at <a href="/login">/login</a>.
      </div>
    </main>
  );
}
