"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SkillRow {
  id: string;
  code: string;
  label: string;
  categoryLabel: string | null;
  tradeLabel: string | null;
  selfLevel: number | null;
  employerAvgLevel: number | null;
  employerRatingCount: number | null;
  clientAvgLevel: number | null;
  clientRatingCount: number | null;
}

interface UserProfileDto {
  id: string;
  email: string;
  globalRole: string;
  userType: string;
  company: { id: string; name: string };
  companyRole: string;
  reputation: {
    avg: number;
    count: number;
    override: number | null;
  };
  skills: SkillRow[];
}

export default function CompanyUserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;

  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [canRate, setCanRate] = useState(false);
  const [canClientRate, setCanClientRate] = useState(false);

  const [ratingSkillId, setRatingSkillId] = useState<string>("");
  const [ratingLevel, setRatingLevel] = useState<string>("");
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const [clientSkillId, setClientSkillId] = useState<string>("");
  const [clientLevel, setClientLevel] = useState<string>("");
  const [clientComment, setClientComment] = useState("");
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem("accessToken");
    const companyId = localStorage.getItem("companyId");

    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [profileRes, meRes] = await Promise.all([
          fetch(`${API_BASE}/users/${userId}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!profileRes.ok) {
          const text = await profileRes.text();
          throw new Error(`Failed to load user profile (${profileRes.status}): ${text}`);
        }
        const profileJson = await profileRes.json();
        setProfile(profileJson);

        if (meRes.ok) {
          const me = await meRes.json();

          // Determine if actor can rate as employer (OWNER/ADMIN in this company)
          if (companyId) {
            const membership = (me.memberships || []).find(
              (m: any) => m.companyId === companyId
            );
            if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
              setCanRate(true);
            }
          }

          // Determine if actor is a client user who can leave client ratings
          if (me.userType === "CLIENT") {
            setCanClientRate(true);
          }
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load user profile.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [userId]);

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading user profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>User profile</h1>
        <p style={{ color: "#b91c1c" }}>{error || "User not found"}</p>
      </div>
    );
  }

  const displayedReputation = profile.reputation.override ?? profile.reputation.avg;

  async function handleAddRating(e: FormEvent) {
    e.preventDefault();
    setRatingError(null);

    if (!ratingSkillId || !ratingLevel) {
      setRatingError("Select a skill and level.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setRatingError("Missing access token.");
      return;
    }

    if (!profile) {
      setRatingError("Profile not loaded.");
      return;
    }

    try {
      setRatingSaving(true);
      const res = await fetch(`${API_BASE}/skills/workers/${profile.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skillId: ratingSkillId,
          level: Number(ratingLevel),
          comment: ratingComment || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to add rating (${res.status}): ${text}`);
      }
      const updated = await res.json();

      // updated is UserSkillRating for this skill
      setProfile(prev =>
        prev
          ? {
              ...prev,
              skills: prev.skills.map(s =>
                s.id === updated.skillId
                  ? {
                      ...s,
                      employerAvgLevel: updated.employerAvgLevel ?? null,
                      employerRatingCount: updated.employerRatingCount ?? null,
                    }
                  : s
              ),
            }
          : prev
      );

      setRatingLevel("");
      setRatingComment("");
    } catch (err: any) {
      setRatingError(err.message || "Failed to add rating.");
    } finally {
      setRatingSaving(false);
    }
  }

  async function handleAddClientRating(e: FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (!clientSkillId || !clientLevel) {
      setClientError("Select a skill and level.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setClientError("Missing access token.");
      return;
    }

    if (!profile) {
      setClientError("Profile not loaded.");
      return;
    }

    try {
      setClientSaving(true);
      const res = await fetch(`${API_BASE}/skills/clients/${profile.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skillId: clientSkillId,
          level: Number(clientLevel),
          comment: clientComment || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to add client rating (${res.status}): ${text}`);
      }
      const updated = await res.json();

      // updated is UserSkillRating for this skill
      setProfile(prev =>
        prev
          ? {
              ...prev,
              skills: prev.skills.map(s =>
                s.id === updated.skillId
                  ? {
                      ...s,
                      clientAvgLevel: updated.clientAvgLevel ?? null,
                      clientRatingCount: updated.clientRatingCount ?? null,
                    }
                  : s
              ),
            }
          : prev
      );

      setClientLevel("");
      setClientComment("");
    } catch (err: any) {
      setClientError(err.message || "Failed to add client rating.");
    } finally {
      setClientSaving(false);
    }
  }

  const NEXUS_DARK_BLUE = "#0f172a";
  const NEXUS_GOLD = "#facc15";

  const renderStars = (value: number | null, size: number) => {
    const filledCount = value == null ? 0 : Math.round(value);
    return (
      <div style={{ display: "inline-flex", gap: 3, verticalAlign: "middle" }}>
        {Array.from({ length: 5 }, (_, idx) => {
          const starValue = idx + 1;
          const active = filledCount >= starValue;
          return (
            <svg
              key={starValue}
              width={size}
              height={size}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2.5l2.47 5.01 5.53.8-4 3.9.94 5.49L12 15.9l-4.94 2.8.94-5.49-4-3.9 5.53-.8L12 2.5z"
                fill={active ? NEXUS_GOLD : "#ffffff"}
                stroke={NEXUS_DARK_BLUE}
                strokeWidth={1}
              />
            </svg>
          );
        })}
      </div>
    );
  };

  // Group for display: Category -> Trade -> Skills
  const grouped = profile.skills.reduce<
    Record<string, Record<string, SkillRow[]>>
  >((acc, s) => {
    const category = s.categoryLabel || "Other";
    const trade = s.tradeLabel || "General";
    if (!acc[category]) acc[category] = {};
    if (!acc[category][trade]) acc[category][trade] = [];
    acc[category][trade].push(s);
    return acc;
  }, {});

  const categoryNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Worker profile</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        {profile.company.name} · {profile.companyRole}
      </p>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Identity</h2>
        <p style={{ fontSize: 13 }}>
          <strong>Email:</strong> {profile.email}
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>User type:</strong> {profile.userType}
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>Global role:</strong> {profile.globalRole}
        </p>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Reputation (overall)</h2>
        <p style={{ fontSize: 13 }}>
          <strong>Rating:</strong> {displayedReputation.toFixed(1)} / 5 ·
          <span style={{ marginLeft: 4 }}>
            {profile.reputation.count} rating{profile.reputation.count === 1 ? "" : "s"}
          </span>
        </p>
        {profile.reputation.override != null && (
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            (Includes admin override of {profile.reputation.override}/5)
          </p>
        )}
        {canRate && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              setRatingError(null);
              const token = localStorage.getItem("accessToken");
              if (!token) {
                setRatingError("Missing access token.");
                return;
              }
              if (!ratingLevel) {
                setRatingError("Select a level.");
                return;
              }
              try {
                setRatingSaving(true);
                const res = await fetch(`${API_BASE}/reputation/user/${profile.id}/overall`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ score: Number(ratingLevel), comment: ratingComment || undefined }),
                });
                if (!res.ok) {
                  const text = await res.text();
                  throw new Error(`Failed to submit overall rating (${res.status}): ${text}`);
                }
                setRatingLevel("");
                setRatingComment("");
              } catch (err: any) {
                setRatingError(err.message || "Failed to submit overall rating.");
              } finally {
                setRatingSaving(false);
              }
            }}
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600 }}>Add overall employer rating:</span>
            <select
              value={ratingLevel}
              onChange={e => setRatingLevel(e.target.value)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="">Level…</option>
              <option value="1">1 – Novice</option>
              <option value="2">2 – Beginner</option>
              <option value="3">3 – Competent</option>
              <option value="4">4 – Proficient</option>
              <option value="5">5 – Expert</option>
            </select>
            <input
              type="text"
              placeholder="Optional comment"
              value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <button
              type="submit"
              disabled={ratingSaving}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: ratingSaving ? "#e5e7eb" : "#0f172a",
                color: ratingSaving ? "#4b5563" : "#f9fafb",
                cursor: ratingSaving ? "default" : "pointer",
              }}
            >
              {ratingSaving ? "Saving…" : "Save overall rating"}
            </button>
            {ratingError && (
              <span style={{ color: "#b91c1c" }}>{ratingError}</span>
            )}
          </form>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Skills</h2>
        {canRate && (
          <form
            onSubmit={handleAddRating}
            style={{
              marginBottom: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600 }}>Add employer rating:</span>
            <select
              value={ratingSkillId}
              onChange={e => setRatingSkillId(e.target.value)}
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="">Select skill…</option>
              {profile.skills.map(s => (
                <option key={s.id} value={s.id}>
                  {s.categoryLabel ? `${s.categoryLabel} – ${s.label}` : s.label}
                </option>
              ))}
            </select>
            <select
              value={ratingLevel}
              onChange={e => setRatingLevel(e.target.value)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="">Level…</option>
              <option value="1">1 – Novice</option>
              <option value="2">2 – Beginner</option>
              <option value="3">3 – Competent</option>
              <option value="4">4 – Proficient</option>
              <option value="5">5 – Expert</option>
            </select>
            <input
              type="text"
              placeholder="Optional comment"
              value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <button
              type="submit"
              disabled={ratingSaving}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: ratingSaving ? "#e5e7eb" : "#0f172a",
                color: ratingSaving ? "#4b5563" : "#f9fafb",
                cursor: ratingSaving ? "default" : "pointer",
              }}
            >
              {ratingSaving ? "Saving…" : "Save rating"}
            </button>
            {ratingError && (
              <span style={{ color: "#b91c1c" }}>{ratingError}</span>
            )}
          </form>
        )}

        {canClientRate && (
          <form
            onSubmit={handleAddClientRating}
            style={{
              marginBottom: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600 }}>Add client rating:</span>
            <select
              value={clientSkillId}
              onChange={e => setClientSkillId(e.target.value)}
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="">Select skill…</option>
              {profile.skills.map(s => (
                <option key={s.id} value={s.id}>
                  {s.categoryLabel ? `${s.categoryLabel} – ${s.label}` : s.label}
                </option>
              ))}
            </select>
            <select
              value={clientLevel}
              onChange={e => setClientLevel(e.target.value)}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="">Level…</option>
              <option value="1">1 – Novice</option>
              <option value="2">2 – Beginner</option>
              <option value="3">3 – Competent</option>
              <option value="4">4 – Proficient</option>
              <option value="5">5 – Expert</option>
            </select>
            <input
              type="text"
              placeholder="Optional comment"
              value={clientComment}
              onChange={e => setClientComment(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
              }}
            />
            <button
              type="submit"
              disabled={clientSaving}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: clientSaving ? "#e5e7eb" : "#0f172a",
                color: clientSaving ? "#4b5563" : "#f9fafb",
                cursor: clientSaving ? "default" : "pointer",
              }}
            >
              {clientSaving ? "Saving…" : "Save client rating"}
            </button>
            {clientError && (
              <span style={{ color: "#b91c1c" }}>{clientError}</span>
            )}
          </form>
        )}

        <div
          style={{
            maxHeight: 480,
            overflowY: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Skill</th>
                <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>Self</th>
                <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>Peer</th>
                <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>Client</th>
              </tr>
            </thead>
            <tbody>
              {categoryNames.map(category => {
                const trades = grouped[category] || {};
                const tradeNames = Object.keys(trades).sort((a, b) => a.localeCompare(b));

                return (
                  <Fragment key={category}>
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          backgroundColor: "#f9fafb",
                          padding: "8px",
                          fontSize: 12,
                          fontWeight: 700,
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {category}
                      </td>
                    </tr>
                    {tradeNames.map(trade => (
                      <Fragment key={`${category}:${trade}`}>
                        <tr>
                          <td
                            colSpan={4}
                            style={{
                              backgroundColor: "#ffffff",
                              padding: "6px 8px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#111827",
                              borderTop: "1px solid #e5e7eb",
                            }}
                          >
                            {trade}
                          </td>
                        </tr>
                        {(trades[trade] || []).map(skill => (
                          <tr key={skill.id}>
                            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                              {skill.label}
                            </td>
                            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                              {renderStars(skill.selfLevel, 16)}
                            </td>
                            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {renderStars(skill.employerAvgLevel, 14)}
                                <span style={{ fontSize: 11, color: "#6b7280" }}>
                                  {skill.employerAvgLevel != null
                                    ? `${skill.employerAvgLevel.toFixed(1)}/5`
                                    : "—"}
                                  {skill.employerRatingCount != null && skill.employerRatingCount > 0
                                    ? ` (${skill.employerRatingCount})`
                                    : ""}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                {renderStars(skill.clientAvgLevel, 14)}
                                <span style={{ fontSize: 11, color: "#6b7280" }}>
                                  {skill.clientAvgLevel != null
                                    ? `${skill.clientAvgLevel.toFixed(1)}/5`
                                    : "—"}
                                  {skill.clientRatingCount != null && skill.clientRatingCount > 0
                                    ? ` (${skill.clientRatingCount})`
                                    : ""}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}

              {profile.skills.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "8px", fontSize: 12, color: "#6b7280" }}>
                    No skills recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
