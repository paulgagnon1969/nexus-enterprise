"use client";

import React, { useState, useCallback } from "react";
import { CarrierContactPicker } from "./carrier-contact-picker";
import {
  ENTRY_TYPE_LABELS,
  DIRECTION_LABELS,
  type CarrierContact,
  type ClaimJournalEntryType,
  type ClaimJournalDirection,
  type CreateJournalEntryDto,
  type CreateCarrierContactDto,
} from "./types";

interface JournalEntryFormProps {
  contacts: CarrierContact[];
  onSubmit: (dto: CreateJournalEntryDto) => Promise<void>;
  onCreateContact: (dto: CreateCarrierContactDto) => Promise<CarrierContact>;
  onCancel?: () => void;
  correctsEntryId?: string | null;
}

const ENTRY_TYPES: ClaimJournalEntryType[] = [
  "SUBMISSION",
  "RESPONSE",
  "CALL",
  "EMAIL",
  "MEETING",
  "NOTE",
  "APPROVAL",
  "DENIAL",
  "PARTIAL_APPROVAL",
];

const DIRECTIONS: ClaimJournalDirection[] = ["OUTBOUND", "INBOUND", "INTERNAL"];

export function JournalEntryForm({
  contacts,
  onSubmit,
  onCreateContact,
  onCancel,
  correctsEntryId,
}: JournalEntryFormProps) {
  const [entryType, setEntryType] = useState<ClaimJournalEntryType>("NOTE");
  const [direction, setDirection] = useState<ClaimJournalDirection>("INTERNAL");
  const [carrierContactId, setCarrierContactId] = useState<string | null>(null);
  const [actorNameOverride, setActorNameOverride] = useState("");
  const [actorOrgOverride, setActorOrgOverride] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [disputedAmount, setDisputedAmount] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [deniedAmount, setDeniedAmount] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show amount fields for relevant entry types
  const showAmountFields =
    entryType === "SUBMISSION" ||
    entryType === "APPROVAL" ||
    entryType === "DENIAL" ||
    entryType === "PARTIAL_APPROVAL" ||
    entryType === "RESPONSE";

  // Show carrier contact picker for external entries
  const showCarrierPicker = direction !== "INTERNAL";

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!summary.trim()) {
        setError("Summary is required");
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const tags = tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        const dto: CreateJournalEntryDto = {
          entryType,
          direction,
          carrierContactId: showCarrierPicker ? carrierContactId : null,
          actorNameOverride: actorNameOverride.trim() || null,
          actorOrgOverride: actorOrgOverride.trim() || null,
          occurredAt: new Date(occurredAt).toISOString(),
          summary: summary.trim(),
          details: details.trim() || null,
          amountDisputed: disputedAmount ? parseFloat(disputedAmount) : null,
          amountApproved: approvedAmount ? parseFloat(approvedAmount) : null,
          amountDenied: deniedAmount ? parseFloat(deniedAmount) : null,
          tags: tags.length ? tags : undefined,
        };

        await onSubmit(dto);

        // Reset form
        setEntryType("NOTE");
        setDirection("INTERNAL");
        setCarrierContactId(null);
        setActorNameOverride("");
        setActorOrgOverride("");
        setOccurredAt(new Date().toISOString().slice(0, 16));
        setSummary("");
        setDetails("");
        setDisputedAmount("");
        setApprovedAmount("");
        setDeniedAmount("");
        setTagsInput("");
      } catch (err: any) {
        setError(err?.message || "Failed to create entry");
      } finally {
        setSaving(false);
      }
    },
    [
      entryType,
      direction,
      carrierContactId,
      actorNameOverride,
      actorOrgOverride,
      occurredAt,
      summary,
      details,
      disputedAmount,
      approvedAmount,
      deniedAmount,
      tagsInput,
      showCarrierPicker,
      onSubmit,
    ]
  );

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
        {correctsEntryId ? "Create Correction Entry" : "New Journal Entry"}
      </div>

      {correctsEntryId && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            borderRadius: 4,
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            fontSize: 11,
            color: "#92400e",
          }}
        >
          This entry will be linked as a correction to the original entry.
          The original entry remains in the audit trail.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Entry Type */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Entry Type *
          </label>
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as ClaimJournalEntryType)}
            disabled={saving}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Direction */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Direction *
          </label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as ClaimJournalDirection)}
            disabled={saving}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Carrier Contact Picker */}
      {showCarrierPicker && (
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            Carrier Contact
          </label>
          <CarrierContactPicker
            contacts={contacts}
            selectedContactId={carrierContactId}
            onSelect={setCarrierContactId}
            onCreateContact={onCreateContact}
            disabled={saving}
          />
        </div>
      )}

      {/* Actor Override (manual entry if not using contact) */}
      {showCarrierPicker && !carrierContactId && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Contact Name (manual)
            </label>
            <input
              type="text"
              value={actorNameOverride}
              onChange={(e) => setActorNameOverride(e.target.value)}
              placeholder="e.g., Jane Doe"
              disabled={saving}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Organization (manual)
            </label>
            <input
              type="text"
              value={actorOrgOverride}
              onChange={(e) => setActorOrgOverride(e.target.value)}
              placeholder="e.g., Carrier Name"
              disabled={saving}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </div>
        </div>
      )}

      {/* Date/Time */}
      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          When did this occur? *
        </label>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          disabled={saving}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        />
      </div>

      {/* Summary */}
      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          Summary *
        </label>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Brief summary of the interaction or event"
          disabled={saving}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        />
      </div>

      {/* Details */}
      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          Details
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Additional details, notes, or context"
          disabled={saving}
          rows={3}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 12,
            resize: "vertical",
          }}
        />
      </div>

      {/* Amount Fields */}
      {showAmountFields && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Disputed $
            </label>
            <input
              type="number"
              step="0.01"
              value={disputedAmount}
              onChange={(e) => setDisputedAmount(e.target.value)}
              placeholder="0.00"
              disabled={saving}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Approved $
            </label>
            <input
              type="number"
              step="0.01"
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value)}
              placeholder="0.00"
              disabled={saving}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Denied $
            </label>
            <input
              type="number"
              step="0.01"
              value={deniedAmount}
              onChange={(e) => setDeniedAmount(e.target.value)}
              placeholder="0.00"
              disabled={saving}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g., supplement-1, roof, disputed"
          disabled={saving}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c" }}>{error}</div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={saving || !summary.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: saving || !summary.trim() ? "#9ca3af" : "#0f172a",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
            cursor: saving || !summary.trim() ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : correctsEntryId ? "Create Correction" : "Add Entry"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
