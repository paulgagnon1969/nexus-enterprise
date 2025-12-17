"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import StarRating from "../../components/star-rating";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SkillDefinitionDto {
  id: string;
  code: string;
  label: string;
  tradeLabel?: string | null;
  description?: string | null;
  categoryId: string;
  categoryCode?: string;
  categoryLabel?: string;
}

interface SkillSuggestionDto {
  id: string;
  label: string;
  categoryLabel?: string | null;
  description?: string | null;
}

interface UserSkillRatingDto {
  id: string;
  userId: string;
  skillId: string;
  selfLevel: number;
  employerAvgLevel?: number | null;
  employerRatingCount?: number | null;
  clientAvgLevel?: number | null;
  clientRatingCount?: number | null;
}

interface SkillDetailDto {
  self: {
    level: number | null;
    notes: string | null;
  } | null;
  peerRatings: { id: string; level: number; comment?: string | null }[];
  clientRatings: { id: string; level: number; comment?: string | null }[];
}

interface CombinedSkillRow {
  id: string;
  label: string;
  categoryLabel: string;
  tradeLabel: string;
  level: number | null; // self assessment
  companyAvgLevel: number | null; // peer/employer assessment
  companyRatingCount: number | null;
  clientAvgLevel: number | null; // client assessment
  clientRatingCount: number | null;
}

const NEXUS_DARK_BLUE = "#0f172a";
const NEXUS_GOLD = "#facc15";

