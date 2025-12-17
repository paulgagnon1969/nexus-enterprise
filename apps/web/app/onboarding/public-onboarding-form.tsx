"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import StarRating from "../components/star-rating";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ChecklistState {
  profileComplete?: boolean;
  photoUploaded?: boolean;
  govIdUploaded?: boolean;
  skillsComplete?: boolean;
  [key: string]: any;
}

interface OnboardingProfileDto {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dob?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

interface OnboardingDocumentDto {
  id: string;
  type: "PHOTO" | "GOV_ID" | "OTHER";
  fileUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
}

interface SessionSummary {
  id: string;
  email: string;
  status: string;
  checklist: ChecklistState;
  createdAt?: string;
  profile?: OnboardingProfileDto | null;
  documents?: OnboardingDocumentDto[];
}

interface SkillDto {
  id: string;
  code: string;
  label: string;
  tradeLabel?: string | null;
  categoryId: string;
  categoryCode: string | null;
  categoryLabel: string | null;
  level: number | null;
}

export default function PublicOnboardingForm({ token }: { token: string }) {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [skills, setSkills] = useState<SkillDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingGovId, setUploadingGovId] = useState(false);
  const [submittingFinal, setSubmittingFinal] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [tradeFilter, setTradeFilter] = useState<string>("");
  const [skillSearch, setSkillSearch] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Profile fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("USA");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [govIdFile, setGovIdFile] = useState<File | null>(null);

  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const [sessionRes, skillsRes] = await Promise.all([
          fetch(`${API_BASE}/onboarding/${token}`),
          fetch(`${API_BASE}/onboarding/${token}/skills`),
        ]);

        if (!sessionRes.ok) {
          throw new Error("Onboarding link is invalid or expired.");
        }
        const sessionJson = await sessionRes.json();
        setSession(sessionJson);

        // Prefill profile values if the API returns them
        const profile: OnboardingProfileDto | null | undefined = sessionJson.profile;
        if (profile) {
          setFirstName(String(profile.firstName || ""));
          setLastName(String(profile.lastName || ""));
          setPhone(String(profile.phone || ""));
          setDob(profile.dob ? String(profile.dob).slice(0, 10) : "");
          setAddressLine1(String(profile.addressLine1 || ""));
          setAddressLine2(String(profile.addressLine2 || ""));
          setCity(String(profile.city || ""));
          setState(String(profile.state || ""));
          setPostalCode(String(profile.postalCode || ""));
          setCountry(String(profile.country || "USA"));
        }

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

  const submitted =
    session?.status === "SUBMITTED" ||
    session?.status === "UNDER_REVIEW" ||
    session?.status === "APPROVED";

  const checklist = session?.checklist || {};

  const categoryNames = useMemo(() => {
    return Array.from(
      new Set(skills.map(s => (s.categoryLabel || "Other").trim() || "Other"))
    ).sort((a, b) => a.localeCompare(b));
  }, [skills]);

  const tradeNames = useMemo(() => {
    const trades = skills
      .filter(s => {
        const cat = (s.categoryLabel || "Other").trim() || "Other";
        return !categoryFilter || cat === categoryFilter;
      })
      .map(s => (s.tradeLabel || "General").trim() || "General");

    return Array.from(new Set(trades)).sort((a, b) => a.localeCompare(b));
  }, [skills, categoryFilter]);

