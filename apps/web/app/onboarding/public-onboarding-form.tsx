"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [skills, setSkills] = useState<SkillDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showCompletionHint, setShowCompletionHint] = useState(false);
  const [completionHintAcknowledged, setCompletionHintAcknowledged] = useState(false);

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

  const submitted =
    session?.status === "SUBMITTED" ||
    session?.status === "UNDER_REVIEW" ||
    session?.status === "APPROVED";
 
  // Debounced autosave: whenever profile fields change, try to persist them
  // after a short delay so partial data is captured even if the user does not
  // blur every field.
  useEffect(() => {
    if (!token) return;
    if (loading || submitted) return;

    const timer = setTimeout(() => {
      void saveProfileIfNeeded();
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    token,
    loading,
    submitted,
    firstName,
    lastName,
    phone,
    dob,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
  ]);

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

  async function saveProfileIfNeeded() {
    if (!token) return;

    // No hard validation here: we accept whatever the candidate has provided
    // so far and store it. Completion is encouraged via a separate hint
    // overlay, not enforced as a blocking requirement.
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
        // Surface a soft error but do not block the user from continuing.
        setError(text || "We could not save your information yet. You can still continue.");
        return;
      }
      const json = await res.json();
      setSession(s => (s ? { ...s, status: json.status, checklist: json.checklist } : json));
    } catch (e: any) {
      // Network or other failure: capture but do not throw.
      setError(e?.message ?? "We could not save your information yet. You can still continue.");
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
    setSession(s =>
      s
        ? {
            ...s,
            status: json.status,
            checklist: json.checklist,
            documents: json.documents ?? s.documents,
          }
        : json,
    );
  }

  function computeMissingFieldLabels(): string[] {
    const missing: string[] = [];
    if (!firstName.trim()) missing.push("First name");
    if (!lastName.trim()) missing.push("Last name");
    if (!phone.trim()) missing.push("Mobile phone");
    if (!addressLine1.trim()) missing.push("Address line 1");
    if (!city.trim()) missing.push("City");
    if (!state.trim()) missing.push("State");
    if (!postalCode.trim()) missing.push("Postal code");
    if (!country.trim()) missing.push("Country");
    return missing;
  }

  async function handleSubmitAll() {
    if (!token) return;

    const missing = computeMissingFieldLabels();
    if (missing.length > 0 && !completionHintAcknowledged && !showCompletionHint && !submitted) {
      setMissingFields(missing);
      setShowCompletionHint(true);
      return;
    }

    setSubmittingFinal(true);
    setError(null);

    try {
      // 1) Save whatever profile fields we have so far.
      await saveProfileIfNeeded();

      // 2) Persist any skill ratings the candidate chose to enter. Skills are
      // optional and can be completed later.
      if (skills.length > 0) {
        const ratings = skills
          .filter(s => typeof s.level === "number" && s.level >= 1 && s.level <= 5)
          .map(s => ({ skillId: s.id, level: s.level }));
        if (ratings.length > 0) {
          await fetch(`${API_BASE}/onboarding/${token}/skills`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ratings }),
          });
        }
      }

      const res = await fetch(`${API_BASE}/onboarding/${token}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to submit onboarding.");
      }
      const json = await res.json();
      setSession(s => (s ? { ...s, status: json.status } : s));

      // After successful submission, try to auto-login using the credentials
      // captured during the initial /apply step. If that works, send the
      // candidate straight into their portal at /candidate so they see their
      // portfolio card immediately. If auto-login fails or credentials are
      // missing, fall back to the normal login screen.
      try {
        if (typeof window !== "undefined") {
          const storedEmail = window.sessionStorage.getItem("nexisApplyEmail");
          const storedPassword = window.sessionStorage.getItem("nexisApplyPassword");

          if (storedEmail && storedPassword) {
            const loginRes = await fetch(`${API_BASE}/auth/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: storedEmail, password: storedPassword }),
            });

            if (loginRes.ok) {
              const loginJson: any = await loginRes.json();
              window.localStorage.setItem("accessToken", loginJson.accessToken);
              window.localStorage.setItem("refreshToken", loginJson.refreshToken);
              if (loginJson.company?.id) {
                window.localStorage.setItem("companyId", loginJson.company.id);
              }

              // Optionally clear temporary credentials
              try {
                window.sessionStorage.removeItem("nexisApplyEmail");
                window.sessionStorage.removeItem("nexisApplyPassword");
              } catch {}

              router.push("/settings/profile");
              return;
            }
          }
        }
      } catch {
        // ignore and fall back to explicit login below
      }

      const email = session?.email ?? "";
      if (email) {
        router.push(`/login?email=${encodeURIComponent(email)}`);
      } else {
        router.push("/login");
      }
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

  if (!session) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Nexis profile</h1>
        <p>We could not find this Nexis profile session.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 980, margin: "0 auto", position: "relative" }}>
      {error && (
        <div
          onClick={() => setError(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 420,
              width: "90%",
              background: "#ffffff",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
              padding: 16,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Check your Nexis profile</div>
            <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{
                marginTop: 10,
                padding: "6px 10px",
                borderRadius: 4,
                border: "none",
                backgroundColor: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showCompletionHint && missingFields.length > 0 && (
        <div
          onClick={() => setShowCompletionHint(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 460,
              width: "90%",
              background: "#ffffff",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
              padding: 16,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Finish your contact details (recommended)</div>
            <p style={{ marginTop: 0, marginBottom: 8, color: "#4b5563" }}>
              You can submit now, but we strongly recommend completing these items so Nexus and hiring teams can
              reach you easily:
            </p>
            <ul style={{ marginTop: 0, marginBottom: 8, paddingLeft: 18, color: "#4b5563" }}>
              {missingFields.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
              You&apos;ll be able to edit these later from your Nexis profile.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setShowCompletionHint(false)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Go back and add info
              </button>
              <button
                type="button"
                onClick={async () => {
                  setCompletionHintAcknowledged(true);
                  setShowCompletionHint(false);
                  setSubmittingFinal(true);
                  setError(null);
                  await handleSubmitAll();
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "none",
                  backgroundColor: "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Submit anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 style={{ marginTop: 0 }}>Nexis profile</h1>
      <p style={{ fontSize: 14, color: "#6b7280" }}>
        Welcome. Complete the items below to build your Nexis profile for upcoming work.
      </p>

      <section style={{ marginTop: "1.5rem", maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Your information</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 14, flex: 1 }} htmlFor="onboarding-first-name">
              First name
              <input
                id="onboarding-first-name"
                name="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                onBlur={() => void saveProfileIfNeeded()}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 14, flex: 1 }} htmlFor="onboarding-last-name">
              Last name
              <input
                id="onboarding-last-name"
                name="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                onBlur={() => void saveProfileIfNeeded()}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <label style={{ fontSize: 14 }} htmlFor="onboarding-phone">
            Mobile phone
            <input
              id="onboarding-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onBlur={() => void saveProfileIfNeeded()}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }} htmlFor="onboarding-dob">
            Date of birth
            <input
              id="onboarding-dob"
              name="dob"
              type="date"
              autoComplete="bday"
              value={dob}
              onChange={e => setDob(e.target.value)}
              onBlur={() => void saveProfileIfNeeded()}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }} htmlFor="onboarding-address-line1">
            Address line 1
            <input
              id="onboarding-address-line1"
              name="addressLine1"
              type="text"
              autoComplete="address-line1"
              value={addressLine1}
              onChange={e => setAddressLine1(e.target.value)}
              onBlur={() => void saveProfileIfNeeded()}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ fontSize: 14 }} htmlFor="onboarding-address-line2">
            Address line 2 (optional)
            <input
              id="onboarding-address-line2"
              name="addressLine2"
              type="text"
              autoComplete="address-line2"
              value={addressLine2}
              onChange={e => setAddressLine2(e.target.value)}
              onBlur={() => void saveProfileIfNeeded()}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 14, flex: 1 }} htmlFor="onboarding-city">
              City
              <input
                id="onboarding-city"
                name="city"
                type="text"
                autoComplete="address-level2"
                value={city}
                onChange={e => setCity(e.target.value)}
                onBlur={() => void saveProfileIfNeeded()}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 14, width: 120 }} htmlFor="onboarding-state">
              State
              <input
                id="onboarding-state"
                name="state"
                type="text"
                autoComplete="address-level1"
                value={state}
                onChange={e => setState(e.target.value)}
                onBlur={() => void saveProfileIfNeeded()}
                placeholder="FL"
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 14, flex: 1 }} htmlFor="onboarding-postal-code">
              Postal code
              <input
                id="onboarding-postal-code"
                name="postalCode"
                type="text"
                autoComplete="postal-code"
                value={postalCode}
                onChange={e => setPostalCode(e.target.value)}
                onBlur={() => void saveProfileIfNeeded()}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ fontSize: 14, width: 160 }} htmlFor="onboarding-country">
              Country
              <input
                id="onboarding-country"
                name="country"
                type="text"
                autoComplete="country"
                value={country}
                onChange={e => setCountry(e.target.value)}
                onBlur={() => void saveProfileIfNeeded()}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db" }}
              />
            </label>
          </div>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem", maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Documents</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          Please upload a clear photo of yourself and a photo of your driver&apos;s license (or other
          government-issued ID).
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="onboarding-photo" style={{ fontSize: 13 }}>Profile photo (optional)</label>
            <input
              id="onboarding-photo"
              name="photo"
              type="file"
              accept="image/*"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setUploadingPhoto(true);
                  await uploadDocument("PHOTO", file);
                } catch (err: any) {
                  setError(err?.message ?? "Failed to upload photo.");
                } finally {
                  setUploadingPhoto(false);
                }
              }}
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {uploadingPhoto
                ? "Uploading photo…"
                : checklist.photoUploaded
                ? "Photo uploaded. You can change it by selecting a new file."
                : "Select a clear photo of yourself. It will upload automatically."}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="onboarding-gov-id" style={{ fontSize: 13 }}>
              Government ID/DL (optional)
            </label>
            <input
              id="onboarding-gov-id"
              name="govId"
              type="file"
              accept="image/*"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setUploadingGovId(true);
                  await uploadDocument("GOV_ID", file);
                } catch (err: any) {
                  setError(err?.message ?? "Failed to upload ID.");
                } finally {
                  setUploadingGovId(false);
                }
              }}
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {uploadingGovId
                ? "Uploading ID…"
                : checklist.govIdUploaded
                ? "ID uploaded. You can change it by selecting a new file."
                : "Select a clear photo of your driver’s license or other government ID. It will upload automatically."}
            </div>
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
              id="skills-category-filter"
              name="categoryFilter"
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
              id="skills-trade-filter"
              name="tradeFilter"
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
              id="skills-search"
              name="skillSearch"
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
          {submitted ? "Submitted" : submittingFinal ? "Submitting…" : "Submit Nexis profile"}
        </button>
        {submitted && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#16a34a" }}>
            Thank you — your information has been submitted for review.
          </p>
        )}
      </section>

      <div style={{ marginTop: 18, fontSize: 12, color: "#6b7280" }}>
        Nexis profile email: <strong>{session.email}</strong>
      </div>
    </main>
  );
}
