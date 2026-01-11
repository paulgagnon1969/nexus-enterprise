"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatPhone } from "../../../../lib/phone";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CandidateProfile {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dob?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

interface CandidateSessionForReview {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  companyId: string;
  token: string;
  userId?: string | null;
  profile?: CandidateProfile | null;
  detailStatusCode?: string | null;
  checklist?: {
    profileComplete?: boolean;
    photoUploaded?: boolean;
    govIdUploaded?: boolean;
    skillsComplete?: boolean;
    [key: string]: any;
  } | null;
  bankInfo?: {
    accountHolderName?: string | null;
    routingNumberMasked?: string | null;
    accountNumberMasked?: string | null;
    bankName?: string | null;
  } | null;
}

interface MeMembership {
  companyId: string;
  role: string;
}

interface MeResponse {
  id: string;
  email: string;
  globalRole?: string;
  memberships?: MeMembership[];
}

interface OnboardingSkillRow {
  id: string;
  label: string;
  tradeLabel?: string | null;
  categoryLabel?: string | null;
  level: number | null;
}

export default function CandidateDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;

  const [session, setSession] = useState<CandidateSessionForReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [skills, setSkills] = useState<OnboardingSkillRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
 
  const [canViewHr, setCanViewHr] = useState(false);
  const [detailStatusOptions, setDetailStatusOptions] = useState<
    { id: string; code: string; label: string; color?: string | null }[]
  >([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<
    { id: string; body: string; createdAt: string; senderEmail?: string | null }[]
  >([]);
  const [journalDraft, setJournalDraft] = useState("");
  const [savingJournal, setSavingJournal] = useState(false);

  // HR/admin-only editing of onboarding profile snapshot
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Collapse the HR onboarding profile card by default so sensitive fields
  // are not immediately visible; HR/admins can click to unlock.
  const [hrProfileCollapsed, setHrProfileCollapsed] = useState(true);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const categoryGroups = useMemo(
    () => {
      if (!skills.length) return [] as {
        categoryLabel: string;
        skills: OnboardingSkillRow[];
        ratedCount: number;
        totalCount: number;
        avgSelf: number | null;
      }[];

      const byCategory = new Map<string, OnboardingSkillRow[]>();
      for (const skill of skills) {
        const cat = (skill.categoryLabel || "Other").trim() || "Other";
        const existing = byCategory.get(cat) ?? [];
        existing.push(skill);
        byCategory.set(cat, existing);
      }

      return Array.from(byCategory.entries())
        .map(([categoryLabel, groupSkills]) => {
          const rated = groupSkills.filter(s => typeof s.level === "number" && s.level != null);
          const avgSelf = rated.length
            ? rated.reduce((sum, s) => sum + (s.level ?? 0), 0) / rated.length
            : null;
          return {
            categoryLabel,
            skills: groupSkills,
            ratedCount: rated.length,
            totalCount: groupSkills.length,
            avgSelf,
          };
        })
        .sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel));
    },
    [skills],
  );

  useEffect(() => {
    if (!sessionId) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/onboarding/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load candidate (${res.status}) ${text}`);
        }

        const json = await res.json();

        setSession({
          id: json.id,
          email: json.email,
          status: json.status,
          createdAt: json.createdAt,
          companyId: json.companyId,
          token: json.token,
          userId: json.userId ?? null,
          profile: json.profile ?? null,
          bankInfo: json.bankInfo ?? null,
          checklist: json.checklist ?? null,
          detailStatusCode: json.detailStatusCode ?? null,
        });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load candidate.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [sessionId]);

  // Load self-assessed skills once we know the session token
  useEffect(() => {
    const token = session?.token;
    if (!token) return;

    async function loadSkills() {
      try {
        setSkillsLoading(true);
        setSkillsError(null);

        const res = await fetch(`${API_BASE}/onboarding/${token}/skills`);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load skills (${res.status}) ${text}`);
        }
        const json = await res.json();
        const rows: OnboardingSkillRow[] = Array.isArray(json.skills)
          ? json.skills.map((s: any) => ({
              id: s.id,
              label: s.label,
              tradeLabel: s.tradeLabel ?? null,
              categoryLabel: s.categoryLabel ?? null,
              level: typeof s.level === "number" ? s.level : null,
            }))
          : [];
        setSkills(rows);
      } catch (e: any) {
        setSkillsError(e?.message ?? "Failed to load skills.");
      } finally {
        setSkillsLoading(false);
      }
    }

    void loadSkills();
  }, [session?.token]);

  // Determine if viewer can see HR/confidential info for this candidate
  useEffect(() => {
    const companyId = session?.companyId;
    if (!companyId) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    async function loadDetailStatusDefs() {
      try {
        const res = await fetch(
          `${API_BASE}/onboarding/company/${companyId}/status-definitions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!Array.isArray(json)) return;
        setDetailStatusOptions(
          json.map((d: any) => ({
            id: d.id,
            code: d.code,
            label: d.label,
            color: d.color ?? null,
          })),
        );
      } catch {
        // non-fatal
      }
    }

    async function loadMe() {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const me: MeResponse = await res.json();

        const isSuperAdmin = me.globalRole === "SUPER_ADMIN";
        if (isSuperAdmin) {
          setCanViewHr(true);
          return;
        }

        const memberships = Array.isArray(me.memberships) ? me.memberships : [];
        const membership = memberships.find(m => m.companyId === companyId);
        if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
          setCanViewHr(true);
        }
      } catch {
        // non-fatal; leave canViewHr as false
      }
    }

    void Promise.all([loadDetailStatusDefs(), loadMe()]);
  }, [session?.companyId]);

  // Load journal entries for this candidate's underlying user when HR can view
  useEffect(() => {
    if (!canViewHr) return;
    const userId = session?.userId;
    if (!userId) return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    async function loadJournal() {
      try {
        setJournalLoading(true);
        setJournalError(null);
        const res = await fetch(`${API_BASE}/messages/journal/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load journal (${res.status}) ${text}`);
        }
        const json = await res.json();
        const msgs = Array.isArray(json?.messages) ? json.messages : [];
        setJournalEntries(
          msgs.map((m: any) => ({
            id: m.id,
            body: m.body ?? "",
            createdAt: m.createdAt,
            senderEmail: m.senderEmail ?? null,
          })),
        );
      } catch (e: any) {
        setJournalError(e?.message ?? "Failed to load journal entries.");
      } finally {
        setJournalLoading(false);
      }
    }

    void loadJournal();
  }, [canViewHr, session?.userId]);

  const renderStars = (value: number | null, size: number) => {
    const filledCount = value == null ? 0 : Math.round(value);
    return (
      <span style={{ display: "inline-flex", gap: 2, verticalAlign: "middle" }}>
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
                fill={active ? "#facc15" : "#ffffff"}
                stroke="#0f172a"
                strokeWidth={1}
              />
            </svg>
          );
        })}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading candidate…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Candidate</h1>
        <p style={{ color: "#b91c1c" }}>{error || "Candidate not found"}</p>
      </div>
    );
  }

  const nameParts = [session.profile?.firstName, session.profile?.lastName].filter(Boolean);
  const displayName = nameParts.length ? nameParts.join(" ") : "(no name yet)";

  const checklist = (session as any).checklist || {};
  const checklistItems: { key: string; label: string }[] = [
    { key: "profileComplete", label: "Profile information" },
    { key: "photoUploaded", label: "Photo uploaded" },
    { key: "govIdUploaded", label: "Government ID uploaded" },
    { key: "skillsComplete", label: "Skills self-assessment" },
  ];
  const completedChecklistCount = checklistItems.filter(i => checklist[i.key]).length;
  const checklistPercent = Math.round(
    (completedChecklistCount / (checklistItems.length || 1)) * 100,
  );

  return (
    <div className="app-card">
      <div style={{ marginBottom: 8 }}>
        <a
          href="/company/users?tab=candidates"
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
          <span>Back to prospective candidates</span>
        </a>
      </div>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Candidate</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Prospective worker from Nexis profile</p>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Contact</h2>
        <p style={{ fontSize: 13 }}>
          <strong>Name:</strong>{" "}
          <span>{displayName}</span>
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>Email:</strong>{" "}
          <a
            href={`mailto:${session.email}`}
            style={{ color: "#2563eb", textDecoration: "none" }}
          >
            {session.email}
          </a>
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>Phone:</strong>{" "}
          {(() => {
            const formatted = formatPhone(session.profile?.phone ?? null, "US");
            if (!formatted) return <span>—</span>;
            return (
              <a href={formatted.href} style={{ color: "#2563eb", textDecoration: "none" }}>
                {formatted.display}
              </a>
            );
          })()}
        </p>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Location</h2>
        <p style={{ fontSize: 13 }}>
          <strong>City / State:</strong>{" "}
          <span>
            {session.profile?.city || "—"}
            {session.profile?.state ? `, ${session.profile.state}` : ""}
          </span>
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>Postal code:</strong>{" "}
          <span>{session.profile?.postalCode || "—"}</span>
        </p>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Status</h2>
        <p style={{ fontSize: 13 }}>
          <strong>Onboarding status:</strong>{" "}
          <span>{session.status}</span>
        </p>
        {canViewHr && detailStatusOptions.length > 0 && (
          <p style={{ fontSize: 13, marginTop: 4 }}>
            <strong>Candidate status:</strong>{" "}
            <select
              value={session.detailStatusCode ?? ""}
              onChange={async e => {
                const nextCode = e.target.value || null;
                const token = window.localStorage.getItem("accessToken");
                if (!token) {
                  alert("Missing access token. Please log in again.");
                  return;
                }
                try {
                  const res = await fetch(
                    `${API_BASE}/onboarding/sessions/${session.id}/detail-status`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ detailStatusCode: nextCode }),
                    },
                  );
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(
                      `Failed to update candidate status (${res.status}) ${text}`,
                    );
                  }
                  setSession(prev => (prev ? { ...prev, detailStatusCode: nextCode } : prev));
                } catch (err: any) {
                  alert(err?.message ?? "Failed to update candidate status.");
                }
              }}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            >
              <option value="">(none)</option>
              {detailStatusOptions.map(opt => (
                <option key={opt.id} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </p>
        )}
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          <strong>Submitted / created:</strong>{" "}
          <span>{new Date(session.createdAt).toLocaleString()}</span>
        </p>
      </section>

      {canViewHr && (
        <section style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setHrProfileCollapsed(prev => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span>Onboarding profile (HR view)</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {hrProfileCollapsed ? "Show" : "Hide"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 999,
                    border: `1px solid ${hrProfileCollapsed ? "#b91c1c" : "#16a34a"}`,
                    color: hrProfileCollapsed ? "#b91c1c" : "#166534",
                    backgroundColor: hrProfileCollapsed ? "#fef2f2" : "#ecfdf3",
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                  }}
                >
                  {hrProfileCollapsed ? "Lock" : "Open"}
                </span>
              </span>
            </button>
          </div>

          <div
            style={{
              display: hrProfileCollapsed ? "none" : "block",
            }}
          >
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
                Editable snapshot of the candidates self-entered profile fields so HR can quickly
                see what is complete or missing and correct obvious issues.
              </p>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "#4b5563",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>
                  Profile completion:
                  {" "}
                  <strong>{isNaN(checklistPercent) ? "0" : checklistPercent}%</strong>
                </span>
                <span
                  style={{
                    flex: "0 0 120px",
                    height: 6,
                    borderRadius: 999,
                    background: "#e5e7eb",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${Math.min(100, Math.max(0, checklistPercent))}%`,
                      background: checklistPercent >= 80 ? "#16a34a" : "#f97316",
                    }}
                  />
                </span>
              </div>
              <div
                style={{
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  fontSize: 13,
                }}
              >
                <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Checklist</div>
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12 }}>
                {checklistItems.map(item => {
                  const done = !!checklist[item.key];
                  return (
                    <li key={item.key} style={{ marginBottom: 2 }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 12,
                          marginRight: 4,
                          color: done ? "#16a34a" : "#b91c1c",
                          fontWeight: 600,
                        }}
                      >
                        {done ? "✓" : "!"}
                      </span>
                      <span>{item.label}</span>
                      {!done && (
                        <span style={{ marginLeft: 4, color: "#b91c1c" }}>(missing)</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <div style={{ minWidth: 180 }}>
                <p style={{ margin: 0 }}>
                  <strong>First name:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.firstName ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                firstName: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.firstName ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 140,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Last name:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.lastName ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                lastName: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.lastName ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 140,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Phone:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.phone ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                phone: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.phone ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 140,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Date of birth:</strong>{" "}
                  <input
                    type="date"
                    value={session.profile?.dob ? String(session.profile.dob).slice(0, 10) : ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                dob: e.target.value || null,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      minWidth: 140,
                    }}
                  />
                </p>
              </div>

              <div style={{ minWidth: 220 }}>
                <p style={{ margin: 0 }}>
                  <strong>Address line 1:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.addressLine1 ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                addressLine1: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.addressLine1 ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 180,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Address line 2:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.addressLine2 ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                addressLine2: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      minWidth: 180,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>City:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.city ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                city: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.city ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 140,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>State:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.state ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                state: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.state ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 80,
                    }}
                  />
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Postal code:</strong>{" "}
                  <input
                    type="text"
                    value={session.profile?.postalCode ?? ""}
                    onChange={e =>
                      setSession(prev =>
                        prev
                          ? {
                              ...prev,
                              profile: {
                                ...(prev.profile || {}),
                                postalCode: e.target.value,
                              },
                            }
                          : prev,
                      )
                    }
                    style={{
                      fontSize: 12,
                      padding: "2px 4px",
                      borderRadius: 4,
                      border: `1px solid ${session.profile?.postalCode ? "#d1d5db" : "#fca5a5"}`,
                      minWidth: 100,
                    }}
                  />
                </p>
              </div>
            </div>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                type="button"
                disabled={savingProfile}
                onClick={async () => {
                  const token = window.localStorage.getItem("accessToken");
                  if (!token) {
                    alert("Missing access token. Please log in again.");
                    return;
                  }
                  try {
                    setSavingProfile(true);
                    setProfileError(null);
                    const res = await fetch(
                      `${API_BASE}/onboarding/sessions/${session.id}/profile`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          firstName: session.profile?.firstName ?? null,
                          lastName: session.profile?.lastName ?? null,
                          phone: session.profile?.phone ?? null,
                          dob: session.profile?.dob ? String(session.profile.dob).slice(0, 10) : null,
                          addressLine1: session.profile?.addressLine1 ?? null,
                          addressLine2: session.profile?.addressLine2 ?? null,
                          city: session.profile?.city ?? null,
                          state: session.profile?.state ?? null,
                          postalCode: session.profile?.postalCode ?? null,
                        }),
                      },
                    );
                    if (!res.ok) {
                      const text = await res.text().catch(() => "");
                      throw new Error(
                        `Failed to save onboarding profile (${res.status}) ${text}`,
                      );
                    }
                    const json = await res.json().catch(() => null);
                    if (json && json.profile) {
                      setSession(prev => (prev ? { ...prev, profile: json.profile } : prev));
                    }
                  } catch (err: any) {
                    setProfileError(err?.message ?? "Failed to save onboarding profile.");
                  } finally {
                    setSavingProfile(false);
                  }
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: savingProfile ? "#e5e7eb" : "#0f172a",
                  color: savingProfile ? "#4b5563" : "#f9fafb",
                  fontSize: 12,
                  cursor: savingProfile ? "default" : "pointer",
                }}
              >
                {savingProfile ? "Saving…" : "Save profile changes"}
              </button>
              {profileError && (
                <span style={{ fontSize: 11, color: "#b91c1c" }}>{profileError}</span>
              )}
            </div>
          </div>
          </div>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Self-assessed skills</h2>
        {skillsLoading ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading skills…</p>
        ) : skillsError ? (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>{skillsError}</p>
        ) : skills.length === 0 ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No self-assessed skills recorded yet.</p>
        ) : (
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
              marginTop: 4,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Division / functional area</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Skill</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Trade</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Level</th>
                </tr>
              </thead>
              <tbody>
                {categoryGroups.map(group => {
                  const ratedSkills = group.skills.filter(s => s.level != null);
                  if (!ratedSkills.length) {
                    return null;
                  }

                  const expanded = !!expandedCategories[group.categoryLabel];

                  return (
                    <>
                      <tr key={group.categoryLabel} style={{ backgroundColor: "#f3f4f6" }}>
                        <td
                          colSpan={4}
                          onClick={() =>
                            setExpandedCategories(prev => ({
                              ...prev,
                              [group.categoryLabel]: !prev[group.categoryLabel],
                            }))
                          }
                          style={{
                            padding: "6px 8px",
                            borderTop: "1px solid #e5e7eb",
                            fontWeight: 600,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <span>
                            {expanded ? "▾" : "▸"} {group.categoryLabel}
                          </span>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            Rated {group.ratedCount}/{group.totalCount}
                            {group.avgSelf != null && (
                              <>
                                {" · "}
                                {group.avgSelf.toFixed(1)}/5 avg
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                      {expanded &&
                        ratedSkills
                          .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
                          .map(skill => (
                            <tr key={skill.id}>
                              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }} />
                              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>{skill.label}</td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  fontSize: 12,
                                }}
                              >
                                {skill.tradeLabel || "—"}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  fontSize: 12,
                                }}
                              >
                                {skill.level != null ? (
                                  <span>
                                    {renderStars(skill.level, 12)}{" "}
                                    <span style={{ marginLeft: 4 }}>{skill.level}/5</span>
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canViewHr && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>HR (confidential)</h2>
          <p style={{ fontSize: 13 }}>
            <strong>Address:</strong>{" "}
            {(() => {
              const parts: string[] = [];
              if (session.profile?.addressLine1) parts.push(session.profile.addressLine1);
              if (session.profile?.addressLine2) parts.push(session.profile.addressLine2);
              const cityState = [session.profile?.city, session.profile?.state]
                .filter(Boolean)
                .join(", ");
              if (cityState) parts.push(cityState);
              if (session.profile?.postalCode) parts.push(session.profile.postalCode);
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
          {session.bankInfo && (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 6,
                border: "1px solid #fee2e2",
                background: "#fef2f2",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Bank info (masked)</div>
              <p style={{ margin: 0 }}>
                <strong>Bank:</strong>{" "}
                {session.bankInfo.bankName || "—"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Account holder:</strong>{" "}
                {session.bankInfo.accountHolderName || "—"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Routing:</strong>{" "}
                {session.bankInfo.routingNumberMasked || "—"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Account:</strong>{" "}
                {session.bankInfo.accountNumberMasked || "—"}
              </p>
            </div>
          )}

          {/* Journal section */}
          <div
            id="journal"
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px dashed #e5e7eb",
            }}
          >
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>Journal</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
              Internal notes and message history related to this candidate. Candidates can see
              high-level message history on their own journal board, but BCC details are hidden
              from their view.
            </p>

            {journalLoading ? (
              <p style={{ fontSize: 12, color: "#6b7280" }}>Loading journal…</p>
            ) : journalError ? (
              <p style={{ fontSize: 12, color: "#b91c1c" }}>{journalError}</p>
            ) : journalEntries.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6b7280" }}>No journal entries yet.</p>
            ) : (
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  padding: 8,
                }}
              >
                <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }}>
                  {journalEntries.map(entry => (
                    <li
                      key={entry.id}
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <div style={{ color: "#6b7280", fontSize: 11 }}>
                        {new Date(entry.createdAt).toLocaleString()}
                        {entry.senderEmail && (
                          <>
                            {" "}· <span>{entry.senderEmail}</span>
                          </>
                        )}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", color: "#111827" }}>
                        {entry.body}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Simple inline add-entry box for HR */}
            {session.userId && (
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  if (!journalDraft.trim()) return;
                  const token = window.localStorage.getItem("accessToken");
                  if (!token) {
                    alert("Missing access token. Please log in again.");
                    return;
                  }
                  try {
                    setSavingJournal(true);
                    const res = await fetch(
                      `${API_BASE}/messages/journal/user/${session.userId}/entries`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          body: journalDraft.trim(),
                          // Default: internal-only; toggle UI could set this true
                          shareWithSubject: false,
                        }),
                      },
                    );
                    if (!res.ok) {
                      const text = await res.text().catch(() => "");
                      throw new Error(`Failed to add journal entry (${res.status}) ${text}`);
                    }
                    const json = await res.json();
                    const created = json?.message ?? json;
                    setJournalEntries(prev => [
                      {
                        id: created.id,
                        body: created.body ?? journalDraft.trim(),
                        createdAt: created.createdAt ?? new Date().toISOString(),
                        senderEmail: created.senderEmail ?? null,
                      },
                      ...prev,
                    ]);
                    setJournalDraft("");
                  } catch (err: any) {
                    alert(err?.message ?? "Failed to add journal entry.");
                  } finally {
                    setSavingJournal(false);
                  }
                }}
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <label style={{ fontSize: 12, color: "#4b5563" }}>
                  Add HR-only journal note
                  <textarea
                    value={journalDraft}
                    onChange={e => setJournalDraft(e.target.value)}
                    rows={3}
                    style={{
                      marginTop: 4,
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    }}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={savingJournal || !journalDraft.trim()}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      backgroundColor:
                        savingJournal || !journalDraft.trim() ? "#e5e7eb" : "#0f172a",
                      color: savingJournal || !journalDraft.trim() ? "#4b5563" : "#f9fafb",
                      fontSize: 12,
                      cursor:
                        savingJournal || !journalDraft.trim() ? "default" : "pointer",
                    }}
                  >
                    {savingJournal ? "Saving…" : "Add journal entry"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