  const visibleSkills = useMemo(() => {
    return [...skills]
      .filter(s => {
        const cat = (s.categoryLabel || "Other").trim() || "Other";
        const trade = (s.tradeLabel || "General").trim() || "General";

        if (categoryFilter && cat !== categoryFilter) return false;
        if (tradeFilter && trade !== tradeFilter) return false;
        if (skillSearch.trim() && !s.label.toLowerCase().includes(skillSearch.trim().toLowerCase())) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [skills, categoryFilter, tradeFilter, skillSearch]);

  const categoryGroups = useMemo(() => {
    return categoryNames
      .map(catName => {
        const groupSkills = skills.filter(s => {
          const cat = (s.categoryLabel || "Other").trim() || "Other";
          if (cat !== catName) return false;
          if (tradeFilter && (s.tradeLabel || "General") !== tradeFilter) return false;
          if (skillSearch.trim() && !s.label.toLowerCase().includes(skillSearch.trim().toLowerCase())) return false;
          return true;
        });

        const rated = groupSkills.filter(s => typeof s.level === "number" && s.level >= 1 && s.level <= 5);
        const avgSelf = rated.length ? rated.reduce((sum, s) => sum + (s.level as number), 0) / rated.length : null;

        return {
          categoryLabel: catName,
          skills: groupSkills,
          ratedCount: rated.length,
          totalCount: groupSkills.length,
          avgSelf,
        };
      })
      .filter(g => g.totalCount > 0);
  }, [categoryNames, skills, tradeFilter, skillSearch]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmittingProfile(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/onboarding/${token}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          dob: dob || undefined,
          addressLine1,
          addressLine2,
          city,
          state,
          postalCode,
          country,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to save your information.");
      }
      const json = await res.json();
      setSession(s => (s ? { ...s, status: json.status, checklist: json.checklist } : json));
    } catch (e: any) {
      setError(e?.message ?? "Failed to save your information.");
    } finally {
      setSubmittingProfile(false);
    }
  }

  async function uploadDocument(type: "PHOTO" | "GOV_ID", file: File) {
    const form = new FormData();
    form.append("type", type);
    form.append("file", file);

    const res = await fetch(`${API_BASE}/onboarding/${token}/document`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Failed to upload ${type}.`);
    }

    const json = await res.json();
    setSession(s => (s ? { ...s, status: json.status, checklist: json.checklist } : s));
  }

  async function handleUploadPhoto() {
    if (!photoFile) return;
    try {
      setUploadingPhoto(true);
      await uploadDocument("PHOTO", photoFile);
    } catch (e: any) {
      setError(e?.message ?? "Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleUploadGovId() {
    if (!govIdFile) return;
    try {
      setUploadingGovId(true);
      await uploadDocument("GOV_ID", govIdFile);
    } catch (e: any) {
      setError(e?.message ?? "Failed to upload ID.");
    } finally {
      setUploadingGovId(false);
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
          body: JSON.stringify({ ratings }),
        });
      }

      const res = await fetch(`${API_BASE}/onboarding/${token}/submit`, {
        method: "POST",
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
        <p>Loading onboarding…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Prospective candidate onboarding</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Prospective candidate onboarding</h1>
        <p>We could not find this onboarding session.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Prospective Candidate Onboarding</h1>
      <p style={{ fontSize: 14, color: "#6b7280" }}>
        Welcome. Complete the items below so we can consider you for upcoming work.
      </p>

      <section style={{ marginTop: "1.5rem", maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Your information</h2>
        <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 14, flex: 1 }}>
              First name
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 14, flex: 1 }}>
              Last name
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <label style={{ fontSize: 14 }}>
            Mobile phone
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Date of birth
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Address line 1
            <input
              type="text"
              value={addressLine1}
              onChange={e => setAddressLine1(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }}>
            Address line 2 (optional)
            <input
              type="text"
              value={addressLine2}
              onChange={e => setAddressLine2(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 14, flex: 1 }}>
              City
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 14, width: 120 }}>
              State
              <input
                type="text"
                value={state}
                onChange={e => setState(e.target.value)}
                placeholder="FL"
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 14, flex: 1 }}>
              Postal code
              <input
                type="text"
                value={postalCode}
                onChange={e => setPostalCode(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 14, width: 160 }}>
              Country
              <input
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
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
              cursor: submittingProfile ? "default" : "pointer",
            }}
          >
            {submittingProfile ? "Saving…" : checklist.profileComplete ? "Saved" : "Save"}
          </button>
        </form>
      </section>

      <section style={{ marginTop: "1.5rem", maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Documents</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          Please upload a photo of yourself and a photo of your government-issued ID.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              onClick={handleUploadPhoto}
              disabled={!photoFile || uploadingPhoto}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: uploadingPhoto ? "#e5e7eb" : "#0f172a",
                color: uploadingPhoto ? "#4b5563" : "#f9fafb",
                cursor: uploadingPhoto ? "default" : "pointer",
                fontSize: 12,
              }}
            >
              {uploadingPhoto ? "Uploading…" : checklist.photoUploaded ? "Uploaded" : "Upload photo"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="file" accept="image/*" onChange={e => setGovIdFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              onClick={handleUploadGovId}
              disabled={!govIdFile || uploadingGovId}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: uploadingGovId ? "#e5e7eb" : "#0f172a",
                color: uploadingGovId ? "#4b5563" : "#f9fafb",
                cursor: uploadingGovId ? "default" : "pointer",
                fontSize: 12,
              }}
            >
              {uploadingGovId ? "Uploading…" : checklist.govIdUploaded ? "Uploaded" : "Upload government ID"}
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem", maxWidth: 980 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Trade skills self-assessment</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          Rate your skills 1 (Novice) to 5 (Expert). You can update this later.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            padding: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            backgroundColor: "#f9fafb",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>Functional area:</span>
            <select
              value={categoryFilter}
              onChange={e => {
                const next = e.target.value;
                setCategoryFilter(next);
                setTradeFilter("");
              }}
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
              }}
            >
              <option value="">All functional areas</option>
              {categoryNames.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>Trade:</span>
            <select
              value={tradeFilter}
              onChange={e => setTradeFilter(e.target.value)}
              style={{
                minWidth: 240,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
              }}
            >
              <option value="">All trades</option>
              {tradeNames.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>Search:</span>
            <input
              value={skillSearch}
              onChange={e => setSkillSearch(e.target.value)}
              placeholder="Find a skill…"
              style={{
                minWidth: 220,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
              }}
            />
          </div>

          <div style={{ marginLeft: "auto", color: "#6b7280" }}>
            {categoryFilter ? (
              <>
                Showing <strong>{visibleSkills.length}</strong>
              </>
            ) : (
              <>
                Showing <strong>{categoryGroups.length}</strong> groups
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 10, maxHeight: 420, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 10px",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    backgroundColor: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  {categoryFilter ? "Sub-skill / task" : "Functional area (group)"}
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "6px 10px",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    backgroundColor: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  Self rating
                </th>
              </tr>
            </thead>
            <tbody>
              {!categoryFilter ? (
                categoryGroups.map((g, gIdx) => {
                  const expanded = !!expandedCategories[g.categoryLabel];
                  const rounded = g.avgSelf != null ? Math.round(g.avgSelf) : null;

                  return (
                    <Fragment key={g.categoryLabel}>
                      <tr style={{ backgroundColor: gIdx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}>
                        <td
                          style={{ padding: "10px 10px", borderTop: "1px solid #e5e7eb", cursor: "pointer", fontWeight: 700 }}
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
                        <td style={{ padding: "10px 10px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
                          {g.avgSelf == null ? (
                            <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                          ) : (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <StarRating value={rounded} readOnly ariaLabel={`Average rating for ${g.categoryLabel}`} />
                              <span style={{ fontSize: 11, color: "#6b7280" }}>{g.avgSelf.toFixed(1)}/5</span>
                            </div>
                          )}
                        </td>
                      </tr>

                      {expanded &&
                        g.skills.map((skill, idx) => {
                          const cat = (skill.categoryLabel || "Other").trim() || "Other";
                          const trade = (skill.tradeLabel || "General").trim() || "General";

                          return (
                            <tr
                              key={skill.id}
                              style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fcfcfd" }}
                            >
                              <td style={{ padding: "8px 10px 8px 26px", borderTop: "1px solid #e5e7eb" }}>
                                <div style={{ fontWeight: 600 }}>{skill.label}</div>
                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                                  {cat} · {trade}
                                </div>
                              </td>
                              <td style={{ padding: "8px 10px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
                                <StarRating
                                  value={skill.level}
                                  onChange={(value) => {
                                    setSkills(prev => prev.map(s => (s.id === skill.id ? { ...s, level: value } : s)));
                                  }}
                                  ariaLabel={`Self rating for ${skill.label}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })
              ) : (
                visibleSkills.map((skill, idx) => {
                  const cat = (skill.categoryLabel || "Other").trim() || "Other";
                  const trade = (skill.tradeLabel || "General").trim() || "General";
                  return (
                    <tr
                      key={skill.id}
                      style={{
                        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fcfcfd",
                      }}
                    >
                      <td style={{ padding: "8px 10px", borderTop: "1px solid #e5e7eb" }}>
                        <div style={{ fontWeight: 600 }}>{skill.label}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                          {cat} · {trade}
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px", borderTop: "1px solid #e5e7eb", textAlign: "right", whiteSpace: "nowrap" }}>
                        <StarRating
                          value={skill.level}
                          onChange={(value) => {
                            setSkills(prev => prev.map(s => (s.id === skill.id ? { ...s, level: value } : s)));
                          }}
                          ariaLabel={`Self rating for ${skill.label}`}
                        />
                      </td>
                    </tr>
                  );
                })
              )}

              {skills.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: "8px", fontSize: 12, color: "#6b7280" }}>
                    Skills matrix is loading or not configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem", maxWidth: 560 }}>
        <button
          type="button"
          disabled={submittingFinal || submitted}
          onClick={handleSubmitAll}
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            backgroundColor: submitted ? "#16a34a" : "#2563eb",
            color: "#f9fafb",
            fontSize: 14,
            cursor: submitted ? "default" : "pointer",
          }}
        >
          {submitted ? "Submitted" : submittingFinal ? "Submitting…" : "Submit application"}
        </button>
        {submitted && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#16a34a" }}>
            Thank you — your information has been submitted for review.
          </p>
        )}
      </section>

      <div style={{ marginTop: 18, fontSize: 12, color: "#6b7280" }}>
        Application email: <strong>{session.email}</strong>
      </div>
    </main>
  );
}
