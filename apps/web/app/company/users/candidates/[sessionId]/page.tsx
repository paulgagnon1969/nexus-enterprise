"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  profile?: CandidateProfile | null;
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
          profile: json.profile ?? null,
          bankInfo: json.bankInfo ?? null,
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

    void loadMe();
  }, [session?.companyId]);

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

  return (
    <div className="app-card">
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
          {session.profile?.phone ? (
            <a
              href={`tel:${session.profile.phone.replace(/[^\\d+]/g, "")}`}
              style={{ color: "#2563eb", textDecoration: "none" }}
            >
              {session.profile.phone}
            </a>
          ) : (
            <span>—</span>
          )}
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
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          <strong>Submitted / created:</strong>{" "}
          <span>{new Date(session.createdAt).toLocaleString()}</span>
        </p>
      </section>

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
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Skill</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Trade</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Level</th>
                </tr>
              </thead>
              <tbody>
                {skills
                  .filter(s => s.level != null)
                  .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
                  .map(s => (
                    <tr key={s.id}>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>{s.label}</td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                        {s.tradeLabel || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                        {s.level != null ? (
                          <span>
                            {renderStars(s.level, 12)}{" "}
                            <span style={{ marginLeft: 4 }}>{s.level}/5</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
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
        </section>
      )}
    </div>
  );
}
