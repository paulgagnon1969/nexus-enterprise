"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SessionRow {
  id: string;
  email: string;
  status: string;
  createdAt: string;
}

export default function OnboardingQueuePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const companyId = localStorage.getItem("companyId");

    if (!token || !companyId) {
      setError("Missing access token or company id. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/onboarding/company/${companyId}/sessions?status=SUBMITTED,UNDER_REVIEW`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error("Failed to load onboarding sessions.");
        }
        const json = await res.json();
        setSessions(json || []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load onboarding sessions.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function approve(id: string) {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/onboarding/sessions/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to approve session");
      }
      setSessions(list => list.filter(s => s.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to approve session");
    }
  }

  async function reject(id: string) {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/onboarding/sessions/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to reject session");
      }
      setSessions(list => list.filter(s => s.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to reject session");
    }
  }

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading onboarding sessionseee</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Onboarding</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Onboarding candidates</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Review and approve people who have completed their onboarding checklists.
      </p>

      {sessions.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>No pending candidates.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th align="left">Email</th>
              <th align="left">Status</th>
              <th align="left">Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td>{s.status}</td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => approve(s.id)}
                    style={{
                      padding: "4px 8px",
                      marginRight: 8,
                      borderRadius: 4,
                      border: "1px solid #16a34a",
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      fontSize: 12,
                      cursor: "pointer"
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(s.id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #b91c1c",
                      backgroundColor: "#fee2e2",
                      color: "#991b1b",
                      fontSize: 12,
                      cursor: "pointer"
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
