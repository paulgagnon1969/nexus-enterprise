"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface HealthResponse {
  ok?: boolean;
  time?: string;
  db?: string;
  redis?: string;
}

interface TestEmailResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  body?: any;
  error?: string;
}

export default function DevApiTestPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [deps, setDeps] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [toEmail, setToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<TestEmailResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setHealthError(null);

        const [healthRes, depsRes] = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/health/deps`),
        ]);

        if (!healthRes.ok) {
          throw new Error(`Health check failed (${healthRes.status})`);
        }
        if (!depsRes.ok) {
          throw new Error(`Deps health failed (${depsRes.status})`);
        }

        const healthJson = (await healthRes.json()) as HealthResponse;
        const depsJson = (await depsRes.json()) as HealthResponse;

        if (cancelled) return;
        setHealth(healthJson);
        setDeps(depsJson);
      } catch (e: any) {
        if (cancelled) return;
        setHealthError(e?.message ?? "Failed to load health checks");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function sendTestEmail(ev: React.FormEvent) {
    ev.preventDefault();
    setSendError(null);
    setSendResult(null);

    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setSendError("Missing access token in localStorage; please log in again.");
      return;
    }

    try {
      setSending(true);
      const res = await fetch(`${API_BASE}/dev/test-resend-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to: toEmail.trim() || undefined }),
      });

      const json = (await res.json()) as TestEmailResult;
      setSendResult(json);
      if (!json.ok && !json.skipped) {
        setSendError(`API responded with an error (status ${json.status ?? res.status}).`);
      }
    } catch (e: any) {
      setSendError(e?.message ?? "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 18 }}>Dev: API & Resend connectivity</h2>
          <p style={{ marginTop: 0, fontSize: 13, color: "#6b7280" }}>
            This page helps verify that Vercel can reach the API, and that the API can send email via Resend.
          </p>
        </header>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>API health</h3>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            Pinging <code style={{ fontSize: 11 }}>{`${API_BASE}/health`}</code> and
            {" "}
            <code style={{ fontSize: 11 }}>{`${API_BASE}/health/deps`}</code>.
          </p>

          {healthError && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {healthError}</p>
          )}

          {health && deps && !healthError && (
            <div style={{ fontSize: 12 }}>
              <div>
                <strong>/health:</strong> ok={String(health.ok)} time={health.time}
              </div>
              <div>
                <strong>/health/deps:</strong> ok={String(deps.ok)} db={deps.db} redis={deps.redis} time={deps.time}
              </div>
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Send test email via Resend</h3>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            This calls <code style={{ fontSize: 11 }}>{`${API_BASE}/dev/test-resend-email`}</code> using your
            current access token. Leave the email blank to send to <code>RESEND_FROM_EMAIL</code>.
          </p>

          <form onSubmit={sendTestEmail} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 12 }}>
              Recipient email (optional)
              <input
                type="email"
                value={toEmail}
                onChange={e => setToEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  marginTop: 4,
                  padding: "6px 8px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  width: "100%",
                  maxWidth: 320,
                }}
              />
            </label>

            <button
              type="submit"
              disabled={sending}
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                background: sending ? "#9ca3af" : "#16a34a",
                color: "#f9fafb",
                fontSize: 13,
                cursor: sending ? "default" : "pointer",
              }}
            >
              {sending ? "Sending..." : "Send test email"}
            </button>
          </form>

          {sendError && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>Error: {sendError}</p>
          )}

          {sendResult && (
            <pre
              style={{
                marginTop: 8,
                fontSize: 11,
                background: "#f9fafb",
                borderRadius: 6,
                padding: 8,
                overflowX: "auto",
              }}
            >
              {JSON.stringify(sendResult, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </PageCard>
  );
}
