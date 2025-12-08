"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Project {
  id: string;
  name: string;
  status: string;
  city: string;
  state: string;
  addressLine1: string;
  addressLine2: string | null;
  createdAt: string;
}

interface PetlItem {
  id: string;
  lineNo: number;
  description: string | null;
  qty: number | null;
  unit: string | null;
  itemAmount: number | null;
  rcvAmount: number | null;
  percentComplete: number;
  payerType: string;
  categoryCode: string | null;
  selectionCode: string | null;
  projectParticle?: {
    id: string;
    name: string;
    fullLabel: string;
  } | null;
}

interface Participant {
  id: string;
  userId: string;
  projectId: string;
  companyId: string;
  role: string;
  scope: "OWNER_MEMBER" | "COLLABORATOR_MEMBER" | "EXTERNAL_CONTACT";
  visibility: "FULL" | "LIMITED" | "READ_ONLY";
  user: {
    id: string;
    email: string;
  };
  company: {
    id: string;
    name: string;
  };
}

interface TagAssignmentDto {
  id: string;
  tagId: string;
  tag: {
    id: string;
    code: string;
    label: string;
    color: string | null;
  };
}

interface SimpleTag {
  id: string;
  label: string;
  color: string | null;
}

interface DailyLogAttachmentDto {
  id: string;
  fileUrl: string;
  fileName: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

interface DailyLog {
  id: string;
  projectId: string;
  logDate: string;
  title: string | null;
  weatherSummary: string | null;
  crewOnSite: string | null;
  workPerformed: string | null;
  issues: string | null;
  safetyIncidents: string | null;
  manpowerOnsite: string | null;
  personOnsite: string | null;
  confidentialNotes: string | null;
  shareInternal: boolean;
  shareSubs: boolean;
  shareClient: boolean;
  sharePrivate: boolean;
  status?: "SUBMITTED" | "APPROVED" | "REJECTED";
  effectiveShareClient?: boolean;
  createdAt: string;
  createdByUser?: {
    id: string;
    email: string;
  } | null;
  attachments?: DailyLogAttachmentDto[];
}

interface NewDailyLogState {
  logDate: string;
  title: string;
  tags: string;
  weatherSummary: string;
  workPerformed: string;
  crewOnSite: string;
  issues: string;
  safetyIncidents: string;
  manpowerOnsite: string;
  personOnsite: string;
  confidentialNotes: string;
  shareInternal: boolean;
  shareSubs: boolean;
  shareClient: boolean;
  sharePrivate: boolean;
}

type TabKey = "SUMMARY" | "PETL" | "DAILY_LOGS" | "FILES" | "FINANCIAL";

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [petlItemCount, setPetlItemCount] = useState<number | null>(null);
  const [petlTotalAmount, setPetlTotalAmount] = useState<number | null>(null);
  const [petlItems, setPetlItems] = useState<PetlItem[]>([]);
  const [petlLoading, setPetlLoading] = useState(false);

  const [participants, setParticipants] = useState<
    | {
        myOrganization: Participant[];
        collaborators: Participant[];
      }
    | null
  >(null);

  const [availableMembers, setAvailableMembers] = useState<
    { userId: string; email: string; role: string }[]
  >([]);
  const [newMemberRole, setNewMemberRole] = useState<"MANAGER" | "VIEWER">("MANAGER");

  const [availableTags, setAvailableTags] = useState<SimpleTag[]>([]);
  const [projectTags, setProjectTags] = useState<TagAssignmentDto[]>([]);
  const [tagsSaving, setTagsSaving] = useState(false);

  // Progress controls state
  const [groupLoading, setGroupLoading] = useState(false);
  const [groups, setGroups] = useState<{
    id: number;
    particleId: string | null;
    roomName: string;
    itemsCount: number;
    totalAmount: number;
    completedAmount: number;
    percentComplete: number;
  }[]>([]);

