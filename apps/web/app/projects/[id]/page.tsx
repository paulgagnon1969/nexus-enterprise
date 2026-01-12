"use client";

import * as React from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { uploadImageFileToNexusUploads } from "../../lib/uploads";

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
  isAcvOnly?: boolean;
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
  code: string;
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

type CompanyRole = "OWNER" | "ADMIN" | "MEMBER" | "CLIENT";
type GlobalRole = "SUPER_ADMIN" | "NONE" | string;

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
  // Optional PETL context for PUDL
  building?: { id: string; name: string; code: string | null } | null;
  unit?: { id: string; label: string; floor: number | null } | null;
  roomParticle?: { id: string; name: string; fullLabel: string } | null;
  sowItem?: { id: string; code: string | null; description: string | null } | null;
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
  // Optional PETL context when composing from PETL
  buildingId?: string | null;
  unitId?: string | null;
  roomParticleId?: string | null;
  sowItemId?: string | null;
}

interface RoomComponentAgg {
  code: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  total: number;
  lines: number;
}

interface ImportRoomBucket {
  groupCode: string | null;
  groupDescription: string | null;
  lineCount: number;
  totalAmount: number;
  sampleUnitLocations: string[];
  assignedUnitLabel: string | null;
  assignedUnitId: string | null;
  assignedFullLabel: string | null;
}

interface ImportRoomLine {
  lineNo: number;
  desc: string | null;
  qty: number | null;
  unit: string | null;
  itemAmount: number | null;
  cat: string | null;
  sel: string | null;
  owner: string | null;
  originalVendor: string | null;
  sourceName: string | null;
}

interface FinancialSummary {
  totalRcvClaim: number;
  totalAcvClaim: number;
  workCompleteRcv: number;
  acvReturn: number;
  opRate: number;
  acvOP: number;
  totalDueWorkBillable: number;
  depositRate: number;
  depositBaseline: number;
  billedToDate: number;
  duePayable: number;
  dueAmount: number;
  snapshotComputedAt: string | null;
  snapshotSource: "none" | "snapshot" | "recomputed";
}

interface ProjectEmployee {
  firstName: string | null;
  lastName: string | null;
  employeeId: string | null;
  ssnLast4: string | null;
  classCode: string | null;
  totalHours: number;
  firstWeekEnd: string | null;
  lastWeekEnd: string | null;
  weekCodes?: string[];
}

type TabKey =
  | "SUMMARY"
  | "PETL"
  | "STRUCTURE"
  | "DAILY_LOGS"
  | "FILES"
  | "FINANCIAL";

