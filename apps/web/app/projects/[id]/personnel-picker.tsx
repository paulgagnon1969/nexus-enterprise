"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PersonnelEntry {
  type: "user" | "external";
  userId?: string | null;
  name: string;
  note?: string | null;
}

export interface RosterData {
  favorites: PersonnelEntry[];
  previouslyOnsite: (PersonnelEntry & { count?: number })[];
  companyUsers: { userId: string; name: string; email: string; role: string }[];
  latestRoster: PersonnelEntry[];
  latestRosterLogId: string | null;
  latestRosterLogDate: string | null;
}

interface Props {
  projectId: string;
  apiBase: string;
  /** Currently-selected personnel (controlled). */
  value: PersonnelEntry[];
  onChange: (next: PersonnelEntry[]) => void;
  /** Whether the picker modal is open. */
  open: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PersonnelPicker({
  projectId,
  apiBase,
  value,
  onChange,
  open,
  onClose,
}: Props) {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [externalDraft, setExternalDraft] = useState("");

  // Fetch roster data when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${apiBase}/projects/${projectId}/personnel-roster`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data: RosterData = await res.json();
        if (!cancelled) setRoster(data);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, apiBase]);

  // Key set for quick "is selected" lookup
  const selectedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of value) {
      set.add(p.userId || p.name.toLowerCase().trim());
    }
    return set;
  }, [value]);

  const isSelected = useCallback(
    (p: PersonnelEntry | { userId: string; name: string }) => {
      const key = ("userId" in p && p.userId) ? p.userId : p.name.toLowerCase().trim();
      return selectedKeys.has(key);
    },
    [selectedKeys],
  );

  // Add a person to the proposed crew
  const addPerson = useCallback(
    (p: PersonnelEntry) => {
      if (isSelected(p)) return;
      onChange([...value, p]);
    },
    [value, onChange, isSelected],
  );

  // Remove a person from the proposed crew
  const removePerson = useCallback(
    (p: PersonnelEntry) => {
      const key = p.userId || p.name.toLowerCase().trim();
      onChange(value.filter((v) => (v.userId || v.name.toLowerCase().trim()) !== key));
    },
    [value, onChange],
  );

  // Pre-fill from favorites / latest roster
  const prefillFromFavorites = useCallback(() => {
    if (!roster?.favorites.length) return;
    onChange([...roster.favorites]);
  }, [roster, onChange]);

  const prefillFromLatest = useCallback(() => {
    if (!roster?.latestRoster.length) return;
    onChange([...roster.latestRoster]);
  }, [roster, onChange]);

  // Save favorites
  const saveFavorites = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      await fetch(`${apiBase}/projects/${projectId}/personnel-favorites`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ favorites: value }),
      });
      // Refresh roster to show updated favorites badge
      if (roster) {
        setRoster({ ...roster, favorites: [...value] });
      }
    } catch {
      // silent
    }
  }, [apiBase, projectId, value, roster]);

  // Filtered available personnel (right pane)
  const filteredAvailable = useMemo(() => {
    const q = search.toLowerCase().trim();

    // Previously onsite
    const prev = (roster?.previouslyOnsite ?? [])
      .filter((p) => !isSelected(p))
      .filter((p) => !q || p.name.toLowerCase().includes(q));

    // Company users not already in previouslyOnsite
    const prevKeys = new Set(
      (roster?.previouslyOnsite ?? []).map((p) => p.userId || p.name.toLowerCase().trim()),
    );
    const company = (roster?.companyUsers ?? [])
      .filter((u) => !prevKeys.has(u.userId) && !isSelected({ type: "user", userId: u.userId, name: u.name }))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

    return { prev, company };
  }, [roster, search, isSelected]);

  // Add external person
  const addExternal = useCallback(() => {
    const name = externalDraft.trim();
    if (!name) return;
    addPerson({ type: "external", name });
    setExternalDraft("");
  }, [externalDraft, addPerson]);

  if (!open) return null;

  const backdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 9998,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const modalStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    width: "min(900px, 92vw)",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    zIndex: 9999,
  };

  const headerStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const bodyStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 0,
    flex: 1,
    overflow: "hidden",
    minHeight: 0,
  };

  const paneStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  };

  const paneHeaderStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const listStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: "6px 8px",
  };

  const chipStyle = (isRemove: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    margin: "2px 0",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid #e5e7eb",
    background: isRemove ? "#eff6ff" : "#fff",
    transition: "background 0.1s",
  });

  const badgeStyle: React.CSSProperties = {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 999,
    background: "#e0e7ff",
    color: "#3730a3",
    fontWeight: 500,
  };

  const btnSmall: React.CSSProperties = {
    padding: "3px 8px",
    borderRadius: 4,
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: 11,
    cursor: "pointer",
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              JSA / Personnel Onsite
            </span>
            {value.length > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                {value.length} pers onsite
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={saveFavorites}
              disabled={value.length === 0}
              style={{
                ...btnSmall,
                opacity: value.length === 0 ? 0.4 : 1,
              }}
              title="Save current list as project favorites"
            >
              ⭐ Save Favorites
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 18,
                cursor: "pointer",
                color: "#6b7280",
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#6b7280" }}>
            Loading personnel roster…
          </div>
        )}

        {!loading && (
          <>
            {/* Quick-fill bar */}
            <div
              style={{
                padding: "6px 12px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                fontSize: 11,
                alignItems: "center",
              }}
            >
              <span style={{ color: "#6b7280" }}>Quick fill:</span>
              {roster?.favorites && roster.favorites.length > 0 && (
                <button type="button" onClick={prefillFromFavorites} style={btnSmall}>
                  ⭐ Favorites ({roster.favorites.length})
                </button>
              )}
              {roster?.latestRoster && roster.latestRoster.length > 0 && (
                <button type="button" onClick={prefillFromLatest} style={btnSmall}>
                  📋 Last Log ({roster.latestRoster.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={value.length === 0}
                style={{
                  ...btnSmall,
                  color: "#dc2626",
                  opacity: value.length === 0 ? 0.4 : 1,
                }}
              >
                ✕ Clear All
              </button>
            </div>

            <div style={bodyStyle}>
              {/* LEFT PANE — Proposed Crew */}
              <div style={{ ...paneStyle, borderRight: "1px solid #e5e7eb" }}>
                <div style={paneHeaderStyle}>
                  <span>Proposed Crew ({value.length})</span>
                </div>
                <div style={listStyle}>
                  {value.length === 0 && (
                    <div style={{ padding: 12, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
                      No personnel selected yet.
                      <br />
                      Click names on the right to add →
                    </div>
                  )}
                  {value.map((p) => {
                    const key = p.userId || p.name;
                    return (
                      <div
                        key={key}
                        style={chipStyle(true)}
                        onClick={() => removePerson(p)}
                        title="Click to remove"
                      >
                        <span style={{ flex: 1 }}>
                          {p.name}
                          {p.type === "external" && (
                            <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>
                              (external)
                            </span>
                          )}
                        </span>
                        <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>−</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT PANE — Available Personnel */}
              <div style={paneStyle}>
                <div style={paneHeaderStyle}>
                  <span>Available Personnel</span>
                </div>

                {/* Search */}
                <div style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>

                <div style={listStyle}>
                  {/* Previously onsite */}
                  {filteredAvailable.prev.length > 0 && (
                    <>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          padding: "6px 4px 3px",
                        }}
                      >
                        Previously Onsite
                      </div>
                      {filteredAvailable.prev.map((p) => {
                        const key = p.userId || p.name;
                        return (
                          <div
                            key={key}
                            style={chipStyle(false)}
                            onClick={() =>
                              addPerson({ type: p.type, userId: p.userId, name: p.name })
                            }
                            title="Click to add"
                          >
                            <span style={{ flex: 1 }}>{p.name}</span>
                            {p.count != null && p.count > 1 && (
                              <span style={badgeStyle}>×{p.count}</span>
                            )}
                            <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
                              +
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Company users (not previously onsite) */}
                  {filteredAvailable.company.length > 0 && (
                    <>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          padding: "6px 4px 3px",
                          marginTop: filteredAvailable.prev.length > 0 ? 6 : 0,
                        }}
                      >
                        All Company Personnel
                      </div>
                      {filteredAvailable.company.map((u) => (
                        <div
                          key={u.userId}
                          style={chipStyle(false)}
                          onClick={() =>
                            addPerson({ type: "user", userId: u.userId, name: u.name })
                          }
                          title="Click to add"
                        >
                          <span style={{ flex: 1 }}>
                            {u.name}
                            <span
                              style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}
                            >
                              {u.email}
                            </span>
                          </span>
                          <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
                            +
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {filteredAvailable.prev.length === 0 &&
                    filteredAvailable.company.length === 0 && (
                      <div
                        style={{
                          padding: 12,
                          fontSize: 12,
                          color: "#9ca3af",
                          textAlign: "center",
                        }}
                      >
                        {search ? "No matches found." : "No available personnel."}
                      </div>
                    )}

                  {/* Add external person */}
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 4px",
                      borderTop: "1px solid #f3f4f6",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      + Add External Person
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        type="text"
                        placeholder="Name…"
                        value={externalDraft}
                        onChange={(e) => setExternalDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addExternal();
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      />
                      <button
                        type="button"
                        onClick={addExternal}
                        disabled={!externalDraft.trim()}
                        style={{
                          ...btnSmall,
                          opacity: externalDraft.trim() ? 1 : 0.4,
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Assign ({value.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
