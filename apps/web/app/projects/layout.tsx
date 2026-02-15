"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Project {
  id: string;
  name: string;
  status: string;
}

interface JobStatus {
  id: string;
  code: string;
  label: string;
}

interface ProjectTag {
  id: string;
  code: string;
  label: string;
}

interface TenantClient {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  projects?: { id: string; name: string }[];
}

interface FilterState {
  savedFilter: string;
  groups: string[]; // array of non-state tag IDs
  status: string;   // "Open" / "Closed" / "Warranty" (legacy)
  managers: string[];
  stateBucket: "ACTIVE" | "ARCHIVED" | "DELETED" | "WARRANTY";
}

const DEFAULT_FILTERS: FilterState = {
  savedFilter: "NFS Active",
  groups: [],
  // Treat "Open" as the default "active jobs" filter
  status: "Open",
  managers: [],
  stateBucket: "ACTIVE",
};

const NEW_PROJECT_DEFAULT = {
  name: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "USA",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  tenantClientId: "",
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [showNewProject, setShowNewProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProject, setNewProject] = useState({ ...NEW_PROJECT_DEFAULT });
  const [newProjectError, setNewProjectError] = useState<string | null>(null);

  // Tenant client linking state
  const [linkToClient, setLinkToClient] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<TenantClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<TenantClient | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);

        // For now, the backend still takes a single tagIds filter; we use it
        // only for non-state tags here. State buckets (ACTIVE / ARCHIVED /
        // DELETED / WARRANTY) are applied client-side after fetching.
        if (filters.groups.length) params.set("tagIds", filters.groups.join(","));

        const url = `${API_BASE}/projects${params.toString() ? `?${params.toString()}` : ""}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load projects (${res.status})`);
        }
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setError(err.message ?? "Failed to load projects");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [filters.status, filters.groups]);

  // Load job statuses for the Job Status filter
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    async function loadStatuses() {
      try {
        const res = await fetch(`${API_BASE}/job-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: JobStatus[] = await res.json();
        setJobStatuses(Array.isArray(data) ? data : []);
      } catch {
        // silently ignore; UI will fall back to defaults
      }
    }

    void loadStatuses();
  }, []);

  // Load project tags (Groups) for this company
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    async function loadTags() {
      try {
        const res = await fetch(`${API_BASE}/tags?entityType=project`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: ProjectTag[] = await res.json();
        setProjectTags(Array.isArray(data) ? data : []);
      } catch {
        // ignore in UI helper
      }
    }

    void loadTags();
  }, []);

  const isActiveProject = (id: string) => pathname?.startsWith(`/projects/${id}`);
  const isOverview = pathname === "/projects";

  const appliedFiltersDescription = () => {
    const parts: string[] = [];
    if (filters.savedFilter) parts.push(filters.savedFilter);
    if (filters.groups.length) parts.push(`${filters.groups.length} group(s)`);
    if (filters.status) parts.push(filters.status);
    if (filters.stateBucket && filters.stateBucket !== "ACTIVE") parts.push(filters.stateBucket);
    if (filters.managers.length) parts.push(`${filters.managers.length} manager(s)`);
    if (!parts.length) return "No filters";
    return parts.join(" · ");
  };

  const appliedFiltersCount = () => {
    let count = 0;
    // Status filter (Open / Closed / Warranty) is always considered a filter
    if (filters.status) count += 1;
    if (filters.stateBucket && filters.stateBucket !== "ACTIVE") count += 1;
    if (filters.savedFilter !== DEFAULT_FILTERS.savedFilter) count += 1;
    if (filters.groups.length) count += 1;
    if (filters.managers.length) count += 1;
    return count;
  };

  const filteredProjects = projects.filter(p => {
    // First, apply state bucket via project_state_* tags (client-side), then
    // apply free-text search.
    const stateTagCodes = new Set([
      "project_state_archived",
      "project_state_deleted",
      "project_state_warranty",
    ]);

    // We approximate state based on project.tags if present. If the
    // API response already includes tags, we can filter here. If not, all
    // projects are treated as ACTIVE for now.
    const anyTag = (p as any).tags as
      | { tag: { code: string } }[]
      | undefined
      | null;

    const hasArchived = anyTag?.some(t => t.tag.code === "project_state_archived");
    const hasDeleted = anyTag?.some(t => t.tag.code === "project_state_deleted");
    const hasWarranty = anyTag?.some(t => t.tag.code === "project_state_warranty");

    if (filters.stateBucket === "ARCHIVED" && !hasArchived) return false;
    if (filters.stateBucket === "DELETED" && !hasDeleted) return false;
    if (filters.stateBucket === "WARRANTY" && !hasWarranty) return false;
    if (filters.stateBucket === "ACTIVE" && (hasArchived || hasDeleted || hasWarranty))
      return false;

    // Backend already applied status + non-state tag filters; only apply soft search by name here.
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Sort filtered projects alphabetically by name for sidebar display
  const sortedProjects = [...filteredProjects].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const updatePendingField = (key: keyof FilterState, value: string | string[]) => {
    setPendingFilters(prev => ({ ...prev, [key]: value as any }));
  };

  const applyPendingFilters = () => {
    setFilters(pendingFilters);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPendingFilters(DEFAULT_FILTERS);
    setFilterOpen(false);
  };

  const handleNewProjectChange = (field: keyof typeof NEW_PROJECT_DEFAULT, value: string) => {
    setNewProject(prev => ({ ...prev, [field]: value }));
  };

  // Search for tenant clients by name, email, or phone
  const searchClients = async (query: string) => {
    if (!query || query.length < 2) {
      setClientSearchResults([]);
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      setSearchingClients(true);
      const res = await fetch(
        `${API_BASE}/clients/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setClientSearchResults(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore search errors
    } finally {
      setSearchingClients(false);
    }
  };

  // Handle selecting a client from search results
  const handleSelectClient = (client: TenantClient) => {
    setSelectedClient(client);
    setClientSearch("");
    setClientSearchResults([]);
    // Auto-fill contact fields from selected client
    setNewProject(prev => ({
      ...prev,
      primaryContactName: client.displayName || `${client.firstName} ${client.lastName}`.trim(),
      primaryContactEmail: client.email || "",
      primaryContactPhone: client.phone || "",
      tenantClientId: client.id,
    }));
  };

  // Clear client link
  const handleClearClientLink = () => {
    setSelectedClient(null);
    setNewProject(prev => ({
      ...prev,
      primaryContactName: "",
      primaryContactEmail: "",
      primaryContactPhone: "",
      tenantClientId: "",
    }));
  };

  const reloadProjects = async (token: string) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.groups.length) params.set("tagIds", filters.groups.join(","));

    const url = `${API_BASE}/projects${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to load projects (${res.status})`);
    }
    const data = await res.json();
    setProjects(Array.isArray(data) ? data : []);
  };

  const handleCreateProject = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNewProjectError(null);

    const requiredFields: (keyof typeof NEW_PROJECT_DEFAULT)[] = [
      "name",
      "addressLine1",
      "city",
      "state",
    ];

    for (const field of requiredFields) {
      if (!newProject[field].trim()) {
        setNewProjectError("Name, address, city, and state are required.");
        return;
      }
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) {
      setNewProjectError("Missing access token. Please login again.");
      return;
    }

    try {
      setCreatingProject(true);
      const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newProject),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setNewProjectError(`Create failed (${res.status}) ${text}`);
        return;
      }

      // Clear form and hide panel
      setNewProject({ ...NEW_PROJECT_DEFAULT });
      setShowNewProject(false);
      setLinkToClient(false);
      setSelectedClient(null);
      setClientSearch("");
      setClientSearchResults([]);

      // Reload projects list
      setLoading(true);
      await reloadProjects(token);
      setError(null);
    } catch (err: any) {
      setNewProjectError(err?.message ?? "Failed to create project");
    } finally {
      setCreatingProject(false);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 16,
        minHeight: "calc(100vh - 79px)",
      }}
    >
      {/* Filter dialog (Buildertrend-style) */}
      {filterOpen && (
        <div
          style={{
            position: "absolute",
            top: 72,
            left: 320,
            zIndex: 10,
          }}
        >
          <div
          style={{
            width: 320,
            background: "#ffffff",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(15,23,42,0.18)",
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 600 }}>Filter your results</div>
            <div style={{ color: "#6b7280" }}>
              {appliedFiltersCount()} filter
              {appliedFiltersCount() === 1 ? "" : "s"} applied · {appliedFiltersDescription()}
            </div>
          </div>

          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Saved Filters */}
            <div>
              <div style={{ marginBottom: 2 }}>Saved Filters</div>
              <select
                value={pendingFilters.savedFilter}
                onChange={e => updatePendingField("savedFilter", e.target.value)}
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                }}
              >
                <option value="NFS Active">NFS Active</option>
                <option value="All Jobs">All Jobs</option>
              </select>
            </div>

            {/* Groups (project tags) */}
            <div>
              <div style={{ marginBottom: 2 }}>Groups</div>
              {projectTags.length === 0 ? (
                <input
                  type="text"
                  placeholder="#Tags coming soon"
                  disabled
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    color: "#9ca3af",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    padding: 4,
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    minHeight: 30,
                  }}
                >
                  {projectTags.map(tag => {
                    const selected = pendingFilters.groups.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          const next = selected
                            ? pendingFilters.groups.filter(id => id !== tag.id)
                            : [...pendingFilters.groups, tag.id];
                          updatePendingField("groups", next);
                        }}
                        style={{
                          borderRadius: 999,
                          border: selected ? "1px solid #0f172a" : "1px solid #d1d5db",
                          padding: "2px 8px",
                          fontSize: 11,
                          background: selected ? "#0f172a" : "#ffffff",
                          color: selected ? "#f9fafb" : "#111827",
                          cursor: "pointer",
                        }}
                      >
                        #{tag.label}
                      </button>
                    );
                  })}
                  {pendingFilters.groups.length === 0 && (
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      Click tags to filter jobs by group
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Job Status */}
            <div>
              <div style={{ marginBottom: 2 }}>Job Status</div>
              <select
                value={pendingFilters.status}
                onChange={e => updatePendingField("status", e.target.value)}
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                }}
              >
                {jobStatuses.length > 0 ? (
                  jobStatuses.map(js => (
                    <option key={js.id} value={js.label}>
                      {js.label}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                    <option value="Warranty">Warranty</option>
                  </>
                )}
              </select>
            </div>

            {/* Project Managers placeholder */}
            <div>
              <div style={{ marginBottom: 2 }}>Project Managers</div>
              <input
                type="text"
                placeholder="Manager filters coming soon"
                disabled
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  color: "#9ca3af",
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={applyPendingFilters}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Update Results
              </button>
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  // Placeholder: in the future we'll persist saved filters.
                  // For now, just close the dialog.
                  setFilterOpen(false);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Save Filter
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Left sidebar: project list */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRadius: 6,
          background: "#ffffff",
          border: "1px solid #0f172a",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 79px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Overview
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              All projects overview
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => setFilterOpen(o => !o)}
              style={{
                borderRadius: 999,
                border: "1px solid #d1d5db",
                padding: 4,
                background: "#ffffff",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
              }}
              title="Filter jobs"
            >
              {/* Simple funnel icon using borders */}
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 10,
                  borderTop: "2px solid #111827",
                  borderLeft: "2px solid #111827",
                  borderRight: "2px solid #111827",
                  borderRadius: 2,
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "100%",
                    width: 0,
                    height: 0,
                    borderLeft: "4px solid transparent",
                    borderRight: "4px solid transparent",
                    borderTop: "6px solid #111827",
                    transform: "translateX(-50%)",
                  }}
                />
              </span>
            </button>
            <span style={{ fontSize: 11, color: "#4b5563" }}>
              ( {appliedFiltersCount()} )
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setShowNewProject(true)}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            New Project
          </button>
          <Link
            href="/projects/import"
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontSize: 12,
              textDecoration: "none",
              color: "#111827",
            }}
          >
            Import CSV
          </Link>
        </div>

        <div style={{ marginBottom: 4 }}>
          <input
            type="text"
            placeholder="Search jobs by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          />
        </div>
        <Link
          href="/projects"
          style={{
            margin: "0 -8px 6px", // stretch edge-to-edge
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 0,
            display: "block",
            textDecoration: "none",
            backgroundColor: isOverview ? "#bfdbfe" : "#ffffff",
            color: "#0f172a",
            fontWeight: 600,
            borderBottom: "1px solid #e5e7eb",
            cursor: "pointer",
          }}
        >
          Filtered Jobs: {sortedProjects.length}
        </Link>
        {loading ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: "#f97316" }}>{error}</div>
        ) : sortedProjects.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>No projects yet.</div>
        ) : (
          <div
            style={{
              overflowY: "auto",
              paddingRight: 0,
              flex: 1,
            }}
          >
              <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {sortedProjects.map((p) => {
                const active = isActiveProject(p.id);
                return (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}`}
                      style={{
                        display: "block",
                        // Stretch highlight from edge to edge within the sidebar
                        margin: "0 -8px 4px",
                        padding: "6px 12px",
                        borderRadius: 0,
                        textDecoration: "none",
                        fontSize: 12,
                        color: active ? "#0f172a" : "#111827",
                        backgroundColor: active ? "#bfdbfe" : "transparent",
                      }}
                    >
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.name}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>

      {/* Right pane: current projects route content */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {children}
        {showNewProject && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 20,
            }}
          >
            <form
              onSubmit={handleCreateProject}
              className="app-card"
              style={{
                width: 360,
                maxWidth: "100%",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  New Project
                </h2>
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <label>
                <span style={{ display: "block", marginBottom: 2 }}>Name</span>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={e => handleNewProjectChange("name", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                  }}
                />
              </label>

              <label>
                <span style={{ display: "block", marginBottom: 2 }}>Address line 1</span>
                <input
                  type="text"
                  value={newProject.addressLine1}
                  onChange={e => handleNewProjectChange("addressLine1", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                  }}
                />
              </label>

              <label>
                <span style={{ display: "block", marginBottom: 2 }}>City</span>
                <input
                  type="text"
                  value={newProject.city}
                  onChange={e => handleNewProjectChange("city", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                  }}
                />
              </label>

              <label>
                <span style={{ display: "block", marginBottom: 2 }}>State</span>
                <input
                  type="text"
                  value={newProject.state}
                  onChange={e => handleNewProjectChange("state", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                  }}
                />
              </label>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                }}
              >
                <label style={{ flex: 1 }}>
                  <span style={{ display: "block", marginBottom: 2 }}>Postal code</span>
                  <input
                    type="text"
                    value={newProject.postalCode}
                    onChange={e => handleNewProjectChange("postalCode", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                    }}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={{ display: "block", marginBottom: 2 }}>Country</span>
                  <input
                    type="text"
                    value={newProject.country}
                    onChange={e => handleNewProjectChange("country", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                    }}
                  />
                </label>
              </div>

              {/* Client Contact Section */}
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                    Client Contact
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={linkToClient}
                      onChange={e => {
                        setLinkToClient(e.target.checked);
                        if (!e.target.checked) handleClearClientLink();
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 11, color: "#6b7280" }}>Link to existing client</span>
                  </label>
                </div>

                {linkToClient ? (
                  <div>
                    {selectedClient ? (
                      <div
                        style={{
                          padding: 8,
                          borderRadius: 4,
                          border: "1px solid #10b981",
                          background: "#ecfdf5",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12, color: "#065f46" }}>
                              {selectedClient.displayName || `${selectedClient.firstName} ${selectedClient.lastName}`}
                            </div>
                            {selectedClient.email && (
                              <div style={{ fontSize: 11, color: "#047857" }}>{selectedClient.email}</div>
                            )}
                            {selectedClient.phone && (
                              <div style={{ fontSize: 11, color: "#047857" }}>{selectedClient.phone}</div>
                            )}
                            {selectedClient.company && (
                              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                                {selectedClient.company}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleClearClientLink}
                            style={{
                              padding: "2px 6px",
                              borderRadius: 3,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            Clear
                          </button>
                        </div>
                        {selectedClient.projects && selectedClient.projects.length > 0 && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #a7f3d0" }}>
                            <div style={{ fontSize: 10, color: "#065f46", fontWeight: 500 }}>
                              Related projects ({selectedClient.projects.length}):
                            </div>
                            <div style={{ fontSize: 10, color: "#047857", marginTop: 2 }}>
                              {selectedClient.projects.slice(0, 3).map(p => p.name).join(", ")}
                              {selectedClient.projects.length > 3 && ` +${selectedClient.projects.length - 3} more`}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={e => {
                            setClientSearch(e.target.value);
                            searchClients(e.target.value);
                          }}
                          placeholder="Search by name, email, or phone..."
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                          }}
                        />
                        {searchingClients && (
                          <div style={{ position: "absolute", right: 8, top: 8, fontSize: 10, color: "#9ca3af" }}>
                            Searching...
                          </div>
                        )}
                        {clientSearchResults.length > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              zIndex: 10,
                              background: "#fff",
                              border: "1px solid #d1d5db",
                              borderRadius: 4,
                              boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                              maxHeight: 200,
                              overflowY: "auto",
                            }}
                          >
                            {clientSearchResults.map(client => (
                              <div
                                key={client.id}
                                onClick={() => handleSelectClient(client)}
                                style={{
                                  padding: "6px 8px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              >
                                <div style={{ fontSize: 12, fontWeight: 500 }}>
                                  {client.displayName || `${client.firstName} ${client.lastName}`}
                                </div>
                                {client.email && (
                                  <div style={{ fontSize: 10, color: "#6b7280" }}>{client.email}</div>
                                )}
                                {client.phone && (
                                  <div style={{ fontSize: 10, color: "#6b7280" }}>{client.phone}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {clientSearch.length >= 2 && clientSearchResults.length === 0 && !searchingClients && (
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
                            No clients found. Uncheck to enter new contact info.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <label>
                      <span style={{ display: "block", marginBottom: 2 }}>Client Name</span>
                      <input
                        type="text"
                        value={newProject.primaryContactName}
                        onChange={e => handleNewProjectChange("primaryContactName", e.target.value)}
                        placeholder="Full name"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <label style={{ flex: 1 }}>
                        <span style={{ display: "block", marginBottom: 2 }}>Email</span>
                        <input
                          type="email"
                          value={newProject.primaryContactEmail}
                          onChange={e => handleNewProjectChange("primaryContactEmail", e.target.value)}
                          placeholder="email@example.com"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </label>
                      <label style={{ flex: 1 }}>
                        <span style={{ display: "block", marginBottom: 2 }}>Phone</span>
                        <input
                          type="tel"
                          value={newProject.primaryContactPhone}
                          onChange={e => handleNewProjectChange("primaryContactPhone", e.target.value)}
                          placeholder="(555) 123-4567"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                          }}
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>

              {newProjectError && (
                <div style={{ color: "#b91c1c", fontSize: 12 }}>{newProjectError}</div>
              )}

              <button
                type="submit"
                disabled={creatingProject}
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "none",
                  backgroundColor: creatingProject ? "#e5e7eb" : "#2563eb",
                  color: creatingProject ? "#4b5563" : "#f9fafb",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: creatingProject ? "default" : "pointer",
                }}
              >
                {creatingProject ? "Creating…" : "Create project"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