export default function SkillsSettingsPage() {
  const [skills, setSkills] = useState<CombinedSkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string>("");
  const [selectedTradeLabel, setSelectedTradeLabel] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const [detailsBySkillId, setDetailsBySkillId] = useState<Record<string, SkillDetailDto | undefined>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [newSkillLabel, setNewSkillLabel] = useState("");
  const [newSkillCategoryChoice, setNewSkillCategoryChoice] = useState("");
  const [newSkillCategoryOther, setNewSkillCategoryOther] = useState("");
  const [newSkillDescription, setNewSkillDescription] = useState("");
  const [newSkillSaving, setNewSkillSaving] = useState(false);
  const [newSkillError, setNewSkillError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [defsRes, ratingsRes, catsRes, suggestionsRes] = await Promise.all([
          fetch(`${API_BASE}/skills/definitions`),
          fetch(`${API_BASE}/skills/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/skills/categories`),
          fetch(`${API_BASE}/skills/suggestions/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!defsRes.ok) throw new Error("Failed to load skills catalog");
        if (!ratingsRes.ok) throw new Error("Failed to load your skill ratings");

        const defsJson: SkillDefinitionDto[] = await defsRes.json();
        const ratingsJson: UserSkillRatingDto[] = await ratingsRes.json();
        const catsJson: { id: string; code: string; label: string }[] = catsRes.ok
          ? await catsRes.json()
          : [];
        const suggestionsJson: SkillSuggestionDto[] = suggestionsRes.ok
          ? await suggestionsRes.json()
          : [];

        const ratingsBySkillId = new Map(ratingsJson.map(r => [r.skillId, r]));
        const catById = new Map(catsJson.map(c => [c.id, c]));

        const suggestionDefs: SkillDefinitionDto[] = suggestionsJson.map(s => ({
          id: s.id,
          code: `suggestion:${s.id}`,
          label: s.label,
          description: s.description ?? null,
          categoryId: "user-suggestions",
          categoryCode: undefined,
          categoryLabel: s.categoryLabel ?? "User submitted",
        }));

        const allDefs: SkillDefinitionDto[] = [...defsJson, ...suggestionDefs];

        const rows: CombinedSkillRow[] = allDefs.map(def => {
          const rating = ratingsBySkillId.get(def.id);
          const cat = catById.get(def.categoryId);
          return {
            id: def.id,
            label: def.label,
            categoryLabel: cat?.label || def.categoryLabel || "",
            tradeLabel: (def.tradeLabel || "General").trim() || "General",
            level: rating ? rating.selfLevel : null,
            companyAvgLevel: rating?.employerAvgLevel ?? null,
            companyRatingCount: rating?.employerRatingCount ?? null,
            clientAvgLevel: rating?.clientAvgLevel ?? null,
            clientRatingCount: rating?.clientRatingCount ?? null,
          };
        });

        setSkills(rows);

        // Default filters to "All" so the page initially shows the entire list.
        // (User can choose a functional area / trade to filter, and can always return to "All".)
        const sorted = [...rows].sort((a, b) => a.label.localeCompare(b.label));
        if (!selectedSkillId && sorted[0]) {
          setSelectedSkillId(sorted[0].id);
        }
      } catch (e: any) {
        setError(e?.message ?? "Unable to load skills");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    const skillId = selectedSkillId;
    if (!skillId || detailsBySkillId[skillId]) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    async function loadDetails() {
      try {
        setDetailsLoading(true);
        setDetailsError(null);
        const res = await fetch(`${API_BASE}/skills/me/details/${skillId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load skill details (${res.status}): ${text}`);
        }
        const json: SkillDetailDto = await res.json();
        setDetailsBySkillId(prev => ({ ...prev, [skillId!]: json }));
      } catch (e: any) {
        setDetailsError(e?.message ?? "Failed to load skill details");
      } finally {
        setDetailsLoading(false);
      }
    }

    void loadDetails();
  }, [selectedSkillId, detailsBySkillId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    try {
      setSaving(true);
      const ratings = skills
        .filter(s => s.level && s.level >= 1 && s.level <= 5)
        .map(s => ({ skillId: s.id, level: s.level }));

      const res = await fetch(`${API_BASE}/skills/me`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ratings }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to save skills (${res.status}): ${text}`);
      }

      setMessage("Skills saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save skills");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNewSkill(e: FormEvent) {
    e.preventDefault();
    setNewSkillError(null);

    const label = newSkillLabel.trim();
    if (!label) {
      setNewSkillError("Enter a skill name.");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token; please log in again.");
      return;
    }

    try {
      const categoryLabel =
        newSkillCategoryChoice === "OTHER"
          ? newSkillCategoryOther.trim() || undefined
          : newSkillCategoryChoice || undefined;

      setNewSkillSaving(true);
      const res = await fetch(`${API_BASE}/skills/suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          label,
          categoryLabel,
          description: newSkillDescription.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to propose skill (${res.status}): ${text}`);
      }

      const suggestion: SkillSuggestionDto = await res.json();

      const newRow: CombinedSkillRow = {
        id: suggestion.id,
        label: suggestion.label,
        categoryLabel: suggestion.categoryLabel || "User submitted",
        tradeLabel: "General",
        level: null,
        companyAvgLevel: null,
        companyRatingCount: null,
        clientAvgLevel: null,
        clientRatingCount: null,
      };

      setSkills(prev => [...prev, newRow]);
      setSelectedSkillId(suggestion.id);

      setNewSkillLabel("");
      setNewSkillCategoryChoice("");
      setNewSkillCategoryOther("");
      setNewSkillDescription("");
    } catch (e: any) {
      setNewSkillError(e?.message ?? "Failed to propose skill");
    } finally {
      setNewSkillSaving(false);
    }
  }

  const categoryNames = Array.from(
    new Set(skills.map(s => (s.categoryLabel || "Other").trim() || "Other"))
  ).sort((a, b) => a.localeCompare(b));

  const tradesForSelectedCategory = Array.from(
    new Set(
      skills
        .filter(s => {
          const cat = (s.categoryLabel || "Other").trim() || "Other";
          return !selectedCategoryLabel || cat === selectedCategoryLabel;
        })
        .map(s => s.tradeLabel)
    )
  ).sort((a, b) => a.localeCompare(b));

  const visibleSkills = skills
    .filter(s => {
      const cat = (s.categoryLabel || "Other").trim() || "Other";
      if (selectedCategoryLabel && cat !== selectedCategoryLabel) return false;
      if (selectedTradeLabel && s.tradeLabel !== selectedTradeLabel) return false;
      if (search.trim() && !s.label.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const aRated = typeof a.level === "number" && a.level >= 1 && a.level <= 5;
      const bRated = typeof b.level === "number" && b.level >= 1 && b.level <= 5;
      if (aRated !== bRated) return aRated ? -1 : 1;
      const aScore = aRated ? (a.level as number) : -1;
      const bScore = bRated ? (b.level as number) : -1;
      if (bScore !== aScore) return bScore - aScore;
      return a.label.localeCompare(b.label);
    });

  const categoryGroups = categoryNames
    .map(catName => {
      const groupSkills = skills
        .filter(s => {
          const cat = (s.categoryLabel || "Other").trim() || "Other";
          if (cat !== catName) return false;
          if (selectedTradeLabel && s.tradeLabel !== selectedTradeLabel) return false;
          if (search.trim() && !s.label.toLowerCase().includes(search.trim().toLowerCase())) return false;
          return true;
        })
        .sort((a, b) => {
          const aRated = typeof a.level === "number" && a.level >= 1 && a.level <= 5;
          const bRated = typeof b.level === "number" && b.level >= 1 && b.level <= 5;
          if (aRated !== bRated) return aRated ? -1 : 1;
          const aScore = aRated ? (a.level as number) : -1;
          const bScore = bRated ? (b.level as number) : -1;
          if (bScore !== aScore) return bScore - aScore;
          return a.label.localeCompare(b.label);
        });

      const rated = groupSkills.filter(s => typeof s.level === "number" && s.level >= 1 && s.level <= 5);
      const avgSelf = rated.length ? rated.reduce((sum, s) => sum + (s.level as number), 0) / rated.length : null;
      const maxScore = rated.length ? Math.max(...rated.map(s => s.level as number)) : -1;

      const peerRated = groupSkills.filter(s => s.companyAvgLevel != null);
      const avgPeer = peerRated.length
        ? peerRated.reduce((sum, s) => sum + (s.companyAvgLevel as number), 0) / peerRated.length
        : null;

      const clientRated = groupSkills.filter(s => s.clientAvgLevel != null);
      const avgClient = clientRated.length
        ? clientRated.reduce((sum, s) => sum + (s.clientAvgLevel as number), 0) / clientRated.length
        : null;

      return {
        categoryLabel: catName,
        skills: groupSkills,
        ratedCount: rated.length,
        totalCount: groupSkills.length,
        avgSelf,
        avgPeer,
        avgClient,
        maxScore,
      };
    })
    .filter(g => g.totalCount > 0)
    .sort((a, b) => {
      if (b.maxScore !== a.maxScore) return b.maxScore - a.maxScore;
      if (b.ratedCount !== a.ratedCount) return b.ratedCount - a.ratedCount;
      return a.categoryLabel.localeCompare(b.categoryLabel);
    });

  const selectedSkill = selectedSkillId
    ? skills.find(s => s.id === selectedSkillId) ?? null
    : null;
  const selectedDetails: SkillDetailDto | undefined = selectedSkillId
    ? detailsBySkillId[selectedSkillId]
    : undefined;

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading your skills…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>My skills</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

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
      <div style={{ display: "flex", alignItems: "stretch", gap: 16, flex: "1 1 auto", minHeight: 0 }}>
        {/* Left pane: skills matrix */}
        <div
          style={{
            flex: "0 0 760px",
            maxWidth: 760,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: 20 }}>My skills matrix</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Rate your own skills from 1 (Novice) to 5 (Expert). Employers can add their own ratings
            separately.
          </p>

          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "#6b7280",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
              }}
            >
              {[
                { value: 1, label: "Novice" },
                { value: 2, label: "Beginner" },
                { value: 3, label: "Competent" },
                { value: 4, label: "Proficient" },
                { value: 5, label: "Expert" },
              ].map(item => (
                <div
                  key={item.value}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 2.5l2.47 5.01 5.53.8-4 3.9.94 5.49L12 15.9l-4.94 2.8.94-5.49-4-3.9 5.53-.8L12 2.5z"
                      fill={NEXUS_GOLD}
                      stroke={NEXUS_DARK_BLUE}
                      strokeWidth={1}
                    />
                  </svg>
                  <span>
                    {item.value} – {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* User-proposed skill form (only visible to you for now) */}
          <form onSubmit={handleAddNewSkill} style={{ marginTop: 12 }}>
            <div
              style={{
                padding: 8,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                backgroundColor: "#f9fafb",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <span style={{ fontWeight: 600 }}>Propose a new skill:</span>
              <input
                type="text"
                placeholder="Skill name"
                value={newSkillLabel}
                onChange={e => setNewSkillLabel(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                }}
              />
              <select
                value={newSkillCategoryChoice}
                onChange={e => setNewSkillCategoryChoice(e.target.value)}
                style={{
                  minWidth: 200,
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="">Functional area – none</option>
                {categoryNames.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="OTHER">Functional area – Other (propose new)</option>
              </select>
              {newSkillCategoryChoice === "OTHER" && (
                <input
                  type="text"
                  placeholder="New category name"
                  value={newSkillCategoryOther}
                  onChange={e => setNewSkillCategoryOther(e.target.value)}
                  style={{
                    minWidth: 160,
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                  }}
                />
              )}
              <input
                type="text"
                placeholder="Short description (optional)"
                value={newSkillDescription}
                onChange={e => setNewSkillDescription(e.target.value)}
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
                disabled={newSkillSaving}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: newSkillSaving ? "#e5e7eb" : "#0f172a",
                  color: newSkillSaving ? "#4b5563" : "#f9fafb",
                  cursor: newSkillSaving ? "default" : "pointer",
                }}
              >
                {newSkillSaving ? "Submitting…" : "Submit for review"}
              </button>
            </div>
            {newSkillError && (
              <p style={{ marginTop: 4, fontSize: 11, color: "#b91c1c" }}>{newSkillError}</p>
            )}
          </form>

          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 16,
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
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
                  value={selectedCategoryLabel}
                  onChange={e => {
                    const nextCategory = e.target.value;
                    setSelectedCategoryLabel(nextCategory);

                    // When changing functional area, default trade back to "All".
                    setSelectedTradeLabel("");

                    // If they picked a specific group, expand it.
                    if (nextCategory) {
                      setExpandedCategories(prev => ({ ...prev, [nextCategory]: true }));
                    }

                    const first = [...skills]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .find(s => {
                        const cat = (s.categoryLabel || "Other").trim() || "Other";
                        return !nextCategory || cat === nextCategory;
                      });
                    if (first) setSelectedSkillId(first.id);
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
                  value={selectedTradeLabel}
                  onChange={e => {
                    const nextTrade = e.target.value;
                    setSelectedTradeLabel(nextTrade);

                    const first = [...skills]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .find(s => {
                        const cat = (s.categoryLabel || "Other").trim() || "Other";
                        if (selectedCategoryLabel && cat !== selectedCategoryLabel) return false;
                        if (nextTrade && s.tradeLabel !== nextTrade) return false;
                        return true;
                      });
                    if (first) setSelectedSkillId(first.id);
                  }}
                  style={{
                    minWidth: 240,
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="">All trades</option>
                  {tradesForSelectedCategory.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>Search:</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
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
                {selectedCategoryLabel ? (
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

            <div
              style={{
                marginTop: 10,
                flex: "1 1 auto",
                minHeight: 0,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
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
                      Sub-skill / task
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
                      Peer
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
                      Client
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedCategoryLabel ? (
                    categoryGroups.map((g, gIdx) => {
                      const expanded = !!expandedCategories[g.categoryLabel];
                      const rounded = g.avgSelf != null ? Math.round(g.avgSelf) : null;

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
                            <td
                              style={{
                                padding: "10px 10px",
                                borderTop: "1px solid #e5e7eb",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              {g.avgSelf == null ? (
                                <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                              ) : (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                  <StarRating value={rounded} readOnly ariaLabel={`Average rating for ${g.categoryLabel}`} />
                                  <span style={{ fontSize: 11, color: "#6b7280" }}>{g.avgSelf.toFixed(1)}/5</span>
                                </div>
                              )}
                            </td>
                            <td
                              style={{
                                padding: "10px 10px",
                                borderTop: "1px solid #e5e7eb",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#6b7280" }}>
                                {g.avgPeer != null ? `${g.avgPeer.toFixed(1)}/5` : "—"}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "10px 10px",
                                borderTop: "1px solid #e5e7eb",
                                whiteSpace: "nowrap",
                                textAlign: "right",
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#6b7280" }}>
                                {g.avgClient != null ? `${g.avgClient.toFixed(1)}/5` : "—"}
                              </span>
                            </td>
                          </tr>

                          {expanded &&
                            g.skills.map((skill, idx) => {
                              const isSelected = skill.id === selectedSkillId;
                              return (
                                <tr
                                  key={skill.id}
                                  style={{
                                    backgroundColor: isSelected
                                      ? "#eff6ff"
                                      : idx % 2 === 0
                                      ? "#ffffff"
                                      : "#fcfcfd",
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "8px 10px 8px 26px",
                                      borderTop: "1px solid #e5e7eb",
                                      cursor: "pointer",
                                      fontWeight: isSelected ? 600 : 400,
                                      borderLeft: isSelected ? "3px solid #2563eb" : "3px solid transparent",
                                    }}
                                    onClick={() => setSelectedSkillId(skill.id)}
                                  >
                                    {skill.label}
                                  </td>
                                  <td
                                    style={{
                                      padding: "8px 10px",
                                      borderTop: "1px solid #e5e7eb",
                                      whiteSpace: "nowrap",
                                      textAlign: "right",
                                    }}
                                  >
                                    <StarRating
                                      value={skill.level}
                                      onChange={(value) => {
                                        setSkills(prev => prev.map(s => (s.id === skill.id ? { ...s, level: value } : s)));
                                        setMessage(null);
                                      }}
                                      ariaLabel={`Self rating for ${skill.label}`}
                                    />
                                  </td>
                                  <td
                                    style={{
                                      padding: "8px 10px",
                                      borderTop: "1px solid #e5e7eb",
                                      whiteSpace: "nowrap",
                                      textAlign: "right",
                                    }}
                                  >
                                    <span style={{ fontSize: 10, color: "#6b7280" }}>
                                      {skill.companyAvgLevel != null
                                        ? `${skill.companyAvgLevel.toFixed(1)}/5 (${skill.companyRatingCount ?? 0})`
                                        : "—"}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "8px 10px",
                                      borderTop: "1px solid #e5e7eb",
                                      whiteSpace: "nowrap",
                                      textAlign: "right",
                                    }}
                                  >
                                    <span style={{ fontSize: 10, color: "#6b7280" }}>
                                      {skill.clientAvgLevel != null
                                        ? `${skill.clientAvgLevel.toFixed(1)}/5 (${skill.clientRatingCount ?? 0})`
                                        : "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })
                  ) : (
                    visibleSkills.map((skill, idx) => {
                      const isSelected = skill.id === selectedSkillId;
                      return (
                        <tr
                          key={skill.id}
                          style={{
                            backgroundColor: isSelected
                              ? "#eff6ff"
                              : idx % 2 === 0
                              ? "#ffffff"
                              : "#fcfcfd",
                          }}
                        >
                          <td
                            style={{
                              padding: "8px 10px",
                              borderTop: "1px solid #e5e7eb",
                              cursor: "pointer",
                              fontWeight: isSelected ? 600 : 400,
                              borderLeft: isSelected ? "3px solid #2563eb" : "3px solid transparent",
                            }}
                            onClick={() => setSelectedSkillId(skill.id)}
                          >
                            {skill.label}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              borderTop: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                              textAlign: "right",
                            }}
                          >
                            <StarRating
                              value={skill.level}
                              onChange={(value) => {
                                setSkills(prev => prev.map(s => (s.id === skill.id ? { ...s, level: value } : s)));
                                setMessage(null);
                              }}
                              ariaLabel={`Self rating for ${skill.label}`}
                            />
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              borderTop: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                              textAlign: "right",
                            }}
                          >
                            <span style={{ fontSize: 10, color: "#6b7280" }}>
                              {skill.companyAvgLevel != null
                                ? `${skill.companyAvgLevel.toFixed(1)}/5 (${skill.companyRatingCount ?? 0})`
                                : "—"}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              borderTop: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                              textAlign: "right",
                            }}
                          >
                            <span style={{ fontSize: 10, color: "#6b7280" }}>
                              {skill.clientAvgLevel != null
                                ? `${skill.clientAvgLevel.toFixed(1)}/5 (${skill.clientRatingCount ?? 0})`
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                marginTop: 12,
                padding: "8px 12px",
                borderRadius: 4,
                border: "none",
                backgroundColor: saving ? "#e5e7eb" : "#0f172a",
                color: saving ? "#4b5563" : "#f9fafb",
                fontSize: 14,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save skills"}
            </button>
            {message && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#4b5563" }}>{message}</p>
            )}
          </form>
        </div>

        {/* Right pane: profile card + details */}
        <div
          style={{
            flex: 1,
            minWidth: 280,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderLeft: "1px solid #e5e7eb",
            paddingLeft: 16,
            fontSize: 12,
            color: "#111827",
          }}
        >
          {/* Upper-right profile card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              backgroundColor: "#f9fafb",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "9999px",
                overflow: "hidden",
                backgroundColor: "#e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src="/pg-pic-20250410-2.jpg"
                alt="Profile photo of Paul"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Paul (paul@nfsgrp.com)</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Owner of this skills matrix. Future versions will show additional profile details like
                birthday and role.
              </div>
            </div>
          </div>

          {/* Scrollable details pane */}
          <div
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: 10,
              backgroundColor: "#ffffff",
            }}
          >
            {!selectedSkill ? (
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                Select a skill on the left to see details here.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>{selectedSkill.label}</h2>
                  {selectedSkill.categoryLabel && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
                      {selectedSkill.categoryLabel}
                    </p>
                  )}
                </div>

              {/* At-a-glance rating summary for this skill */}
              <div
                style={{
                  padding: 8,
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  backgroundColor: "#ffffff",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Ratings summary</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                  <li>
                    <strong>Self:</strong>{" "}
                    {selectedSkill.level ? `${selectedSkill.level}/5` : "Not set"}
                  </li>
                  <li>
                    <strong>Peer:</strong>{" "}
                    {selectedSkill.companyAvgLevel != null
                      ? `${selectedSkill.companyAvgLevel.toFixed(1)}/5 (${selectedSkill.companyRatingCount ?? 0} ratings)`
                      : "No peer ratings yet"}
                  </li>
                  <li>
                    <strong>Client:</strong>{" "}
                    {selectedSkill.clientAvgLevel != null
                      ? `${selectedSkill.clientAvgLevel.toFixed(1)}/5 (${selectedSkill.clientRatingCount ?? 0} ratings)`
                      : "No client ratings yet"}
                  </li>
                </ul>
              </div>

              {/* Narrative details sections – including per-rating comments */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Self notes</div>
                  {detailsLoading && !selectedDetails && (
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      Loading details…
                    </p>
                  )}
                  {detailsError && (
                    <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 2 }}>{detailsError}</p>
                  )}
                  {selectedDetails && (
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {selectedDetails.self?.notes
                        ? selectedDetails.self.notes
                        : "You haven't added any notes for this skill yet."}
                    </p>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Peer feedback</div>
                  {selectedDetails && selectedDetails.peerRatings.length > 0 ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                      {selectedDetails.peerRatings.map((r, idx) => (
                        <li key={r.id} style={{ marginTop: idx === 0 ? 2 : 4 }}>
                          <strong>Rating {idx + 1}:</strong>{" "}
                          {r.comment ? r.comment : "(no comment provided)"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      No peer comments recorded yet.
                    </p>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Client feedback</div>
                  {selectedDetails && selectedDetails.clientRatings.length > 0 ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                      {selectedDetails.clientRatings.map((r, idx) => (
                        <li key={r.id} style={{ marginTop: idx === 0 ? 2 : 4 }}>
                          <strong>Rating {idx + 1}:</strong>{" "}
                          {r.comment ? r.comment : "(no comment provided)"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      No client comments recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