// Logical project state buckets backed by Project.status
// OPEN  -> status "open" (or "active")
// ARCHIVED -> status "archived"
// DELETED  -> status "deleted"
// WARRANTY -> status "warranty"
type ProjectStateChoice = "OPEN" | "ARCHIVED" | "DELETED" | "WARRANTY";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [petlItemCount, setPetlItemCount] = useState<number | null>(null);
  const [petlTotalAmount, setPetlTotalAmount] = useState<number | null>(null);
  const [componentsCount, setComponentsCount] = useState<number | null>(null);
  const [petlItems, setPetlItems] = useState<PetlItem[]>([]);
  const [petlLoading, setPetlLoading] = useState(false);

  const [participants, setParticipants] = useState<
    | {
        myOrganization: Participant[];
        collaborators: Participant[];
      }
    | null
  >(null);

  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [actorCompanyRole, setActorCompanyRole] = useState<CompanyRole | null>(null);
  const [actorGlobalRole, setActorGlobalRole] = useState<GlobalRole | null>(null);

  const [availableMembers, setAvailableMembers] = useState<
    { userId: string; email: string; role: string }[]
  >([]);
  const [newMemberRole, setNewMemberRole] = useState<"MANAGER" | "VIEWER">("MANAGER");
  const [bulkInternalSelection, setBulkInternalSelection] = useState<string[]>([]);
  const [bulkInternalSaving, setBulkInternalSaving] = useState(false);
  const [bulkInternalMessage, setBulkInternalMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteProjectRole, setInviteProjectRole] = useState<"MANAGER" | "VIEWER">("MANAGER");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  // Controls which admin action panel (if any) is visible under Participants.
  const [participantAdminMode, setParticipantAdminMode] = useState<
    "none" | "internal" | "invite"
  >("none");

  const [availableTags, setAvailableTags] = useState<SimpleTag[]>([]);
  const [projectTags, setProjectTags] = useState<TagAssignmentDto[]>([]);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");

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
  const [operationPercent, setOperationPercent] = useState<string>("0");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const [selectionSummary, setSelectionSummary] = useState<{
    itemCount: number;
    totalAmount: number;
    completedAmount: number;
    percentComplete: number;
  } | null>(null);

  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);

  // Payroll roster (who has been paid on this project, including subs/1099s)
  const [payrollEmployees, setPayrollEmployees] = useState<ProjectEmployee[] | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);

  // Actor identity + project-level roles (for header display)
  const [actorDisplayName, setActorDisplayName] = useState<string | null>(null);
  const [actorProjectRoles, setActorProjectRoles] = useState<string[] | null>(null);

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [dailyLogsLoading, setDailyLogsLoading] = useState(false);
  const [dailyLogSaving, setDailyLogSaving] = useState(false);
  const [dailyLogMessage, setDailyLogMessage] = useState<string | null>(null);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [showPendingClientOnly, setShowPendingClientOnly] = useState(false);
  // When launched from PETL, capture context for a new PUDL
  const [pudlContext, setPudlContext] = useState<{
    open: boolean;
    buildingId: string | null;
    unitId: string | null;
    roomParticleId: string | null;
    sowItemId: string | null;
    breadcrumb: string | null;
  }>({ open: false, buildingId: null, unitId: null, roomParticleId: null, sowItemId: null, breadcrumb: null });

  const [roomComponentsPanel, setRoomComponentsPanel] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    roomName: string;
    components: RoomComponentAgg[];
  }>({ open: false, loading: false, error: null, roomName: "", components: [] });

  const [importRoomBuckets, setImportRoomBuckets] = useState<ImportRoomBucket[] | null>(null);
  const [importRoomBucketsLoading, setImportRoomBucketsLoading] = useState(false);
  const [importRoomBucketsError, setImportRoomBucketsError] = useState<string | null>(null);
  const [importRoomBucketsSelection, setImportRoomBucketsSelection] = useState<Set<string>>(
    () => new Set(),
  );
  const [assignTargetType, setAssignTargetType] = useState<"existing" | "new">("existing");
  const [assignExistingUnitId, setAssignExistingUnitId] = useState<string>("");
  const [assignNewUnitLabel, setAssignNewUnitLabel] = useState<string>("");
  const [assignNewUnitFloor, setAssignNewUnitFloor] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [expandedImportBucketKeys, setExpandedImportBucketKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedImportUnitKeys, setExpandedImportUnitKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [importRoomBucketLines, setImportRoomBucketLines] = useState<
    Record<
      string,
      {
        loading: boolean;
        error: string | null;
        rows: ImportRoomLine[];
      }
    >
  >({});

  const toggleImportUnitExpanded = (unitKey: string) => {
    setExpandedImportUnitKeys(prev => {
      const next = new Set(prev);
      if (next.has(unitKey)) next.delete(unitKey);
      else next.add(unitKey);
      return next;
    });
  };

  const importRoomBucketsByUnit = useMemo(() => {
    if (!importRoomBuckets) return [];

    const map = new Map<
      string,
      {
        unitKey: string;
        unitId: string | null;
        unitLabel: string;
        buckets: ImportRoomBucket[];
        lineCount: number;
        totalAmount: number;
      }
    >();

    for (const b of importRoomBuckets) {
      const unitKey = b.assignedUnitId ?? "unassigned";
      const unitLabel = b.assignedUnitLabel ?? "Unassigned";
      const existing = map.get(unitKey);
      if (!existing) {
        map.set(unitKey, {
          unitKey,
          unitId: b.assignedUnitId,
          unitLabel,
          buckets: [b],
          lineCount: b.lineCount ?? 0,
          totalAmount: b.totalAmount ?? 0,
        });
      } else {
        existing.buckets.push(b);
        existing.lineCount += b.lineCount ?? 0;
        existing.totalAmount += b.totalAmount ?? 0;
      }
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (a.unitKey === "unassigned" && b.unitKey !== "unassigned") return -1;
      if (b.unitKey === "unassigned" && a.unitKey !== "unassigned") return 1;
      return a.unitLabel.localeCompare(b.unitLabel);
    });

    return arr;
  }, [importRoomBuckets]);

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

  // Default Time Accounting link to "today" for this project
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Reveal PID only after user clicks the project name in the header
  const [showPid, setShowPid] = useState(false);


  // Project header edit state
  const [editProjectMode, setEditProjectMode] = useState(false);
  const [editProject, setEditProject] = useState<
    | null
    | {
        name: string;
        status: string;
        addressLine1: string;
        addressLine2: string | null;
        city: string;
        state: string;
      }
  >(null);
  const [editProjectSaving, setEditProjectSaving] = useState(false);
  const [editProjectMessage, setEditProjectMessage] = useState<string | null>(null);
  const [deleteProjectMessage, setDeleteProjectMessage] = useState<string | null>(null);
  const [editProjectState, setEditProjectState] = useState<ProjectStateChoice>("OPEN");

  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (!tab) return;
    if (
      tab === "SUMMARY" ||
      tab === "PETL" ||
      tab === "STRUCTURE" ||
      tab === "DAILY_LOGS" ||
      tab === "FILES" ||
      tab === "FINANCIAL"
    ) {
      setActiveTab(tab as TabKey);
    } else if (tab.toUpperCase() === "PETL") {
      setActiveTab("PETL");
    }
  }, [searchParams]);

  const overallSummary = useMemo(() => {
    if (!petlItems.length) return null;
    let count = 0;
    let total = 0;
    let completed = 0;
    for (const item of petlItems) {
      const amt = item.rcvAmount ?? item.itemAmount ?? 0;
      const basePct = item.percentComplete ?? 0;
      const pct = item.isAcvOnly ? 0 : basePct;
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

  const toggleImportBucketExpanded = async (bucket: ImportRoomBucket) => {
    const key = `${bucket.groupCode ?? ""}::${bucket.groupDescription ?? ""}`;
    setExpandedImportBucketKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

    // If we don't have rows loaded for this bucket yet, fetch them.
    if (!importRoomBucketLines[key]) {
      const token = typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
      if (!token) {
        setImportRoomBucketLines(prev => ({
          ...prev,
          [key]: {
            loading: false,
            error: "Missing access token. Please login again.",
            rows: [],
          },
        }));
        return;
      }

      setImportRoomBucketLines(prev => ({
        ...prev,
        [key]: { loading: true, error: null, rows: [] },
      }));

      try {
        const params = new URLSearchParams();
        if (bucket.groupCode != null) params.set("groupCode", bucket.groupCode);
        if (bucket.groupDescription != null) {
          params.set("groupDescription", bucket.groupDescription);
        }
        const res = await fetch(
          `${API_BASE}/projects/${id}/import-structure/room-lines?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setImportRoomBucketLines(prev => ({
            ...prev,
            [key]: {
              loading: false,
              error: `Failed to load lines (${res.status}) ${text}`,
              rows: [],
            },
          }));
          return;
        }
        const json: any = await res.json();
        const rows: ImportRoomLine[] = Array.isArray(json.rows) ? json.rows : [];
        setImportRoomBucketLines(prev => ({
          ...prev,
          [key]: { loading: false, error: null, rows },
        }));
      } catch (err: any) {
        setImportRoomBucketLines(prev => ({
          ...prev,
          [key]: {
            loading: false,
            error: err?.message ?? "Failed to load lines",
            rows: [],
          },
        }));
      }
    }
  };

  // Initial load: just project + estimate summary for a fast first paint
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadInitial() {
      try {
        const res = await fetch(`${API_BASE}/projects/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load project (${res.status})`);
        }
        const found: Project = await res.json();
        if (cancelled) return;
        setProject(found);

        // Lightweight estimate summary (item count + total amount)
        try {
          const summaryRes = await fetch(`${API_BASE}/projects/${id}/estimate-summary`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (summaryRes.ok) {
            const summary: any = await summaryRes.json();
            if (cancelled) return;
            setPetlItemCount(typeof summary.itemCount === "number" ? summary.itemCount : null);
            setPetlTotalAmount(
              typeof summary.totalAmount === "number" ? summary.totalAmount : null,
            );
            setComponentsCount(
              typeof summary.componentsCount === "number" ? summary.componentsCount : null,
            );
          }
        } catch {
          // Ignore summary errors in this lightweight view
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Unknown error");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Load PETL-related data when project is available and user views PETL/STRUCTURE
  useEffect(() => {
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    if (activeTab !== "PETL" && activeTab !== "STRUCTURE" && activeTab !== "SUMMARY") {
      // SUMMARY also benefits from PETL data for overall/selection summaries
      return;
    }

    let cancelled = false;

    const loadPetl = async () => {
      try {
        setPetlLoading(true);
        const [petlRes, groupsRes] = await Promise.all([
          fetch(`${API_BASE}/projects/${project.id}/petl`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/projects/${project.id}/petl-groups`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!cancelled && petlRes.ok) {
          const petl: any = await petlRes.json();
          const items: PetlItem[] = Array.isArray(petl.items) ? petl.items : [];
          setPetlItems(items);
        }

        if (!cancelled && groupsRes.ok) {
          const json: any = await groupsRes.json();
          setGroups(Array.isArray(json.groups) ? json.groups : []);
        }
      } finally {
        if (!cancelled) setPetlLoading(false);
      }
    };

    void loadPetl();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab]);

  // Load hierarchy lazily when STRUCTURE tab is opened
  useEffect(() => {
    if (!project) return;
    if (activeTab !== "STRUCTURE") return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    const loadHierarchy = async () => {
      try {
        const hRes = await fetch(`${API_BASE}/projects/${project.id}/hierarchy`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && hRes.ok) {
          const json: any = await hRes.json();
          setHierarchy(json);
        }
      } catch {
        // optional
      }
    };

    void loadHierarchy();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab]);

  // Load import structuring room buckets when STRUCTURE tab is opened
  useEffect(() => {
    if (!project) return;
    if (activeTab !== "STRUCTURE") return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    const loadBuckets = async () => {
      try {
        setImportRoomBucketsLoading(true);
        setImportRoomBucketsSelection(new Set());
        const bucketsRes = await fetch(
          `${API_BASE}/projects/${project.id}/import-structure/room-buckets`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (cancelled) return;
        if (bucketsRes.ok) {
          const json: any = await bucketsRes.json();
          setImportRoomBuckets(Array.isArray(json.buckets) ? json.buckets : []);
        } else if (bucketsRes.status === 404) {
          setImportRoomBuckets([]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setImportRoomBucketsError(
            err?.message ?? "Unable to load import structuring buckets.",
          );
        }
      } finally {
        if (!cancelled) setImportRoomBucketsLoading(false);
      }
    };

    void loadBuckets();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab]);

  // Load organization-related metadata (company members, tags, participants, actor roles) when SUMMARY tab is active
  useEffect(() => {
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    if (activeTab !== "SUMMARY") return;

    let cancelled = false;

    const loadMeta = async () => {
      try {
        const [companyRes, meRes, tagRes, projTagsRes, partsRes] = await Promise.all([
          fetch(`${API_BASE}/companies/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/tags?entityType=project`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/tags/projects/${project.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/projects/${project.id}/participants`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        let myUserId: string | null = null;

        if (!cancelled && meRes.ok) {
          const meJson: any = await meRes.json();
          const globalRole: GlobalRole = meJson.globalRole ?? "NONE";
          setActorGlobalRole(globalRole);

          myUserId = meJson.id ?? null;
          const fullNameParts = [meJson.firstName, meJson.lastName].filter(Boolean);
          const fullName = fullNameParts.length ? fullNameParts.join(" ") : null;
          const displayName = fullName ? `${fullName} (${meJson.email})` : meJson.email;
          setActorDisplayName(displayName || null);

          const storedCompanyId =
            typeof window !== "undefined"
              ? window.localStorage.getItem("companyId")
              : null;
          let effectiveCompanyId = storedCompanyId;
          if (!effectiveCompanyId && Array.isArray(meJson.memberships) && meJson.memberships[0]) {
            effectiveCompanyId = meJson.memberships[0].companyId;
          }
          if (effectiveCompanyId) {
            setCurrentCompanyId(effectiveCompanyId);
            const membership = meJson.memberships?.find(
              (m: any) => m.companyId === effectiveCompanyId,
            );
            if (membership) {
              setActorCompanyRole(membership.role as CompanyRole);
            }
          }
        }

        if (!cancelled && companyRes.ok) {
          const companyJson: any = await companyRes.json();
          if (!currentCompanyId && companyJson?.id) {
            setCurrentCompanyId(companyJson.id);
          }
          const members: any[] = companyJson?.memberships ?? [];
          setAvailableMembers(
            members.map((m) => ({
              userId: m.userId,
              email: m.user?.email ?? "(user)",
              role: m.role,
            })),
          );
        }

        if (!cancelled && tagRes.ok) {
          const tagsJson: any[] = await tagRes.json();
          setAvailableTags(
            (tagsJson || []).map((t) => ({
              id: t.id,
              code: t.code,
              label: t.label,
              color: t.color ?? null,
            })),
          );
        }

        if (!cancelled && projTagsRes.ok) {
          const projTagsJson: TagAssignmentDto[] = await projTagsRes.json();
          setProjectTags(projTagsJson || []);
        }

        if (!cancelled && partsRes.ok) {
          const json: any = await partsRes.json();
          setParticipants({
            myOrganization: json.myOrganization ?? [],
            collaborators: json.collaborators ?? [],
          });

          if (myUserId) {
            const mine: Participant[] = (json.myOrganization ?? []).filter(
              (p: Participant) => p.userId === myUserId,
            );
            const roles = Array.from(new Set(mine.map(p => p.role).filter(Boolean)));
            setActorProjectRoles(roles.length ? roles : null);
          }
        }
      } catch {
        // optional; safe to ignore for now
      }
    };

    void loadMeta();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab]);

  // Load daily logs only when DAILY_LOGS tab is active
  useEffect(() => {
    if (!project) return;
    if (activeTab !== "DAILY_LOGS") return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    const loadLogs = async () => {
      try {
        setDailyLogsLoading(true);
        const logsRes = await fetch(`${API_BASE}/projects/${project.id}/daily-logs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && logsRes.ok) {
          const json: any = await logsRes.json();
          const logs: DailyLog[] = Array.isArray(json) ? json : json.items ?? [];
          setDailyLogs(logs);
        }
      } catch {
        // leave logs empty on error
      } finally {
        if (!cancelled) setDailyLogsLoading(false);
      }
    };

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab]);

  // Initial selection summary (no filters) once PETL items are present
  useEffect(() => {
    if (!project) return;
    if (!petlItems.length) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    const loadInitialSelection = async () => {
      try {
        const selRes = await fetch(
          `${API_BASE}/projects/${project.id}/petl-selection-summary`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!cancelled && selRes.ok) {
          const json: any = await selRes.json();
          setSelectionSummary({
            itemCount: json.itemCount ?? 0,
            totalAmount: json.totalAmount ?? 0,
            completedAmount: json.completedAmount ?? 0,
            percentComplete: json.percentComplete ?? 0,
          });
        }
      } catch {
        // ignore, summary is optional
      }
    };

    void loadInitialSelection();

    return () => {
      cancelled = true;
    };
  }, [project, petlItems]);

  // Refresh selection summary whenever filters change
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;

    const params = new URLSearchParams();
    if (roomFilter) params.append("roomParticleId", roomFilter);
    if (categoryFilter) params.append("categoryCode", categoryFilter);
    if (selectionFilter) params.append("selectionCode", selectionFilter);

    // If any filters are active, ask the server for an authoritative rollup.
    if (roomFilter || categoryFilter || selectionFilter) {
      fetch(
        `${API_BASE}/projects/${project.id}/petl-selection-summary?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
        .then(res => (res.ok ? res.json() : null))
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
      return;
    }

    // No server-side filters; recompute from local items
    if (petlItems.length === 0) {
      setSelectionSummary(null);
      return;
    }

    let count = 0;
    let total = 0;
    let completed = 0;
    for (const item of petlItems) {
      const amt = item.rcvAmount ?? item.itemAmount ?? 0;
      const basePct = item.percentComplete ?? 0;
      const pct = item.isAcvOnly ? 0 : basePct;
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
  }, [project, roomFilter, categoryFilter, selectionFilter, petlItems]);

  // Lazy-load financial summary only when Financial tab is opened
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;
    if (activeTab !== "FINANCIAL") return;
    // Only load once per project/tab while there is no summary yet
    if (financialSummary) return;

    let cancelled = false;

    setFinancialLoading(true);
    setFinancialError(null);

    fetch(`${API_BASE}/projects/${project.id}/financial-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: any) => {
        if (cancelled) return;
        setFinancialSummary({
          totalRcvClaim: json.totalRcvClaim ?? 0,
          totalAcvClaim: json.totalAcvClaim ?? 0,
          workCompleteRcv: json.workCompleteRcv ?? 0,
          acvReturn: json.acvReturn ?? 0,
          opRate: json.opRate ?? 0,
          acvOP: json.acvOP ?? 0,
          totalDueWorkBillable: json.totalDueWorkBillable ?? 0,
          depositRate: json.depositRate ?? 0.5,
          depositBaseline: json.depositBaseline ?? 0,
          billedToDate: json.billedToDate ?? 0,
          duePayable: json.duePayable ?? 0,
          dueAmount: json.dueAmount ?? 0,
          snapshotComputedAt: json.snapshotComputedAt ?? null,
          snapshotSource: json.snapshotSource ?? "none",
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setFinancialError(err?.message ?? "Failed to load financial summary.");
      })
      .finally(() => {
        if (cancelled) return;
        setFinancialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, project, financialSummary]);

  // Lazy-load payroll roster when Financial tab is opened (first time).
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;
    if (activeTab !== "FINANCIAL") return;
    if (payrollEmployees) return;

    let cancelled = false;
    setPayrollLoading(true);
    setPayrollError(null);

    fetch(`${API_BASE}/projects/${project.id}/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: any) => {
        if (cancelled) return;
        const rows: ProjectEmployee[] = Array.isArray(json)
          ? json
          : [];
        setPayrollEmployees(rows);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setPayrollError(err?.message ?? "Failed to load payroll roster.");
      })
      .finally(() => {
        if (cancelled) return;
        setPayrollLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, project, payrollEmployees]);

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

  const openRoomComponentsPanel = async (roomId: string | null, roomName: string) => {
    if (!roomId) return;
    setRoomFilter(roomId);
    setRoomComponentsPanel({
      open: true,
      loading: true,
      error: null,
      roomName,
      components: [],
    });

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setRoomComponentsPanel(prev => ({
        ...prev,
        loading: false,
        error: "Missing access token. Please login again.",
      }));
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("roomParticleId", roomId);
      if (categoryFilter) params.set("categoryCode", categoryFilter);
      if (selectionFilter) params.set("selectionCode", selectionFilter);

      const res = await fetch(
        `${API_BASE}/projects/${id}/petl-components?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setRoomComponentsPanel(prev => ({
          ...prev,
          loading: false,
          error: `Failed to load components (${res.status}) ${text}`,
        }));
        return;
      }
      const json: any = await res.json();
      const items: RoomComponentAgg[] = Array.isArray(json.components)
        ? json.components
        : [];
      setRoomComponentsPanel(prev => ({
        ...prev,
        loading: false,
        components: items,
      }));
    } catch (err: any) {
      setRoomComponentsPanel(prev => ({
        ...prev,
        loading: false,
        error: err?.message ?? "Failed to load components",
      }));
    }
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

      const body: any = {
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

      // Attach PETL context if present (PUDL scenario)
      if (newDailyLog.buildingId) body.buildingId = newDailyLog.buildingId;
      if (newDailyLog.unitId) body.unitId = newDailyLog.unitId;
      if (newDailyLog.roomParticleId) body.roomParticleId = newDailyLog.roomParticleId;
      if (newDailyLog.sowItemId) body.sowItemId = newDailyLog.sowItemId;

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
        buildingId: undefined,
        unitId: undefined,
        roomParticleId: undefined,
        sowItemId: undefined,
      }));

      setPudlContext({
        open: false,
        buildingId: null,
        unitId: null,
        roomParticleId: null,
        sowItemId: null,
        breadcrumb: null,
      });

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

  const canEditProjectHeader =
    actorGlobalRole === "SUPER_ADMIN" ||
    actorCompanyRole === "OWNER" ||
    actorCompanyRole === "ADMIN";

  // Precompute a formatted project address and a Google Maps link for click-to-open behavior
  const projectAddressParts: string[] = [];
  if (project.addressLine1) projectAddressParts.push(project.addressLine1);
  if (project.addressLine2) projectAddressParts.push(project.addressLine2);
  const cityState = [project.city, project.state].filter(Boolean).join(", ");
  if (cityState) projectAddressParts.push(cityState);
  const projectAddress = projectAddressParts.join(", ");
  const projectMapsUrl = projectAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectAddress)}`
    : null;

  const beginEditProject = () => {
    if (!project) return;
    setEditProjectMessage(null);
    setDeleteProjectMessage(null);
    setEditProject({
      name: project.name,
      status: project.status,
      addressLine1: project.addressLine1,
      addressLine2: project.addressLine2 ?? null,
      city: project.city,
      state: project.state,
    });

    const s = (project.status || "").toLowerCase();
    if (s === "archived") setEditProjectState("ARCHIVED");
    else if (s === "deleted") setEditProjectState("DELETED");
    else if (s === "warranty") setEditProjectState("WARRANTY");
    else setEditProjectState("OPEN");

    setEditProjectMode(true);
  };

  const cancelEditProject = () => {
    setEditProjectMode(false);
    setEditProjectMessage(null);
    setDeleteProjectMessage(null);
  };

  const saveEditProject = async () => {
    if (!project) return;
    if (!editProject) return;
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setEditProjectMessage("Missing access token. Please login again.");
      return;
    }
    setEditProjectSaving(true);
    setEditProjectMessage(null);
    setDeleteProjectMessage(null);
    try {
      // Map the chosen state to a canonical status string
      let nextStatus = editProject.status || project.status || "open";
      const state = editProjectState;
      if (state === "ARCHIVED") nextStatus = "archived";
      else if (state === "DELETED") nextStatus = "deleted";
      else if (state === "WARRANTY") nextStatus = "warranty";
      else if (state === "OPEN") nextStatus = "open";

      const body: any = {
        name: editProject.name,
        status: nextStatus,
        addressLine1: editProject.addressLine1,
        addressLine2: editProject.addressLine2,
        city: editProject.city,
        state: editProject.state,
      };
      const res = await fetch(`${API_BASE}/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setEditProjectMessage(`Failed to save project (${res.status}).`);
        return;
      }
      const updated = (await res.json()) as Project;
      setProject(updated);
      setEditProjectMode(false);
      setEditProjectMessage("Project updated.");
    } catch (err: any) {
      setEditProjectMessage(err?.message ?? "Error saving project.");
    } finally {
      setEditProjectSaving(false);
    }
  };

  // No separate deactivate/delete functions anymore; state is controlled via
  // the Project state toggle + status field and saved in saveEditProject.

  return (
    <div className="app-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div>
          {!editProjectMode && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowPid(true)}
                  style={{
                    margin: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    fontSize: 20,
                    fontWeight: 600,
                    color: "#111827",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {project.name}
                </button>
                {showPid && (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    PID: {project.id}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                Status: {project.status}
              </p>
              {actorDisplayName && (
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  You are logged in as {actorDisplayName}
                  {actorProjectRoles && actorProjectRoles.length > 0 && (
                    <>
                      {" "}· Project role(s): {actorProjectRoles.join(", ")}
                    </>
                  )}
                </p>
              )}
              <p style={{ fontSize: 13, marginTop: 8 }}>
                {projectMapsUrl && projectAddress ? (
                  <a
                    href={projectMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb", textDecoration: "none" }}
                  >
                    {projectAddress}
                  </a>
                ) : (
                  <>
                    {project.addressLine1}
                    {project.addressLine2 ? `, ${project.addressLine2}` : ""}
                    <br />
                    {project.city}, {project.state}
                  </>
                )}
              </p>
            </>
          )}

          {editProjectMode && editProject && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                  Job name
                </label>
                <input
                  value={editProject.name}
                  onChange={e =>
                    setEditProject(prev =>
                      prev ? { ...prev, name: e.target.value } : prev,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                  Status
                </label>
                <input
                  value={editProject.status}
                  onChange={e =>
                    setEditProject(prev =>
                      prev ? { ...prev, status: e.target.value } : prev,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                  <label
                    style={{ display: "block", fontSize: 12, fontWeight: 600 }}
                  >
                    Address line 1
                  </label>
                  <input
                    value={editProject.addressLine1}
                    onChange={e =>
                      setEditProject(prev =>
                        prev
                          ? { ...prev, addressLine1: e.target.value }
                          : prev,
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div style={{ flex: "1 1 180px", minWidth: 180 }}>
                  <label
                    style={{ display: "block", fontSize: 12, fontWeight: 600 }}
                  >
                    Address line 2
                  </label>
                  <input
                    value={editProject.addressLine2 ?? ""}
                    onChange={e =>
                      setEditProject(prev =>
                        prev
                          ? { ...prev, addressLine2: e.target.value || null }
                          : prev,
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 160px", minWidth: 140 }}>
                  <label
                    style={{ display: "block", fontSize: 12, fontWeight: 600 }}
                  >
                    City
                  </label>
                  <input
                    value={editProject.city}
                    onChange={e =>
                      setEditProject(prev =>
                        prev ? { ...prev, city: e.target.value } : prev,
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 80px" }}>
                  <label
                    style={{ display: "block", fontSize: 12, fontWeight: 600 }}
                  >
                    State
                  </label>
                  <input
                    value={editProject.state}
                    onChange={e =>
                      setEditProject(prev =>
                        prev ? { ...prev, state: e.target.value } : prev,
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              {/* Project state toggle (Open / Archived / Deleted / Warranty) */}
              <div style={{ marginTop: 8 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                  Project state
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  {(
                    [
                      { key: "OPEN", label: "Open" },
                      { key: "ARCHIVED", label: "Archived" },
                      { key: "DELETED", label: "Deleted" },
                      { key: "WARRANTY", label: "Warranty" },
                    ] as { key: ProjectStateChoice; label: string }[]
                  ).map(option => {
                    const isSelected = editProjectState === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setEditProjectState(option.key)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          border: isSelected
                            ? "1px solid #0f172a"
                            : "1px solid #d1d5db",
                          backgroundColor: isSelected ? "#0f172a" : "#ffffff",
                          color: isSelected ? "#f9fafb" : "#374151",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                  This state is saved directly on the project (status field) and used
                  for filtering in the projects list.
                </p>
              </div>
            </div>
          )}
        </div>

        {canEditProjectHeader && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            {!editProjectMode && (
              <button
                type="button"
                onClick={beginEditProject}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Edit project
              </button>
            )}
            {editProjectMode && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={saveEditProject}
                  disabled={editProjectSaving}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #0f172a",
                    background: editProjectSaving ? "#e5e7eb" : "#0f172a",
                    color: editProjectSaving ? "#4b5563" : "#f9fafb",
                    fontSize: 12,
                    cursor: editProjectSaving ? "default" : "pointer",
                  }}
                >
                  {editProjectSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditProject}
                  disabled={editProjectSaving}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    color: "#374151",
                    fontSize: 12,
                    cursor: editProjectSaving ? "default" : "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            {editProjectMessage && (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: editProjectMessage.toLowerCase().includes("fail")
                    ? "#b91c1c"
                    : "#16a34a",
                }}
              >
                {editProjectMessage}
              </p>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
        Created: {new Date(project.createdAt).toLocaleString()}
      </p>

      {petlItemCount !== null && (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
          Latest estimate: {petlItemCount} items,
          {" "}
          {petlTotalAmount !== null
            ? `$${petlTotalAmount.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`
            : "total N/A"}
        </p>
      )}

      {/* Baseline reminder / components reminder */}
      {petlItemCount === 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #0f172a",
            background: "#fef9c3",
            fontSize: 12,
            color: "#0f172a",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Xactimate baseline not imported yet
          </div>
          <p style={{ margin: 0, marginBottom: 8 }}>
            This project doesn&apos;t yet have an estimate baseline. Upload your
            Xactimate CSV exports so Nexus can build the PETL and progress
            tracking.
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = `/projects/import?projectId=${project.id}`;
              }
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              backgroundColor: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Import Xactimate CSVs for this project
          </button>
        </div>
      )}

      {petlItemCount !== null && petlItemCount > 0 && componentsCount === 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 6,
            border: "1px solid #0f172a",
            background: "#fef9c3",
            fontSize: 11,
            color: "#0f172a",
          }}
        >
          <span style={{ fontWeight: 600 }}>Heads up:</span> line items are
          imported, but components CSV hasn&apos;t been imported yet. When you&apos;re
          ready, upload the components CSV from the Import screen so we can
          break each task into detailed materials, labor, and equipment.
        </div>
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
            { key: "STRUCTURE", label: "Project Organization" },
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
                    maximumFractionDigits: 2,
                  })}
                </>
              )}
            </div>
          )}

          {selectionSummary && (
            <div>
              {roomFilter || categoryFilter || selectionFilter
                ? "Current selection: "
                : "Current selection (all items): "}
              {selectionSummary.percentComplete.toFixed(2)}%
              {selectionSummary.totalAmount > 0 && (
                <>
                  {" "}of $
                  {selectionSummary.totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
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
                  <strong>Address:</strong>{" "}
                  {projectMapsUrl && projectAddress ? (
                    <a
                      href={projectMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {projectAddress}
                    </a>
                  ) : (
                    projectAddress || "N/A"
                  )}
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
                      <span
                        key={tag.id}
                        style={{
                          borderRadius: 999,
                          border: isSelected
                            ? "1px solid #2563eb"
                            : "1px solid #d1d5db",
                          backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                          color: "#111827",
                          padding: "2px 10px",
                          fontSize: 12,
                        }}
                      >
                        {tag.label}
                      </span>
                    );
                  })}
                </div>
              )}
              {tagsSaving && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                  Saving tags…
                </div>
              )}
              {(actorCompanyRole === "OWNER" || actorCompanyRole === "ADMIN") && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowTagManager(true)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Manage tags (PM+)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tag manager overlay for PM+ */}
          {showTagManager && (actorCompanyRole === "OWNER" || actorCompanyRole === "ADMIN") && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 40,
              }}
            >
              <div
                style={{
                  width: 360,
                  maxWidth: "90vw",
                  background: "#ffffff",
                  borderRadius: 8,
                  boxShadow: "0 10px 25px rgba(15,23,42,0.35)",
                  border: "1px solid #e5e7eb",
                  padding: 12,
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Manage job tags</div>
                  <button
                    type="button"
                    onClick={() => setShowTagManager(false)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ marginBottom: 4 }}>Attach existing tags</div>
                  {availableTags.length === 0 ? (
                    <div style={{ color: "#6b7280" }}>No tags defined for this company yet.</div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        padding: 4,
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        maxHeight: 180,
                        overflowY: "auto",
                      }}
                    >
                      {availableTags.map(tag => {
                        const isSelected = projectTags.some(t => t.tagId === tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            disabled={tagsSaving}
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
                                } else if (res.status === 403) {
                                  alert("You do not have permission to edit tags for this project.");
                                  setShowTagManager(false);
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
                              cursor: tagsSaving ? "default" : "pointer",
                            }}
                          >
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* New tag */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 4 }}>New tag label</div>
                  <input
                    value={newTagLabel}
                    onChange={e => setNewTagLabel(e.target.value)}
                    placeholder="e.g. Group: Fortified Structures"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="button"
                    disabled={tagsSaving || !newTagLabel.trim()}
                    onClick={async () => {
                      const label = newTagLabel.trim();
                      if (!label) return;
                      const token = localStorage.getItem("accessToken");
                      if (!token) {
                        alert("Missing access token; please log in again.");
                        return;
                      }
                      setTagsSaving(true);
                      try {
                        const res = await fetch(`${API_BASE}/tags/projects/${id}/create`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ label }),
                        });
                        if (!res.ok) {
                          const text = await res.text().catch(() => "");
                          alert(
                            `Failed to create tag (${res.status}). ${text || "Check your permissions."}`,
                          );
                          if (res.status === 403) {
                            setShowTagManager(false);
                          }
                          return;
                        }
                        const created: { id: string; code: string; label: string; color: string | null } =
                          await res.json();
                        // Refresh available tags list and mark it selected for this project
                        const newAvailable = [
                          ...availableTags,
                          {
                            id: created.id,
                            code: created.code,
                            label: created.label,
                            color: created.color,
                          },
                        ];
                        setAvailableTags(newAvailable);

                        const resAssign = await fetch(`${API_BASE}/tags/projects/${id}`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ tagIds: [...projectTags.map(t => t.tagId), created.id] }),
                        });
                        if (resAssign.ok) {
                          const updated: TagAssignmentDto[] = await resAssign.json();
                          setProjectTags(updated || []);
                          setNewTagLabel("");
                        }
                      } finally {
                        setTagsSaving(false);
                      }
                    }}
                    style={{
                      marginTop: 6,
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      background: tagsSaving ? "#e5e7eb" : "#0f172a",
                      color: tagsSaving ? "#4b5563" : "#f9fafb",
                      fontSize: 12,
                      cursor: tagsSaving ? "default" : "pointer",
                    }}
                  >
                    {tagsSaving ? "Saving…" : "Create & attach"}
                  </button>
                  <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    PMs/Owners/Admins can create project tags here. Codes are derived
                    automatically from labels.
                  </p>
                </div>

                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowTagManager(false)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

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
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 8,
              }}
            >
              <span>Participants</span>
              {(actorGlobalRole === "SUPER_ADMIN" ||
                actorCompanyRole === "OWNER" ||
                actorCompanyRole === "ADMIN" ||
                actorCompanyRole === "MEMBER") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={participantAdminMode}
                    onChange={e => {
                      const value = e.target.value as
                        | "none"
                        | "internal"
                        | "invite";
                      setParticipantAdminMode(value);
                    }}
                    style={{
                      marginLeft: 8,
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                      background: "#ffffff",
                    }}
                  >
                    <option value="none">Add participants…</option>
                    <option value="internal">Add Nexus user(s) from my company</option>
                    {actorGlobalRole === "SUPER_ADMIN" && (
                      <option value="invite">
                        Add new user with temp password
                      </option>
                    )}
                  </select>
                </div>
              )}
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
                    {participants.myOrganization.map((m, index) => (
                      <li key={`${m.id ?? m.userId ?? "member"}-${index}`}>
                        {m.user?.email ? (
                          <a
                            href={`mailto:${m.user.email}`}
                            style={{ color: "#2563eb", textDecoration: "none" }}
                          >
                            {m.user.email}
                          </a>
                        ) : (
                          "(user)"
                        )}
                        {m.role && (
                          <span style={{ color: "#6b7280" }}> — {m.role}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Inline add-internal-user control has been removed in favor of the bulk selector
                    below. Use the Participants header dropdown to open the multi-select panel.
                */}
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
                            {members.map((m, index) => (
                              <li key={`${m.id ?? m.userId ?? "collab"}-${index}`}>
                                {m.user?.email ? (
                                  <a
                                    href={`mailto:${m.user.email}`}
                                    style={{ color: "#2563eb", textDecoration: "none" }}
                                  >
                                    {m.user.email}
                                  </a>
                                ) : (
                                  "(user)"
                                )}
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

                {/* Placeholder: collaborator management UI (to be implemented) */}
                {(actorGlobalRole === "SUPER_ADMIN" ||
                  actorCompanyRole === "OWNER" ||
                  actorCompanyRole === "ADMIN") && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        // Placeholder only for now; real collaborator flows will be wired later.
                        alert(
                          "Collaborator management is coming soon. This will let you connect external organizations and users to this project.",
                        );
                      }}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        backgroundColor: "#f9fafb",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      + Add collaborator (coming soon)
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Admin / foreman bulk add + invite panel, driven by dropdown mode */}
            {(actorGlobalRole === "SUPER_ADMIN" ||
              actorCompanyRole === "OWNER" ||
              actorCompanyRole === "ADMIN" ||
              actorCompanyRole === "MEMBER") &&
              participantAdminMode !== "none" && (
              <div
                style={{
                  borderTop: "1px solid #e5e7eb",
                  padding: 10,
                  fontSize: 12,
                  background: "#f9fafb",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.1fr",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  {/* Bulk add existing internal users (mode: internal) */}
                  {participantAdminMode === "internal" && (
                    <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      Add existing internal users
                    </div>
                    <p style={{ marginTop: 0, marginBottom: 6, color: "#6b7280" }}>
                      Select one or more company members and add them to this project
                      with a project-level role.
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#4b5563" }}>Project role</span>
                      <select
                        value={newMemberRole}
                        onChange={e =>
                          setNewMemberRole(e.target.value as "MANAGER" | "VIEWER")
                        }
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
                    </div>
                    <div
                      style={{
                        maxHeight: 160,
                        overflow: "auto",
                        border: "1px solid #e5e7eb",
                        borderRadius: 4,
                        background: "#ffffff",
                        padding: 6,
                      }}
                    >
                      {(() => {
                        const addableMembers = availableMembers.filter(m =>
                          !participants?.myOrganization.some(p => p.userId === m.userId),
                        );
                        if (addableMembers.length === 0) {
                          return (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                              All company members are already on this project.
                            </div>
                          );
                        }
                        const allSelected =
                          addableMembers.length > 0 &&
                          addableMembers.every(m =>
                            bulkInternalSelection.includes(m.userId),
                          );
                        return (
                          <>
                            <div
                              style={{
                                marginBottom: 4,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 12,
                                  color: "#4b5563",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setBulkInternalSelection(
                                      checked
                                        ? addableMembers.map(m => m.userId)
                                        : [],
                                    );
                                  }}
                                />
                                <span>Select all</span>
                              </label>
                            </div>
                            <ul
                              style={{
                                listStyle: "none",
                                padding: 0,
                                margin: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              {addableMembers.map(m => (
                                <li key={m.userId}>
                                  <label
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={bulkInternalSelection.includes(m.userId)}
                                      onChange={e => {
                                        setBulkInternalSelection(prev => {
                                          if (e.target.checked) {
                                            return [...prev, m.userId];
                                          }
                                          return prev.filter(id => id !== m.userId);
                                        });
                                      }}
                                    />
                                    <span>{m.email}</span>
                                    {m.role && (
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: "#6b7280",
                                        }}
                                      >
                                        ({m.role})
                                      </span>
                                    )}
                                  </label>
                                </li>
                              ))}
                            </ul>
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={
                          bulkInternalSaving || bulkInternalSelection.length === 0
                        }
                        onClick={async () => {
                          setBulkInternalMessage(null);
                          if (!bulkInternalSelection.length) return;
                          const token = localStorage.getItem("accessToken");
                          if (!token) {
                            setBulkInternalMessage(
                              "Missing access token; please log in again.",
                            );
                            return;
                          }
                          try {
                            setBulkInternalSaving(true);
                            const uniqueIds = Array.from(
                              new Set(bulkInternalSelection),
                            );
                            for (const userId of uniqueIds) {
                              // eslint-disable-next-line no-await-in-loop
                              await fetch(`${API_BASE}/projects/${id}/members`, {
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
                            }
                            // Refresh participants
                            const partsRes = await fetch(
                              `${API_BASE}/projects/${id}/participants`,
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              },
                            );
                            if (partsRes.ok) {
                              const json: any = await partsRes.json();
                              setParticipants({
                                myOrganization: json.myOrganization ?? [],
                                collaborators: json.collaborators ?? [],
                              });
                            }
                            setBulkInternalMessage(
                              `Added ${bulkInternalSelection.length} user(s) to this project.`,
                            );
                            setBulkInternalSelection([]);
                          } catch (err: any) {
                            setBulkInternalMessage(
                              err?.message ?? "Failed to add internal users.",
                            );
                          } finally {
                            setBulkInternalSaving(false);
                          }
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 4,
                          border: "1px solid #0f172a",
                          backgroundColor:
                            bulkInternalSaving || bulkInternalSelection.length === 0
                              ? "#e5e7eb"
                              : "#0f172a",
                          color:
                            bulkInternalSaving || bulkInternalSelection.length === 0
                              ? "#4b5563"
                              : "#f9fafb",
                          fontSize: 12,
                          cursor:
                            bulkInternalSaving || bulkInternalSelection.length === 0
                              ? "default"
                              : "pointer",
                        }}
                      >
                        {bulkInternalSaving
                          ? "Adding…"
                          : "Add selected to project"}
                      </button>
                      {bulkInternalMessage && (
                        <span
                          style={{
                            fontSize: 11,
                            color: bulkInternalMessage.toLowerCase().includes(
                              "fail",
                            )
                              ? "#b91c1c"
                              : "#4b5563",
                            alignSelf: "center",
                          }}
                        >
                          {bulkInternalMessage}
                        </span>
                      )}
                    </div>
                  </div>
                  )}

                  {/* SUPER_ADMIN-only: invite new user with temp password (mode: invite) */}
                  {actorGlobalRole === "SUPER_ADMIN" &&
                    participantAdminMode === "invite" && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Invite new user with temporary password
                      </div>
                      <p
                        style={{
                          marginTop: 0,
                          marginBottom: 6,
                          color: "#6b7280",
                        }}
                      >
                        Creates a user, attaches them to your company as a MEMBER,
                        and adds them to this project. Share the temp password
                        with the user out-of-band.
                      </p>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <label style={{ fontSize: 12 }}>
                          <span
                            style={{ display: "block", marginBottom: 2 }}
                          >
                            Email
                          </span>
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          <span
                            style={{ display: "block", marginBottom: 2 }}
                          >
                            Temporary password
                          </span>
                          <input
                            type="password"
                            value={invitePassword}
                            onChange={e => setInvitePassword(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          <span
                            style={{ display: "block", marginBottom: 2 }}
                          >
                            Project role
                          </span>
                          <select
                            value={inviteProjectRole}
                            onChange={e =>
                              setInviteProjectRole(
                                e.target.value as "MANAGER" | "VIEWER",
                              )
                            }
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          >
                            <option value="MANAGER">Manager</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={
                            inviteSaving ||
                            !inviteEmail.trim() ||
                            !invitePassword.trim() ||
                            !currentCompanyId
                          }
                          onClick={async () => {
                            setInviteMessage(null);
                            if (!currentCompanyId) {
                              setInviteMessage("Missing company context.");
                              return;
                            }
                            const token = localStorage.getItem("accessToken");
                            if (!token) {
                              setInviteMessage(
                                "Missing access token; please log in again.",
                              );
                              return;
                            }
                            try {
                              setInviteSaving(true);
                              const createRes = await fetch(
                                `${API_BASE}/admin/create-user-with-password`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    email: inviteEmail.trim(),
                                    password: invitePassword,
                                    companyId: currentCompanyId,
                                    role: "MEMBER",
                                  }),
                                },
                              );
                              if (!createRes.ok) {
                                const text = await createRes
                                  .text()
                                  .catch(() => "");
                                setInviteMessage(
                                  `Failed to create user (${createRes.status}) ${text}`,
                                );
                                return;
                              }
                              const created: any = await createRes.json();
                              const newUserId: string | undefined =
                                created?.user?.id ?? created?.id;
                              if (!newUserId) {
                                setInviteMessage(
                                  "User was created but no user ID was returned.",
                                );
                                return;
                              }
                              const attachRes = await fetch(
                                `${API_BASE}/projects/${id}/members`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    userId: newUserId,
                                    role: inviteProjectRole,
                                  }),
                                },
                              );
                              if (!attachRes.ok) {
                                const text = await attachRes
                                  .text()
                                  .catch(() => "");
                              setInviteMessage(
                                  `User created but failed to add to project (${attachRes.status}) ${text}`,
                                );
                                return;
                              }
                              const partsRes = await fetch(
                                `${API_BASE}/projects/${id}/participants`,
                                {
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              if (partsRes.ok) {
                                const json: any = await partsRes.json();
                                setParticipants({
                                  myOrganization: json.myOrganization ?? [],
                                  collaborators: json.collaborators ?? [],
                                });
                              }
                              setInviteMessage(
                                "User created and added to this project.",
                              );
                              setInviteEmail("");
                              setInvitePassword("");
                            } catch (err: any) {
                              setInviteMessage(
                                err?.message ?? "Failed to invite user.",
                              );
                            } finally {
                              setInviteSaving(false);
                            }
                          }}
                          style={{
                            marginTop: 4,
                            padding: "6px 10px",
                            borderRadius: 4,
                            border: "1px solid #0f172a",
                            backgroundColor:
                              inviteSaving ||
                              !inviteEmail.trim() ||
                              !invitePassword.trim() ||
                              !currentCompanyId
                                ? "#e5e7eb"
                                : "#0f172a",
                            color:
                              inviteSaving ||
                              !inviteEmail.trim() ||
                              !invitePassword.trim() ||
                              !currentCompanyId
                                ? "#4b5563"
                                : "#f9fafb",
                            fontSize: 12,
                            cursor:
                              inviteSaving ||
                              !inviteEmail.trim() ||
                              !invitePassword.trim() ||
                              !currentCompanyId
                                ? "default"
                                : "pointer",
                          }}
                        >
                          {inviteSaving ? "Inviting…" : "Invite and add to project"}
                        </button>
                        {inviteMessage && (
                          <p
                            style={{
                              margin: 0,
                              marginTop: 4,
                              fontSize: 11,
                              color: inviteMessage
                                .toLowerCase()
                                .includes("fail")
                                ? "#b91c1c"
                                : "#4b5563",
                            }}
                          >
                            {inviteMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FINANCIAL tab content */}
      {activeTab === "FINANCIAL" && (
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Financial Overview</h2>
            <a
              href={`/projects/${id}/timecards/${todayIso}`}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              Open Time Accounting
            </a>
          </div>

          {financialLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading financial summary…</p>
          )}

          {financialError && !financialLoading && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{financialError}</p>
          )}

          {!financialSummary && !financialLoading && !financialError && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>
              No financial snapshot has been computed yet for this project.
            </p>
          )}

          {financialSummary && !financialError && (
            <>
              {/* Snapshot age + refresh */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  marginBottom: 4,
                  color: "#4b5563",
                }}
              >
                <span>
                  {financialSummary.snapshotComputedAt
                    ? (() => {
                        const ageMs =
                          Date.now() -
                          new Date(financialSummary.snapshotComputedAt).getTime();
                        const ageHours = ageMs / 36e5;
                        const label =
                          ageHours < 1
                            ? "under an hour old"
                            : ageHours < 24
                            ? `${ageHours.toFixed(1)} hours old`
                            : `${(ageHours / 24).toFixed(1)} days old`;
                        return `Latest financial overview is ${label}.`;
                      })()
                    : "No snapshot age available."}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!project) return;
                    const token = localStorage.getItem("accessToken");
                    if (!token) {
                      alert("Missing access token; please log in again.");
                      return;
                    }
                    setFinancialLoading(true);
                    setFinancialError(null);
                    try {
                      const res = await fetch(
                        `${API_BASE}/projects/${project.id}/financial-summary?forceRefresh=true`,
                        { headers: { Authorization: `Bearer ${token}` } },
                      );
                      if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        throw new Error(`Refresh failed (${res.status}) ${text}`);
                      }
                      const json: any = await res.json();
                      setFinancialSummary({
                        totalRcvClaim: json.totalRcvClaim ?? 0,
                        totalAcvClaim: json.totalAcvClaim ?? 0,
                        workCompleteRcv: json.workCompleteRcv ?? 0,
                        acvReturn: json.acvReturn ?? 0,
                        opRate: json.opRate ?? 0,
                        acvOP: json.acvOP ?? 0,
                        totalDueWorkBillable: json.totalDueWorkBillable ?? 0,
                        depositRate: json.depositRate ?? 0.5,
                        depositBaseline: json.depositBaseline ?? 0,
                        billedToDate: json.billedToDate ?? 0,
                        duePayable: json.duePayable ?? 0,
                        dueAmount: json.dueAmount ?? 0,
                        snapshotComputedAt: json.snapshotComputedAt ?? null,
                        snapshotSource: json.snapshotSource ?? "recomputed",
                      });
                    } catch (err: any) {
                      setFinancialError(
                        err?.message ?? "Failed to refresh financial summary.",
                      );
                    } finally {
                      setFinancialLoading(false);
                    }
                  }}
                  disabled={financialLoading}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #0f172a",
                    backgroundColor: financialLoading ? "#e5e7eb" : "#0f172a",
                    color: financialLoading ? "#4b5563" : "#f9fafb",
                    fontSize: 11,
                    cursor: financialLoading ? "default" : "pointer",
                  }}
                >
                  {financialLoading ? "Updating…" : "Update now"}
                </button>
              </div>

              {/* Summary cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                {/* Left: claim + work math */}
                <div
                  style={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Carrier / Scope Summary
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1fr",
                      rowGap: 4,
                    }}
                  >
                    <div>Total RCV Claim</div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.totalRcvClaim.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>ACV Return (credit bucket)</div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.acvReturn.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>ACV O&P ({Math.round(financialSummary.opRate * 100)}%)</div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.acvOP.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>Work Complete (RCV basis)</div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.workCompleteRcv.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 4,
                      }}
                    >
                      Total Due (Work Complete) – Billable
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 4,
                      }}
                    >
                      ${financialSummary.totalDueWorkBillable.toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 2,
                        },
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: deposit + due payable */}
                <div
                  style={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Deposits &amp; Due Amount
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1fr",
                      rowGap: 4,
                    }}
                  >
                    <div>
                      Deposit baseline ({Math.round(financialSummary.depositRate * 100)}%)
                    </div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.depositBaseline.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>Billed to date</div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.billedToDate.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 4,
                      }}
                    >
                      Due Payable (baseline deposit)
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 4,
                      }}
                    >
                      ${financialSummary.duePayable.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>Due Amount (above 50%, not yet billed)</div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.dueAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <p style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                    Rules: deposit baseline is {Math.round(financialSummary.depositRate * 100)}%
                    of Total Due. Due Amount represents anything above that baseline which
                    has not yet been billed.
                  </p>
                </div>
              </div>

              {/* Payroll & Workforce roster */}
              <div
                style={{
                  marginTop: 16,
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
                  Payroll &amp; Workforce
                </div>
                <div style={{ padding: 10, fontSize: 12 }}>
                  <p style={{ marginTop: 0, marginBottom: 8, color: "#4b5563" }}>
                    This roster shows everyone who has recorded payroll on this project
                    (including subs and 1099s), based on Certified Payroll and LCP data.
                    It does not grant them login access.
                  </p>

                  {payrollLoading && (
                    <p style={{ fontSize: 12, color: "#6b7280" }}>
                      Loading payroll roster…
                    </p>
                  )}

                  {payrollError && !payrollLoading && (
                    <p style={{ fontSize: 12, color: "#b91c1c" }}>{payrollError}</p>
                  )}

                  {!payrollLoading && !payrollError && (!payrollEmployees || payrollEmployees.length === 0) && (
                    <p style={{ fontSize: 12, color: "#6b7280" }}>
                      No payroll records found yet for this project.
                    </p>
                  )}

                  {!payrollLoading && !payrollError && payrollEmployees && payrollEmployees.length > 0 && (
                    <div style={{ maxHeight: "60vh", overflow: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f9fafb" }}>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Name</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Role / Class</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>SSN (last 4)</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Total Hours</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>First Week</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Last Week</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payrollEmployees.map((emp, idx) => {
                            const name = [emp.firstName ?? "", emp.lastName ?? ""]
                              .map(s => s.trim())
                              .filter(Boolean)
                              .join(" ") || "(Unnamed)";
                            const firstWeek = emp.firstWeekEnd
                              ? new Date(emp.firstWeekEnd).toLocaleDateString()
                              : "—";
                            const lastWeek = emp.lastWeekEnd
                              ? new Date(emp.lastWeekEnd).toLocaleDateString()
                              : "—";
                            const hasDetails = !!emp.employeeId;
                            const detailHref = hasDetails
                              ? `/projects/${project.id}/payroll/${encodeURIComponent(
                                  emp.employeeId as string,
                                )}`
                              : undefined;
                            return (
                              <tr key={`${emp.employeeId ?? "emp"}-${idx}`}>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                  }}
                                >
                                  {hasDetails ? (
                                    <a
                                      href={detailHref}
                                      style={{ color: "#2563eb", textDecoration: "none" }}
                                    >
                                      {name}
                                    </a>
                                  ) : (
                                    name
                                  )}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    color: "#4b5563",
                                  }}
                                >
                                  {emp.classCode || "—"}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    color: "#4b5563",
                                  }}
                                >
                                  {emp.ssnLast4 ? `***-**-${emp.ssnLast4}` : "—"}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    textAlign: "right",
                                  }}
                                >
                                  {emp.totalHours.toFixed(2)}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                  }}
                                >
                                  {firstWeek}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                  }}
                                >
                                  {lastWeek}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {/* IMPORT STRUCTURE tab content */}
      {activeTab === "STRUCTURE" && (
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Project Organization (Room Buckets)
          </h2>
          <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 8 }}>
            These buckets come directly from the latest Xactimate RAW import by
            combining <strong>Group Code</strong> and <strong>Group Description</strong>.
            Use this view to group buckets into Units and later Buildings.
          </p>

          {importRoomBucketsLoading && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading room buckets…</p>
          )}

          {!importRoomBucketsLoading && importRoomBucketsError && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{importRoomBucketsError}</p>
          )}

          {!importRoomBucketsLoading &&
            !importRoomBucketsError &&
            importRoomBuckets &&
            importRoomBuckets.length === 0 && (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                No RAW Xactimate imports found for this project yet.
              </p>
            )}

          {!importRoomBucketsLoading &&
            !importRoomBucketsError &&
            importRoomBuckets &&
            importRoomBuckets.length > 0 && (
              <>
                {/* Assignment controls */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "flex-end",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12 }}>
                    <div style={{ marginBottom: 4, fontWeight: 600 }}>
                      Selected buckets: {importRoomBucketsSelection.size}
                    </div>
                    <div style={{ color: "#6b7280" }}>
                      Tip: use the checkboxes to multi-select similar buckets and
                      assign them to a Unit.
                    </div>
                  </div>

                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Assign to Unit:</span>

                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="radio"
                        name="assignTargetType"
                        value="existing"
                        checked={assignTargetType === "existing"}
                        onChange={() => setAssignTargetType("existing")}
                      />
                      <span>Existing</span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="radio"
                        name="assignTargetType"
                        value="new"
                        checked={assignTargetType === "new"}
                        onChange={() => setAssignTargetType("new")}
                      />
                      <span>New</span>
                    </label>

                    {assignTargetType === "existing" && (
                      <select
                        value={assignExistingUnitId}
                        onChange={e => setAssignExistingUnitId(e.target.value)}
                        style={{
                          padding: "4px 6px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          minWidth: 160,
                        }}
                      >
                        <option value="">Select unit…</option>
                        {hierarchy && (
                          <>
                            {hierarchy.buildings.map((b: any) =>
                              (b.units || []).map((u: any) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                  {typeof u.floor === "number"
                                    ? ` (Floor ${u.floor})`
                                    : ""}
                                </option>
                              )),
                            )}
                            {hierarchy.units.map((u: any) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                                {typeof u.floor === "number" ? ` (Floor ${u.floor})` : ""}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    )}

                    {assignTargetType === "new" && (
                      <>
                        <input
                          type="text"
                          placeholder="New unit label (e.g. Unit 163 L)"
                          value={assignNewUnitLabel}
                          onChange={e => setAssignNewUnitLabel(e.target.value)}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                            minWidth: 180,
                          }}
                        />
                        <input
                          type="number"
                          placeholder="Floor"
                          value={assignNewUnitFloor}
                          onChange={e => setAssignNewUnitFloor(e.target.value)}
                          style={{
                            width: 70,
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                      </>
                    )}

                    <button
                      type="button"
                      disabled={
                        assignSubmitting ||
                        importRoomBucketsSelection.size === 0 ||
                        (assignTargetType === "existing" && !assignExistingUnitId) ||
                        (assignTargetType === "new" && !assignNewUnitLabel.trim())
                      }
                      onClick={async () => {
                        setAssignMessage(null);
                        if (importRoomBucketsSelection.size === 0) return;
                        const token = localStorage.getItem("accessToken");
                        if (!token) {
                          setAssignMessage("Missing access token. Please login again.");
                          return;
                        }

                        const selectedKeys = new Set(importRoomBucketsSelection);
                        const bucketsPayload = (importRoomBuckets || [])
                          .filter(b =>
                            selectedKeys.has(
                              `${b.groupCode ?? ""}::${b.groupDescription ?? ""}`,
                            ),
                          )
                          .map(b => ({
                            groupCode: b.groupCode,
                            groupDescription: b.groupDescription,
                          }));
                        if (bucketsPayload.length === 0) {
                          setAssignMessage("No matching buckets found for selection.");
                          return;
                        }

                        const target: any =
                          assignTargetType === "existing"
                            ? { type: "existing", unitId: assignExistingUnitId }
                            : {
                                type: "new",
                                label: assignNewUnitLabel,
                                floor:
                                  assignNewUnitFloor.trim() === ""
                                    ? null
                                    : Number(assignNewUnitFloor),
                              };

                        setAssignSubmitting(true);
                        try {
                          const res = await fetch(
                            `${API_BASE}/projects/${id}/import-structure/assign-buckets-to-unit`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({ target, buckets: bucketsPayload }),
                            },
                          );
                          if (!res.ok) {
                            const text = await res.text().catch(() => "");
                            setAssignMessage(
                              `Assign failed (${res.status}). ${text || ""}`,
                            );
                            return;
                          }

                          setAssignMessage("Assigned buckets to unit.");
                          setImportRoomBucketsSelection(new Set());
                          // Refresh buckets so assignedUnitLabel updates
                          try {
                            setImportRoomBucketsLoading(true);
                            const bucketsRes = await fetch(
                              `${API_BASE}/projects/${id}/import-structure/room-buckets`,
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              },
                            );
                            if (bucketsRes.ok) {
                              const json: any = await bucketsRes.json();
                              setImportRoomBuckets(
                                Array.isArray(json.buckets) ? json.buckets : [],
                              );
                            }
                          } finally {
                            setImportRoomBucketsLoading(false);
                          }
                        } catch (err: any) {
                          setAssignMessage(err?.message || "Assign failed.");
                        } finally {
                          setAssignSubmitting(false);
                        }
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #0f172a",
                        backgroundColor:
                          assignSubmitting || importRoomBucketsSelection.size === 0
                            ? "#e5e7eb"
                            : "#0f172a",
                        color:
                          assignSubmitting || importRoomBucketsSelection.size === 0
                            ? "#4b5563"
                            : "#f9fafb",
                        fontSize: 12,
                        cursor:
                          assignSubmitting || importRoomBucketsSelection.size === 0
                            ? "default"
                            : "pointer",
                      }}
                    >
                      {assignSubmitting ? "Assigning…" : "Assign selected"}
                    </button>
                  </div>
                </div>

                {assignMessage && (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 12,
                      color: assignMessage.toLowerCase().includes("fail")
                        ? "#b91c1c"
                        : "#4b5563",
                    }}
                  >
                    {assignMessage}
                  </div>
                )}

                <div style={{ maxHeight: "75vh", overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: "#f9fafb" }}>
                        <th style={{ padding: "6px 8px" }}>
                          <input
                            type="checkbox"
                            checked={
                              importRoomBucketsSelection.size > 0 &&
                              importRoomBucketsSelection.size ===
                                importRoomBuckets.length
                            }
                            onChange={e => {
                              if (!importRoomBuckets) return;
                              const checked = e.target.checked;
                              if (!checked) {
                                setImportRoomBucketsSelection(new Set());
                              } else {
                                const next = new Set<string>();
                                for (const b of importRoomBuckets) {
                                  const key = `${b.groupCode ?? ""}::${
                                    b.groupDescription ?? ""
                                  }`;
                                  next.add(key);
                                }
                                setImportRoomBucketsSelection(next);
                              }
                            }}
                          />
                        </th>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Assigned Unit</th>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Bucket</th>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Group Code</th>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>
                          Group Description
                        </th>
                        <th style={{ textAlign: "right", padding: "6px 8px" }}>Lines</th>
                        <th style={{ textAlign: "right", padding: "6px 8px" }}>Total</th>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>
                          Assigned Unit
                        </th>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>
                          Assigned Room Label
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRoomBucketsByUnit.map(unitGroup => {
                        const unitIsExpanded = expandedImportUnitKeys.has(unitGroup.unitKey);

                        const unitBucketKeys = unitGroup.buckets.map(
                          b => `${b.groupCode ?? ""}::${b.groupDescription ?? ""}`,
                        );

                        const unitAllSelected =
                          unitBucketKeys.length > 0 &&
                          unitBucketKeys.every(k => importRoomBucketsSelection.has(k));

                        return (
                          <Fragment key={`unit::${unitGroup.unitKey}`}>
                            <tr>
                              <td
                                style={{
                                  padding: "4px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  background: "#f9fafb",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={unitAllSelected}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setImportRoomBucketsSelection(prev => {
                                      const next = new Set(prev);
                                      for (const k of unitBucketKeys) {
                                        if (checked) next.add(k);
                                        else next.delete(k);
                                      }
                                      return next;
                                    });
                                  }}
                                />
                              </td>
                              <td
                                style={{
                                  padding: "4px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "#111827",
                                  whiteSpace: "nowrap",
                                  cursor: "pointer",
                                  background: "#f9fafb",
                                }}
                                onClick={() => toggleImportUnitExpanded(unitGroup.unitKey)}
                              >
                                {unitIsExpanded ? "▾" : "▸"} {unitGroup.unitLabel}
                              </td>
                              <td
                                style={{
                                  padding: "4px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  background: "#f9fafb",
                                  color: "#6b7280",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {unitGroup.buckets.length} buckets
                              </td>
                              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }} />
                              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }} />
                              <td
                                style={{
                                  padding: "4px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                  background: "#f9fafb",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {unitGroup.lineCount}
                              </td>
                              <td
                                style={{
                                  padding: "4px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                  background: "#f9fafb",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {unitGroup.totalAmount.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }} />
                              <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }} />
                            </tr>

                            {unitIsExpanded &&
                              unitGroup.buckets.map((b, idx) => {
                                const key = `${b.groupCode ?? ""}::${
                                  b.groupDescription ?? ""
                                }`;
                                const selected = importRoomBucketsSelection.has(key);
                                const isExpanded = expandedImportBucketKeys.has(key);
                                const linesEntry = importRoomBucketLines[key];

                                return (
                                  <Fragment key={`${unitGroup.unitKey}::${key}::${idx}`}>
                                    <tr>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={e => {
                                            setImportRoomBucketsSelection(prev => {
                                              const next = new Set(prev);
                                              if (e.target.checked) next.add(key);
                                              else next.delete(key);
                                              return next;
                                            });
                                          }}
                                        />
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          fontSize: 11,
                                          color: "#9ca3af",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {/* grouped under the unit row */}
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          cursor: "pointer",
                                          color: "#2563eb",
                                          whiteSpace: "nowrap",
                                        }}
                                        onClick={() => toggleImportBucketExpanded(b)}
                                      >
                                        {isExpanded ? "▾" : "▸"} Bucket
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {b.groupCode ?? ""}
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        {b.groupDescription ?? ""}
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                        }}
                                      >
                                        {b.lineCount}
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                        }}
                                      >
                                        {b.totalAmount.toLocaleString(undefined, {
                                          maximumFractionDigits: 2,
                                        })}
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          fontSize: 11,
                                          color: "#4b5563",
                                        }}
                                      >
                                        {b.assignedUnitLabel ?? "—"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "4px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          fontSize: 11,
                                          color: "#4b5563",
                                        }}
                                      >
                                        {b.assignedFullLabel ?? "—"}
                                      </td>
                                    </tr>

                                    {isExpanded && (
                                      <tr key={`${key}::${idx}::lines`}>
                                        <td colSpan={9} style={{ padding: 0, borderTop: "none" }}>
                                          <div
                                            style={{
                                              backgroundColor: "#f9fafb",
                                              padding: "4px 8px 8px 32px",
                                            }}
                                          >
                                            {!linesEntry && (
                                              <div
                                                style={{
                                                  fontSize: 12,
                                                  color: "#6b7280",
                                                }}
                                              >
                                                Loading lines…
                                              </div>
                                            )}
                                            {linesEntry && linesEntry.loading && (
                                              <div
                                                style={{
                                                  fontSize: 12,
                                                  color: "#6b7280",
                                                }}
                                              >
                                                Loading lines…
                                              </div>
                                            )}
                                            {linesEntry &&
                                              linesEntry.error &&
                                              !linesEntry.loading && (
                                                <div
                                                  style={{
                                                    fontSize: 12,
                                                    color: "#b91c1c",
                                                  }}
                                                >
                                                  {linesEntry.error}
                                                </div>
                                              )}
                                            {linesEntry &&
                                              !linesEntry.loading &&
                                              !linesEntry.error && (
                                                <table
                                                  style={{
                                                    width: "100%",
                                                    borderCollapse: "collapse",
                                                    fontSize: 11,
                                                  }}
                                                >
                                                  <thead>
                                                    <tr style={{ backgroundColor: "#e5e7eb" }}>
                                                      <th
                                                        style={{
                                                          textAlign: "left",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Line
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "left",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Description
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "right",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Qty
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "right",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Unit
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "right",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Total
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "left",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Cat
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "left",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Sel
                                                      </th>
                                                      <th
                                                        style={{
                                                          textAlign: "left",
                                                          padding: "4px 6px",
                                                        }}
                                                      >
                                                        Source
                                                      </th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {linesEntry.rows.map(line => (
                                                      <tr key={line.lineNo}>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                          }}
                                                        >
                                                          {line.lineNo}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                          }}
                                                        >
                                                          {line.desc ?? ""}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                            textAlign: "right",
                                                          }}
                                                        >
                                                          {line.qty ?? ""}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                            textAlign: "right",
                                                          }}
                                                        >
                                                          {line.unit ?? ""}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                            textAlign: "right",
                                                          }}
                                                        >
                                                          {line.itemAmount != null
                                                            ? line.itemAmount.toLocaleString(
                                                                undefined,
                                                                {
                                                                  maximumFractionDigits: 2,
                                                                },
                                                              )
                                                            : ""}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                          }}
                                                        >
                                                          {line.cat ?? ""}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                          }}
                                                        >
                                                          {line.sel ?? ""}
                                                        </td>
                                                        <td
                                                          style={{
                                                            padding: "3px 6px",
                                                            borderTop:
                                                              "1px solid #e5e7eb",
                                                            fontSize: 10,
                                                            color: "#6b7280",
                                                          }}
                                                        >
                                                          {line.sourceName ??
                                                            line.owner ??
                                                            ""}
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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

                  {pudlContext.open && pudlContext.breadcrumb && (
                    <div
                      style={{
                        marginBottom: 6,
                        padding: "6px 8px",
                        borderRadius: 4,
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        fontSize: 12,
                        color: "#1d4ed8",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>PUDL context</div>
                      <div>{pudlContext.breadcrumb}</div>
                    </div>
                  )}

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
                                <div>{log.title || ""}</div>
                                {log.roomParticle || log.unit || log.building ? (
                                  <div
                                    style={{
                                      marginTop: 2,
                                      fontSize: 11,
                                      color: "#6b7280",
                                    }}
                                  >
                                    {(() => {
                                      const parts: string[] = [];
                                      if (log.building) {
                                        parts.push(
                                          `${log.building.code || ""} ${log.building.name}`.trim(),
                                        );
                                      }
                                      if (log.unit) {
                                        const floorLabel =
                                          typeof log.unit.floor === "number"
                                            ? ` (Floor ${log.unit.floor})`
                                            : "";
                                        parts.push(`${log.unit.label}${floorLabel}`);
                                      }
                                      if (log.roomParticle) {
                                        parts.push(
                                          log.roomParticle.fullLabel || log.roomParticle.name,
                                        );
                                      }
                                      return parts.filter(Boolean).join(" · ");
                                    })()}
                                  </div>
                                ) : null}
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
                                {log.attachments && log.attachments.length > 0 ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: 4,
                                      maxWidth: 200,
                                    }}
                                  >
                                    {log.attachments.map(att => {
                                      const url = att.fileUrl;
                                      const name = att.fileName || "attachment";
                                      const lower = (url || "").toLowerCase();
                                      const isImage =
                                        lower.endsWith(".png") ||
                                        lower.endsWith(".jpg") ||
                                        lower.endsWith(".jpeg") ||
                                        lower.endsWith(".gif") ||
                                        lower.endsWith(".webp") ||
                                        (att.mimeType || "").startsWith("image/");
                                      if (!isImage) {
                                        return (
                                          <a
                                            key={att.id}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                              fontSize: 11,
                                              color: "#2563eb",
                                              textDecoration: "none",
                                            }}
                                          >
                                            {name}
                                          </a>
                                        );
                                      }
                                      return (
                                        <a
                                          key={att.id}
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          style={{
                                            display: "inline-flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            textDecoration: "none",
                                          }}
                                        >
                                          <img
                                            src={url}
                                            alt={name}
                                            style={{
                                              width: 56,
                                              height: 56,
                                              objectFit: "cover",
                                              borderRadius: 4,
                                              border: "1px solid #e5e7eb",
                                            }}
                                          />
                                          <span
                                            style={{
                                              marginTop: 2,
                                              maxWidth: 80,
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              fontSize: 10,
                                              color: "#4b5563",
                                            }}
                                          >
                                            {name}
                                          </span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  log.attachments?.length ?? 0
                                )}
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
                            const uploaded: DailyLogAttachmentDto[] = [];
                            for (const file of Array.from(files)) {
                              // Upload to GCS via shared helper
                              const link = await uploadImageFileToNexusUploads(file, "JOURNAL");
                              // Tell API to link this URL as a DailyLogAttachment
                              const resp = await fetch(
                                `${API_BASE}/daily-logs/${latest.id}/attachments/link`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    fileUrl: link.url,
                                    fileName: link.label,
                                  }),
                                },
                              );
                              if (resp.ok) {
                                const att: DailyLogAttachmentDto = await resp.json();
                                uploaded.push(att);
                              }
                            }
                            if (uploaded.length > 0) {
                              setDailyLogs(prev =>
                                prev.map(l =>
                                  l.id === latest.id
                                    ? {
                                        ...l,
                                        attachments: [...(l.attachments || []), ...uploaded],
                                      }
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
        <div>
          {/* Project hierarchy: Job (property) → Buildings / Structures → Units → Rooms */}
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
                <span>Job layout (Property → Buildings → Units → Rooms)</span>
              </button>

              {structureOpen && (
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                  <div>
                    <strong>Job / Property:</strong> {hierarchy.project.name}
                  </div>
              {hierarchy.buildings.length > 0 && (
                <ul style={{ marginTop: 4, marginLeft: 16 }}>
                  {hierarchy.buildings.map((b: any) => (
                    <li key={b.id}>
                      <span>
                        <strong>Building / Structure:</strong> {b.code || ""} {b.name}
                      </span>
                      {b.units?.length > 0 && (
                        <ul style={{ marginTop: 2, marginLeft: 14 }}>
                          {b.units.map((u: any) => (
                            <li key={u.id}>
                              <span>
                                <strong>Unit (e.g. apartment / house):</strong> {u.label}
                                {typeof u.floor === "number" && ` (Floor ${u.floor})`}
                              </span>
                            {u.particles?.length > 0 && (
                              <ul style={{ marginTop: 2, marginLeft: 14 }}>
                                {u.particles.map((p: any) => (
                                  <li key={p.id}>
                                    Room / Space: {p.fullLabel || p.name}
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
                            Room / Space in this building: {p.fullLabel || p.name}
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
                  <div><strong>Units directly under property (no building):</strong></div>
                  <ul style={{ marginTop: 2, marginLeft: 16 }}>
                    {hierarchy.units.map((u: any) => (
                      <li key={u.id}>
                        <span>
                          <strong>Unit:</strong> {u.label}
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

                const raw = operationPercent.trim();
                const isAcv = raw === "ACV";

                if (isAcv && operation !== "set") {
                  setBulkMessage("ACV only can only be used with the 'Set to' operation.");
                  return;
                }

                let pct = 0;
                if (!isAcv) {
                  pct = Number(raw);
                  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
                    setBulkMessage("Enter a percent between 0 and 100, or choose ACV only.");
                    return;
                  }
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

        if (roomFilter) filters.roomParticleIds = [roomFilter];
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
                      acvOnly: isAcv,
                    }),
                  });
                  const json = await res.json().catch(() => null);

                  if (!res.ok) {
                    setBulkMessage(
                      `Bulk update failed (${res.status}). ${json ? JSON.stringify(json) : ""}`,
                    );
                    return;
                  }

                  // Optimistically update local items that match filters
                  setPetlItems(prev =>
                    prev.map(it => {
                      if (!matchesFilters(it)) return it;

                      // For ACV-only bulk set, flag as ACV and zero out percent.
                      if (isAcv && operation === "set") {
                        return { ...it, percentComplete: 0, isAcvOnly: true };
                      }

                      const current = it.percentComplete ?? 0;
                      let next = current;
                      if (operation === "set") next = pct;
                      else if (operation === "increment") next = current + pct;
                      else if (operation === "decrement") next = current - pct;
                      next = Math.max(0, Math.min(100, next));
                      return { ...it, percentComplete: next, isAcvOnly: false };
                    }),
                  );

                  // Refresh PETL from server so the UI always reflects persisted values
                  try {
                    const petlRes = await fetch(`${API_BASE}/projects/${id}/petl`, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (petlRes.ok) {
                      const petl: any = await petlRes.json();
                      const items: PetlItem[] = Array.isArray(petl.items) ? petl.items : [];
                      setPetlItems(items);
                    }
                  } catch {
                    // ignore
                  }

                  if (json?.status === "noop") {
                    setBulkMessage("No matching items found for the current filters.");
                  }

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
              <select
                value={operationPercent}
                onChange={e => setOperationPercent(e.target.value)}
                style={{
                  padding: "4px 6px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                }}
              >
                <option value="0">0%</option>
                <option value="10">10%</option>
                <option value="20">20%</option>
                <option value="30">30%</option>
                <option value="40">40%</option>
                <option value="50">50%</option>
                <option value="60">60%</option>
                <option value="70">70%</option>
                <option value="80">80%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="ACV">ACV only</option>
              </select>
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
                    <Fragment key={g.particleId ?? String(g.id)}>
                      <tr>
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
                          {g.particleId && (
                            <>
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  void openRoomComponentsPanel(g.particleId, g.roomName);
                                }}
                                style={{
                                  marginLeft: 8,
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  border: "1px solid #0f172a",
                                  background: "#ffffff",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                Components
                              </button>
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  // Derive a simple breadcrumb from hierarchy + room
                                  let breadcrumb: string | null = g.roomName;
                                  if (hierarchy) {
                                    const room = hierarchy.buildings
                                      .flatMap((b: any) =>
                                        (b.units || []).flatMap((u: any) =>
                                          (u.particles || []).map((p: any) => ({
                                            b,
                                            u,
                                            p,
                                          })),
                                        ),
                                      )
                                      .concat(
                                        hierarchy.units
                                          .flatMap((u: any) =>
                                            (u.particles || []).map((p: any) => ({
                                              b: null,
                                              u,
                                              p,
                                            })),
                                          ),
                                      )
                                      .find((r: any) => r.p.id === g.particleId);
                                    if (room) {
                                      const parts: string[] = [];
                                      if (room.b) parts.push(`${room.b.code || ""} ${room.b.name}`.trim());
                                      if (room.u) {
                                        const floorLabel =
                                          typeof room.u.floor === "number"
                                            ? ` (Floor ${room.u.floor})`
                                            : "";
                                        parts.push(`${room.u.label}${floorLabel}`);
                                      }
                                      parts.push(room.p.fullLabel || room.p.name);
                                      breadcrumb = parts.filter(Boolean).join("  b7 ");
                                    }
                                  }

                                  setPudlContext({
                                    open: true,
                                    buildingId: null,
                                    unitId: null,
                                    roomParticleId: g.particleId,
                                    sowItemId: null,
                                    breadcrumb,
                                  });

                                  setNewDailyLog(prev => ({
                                    ...prev,
                                    roomParticleId: g.particleId,
                                  }));

                                  setActiveTab("DAILY_LOGS");
                                }}
                                style={{
                                  marginLeft: 6,
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  border: "1px solid #2563eb",
                                  background: "#eff6ff",
                                  fontSize: 11,
                                  cursor: "pointer",
                                  color: "#1d4ed8",
                                }}
                              >
                                PUDL
                              </button>
                            </>
                          )}
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
                                    <th style={{ textAlign: "left", padding: "4px 8px" }}>
                                      PUDL
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
                                        <select
                                          value={item.isAcvOnly ? "ACV" : String(item.percentComplete)}
                                          onChange={async (e) => {
                                            const value = e.target.value;
                                            const isAcv = value === "ACV";
                                            const percent = isAcv ? 0 : Number(value);
                                            if (
                                              !isAcv &&
                                              (Number.isNaN(percent) || percent < 0 || percent > 100)
                                            ) {
                                              return;
                                            }

                                            const token = localStorage.getItem("accessToken");
                                            if (!token) {
                                              alert("Missing access token; please log in again.");
                                              return;
                                            }

                                            try {
                                              setPetlItems(prev =>
                                                prev.map(it =>
                                                  it.id === item.id
                                                    ? {
                                                        ...it,
                                                        percentComplete: percent,
                                                        isAcvOnly: isAcv,
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
                                                    newPercent: percent,
                                                    acvOnly: isAcv,
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
                                            width: 70,
                                            padding: "2px 4px",
                                            borderRadius: 4,
                                            border: "1px solid #d1d5db",
                                            fontSize: 11,
                                          }}
                                        >
                                          <option value="0">0%</option>
                                          <option value="10">10%</option>
                                          <option value="20">20%</option>
                                          <option value="30">30%</option>
                                          <option value="40">40%</option>
                                          <option value="50">50%</option>
                                          <option value="60">60%</option>
                                          <option value="70">70%</option>
                                          <option value="80">80%</option>
                                          <option value="90">90%</option>
                                          <option value="100">100%</option>
                                          <option value="ACV">ACV only</option>
                                        </select>
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
                                      <td
                                        style={{
                                          padding: "3px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            // Build a PUDL scoped to this SOW line + room
                                            const sowLabel = item.description || `Line ${item.lineNo}`;
                                            const parts: string[] = [];
                                            parts.push(g.roomName);
                                            parts.push(`SOW: ${sowLabel}`);
                                            const breadcrumb = parts.filter(Boolean).join(" · ");

                                            setPudlContext({
                                              open: true,
                                              buildingId: null,
                                              unitId: null,
                                              roomParticleId: g.particleId ?? null,
                                              sowItemId: item.id,
                                              breadcrumb,
                                            });

                                            setNewDailyLog(prev => ({
                                              ...prev,
                                              roomParticleId: g.particleId ?? prev.roomParticleId,
                                              sowItemId: item.id,
                                            }));

                                            setActiveTab("DAILY_LOGS");
                                          }}
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: 999,
                                            border: "1px solid #2563eb",
                                            background: "#eff6ff",
                                            fontSize: 11,
                                            cursor: "pointer",
                                            color: "#1d4ed8",
                                          }}
                                        >
                                          PUDL
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Room components side drawer */}
      {roomComponentsPanel.open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            display: "flex",
            justifyContent: "flex-end",
            backgroundColor: "rgba(15,23,42,0.35)",
          }}
          onClick={() =>
            setRoomComponentsPanel(prev => ({
              ...prev,
              open: false,
            }))
          }
        >
          <div
            style={{
              position: "relative",
              top: 0,
              bottom: 0,
              width: 360,
              maxWidth: "80vw",
              backgroundColor: "#ffffff",
              borderLeft: "1px solid #e5e7eb",
              boxShadow: "-4px 0 12px rgba(15,23,42,0.12)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "#f3f4f6",
              }}
            >
              <div>
                Components in
                <br />
                <span style={{ fontWeight: 700 }}>{roomComponentsPanel.roomName}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRoomComponentsPanel(prev => ({
                    ...prev,
                    open: false,
                  }))
                }
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close components panel"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 10, fontSize: 12, flex: 1, overflow: "auto" }}>
              {roomComponentsPanel.loading && (
                <div style={{ color: "#6b7280" }}>Loading components…</div>
              )}
              {!roomComponentsPanel.loading && roomComponentsPanel.error && (
                <div style={{ color: "#b91c1c" }}>{roomComponentsPanel.error}</div>
              )}
              {!roomComponentsPanel.loading &&
                !roomComponentsPanel.error &&
                roomComponentsPanel.components.length === 0 && (
                  <div style={{ color: "#6b7280" }}>
                    No components found for this selection.
                  </div>
                )}
              {!roomComponentsPanel.loading &&
                !roomComponentsPanel.error &&
                roomComponentsPanel.components.length > 0 && (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: "#f9fafb" }}>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>
                          Code
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>
                          Description
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>
                          Qty
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>
                          Unit
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {roomComponentsPanel.components.map(c => (
                        <tr key={c.code}>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.code}
                          </td>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                              maxWidth: 160,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={c.description ?? undefined}
                          >
                            {c.description ?? ""}
                          </td>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                            }}
                          >
                            {c.quantity.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                            }}
                          >
                            {c.unit ?? ""}
                          </td>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                            }}
                          >
                            {c.total.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      ) : null}

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
                      <select
                        value={item.isAcvOnly ? "ACV" : String(item.percentComplete)}
                        onChange={async (e) => {
                          const value = e.target.value;
                          const isAcv = value === "ACV";
                          const percent = isAcv ? 0 : Number(value);
                          if (!isAcv && (Number.isNaN(percent) || percent < 0 || percent > 100)) {
                            return;
                          }

                          const token = localStorage.getItem("accessToken");
                          if (!token) {
                            alert("Missing access token; please log in again.");
                            return;
                          }

                          try {
                            setPetlItems(prev =>
                              prev.map(it =>
                                it.id === item.id
                                  ? {
                                      ...it,
                                      percentComplete: percent,
                                      isAcvOnly: isAcv,
                                    }
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
                                body: JSON.stringify({
                                  newPercent: percent,
                                  acvOnly: isAcv,
                                }),
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
                          width: 80,
                          padding: "2px 4px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 11,
                        }}
                      >
                        <option value="0">0%</option>
                        <option value="10">10%</option>
                        <option value="20">20%</option>
                        <option value="30">30%</option>
                        <option value="40">40%</option>
                        <option value="50">50%</option>
                        <option value="60">60%</option>
                        <option value="70">70%</option>
                        <option value="80">80%</option>
                        <option value="90">90%</option>
                        <option value="100">100%</option>
                        <option value="ACV">ACV only</option>
                      </select>
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
        </div>
      )}
    </div>
  );
}
