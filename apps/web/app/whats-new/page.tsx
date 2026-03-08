"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/* ── Types ─────────────────────────────────────────── */

interface Announcement {
  id: string;
  moduleCode: string | null;
  camId: string | null;
  title: string;
  description: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  launchedAt: string;
  highlightUntil: string | null;
  sortOrder: number;
  seen: boolean;
  acknowledged: boolean;
  firstSeenAt: string | null;
  acknowledgedAt: string | null;
}

/* ── Helpers ───────────────────────────────────────── */

function timeSince(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const days = Math.floor((now - then) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/* ── Module icon mapping ───────────────────────────── */

const MODULE_ICONS: Record<string, string> = {
  NEXBRIDGE: "🖥️",
  NEXBRIDGE_ASSESS: "📹",
  NEXBRIDGE_NEXPLAN: "📋",
  NEXBRIDGE_AI: "🤖",
};

/* ── Page ──────────────────────────────────────────── */

export default function WhatsNewPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Auth bootstrap ────────────────────────────── */

  useEffect(() => {
    if (typeof window === "undefined") return;
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    setToken(accessToken);
  }, [router]);

  /* ── Fetch announcements ───────────────────────── */

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/features/announcements`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Announcement[]) =>
        setAnnouncements(Array.isArray(data) ? data : [])
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  /* ── Record redirect (called once on first load) ── */

  useEffect(() => {
    if (!token) return;
    // Only record if we were redirected here from login
    const fromLogin = typeof window !== "undefined" &&
      sessionStorage.getItem("featureRedirect") === "1";
    if (!fromLogin) return;
    sessionStorage.removeItem("featureRedirect");

    fetch(`${API_BASE}/features/record-redirect`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }).catch(() => {});
  }, [token]);

  /* ── Acknowledge handler ───────────────────────── */

  const handleAcknowledge = useCallback(
    async (id: string) => {
      if (!token) return;
      await fetch(`${API_BASE}/features/${id}/acknowledge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).catch(() => {});
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, acknowledged: true, seen: true } : a
        )
      );
    },
    [token]
  );

  /* ── Derived state ─────────────────────────────── */

  const unseenCount = announcements.filter((a) => !a.acknowledged).length;

  /* ── Render ─────────────────────────────────────── */

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        color: "#f8fafc",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 48px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/nexconnect-logo.png"
            alt="NCC"
            style={{ height: 36, width: "auto" }}
          />
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            What&apos;s New
          </span>
        </div>
        <Link
          href="/projects"
          style={{
            color: "#94a3b8",
            textDecoration: "none",
            fontSize: 14,
            padding: "8px 20px",
            borderRadius: 8,
            border: "1px solid #334155",
            transition: "all 0.2s",
          }}
        >
          Go to Dashboard →
        </Link>
      </header>

      {/* Hero */}
      <section
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "40px 48px 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            margin: "0 0 12px",
            background: "linear-gradient(135deg, #fff 0%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          New Features & Updates
        </h1>
        <p style={{ fontSize: 16, color: "#94a3b8", margin: 0 }}>
          {unseenCount > 0
            ? `You have ${unseenCount} new feature${unseenCount === 1 ? "" : "s"} to explore.`
            : "You're all caught up!"}
        </p>
      </section>

      {/* Announcements grid */}
      <section
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "32px 48px 80px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
          gap: 24,
        }}
      >
        {loading && (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: 80,
              color: "#64748b",
            }}
          >
            Loading announcements…
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: 80,
              color: "#64748b",
            }}
          >
            No feature announcements right now. Check back soon!
          </div>
        )}

        {announcements.map((a) => {
          const isNew = !a.acknowledged;
          const icon = a.moduleCode
            ? MODULE_ICONS[a.moduleCode] ?? "✨"
            : "✨";

          return (
            <div
              key={a.id}
              style={{
                position: "relative",
                background: isNew
                  ? "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(30,41,59,0.95) 100%)"
                  : "rgba(30, 41, 59, 0.6)",
                border: isNew
                  ? "1px solid rgba(59, 130, 246, 0.4)"
                  : "1px solid #334155",
                borderRadius: 16,
                padding: 28,
                transition: "all 0.3s ease",
                ...(isNew
                  ? {
                      boxShadow:
                        "0 0 20px rgba(59, 130, 246, 0.15), 0 0 40px rgba(59, 130, 246, 0.05)",
                      animation: "glow 3s ease-in-out infinite alternate",
                    }
                  : {}),
              }}
            >
              {/* NEW badge */}
              {isNew && (
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    background: "#3b82f6",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 50,
                    letterSpacing: "0.05em",
                  }}
                >
                  NEW
                </div>
              )}

              {/* Icon + title */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 28 }}>{icon}</span>
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    margin: 0,
                    color: isNew ? "#fff" : "#cbd5e1",
                  }}
                >
                  {a.title}
                </h3>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: 14,
                  color: "#94a3b8",
                  lineHeight: 1.6,
                  margin: "0 0 16px",
                }}
              >
                {a.description}
              </p>

              {/* Launched date */}
              <div
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  marginBottom: 16,
                }}
              >
                Launched {timeSince(a.launchedAt)}
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {a.ctaUrl && (
                  <Link
                    href={a.ctaUrl}
                    style={{
                      background: isNew ? "#3b82f6" : "#1e293b",
                      color: isNew ? "#fff" : "#94a3b8",
                      padding: "8px 18px",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 500,
                      border: isNew ? "none" : "1px solid #334155",
                    }}
                  >
                    {a.ctaLabel || "Learn More"}
                  </Link>
                )}

                {isNew && (
                  <button
                    onClick={() => handleAcknowledge(a.id)}
                    style={{
                      background: "transparent",
                      color: "#64748b",
                      padding: "8px 18px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      border: "1px solid #334155",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#f8fafc";
                      e.currentTarget.style.borderColor = "#475569";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#64748b";
                      e.currentTarget.style.borderColor = "#334155";
                    }}
                  >
                    Got it ✓
                  </button>
                )}

                {a.acknowledged && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#22c55e",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    ✓ Acknowledged
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Glow animation keyframes */}
      <style>{`
        @keyframes glow {
          0% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.15), 0 0 40px rgba(59, 130, 246, 0.05); }
          100% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.25), 0 0 60px rgba(59, 130, 246, 0.1); }
        }
      `}</style>
    </div>
  );
}
