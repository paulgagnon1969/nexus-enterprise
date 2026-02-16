"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type SavedPhraseCategory = "INVOICE" | "BILL" | "DAILY_LOG" | "GENERAL";

interface SavedPhrase {
  id: string;
  category: SavedPhraseCategory;
  phrase: string;
  label: string | null;
  isCompanyWide: boolean;
  isOwn: boolean;
  sortOrder: number;
  createdAt: string;
}

interface DescriptionPickerProps {
  value: string;
  onChange: (value: string) => void;
  category?: SavedPhraseCategory;
  placeholder?: string;
  allowSave?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  rows?: number;
  multiline?: boolean;
}

/**
 * DescriptionPicker - A text input with saved phrases dropdown.
 * 
 * Features:
 * - Shows a ⭐ button to open saved phrases dropdown
 * - Dropdown shows user's phrases first, then company-wide phrases
 * - "Save current as favorite" option at bottom
 * - Supports filtering by category
 */
export function DescriptionPicker({
  value,
  onChange,
  category,
  placeholder = "Enter description...",
  allowSave = true,
  disabled = false,
  style,
  inputStyle,
  rows = 1,
  multiline = false,
}: DescriptionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phrases, setPhrases] = useState<SavedPhrase[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load phrases when dropdown opens
  const loadPhrases = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const url = category
        ? `${API_BASE}/saved-phrases?category=${category}`
        : `${API_BASE}/saved-phrases`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load phrases (${res.status})`);
      }

      const data = await res.json();
      setPhrases(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load phrases");
    } finally {
      setLoading(false);
    }
  }, [category]);

  // Load when dropdown opens
  useEffect(() => {
    if (isOpen && phrases === null) {
      loadPhrases();
    }
  }, [isOpen, phrases, loadPhrases]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowSaveForm(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectPhrase = (phrase: SavedPhrase) => {
    onChange(phrase.phrase);
    setIsOpen(false);
    setShowSaveForm(false);
  };

  const handleSavePhrase = async () => {
    if (!value.trim()) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    setSaving(true);

    try {
      const res = await fetch(`${API_BASE}/saved-phrases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phrase: value.trim(),
          label: saveLabel.trim() || null,
          category: category ?? "GENERAL",
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save phrase (${res.status})`);
      }

      // Refresh phrases list
      setPhrases(null);
      setShowSaveForm(false);
      setSaveLabel("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save phrase");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhrase = async (phraseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    const ok = window.confirm("Delete this saved phrase?");
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/saved-phrases/${phraseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to delete phrase (${res.status})`);
      }

      // Refresh phrases list
      setPhrases(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete phrase");
    }
  };

  // Split phrases into user's own and company-wide
  const userPhrases = phrases?.filter((p) => p.isOwn) ?? [];
  const companyPhrases = phrases?.filter((p) => p.isCompanyWide) ?? [];

  const InputComponent = multiline ? "textarea" : "input";

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <div style={{ display: "flex", gap: 4 }}>
        <InputComponent
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={multiline ? rows : undefined}
          style={{
            flex: 1,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 12,
            resize: multiline ? "vertical" : undefined,
            ...inputStyle,
          }}
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: isOpen ? "#fef3c7" : "#ffffff",
            cursor: disabled ? "default" : "pointer",
            fontSize: 14,
            lineHeight: 1,
          }}
          title="Saved phrases"
        >
          ⭐
        </button>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 320,
            maxHeight: 400,
            overflow: "auto",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 12,
              fontWeight: 600,
              color: "#374151",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>📝 Saved Phrases</span>
            {category && (
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  background: "#e5e7eb",
                  borderRadius: 4,
                }}
              >
                {category}
              </span>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ padding: 12, fontSize: 12, color: "#6b7280" }}>
              Loading...
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div style={{ padding: 12, fontSize: 12, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {/* Phrases list */}
          {!loading && !error && phrases && (
            <>
              {/* User's phrases */}
              {userPhrases.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "6px 12px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      background: "#f3f4f6",
                    }}
                  >
                    My Phrases
                  </div>
                  {userPhrases.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPhrase(p)}
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        borderBottom: "1px solid #f3f4f6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "#f0fdf4";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        {p.label && (
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>
                            {p.label}
                          </div>
                        )}
                        <div
                          style={{
                            color: p.label ? "#6b7280" : "#111827",
                            wordBreak: "break-word",
                          }}
                        >
                          {p.phrase.length > 80
                            ? `${p.phrase.slice(0, 80)}...`
                            : p.phrase}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeletePhrase(p.id, e)}
                        style={{
                          padding: "2px 4px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 10,
                          color: "#9ca3af",
                        }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Company-wide phrases */}
              {companyPhrases.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "6px 12px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      background: "#f3f4f6",
                    }}
                  >
                    Company Phrases
                  </div>
                  {companyPhrases.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPhrase(p)}
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "#eff6ff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                    >
                      {p.label && (
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {p.label}
                        </div>
                      )}
                      <div
                        style={{
                          color: p.label ? "#6b7280" : "#111827",
                          wordBreak: "break-word",
                        }}
                      >
                        {p.phrase.length > 80
                          ? `${p.phrase.slice(0, 80)}...`
                          : p.phrase}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {userPhrases.length === 0 && companyPhrases.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: "#6b7280" }}>
                  No saved phrases yet.
                </div>
              )}
            </>
          )}

          {/* Save as favorite section */}
          {allowSave && (
            <div
              style={{
                borderTop: "1px solid #e5e7eb",
                padding: 8,
                background: "#f9fafb",
              }}
            >
              {!showSaveForm ? (
                <button
                  type="button"
                  onClick={() => setShowSaveForm(true)}
                  disabled={!value.trim()}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: value.trim() ? "#ffffff" : "#f3f4f6",
                    color: value.trim() ? "#111827" : "#9ca3af",
                    fontSize: 11,
                    cursor: value.trim() ? "pointer" : "not-allowed",
                    textAlign: "center",
                  }}
                >
                  ⭐ Save current text as favorite
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="text"
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Label (optional)"
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 11,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSaveForm(false);
                        setSaveLabel("");
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePhrase}
                      disabled={saving}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #16a34a",
                        background: "#16a34a",
                        color: "#ffffff",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: saving ? "wait" : "pointer",
                      }}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DescriptionPicker;
