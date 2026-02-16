"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Company {
  id: string;
  name: string;
}

interface PublicationGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  _count: { members: number };
  members?: Array<{
    companyId: string;
    company: { id: string; name: string };
  }>;
}

interface TenantPublishModalProps {
  documentId: string;
  documentCode: string;
  documentTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

type PublishMode = "ALL_TENANTS" | "SELECT_TENANTS" | "GROUP";

export function TenantPublishModal({
  documentId,
  documentCode,
  documentTitle,
  onClose,
  onSuccess,
}: TenantPublishModalProps) {
  const [mode, setMode] = useState<PublishMode>("ALL_TENANTS");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [groups, setGroups] = useState<PublicationGroup[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupMembers, setGroupMembers] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For creating new groups
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupCode, setNewGroupCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, []);

  // Load companies and groups on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [companiesRes, groupsRes] = await Promise.all([
          fetch(`${API_BASE}/companies`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE}/publication-groups`, { headers: getAuthHeaders() }),
        ]);

        if (companiesRes.ok) {
          const data = await companiesRes.json();
          setCompanies(Array.isArray(data) ? data : data.companies || []);
        }

        if (groupsRes.ok) {
          const data = await groupsRes.json();
          setGroups(data);
        }
      } catch (err) {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [getAuthHeaders]);

  // Load group members when a group is selected
  useEffect(() => {
    async function loadGroupMembers() {
      if (!selectedGroupId) {
        setGroupMembers([]);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/publication-groups/${selectedGroupId}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const group = await res.json();
          const members = group.members?.map((m: any) => m.company) || [];
          setGroupMembers(members);
          // Auto-select group members
          setSelectedCompanyIds(new Set(members.map((m: Company) => m.id)));
        }
      } catch {
        setError("Failed to load group members");
      }
    }
    loadGroupMembers();
  }, [selectedGroupId, getAuthHeaders]);

  const handleToggleCompany = (companyId: string) => {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedCompanyIds(new Set(companies.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedCompanyIds(new Set());
  };

  const handleMoveToSelected = () => {
    // Already handled by checkbox toggles
  };

  const handleRemoveFromSelected = (companyId: string) => {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      next.delete(companyId);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupCode.trim() || !newGroupName.trim()) {
      alert("Please enter group code and name");
      return;
    }

    if (selectedCompanyIds.size === 0) {
      alert("Please select at least one tenant for the group");
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await fetch(`${API_BASE}/publication-groups`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          code: newGroupCode.trim().toUpperCase(),
          name: newGroupName.trim(),
          companyIds: Array.from(selectedCompanyIds),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create group");
      }

      const newGroup = await res.json();
      setGroups((prev) => [...prev, newGroup]);
      setSelectedGroupId(newGroup.id);
      setMode("GROUP");
      setShowNewGroup(false);
      setNewGroupCode("");
      setNewGroupName("");
    } catch (err: any) {
      alert(err.message || "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);

    try {
      let body: any;

      if (mode === "ALL_TENANTS") {
        body = { targetType: "ALL_TENANTS" };
      } else if (mode === "GROUP" && selectedGroupId) {
        body = { targetType: "GROUP", targetGroupId: selectedGroupId };
      } else if (mode === "SELECT_TENANTS" || (mode === "GROUP" && !selectedGroupId)) {
        // Use selected tenants
        if (selectedCompanyIds.size === 0) {
          alert("Please select at least one tenant");
          setPublishing(false);
          return;
        }
        if (selectedCompanyIds.size === 1) {
          body = {
            targetType: "SINGLE_TENANT",
            targetCompanyId: Array.from(selectedCompanyIds)[0],
          };
        } else {
          body = {
            targetType: "MULTIPLE_TENANTS",
            targetCompanyIds: Array.from(selectedCompanyIds),
          };
        }
      }

      const res = await fetch(`${API_BASE}/system-documents/${documentId}/publish`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to publish");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const availableTenants = companies.filter((c) => !selectedCompanyIds.has(c.id));
  const selectedTenants = companies.filter((c) => selectedCompanyIds.has(c.id));

  if (loading) {
    return (
      <ModalWrapper onClose={onClose}>
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>
      </ModalWrapper>
    );
  }

  return (
    <ModalWrapper onClose={onClose}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Publish Document</h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
        <strong>{documentCode}</strong>: {documentTitle}
      </p>

      {error && (
        <div style={{ padding: 10, background: "#fef2f2", color: "#b91c1c", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Mode Selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ModeButton active={mode === "ALL_TENANTS"} onClick={() => setMode("ALL_TENANTS")}>
            📢 All Tenants
          </ModeButton>
          <ModeButton active={mode === "SELECT_TENANTS"} onClick={() => setMode("SELECT_TENANTS")}>
            ✅ Select Tenants
          </ModeButton>
          <ModeButton active={mode === "GROUP"} onClick={() => setMode("GROUP")}>
            📁 Publication Group
          </ModeButton>
        </div>
      </div>

      {/* ALL_TENANTS - Simple message */}
      {mode === "ALL_TENANTS" && (
        <div style={{ padding: 20, background: "#f0fdf4", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "#166534" }}>
            Document will be published to <strong>all {companies.length} tenants</strong>.
          </div>
        </div>
      )}

      {/* SELECT_TENANTS - Dual list picker */}
      {mode === "SELECT_TENANTS" && (
        <DualListPicker
          availableTenants={availableTenants}
          selectedTenants={selectedTenants}
          onToggle={handleToggleCompany}
          onRemove={handleRemoveFromSelected}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
        />
      )}

      {/* GROUP - Group selector + dual list */}
      {mode === "GROUP" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Publication Group
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                }}
              >
                <option value="">-- Select a group --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g._count.members} tenants)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewGroup(!showNewGroup)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: showNewGroup ? "#e5e7eb" : "#ffffff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                + New
              </button>
            </div>
          </div>

          {/* New Group Form */}
          {showNewGroup && (
            <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Create New Group</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Code (e.g., WEST)"
                  value={newGroupCode}
                  onChange={(e) => setNewGroupCode(e.target.value.toUpperCase())}
                  style={{
                    width: 100,
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
                <input
                  type="text"
                  placeholder="Group Name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={creatingGroup}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 4,
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    fontSize: 12,
                    cursor: creatingGroup ? "default" : "pointer",
                    opacity: creatingGroup ? 0.7 : 1,
                  }}
                >
                  {creatingGroup ? "..." : "Create"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Select tenants below, then create the group. {selectedCompanyIds.size} selected.
              </div>
            </div>
          )}

          {/* Show dual list for group editing / selection */}
          <DualListPicker
            availableTenants={availableTenants}
            selectedTenants={selectedTenants}
            onToggle={handleToggleCompany}
            onRemove={handleRemoveFromSelected}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />

          {selectedGroupId && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
              Publishing via group will use the group's saved members, not current selection.
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing}
          style={{
            padding: "8px 20px",
            borderRadius: 4,
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
            cursor: publishing ? "default" : "pointer",
            opacity: publishing ? 0.7 : 1,
          }}
        >
          {publishing ? "Publishing..." : `Publish${mode === "SELECT_TENANTS" ? ` to ${selectedCompanyIds.size}` : ""}`}
        </button>
      </div>
    </ModalWrapper>
  );
}

function ModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 8,
          padding: 24,
          width: "95%",
          maxWidth: 700,
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 6,
        border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
        background: active ? "#eff6ff" : "#ffffff",
        color: active ? "#1d4ed8" : "#374151",
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

interface DualListPickerProps {
  availableTenants: Company[];
  selectedTenants: Company[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

function DualListPicker({
  availableTenants,
  selectedTenants,
  onToggle,
  onRemove,
  onSelectAll,
  onDeselectAll,
}: DualListPickerProps) {
  const [searchLeft, setSearchLeft] = useState("");
  const [searchRight, setSearchRight] = useState("");

  const filteredAvailable = availableTenants.filter((c) =>
    c.name.toLowerCase().includes(searchLeft.toLowerCase())
  );
  const filteredSelected = selectedTenants.filter((c) =>
    c.name.toLowerCase().includes(searchRight.toLowerCase())
  );

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
      {/* Left Panel - Available */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Available ({availableTenants.length})</span>
          <button
            type="button"
            onClick={onSelectAll}
            style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
          >
            Select All
          </button>
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={searchLeft}
          onChange={(e) => setSearchLeft(e.target.value)}
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #e5e7eb",
            fontSize: 12,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            height: 200,
            overflowY: "auto",
            background: "#ffffff",
          }}
        >
          {filteredAvailable.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              {searchLeft ? "No matches" : "No available tenants"}
            </div>
          ) : (
            filteredAvailable.map((company) => (
              <div
                key={company.id}
                onClick={() => onToggle(company.id)}
                style={{
                  padding: "8px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                  borderBottom: "1px solid #f3f4f6",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
              >
                <span style={{ color: "#9ca3af" }}>○</span>
                {company.name}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Middle - Move buttons */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
        <button
          type="button"
          onClick={onSelectAll}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 12,
            cursor: "pointer",
          }}
          title="Move all to selected"
        >
          »
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 12,
            cursor: "pointer",
          }}
          title="Remove all from selected"
        >
          «
        </button>
      </div>

      {/* Right Panel - Selected */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#059669" }}>
            Selected ({selectedTenants.length})
          </span>
          <button
            type="button"
            onClick={onDeselectAll}
            style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={searchRight}
          onChange={(e) => setSearchRight(e.target.value)}
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #e5e7eb",
            fontSize: 12,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            border: "1px solid #d1fae5",
            borderRadius: 6,
            height: 200,
            overflowY: "auto",
            background: "#f0fdf4",
          }}
        >
          {filteredSelected.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              {searchRight ? "No matches" : "No tenants selected"}
            </div>
          ) : (
            filteredSelected.map((company) => (
              <div
                key={company.id}
                style={{
                  padding: "8px 10px",
                  fontSize: 13,
                  borderBottom: "1px solid #d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#059669" }}>✓</span>
                  {company.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(company.id)}
                  style={{
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "none",
                    background: "#fee2e2",
                    color: "#dc2626",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
