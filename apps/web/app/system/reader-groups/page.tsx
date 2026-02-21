"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ReaderGroupMember {
  id: string;
  email: string;
  displayName: string | null;
  addedAt: string;
}

interface ReaderGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count?: { members: number };
  members?: ReaderGroupMember[];
  createdBy?: { id: string; firstName: string | null; lastName: string | null };
}

function getToken() {
  return localStorage.getItem("accessToken") || "";
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export default function ReaderGroupsPage() {
  const [groups, setGroups] = useState<ReaderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create group form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Selected group (detail view)
  const [selectedGroup, setSelectedGroup] = useState<ReaderGroup | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add member form
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/system/reader-groups");
      setGroups(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGroup() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiFetch("/system/reader-groups", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDesc || undefined }),
      });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      loadGroups();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSelectGroup(id: string) {
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/system/reader-groups/${id}`);
      setSelectedGroup(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleAddMember() {
    if (!selectedGroup || !memberEmail.trim()) return;
    setAddingMember(true);
    try {
      await apiFetch(`/system/reader-groups/${selectedGroup.id}/members`, {
        method: "POST",
        body: JSON.stringify({
          members: [{ email: memberEmail, displayName: memberName || undefined }],
        }),
      });
      setMemberEmail("");
      setMemberName("");
      handleSelectGroup(selectedGroup.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedGroup) return;
    try {
      await apiFetch(`/system/reader-groups/${selectedGroup.id}/members/${memberId}`, {
        method: "DELETE",
      });
      handleSelectGroup(selectedGroup.id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Delete this reader group? This cannot be undone.")) return;
    try {
      await apiFetch(`/system/reader-groups/${id}`, { method: "DELETE" });
      setSelectedGroup(null);
      loadGroups();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link href="/system/documents" style={{ color: "#6b7280", fontSize: 12, textDecoration: "none" }}>
            ← Documents
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>📧 Reader Groups</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            Manage named groups of email recipients for secure document sharing.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          + New Group
        </button>
      </div>

      {/* Create Group Form */}
      {showCreate && (
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12 }}>Create Reader Group</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name (e.g., Board Members)"
              style={{ padding: "10px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{ padding: "10px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCreateGroup}
                disabled={creating}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  background: creating ? "#9ca3af" : "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  background: "white",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 12, marginBottom: 16, color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 20 }}>
        {/* Groups List */}
        <div style={{ flex: 1 }}>
          {loading ? (
            <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading...</div>
          ) : groups.length === 0 ? (
            <div style={{ color: "#9ca3af", fontSize: 13, padding: 24, textAlign: "center" }}>
              No reader groups yet. Create one to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGroup(g.id)}
                  style={{
                    padding: 14,
                    background: selectedGroup?.id === g.id ? "#eff6ff" : "white",
                    border: `1px solid ${selectedGroup?.id === g.id ? "#93c5fd" : "#e5e7eb"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{g.name}</div>
                  {g.description && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{g.description}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                    {g._count?.members ?? 0} members · Created {new Date(g.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group Detail Panel */}
        {selectedGroup && (
          <div style={{ flex: 1, background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            {loadingDetail ? (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading...</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>{selectedGroup.name}</h2>
                    {selectedGroup.description && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{selectedGroup.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteGroup(selectedGroup.id)}
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      background: "white",
                      border: "1px solid #fca5a5",
                      borderRadius: 4,
                      color: "#b91c1c",
                      cursor: "pointer",
                    }}
                  >
                    Delete Group
                  </button>
                </div>

                {/* Add Member */}
                <div style={{ marginTop: 16, display: "flex", gap: 6 }}>
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="email@example.com"
                    style={{ flex: 2, padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                  <input
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Name"
                    style={{ flex: 1, padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6 }}
                  />
                  <button
                    onClick={handleAddMember}
                    disabled={addingMember}
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 500,
                      background: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: addingMember ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Add
                  </button>
                </div>

                {/* Members List */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 8 }}>
                    Members ({selectedGroup.members?.length ?? 0})
                  </div>
                  {(selectedGroup.members?.length ?? 0) === 0 ? (
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>No members yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {selectedGroup.members!.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 10px",
                            background: "#f9fafb",
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 500 }}>{m.email}</span>
                            {m.displayName && (
                              <span style={{ color: "#6b7280", marginLeft: 8 }}>{m.displayName}</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            style={{
                              padding: "2px 6px",
                              fontSize: 11,
                              background: "white",
                              border: "1px solid #d1d5db",
                              borderRadius: 4,
                              cursor: "pointer",
                              color: "#6b7280",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
