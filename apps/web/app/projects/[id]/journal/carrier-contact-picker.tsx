"use client";

import React, { useState, useMemo } from "react";
import type { CarrierContact, CreateCarrierContactDto } from "./types";

interface CarrierContactPickerProps {
  contacts: CarrierContact[];
  selectedContactId: string | null;
  onSelect: (contactId: string | null) => void;
  onCreateContact: (dto: CreateCarrierContactDto) => Promise<CarrierContact>;
  disabled?: boolean;
}

export function CarrierContactPicker({
  contacts,
  selectedContactId,
  onSelect,
  onCreateContact,
  disabled = false,
}: CarrierContactPickerProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCarrierName, setNewCarrierName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeContacts = useMemo(
    () => contacts.filter((c) => c.isActive),
    [contacts]
  );

  const groupedByCarrier = useMemo(() => {
    const map = new Map<string, CarrierContact[]>();
    for (const c of activeContacts) {
      const existing = map.get(c.carrierName) || [];
      existing.push(c);
      map.set(c.carrierName, existing);
    }
    return map;
  }, [activeContacts]);

  const handleCreate = async () => {
    if (!newCarrierName.trim()) {
      setError("Carrier name is required");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const created = await onCreateContact({
        carrierName: newCarrierName.trim(),
        contactName: newContactName.trim() || null,
        role: newRole.trim() || null,
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
      });

      onSelect(created.id);
      setShowNewForm(false);
      setNewCarrierName("");
      setNewContactName("");
      setNewRole("");
      setNewEmail("");
      setNewPhone("");
    } catch (err: any) {
      setError(err?.message || "Failed to create contact");
    } finally {
      setCreating(false);
    }
  };

  if (showNewForm) {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: "#f9fafb",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>
          Add New Carrier Contact
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
              Carrier Name *
            </label>
            <input
              type="text"
              value={newCarrierName}
              onChange={(e) => setNewCarrierName(e.target.value)}
              placeholder="e.g., State Farm, Allstate"
              disabled={creating}
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                Contact Name
              </label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="e.g., John Smith"
                disabled={creating}
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
              <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                Role
              </label>
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="e.g., Adjuster, Claims Manager"
                disabled={creating}
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="john.smith@carrier.com"
                disabled={creating}
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
              <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                Phone
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="555-123-4567"
                disabled={creating}
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
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#b91c1c" }}>{error}</div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newCarrierName.trim()}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: creating ? "#9ca3af" : "#0f172a",
              color: "#ffffff",
              fontSize: 12,
              cursor: creating ? "default" : "pointer",
            }}
          >
            {creating ? "Creating…" : "Add Contact"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewForm(false);
              setError(null);
            }}
            disabled={creating}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <select
        value={selectedContactId || ""}
        onChange={(e) => onSelect(e.target.value || null)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 12,
          background: "#ffffff",
        }}
      >
        <option value="">-- Select carrier contact --</option>
        {Array.from(groupedByCarrier.entries()).map(([carrierName, carrierContacts]) => (
          <optgroup key={carrierName} label={carrierName}>
            {carrierContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contactName || "(General)"} {c.role ? `– ${c.role}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setShowNewForm(true)}
        disabled={disabled}
        style={{
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px dashed #9ca3af",
          background: "transparent",
          color: "#6b7280",
          fontSize: 11,
          cursor: disabled ? "default" : "pointer",
          textAlign: "left",
        }}
      >
        + Add new carrier contact
      </button>
    </div>
  );
}
