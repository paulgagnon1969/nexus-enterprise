"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatPhone } from "../../../lib/phone";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SkillRow {
  id: string;
  code: string;
  label: string;
  categoryLabel: string | null;
  tradeLabel: string | null;

  // Aggregate rating (employer + client), available to all viewers.
  aggregateAvgLevel: number | null;
  aggregateRatingCount: number;

  // Breakdown values: only visible to admins+ (API returns null for others).
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
  portfolio?: {
    headline: string | null;
    bio: string | null;
    photoUrl: string | null;
    updatedAt?: string;
  } | null;
  hr?: {
    displayEmail?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  worker?: {
    id: string;
    fullName: string | null;
    status: string | null;
    defaultProjectCode: string | null;
    primaryClassCode: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    unionLocal: string | null;
    dateHired: string | null;
    totalHoursCbs: number | null;
    totalHoursCct: number | null;
  } | null;
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
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);

  // Skills matrix style: category groups start collapsed by default.
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  // Employer skill rating (admins+)
  const [employerLevel, setEmployerLevel] = useState<string>("");
  const [employerNotes, setEmployerNotes] = useState("");
  const [employerSaving, setEmployerSaving] = useState(false);
  const [employerError, setEmployerError] = useState<string | null>(null);

  // Overall reputation rating (admins+)
  const [overallLevel, setOverallLevel] = useState<string>("");
  const [overallNotes, setOverallNotes] = useState("");
  const [overallSaving, setOverallSaving] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);

  // Client skill rating
  const [clientLevel, setClientLevel] = useState<string>("");
  const [clientComment, setClientComment] = useState("");
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // HR (confidential) card: shown only when backend provides HR payload and
  // collapsed by default so sensitive details are not immediately visible.
  const [hrCollapsed, setHrCollapsed] = useState(true);

  // Admin-only: per-skill rating details (including comments)
  const [detailsBySkillId, setDetailsBySkillId] = useState<Record<string, any>>({});
  const [detailsLoadingBySkillId, setDetailsLoadingBySkillId] = useState<Record<string, boolean>>({});
  const [detailsErrorBySkillId, setDetailsErrorBySkillId] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem("accessToken");

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

        // Default selection to the first skill so the right panel has context.
        if (Array.isArray(profileJson?.skills) && profileJson.skills[0]?.id) {
          setSelectedSkillId(prev => prev ?? profileJson.skills[0].id);
        }

        if (meRes.ok) {
          const me = await meRes.json();

          const isSuperAdmin = me.globalRole === "SUPER_ADMIN";
          const actorMemberships = Array.isArray(me.memberships) ? me.memberships : [];
          const targetCompanyId = profileJson?.company?.id;

          // Determine if actor can rate / view breakdown as employer (OWNER/ADMIN in this company)
          if (targetCompanyId) {
            const membership = actorMemberships.find((m: any) => m.companyId === targetCompanyId);
            if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
              setCanRate(true);
              setIsAdminOrAbove(true);
            }
          }

          if (isSuperAdmin) {
            setCanRate(true);
            setIsAdminOrAbove(true);
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

  useEffect(() => {
    // Keep hooks above conditional returns to avoid "Rendered more hooks than during the previous render".
    if (!profile) return;
    if (!isAdminOrAbove) return;
    if (!selectedSkillId) return;

    const profileId = profile.id;
    const skillId = selectedSkillId;

    if (detailsBySkillId[skillId]) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    async function loadDetails() {
      try {
        setDetailsLoadingBySkillId(prev => ({ ...prev, [skillId]: true }));
        setDetailsErrorBySkillId(prev => ({ ...prev, [skillId]: null }));

        const res = await fetch(
          `${API_BASE}/skills/workers/${profileId}/details/${skillId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load skill details (${res.status})`);
        }

        const json = await res.json();
        setDetailsBySkillId(prev => ({ ...prev, [skillId]: json }));
      } catch (e: any) {
        setDetailsErrorBySkillId(prev => ({
          ...prev,
          [skillId]: e?.message ?? "Failed to load details",
        }));
      } finally {
        setDetailsLoadingBySkillId(prev => ({ ...prev, [skillId]: false }));
      }
    }

    void loadDetails();
  }, [profile, isAdminOrAbove, selectedSkillId, detailsBySkillId]);

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
  const hasHr = !!profile.hr;
  const hasWorker = !!profile.worker;

  const workerLink =
    profile.worker && profile.worker.id
      ? `/workers/${profile.worker.id}/weeks`
      : null;

  async function handleAddEmployerRating(e: FormEvent) {
    e.preventDefault();
    setEmployerError(null);

    if (!selectedSkillId || !employerLevel) {
      setEmployerError("Select a skill and level.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setEmployerError("Missing access token.");
      return;
    }

    if (!profile) {
      setEmployerError("Profile not loaded.");
      return;
    }

    try {
      setEmployerSaving(true);
      const res = await fetch(`${API_BASE}/skills/workers/${profile.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          skillId: selectedSkillId,
          level: Number(employerLevel),
          comment: employerNotes.trim() || undefined,
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
              skills: prev.skills.map(s => {
                if (s.id !== updated.skillId) return s;

                const employerAvgLevel = updated.employerAvgLevel ?? null;
                const employerRatingCount = updated.employerRatingCount ?? null;

                const employerCount = employerRatingCount ?? 0;
                const clientCount = s.clientRatingCount ?? 0;
                const totalCount = employerCount + clientCount;

                const sum =
                  (employerAvgLevel != null ? employerAvgLevel * employerCount : 0) +
                  (s.clientAvgLevel != null ? s.clientAvgLevel * clientCount : 0);

                const aggregateAvgLevel = totalCount > 0 ? sum / totalCount : null;

                return {
                  ...s,
                  employerAvgLevel,
                  employerRatingCount,
                  aggregateAvgLevel,
                  aggregateRatingCount: totalCount,
                };
              }),
            }
          : prev
      );

      setEmployerLevel("");
      setEmployerNotes("");
    } catch (err: any) {
      setEmployerError(err.message || "Failed to add rating.");
    } finally {
      setEmployerSaving(false);
    }
  }

  async function handleAddClientRating(e: FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (!selectedSkillId || !clientLevel) {
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
          skillId: selectedSkillId,
          level: Number(clientLevel),
          comment: clientComment.trim() || undefined,
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
              skills: prev.skills.map(s => {
                if (s.id !== updated.skillId) return s;

                const clientAvgLevel = updated.clientAvgLevel ?? null;
                const clientRatingCount = updated.clientRatingCount ?? null;

                const employerCount = s.employerRatingCount ?? 0;
                const clientCount = clientRatingCount ?? 0;
                const totalCount = employerCount + clientCount;

                const sum =
                  (s.employerAvgLevel != null ? s.employerAvgLevel * employerCount : 0) +
                  (clientAvgLevel != null ? clientAvgLevel * clientCount : 0);

                const aggregateAvgLevel = totalCount > 0 ? sum / totalCount : null;

                return {
                  ...s,
                  clientAvgLevel,
                  clientRatingCount,
                  aggregateAvgLevel,
                  aggregateRatingCount: totalCount,
                };
              }),
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

  const getSkillSort = (s: SkillRow): { rated: boolean; score: number } => {
    // Prefer aggregate (employer+client) if present, otherwise fall back to self.
    if (typeof s.aggregateAvgLevel === "number" && s.aggregateRatingCount > 0) {
      return { rated: true, score: s.aggregateAvgLevel };
    }

    if (typeof s.selfLevel === "number") {
      return { rated: true, score: s.selfLevel };
    }

    return { rated: false, score: -1 };
  };

  const categoryNames = Array.from(
    new Set(profile.skills.map(s => (s.categoryLabel || "Other").trim() || "Other"))
  );

  const categoryGroups = categoryNames
    .map(categoryLabel => {
      const groupSkills = profile.skills
        .filter(s => {
          const cat = (s.categoryLabel || "Other").trim() || "Other";
          return cat === categoryLabel;
        })
        .sort((a, b) => {
          const aSort = getSkillSort(a);
          const bSort = getSkillSort(b);

          if (aSort.rated !== bSort.rated) return aSort.rated ? -1 : 1;
          if (bSort.score !== aSort.score) return bSort.score - aSort.score;
          return a.label.localeCompare(b.label);
        });

      const ratedSelf = groupSkills.filter(
        s => typeof s.selfLevel === "number" && s.selfLevel >= 1 && s.selfLevel <= 5
      );
      const avgSelf = ratedSelf.length
        ? ratedSelf.reduce((sum, s) => sum + (s.selfLevel as number), 0) / ratedSelf.length
        : null;

      const ratedAgg = groupSkills.filter(s => getSkillSort(s).rated);
      const maxScore = ratedAgg.reduce((max, s) => {
        const { score } = getSkillSort(s);
        return score > max ? score : max;
      }, -1);

      // For display: still compute a weighted aggregate where possible.
      const ratedByAgg = groupSkills.filter(
        s => s.aggregateAvgLevel != null && s.aggregateRatingCount > 0
      );
      const aggCount = ratedByAgg.reduce((sum, s) => sum + s.aggregateRatingCount, 0);
      const aggSum = ratedByAgg.reduce(
        (sum, s) => sum + (s.aggregateAvgLevel as number) * s.aggregateRatingCount,
        0,
      );
      const avgAggregate = aggCount > 0 ? aggSum / aggCount : null;

      const peerRated = groupSkills.filter(s => s.employerAvgLevel != null);
      const avgPeer = peerRated.length
        ? peerRated.reduce((sum, s) => sum + (s.employerAvgLevel as number), 0) / peerRated.length
        : null;

      const clientRated = groupSkills.filter(s => s.clientAvgLevel != null);
      const avgClient = clientRated.length
        ? clientRated.reduce((sum, s) => sum + (s.clientAvgLevel as number), 0) / clientRated.length
        : null;

      return {
        categoryLabel,
        skills: groupSkills,
        ratedCount: ratedAgg.length,
        totalCount: groupSkills.length,
        avgSelf,
        avgPeer,
        avgClient,
        avgAggregate,
        maxScore,
      };
    })
    .filter(g => g.totalCount > 0)
    .sort((a, b) => {
      if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
      if (b.ratedCount !== a.ratedCount) return b.ratedCount - a.ratedCount;
      return a.categoryLabel.localeCompare(b.categoryLabel);
    });

  return (
    <div
      className="app-card"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ marginBottom: 8 }}>
          <a
            href="/company/users"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#2563eb",
              textDecoration: "none",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 14 }}>
              ←
            </span>
            <span>Return to Company users list</span>
          </a>
        </div>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Worker profile</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          {profile.company.name} · {profile.companyRole}
        </p>

        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Identity</h2>
          <p style={{ fontSize: 13 }}>
            <strong>Email:</strong>{" "}
            <a
              href={`mailto:${profile.email}`}
              style={{ color: "#2563eb", textDecoration: "none" }}
            >
              {profile.email}
            </a>
          </p>
          <p style={{ fontSize: 13 }}>
            <strong>User type:</strong> {profile.userType}
          </p>
          <p style={{ fontSize: 13 }}>
            <strong>Global role:</strong> {profile.globalRole}
          </p>
        </section>

        {(hasHr || hasWorker) && (
          <section style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>Contact & HR</h2>

            {hasWorker && profile.worker && (
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <div>
                  <strong>Worker record:</strong>{" "}
                  {profile.worker.fullName || "Imported worker"}
                  {workerLink && (
                    <>
                      {" "}·{" "}
                      <a
                        href={workerLink}
                        style={{ color: "#2563eb", textDecoration: "none", fontSize: 12 }}
                      >
                        View weekly hours
                      </a>
                    </>
                  )}
                </div>
                {profile.worker.phone && (
                  <div>
                    <strong>Worker phone:</strong>{" "}
                    {(() => {
                      const formatted = formatPhone(
                        profile.worker?.phone ?? null,
                        profile.hr?.country ?? "US",
                      );
                      if (!formatted) return profile.worker?.phone;
                      return (
                        <a
                          href={formatted.href}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          {formatted.display}
                        </a>
                      );
                    })()}
                  </div>
                )}
                {profile.worker.city && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {profile.worker.city}
                    {profile.worker.state ? `, ${profile.worker.state}` : ""}
                    {profile.worker.postalCode ? ` ${profile.worker.postalCode}` : ""}
                  </div>
                )}
              </div>
            )}

            {hasHr && profile.hr && (
              <div
                style={{
                  marginTop: hasWorker ? 8 : 0,
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid #fee2e2",
                  background: "#fef2f2",
                  fontSize: 13,
                }}
              >
                <button
                  type="button"
                  onClick={() => setHrCollapsed(prev => !prev)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: 0,
                    margin: 0,
                    border: "none",
                    background: "transparent",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <span>HR (confidential)</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {hrCollapsed ? "Show" : "Hide"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        border: `1px solid ${hrCollapsed ? "#b91c1c" : "#16a34a"}`,
                        color: hrCollapsed ? "#b91c1c" : "#166534",
                        backgroundColor: hrCollapsed ? "#fef2f2" : "#ecfdf3",
                        textTransform: "uppercase",
                        letterSpacing: 0.3,
                      }}
                    >
                      {hrCollapsed ? "Lock" : "Open"}
                    </span>
                  </span>
                </button>

                {!hrCollapsed && (
                  <div style={{ marginTop: 6 }}>
                    <p style={{ margin: 0 }}>
                      <strong>HR email:</strong>{" "}
                      {profile.hr.displayEmail ? (
                        <a
                          href={`mailto:${profile.hr.displayEmail}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          {profile.hr.displayEmail}
                        </a>
                      ) : (
                        "—"
                      )}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>HR phone:</strong>{" "}
                      {(() => {
                        const formatted = formatPhone(
                          profile.hr?.phone ?? null,
                          profile.hr?.country ?? "US",
                        );
                        if (!formatted) return "—";
                        return (
                          <a
                            href={formatted.href}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            {formatted.display}
                          </a>
                        );
                      })()}
                    </p>
                    <p style={{ margin: 0, marginTop: 4 }}>
                      <strong>Address:</strong>{" "}
                      {(() => {
                        const parts: string[] = [];
                        if (profile.hr.addressLine1) parts.push(profile.hr.addressLine1);
                        if (profile.hr.addressLine2) parts.push(profile.hr.addressLine2);
                        const cityStateHr = [profile.hr.city, profile.hr.state]
                          .filter(Boolean)
                          .join(", ");
                        if (cityStateHr) parts.push(cityStateHr);
                        if (profile.hr.postalCode) parts.push(profile.hr.postalCode);
                        const addr = parts.join(", ");
                        if (!addr) return "—";
                        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          addr,
                        )}`;
                        return (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            {addr}
                          </a>
                        );
                      })()}
                    </p>
                    {profile.hr.country && (
                      <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: "#6b7280" }}>
                        {profile.hr.country}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

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
                setOverallError(null);
                const token = localStorage.getItem("accessToken");
                if (!token) {
                  setOverallError("Missing access token.");
                  return;
                }
                if (!overallLevel) {
                  setOverallError("Select a level.");
                  return;
                }
                try {
                  setOverallSaving(true);
                  const res = await fetch(`${API_BASE}/reputation/user/${profile.id}/overall`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ score: Number(overallLevel), comment: overallNotes.trim() || undefined }),
                  });
                  if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Failed to submit overall rating (${res.status}): ${text}`);
                  }
                  setOverallLevel("");
                  setOverallNotes("");
                } catch (err: any) {
                  setOverallError(err.message || "Failed to submit overall rating.");
                } finally {
                  setOverallSaving(false);
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
                value={overallLevel}
                onChange={e => setOverallLevel(e.target.value)}
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
                value={overallNotes}
                onChange={e => setOverallNotes(e.target.value)}
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
                disabled={overallSaving}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: overallSaving ? "#e5e7eb" : "#0f172a",
                  color: overallSaving ? "#4b5563" : "#f9fafb",
                  cursor: overallSaving ? "default" : "pointer",
                }}
              >
                {overallSaving ? "Saving…" : "Save overall rating"}
              </button>
              {overallError && (
                <span style={{ color: "#b91c1c" }}>{overallError}</span>
              )}
            </form>
          )}
        </section>
      </div>

      <section style={{ marginTop: 16, flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Skills</h2>

        <div style={{ display: "flex", gap: 16, alignItems: "stretch", flex: "1 1 auto", minHeight: 0 }}>
          {/* Left: compact matrix (groupings + ratings) */}
          <div style={{ flex: "0 0 760px", maxWidth: 760, minHeight: 0, display: "flex" }}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  tableLayout: "fixed",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", width: 320 }}>Skill</th>
                    {isAdminOrAbove ? (
                      <>
                        <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 140 }}>
                          Self
                        </th>
                        <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 140 }}>
                          Peer
                        </th>
                        <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 140 }}>
                          Client
                        </th>
                      </>
                    ) : (
                      <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: 180 }}>
                        Rating
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {categoryGroups.map((g, gIdx) => {
                    const expanded = !!expandedCategories[g.categoryLabel];
                    const roundedSelf = g.avgSelf != null ? Math.round(g.avgSelf) : null;
                    const roundedAgg = g.avgAggregate != null ? Math.round(g.avgAggregate) : null;

                    return (
                      <Fragment key={g.categoryLabel}>
                        <tr
                          style={{
                            backgroundColor: gIdx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                          }}
                        >
                          <td
                            style={{
                              padding: "10px 10px",
                              borderTop: "1px solid #e5e7eb",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                            onClick={() =>
                              setExpandedCategories(prev => ({
                                ...prev,
                                [g.categoryLabel]: !prev[g.categoryLabel],
                              }))
                            }
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span>
                                {expanded ? "▾" : "▸"} {g.categoryLabel}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                                Rated {g.ratedCount}/{g.totalCount}
                              </span>
                            </div>
                          </td>

                          {isAdminOrAbove ? (
                            <>
                              <td
                                style={{
                                  padding: "10px 10px",
                                  borderTop: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(roundedSelf, 14)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgSelf != null ? `${g.avgSelf.toFixed(1)}/5` : "—"}
                                  </span>
                                </div>
                              </td>
                              <td
                                style={{
                                  padding: "10px 10px",
                                  borderTop: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(g.avgPeer, 12)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgPeer != null ? `${g.avgPeer.toFixed(1)}/5` : "—"}
                                  </span>
                                </div>
                              </td>
                              <td
                                style={{
                                  padding: "10px 10px",
                                  borderTop: "1px solid #e5e7eb",
                                  whiteSpace: "nowrap",
                                  textAlign: "left",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(g.avgClient, 12)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgClient != null ? `${g.avgClient.toFixed(1)}/5` : "—"}
                                  </span>
                                </div>
                              </td>
                            </>
                          ) : (
                            <td
                              style={{
                                padding: "10px 10px",
                                borderTop: "1px solid #e5e7eb",
                                whiteSpace: "nowrap",
                                textAlign: "left",
                              }}
                            >
                              {g.avgAggregate == null ? (
                                <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                              ) : (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  {renderStars(roundedAgg, 14)}
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                                    {g.avgAggregate.toFixed(1)}/5
                                  </span>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>

                        {expanded &&
                          g.skills.map((skill, idx) => {
                            const selected = selectedSkillId === skill.id;

                            return (
                              <tr
                                key={skill.id}
                                onClick={() => {
                                  setSelectedSkillId(skill.id);
                                  setEmployerLevel("");
                                  setEmployerNotes("");
                                  setClientLevel("");
                                  setClientComment("");
                                }}
                                style={{
                                  backgroundColor: selected
                                    ? "#eff6ff"
                                    : idx % 2 === 0
                                    ? "#ffffff"
                                    : "#fcfcfd",
                                  cursor: "pointer",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "8px 10px 8px 26px",
                                    borderTop: "1px solid #e5e7eb",
                                    fontWeight: selected ? 600 : 400,
                                    borderLeft: selected ? "3px solid #2563eb" : "3px solid transparent",
                                  }}
                                >
                                  <div>{skill.label}</div>
                                  {skill.tradeLabel && (
                                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                                      {skill.tradeLabel}
                                    </div>
                                  )}
                                </td>

                                {isAdminOrAbove ? (
                                  <>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        borderTop: "1px solid #e5e7eb",
                                        whiteSpace: "nowrap",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(skill.selfLevel, 16)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.selfLevel != null ? `${skill.selfLevel}/5` : "—"}
                                        </span>
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        borderTop: "1px solid #e5e7eb",
                                        whiteSpace: "nowrap",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(skill.employerAvgLevel, 12)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.employerAvgLevel != null
                                            ? `${skill.employerAvgLevel.toFixed(1)}/5 (${skill.employerRatingCount ?? 0})`
                                            : "—"}
                                        </span>
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "8px 10px",
                                        borderTop: "1px solid #e5e7eb",
                                        whiteSpace: "nowrap",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(skill.clientAvgLevel, 12)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.clientAvgLevel != null
                                            ? `${skill.clientAvgLevel.toFixed(1)}/5 (${skill.clientRatingCount ?? 0})`
                                            : "—"}
                                        </span>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <td
                                    style={{
                                      padding: "8px 10px",
                                      borderTop: "1px solid #e5e7eb",
                                      whiteSpace: "nowrap",
                                      textAlign: "left",
                                    }}
                                  >
                                    {skill.aggregateAvgLevel == null ? (
                                      <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                                    ) : (
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                        {renderStars(Math.round(skill.aggregateAvgLevel), 14)}
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          {skill.aggregateAvgLevel.toFixed(1)}/5 ({skill.aggregateRatingCount})
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}

                  {profile.skills.length === 0 && (
                    <tr>
                      <td colSpan={isAdminOrAbove ? 4 : 2} style={{ padding: "8px", fontSize: 12, color: "#6b7280" }}>
                        No skills recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: details panel (comments + future portfolio) */}
          <div style={{ flex: 1, minWidth: 260, minHeight: 0, display: "flex" }}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 12,
                background: "#ffffff",
              }}
            >
              {!selectedSkillId ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>Select a skill to view details.</div>
              ) : (() => {
                const skill = profile.skills.find(s => s.id === selectedSkillId) || null;
                const detailsLoading = !!detailsLoadingBySkillId[selectedSkillId];
                const detailsError = detailsErrorBySkillId[selectedSkillId];
                const details = detailsBySkillId[selectedSkillId];

                if (!skill) {
                  return <div style={{ fontSize: 12, color: "#6b7280" }}>Skill not found.</div>;
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{skill.label}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {(skill.categoryLabel || "Other") + (skill.tradeLabel ? ` · ${skill.tradeLabel}` : "")}
                      </div>
                    </div>

                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Ratings</div>
                      {isAdminOrAbove ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Self</div>
                            {renderStars(skill.selfLevel, 16)}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Peer</div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderStars(skill.employerAvgLevel, 14)}
                              <span style={{ fontSize: 11, color: "#6b7280" }}>
                                {skill.employerAvgLevel != null
                                  ? `${skill.employerAvgLevel.toFixed(1)}/5 (${skill.employerRatingCount ?? 0})`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>Client</div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {renderStars(skill.clientAvgLevel, 14)}
                              <span style={{ fontSize: 11, color: "#6b7280" }}>
                                {skill.clientAvgLevel != null
                                  ? `${skill.clientAvgLevel.toFixed(1)}/5 (${skill.clientRatingCount ?? 0})`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {skill.aggregateAvgLevel == null ? (
                            <span style={{ color: "#6b7280" }}>No ratings yet.</span>
                          ) : (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              {renderStars(Math.round(skill.aggregateAvgLevel), 16)}
                              <span style={{ color: "#6b7280" }}>
                                {skill.aggregateAvgLevel.toFixed(1)}/5 ({skill.aggregateRatingCount})
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {canRate && (
                      <form onSubmit={handleAddEmployerRating} style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Add / update employer rating</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                          <select
                            value={employerLevel}
                            onChange={e => setEmployerLevel(e.target.value)}
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
                          <textarea
                            placeholder="Comments / clarifications (optional)"
                            value={employerNotes}
                            onChange={e => setEmployerNotes(e.target.value)}
                            rows={4}
                            style={{
                              flex: 1,
                              minWidth: 220,
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              resize: "vertical",
                            }}
                          />
                          <button
                            type="submit"
                            disabled={employerSaving}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 4,
                              border: "1px solid #0f172a",
                              backgroundColor: employerSaving ? "#e5e7eb" : "#0f172a",
                              color: employerSaving ? "#4b5563" : "#f9fafb",
                              cursor: employerSaving ? "default" : "pointer",
                            }}
                          >
                            {employerSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                        {employerError && (
                          <div style={{ color: "#b91c1c", marginTop: 6 }}>{employerError}</div>
                        )}
                      </form>
                    )}

                    {canClientRate && (
                      <form onSubmit={handleAddClientRating} style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Add client rating</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
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
                          <textarea
                            placeholder="Client comment (optional)"
                            value={clientComment}
                            onChange={e => setClientComment(e.target.value)}
                            rows={3}
                            style={{
                              flex: 1,
                              minWidth: 220,
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              resize: "vertical",
                            }}
                          />
                          <button
                            type="submit"
                            disabled={clientSaving}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 4,
                              border: "1px solid #0f172a",
                              backgroundColor: clientSaving ? "#e5e7eb" : "#0f172a",
                              color: clientSaving ? "#4b5563" : "#f9fafb",
                              cursor: clientSaving ? "default" : "pointer",
                            }}
                          >
                            {clientSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                        {clientError && (
                          <div style={{ color: "#b91c1c", marginTop: 6 }}>{clientError}</div>
                        )}
                      </form>
                    )}

                    {isAdminOrAbove && (
                      <div style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Peer / client comments</div>
                        {detailsLoading ? (
                          <div style={{ color: "#6b7280" }}>Loading comments…</div>
                        ) : detailsError ? (
                          <div style={{ color: "#b91c1c" }}>{detailsError}</div>
                        ) : (
                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 220, flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Peer</div>
                              {details?.peerRatings?.filter((r: any) => r.comment)?.length ? (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {details.peerRatings
                                    .filter((r: any) => r.comment)
                                    .map((r: any) => (
                                      <li key={r.id} style={{ marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600 }}>{r.level}/5</span> — {r.comment}
                                      </li>
                                    ))}
                                </ul>
                              ) : (
                                <div style={{ color: "#6b7280" }}>No peer comments yet.</div>
                              )}
                            </div>
                            <div style={{ minWidth: 220, flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Client</div>
                              {details?.clientRatings?.filter((r: any) => r.comment)?.length ? (
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {details.clientRatings
                                    .filter((r: any) => r.comment)
                                    .map((r: any) => (
                                      <li key={r.id} style={{ marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600 }}>{r.level}/5</span> — {r.comment}
                                      </li>
                                    ))}
                                </ul>
                              ) : (
                                <div style={{ color: "#6b7280" }}>No client comments yet.</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Portfolio (Line card / work deck)</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
                        Coming next: uploads + links curated by the tradesman per skill.
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          type="url"
                          placeholder="Add a link (e.g. portfolio page)"
                          disabled
                          style={{
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            background: "#f9fafb",
                          }}
                        />
                        <input type="file" multiple disabled />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
