"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { JournalEntryCard } from "./journal-entry-card";
import { JournalEntryForm } from "./journal-entry-form";
import type {
  CarrierContact,
  ClaimJournalEntry,
  CreateJournalEntryDto,
  CreateCarrierContactDto,
  ClaimJournalEntryType,
} from "./types";

interface JournalTabProps {
  projectId: string;
  apiBase: string;
}

export function JournalTab({ projectId, apiBase }: JournalTabProps) {
  // State
  const [entries, setEntries] = useState<ClaimJournalEntry[]>([]);
  const [contacts, setContacts] = useState<CarrierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showNewEntryForm, setShowNewEntryForm] = useState(false);
  const [correctingEntryId, setCorrectingEntryId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ClaimJournalEntryType | "">("");
  const [tagFilter, setTagFilter] = useState("");

  // Get auth token
  const getToken = useCallback(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Load entries and contacts in parallel
      const [entriesRes, contactsRes] = await Promise.all([
        fetch(`${apiBase}/projects/${projectId}/journal`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBase}/company/carrier-contacts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!entriesRes.ok) {
        const text = await entriesRes.text().catch(() => "");
        throw new Error(`Failed to load journal entries (${entriesRes.status}) ${text}`);
      }

      if (!contactsRes.ok) {
        const text = await contactsRes.text().catch(() => "");
        throw new Error(`Failed to load carrier contacts (${contactsRes.status}) ${text}`);
      }

      const entriesJson = await entriesRes.json();
      const contactsJson = await contactsRes.json();

      setEntries(Array.isArray(entriesJson) ? entriesJson : entriesJson.items || []);
      setContacts(Array.isArray(contactsJson) ? contactsJson : contactsJson.items || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [projectId, apiBase, getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create entry
  const handleCreateEntry = useCallback(
    async (dto: CreateJournalEntryDto) => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");

      const url = correctingEntryId
        ? `${apiBase}/projects/${projectId}/journal/${correctingEntryId}/correct`
        : `${apiBase}/projects/${projectId}/journal`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to create entry (${res.status}) ${text}`);
      }

      // Reload data
      await loadData();

      // Reset UI
      setShowNewEntryForm(false);
      setCorrectingEntryId(null);
    },
    [projectId, apiBase, getToken, loadData, correctingEntryId]
  );

  // Create carrier contact
  const handleCreateContact = useCallback(
    async (dto: CreateCarrierContactDto): Promise<CarrierContact> => {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${apiBase}/company/carrier-contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to create contact (${res.status}) ${text}`);
      }

      const created = await res.json();
      setContacts((prev) => [...prev, created]);
      return created;
    },
    [apiBase, getToken]
  );

  // Handle correction
  const handleCorrect = useCallback((entryId: string) => {
    setCorrectingEntryId(entryId);
    setShowNewEntryForm(true);
  }, []);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries;

    if (typeFilter) {
      result = result.filter((e) => e.entryType === typeFilter);
    }

    if (tagFilter.trim()) {
      const filterLower = tagFilter.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.tags?.some((t) => t.toLowerCase().includes(filterLower)) ||
          e.summary.toLowerCase().includes(filterLower)
      );
    }

    // Sort by occurredAt descending (most recent first)
    return [...result].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
  }, [entries, typeFilter, tagFilter]);

  // Unique tags for filter suggestions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags || []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [entries]);

  // Summary stats
  const stats = useMemo(() => {
    let totalDisputed = 0;
    let totalApproved = 0;
    let totalDenied = 0;

    for (const entry of entries) {
      if (entry.disputedAmount) totalDisputed += entry.disputedAmount;
      if (entry.approvedAmount) totalApproved += entry.approvedAmount;
      if (entry.deniedAmount) totalDenied += entry.deniedAmount;
    }

    return { totalDisputed, totalApproved, totalDenied, entryCount: entries.length };
  }, [entries]);

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
        Loading journal entries…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>
        <button
          type="button"
          onClick={loadData}
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 16 }}>
      {/* Left: Form and filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Stats card */}
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Journal Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
            <div>
              <span style={{ color: "#6b7280" }}>Total entries:</span>{" "}
              <span style={{ fontWeight: 600 }}>{stats.entryCount}</span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Disputed:</span>{" "}
              <span style={{ fontWeight: 600, color: "#374151" }}>
                ${stats.totalDisputed.toLocaleString()}
              </span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Approved:</span>{" "}
              <span style={{ fontWeight: 600, color: "#166534" }}>
                ${stats.totalApproved.toLocaleString()}
              </span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Denied:</span>{" "}
              <span style={{ fontWeight: 600, color: "#b91c1c" }}>
                ${stats.totalDenied.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* New entry form or button */}
        {showNewEntryForm ? (
          <JournalEntryForm
            contacts={contacts}
            onSubmit={handleCreateEntry}
            onCreateContact={handleCreateContact}
            onCancel={() => {
              setShowNewEntryForm(false);
              setCorrectingEntryId(null);
            }}
            correctsEntryId={correctingEntryId}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNewEntryForm(true)}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px dashed #9ca3af",
              background: "#ffffff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            + Add Journal Entry
          </button>
        )}

        {/* Filters */}
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Filters</div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
              Entry Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ClaimJournalEntryType | "")}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            >
              <option value="">All types</option>
              <option value="SUBMISSION">Submission</option>
              <option value="RESPONSE">Response</option>
              <option value="CALL">Phone Call</option>
              <option value="EMAIL">Email</option>
              <option value="MEETING">Meeting</option>
              <option value="NOTE">Internal Note</option>
              <option value="APPROVAL">Approval</option>
              <option value="DENIAL">Denial</option>
              <option value="PARTIAL_APPROVAL">Partial Approval</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
              Search / Tag
            </label>
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Search summaries or tags…"
              list="tag-suggestions"
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
            <datalist id="tag-suggestions">
              {allTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </div>

          {(typeFilter || tagFilter) && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("");
                setTagFilter("");
              }}
              style={{
                marginTop: 8,
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: "#f3f4f6",
                color: "#6b7280",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Right: Entry list */}
      <div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
          {(typeFilter || tagFilter) && " (filtered)"}
        </div>

        {filteredEntries.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "#9ca3af",
              border: "1px dashed #d1d5db",
              borderRadius: 8,
            }}
          >
            {entries.length === 0
              ? "No journal entries yet. Add your first entry to start tracking carrier negotiations."
              : "No entries match the current filters."}
          </div>
        ) : (
          <div>
            {filteredEntries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} onCorrect={handleCorrect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
