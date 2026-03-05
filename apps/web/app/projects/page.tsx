"use client";

import React, { useEffect, useMemo, useState, useTransition, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import "mapbox-gl/dist/mapbox-gl.css";

const MapComponent = dynamic(
  () => import("react-map-gl/mapbox").then((m) => {
    const { default: Map, Marker, Popup, NavigationControl } = m;

    // Pin components
    function ProjectPin() {
      return (
        <div style={{ position: "relative", cursor: "pointer" }}>
          <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
            <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="#2563eb" />
            <circle cx="16" cy="16" r="8" fill="#ffffff" />
            <circle cx="16" cy="16" r="4" fill="#2563eb" />
          </svg>
        </div>
      );
    }
    function NearbyProjectPin() {
      return (
        <div style={{ cursor: "pointer" }}>
          <svg width="20" height="26" viewBox="0 0 20 26" fill="none">
            <path d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 16 10 16s10-8.5 10-16C20 4.477 15.523 0 10 0z" fill="#6b7280" />
            <circle cx="10" cy="10" r="4" fill="#ffffff" />
          </svg>
        </div>
      );
    }
    function InventoryPin({ count }: { count: number }) {
      return (
        <div style={{ position: "relative", cursor: "pointer", textAlign: "center" }}>
          <svg width="24" height="32" viewBox="0 0 28 36" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#059669" />
            <circle cx="14" cy="14" r="6" fill="#ffffff" />
          </svg>
          <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", background: "#059669", color: "#fff", fontSize: 8, fontWeight: 700, padding: "0px 4px", borderRadius: 4, whiteSpace: "nowrap" }}>
            {count}
          </div>
        </div>
      );
    }
    function AssetPin() {
      return (
        <div style={{ position: "relative", cursor: "pointer" }}>
          <svg width="22" height="28" viewBox="0 0 28 36" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#ea580c" />
            <circle cx="14" cy="14" r="6" fill="#ffffff" />
          </svg>
        </div>
      );
    }
    function SupplierPin() {
      return (
        <div style={{ position: "relative", cursor: "pointer" }}>
          <svg width="22" height="28" viewBox="0 0 28 36" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#7c3aed" />
            <circle cx="14" cy="14" r="6" fill="#ffffff" />
          </svg>
        </div>
      );
    }

    interface MapPopupProps {
      lat: number;
      lng: number;
      label: string;
      projectId: string;
      authToken: string;
      allProjects: Array<{ id: string; name: string; latitude?: number | null; longitude?: number | null; city?: string; state?: string }>;
    }

    interface LogisticsNearby { id: string; name: string; lat: number; lng: number; city: string; state: string; distanceMiles: number }
    interface LogisticsAsset { usageId: string; name: string; code: string | null; assetType: string; location: { lat: number | null; lng: number | null; name: string } | null }
    interface LogisticsInventory { id: string; name: string; type: string; lat: number | null; lng: number | null; items: Array<{ name: string; quantity: number; uom: string }> }

    return function MapPopup({ lat, lng, label, projectId, authToken, allProjects }: MapPopupProps) {
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
      const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const [logData, setLogData] = React.useState<{ nearby: LogisticsNearby[]; assets: LogisticsAsset[]; inventory: LogisticsInventory[] } | null>(null);
      const [popup, setPopup] = React.useState<{ lat: number; lng: number; content: string } | null>(null);

      React.useEffect(() => {
        if (!authToken || !projectId) return;
        fetch(`${API}/projects/${projectId}/logistics?radiusMiles=10`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
          .then((r: Response) => r.ok ? r.json() : null)
          .then((d: any) => {
            if (d) setLogData({
              nearby: d.nearbyProjects ?? [],
              assets: d.assets ?? [],
              inventory: d.inventory ?? [],
            });
          })
          .catch(() => {});
      }, [projectId, authToken]);

      // Also include all geocoded projects as small pins (those not already in nearby)
      const nearbyIds = new Set(logData?.nearby?.map((n: LogisticsNearby) => n.id) ?? []);
      const otherProjects = allProjects.filter(
        (p) => p.id !== projectId && !nearbyIds.has(p.id) && p.latitude != null && p.longitude != null,
      );

      if (!MAPBOX_TOKEN) return <div style={{ padding: 20, fontSize: 12, color: "#6b7280" }}>Mapbox token not configured.</div>;
      return (
        <div style={{ width: 520, height: 380 }}>
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: lng, latitude: lat, zoom: 11 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
            <NavigationControl position="top-right" />

            {/* Current project — blue pin */}
            <Marker longitude={lng} latitude={lat} anchor="bottom">
              <ProjectPin />
            </Marker>

            {/* Nearby projects from logistics — grey pins */}
            {logData?.nearby?.map((np: LogisticsNearby) => (
              <Marker key={`np-${np.id}`} longitude={np.lng} latitude={np.lat} anchor="bottom"
                onClick={(e: any) => { e.originalEvent?.stopPropagation(); setPopup({ lat: np.lat, lng: np.lng, content: `${np.name} — ${np.city}, ${np.state} (${np.distanceMiles.toFixed(1)} mi)` }); }}>
                <NearbyProjectPin />
              </Marker>
            ))}

            {/* Other company projects — grey pins */}
            {otherProjects.map((p) => (
              <Marker key={`op-${p.id}`} longitude={p.longitude!} latitude={p.latitude!} anchor="bottom"
                onClick={(e: any) => { e.originalEvent?.stopPropagation(); setPopup({ lat: p.latitude!, lng: p.longitude!, content: `${p.name}${p.city ? ` — ${p.city}, ${p.state}` : ""}` }); }}>
                <NearbyProjectPin />
              </Marker>
            ))}

            {/* Inventory locations — green pins */}
            {logData?.inventory?.filter((inv: LogisticsInventory) => inv.lat && inv.lng).map((inv: LogisticsInventory) => (
              <Marker key={`inv-${inv.id}`} longitude={inv.lng!} latitude={inv.lat!} anchor="bottom"
                onClick={(e: any) => { e.originalEvent?.stopPropagation(); setPopup({ lat: inv.lat!, lng: inv.lng!, content: `📦 ${inv.name} (${inv.type}) — ${inv.items.length} item(s)` }); }}>
                <InventoryPin count={inv.items.length} />
              </Marker>
            ))}

            {/* Asset pins — orange */}
            {logData?.assets?.filter((a: LogisticsAsset) => a.location?.lat && a.location?.lng).map((a: LogisticsAsset) => (
              <Marker key={`ast-${a.usageId}`} longitude={a.location!.lng!} latitude={a.location!.lat!} anchor="bottom"
                onClick={(e: any) => { e.originalEvent?.stopPropagation(); setPopup({ lat: a.location!.lat!, lng: a.location!.lng!, content: `🔧 ${a.name} (${a.assetType})${a.location?.name ? ` @ ${a.location.name}` : ""}` }); }}>
                <AssetPin />
              </Marker>
            ))}

            {/* Popup */}
            {popup && (
              <Popup longitude={popup.lng} latitude={popup.lat} anchor="bottom" onClose={() => setPopup(null)} closeOnClick={false} style={{ maxWidth: 260 }}>
                <div style={{ fontSize: 12, padding: 2 }}>{popup.content}</div>
              </Popup>
            )}
          </Map>
          <div style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, color: "#374151", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{label}</span>
            <span style={{ display: "flex", gap: 10, fontSize: 10, color: "#6b7280" }}>
              <span><span style={{ color: "#2563eb" }}>●</span> Project</span>
              <span><span style={{ color: "#6b7280" }}>●</span> Nearby</span>
              <span><span style={{ color: "#059669" }}>●</span> Inventory</span>
              <span><span style={{ color: "#ea580c" }}>●</span> Assets</span>
            </span>
          </div>
        </div>
      );
    };
  }),
  { ssr: false, loading: () => <div style={{ padding: 20, fontSize: 12 }}>Loading map…</div> },
);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CreatedByUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface DailyLog {
  id: string;
  projectId: string;
  projectName: string;
  logDate: string;
  title: string | null;
  type: "PUDL" | "RECEIPT_EXPENSE" | "JSA" | "INCIDENT" | "QUALITY" | "TADL";
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  workPerformed: string | null;
  issues: string | null;
  crewOnSite: string | null;
  createdByUser: CreatedByUser;
  createdAt: string;
  attachments: Array<{
    id: string;
    fileName: string | null;
    fileUrl: string;
  }>;
}

/** Full daily log shape returned by GET /daily-logs/:logId */
interface DailyLogDetail extends DailyLog {
  weatherSummary?: string | null;
  personOnsite?: string | null;
  manpowerOnsite?: string | null;
  safetyIncidents?: string | null;
  confidentialNotes?: string | null;
  shareInternal?: boolean;
  shareSubs?: boolean;
  shareClient?: boolean;
  sharePrivate?: boolean;
  expenseVendor?: string | null;
  expenseAmount?: number | null;
  expenseDate?: string | null;
  building?: { id: string; name: string; code?: string | null } | null;
  unit?: { id: string; label: string; floor?: number | null } | null;
  roomParticle?: { id: string; name: string; fullLabel?: string | null } | null;
  sowItem?: { id: string; description?: string | null } | null;
}

interface DailyLogsResponse {
  items: DailyLog[];
  total: number;
  limit: number;
  offset: number;
}

interface Project {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  addressLine1?: string;
  city?: string;
  state?: string;
  tenantClientId?: string | null;
  tenantClient?: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
  } | null;
}

const LOG_TYPE_LABELS: Record<DailyLog["type"], string> = {
  PUDL: "Daily Log",
  RECEIPT_EXPENSE: "Receipt/Expense",
  JSA: "Job Safety",
  INCIDENT: "Incident",
  QUALITY: "Quality",
  TADL: "Time Accounting",
};

const STATUS_STYLE: Record<DailyLog["status"], { bg: string; color: string }> = {
  SUBMITTED: { bg: "#dbeafe", color: "#1e40af" },
  APPROVED: { bg: "#d1fae5", color: "#065f46" },
  REJECTED: { bg: "#fee2e2", color: "#991b1b" },
};

const ROW_HEIGHT = 44; // Compact row height in pixels

interface DashboardTask {
  id: string;
  title: string;
  description?: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate: string | null;
  projectId: string;
  assigneeId: string | null;
  assignee?: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  createdBy?: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  createdAt: string;
}

interface VoiceJournalNote {
  id: string;
  projectId: string | null;
  project?: { id: string; name: string } | null;
  aiSummary: string | null;
  aiText: string | null;
  status: string;
  createdAt: string;
  voiceDurationSecs?: number | null;
}

const TASK_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  TODO: { bg: "#f3f4f6", color: "#374151", label: "To Do" },
  IN_PROGRESS: { bg: "#dbeafe", color: "#1e40af", label: "In Progress" },
  BLOCKED: { bg: "#fee2e2", color: "#991b1b", label: "Blocked" },
  DONE: { bg: "#d1fae5", color: "#065f46", label: "Done" },
};

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  LOW: { color: "#9ca3af", label: "Low" },
  MEDIUM: { color: "#f59e0b", label: "Med" },
  HIGH: { color: "#f97316", label: "High" },
  CRITICAL: { color: "#dc2626", label: "Crit" },
};

