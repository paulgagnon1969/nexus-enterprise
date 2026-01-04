"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface NotificationDto {
  id: string;
  title: string;
  body: string;
  kind?: string;
  channel?: string;
  isRead?: boolean;
  createdAt?: string;
}

export default function ActivityPage() {
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load notifications (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        setItems(Array.isArray(json) ? json : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load notifications");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function markAsRead(id: string) {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(prev =>
        (prev || []).map(n => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch {
      // best-effort only
    }
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <header>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 18 }}>Activity & notifications</h2>
          <p style={{ marginTop: 0, fontSize: 13, color: "#6b7280" }}>
            System notifications for your account, including referrals, onboarding, and project activity.
          </p>
        </header>

        {error && (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>Error: {error}</p>
        )}

        {loading && !items && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading activity…</p>
        )}

        {items && items.length === 0 && !loading && !error && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No notifications yet.</p>
        )}

        {items && items.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(n => {
              const created = n.createdAt ? new Date(n.createdAt) : null;
              const dateLabel = created ? created.toLocaleString() : "";
              const isUnread = !n.isRead;

              return (
                <li
                  key={n.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    backgroundColor: isUnread ? "#f0f9ff" : "#ffffff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#4b5563" }}>{n.body}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af" }}>
                      {n.kind && <span style={{ marginRight: 8 }}>{n.kind}</span>}
                      {dateLabel}
                    </div>
                  </div>

                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => markAsRead(n.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        fontSize: 11,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageCard>
  );
}