  const [roomFilter, setRoomFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [selectionFilter, setSelectionFilter] = useState<string>("");
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  const [operation, setOperation] = useState<"set" | "increment" | "decrement">("set");
  const [operationPercent, setOperationPercent] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const [selectionSummary, setSelectionSummary] = useState<{
    itemCount: number;
    totalAmount: number;
    completedAmount: number;
    percentComplete: number;
  } | null>(null);

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [dailyLogsLoading, setDailyLogsLoading] = useState(false);
  const [dailyLogSaving, setDailyLogSaving] = useState(false);
  const [dailyLogMessage, setDailyLogMessage] = useState<string | null>(null);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [showPendingClientOnly, setShowPendingClientOnly] = useState(false);

  const [newDailyLog, setNewDailyLog] = useState<NewDailyLogState>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      logDate: today,
      title: "",
      tags: "",
      weatherSummary: "",
      workPerformed: "",
      crewOnSite: "",
      issues: "",
      safetyIncidents: "",
      manpowerOnsite: "",
      personOnsite: "",
      confidentialNotes: "",
      shareInternal: true,
      shareSubs: false,
      shareClient: false,
      sharePrivate: false,
    };
  });

  const [hierarchy, setHierarchy] = useState<{
    project: any;
    buildings: any[];
    units: any[];
  } | null>(null);
  const [structureOpen, setStructureOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("SUMMARY");

  const overallSummary = useMemo(() => {
    if (!petlItems.length) return null;
    let count = 0;
    let total = 0;
    let completed = 0;
    for (const item of petlItems) {
      const amt = item.itemAmount ?? 0;
      const pct = item.percentComplete ?? 0;
      count += 1;
      total += amt;
      completed += amt * (pct / 100);
    }
    return {
      itemCount: count,
      totalAmount: total,
      completedAmount: completed,
      percentComplete: total > 0 ? (completed / total) * 100 : 0
    };
  }, [petlItems]);

  // Derived filter options
  const roomOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const g of groups) {
      if (!g.particleId) continue;
      if (seen.has(g.particleId)) continue;
      seen.add(g.particleId);
      opts.push({ value: g.particleId, label: g.roomName });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [groups]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of petlItems) {
      if (item.categoryCode) set.add(item.categoryCode);
    }
    return Array.from(set.values()).sort();
  }, [petlItems]);

  const selectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of petlItems) {
      if (item.selectionCode) set.add(item.selectionCode);
    }
    return Array.from(set.values()).sort();
  }, [petlItems]);

  const matchesFilters = (item: PetlItem) => {
    if (roomFilter) {
      const particleId = item.projectParticle?.id;
      if (!particleId || particleId !== roomFilter) return false;
    }
    if (categoryFilter && item.categoryCode !== categoryFilter) return false;
    if (selectionFilter && item.selectionCode !== selectionFilter) return false;
    return true;
  };

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error(`Failed to load project (${res.status})`);
        }
        const data: Project[] = await res.json();
        const found = data.find(p => p.id === id) ?? null;
        if (!found) {
          setError("Project not found for this account.");
          return;
        }

        setProject(found);

        // Load a lightweight estimate summary (item count + total amount)
        try {
          const summaryRes = await fetch(`${API_BASE}/projects/${id}/estimate-summary`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (summaryRes.ok) {
            const summary: any = await summaryRes.json();
            setPetlItemCount(typeof summary.itemCount === "number" ? summary.itemCount : null);
            setPetlTotalAmount(
              typeof summary.totalAmount === "number" ? summary.totalAmount : null
            );
          }
        } catch {
          // Ignore summary errors in this lightweight view
        }

        // Load full PETL items for this project
        try {
          setPetlLoading(true);
          const petlRes = await fetch(`${API_BASE}/projects/${id}/petl`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (petlRes.ok) {
            const petl: any = await petlRes.json();
            const items: PetlItem[] = Array.isArray(petl.items) ? petl.items : [];
            setPetlItems(items);
          }
        } catch {
          // ignore PETL errors for now; UI will just show placeholder
        } finally {
          setPetlLoading(false);
        }

        // Load room/zone group summary for PETL
        try {
          setGroupLoading(true);
          const groupsRes = await fetch(`${API_BASE}/projects/${id}/petl-groups`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (groupsRes.ok) {
            const json: any = await groupsRes.json();
            setGroups(Array.isArray(json.groups) ? json.groups : []);
          }
        } catch {
          // ignore group summary errors; UI will just hide the section
        } finally {
          setGroupLoading(false);
        }

        // Load hierarchy (site / buildings / units / particles)
        try {
          const hRes = await fetch(`${API_BASE}/projects/${id}/hierarchy`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (hRes.ok) {
            const json: any = await hRes.json();
            setHierarchy(json);
          }
        } catch {
          // hierarchy is optional
        }

        // Load internal company members (for My Organization picker)
        try {
          const companyRes = await fetch(`${API_BASE}/companies/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (companyRes.ok) {
            const companyJson: any = await companyRes.json();
            const members: any[] = companyJson?.memberships ?? [];
            setAvailableMembers(
              members.map(m => ({
                userId: m.userId,
                email: m.user?.email ?? "(user)",
                role: m.role,
              }))
            );
          }
        } catch {
          // optional
        }

        // Load available project tags for this company (any tags ever used on projects)
        try {
          const tagRes = await fetch(`${API_BASE}/tags?entityType=project`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (tagRes.ok) {
            const tagsJson: any[] = await tagRes.json();
            setAvailableTags(
              (tagsJson || []).map(t => ({
                id: t.id,
                label: t.label,
                color: t.color ?? null
              }))
            );
          }
        } catch {
          // optional
        }

        // Load tags assigned to this project
        try {
          const projTagsRes = await fetch(`${API_BASE}/tags/projects/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (projTagsRes.ok) {
            const projTagsJson: TagAssignmentDto[] = await projTagsRes.json();
            setProjectTags(projTagsJson || []);
          }
        } catch {
          // optional
        }

        // Load participants (My Organization / Collaborators)
        try {
          const partsRes = await fetch(`${API_BASE}/projects/${id}/participants`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (partsRes.ok) {
            const json: any = await partsRes.json();
            setParticipants({
              myOrganization: json.myOrganization ?? [],
              collaborators: json.collaborators ?? []
            });
          }
        } catch {
          // optional; safe to ignore for now
        }

        // Load daily logs
        try {
          setDailyLogsLoading(true);
          const logsRes = await fetch(`${API_BASE}/projects/${id}/daily-logs`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (logsRes.ok) {
            const json: any = await logsRes.json();
            const logs: DailyLog[] = Array.isArray(json) ? json : json.items ?? [];
            setDailyLogs(logs);
          }
        } catch {
          // optional; leave logs empty on error
        } finally {
          setDailyLogsLoading(false);
        }

        // Initial selection summary (no filters)
        try {
          const selRes = await fetch(
            `${API_BASE}/projects/${id}/petl-selection-summary`,
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          );
          if (selRes.ok) {
            const json: any = await selRes.json();
            setSelectionSummary({
              itemCount: json.itemCount ?? 0,
              totalAmount: json.totalAmount ?? 0,
              completedAmount: json.completedAmount ?? 0,
              percentComplete: json.percentComplete ?? 0
            });
          }
        } catch {
          // ignore, summary is optional
        }
      } catch (err: any) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id]);

  // Refresh selection summary whenever filters change
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;

    const params = new URLSearchParams();
    if (categoryFilter) params.append("categoryCode", categoryFilter);
    if (selectionFilter) params.append("selectionCode", selectionFilter);

    // For now, only category/selection are wired server-side; room filtering uses client-side match
    if (categoryFilter || selectionFilter) {
      fetch(
        `${API_BASE}/projects/${project.id}/petl-selection-summary?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
        .then(res => res.ok ? res.json() : null)
        .then(json => {
          if (!json) return;
          setSelectionSummary({
            itemCount: json.itemCount ?? 0,
            totalAmount: json.totalAmount ?? 0,
            completedAmount: json.completedAmount ?? 0,
            percentComplete: json.percentComplete ?? 0
          });
        })
        .catch(() => {
          // ignore
        });
    } else {
      // No server-side filters; recompute from local items
      if (petlItems.length === 0) {
        setSelectionSummary(null);
      } else {
        let count = 0;
        let total = 0;
        let completed = 0;
        for (const item of petlItems) {
          const amt = item.itemAmount ?? 0;
          const pct = item.percentComplete ?? 0;
          count += 1;
          total += amt;
          completed += amt * (pct / 100);
        }
        setSelectionSummary({
          itemCount: count,
          totalAmount: total,
          completedAmount: completed,
          percentComplete: total > 0 ? (completed / total) * 100 : 0
        });
      }
    }
  }, [project, roomFilter, categoryFilter, selectionFilter, petlItems]);

  const toggleRoomExpanded = (particleId: string | null) => {
    if (!particleId) return;
    setExpandedRooms(prev => {
      const next = new Set(prev);
      if (next.has(particleId)) next.delete(particleId);
      else next.add(particleId);
      return next;
    });
  };

  const filteredItemsForRoom = (particleId: string | null) => {
    if (!particleId) return [] as PetlItem[];
    return petlItems.filter(item => {
      if (!item.projectParticle || item.projectParticle.id !== particleId) return false;
      if (categoryFilter && item.categoryCode !== categoryFilter) return false;
      if (selectionFilter && item.selectionCode !== selectionFilter) return false;
      return true;
    });
  };

  const handleCreateDailyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setDailyLogMessage(null);

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setDailyLogMessage("Missing access token. Please login again.");
      return;
    }

    if (!newDailyLog.logDate) {
      setDailyLogMessage("Log date is required.");
      return;
    }

    setDailyLogSaving(true);
    try {
      const tagsArray = newDailyLog.tags
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      const body = {
        logDate: newDailyLog.logDate,
        title: newDailyLog.title || null,
        tags: tagsArray,
        weatherSummary: newDailyLog.weatherSummary || null,
        crewOnSite: newDailyLog.crewOnSite || null,
        workPerformed: newDailyLog.workPerformed || null,
        issues: newDailyLog.issues || null,
        safetyIncidents: newDailyLog.safetyIncidents || null,
        manpowerOnsite: newDailyLog.manpowerOnsite || null,
        personOnsite: newDailyLog.personOnsite || null,
        confidentialNotes: newDailyLog.confidentialNotes || null,
        shareInternal: newDailyLog.shareInternal,
        shareSubs: newDailyLog.shareSubs,
        shareClient: newDailyLog.shareClient,
        sharePrivate: newDailyLog.sharePrivate,
        notifyUserIds: [] as string[],
      };

      const res = await fetch(`${API_BASE}/projects/${id}/daily-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setDailyLogMessage(`Failed to save log (${res.status}).`);
        return;
      }

      const created: DailyLog = await res.json();
      setDailyLogs(prev => [created, ...prev]);

      setNewDailyLog(prev => ({
        ...prev,
        title: "",
        tags: "",
        weatherSummary: "",
        workPerformed: "",
        crewOnSite: "",
        issues: "",
        safetyIncidents: "",
        manpowerOnsite: "",
        personOnsite: "",
        confidentialNotes: "",
      }));

      setDailyLogMessage("Daily log saved.");
    } catch (err: any) {
      setDailyLogMessage(err?.message || "Error saving daily log.");
    } finally {
      setDailyLogSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading project…</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Project</h1>
        <p style={{ color: "#b91c1c" }}>{error ?? "Project not found."}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>{project.name}</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Status: {project.status}
      </p>
      <p style={{ fontSize: 13, marginTop: 8 }}>
        {project.addressLine1}
        {project.addressLine2 ? `, ${project.addressLine2}` : ""}
        <br />
        {project.city}, {project.state}
      </p>
      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
        Created: {new Date(project.createdAt).toLocaleString()}
      </p>

      {petlItemCount !== null && (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
          Latest estimate: {petlItemCount} items,
          {" "}
          {petlTotalAmount !== null
            ? `$${petlTotalAmount.toLocaleString(undefined, {
                maximumFractionDigits: 2
              })}`
            : "total N/A"}
        </p>
      )}

      {/* Tab strip for project detail sections */}
      <div
        style={{
          marginTop: 16,
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          gap: 8,
        }}
      >
        {(
          [
            { key: "SUMMARY", label: "Summary" },
            { key: "PETL", label: "PETL" },
            { key: "DAILY_LOGS", label: "Daily Logs" },
            { key: "FILES", label: "Files" },
            { key: "FINANCIAL", label: "Financial" },
          ] as { key: TabKey; label: string }[]
        ).map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              border: "none",
              borderBottom:
                activeTab === tab.key ? "2px solid #2563eb" : "2px solid transparent",
              padding: "6px 8px",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: activeTab === tab.key ? "#111827" : "#6b7280",
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Global and selection percent complete summary */}
      {(overallSummary || selectionSummary) && (
        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6 }}>
          {overallSummary && (
            <div>
              Overall progress: {overallSummary.percentComplete.toFixed(2)}%
              {overallSummary.totalAmount > 0 && (
                <>
                  {" "}of $
                  {overallSummary.totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 2
                  })}
                </>
              )}
            </div>
          )}

          {selectionSummary &&
            (roomFilter || categoryFilter || selectionFilter) && (
              <div>
                Current selection: {selectionSummary.percentComplete.toFixed(2)}%
                {selectionSummary.totalAmount > 0 && (
                  <>
                    {" "}of $
                    {selectionSummary.totalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 2
                    })}
                  </>
                )}
              </div>
            )}
        </div>
      )}

      <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

      {/* SUMMARY tab content */}
      {activeTab === "SUMMARY" && (
        <div style={{ marginBottom: 16 }}>
          {/* General Info card */}
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
              }}
            >
              General Info
            </div>
            <div
              style={{
                padding: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 13,
              }}
            >
              <div>
                <div><strong>Job:</strong> {project.name}</div>
                <div><strong>Job Type:</strong> N/A</div>
                <div><strong>Job Group:</strong> N/A</div>
                <div><strong>Contract Type:</strong> N/A</div>
                <div>
                  <strong>Address:</strong> {project.addressLine1}
                  {project.addressLine2 ? `, ${project.addressLine2}` : ""}
                  , {project.city}, {project.state}
                </div>
                <div><strong>Square Feet:</strong> N/A</div>
                <div><strong>Lot Info:</strong> N/A</div>
              </div>
              <div>
                <div><strong>Status:</strong> {project.status}</div>
                <div><strong>Project Managers:</strong> N/A</div>
                <div><strong>Projected Start:</strong> N/A</div>
                <div><strong>Actual Start:</strong> N/A</div>
                <div><strong>Projected Completion:</strong> N/A</div>
                <div><strong>Actual Completion:</strong> N/A</div>
                <div><strong>Permit #:</strong> N/A</div>
                <div>
                  <strong>Contract Price:</strong>{" "}
                  {petlTotalAmount != null
                    ? `$${petlTotalAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}`
                    : "$0.00"}
                </div>
              </div>
            </div>
          </div>

          {/* Job Notes card */}
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
              }}
            >
              Job Notes
            </div>
            <div style={{ padding: 10, fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Notes for Internal Users:</div>
                <div style={{ color: "#6b7280" }}>N/A</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Notes for Subs/Vendors:</div>
                <div style={{ color: "#6b7280" }}>N/A</div>
              </div>
            </div>
          </div>

          {/* Custom fields card */}
          <div
            style={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
              }}
            >
              Custom fields
            </div>
            <div style={{ padding: 10, fontSize: 13 }}>
              <div>Claim Information: N/A</div>
              <div>Policy Documents: N/A</div>
              <div>Permit Parcel ID: N/A</div>
              <div>Contractor License: N/A</div>
              <div>FL GIS Link: N/A</div>
              <div>Local Supplier Link: N/A</div>
              <div># Property Special Notes: N/A</div>
            </div>
          </div>

          {/* Job Groups / Tags card */}
          <div
            style={{
              marginTop: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
              }}
            >
              Job Groups / Tags
            </div>
            <div style={{ padding: 10, fontSize: 13 }}>
              {availableTags.length === 0 ? (
                <div style={{ color: "#6b7280" }}>
                  No project tags defined yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {availableTags.map(tag => {
                    const isSelected = projectTags.some(t => t.tagId === tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={async () => {
                          const token = localStorage.getItem("accessToken");
                          if (!token) {
                            alert("Missing access token; please log in again.");
                            return;
                          }
                          if (tagsSaving) return;
                          setTagsSaving(true);
                          const nextTagIds = isSelected
                            ? projectTags
                                .filter(t => t.tagId !== tag.id)
                                .map(t => t.tagId)
                            : [...projectTags.map(t => t.tagId), tag.id];
                          try {
                            const res = await fetch(`${API_BASE}/tags/projects/${id}`, {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({ tagIds: nextTagIds }),
                            });
                            if (res.ok) {
                              const updated: TagAssignmentDto[] = await res.json();
                              setProjectTags(updated || []);
                            }
                          } finally {
                            setTagsSaving(false);
                          }
                        }}
                        style={{
                          borderRadius: 999,
                          border: isSelected
                            ? "1px solid #2563eb"
                            : "1px solid #d1d5db",
                          backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                          color: "#111827",
                          padding: "2px 10px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {tagsSaving && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                  Saving tags…
                </div>
              )}
            </div>
          </div>

          {/* Participants card */}
          <div
            style={{
              marginTop: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
              }}
            >
              Participants
            </div>
            <div
              style={{
                padding: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                fontSize: 13,
              }}
            >
              {/* My Organization */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>My Organization</div>
                {!participants || participants.myOrganization.length === 0 ? (
                  <div style={{ color: "#6b7280" }}>No internal users yet.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {participants.myOrganization.map((m) => (
                      <li key={m.id}>
                        {m.user?.email ?? "(user)"}
                        {m.role && (
                          <span style={{ color: "#6b7280" }}> — {m.role}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Simple add internal user control */}
                {availableMembers.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 4, alignItems: "center" }}>
                    {/* Role select */}
                    <select
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value as "MANAGER" | "VIEWER")}
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    >
                      <option value="MANAGER">Manager</option>
                      <option value="VIEWER">Viewer</option>
                    </select>

                    {/* User select (excluding those already on project) */}
                    <select
                      onChange={async (e) => {
                        const userId = e.target.value;
                        if (!userId) return;
                        const token = localStorage.getItem("accessToken");
                        if (!token) {
                          alert("Missing access token; please log in again.");
                          return;
                        }
                        try {
                          const res = await fetch(`${API_BASE}/projects/${id}/members`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                              userId,
                              role: newMemberRole,
                            }),
                          });
                          if (res.ok) {
                            // refresh participants after adding
                            const partsRes = await fetch(`${API_BASE}/projects/${id}/participants`, {
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (partsRes.ok) {
                              const json: any = await partsRes.json();
                              setParticipants({
                                myOrganization: json.myOrganization ?? [],
                                collaborators: json.collaborators ?? [],
                              });
                            }
                          }
                        } finally {
                          // reset select back to placeholder
                          e.target.value = "";
                        }
                      }}
                      defaultValue=""
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    >
                      <option value="">+ Add internal user…</option>
                      {availableMembers
                        .filter(m =>
                          !participants?.myOrganization.some(p => p.userId === m.userId),
                        )
                        .map(m => (
                          <option key={m.userId} value={m.userId}>
                            {m.email}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Collaborators */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Collaborators</div>
                {!participants || participants.collaborators.length === 0 ? (
                  <div style={{ color: "#6b7280" }}>No collaborators yet.</div>
                ) : (
                  <div>
                    {Object.entries(
                      participants.collaborators.reduce<Record<string, Participant[]>>(
                        (acc, m) => {
                          const key = m.company?.name ?? "Unknown organization";
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(m);
                          return acc;
                        },
                      {}),
                    ).map(([companyName, members]) => (
                      <div key={companyName} style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 600 }}>{companyName}</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {members.map((m) => (
                            <li key={m.id}>
                              {m.user?.email ?? "(user)"}
                              {m.role && (
                                <span style={{ color: "#6b7280" }}> — {m.role}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DAILY_LOGS tab content */}
      {activeTab === "DAILY_LOGS" && (
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 3fr",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            {/* Left column: log info + permissions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#f3f4f6",
                  }}
                >
                  Daily Log Information
                </div>
                <form onSubmit={handleCreateDailyLog} style={{ padding: 10, fontSize: 13 }}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Job</div>
                    <div style={{ color: "#4b5563" }}>{project.name}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                        Date
                      </label>
                      <input
                        type="date"
                        value={newDailyLog.logDate}
                        onChange={e =>
                          setNewDailyLog(prev => ({ ...prev, logDate: e.target.value }))
                        }
                        style={{
                          width: "100%",
                          padding: "4px 6px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Title
                    </label>
                    <input
                      type="text"
                      value={newDailyLog.title}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="Example: Demo and framing complete"
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      value={newDailyLog.tags}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, tags: e.target.value }))
                      }
                      placeholder="roof, phase-1, interior"
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Manpower onsite DL
                    </label>
                    <input
                      type="text"
                      value={newDailyLog.manpowerOnsite}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, manpowerOnsite: e.target.value }))
                      }
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Person Onsite
                    </label>
                    <input
                      type="text"
                      value={newDailyLog.personOnsite}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, personOnsite: e.target.value }))
                      }
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Confidential – NO PRINT
                    </label>
                    <textarea
                      value={newDailyLog.confidentialNotes}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, confidentialNotes: e.target.value }))
                      }
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Permissions
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={newDailyLog.shareInternal}
                        onChange={e =>
                          setNewDailyLog(prev => ({ ...prev, shareInternal: e.target.checked }))
                        }
                      />
                      <span>Internal Users</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={newDailyLog.shareSubs}
                        onChange={e =>
                          setNewDailyLog(prev => ({ ...prev, shareSubs: e.target.checked }))
                        }
                      />
                      <span>Subs / Vendors</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={newDailyLog.shareClient}
                        onChange={e =>
                          setNewDailyLog(prev => ({ ...prev, shareClient: e.target.checked }))
                        }
                      />
                      <span>Client</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={newDailyLog.sharePrivate}
                        onChange={e =>
                          setNewDailyLog(prev => ({ ...prev, sharePrivate: e.target.checked }))
                        }
                      />
                      <span>Private (creator only)</span>
                    </label>
                  </div>

                  <div style={{ marginTop: 10, textAlign: "right" }}>
                    <button
                      type="submit"
                      disabled={dailyLogSaving}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #0f172a",
                        backgroundColor: dailyLogSaving ? "#e5e7eb" : "#0f172a",
                        color: dailyLogSaving ? "#4b5563" : "#f9fafb",
                        fontSize: 12,
                        cursor: dailyLogSaving ? "default" : "pointer",
                      }}
                    >
                      {dailyLogSaving ? "Saving…" : "Publish Daily Log"}
                    </button>
                  </div>

                  {dailyLogMessage && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: dailyLogMessage.includes("Failed") ? "#b91c1c" : "#4b5563",
                      }}
                    >
                      {dailyLogMessage}
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Right column: notes + weather + list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#f3f4f6",
                  }}
                >
                  Notes
                </div>
                <div style={{ padding: 10, fontSize: 13 }}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, marginBottom: 2 }}>Work Performed</div>
                    <textarea
                      value={newDailyLog.workPerformed}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, workPerformed: e.target.value }))
                      }
                      rows={4}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, marginBottom: 2 }}>Issues</div>
                    <textarea
                      value={newDailyLog.issues}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, issues: e.target.value }))
                      }
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 2 }}>Safety Incidents</div>
                    <textarea
                      value={newDailyLog.safetyIncidents}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, safetyIncidents: e.target.value }))
                      }
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#f3f4f6",
                  }}
                >
                  Weather
                </div>
                <div style={{ padding: 10, fontSize: 13 }}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, marginBottom: 2 }}>
                      Weather Conditions / Notes
                    </div>
                    <textarea
                      value={newDailyLog.weatherSummary}
                      onChange={e =>
                        setNewDailyLog(prev => ({ ...prev, weatherSummary: e.target.value }))
                      }
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                        resize: "vertical",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#f3f4f6",
                  }}
                >
                  Daily Logs
                </div>
                <div style={{ padding: 10, fontSize: 13 }}>
                  {dailyLogsLoading && (
                    <div style={{ color: "#6b7280" }}>Loading daily logs…</div>
                  )}
                  {!dailyLogsLoading && dailyLogs.length === 0 && (
                    <div style={{ color: "#6b7280" }}>
                      No daily logs yet. Use the form above to publish the first one.
                    </div>
                  )}
                  {!dailyLogsLoading && dailyLogs.length > 0 && (
                    <>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                        fontSize: 12,
                        color: "#4b5563",
                      }}>
                        <div>
                          Pending client logs: {dailyLogs.filter(l => l.shareClient && !l.effectiveShareClient).length}
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={showPendingClientOnly}
                            onChange={e => setShowPendingClientOnly(e.target.checked)}
                          />
                          <span>Show only pending client logs</span>
                        </label>
                      </div>

                      <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f9fafb" }}>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>Date</th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>Title</th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Work Performed
                            </th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Manpower
                            </th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Person Onsite
                            </th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Weather
                            </th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Photos
                            </th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Status
                            </th>
                            <th style={{ textAlign: "left", padding: "4px 6px" }}>
                              Created By
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyLogs
                            .filter(log =>
                              !showPendingClientOnly
                                ? true
                                : log.shareClient && !log.effectiveShareClient,
                            )
                            .map(log => (
                            <tr key={log.id}>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}
                              >
                                {log.logDate
                                  ? new Date(log.logDate).toLocaleDateString()
                                  : ""}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}
                              >
                                {log.title || ""}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                  maxWidth: 200,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {log.workPerformed || ""}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}
                              >
                                {log.manpowerOnsite || ""}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}
                              >
                                {log.personOnsite || ""}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                  maxWidth: 180,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {log.weatherSummary || ""}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}
                              >
                                {log.attachments?.length ?? 0}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                    backgroundColor:
                                      log.status === "APPROVED"
                                        ? "#dcfce7"
                                        : log.status === "REJECTED"
                                        ? "#fee2e2"
                                        : "#e5e7eb",
                                    color:
                                      log.status === "APPROVED"
                                        ? "#166534"
                                        : log.status === "REJECTED"
                                        ? "#991b1b"
                                        : "#374151",
                                  }}
                                >
                                  {log.status || "SUBMITTED"}
                                  {log.effectiveShareClient
                                    ? " • Client Visible"
                                    : log.shareClient
                                    ? " • Client Pending"
                                    : ""}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderTop: "1px solid #e5e7eb",
                                  fontSize: 12,
                                }}
                              >
                                <div>{log.createdByUser?.email ?? ""}</div>
                                {log.shareClient && !log.effectiveShareClient && (
                                  <div style={{ marginTop: 2, display: "flex", gap: 4 }}>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const token = localStorage.getItem("accessToken");
                                        if (!token) {
                                          alert("Missing access token; please log in again.");
                                          return;
                                        }
                                        try {
                                          const res = await fetch(
                                            `${API_BASE}/projects/${id}/daily-logs/${log.id}/approve`,
                                            {
                                              method: "POST",
                                              headers: {
                                                Authorization: `Bearer ${token}`,
                                              },
                                            },
                                          );
                                          if (!res.ok) {
                                            alert(`Approve failed (${res.status}).`);
                                            return;
                                          }
                                          const updated: any = await res.json();
                                          setDailyLogs(prev =>
                                            prev.map(l =>
                                              l.id === log.id
                                                ? { ...l, ...updated }
                                                : l,
                                            ),
                                          );
                                        } catch (err: any) {
                                          alert(err?.message || "Approve failed.");
                                        }
                                      }}
                                      style={{
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        border: "1px solid #16a34a",
                                        backgroundColor: "#dcfce7",
                                        color: "#166534",
                                        fontSize: 11,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const token = localStorage.getItem("accessToken");
                                        if (!token) {
                                          alert("Missing access token; please log in again.");
                                          return;
                                        }
                                        try {
                                          const res = await fetch(
                                            `${API_BASE}/projects/${id}/daily-logs/${log.id}/reject`,
                                            {
                                              method: "POST",
                                              headers: {
                                                Authorization: `Bearer ${token}`,
                                              },
                                            },
                                          );
                                          if (!res.ok) {
                                            alert(`Reject failed (${res.status}).`);
                                            return;
                                          }
                                          const updated: any = await res.json();
                                          setDailyLogs(prev =>
                                            prev.map(l =>
                                              l.id === log.id
                                                ? { ...l, ...updated }
                                                : l,
                                            ),
                                          );
                                        } catch (err: any) {
                                          alert(err?.message || "Reject failed.");
                                        }
                                      }}
                                      style={{
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        border: "1px solid #b91c1c",
                                        backgroundColor: "#fee2e2",
                                        color: "#991b1b",
                                        fontSize: 11,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}

                  {dailyLogs.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <div style={{ marginBottom: 4, color: "#4b5563" }}>
                        Add photos to latest log ({" "}
                        {new Date(dailyLogs[0].logDate).toLocaleDateString()} –
                        {" "}
                        {dailyLogs[0].title || "Untitled"}
                        )
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={attachmentsUploading}
                        onChange={async e => {
                          const files = e.target.files;
                          if (!files || files.length === 0) return;
                          const latest = dailyLogs[0];
                          const token = localStorage.getItem("accessToken");
                          if (!token) {
                            alert("Missing access token; please log in again.");
                            return;
                          }
                          try {
                            setAttachmentsUploading(true);
                            for (const file of Array.from(files)) {
                              const form = new FormData();
                              form.append("file", file);
                              await fetch(`${API_BASE}/daily-logs/${latest.id}/attachments`, {
                                method: "POST",
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                                body: form,
                              });
                            }
                            // Refresh latest log's attachments
                            const resp = await fetch(
                              `${API_BASE}/daily-logs/${latest.id}/attachments`,
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              },
                            );
                            if (resp.ok) {
                              const attachments: DailyLogAttachmentDto[] = await resp.json();
                              setDailyLogs(prev =>
                                prev.map(l =>
                                  l.id === latest.id
                                    ? { ...l, attachments }
                                    : l,
                                ),
                              );
                            }
                          } finally {
                            setAttachmentsUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PETL tab content */}
      {activeTab === "PETL" && (
        <>
      {/* Project hierarchy (site / buildings / units / particles) */}
      {hierarchy && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setStructureOpen(o => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <span>{structureOpen ? "▾" : "▸"}</span>
            <span>Project Hierarchy Expand</span>
          </button>

          {structureOpen && (
            <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
              <div>
                <strong>Site:</strong> {hierarchy.project.name}
              </div>
              {hierarchy.buildings.length > 0 && (
                <ul style={{ marginTop: 4, marginLeft: 16 }}>
                  {hierarchy.buildings.map((b: any) => (
                    <li key={b.id}>
                      <span>
                        <strong>Building</strong> {b.code || ""} {b.name}
                      </span>
                      {b.units?.length > 0 && (
                      <ul style={{ marginTop: 2, marginLeft: 14 }}>
                        {b.units.map((u: any) => (
                          <li key={u.id}>
                            <span>
                              <strong>Unit</strong> {u.label}
                              {typeof u.floor === "number" && ` (Floor ${u.floor})`}
                            </span>
                            {u.particles?.length > 0 && (
                              <ul style={{ marginTop: 2, marginLeft: 14 }}>
                                {u.particles.map((p: any) => (
                                  <li key={p.id}>
                                    Room: {p.fullLabel || p.name}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {b.particles?.length > 0 && (
                      <ul style={{ marginTop: 2, marginLeft: 14 }}>
                        {b.particles.map((p: any) => (
                          <li key={p.id}>
                            Building room: {p.fullLabel || p.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
              {hierarchy.units.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div><strong>Project-level units:</strong></div>
                  <ul style={{ marginTop: 2, marginLeft: 16 }}>
                    {hierarchy.units.map((u: any) => (
                      <li key={u.id}>
                        <span>
                          <strong>Unit</strong> {u.label}
                          {typeof u.floor === "number" && ` (Floor ${u.floor})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Room / zone summary, similar to old NCC "Sub Projects (Rooms)" block */}
      {!groupLoading && groups.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Rooms / Zones</h2>

          {/* Progress controls: filters + operation */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 8,
              alignItems: "flex-end",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Room</div>
              <select
                        value={roomFilter}
                        onChange={e => setRoomFilter(e.target.value)}
                style={{
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                  minWidth: 140,
                }}
              >
                <option value="">All rooms</option>
                {roomOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Cat</div>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                  minWidth: 90,
                }}
              >
                <option value="">All</option>
                {categoryOptions.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Sel</div>
              <select
                value={selectionFilter}
                onChange={e => setSelectionFilter(e.target.value)}
                style={{
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                  minWidth: 90,
                }}
              >
                <option value="">All</option>
                {selectionOptions.map(sel => (
                  <option key={sel} value={sel}>
                    {sel}
                  </option>
                ))}
              </select>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBulkMessage(null);

                const pct = parseFloat(operationPercent);
                if (Number.isNaN(pct) || pct < 0 || pct > 100) {
                  setBulkMessage("Enter a percent between 0 and 100.");
                  return;
                }

                const token = localStorage.getItem("accessToken");
                if (!token) {
                  setBulkMessage("Missing access token.");
                  return;
                }

        const filters: {
                  roomParticleIds?: string[];
                  categoryCodes?: string[];
                  selectionCodes?: string[];
                } = {};

        if (categoryFilter) filters.categoryCodes = [categoryFilter];
        if (selectionFilter) filters.selectionCodes = [selectionFilter];

                try {
                  setBulkSaving(true);
                  const res = await fetch(`${API_BASE}/projects/${id}/petl/percentage-edits`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      filters,
                      operation,
                      percent: pct,
                    }),
                  });
                  if (!res.ok) {
                    setBulkMessage(`Bulk update failed (${res.status}).`);
                    return;
                  }

                  // Optimistically update local items that match filters
                  setPetlItems(prev =>
                    prev.map(it => {
                      if (!matchesFilters(it)) return it;
                      const current = it.percentComplete ?? 0;
                      let next = current;
                      if (operation === "set") next = pct;
                      else if (operation === "increment") next = current + pct;
                      else if (operation === "decrement") next = current - pct;
                      next = Math.max(0, Math.min(100, next));
                      return { ...it, percentComplete: next };
                    }),
                  );

                  // Refresh groups
                  try {
                    setGroupLoading(true);
                    const groupsRes = await fetch(
                      `${API_BASE}/projects/${id}/petl-groups`,
                      {
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );
                    if (groupsRes.ok) {
                      const json: any = await groupsRes.json();
                      setGroups(Array.isArray(json.groups) ? json.groups : []);
                    }
                  } finally {
                    setGroupLoading(false);
                  }

                  setBulkMessage("Updated selection.");
                } catch (err: any) {
                  setBulkMessage(err.message ?? "Bulk update failed.");
                } finally {
                  setBulkSaving(false);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginLeft: "auto",
              }}
            >
              <div style={{ fontSize: 11, color: "#4b5563" }}>Operation</div>
              <select
                value={operation}
                onChange={e => setOperation(e.target.value as any)}
                style={{
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              >
                <option value="set">Set to</option>
                <option value="increment">Increase by</option>
                <option value="decrement">Decrease by</option>
              </select>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={operationPercent}
                onChange={e => setOperationPercent(e.target.value)}
                style={{
                  width: 70,
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              />
              <span style={{ fontSize: 12 }}>%</span>
              <button
                type="submit"
                disabled={bulkSaving || petlItems.length === 0}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: bulkSaving ? "#e5e7eb" : "#0f172a",
                  color: bulkSaving ? "#4b5563" : "#f9fafb",
                  fontSize: 12,
                  cursor: bulkSaving ? "default" : "pointer",
                }}
              >
                {bulkSaving ? "Applying…" : "Apply"}
              </button>
            </form>
          </div>

          {bulkMessage && (
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 4 }}>
              {bulkMessage}
            </div>
          )}

          {/* Selection summary is now shown globally above the divider */}

          <div
            style={{
              borderRadius: 8,
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Room</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Tasks</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Completed</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>% Complete</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const itemsForRoom = filteredItemsForRoom(g.particleId);
                  const isExpanded = g.particleId ? expandedRooms.has(g.particleId) : false;

                  return (
                    <>
                      <tr key={g.particleId ?? String(g.id)}>
                        <td
                          style={{
                            padding: "6px 12px",
                            borderTop: "1px solid #e5e7eb",
                            cursor: g.particleId ? "pointer" : "default",
                            color: g.particleId ? "#2563eb" : "inherit",
                            textDecoration:
                              g.particleId && isExpanded ? "underline" : "none",
                          }}
                          onClick={() => {
                            if (!g.particleId) return;
                            toggleRoomExpanded(g.particleId);
                          }}
                        >
                          {isExpanded ? "▾ " : "▸ "}
                          {g.roomName}
                        </td>
                        <td
                          style={{
                            padding: "6px 12px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          {g.itemsCount}
                        </td>
                        <td
                          style={{
                            padding: "6px 12px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          {g.totalAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: "6px 12px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          {g.completedAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          style={{
                            padding: "6px 12px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          {g.percentComplete.toFixed(2)}%
                        </td>
                      </tr>

                      {isExpanded && itemsForRoom.length > 0 && (
                        <tr key={`items-${g.particleId ?? String(g.id)}`}>
                          <td
                            colSpan={5}
                            style={{
                              padding: 0,
                              borderTop: "none",
                              backgroundColor: "#f9fafb",
                            }}
                          >
                            <div style={{ maxHeight: 260, overflow: "auto" }}>
                              <table
                                style={{
                                  width: "100%",
                                  borderCollapse: "collapse",
                                  fontSize: 12,
                                }}
                              >
                                <thead>
                                  <tr style={{ backgroundColor: "#e5e7eb" }}>
                                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                                      Line
                                    </th>
                                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                                      Task
                                    </th>
                                    <th style={{ textAlign: "right", padding: "4px 8px" }}>
                                      Qty
                                    </th>
                                    <th style={{ textAlign: "right", padding: "4px 8px" }}>
                                      Total
                                    </th>
                                    <th style={{ textAlign: "right", padding: "4px 8px" }}>
                                      %
                                    </th>
                                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                                      Cat
                                    </th>
                                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                                      Sel
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itemsForRoom.map(item => (
                                    <tr key={item.id}>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        {item.lineNo}
                                      </td>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        {item.description}
                                      </td>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                        }}
                                      >
                                        {item.qty ?? ""}
                                      </td>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                        }}
                                      >
                                        {item.itemAmount != null
                                          ? item.itemAmount.toLocaleString(
                                              undefined,
                                              { maximumFractionDigits: 2 },
                                            )
                                          : ""}
                                      </td>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                        }}
                                      >
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={item.percentComplete}
                                          onChange={async (e) => {
                                            const raw = Number(e.target.value);
                                            if (Number.isNaN(raw)) return;
                                            const clamped = Math.max(
                                              0,
                                              Math.min(100, raw),
                                            );

                                            const token = localStorage.getItem(
                                              "accessToken",
                                            );
                                            if (!token) {
                                              alert(
                                                "Missing access token; please log in again.",
                                              );
                                              return;
                                            }

                                            try {
                                              setPetlItems(prev =>
                                                prev.map(it =>
                                                  it.id === item.id
                                                    ? {
                                                        ...it,
                                                        percentComplete:
                                                          clamped,
                                                      }
                                                    : it,
                                                ),
                                              );

                                              const res = await fetch(
                                                `${API_BASE}/projects/${id}/petl/${item.id}/percent`,
                                                {
                                                  method: "POST",
                                                  headers: {
                                                    "Content-Type":
                                                      "application/json",
                                                    Authorization: `Bearer ${token}`,
                                                  },
                                                  body: JSON.stringify({
                                                    newPercent: clamped,
                                                  }),
                                                },
                                              );
                                              if (!res.ok) {
                                                console.error(
                                                  "Per-line update failed",
                                                  res.status,
                                                );
                                              }
                                            } catch (err) {
                                              console.error(err);
                                            }
                                          }}
                                          style={{
                                            width: 55,
                                            padding: "2px 4px",
                                            borderRadius: 4,
                                            border: "1px solid #d1d5db",
                                            fontSize: 11,
                                            textAlign: "right",
                                          }}
                                        />
                                      </td>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        {item.categoryCode ?? ""}
                                      </td>
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        {item.selectionCode ?? ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {petlLoading && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Loading PETL items…</p>
      )}

      {!petlLoading && petlItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Estimate items</h2>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <table
              id="petl-items-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Line</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Room</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Task</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Unit</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>RCV</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>%</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Cat</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Sel</th>
                </tr>
              </thead>
              <tbody>
                {petlItems.filter(matchesFilters).map(item => (
                  <tr key={item.id}>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.lineNo}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.description}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.qty ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.unit ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.itemAmount != null
                        ? item.itemAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.rcvAmount != null
                        ? item.rcvAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={item.percentComplete}
                        onChange={async (e) => {
                          const raw = Number(e.target.value);
                          if (Number.isNaN(raw)) return;
                          const clamped = Math.max(0, Math.min(100, raw));

                          const token = localStorage.getItem("accessToken");
                          if (!token) {
                            alert("Missing access token; please log in again.");
                            return;
                          }

                          try {
                            setPetlItems(prev =>
                              prev.map(it =>
                                it.id === item.id
                                  ? { ...it, percentComplete: clamped }
                                  : it,
                              ),
                            );

                            const res = await fetch(
                              `${API_BASE}/projects/${id}/petl/${item.id}/percent`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({ newPercent: clamped }),
                              },
                            );
                            if (!res.ok) {
                              console.error("Per-line update failed", res.status);
                            }
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        style={{
                          width: 60,
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 11,
                          textAlign: "right",
                        }}
                      />
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.categoryCode ?? ""}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.selectionCode ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
