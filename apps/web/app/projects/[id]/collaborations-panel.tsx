"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Collaboration {
  id: string;
  company: { id: string; name: string; tier?: string };
  role: string;
  visibility: string;
  invitedAt: string;
  acceptedAt: string | null;
  invitedBy: { id: string; name: string };
  notes: string | null;
}

const ROLE_OPTIONS = [
  { value: "CLIENT", label: "Client" },
  { value: "SUB", label: "Subcontractor" },
  { value: "PRIME_GC", label: "Prime GC" },
  { value: "CONSULTANT", label: "Consultant" },
  { value: "INSPECTOR", label: "Inspector" },
];

const VISIBILITY_OPTIONS = [
  { value: "LIMITED", label: "Limited" },
  { value: "FULL", label: "Full" },
];

export default function CollaborationsPanel({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string; tier?: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState("CLIENT");
  const [addVisibility, setAddVisibility] = useState("LIMITED");
  const [addNotes, setAddNotes] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Invite new org form
  const [showInviteNew, setShowInviteNew] = useState(false);
  const [inviteCompanyName, setInviteCompanyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const getToken = () => localStorage.getItem("accessToken") || "";

  const fetchCollaborations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/collaborations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCollaborations(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCollaborations();
  }, [fetchCollaborations]);

  const searchCompanies = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSearchResults([]);
        return;
      }
      const token = getToken();
      if (!token) return;
      setSearching(true);
      try {
        const res = await fetch(
          `${API_BASE}/companies/search?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const handleAddCollaboration = async () => {
    if (!selectedCompanyId) return;
    const token = getToken();
    if (!token) return;

    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/collaborations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          role: addRole,
          visibility: addVisibility,
          notes: addNotes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAddError(data.message || "Failed to add collaboration");
        return;
      }
      // Reset form and reload
      setShowAdd(false);
      setSelectedCompanyId(null);
      setCompanySearch("");
      setSearchResults([]);
      setAddRole("CLIENT");
      setAddVisibility("LIMITED");
      setAddNotes("");
      fetchCollaborations();
    } catch (err: any) {
      setAddError(err.message || "Failed to add collaboration");
    } finally {
      setAddSaving(false);
    }
  };

  const handleRevoke = async (collabId: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/projects/${projectId}/collaborations/${collabId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchCollaborations();
    } catch {
      // ignore
    }
  };

  const handleInviteNewOrg = async () => {
    if (!inviteCompanyName || !inviteEmail) return;
    const token = getToken();
    if (!token) return;

    setInviteSaving(true);
    setInviteMessage(null);
    try {
      const res = await fetch(`${API_BASE}/companies/invite-client-org`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyName: inviteCompanyName,
          contactEmail: inviteEmail,
          contactFirstName: inviteFirstName || undefined,
          contactLastName: inviteLastName || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInviteMessage(data.message || "Failed to invite organization");
        return;
      }
      const data = await res.json();
      setInviteMessage(
        data.alreadyExists
          ? `Organization "${data.company.name}" already exists. You can now add them as a collaborator.`
          : `Invitation sent to ${inviteEmail}. They'll receive an email to set up their organization.`
      );
      // Pre-select the new company for adding as collaborator
      setSelectedCompanyId(data.company.id);
      setCompanySearch(data.company.name);
      setShowInviteNew(false);
      setShowAdd(true);
    } catch (err: any) {
      setInviteMessage(err.message || "Failed to invite organization");
    } finally {
      setInviteSaving(false);
    }
  };

  const roleLabel = (role: string) =>
    ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;

  const visibilityLabel = (vis: string) =>
    VISIBILITY_OPTIONS.find((o) => o.value === vis)?.label ?? vis;

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      <button
        type="button"
        onClick={() => startTransition(() => setExpanded((v) => !v))}
        style={{
          width: "100%",
          padding: "6px 10px",
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          background: "#f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 8,
          cursor: "pointer",
          borderRadius: expanded ? "8px 8px 0 0" : 8,
          textAlign: "left",
          borderBottom: expanded ? "1px solid #e5e7eb" : "none",
        }}
      >
        <span
          style={{
            display: "inline-block",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            fontSize: 11,
          }}
        >
          ▶
        </span>
        <span>Collaborating Organizations</span>
        <span style={{ fontWeight: 400, fontSize: 12, color: "#6b7280" }}>
          ({collaborations.length})
        </span>
        {canManage && expanded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAdd(true);
              setShowInviteNew(false);
            }}
            style={{
              marginLeft: "auto",
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontSize: 11,
              cursor: "pointer",
              color: "#2563eb",
              fontWeight: 500,
            }}
          >
            + Add
          </button>
        )}
      </button>

      {expanded && (
        <div style={{ padding: 10, fontSize: 12 }}>
          {loading ? (
            <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p>
          ) : collaborations.length === 0 && !showAdd ? (
            <p style={{ margin: 0, color: "#6b7280" }}>
              No collaborating organizations yet.
              {canManage && " Click + Add to invite a company."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {collaborations.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>
                      {c.company.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 2,
                        color: "#6b7280",
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: "#dbeafe",
                          color: "#1e40af",
                          fontWeight: 500,
                        }}
                      >
                        {roleLabel(c.role)}
                      </span>
                      <span>Visibility: {visibilityLabel(c.visibility)}</span>
                      {c.acceptedAt ? (
                        <span style={{ color: "#059669" }}>✓ Accepted</span>
                      ) : (
                        <span style={{ color: "#d97706" }}>⏳ Pending</span>
                      )}
                    </div>
                    {c.notes && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: "#4b5563",
                          fontStyle: "italic",
                        }}
                      >
                        {c.notes}
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(c.id)}
                      title="Revoke collaboration"
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        fontSize: 11,
                        cursor: "pointer",
                        color: "#dc2626",
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add collaboration form */}
          {showAdd && canManage && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 6,
                border: "1px solid #dbeafe",
                background: "#eff6ff",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#1e40af" }}>
                Add Collaborating Organization
              </div>

              {/* Company search */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                  Search Company
                </label>
                <input
                  type="text"
                  value={companySearch}
                  onChange={(e) => {
                    setCompanySearch(e.target.value);
                    setSelectedCompanyId(null);
                    searchCompanies(e.target.value);
                  }}
                  placeholder="Type company name…"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
                {searchResults.length > 0 && !selectedCompanyId && (
                  <div
                    style={{
                      marginTop: 4,
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      background: "#ffffff",
                      maxHeight: 120,
                      overflow: "auto",
                    }}
                  >
                    {searchResults.map((co) => (
                      <button
                        key={co.id}
                        type="button"
                        onClick={() => {
                          setSelectedCompanyId(co.id);
                          setCompanySearch(co.name);
                          setSearchResults([]);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "6px 8px",
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {co.name}
                        {co.tier === "CLIENT" && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: "#7c3aed",
                              fontWeight: 500,
                            }}
                          >
                            Client Org
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {companySearch.length >= 2 && searchResults.length === 0 && !searching && !selectedCompanyId && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                    No companies found.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setShowInviteNew(true);
                        setShowAdd(false);
                        setInviteCompanyName(companySearch);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#7c3aed",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      Invite a new organization →
                    </button>
                  </div>
                )}
              </div>

              {selectedCompanyId && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                        Role
                      </label>
                      <select
                        value={addRole}
                        onChange={(e) => setAddRole(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                        Visibility
                      </label>
                      <select
                        value={addVisibility}
                        onChange={(e) => setAddVisibility(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      >
                        {VISIBILITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={addNotes}
                      onChange={(e) => setAddNotes(e.target.value)}
                      placeholder="e.g. Primary insurance adjuster"
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </div>
                </>
              )}

              {addError && (
                <p style={{ margin: "0 0 8px", color: "#dc2626", fontSize: 11 }}>
                  {addError}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setSelectedCompanyId(null);
                    setCompanySearch("");
                    setSearchResults([]);
                    setAddError(null);
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                {selectedCompanyId && (
                  <button
                    type="button"
                    onClick={handleAddCollaboration}
                    disabled={addSaving}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "none",
                      background: addSaving ? "#e5e7eb" : "#2563eb",
                      color: addSaving ? "#6b7280" : "#ffffff",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: addSaving ? "default" : "pointer",
                    }}
                  >
                    {addSaving ? "Adding…" : "Add Collaboration"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Invite new organization form */}
          {showInviteNew && canManage && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 6,
                border: "1px solid #ddd6fe",
                background: "#f5f3ff",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#5b21b6" }}>
                Invite New Client Organization
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  value={inviteCompanyName}
                  onChange={(e) => setInviteCompanyName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                  Contact Email *
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="contact@clientorg.com"
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
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

              {inviteMessage && (
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 11,
                    color: inviteMessage.includes("Failed") ? "#dc2626" : "#059669",
                  }}
                >
                  {inviteMessage}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteNew(false);
                    setInviteMessage(null);
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
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
                  onClick={handleInviteNewOrg}
                  disabled={inviteSaving || !inviteCompanyName || !inviteEmail}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "none",
                    background:
                      inviteSaving || !inviteCompanyName || !inviteEmail
                        ? "#e5e7eb"
                        : "#7c3aed",
                    color:
                      inviteSaving || !inviteCompanyName || !inviteEmail
                        ? "#6b7280"
                        : "#ffffff",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor:
                      inviteSaving || !inviteCompanyName || !inviteEmail
                        ? "default"
                        : "pointer",
                  }}
                >
                  {inviteSaving ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
