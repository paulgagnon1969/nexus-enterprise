"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ChecklistState {
  profileComplete?: boolean;
  photoUploaded?: boolean;
  govIdUploaded?: boolean;
  [key: string]: any;
}

interface SessionSummary {
  id: string;
  email: string;
  status: string;
  checklist: ChecklistState;
}

interface SkillDto {
  id: string;
  code: string;
  label: string;
  categoryId: string;
  categoryCode: string | null;
  categoryLabel: string | null;
  level: number | null;
}

export default function PublicOnboardingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [skills, setSkills] = useState<SkillDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [submittingSkills, setSubmittingSkills] = useState(false);
  const [submittingFinal, setSubmittingFinal] = useState(false);

  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const [sessionRes, skillsRes] = await Promise.all([
          fetch(`${API_BASE}/onboarding/${token}`),
          fetch(`${API_BASE}/onboarding/${token}/skills`)
        ]);

        if (!sessionRes.ok) {
          throw new Error("Onboarding link is invalid or expired.");
        }
        const sessionJson = await sessionRes.json();
        setSession(sessionJson);

        if (skillsRes.ok) {
          const skillsJson = await skillsRes.json();
          setSkills(skillsJson.skills || []);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load onboarding session.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [token]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmittingProfile(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/onboarding/${token}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone })
      });
      if (!res.ok) {
        throw new Error("Failed to save your information.");
      }
      const json = await res.json();
      setSession(s => (s ? { ...s, status: json.status, checklist: json.checklist } : json));
    } catch (e: any) {
      setError(e?.message ?? "Failed to save your information.");
    } finally {
      setSubmittingProfile(false);
    }
  }

  async function handleSubmitAll() {
    if (!token) return;
    setSubmittingFinal(true);
    setError(null);

    try {
      // Persist skills before final submit
      if (skills.length > 0) {
        const ratings = skills
          .filter(s => s.level && s.level >= 1 && s.level <= 5)
          .map(s => ({ skillId: s.id, level: s.level }));
        await fetch(`${API_BASE}/onboarding/${token}/skills`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings })
        });
      }

      const res = await fetch(`${API_BASE}/onboarding/${token}/submit`, {
        method: "POST"
      });
      if (!res.ok) {
        throw new Error("Failed to submit onboarding.");
      }
      const json = await res.json();
      setSession(s => (s ? { ...s, status: json.status } : s));
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit onboarding.");
    } finally {
      setSubmittingFinal(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: "2rem" }}>
        <p>Loading onboardingeee</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Onboarding</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Onboarding</h1>
        <p>We could not find this onboarding session.</p>
      </main>
    );
  }

  const checklist = session.checklist || {};

  const submitted = session.status === "SUBMITTED" || session.status === "UNDER_REVIEW" || session.status === "APPROVED";

  return (
    <main style={{ padding: "2rem" }}>
      <h1 style={{ marginTop: 0 }}>Nexus onboarding</h1>
      <p style={{ fontSize: 14, color: "#6b7280" }}>
        Help us get you ready to work by completing a few quick steps.
      </p>

      <section style={{ marginTop: "1.5rem", maxWidth: 480 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Your information</h2>
        <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 14 }}>
            First name
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Last name
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Mobile phone
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <button
            type="submit"
            disabled={submittingProfile}
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 4,
              border: "none",
              backgroundColor: submittingProfile ? "#e5e7eb" : "#0f172a",
              color: submittingProfile ? "#4b5563" : "#f9fafb",
              fontSize: 14,
              cursor: submittingProfile ? "default" : "pointer"
            }}
          >
            {submittingProfile ? "Savingeee" : "Save"}
          </button>
        </form>
      </section>

      <section style={{ marginTop: "1.5rem", maxWidth: 640 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Your trade skills</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          Tell us where youre strongest. You can update this later from your profile.
        </p>
        <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Category</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Skill</th>
                <th style={{ textAlign: "left", padding: "6px 8px", width: 140 }}>Your level (15)</th>
              </tr>
            </thead>
            <tbody>
              {skills.map(skill => (
                <tr key={skill.id}>
                  <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                    {skill.categoryLabel || skill.categoryCode || ""}
                  </td>
                  <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>{skill.label}</td>
                  <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                    <select
                      value={skill.level ?? ""}
                      onChange={e => {
                        const value = e.target.value ? Number(e.target.value) : null;
                        setSkills(prev =>
                          prev.map(s =>
                            s.id === skill.id
                              ? {
                                  ...s,
                                  level: value,
                                }
                              : s
                          )
                        );
                      }}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    >
                      <option value="">Not set</option>
                      <option value={1}>1 – Novice</option>
                      <option value={2}>2 – Beginner</option>
                      <option value={3}>3 – Competent</option>
                      <option value={4}>4 – Proficient</option>
                      <option value={5}>5 – Expert</option>
                    </select>
                  </td>
                </tr>
              ))}
              {skills.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "8px", fontSize: 12, color: "#6b7280" }}>
                    Skills matrix is loading or not configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem", maxWidth: 480 }}>
        <button
          type="button"
          disabled={submittingFinal || submitted}
          onClick={handleSubmitAll}
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            border: "none",
            backgroundColor: submitted ? "#16a34a" : "#2563eb",
            color: "#f9fafb",
            fontSize: 14,
            cursor: submitted ? "default" : "pointer"
          }}
        >
          {submitted ? "Submitted" : submittingFinal ? "Submittingeee" : "Submit onboarding"}
        </button>
        {submitted && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#16a34a" }}>
            Thank you 60e09fe your information has been submitted for review.
          </p>
        )}
      </section>

      {error && (
        <p style={{ marginTop: 16, fontSize: 13, color: "#b91c1c" }}>{error}</p>
      )}
    </main>
  );
}
