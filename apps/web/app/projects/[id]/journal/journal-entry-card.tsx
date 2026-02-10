"use client";

import React, { useState } from "react";
import {
  ENTRY_TYPE_LABELS,
  DIRECTION_LABELS,
  ENTRY_TYPE_ICONS,
  type ClaimJournalEntry,
} from "./types";

interface JournalEntryCardProps {
  entry: ClaimJournalEntry;
  onCorrect?: (entryId: string) => void;
  formatMoney?: (value: number | null) => string;
}

export function JournalEntryCard({
  entry,
  onCorrect,
  formatMoney = (v) =>
    v != null
      ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—",
}: JournalEntryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const icon = ENTRY_TYPE_ICONS[entry.entryType] || "📄";
  const typeLabel = ENTRY_TYPE_LABELS[entry.entryType] || entry.entryType;
  const directionLabel = DIRECTION_LABELS[entry.direction] || entry.direction;

  // Determine actor display
  let actorDisplay = "";
  if (entry.carrierContact) {
    const parts: string[] = [];
    if (entry.carrierContact.contactName) parts.push(entry.carrierContact.contactName);
    if (entry.carrierContact.carrierName) parts.push(entry.carrierContact.carrierName);
    actorDisplay = parts.join(" @ ");
  } else if (entry.actorNameOverride || entry.actorOrgOverride) {
    const parts: string[] = [];
    if (entry.actorNameOverride) parts.push(entry.actorNameOverride);
    if (entry.actorOrgOverride) parts.push(entry.actorOrgOverride);
    actorDisplay = parts.join(" @ ");
  }

  // Format date
  const occurredDate = new Date(entry.occurredAt);
  const dateStr = occurredDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = occurredDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  // Entry type styling
  const getTypeColor = () => {
    switch (entry.entryType) {
      case "APPROVAL":
        return { bg: "#dcfce7", border: "#86efac", text: "#166534" };
      case "DENIAL":
        return { bg: "#fee2e2", border: "#fca5a5", text: "#b91c1c" };
      case "PARTIAL_APPROVAL":
        return { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" };
      case "SUBMISSION":
        return { bg: "#dbeafe", border: "#93c5fd", text: "#1d4ed8" };
      case "RESPONSE":
        return { bg: "#e0e7ff", border: "#a5b4fc", text: "#4338ca" };
      default:
        return { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" };
    }
  };

  const colors = getTypeColor();
  const hasCorrections = (entry.correctedByEntries?.length ?? 0) > 0;
  const isCorrection = !!entry.correctsEntryId;

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        background: "#ffffff",
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          background: colors.bg,
          borderBottom: `1px solid ${colors.border}`,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>
                {typeLabel}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: entry.direction === "INTERNAL" ? "#e5e7eb" : "#f3f4f6",
                  color: "#6b7280",
                }}
              >
                {directionLabel}
              </span>
              {isCorrection && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "#fef3c7",
                    color: "#92400e",
                  }}
                >
                  Correction
                </span>
              )}
              {hasCorrections && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "#fee2e2",
                    color: "#b91c1c",
                  }}
                >
                  Has corrections
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              {dateStr} at {timeStr}
              {actorDisplay && <> · {actorDisplay}</>}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Summary line (always visible) */}
      <div style={{ padding: "10px 12px", borderBottom: expanded ? "1px solid #e5e7eb" : "none" }}>
        <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{entry.summary}</div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 12px 12px" }}>
          {/* Details */}
          {entry.details && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Details</div>
              <div style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>
                {entry.details}
              </div>
            </div>
          )}

          {/* Amounts */}
          {(entry.disputedAmount != null ||
            entry.approvedAmount != null ||
            entry.deniedAmount != null) && (
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {entry.disputedAmount != null && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    background: "#f3f4f6",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#6b7280" }}>Disputed</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {formatMoney(entry.disputedAmount)}
                  </div>
                </div>
              )}
              {entry.approvedAmount != null && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    background: "#dcfce7",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#166534" }}>Approved</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>
                    {formatMoney(entry.approvedAmount)}
                  </div>
                </div>
              )}
              {entry.deniedAmount != null && (
                <div
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    background: "#fee2e2",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#b91c1c" }}>Denied</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>
                    {formatMoney(entry.deniedAmount)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Tags</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {entry.tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "#e5e7eb",
                      fontSize: 11,
                      color: "#374151",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {entry.attachments && entry.attachments.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                Attachments ({entry.attachments.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {entry.attachments.map((att) => (
                  <div
                    key={att.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "#f3f4f6",
                      fontSize: 11,
                    }}
                  >
                    <span>📎</span>
                    <span style={{ color: "#111827" }}>{att.fileName}</span>
                    {att.fileSize && (
                      <span style={{ color: "#9ca3af" }}>
                        ({(att.fileSize / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {onCorrect && !isCorrection && (
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
              <button
                type="button"
                onClick={() => onCorrect(entry.id)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Create correction entry
              </button>
            </div>
          )}

          {/* Metadata */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid #e5e7eb",
              fontSize: 10,
              color: "#9ca3af",
            }}
          >
            Entry ID: {entry.id.slice(0, 8)}… · Created{" "}
            {new Date(entry.createdAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