export default function ProjectsPage() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Filters
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  
  const [availableUsers, setAvailableUsers] = useState<CreatedByUser[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [availableClients, setAvailableClients] = useState<Array<{ id: string; name: string }>>([]);

  // Detail modal
  const [detailModal, setDetailModal] = useState<{ open: boolean; log: DailyLogDetail | null; loading: boolean }>({ open: false, log: null, loading: false });

  // Map popover
  const [mapPopover, setMapPopover] = useState<{ logId: string; projectId: string; lat: number; lng: number; label: string } | null>(null);

  // Dashboard cards: Tasks + Notes/Journal
  const [dashTasks, setDashTasks] = useState<DashboardTask[]>([]);
  const [vjns, setVjns] = useState<VoiceJournalNote[]>([]);

  // TUCKS Personal KPI card
  const [personalKpis, setPersonalKpis] = useState<{
    period: string;
    modules: Record<string, { you: number; companyAvg: number }>;
    completionRate: { you: number; companyAvg: number };
    ranking: { dailyLogPercentile: number; label: string };
  } | null>(null);
  const [kpiOpen, setKpiOpen] = useState(true);

  // TUCKS Gaming Review Queue (PM+ only)
  const [gamingFlags, setGamingFlags] = useState<Array<{
    id: string;
    flagDate: string;
    gamingScore: number;
    scores: { volume: number; burst: number; entropy: number; similarity: number; ratio: number };
    severity: "RED" | "AMBER";
    dailyLogCount: number;
    user: { id: string; email: string; firstName: string | null; lastName: string | null };
    status: string;
  }>>([]);
  const [reviewOpen, setReviewOpen] = useState(true);
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>("");
  const [journalProjectFilter, setJournalProjectFilter] = useState<string>("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  const [, startUiTransition] = useTransition();

  // Build project coords lookup
  const projectCoordsMap = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number; label: string }>();
    availableProjects.forEach((p) => {
      if (p.latitude != null && p.longitude != null) {
        const label = [p.name, p.addressLine1, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
        m.set(p.id, { lat: p.latitude, lng: p.longitude, label });
      }
    });
    return m;
  }, [availableProjects]);

  // Build project name lookup
  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    availableProjects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [availableProjects]);

  // Determine if user is PM+
  const [isPmPlus, setIsPmPlus] = useState(false);

  // Get token + role from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const accessToken = localStorage.getItem("accessToken");
      setToken(accessToken);

      const globalRole = localStorage.getItem("globalRole");
      const companyRole = localStorage.getItem("companyRole");
      const pmPlus =
        globalRole === "SUPER_ADMIN" ||
        companyRole === "OWNER" ||
        companyRole === "ADMIN" ||
        companyRole === "PM";
      setIsPmPlus(pmPlus);
    }
  }, []);

  // Calculate items per page based on container height
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateItemsPerPage = () => {
      const containerHeight = containerRef.current?.clientHeight || 800;
      const calculated = Math.floor(containerHeight / ROW_HEIGHT);
      setItemsPerPage(Math.max(10, calculated)); // Minimum 10 items
    };

    updateItemsPerPage();
    window.addEventListener("resize", updateItemsPerPage);
    return () => window.removeEventListener("resize", updateItemsPerPage);
  }, []);

  // Fetch projects for multi-select filter
  useEffect(() => {
    if (!token) return;

    const fetchProjects = async () => {
      try {
        const response = await fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data: Project[] = await response.json();
        setAvailableProjects(data);

        // Extract unique clients
        const clientsMap = new Map<string, { id: string; name: string }>();
        data.forEach((project) => {
          if (project.tenantClient) {
            const client = project.tenantClient;
            const name = client.displayName || `${client.firstName} ${client.lastName}`.trim();
            if (!clientsMap.has(client.id)) {
              clientsMap.set(client.id, { id: client.id, name });
            }
          }
        });
        setAvailableClients(Array.from(clientsMap.values()));
      } catch (err) {
        console.error("Failed to fetch projects:", err);
      }
    };

    fetchProjects();
  }, [token]);

  // Fetch personal KPIs (TUCKS)
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/analytics/me?period=30d`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setPersonalKpis(await res.json());
      } catch { /* card stays empty */ }
    })();
  }, [token]);

  // Fetch gaming review queue (TUCKS, PM+ only)
  useEffect(() => {
    if (!token || !isPmPlus) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/analytics/gaming-review`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setGamingFlags(await res.json());
      } catch { /* card stays empty */ }
    })();
  }, [token, isPmPlus]);

  const handleReviewAction = useCallback(async (flagId: string, action: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/analytics/gaming-review/${flagId}/action`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setGamingFlags(prev => prev.filter(f => f.id !== flagId));
      }
    } catch { /* ignore */ }
  }, [token]);

  // Fetch tasks for dashboard card
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setDashTasks(Array.isArray(data) ? data : []);
        }
      } catch { /* card stays empty */ }
    })();
  }, [token]);

  // Fetch VJNs for Notes/Journal card
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/vjn`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setVjns(Array.isArray(data) ? data : []);
        }
      } catch { /* card stays empty */ }
    })();
  }, [token]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch more logs to support pagination (fetch all, paginate client-side)
      const response = await fetch(`${API_BASE}/daily-logs?limit=500`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Extract API error body for a useful message (statusText is empty on HTTP/2).
        let detail = response.statusText || `HTTP ${response.status}`;
        try {
          const body = await response.json();
          if (body?.message) detail = body.message;
        } catch { /* ignore parse errors */ }
        throw new Error(`Failed to fetch daily logs (${response.status}): ${detail}`);
      }

      const data: DailyLogsResponse = await response.json();
      setLogs(data.items);
      setTotal(data.total);

      // Extract unique users for filter
      const uniqueUsers = Array.from(
        new Map(data.items.map((log) => [log.createdByUser.id, log.createdByUser])).values(),
      );
      setAvailableUsers(uniqueUsers);
    } catch (err: any) {
      console.error("Failed to fetch daily logs:", err);
      setError(err.message || "Failed to load daily logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLogs();
    }
  }, [token]);

  // Apply all filters
  const filteredLogs = logs.filter((log) => {
    // User filter
    if (selectedUserId && log.createdByUser.id !== selectedUserId) return false;
    
    // Type filter
    if (selectedType && log.type !== selectedType) return false;
    
    // Status filter
    if (selectedStatus && log.status !== selectedStatus) return false;
    
    // Project filter
    if (selectedProjectIds.length > 0 && !selectedProjectIds.includes(log.projectId)) {
      return false;
    }
    
    // Client filter (check if project belongs to selected client)
    if (selectedClientIds.length > 0) {
      const project = availableProjects.find((p) => p.id === log.projectId);
      if (!project?.tenantClient || !selectedClientIds.includes(project.tenantClient.id)) {
        return false;
      }
    }
    
    // Date range filter
    if (dateFrom) {
      const logDate = new Date(log.logDate).toISOString().split("T")[0];
      if (logDate < dateFrom) return false;
    }
    if (dateTo) {
      const logDate = new Date(log.logDate).toISOString().split("T")[0];
      if (logDate > dateTo) return false;
    }
    
    // Text search (searches in title, work performed, issues, project name)
    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      const searchableText = [
        log.title || "",
        log.workPerformed || "",
        log.issues || "",
        log.projectName || "",
        log.crewOnSite || "",
      ].join(" ").toLowerCase();
      
      if (!searchableText.includes(query)) return false;
    }
    
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUserId, selectedType, selectedStatus, selectedProjectIds, selectedClientIds, dateFrom, dateTo, searchText]);

  /** Open the read-only detail modal for a daily log. */
  const handleLogClick = useCallback(async (log: DailyLog) => {
    if (!token) return;
    setDetailModal({ open: true, log: null, loading: true });
    try {
      const res = await fetch(`${API_BASE}/daily-logs/${log.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const full: DailyLogDetail = await res.json();
      setDetailModal({ open: true, log: full, loading: false });
    } catch {
      // Fallback: show what we have from the list
      setDetailModal({ open: true, log: log as DailyLogDetail, loading: false });
    }
  }, [token]);

  const closeDetailModal = useCallback(() => {
    setDetailModal({ open: false, log: null, loading: false });
  }, []);

  const handleMapPinClick = useCallback((e: React.MouseEvent, log: DailyLog) => {
    e.stopPropagation();
    const coords = projectCoordsMap.get(log.projectId);
    if (!coords) return;
    // Toggle off if same log
    if (mapPopover?.logId === log.id) {
      setMapPopover(null);
    } else {
      setMapPopover({ logId: log.id, projectId: log.projectId, ...coords });
    }
  }, [projectCoordsMap, mapPopover]);

  const getUserDisplayName = (user: CreatedByUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.lastName) return user.lastName;
    return user.email;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const clearFilters = () => {
    setSelectedUserId("");
    setSelectedType("");
    setSelectedStatus("");
    setSearchText("");
    setSelectedProjectIds([]);
    setSelectedClientIds([]);
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  };

  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  };

  const hasActiveFilters = () => {
    return (
      selectedUserId ||
      selectedType ||
      selectedStatus ||
      searchText.trim() ||
      selectedProjectIds.length > 0 ||
      selectedClientIds.length > 0 ||
      dateFrom ||
      dateTo
    );
  };

  if (!token) {
    return (
      <div className="app-card" style={{ textAlign: "center", padding: "40px" }}>
        <p>Please log in to view daily logs.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <div
        className="app-card"
        style={{
          borderRadius: 0,
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          flexShrink: 0,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>
          All Projects - Dashboard
        </h2>

        {/* Search Box */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search logs (title, work, issues, crew, project name)..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
            }}
          />
        </div>

        {/* Filter Row 1: Basic Filters */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {/* User Filter */}
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            <option value="">All Users</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {getUserDisplayName(u)}
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            <option value="">All Types</option>
            {Object.entries(LOG_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To date"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Filter Row 2: Multi-Select Projects and Clients */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          {/* Projects Multi-Select */}
          <details style={{ flex: 1 }}>
            <summary
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                backgroundColor: "white",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              Projects {selectedProjectIds.length > 0 && `(${selectedProjectIds.length})`}
            </summary>
            <div
              style={{
                marginTop: 4,
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "white",
                padding: 8,
              }}
            >
              {availableProjects.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: 8 }}>No projects available</div>
              ) : (
                availableProjects.map((project) => (
                  <label
                    key={project.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProjectSelection(project.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {project.name}
                  </label>
                ))
              )}
            </div>
          </details>

          {/* Clients Multi-Select */}
          <details style={{ flex: 1 }}>
            <summary
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                backgroundColor: "white",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              Clients {selectedClientIds.length > 0 && `(${selectedClientIds.length})`}
            </summary>
            <div
              style={{
                marginTop: 4,
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                backgroundColor: "white",
                padding: 8,
              }}
            >
              {availableClients.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: 8 }}>No clients available</div>
              ) : (
                availableClients.map((client) => (
                  <label
                    key={client.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleClientSelection(client.id)}
                      style={{ cursor: "pointer" }}
                    />
                    {client.name}
                  </label>
                ))
              )}
            </div>
          </details>
        </div>

        {/* Action Row: Clear Filters and Result Count */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          {hasActiveFilters() && (
            <button
              onClick={clearFilters}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 14,
                backgroundColor: "white",
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              Clear All Filters
            </button>
          )}
          <span style={{ fontSize: 14, color: "#6b7280", marginLeft: "auto" }}>
            Showing {paginatedLogs.length} of {filteredLogs.length} logs
            {filteredLogs.length !== total && ` (filtered from ${total} total)`}
          </span>
        </div>
      </div>

      {/* Scrollable content: dashboard + daily logs */}
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>

        {/* ── TUCKS Personal KPIs ────────────────────────────── */}
        {personalKpis && (
          <div style={{ marginBottom: 14, border: "1px solid #e0e7ff", borderRadius: 8, background: "linear-gradient(135deg, #f5f7ff 0%, #eef2ff 100%)" }}>
            <button
              onClick={() => startUiTransition(() => setKpiOpen(!kpiOpen))}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1e40af" }}
            >
              <span>Your Performance — {personalKpis.period}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: personalKpis.ranking.dailyLogPercentile >= 80 ? "#d1fae5" : personalKpis.ranking.dailyLogPercentile >= 50 ? "#fef3c7" : "#fee2e2", color: personalKpis.ranking.dailyLogPercentile >= 80 ? "#065f46" : personalKpis.ranking.dailyLogPercentile >= 50 ? "#92400e" : "#991b1b" }}>
                  {personalKpis.ranking.label}
                </span>
                <span style={{ fontSize: 16 }}>{kpiOpen ? "▾" : "▸"}</span>
              </span>
            </button>
            {kpiOpen && (
              <div style={{ padding: "0 14px 14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                  {/* Module stats */}
                  {([
                    ["Daily Logs", personalKpis.modules.dailyLogs],
                    ["Tasks", personalKpis.modules.tasks],
                    ["Messages", personalKpis.modules.messages],
                    ["Timecards", personalKpis.modules.timecards],
                  ] as [string, { you: number; companyAvg: number }][]).map(([label, m]) => {
                    const pct = m.companyAvg > 0 ? Math.round((m.you / m.companyAvg - 1) * 100) : 0;
                    return (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#1e40af" }}>{m.you}</div>
                        <div style={{ fontSize: 10, color: "#9ca3af" }}>avg {m.companyAvg}</div>
                        {pct !== 0 && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: pct > 0 ? "#16a34a" : "#dc2626", marginTop: 1 }}>
                            {pct > 0 ? "+" : ""}{pct}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Task completion rate */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Completion</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#1e40af" }}>{personalKpis.completionRate.you}%</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>avg {personalKpis.completionRate.companyAvg}%</div>
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 9, color: "#9ca3af", textAlign: "right" }}>TUCKS — Telemetry Usage Chart KPI System</div>
              </div>
            )}
          </div>
        )}

        {/* ── TUCKS Quality Review Queue (PM+ only) ─────────────── */}
        {isPmPlus && gamingFlags.length > 0 && (
          <div style={{ marginBottom: 14, border: "1px solid #fecaca", borderRadius: 8, background: "linear-gradient(135deg, #fef2f2 0%, #fff5f5 100%)" }}>
            <button
              onClick={() => startUiTransition(() => setReviewOpen(!reviewOpen))}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#991b1b" }}
            >
              <span>Quality Review Queue — {gamingFlags.length} pending</span>
              <span style={{ fontSize: 16 }}>{reviewOpen ? "▾" : "▸"}</span>
            </button>
            {reviewOpen && (
              <div style={{ padding: "0 14px 14px" }}>
                {gamingFlags.slice(0, 8).map((flag) => {
                  const name = flag.user.firstName
                    ? `${flag.user.firstName} ${flag.user.lastName || ""}`.trim()
                    : flag.user.email;
                  const date = new Date(flag.flagDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <div key={flag.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #fee2e2" }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: flag.severity === "RED" ? "#dc2626" : "#f59e0b",
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 100 }}>{name}</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{date}</span>
                      <span style={{ fontSize: 10, color: "#991b1b", fontWeight: 600 }}>{(flag.gamingScore * 100).toFixed(0)}%</span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>{flag.dailyLogCount} logs</span>
                      <span style={{ flex: 1 }} />
                      <button
                        onClick={() => handleReviewAction(flag.id, "DISMISSED")}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: "#6b7280" }}
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleReviewAction(flag.id, "COACHED")}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, border: "1px solid #fbbf24", background: "#fffbeb", cursor: "pointer", color: "#92400e" }}
                      >
                        Coach
                      </button>
                      <button
                        onClick={() => handleReviewAction(flag.id, "CONFIRMED")}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, border: "1px solid #fca5a5", background: "#fef2f2", cursor: "pointer", color: "#991b1b" }}
                      >
                        Confirm
                      </button>
                    </div>
                  );
                })}
                {gamingFlags.length > 8 && (
                  <div style={{ fontSize: 10, color: "#991b1b", marginTop: 6, fontWeight: 500 }}>
                    +{gamingFlags.length - 8} more flags
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 9, color: "#9ca3af", textAlign: "right" }}>TUCKS Gaming Detection — 5-signal composite scoring</div>
              </div>
            )}
          </div>
        )}

        {/* ── Organization Performance Dashboard ─────────────────── */}
        <div style={{ marginBottom: 16 }}>
          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Work Activity */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #2563eb" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Work Activity</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Active Projects</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{availableProjects.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Daily Logs Today</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {logs.filter(l => {
                      const d = new Date(l.logDate);
                      const today = new Date();
                      return d.toDateString() === today.toDateString();
                    }).length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Total Logs</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{total}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Approved</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{logs.filter(l => l.status === "APPROVED").length}</div>
                </div>
              </div>
            </div>

            {/* Financial Analysis — PM+ only */}
            {isPmPlus ? (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #2563eb" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Financial Analysis</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Total Billed</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>—</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Outstanding</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>—</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Budget Variance</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>—</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Avg Margin</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>—</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>connects to financial module</div>
              </div>
            ) : (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Financial data visible to PM+ roles</span>
              </div>
            )}

            {/* Project Efficiency */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #f97316" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Project Efficiency</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Submitted</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{logs.filter(l => l.status === "SUBMITTED").length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Rejected</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: logs.filter(l => l.status === "REJECTED").length > 0 ? "#dc2626" : undefined }}>{logs.filter(l => l.status === "REJECTED").length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Log Types Used</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{new Set(logs.map(l => l.type)).size}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Avg Attachments</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{logs.length ? Math.round(logs.reduce((s, l) => s + l.attachments.length, 0) / logs.length * 10) / 10 : 0}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Productivity + Recent Events Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Most Active Users */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #16a34a" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Most Active</div>
              {(() => {
                const counts = new Map<string, { user: CreatedByUser; count: number }>();
                logs.forEach(l => {
                  const key = l.createdByUser.id;
                  const existing = counts.get(key);
                  if (existing) existing.count++;
                  else counts.set(key, { user: l.createdByUser, count: 1 });
                });
                const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 3);
                if (!sorted.length) return <div style={{ fontSize: 12, color: "#9ca3af" }}>No data yet</div>;
                return sorted.map((entry, i) => (
                  <div
                    key={entry.user.id}
                    onClick={() => startUiTransition(() => setSelectedUserId(entry.user.id))}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < sorted.length - 1 ? "1px solid #f3f4f6" : undefined, cursor: "pointer", borderRadius: 3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{getUserDisplayName(entry.user)}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>{entry.count} logs filed</span>
                  </div>
                ));
              })()}
            </div>

            {/* Recent Events */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent Events</div>
              {logs.slice(0, 5).map((log, i) => {
                const dotColor = log.status === "APPROVED" ? "#16a34a" : log.status === "REJECTED" ? "#dc2626" : "#3b82f6";
                const ago = (() => {
                  const diff = Date.now() - new Date(log.createdAt).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 60) return `${mins} min ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs} hr ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })();
                return (
                  <div
                    key={log.id}
                    onClick={() => handleLogClick(log)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < 4 ? "1px solid #f3f4f6" : undefined, cursor: "pointer", borderRadius: 3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{LOG_TYPE_LABELS[log.type]} — {log.projectName}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{ago}</span>
                  </div>
                );
              })}
              {logs.length === 0 && <div style={{ fontSize: 12, color: "#9ca3af" }}>No recent events</div>}
            </div>
          </div>

          {/* Notes/Journal + ToDo's Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Notes / Journal Card */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #8b5cf6" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Notes / Journal</div>
                <select
                  value={journalProjectFilter}
                  onChange={(e) => startUiTransition(() => setJournalProjectFilter(e.target.value))}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11, backgroundColor: "white", cursor: "pointer", maxWidth: 180 }}
                >
                  <option value="">All Projects</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const filtered = vjns.filter((v) => !journalProjectFilter || v.projectId === journalProjectFilter);
                if (filtered.length === 0) {
                  return <div style={{ fontSize: 12, color: "#9ca3af", padding: "12px 0" }}>No voice journal notes yet.</div>;
                }
                return filtered.slice(0, 6).map((v, i) => (
                  <div
                    key={v.id}
                    onClick={() => { if (v.projectId) window.location.href = `/projects/${v.projectId}`; }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < Math.min(filtered.length, 6) - 1 ? "1px solid #f3f4f6" : undefined, cursor: v.projectId ? "pointer" : "default", borderRadius: 3 }}
                    onMouseEnter={(e) => { if (v.projectId) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                      {v.project?.name || "General"}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {v.aiSummary || v.aiText?.slice(0, 80) || "Voice note"}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, padding: "1px 5px", borderRadius: 3, background: v.status === "SHARED" ? "#d1fae5" : "#f3f4f6", color: v.status === "SHARED" ? "#065f46" : "#6b7280" }}>
                      {v.status}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>
                      {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ));
              })()}
              {vjns.filter((v) => !journalProjectFilter || v.projectId === journalProjectFilter).length > 6 && (
                <div style={{ fontSize: 10, color: "#8b5cf6", marginTop: 6, fontWeight: 500 }}>
                  +{vjns.filter((v) => !journalProjectFilter || v.projectId === journalProjectFilter).length - 6} more
                </div>
              )}
            </div>

            {/* ToDo's Card */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, borderTop: "3px solid #ec4899" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>ToDo's</span>
                  {(() => {
                    const now = new Date();
                    const overdue = dashTasks.filter((t) =>
                      t.status !== "DONE" &&
                      t.dueDate &&
                      new Date(t.dueDate) < now &&
                      (!taskProjectFilter || t.projectId === taskProjectFilter)
                    ).length;
                    if (overdue > 0) {
                      return <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "#fee2e2", color: "#991b1b" }}>{overdue} overdue</span>;
                    }
                    return null;
                  })()}
                </div>
                <select
                  value={taskProjectFilter}
                  onChange={(e) => startUiTransition(() => setTaskProjectFilter(e.target.value))}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11, backgroundColor: "white", cursor: "pointer", maxWidth: 180 }}
                >
                  <option value="">All Projects</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const filtered = dashTasks
                  .filter((t) => !taskProjectFilter || t.projectId === taskProjectFilter)
                  .filter((t) => t.status !== "DONE");
                if (filtered.length === 0) {
                  return <div style={{ fontSize: 12, color: "#9ca3af", padding: "12px 0" }}>No open tasks.</div>;
                }
                const now = new Date();
                return filtered.slice(0, 6).map((t, i) => {
                  const ts = TASK_STATUS_STYLE[t.status] || TASK_STATUS_STYLE.TODO;
                  const ps = PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.MEDIUM;
                  const isOverdue = t.dueDate && new Date(t.dueDate) < now;
                  return (
                    <div
                      key={t.id}
                      onClick={() => { window.location.href = `/projects/${t.projectId}`; }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: i < Math.min(filtered.length, 6) - 1 ? "1px solid #f3f4f6" : undefined, cursor: "pointer", borderRadius: 3 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: ts.color }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                        {t.title}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 10, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>
                        {projectNameById.get(t.projectId) || "—"}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 600, color: ps.color }}>{ps.label}</span>
                      {t.dueDate && (
                        <span style={{ flexShrink: 0, fontSize: 10, color: isOverdue ? "#dc2626" : "#9ca3af", fontWeight: isOverdue ? 600 : 400, whiteSpace: "nowrap" }}>
                          {isOverdue ? "⚠ " : ""}{new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {t.assignee && (
                        <span style={{ flexShrink: 0, fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>
                          → {t.assignee.firstName || t.assignee.email.split("@")[0]}
                        </span>
                      )}
                    </div>
                  );
                });
              })()}
              {dashTasks.filter((t) => (!taskProjectFilter || t.projectId === taskProjectFilter) && t.status !== "DONE").length > 6 && (
                <div style={{ fontSize: 10, color: "#ec4899", marginTop: 6, fontWeight: 500 }}>
                  +{dashTasks.filter((t) => (!taskProjectFilter || t.projectId === taskProjectFilter) && t.status !== "DONE").length - 6} more
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>
            Dashboard data is live from daily logs — financial KPIs will connect to the financial module.
          </div>
        </div>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Loading daily logs...
          </div>
        )}

        {error && (
          <div
            className="app-card"
            style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              padding: 16,
              borderRadius: 8,
            }}
          >
            <p style={{ color: "#991b1b", margin: 0 }}>Error: {error}</p>
          </div>
        )}

        {!loading && !error && filteredLogs.length === 0 && (
          <div
            className="app-card"
            style={{ textAlign: "center", padding: 40, color: "#6b7280" }}
          >
            <p style={{ margin: 0 }}>
              {logs.length === 0
                ? "No daily logs found. Daily logs will appear here when created."
                : "No logs match the selected filters."}
            </p>
          </div>
        )}

        {!loading && !error && filteredLogs.length > 0 && (
          <>
            {/* Compact rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {paginatedLogs.map((log) => {
                const coords = projectCoordsMap.get(log.projectId);
                const ss = STATUS_STYLE[log.status];
                return (
                  <div
                    key={log.id}
                    style={{ position: "relative" }}
                  >
                    <div
                      onClick={() => handleLogClick(log)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderRadius: 4,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        fontSize: 13,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; }}
                    >
                      {/* Map pin */}
                      <button
                        type="button"
                        onClick={(e) => handleMapPinClick(e, log)}
                        title={coords ? "Show on map" : "No coordinates"}
                        style={{
                          flexShrink: 0,
                          border: "none",
                          background: "transparent",
                          cursor: coords ? "pointer" : "default",
                          padding: 0,
                          opacity: coords ? 1 : 0.25,
                          lineHeight: 1,
                        }}
                      >
                        <svg width="18" height="24" viewBox="0 0 18 24" fill="none">
                          <path d="M9 0C4.03 0 0 4.03 0 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z" fill={coords ? "#2563eb" : "#9ca3af"} />
                          <circle cx="9" cy="9" r="3.5" fill="#ffffff" />
                        </svg>
                      </button>

                      {/* Project name */}
                      <span style={{ fontWeight: 600, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                        {log.projectName}
                      </span>

                      {/* Type badge */}
                      <span style={{ flexShrink: 0, padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 500, background: "#f3f4f6", color: "#4b5563" }}>
                        {LOG_TYPE_LABELS[log.type]}
                      </span>

                      {/* Status */}
                      <span style={{ flexShrink: 0, padding: "1px 6px", borderRadius: 3, fontSize: 11, fontWeight: 500, background: ss.bg, color: ss.color }}>
                        {log.status}
                      </span>

                      {/* Title */}
                      {log.title && (
                        <span style={{ color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <strong style={{ color: "#6b7280", fontWeight: 500 }}>Title:</strong> {log.title}
                        </span>
                      )}

                      {/* Work */}
                      {log.workPerformed && (
                        <span style={{ color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <strong style={{ fontWeight: 500 }}>Work:</strong> {log.workPerformed.length > 60 ? `${log.workPerformed.substring(0, 60)}…` : log.workPerformed}
                        </span>
                      )}

                      {/* Flex space */}
                      <span style={{ flex: 1 }} />

                      {/* Right: author · time · attachments · date */}
                      <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
                        <span>By: {getUserDisplayName(log.createdByUser)}</span>
                        <span>·</span>
                        <span>{formatTime(log.createdAt)}</span>
                        {log.attachments.length > 0 && (
                          <>
                            <span>·</span>
                            <span>📎 {log.attachments.length}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatDate(log.logDate)}</span>
                      </span>
                    </div>

                    {/* Map popover */}
                    {mapPopover?.logId === log.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 12,
                          zIndex: 50,
                          marginTop: 4,
                          borderRadius: 8,
                          overflow: "hidden",
                          boxShadow: "0 8px 24px rgba(15,23,42,0.25)",
                          border: "1px solid #e5e7eb",
                          background: "#ffffff",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 6px" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setMapPopover(null); }}
                            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                        <MapComponent lat={mapPopover.lat} lng={mapPopover.lng} label={mapPopover.label} projectId={mapPopover.projectId} authToken={token || ""} allProjects={availableProjects} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid #e5e7eb",
                }}
              >
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    backgroundColor: currentPage === 1 ? "#f3f4f6" : "white",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: 14,
                  }}
                >
                  Previous
                </button>

                <div style={{ display: "flex", gap: 4 }}>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    // Show first 3, last 1, and current page context
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          backgroundColor: currentPage === pageNum ? "#3b82f6" : "white",
                          color: currentPage === pageNum ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: currentPage === pageNum ? 600 : 400,
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    backgroundColor: currentPage === totalPages ? "#f3f4f6" : "white",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: 14,
                  }}
                >
                  Next
                </button>

                <span style={{ fontSize: 14, color: "#6b7280", marginLeft: 8 }}>
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailModal.open && (
        <div
          onClick={closeDetailModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15,23,42,0.45)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 750,
              maxWidth: "96vw",
              maxHeight: "90vh",
              overflowY: "auto",
              backgroundColor: "#ffffff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              boxShadow: "0 16px 40px rgba(15,23,42,0.35)",
              padding: 16,
              fontSize: 13,
            }}
          >
            {detailModal.loading && (
              <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading details…</div>
            )}
            {!detailModal.loading && detailModal.log && (() => {
              const log = detailModal.log;
              const ss = STATUS_STYLE[log.status];
              return (
                <>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Daily Log Details</div>
                    <button
                      type="button"
                      onClick={closeDetailModal}
                      style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  {/* Type & Date & Manpower Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Type</div>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#f3f4f6", color: "#374151" }}>
                        {LOG_TYPE_LABELS[log.type]}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Date</div>
                      <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 0" }}>
                        {log.logDate ? new Date(log.logDate).toLocaleDateString() : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Manpower</div>
                      <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 0" }}>{log.manpowerOnsite ?? "—"}</div>
                    </div>
                  </div>

                  {/* Project */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Project</div>
                    <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px", background: "#f9fafb", borderRadius: 4 }}>
                      {log.projectName}
                    </div>
                  </div>

                  {/* Status + Author */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Status</div>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: ss.bg, color: ss.color }}>{log.status}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Created By</div>
                      <div style={{ fontSize: 13, padding: "6px 0" }}>{getUserDisplayName(log.createdByUser)} · {formatTime(log.createdAt)}</div>
                    </div>
                  </div>

                  {/* Title */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Title</div>
                    <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px", background: "#f9fafb", borderRadius: 4, minHeight: 32 }}>
                      {log.title || "—"}
                    </div>
                  </div>

                  {/* Receipt/Expense Details */}
                  {log.type === "RECEIPT_EXPENSE" && (
                    <div style={{ marginBottom: 12, padding: 10, background: "#fef3c7", borderRadius: 6, border: "1px solid #fcd34d" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>Receipt Details</div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#92400e", marginBottom: 2 }}>Vendor</div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{log.expenseVendor || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#92400e", marginBottom: 2 }}>Amount</div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>
                            {log.expenseAmount != null ? `$${Number(log.expenseAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#92400e", marginBottom: 2 }}>Expense Date</div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{log.expenseDate ? new Date(log.expenseDate).toLocaleDateString() : "—"}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PETL Context */}
                  {(log.building || log.unit || log.roomParticle || log.sowItem) && (
                    <div style={{ marginBottom: 12, padding: 10, background: "#eff6ff", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1e40af", marginBottom: 6 }}>PETL Context</div>
                      <div style={{ fontSize: 11, color: "#374151", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
                        {log.building && (<><span style={{ fontWeight: 500 }}>Building:</span><span>{log.building.name}{log.building.code ? ` (${log.building.code})` : ""}</span></>)}
                        {log.unit && (<><span style={{ fontWeight: 500 }}>Unit:</span><span>{log.unit.label}{log.unit.floor != null ? ` (Floor ${log.unit.floor})` : ""}</span></>)}
                        {log.roomParticle && (<><span style={{ fontWeight: 500 }}>Room:</span><span>{log.roomParticle.fullLabel || log.roomParticle.name}</span></>)}
                        {log.sowItem && (<><span style={{ fontWeight: 500 }}>SOW Item:</span><span>{log.sowItem.description || "(No description)"}</span></>)}
                      </div>
                    </div>
                  )}

                  {/* Work Performed */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Work Performed</div>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap", padding: 8, background: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb", minHeight: 48 }}>
                      {log.workPerformed || "—"}
                    </div>
                  </div>

                  {/* Crew On Site */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Crew On Site</div>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap", padding: 8, background: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb", minHeight: 32 }}>
                      {log.crewOnSite || "—"}
                    </div>
                  </div>

                  {/* Weather & Person On Site */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Weather</div>
                      <div style={{ fontSize: 12, padding: "6px 8px", background: "#f9fafb", borderRadius: 4, minHeight: 32 }}>{log.weatherSummary || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Person(s) On Site</div>
                      <div style={{ fontSize: 12, padding: "6px 8px", background: "#f9fafb", borderRadius: 4, minHeight: 32 }}>{log.personOnsite || "—"}</div>
                    </div>
                  </div>

                  {/* Issues & Safety */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Issues / Delays</div>
                      <div style={{ fontSize: 12, whiteSpace: "pre-wrap", padding: 8, background: log.issues ? "#fef2f2" : "#f9fafb", borderRadius: 4, border: log.issues ? "1px solid #fecaca" : "1px solid #e5e7eb", minHeight: 48 }}>
                        {log.issues || "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                        Safety Note
                        {log.safetyIncidents && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>⚠️ Safety</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, whiteSpace: "pre-wrap", padding: 8, background: log.safetyIncidents ? "#fef2f2" : "#f9fafb", borderRadius: 4, border: log.safetyIncidents ? "1px solid #fecaca" : "1px solid #e5e7eb", minHeight: 48 }}>
                        {log.safetyIncidents || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Confidential Notes */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Confidential Notes (NO PRINT)</div>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap", padding: 8, background: log.confidentialNotes ? "#fefce8" : "#f9fafb", borderRadius: 4, border: log.confidentialNotes ? "1px solid #fde047" : "1px solid #e5e7eb", minHeight: 32 }}>
                      {log.confidentialNotes || "—"}
                    </div>
                  </div>

                  {/* Sharing */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Sharing</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {log.shareInternal && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#dbeafe", color: "#1e40af" }}>Internal</span>}
                      {log.shareSubs && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#d1fae5", color: "#065f46" }}>Subs</span>}
                      {log.shareClient && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e" }}>Client</span>}
                      {log.sharePrivate && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f3f4f6", color: "#374151" }}>Private</span>}
                      {!log.shareInternal && !log.shareSubs && !log.shareClient && !log.sharePrivate && (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>No sharing configured</span>
                      )}
                    </div>
                  </div>

                  {/* Attachments */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Attachments ({log.attachments?.length || 0})</div>
                    {log.attachments && log.attachments.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {log.attachments.map((att: any, idx: number) => {
                          const url = att.fileUrl || att.storageUrl || "";
                          const displayUrl = url.startsWith("gs://") || url.startsWith("s3://")
                            ? `${API_BASE}/uploads/signed?uri=${encodeURIComponent(url)}`
                            : url;
                          const isImage = att.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.fileName || "");
                          return (
                            <a
                              key={att.id || idx}
                              href={displayUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ textAlign: "center", width: 80, textDecoration: "none", color: "inherit" }}
                            >
                              {isImage ? (
                                <img
                                  src={displayUrl}
                                  alt={att.fileName || "attachment"}
                                  style={{ width: 72, height: 52, objectFit: "cover", borderRadius: 4, border: "1px solid #e5e7eb" }}
                                />
                              ) : (
                                <div style={{ width: 72, height: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 18 }}>
                                  📄
                                </div>
                              )}
                              <div style={{ fontSize: 9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {att.fileName || "file"}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>No attachments.</div>
                    )}
                  </div>

                  {/* Footer: created timestamp */}
                  <div style={{ fontSize: 11, color: "#9ca3af", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                    Created {new Date(log.createdAt).toLocaleString()}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => { closeDetailModal(); window.location.href = `/projects/${log.projectId}?tab=DAILY_LOGS`; }}
                      style={{
                        padding: "8px 18px", borderRadius: 6, border: "1px solid #2563eb",
                        background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Take me to {LOG_TYPE_LABELS[log.type]} &rarr;
                    </button>
                    <button
                      type="button"
                      onClick={closeDetailModal}
                      style={{ padding: "6px 16px", borderRadius: 4, border: "1px solid #d1d5db", background: "#ffffff", fontSize: 12, cursor: "pointer" }}
                    >
                      Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
