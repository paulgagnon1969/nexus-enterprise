"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ReputationRatingDto {
  id: string;
  subjectType: string;
  subjectUserId: string | null;
  subjectCompanyId: string | null;
  raterUserId: string | null;
  raterCompanyId: string | null;
  sourceType: string;
  dimension: string;
  score: number;
  comment?: string | null;
  createdAt: string;
}

export default function AdminReputationPage() {
  const [ratings, setRatings] = useState<ReputationRatingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/admin/reputation/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load pending ratings (${res.status}): ${text}`);
        }
        const json = await res.json();
        setRatings(json || []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load pending ratings.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function moderate(id: string, action: "approve" | "reject") {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/admin/reputation/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to ${action} rating (${res.status}): ${text}`);
      }
      setRatings(list => list.filter(r => r.id !== id));
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${action} rating`);
    }
  }

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading pending reputation ratings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Reputation moderation</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Reputation moderation</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Pending company/worker ratings awaiting Nexus Admin review.
      </p>

      {ratings.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>No pending ratings.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: "#f9fafb" }}>
              <th align="left" style={{ padding: "6px 8px" }}>Subject</th>
              <th align="left" style={{ padding: "6px 8px" }}>Source</th>
              <th align="left" style={{ padding: "6px 8px" }}>Score</th>
              <th align="left" style={{ padding: "6px 8px" }}>Comment</th>
              <th align="left" style={{ padding: "6px 8px" }}>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ratings.map(r => (
              <tr key={r.id}>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {r.subjectType} {r.subjectCompanyId || r.subjectUserId}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {r.sourceType}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {r.score} / 5
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {r.comment || "—"}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => moderate(r.id, "approve")}
                    style={{
                      padding: "4px 8px",
                      marginRight: 8,
                      borderRadius: 4,
                      border: "1px solid #16a34a",
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => moderate(r.id, "reject")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #b91c1c",
                      backgroundColor: "#fee2e2",
                      color: "#991b1b",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
