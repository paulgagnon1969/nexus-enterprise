"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SkillSuggestionAdminDto {
  id: string;
  userId: string;
  label: string;
  categoryLabel?: string | null;
  description?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface SkillReviewSummaryDto {
  selfLevel: number | null;
  employerAvgLevel: number | null;
  employerRatingCount: number | null;
  clientAvgLevel: number | null;
  clientRatingCount: number | null;
}

interface SkillReviewDetailsDto {
  self?: { notes?: string | null } | null;
  peerRatings: { id: string; comment?: string | null }[];
  clientRatings: { id: string; comment?: string | null }[];
}

interface SkillReviewDetailDto {
  suggestion: {
    label: string;
    categoryLabel?: string | null;
  };
  summary: SkillReviewSummaryDto;
  details: SkillReviewDetailsDto;
}

export default function SkillsReviewPage() {
  const [suggestions, setSuggestions] = useState<SkillSuggestionAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SkillReviewDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/skills/suggestions/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load pending skill suggestions (${res.status}): ${text}`);
        }
        const json = await res.json();
        setSuggestions(json || []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load pending skill suggestions.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function loadDetail(id: string) {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setDetailLoading(true);
      setDetailError(null);
      const res = await fetch(`${API_BASE}/skills/suggestions/${id}/review`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to load suggestion details (${res.status}): ${text}`);
      }
      const json = await res.json();
      setSelectedDetail(json);
    } catch (e: any) {
      setDetailError(e?.message ?? "Failed to load suggestion details");
    } finally {
      setDetailLoading(false);
    }
  }

  async function moderate(id: string, action: "approve" | "reject") {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/skills/suggestions/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to ${action} suggestion (${res.status}): ${text}`);
      }
      setSuggestions(list => list.filter(s => s.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedDetail(null);
      }
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${action} suggestion`);
    }
  }

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading pending skill suggestions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Skills review</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Skills review</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Pending user-submitted skills awaiting review. Approved skills will later be promoted into
        the shared skills catalog.
      </p>

      {suggestions.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>No pending suggestions.</p>
      ) : (
        <>
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 13 }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f9fafb" }}>
              <th align="left" style={{ padding: "6px 8px" }}>Skill</th>
              <th align="left" style={{ padding: "6px 8px" }}>Category</th>
              <th align="left" style={{ padding: "6px 8px" }}>Submitted by</th>
              <th align="left" style={{ padding: "6px 8px" }}>Description</th>
              <th align="left" style={{ padding: "6px 8px" }}>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {suggestions.map(s => (
              <tr
                key={s.id}
                style={{ cursor: "pointer", backgroundColor: selectedId === s.id ? "#f1f5f9" : "transparent" }}
                onClick={() => {
                  setSelectedId(s.id);
                  void loadDetail(s.id);
                }}
              >
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>{s.label}</td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {s.categoryLabel || "—"}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {s.userId}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {s.description || "—"}
                </td>
                <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                  {new Date(s.createdAt).toLocaleString()}
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "right",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => moderate(s.id, "approve")}
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
                    onClick={() => moderate(s.id, "reject")}
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

        {/* Detail panel for selected suggestion */}
        {selectedId ? (
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid #e5e7eb",
              fontSize: 12,
            }}
          >
            <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Suggestion details</h2>
            {detailLoading && !selectedDetail && (
              <p style={{ color: "#6b7280" }}>Loading details…</p>
            )}
            {detailError && (
              <p style={{ color: "#b91c1c" }}>{detailError}</p>
            )}
            {selectedDetail && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <strong>{selectedDetail.suggestion.label}</strong>
                  {" "}
                  <span style={{ color: "#6b7280" }}>
                    ({selectedDetail.suggestion.categoryLabel || "No category"})
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Self</div>
                    <div>
                      {selectedDetail.summary.selfLevel != null
                        ? `${selectedDetail.summary.selfLevel}/5`
                        : "Not set"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Peer</div>
                    <div>
                      {selectedDetail.summary.employerAvgLevel != null
                        ? `${selectedDetail.summary.employerAvgLevel.toFixed(1)}/5 (${selectedDetail.summary.employerRatingCount ?? 0} ratings)`
                        : "No peer ratings"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Client</div>
                    <div>
                      {selectedDetail.summary.clientAvgLevel != null
                        ? `${selectedDetail.summary.clientAvgLevel.toFixed(1)}/5 (${selectedDetail.summary.clientRatingCount ?? 0} ratings)`
                        : "No client ratings"}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>Self notes</div>
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {selectedDetail.details.self?.notes
                        ? selectedDetail.details.self.notes
                        : "No self notes recorded."}
                    </p>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>Peer feedback</div>
                    {selectedDetail.details.peerRatings.length > 0 ? (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                        {selectedDetail.details.peerRatings.map((r, idx) => (
                          <li key={r.id} style={{ marginTop: idx === 0 ? 2 : 4 }}>
                            <strong>Rating {idx + 1}:</strong>{" "}
                            {r.comment ? r.comment : "(no comment provided)"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        No peer comments recorded.
                      </p>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>Client feedback</div>
                    {selectedDetail.details.clientRatings.length > 0 ? (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                        {selectedDetail.details.clientRatings.map((r, idx) => (
                          <li key={r.id} style={{ marginTop: idx === 0 ? 2 : 4 }}>
                            <strong>Rating {idx + 1}:</strong>{" "}
                            {r.comment ? r.comment : "(no comment provided)"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        No client comments recorded.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
        </>
      )}
    </div>
  );
}
