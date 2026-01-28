"use client";

import * as React from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBusyOverlay } from "../../busy-overlay-context";
import { uploadImageFileToNexusUploads } from "../../lib/uploads";
import {
  CostBookPickerModal,
  type CostBookSelection,
} from "../../components/cost-book-picker-modal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type CheckboxMultiSelectOption = { value: string; label: string };

function CheckboxMultiSelect(props: {
  placeholder: string;
  options: CheckboxMultiSelectOption[];
  selectedValues: string[];
  onChangeSelectedValues: (next: string[]) => void;
  minWidth?: number;
  // Optional minimum height for the scroll area; actual height will expand to the
  // bottom of the viewport when opened.
  minListHeight?: number;
}) {
  const {
    placeholder,
    options,
    selectedValues,
    onChangeSelectedValues,
    minWidth = 140,
    minListHeight = 180,
  } = props;

  const [open, setOpen] = useState(false);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number>(320);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const computeMaxHeight = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Leave a little breathing room so we don't touch the bottom edge.
      const available = Math.floor(window.innerHeight - rect.bottom - 12);
      setPanelMaxHeight(Math.max(180, available));
    };

    computeMaxHeight();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", computeMaxHeight);
    window.addEventListener("scroll", computeMaxHeight, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", computeMaxHeight);
      window.removeEventListener("scroll", computeMaxHeight, true);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const buttonLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) {
      const only = selectedValues[0];
      const match = options.find((o) => o.value === only);
      return match?.label ?? only;
    }
    return `${selectedValues.length} selected`;
  }, [options, placeholder, selectedValues]);

  const toggleValue = (value: string) => {
    onChangeSelectedValues(
      selectedSet.has(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value],
    );
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: minWidth,
          padding: "4px 6px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 12,
          background: "#ffffff",
          cursor: "pointer",
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth,
            zIndex: 50,
            background: "#ffffff",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            boxShadow: "0 10px 20px rgba(0,0,0,0.10)",
            padding: 8,
            maxHeight: panelMaxHeight,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={selectedValues.length === 0}
                onChange={() => onChangeSelectedValues([])}
              />
              <span style={{ fontWeight: 600 }}>All</span>
            </label>
            {selectedValues.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSelectedValues([])}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 12,
                  color: "#2563eb",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div
            style={{
              // Expand to the bottom of the viewport, but keep a sensible minimum.
              maxHeight: Math.max(minListHeight, panelMaxHeight - 44),
              overflow: "auto",
            }}
          >
            {options.map((opt) => {
              const checked = selectedSet.has(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 2px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(opt.value)}
                  />
                  <span style={{ whiteSpace: "nowrap" }}>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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

type PetlDisplayMode = "PROJECT_GROUPING" | "LINE_SEQUENCE" | "RECONCILIATION_ONLY";

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
  const busyOverlay = useBusyOverlay();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [petlItemCount, setPetlItemCount] = useState<number | null>(null);
  const [petlTotalAmount, setPetlTotalAmount] = useState<number | null>(null);
  const [componentsCount, setComponentsCount] = useState<number | null>(null);
  const [petlItems, setPetlItems] = useState<PetlItem[]>([]);
  const [petlReconciliationEntries, setPetlReconciliationEntries] = useState<any[]>([]);
  const [petlLoading, setPetlLoading] = useState(false);

  // Reconciliation activity (any reconciliation entry exists for this sowItem)
  const [petlReconActivityIds, setPetlReconActivityIds] = useState<Set<string>>(
    () => new Set(),
  );

  // PETL load diagnostics (helps debug prod issues like 500s / misconfigured API base)
  const [petlLoadError, setPetlLoadError] = useState<string | null>(null);
  const [petlLastLoadDebug, setPetlLastLoadDebug] = useState<any | null>(null);
  const [petlShowDiagnostics, setPetlShowDiagnostics] = useState(false);

  // Increment to force reloads of PETL + groups after reconciliation mutations.
  const [petlReloadTick, setPetlReloadTick] = useState(0);

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

  const [unitGroups, setUnitGroups] = useState<{
    id: number;
    unitId: string | null;
    unitLabel: string;
    rooms: {
      id: number;
      particleId: string | null;
      roomName: string;
      itemsCount: number;
      totalAmount: number;
      completedAmount: number;
      percentComplete: number;
    }[];
    itemsCount: number;
    totalAmount: number;
    completedAmount: number;
    percentComplete: number;
  }[]>([]);

  // Lightweight "needs reconciliation" flags for PETL lines.
  // For now this is stored in localStorage (per project) so PMs can quickly mark
  // rows that need follow-up (e.g. CO note without amount).
  const [petlReconFlagIds, setPetlReconFlagIds] = useState<Set<string>>(
    () => new Set(),
  );

  // PETL filters (multi-select). Empty array means "All".
  const [roomParticleIdFilters, setRoomParticleIdFilters] = useState<string[]>([]);
  const [categoryCodeFilters, setCategoryCodeFilters] = useState<string[]>([]);
  const [selectionCodeFilters, setSelectionCodeFilters] = useState<string[]>([]);

  const roomParticleIdFilterSet = useMemo(
    () => new Set(roomParticleIdFilters),
    [roomParticleIdFilters],
  );
  const categoryCodeFilterSet = useMemo(
    () => new Set(categoryCodeFilters),
    [categoryCodeFilters],
  );
  const selectionCodeFilterSet = useMemo(
    () => new Set(selectionCodeFilters),
    [selectionCodeFilters],
  );

  // PETL view toggle: project organization grouping vs line sequence
  // Default to LINE_SEQUENCE (and persist per-project) so the cost book / line-by-line
  // reconciliation workflow is the primary view.
  const petlDisplayModeKey = `petlDisplayMode:v2:${id}`;

  const [petlDisplayMode, setPetlDisplayMode] = useState<PetlDisplayMode>(() => {
    if (typeof window === "undefined") return "LINE_SEQUENCE";

    // v2 key intentionally resets old defaults so new projects/users land on
    // LINE_SEQUENCE by default.
    const raw = localStorage.getItem(petlDisplayModeKey);
    if (
      raw === "PROJECT_GROUPING" ||
      raw === "LINE_SEQUENCE" ||
      raw === "RECONCILIATION_ONLY"
    ) {
      return raw;
    }

    return "LINE_SEQUENCE";
  });

  const [petlPercentFile, setPetlPercentFile] = useState<File | null>(null);
  const [petlPercentImporting, setPetlPercentImporting] = useState(false);
  const [petlPercentImportError, setPetlPercentImportError] = useState<string | null>(null);
  const [petlPercentJobId, setPetlPercentJobId] = useState<string | null>(null);
  const [petlPercentJob, setPetlPercentJob] = useState<any | null>(null);
  const [petlPercentJobError, setPetlPercentJobError] = useState<string | null>(null);

  const [petlReconcileNotesFile, setPetlReconcileNotesFile] = useState<File | null>(null);
  const [petlReconcileNotesImporting, setPetlReconcileNotesImporting] = useState(false);
  const [petlReconcileNotesImportError, setPetlReconcileNotesImportError] = useState<string | null>(null);
  const [petlReconcileNotesImportResult, setPetlReconcileNotesImportResult] = useState<any | null>(null);

  // Rarely used: keep import UIs behind a modal so they don't affect initial render/layout.
  const [importsModalOpen, setImportsModalOpen] = useState(false);

  const closeImportsModal = useCallback(() => {
    setImportsModalOpen(false);
    // Clear selected files so we don't end up with enabled submit buttons after remount.
    setPetlPercentFile(null);
    setPetlReconcileNotesFile(null);
    // Clear transient errors (results/job status can remain).
    setPetlPercentImportError(null);
    setPetlReconcileNotesImportError(null);
  }, []);

  const downloadPetlPercentCsv = useCallback(() => {
    const header = ["#", "% Complete"];
    const rows = [...petlItems]
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((i: PetlItem) => {
        const lineNo = String(i.lineNo).trim();
        // If a line is marked ACV-only, leave % blank so uploading the template
        // won't accidentally flip it to non-ACV-only.
        const pct = i.isAcvOnly ? "" : String(i.percentComplete ?? "");
        // Values are numeric/blank; no escaping needed.
        return `${lineNo},${pct}`;
      });

    const csv = [header.join(","), ...rows].join("\n");
    const fileName = `petl-percent-import-${id}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [id, petlItems]);

  const setPetlDisplayModePersisted = (mode: PetlDisplayMode) => {
    setPetlDisplayMode(mode);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(petlDisplayModeKey, mode);
        // Best effort: clear legacy key so we don't flip back after refresh.
        localStorage.removeItem(`petlDisplayMode:${id}`);
      } catch {
        // ignore storage errors
      }
    }
  };

  useEffect(() => {
    if (!petlPercentJobId) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setPetlPercentJobError("Missing access token.");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/import-jobs/${petlPercentJobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to fetch job status (${res.status}) ${text}`);
        }
        const json = await res.json();
        if (cancelled) return;
        setPetlPercentJob(json);
        const done = json?.status === "SUCCEEDED" || json?.status === "FAILED";
        if (!done) {
          timer = window.setTimeout(poll, 4000);
        } else {
          // refresh PETL once import completes
          setPetlReloadTick((t) => t + 1);
        }
      } catch (err: any) {
        if (cancelled) return;
        setPetlPercentJobError(err?.message ?? "Failed to fetch job status.");
        timer = window.setTimeout(poll, 8000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [petlPercentJobId]);

  async function handlePetlPercentImport(e: React.FormEvent) {
    e.preventDefault();
    setPetlPercentImportError(null);

    if (!petlPercentFile) {
      setPetlPercentImportError("Choose a CSV file first.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPetlPercentImportError("Missing access token.");
      return;
    }

    try {
      setPetlPercentImporting(true);
      const form = new FormData();
      form.append("file", petlPercentFile);

      const res = await fetch(`${API_BASE}/projects/${id}/import-jobs/petl-percent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Import failed (${res.status}) ${text}`);
      }

      const json = await res.json().catch(() => ({}));
      const nextJobId = json?.jobId ?? null;
      setPetlPercentJobId(nextJobId);
      setPetlPercentJob(null);
      setPetlPercentJobError(null);
      setPetlPercentFile(null);
    } catch (err: any) {
      setPetlPercentImportError(err?.message ?? "Failed to queue import.");
    } finally {
      setPetlPercentImporting(false);
    }
  }

  async function handlePetlReconcileNotesImport(e: React.FormEvent) {
    e.preventDefault();
    setPetlReconcileNotesImportError(null);

    if (!petlReconcileNotesFile) {
      setPetlReconcileNotesImportError("Choose a CSV file first.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPetlReconcileNotesImportError("Missing access token.");
      return;
    }

    try {
      setPetlReconcileNotesImporting(true);
      const form = new FormData();
      form.append("file", petlReconcileNotesFile);

      const res = await fetch(`${API_BASE}/projects/${id}/petl/import-reconcile-notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Import failed (${res.status}) ${text}`);
      }

      const json = await res.json().catch(() => ({}));
      setPetlReconcileNotesImportResult(json);
      setPetlReconcileNotesFile(null);

      // Refresh PETL/rollups + reconciliation drawer data.
      setPetlReloadTick((t) => t + 1);
      if (petlReconPanel.open && petlReconPanel.sowItemId) {
        void loadPetlReconciliation(petlReconPanel.sowItemId);
      }
    } catch (err: any) {
      setPetlReconcileNotesImportError(err?.message ?? "Failed to import notes.");
    } finally {
      setPetlReconcileNotesImporting(false);
    }
  }

  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  const [operation, setOperation] = useState<"set" | "increment" | "decrement">("set");
  const [operationPercent, setOperationPercent] = useState<string>("0");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  // Pending PETL % approvals (PM/owner/admin only)
  const [pendingPetlSessions, setPendingPetlSessions] = useState<any[] | null>(null);
  const [pendingPetlLoading, setPendingPetlLoading] = useState(false);
  const [pendingPetlError, setPendingPetlError] = useState<string | null>(null);
  const [pendingPetlMessage, setPendingPetlMessage] = useState<string | null>(null);
  const [pendingPetlReloadTick, setPendingPetlReloadTick] = useState(0);

  const [selectionSummary, setSelectionSummary] = useState<{
    itemCount: number;
    totalAmount: number;
    completedAmount: number;
    percentComplete: number;
  } | null>(null);

  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);

  // Bills (expenses)
  const [projectBills, setProjectBills] = useState<any[] | null>(null);
  const [projectBillsLoading, setProjectBillsLoading] = useState(false);
  const [projectBillsError, setProjectBillsError] = useState<string | null>(null);
  const [billsMessage, setBillsMessage] = useState<string | null>(null);
  const [billsCollapsed, setBillsCollapsed] = useState(false);

  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billModalSaving, setBillModalSaving] = useState(false);
  const [billEditingId, setBillEditingId] = useState<string | null>(null);

  const [billVendorName, setBillVendorName] = useState("");
  const [billBillNumber, setBillBillNumber] = useState("");
  const [billBillDate, setBillBillDate] = useState("");
  const [billDueAt, setBillDueAt] = useState("");
  const [billStatus, setBillStatus] = useState<string>("DRAFT");
  const [billMemo, setBillMemo] = useState("");

  const [billLineKind, setBillLineKind] = useState<string>("MATERIALS");
  const [billLineDescription, setBillLineDescription] = useState("");
  const [billLineAmount, setBillLineAmount] = useState("");
  const [billLineTimecardStartDate, setBillLineTimecardStartDate] = useState("");
  const [billLineTimecardEndDate, setBillLineTimecardEndDate] = useState("");

  const [billAttachmentProjectFileIds, setBillAttachmentProjectFileIds] = useState<string[]>([]);
  const [billEditingExistingAttachmentIds, setBillEditingExistingAttachmentIds] = useState<string[]>([]);
  const [billAttachmentFileOptions, setBillAttachmentFileOptions] = useState<any[] | null>(null);
  const [billAttachmentFileLoading, setBillAttachmentFileLoading] = useState(false);
  const [billAttachmentFileError, setBillAttachmentFileError] = useState<string | null>(null);

  // Invoices + payments (progress billing)
  const [projectInvoices, setProjectInvoices] = useState<any[] | null>(null);
  const [projectInvoicesLoading, setProjectInvoicesLoading] = useState(false);
  const [projectInvoicesError, setProjectInvoicesError] = useState<string | null>(null);

  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [activeInvoiceLoading, setActiveInvoiceLoading] = useState(false);
  const [activeInvoiceError, setActiveInvoiceError] = useState<string | null>(null);

  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null);
  const [paymentsMessage, setPaymentsMessage] = useState<string | null>(null);

  // Invoice printing
  const [invoicePrintDialogOpen, setInvoicePrintDialogOpen] = useState(false);
  const [invoicePrintLayout, setInvoicePrintLayout] = useState<"KEEP" | "GROUPED" | "FLAT">("KEEP");
  const [invoicePrintGroups, setInvoicePrintGroups] = useState<"KEEP" | "COLLAPSE_ALL" | "EXPAND_ALL">("KEEP");
  const [invoicePrintBusy, setInvoicePrintBusy] = useState(false);

  // Detailed invoice view toggle: flat list vs PETL project grouping tree
  const invoiceGroupKey = `invoicePetlGroup:v1:${id}`;
  const [invoiceGroupEnabled, setInvoiceGroupEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem(invoiceGroupKey);
      // default ON
      return raw !== "0";
    } catch {
      return true;
    }
  });

  const setInvoiceGroupEnabledPersisted = (next: boolean) => {
    setInvoiceGroupEnabled(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(invoiceGroupKey, next ? "1" : "0");
      } catch {
        // ignore
      }
    }
  };

  const [invoiceGroupOpenBuildings, setInvoiceGroupOpenBuildings] = useState<Set<string>>(() => new Set());

  // Invoice PETL line billing tags (edit on-demand to avoid rendering heavy selects for every row)
  const [invoicePetlTagEditingLineId, setInvoicePetlTagEditingLineId] = useState<string | null>(null);
  const [invoicePetlTagDraft, setInvoicePetlTagDraft] = useState<string>("NONE");
  const [invoicePetlTagSaving, setInvoicePetlTagSaving] = useState(false);

  const activeInvoicePetlLines = useMemo(() => {
    const lines = activeInvoice?.petlLines;
    return Array.isArray(lines) ? lines : [];
  }, [activeInvoice]);

  // Roll up invoiced/paid/outstanding for the Financial Overview.
  // Exclude DRAFT + VOID.
  const invoiceRollup = useMemo(() => {
    if (!Array.isArray(projectInvoices)) return null;

    let invoiced = 0;
    let paid = 0;
    let balanceDue = 0;
    let count = 0;

    for (const inv of projectInvoices) {
      const status = String(inv?.status ?? "").trim();
      if (!status) continue;
      if (status === "DRAFT" || status === "VOID") continue;

      count += 1;
      invoiced += Number(inv?.totalAmount ?? 0) || 0;
      paid += Number(inv?.paidAmount ?? 0) || 0;
      balanceDue += Number(inv?.balanceDue ?? 0) || 0;
    }

    return { invoiced, paid, balanceDue, count };
  }, [projectInvoices]);

  const billsRollup = useMemo(() => {
    if (!Array.isArray(projectBills)) return null;

    let count = 0;
    let total = 0;

    for (const b of projectBills) {
      count += 1;
      total += Number(b?.totalAmount ?? 0) || 0;
    }

    return { count, total };
  }, [projectBills]);

  // When a new invoice is opened, default the grouped view to COLLAPSED.
  // (Users can expand group → unit → room as needed.)
  useEffect(() => {
    if (!invoiceGroupEnabled) return;

    setInvoiceGroupOpenBuildings(new Set());

    // Reset any inline edit state when switching invoices.
    setInvoicePetlTagEditingLineId(null);
    setInvoicePetlTagDraft("NONE");
    setInvoicePetlTagSaving(false);
  }, [activeInvoice?.id, invoiceGroupEnabled]);

  const formatMoney = (value: any) => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n < 0 ? `(${abs})` : abs;
  };

  const csvEscape = (value: any) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    // RFC4180-ish: escape quotes, wrap if contains quote/comma/newline.
    const needsWrap = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsWrap ? `"${escaped}"` : escaped;
  };

  const buildCsv = (headers: string[], rows: Record<string, any>[]) => {
    const lines: string[] = [];
    lines.push(headers.map(csvEscape).join(","));
    for (const row of rows) {
      lines.push(headers.map((h) => csvEscape(row[h])).join(","));
    }
    return lines.join("\n") + "\n";
  };

  const downloadCsv = (filename: string, csvText: string) => {
    try {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const exportInvoicesCsv = async () => {
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setInvoiceMessage("Missing access token.");
      return;
    }

    setInvoiceMessage("Exporting invoices…");

    try {
      const res = await fetch(`${API_BASE}/projects/${project.id}/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Export failed (${res.status}) ${text}`);
      }

      const invoices: any[] = await res.json();
      const headers = [
        "invoiceId",
        "invoiceNo",
        "status",
        "issuedAt",
        "dueAt",
        "createdAt",
        "totalAmount",
        "paidAmount",
        "balanceDue",
        "billToName",
        "billToEmail",
        "memo",
      ];

      const rows = (Array.isArray(invoices) ? invoices : []).map((inv: any) => ({
        invoiceId: inv?.id ?? "",
        invoiceNo: inv?.invoiceNo ?? "",
        status: inv?.status ?? "",
        issuedAt: inv?.issuedAt ?? "",
        dueAt: inv?.dueAt ?? "",
        createdAt: inv?.createdAt ?? "",
        totalAmount: inv?.totalAmount ?? 0,
        paidAmount: inv?.paidAmount ?? 0,
        balanceDue: inv?.balanceDue ?? 0,
        billToName: inv?.billToName ?? "",
        billToEmail: inv?.billToEmail ?? "",
        memo: inv?.memo ?? "",
      }));

      const csv = buildCsv(headers, rows);
      const dateTag = new Date().toISOString().slice(0, 10);
      downloadCsv(`project_${project.id}_invoices_${dateTag}.csv`, csv);
      setInvoiceMessage(`Exported ${rows.length} invoice row(s).`);
    } catch (err: any) {
      setInvoiceMessage(err?.message ?? "Invoice export failed.");
    }
  };

  const exportPaymentsCsv = async () => {
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPaymentsMessage("Missing access token.");
      return;
    }

    setPaymentsMessage("Exporting payments…");

    try {
      const [paymentsRes, invoicesRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${project.id}/payments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/projects/${project.id}/invoices`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!paymentsRes.ok) {
        const text = await paymentsRes.text().catch(() => "");
        throw new Error(`Payments export failed (${paymentsRes.status}) ${text}`);
      }
      if (!invoicesRes.ok) {
        const text = await invoicesRes.text().catch(() => "");
        throw new Error(`Payments export failed (invoice lookup ${invoicesRes.status}) ${text}`);
      }

      const payments: any[] = await paymentsRes.json();
      const invoices: any[] = await invoicesRes.json();
      const invoiceById = new Map<string, any>();
      for (const inv of Array.isArray(invoices) ? invoices : []) {
        if (inv?.id) invoiceById.set(String(inv.id), inv);
      }

      const headers = [
        "rowType",
        "rowAmount",
        "paymentId",
        "paymentAmount",
        "paidAt",
        "method",
        "reference",
        "note",
        "paymentCreatedAt",
        "appliedAmount",
        "unappliedAmount",
        "applicationId",
        "applicationAmount",
        "invoiceId",
        "invoiceNo",
        "invoiceStatus",
        "invoiceIssuedAt",
        "invoiceDueAt",
      ];

      const rows: Record<string, any>[] = [];

      for (const p of Array.isArray(payments) ? payments : []) {
        const paymentId = String(p?.id ?? "");
        const paymentAmount = Number(p?.amount ?? 0) || 0;
        const paidAt = p?.paidAt ?? "";
        const method = p?.method ?? "";
        const reference = p?.reference ?? "";
        const note = p?.note ?? "";
        const paymentCreatedAt = p?.createdAt ?? "";
        const appliedAmount = Number(p?.appliedAmount ?? 0) || 0;
        const unappliedAmount = Number(p?.unappliedAmount ?? 0) || 0;

        const apps: any[] = Array.isArray(p?.applications) ? p.applications : [];

        for (const a of apps) {
          const invoiceId = String(a?.invoiceId ?? "");
          const inv = invoiceById.get(invoiceId);
          rows.push({
            rowType: "APPLICATION",
            rowAmount: Number(a?.amount ?? 0) || 0,
            paymentId,
            paymentAmount,
            paidAt,
            method,
            reference,
            note,
            paymentCreatedAt,
            appliedAmount,
            unappliedAmount,
            applicationId: a?.id ?? "",
            applicationAmount: a?.amount ?? 0,
            invoiceId,
            invoiceNo: inv?.invoiceNo ?? a?.invoiceNo ?? "",
            invoiceStatus: inv?.status ?? "",
            invoiceIssuedAt: inv?.issuedAt ?? "",
            invoiceDueAt: inv?.dueAt ?? "",
          });
        }

        if (unappliedAmount > 0) {
          rows.push({
            rowType: "UNAPPLIED",
            rowAmount: unappliedAmount,
            paymentId,
            paymentAmount,
            paidAt,
            method,
            reference,
            note,
            paymentCreatedAt,
            appliedAmount,
            unappliedAmount,
            applicationId: "",
            applicationAmount: "",
            invoiceId: "",
            invoiceNo: "",
            invoiceStatus: "",
            invoiceIssuedAt: "",
            invoiceDueAt: "",
          });
        }

        if (apps.length === 0 && unappliedAmount === 0) {
          rows.push({
            rowType: "PAYMENT",
            rowAmount: 0,
            paymentId,
            paymentAmount,
            paidAt,
            method,
            reference,
            note,
            paymentCreatedAt,
            appliedAmount,
            unappliedAmount,
            applicationId: "",
            applicationAmount: "",
            invoiceId: "",
            invoiceNo: "",
            invoiceStatus: "",
            invoiceIssuedAt: "",
            invoiceDueAt: "",
          });
        }
      }

      const csv = buildCsv(headers, rows);
      const dateTag = new Date().toISOString().slice(0, 10);
      downloadCsv(`project_${project.id}_payments_${dateTag}.csv`, csv);
      setPaymentsMessage(`Exported ${rows.length} row(s).`);
    } catch (err: any) {
      setPaymentsMessage(err?.message ?? "Payments export failed.");
    }
  };

  const resetBillForm = () => {
    setBillEditingId(null);
    setBillVendorName("");
    setBillBillNumber("");
    setBillBillDate(todayIso);
    setBillDueAt("");
    setBillStatus("DRAFT");
    setBillMemo("");

    setBillLineKind("MATERIALS");
    setBillLineDescription("");
    setBillLineAmount("");
    setBillLineTimecardStartDate("");
    setBillLineTimecardEndDate("");

    setBillAttachmentProjectFileIds([]);
    setBillEditingExistingAttachmentIds([]);
  };

  const openCreateBillModal = () => {
    resetBillForm();
    setBillsMessage(null);
    setBillModalOpen(true);
  };

  const openEditBillModal = (bill: any) => {
    const li = Array.isArray(bill?.lineItems) ? bill.lineItems[0] : null;

    setBillEditingId(String(bill?.id ?? ""));
    setBillVendorName(String(bill?.vendorName ?? ""));
    setBillBillNumber(String(bill?.billNumber ?? ""));
    setBillBillDate(bill?.billDate ? String(bill.billDate).slice(0, 10) : todayIso);
    setBillDueAt(bill?.dueAt ? String(bill.dueAt).slice(0, 10) : "");
    setBillStatus(String(bill?.status ?? "DRAFT") || "DRAFT");
    setBillMemo(String(bill?.memo ?? ""));

    setBillLineKind(String(li?.kind ?? "MATERIALS") || "MATERIALS");
    setBillLineDescription(String(li?.description ?? ""));
    setBillLineAmount(li?.amount != null ? String(li.amount) : "");
    setBillLineTimecardStartDate(li?.timecardStartDate ? String(li.timecardStartDate).slice(0, 10) : "");
    setBillLineTimecardEndDate(li?.timecardEndDate ? String(li.timecardEndDate).slice(0, 10) : "");

    const attachedIds = (Array.isArray(bill?.attachments) ? bill.attachments : [])
      .map((a: any) => String(a?.projectFileId ?? "").trim())
      .filter(Boolean);
    setBillAttachmentProjectFileIds(attachedIds);
    setBillEditingExistingAttachmentIds(attachedIds);

    setBillsMessage(null);
    setBillModalOpen(true);
  };

  const closeBillModal = () => {
    if (billModalSaving) return;
    setBillModalOpen(false);
  };

  const submitBillModal = async () => {
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setBillsMessage("Missing access token.");
      return;
    }

    const vendorName = billVendorName.trim();
    if (!vendorName) {
      setBillsMessage("Vendor name is required.");
      return;
    }

    const billDate = billBillDate || todayIso;
    const lineDesc = billLineDescription.trim();
    if (!lineDesc) {
      setBillsMessage("Line item description is required.");
      return;
    }

    const payload: any = {
      vendorName,
      billNumber: billBillNumber.trim() || undefined,
      billDate,
      dueAt: billDueAt || undefined,
      status: billStatus || undefined,
      memo: billMemo.trim() || undefined,
      lineItem: {
        kind: billLineKind,
        description: lineDesc,
      },
    };

    const isLabor = String(billLineKind).toUpperCase() === "LABOR";

    if (billLineAmount.trim() === "") {
      if (isLabor) {
        if (!billLineTimecardStartDate || !billLineTimecardEndDate) {
          setBillsMessage("For labor, enter an Amount or set a timecard start/end range.");
          return;
        }
        payload.lineItem.amount = null;
        payload.lineItem.timecardStartDate = billLineTimecardStartDate;
        payload.lineItem.timecardEndDate = billLineTimecardEndDate;
      } else {
        setBillsMessage("Amount is required.");
        return;
      }
    } else {
      const amount = Number(billLineAmount);
      if (!Number.isFinite(amount)) {
        setBillsMessage("Amount must be a valid number.");
        return;
      }
      payload.lineItem.amount = amount;

      if (isLabor && billLineTimecardStartDate && billLineTimecardEndDate) {
        payload.lineItem.timecardStartDate = billLineTimecardStartDate;
        payload.lineItem.timecardEndDate = billLineTimecardEndDate;
      }
    }

    const isEdit = !!billEditingId;

    if (!isEdit) {
      payload.attachmentProjectFileIds = billAttachmentProjectFileIds;
    }

    setBillModalSaving(true);
    setBillsMessage(null);

    try {
      if (!isEdit) {
        const res = await fetch(`${API_BASE}/projects/${project.id}/bills`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Create failed (${res.status}) ${text}`);
        }
        await res.json().catch(() => null);
      } else {
        const res = await fetch(`${API_BASE}/projects/${project.id}/bills/${billEditingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Update failed (${res.status}) ${text}`);
        }
        await res.json().catch(() => null);

        // Attach any newly-selected files.
        const toAttach = billAttachmentProjectFileIds.filter(
          (pid) => !billEditingExistingAttachmentIds.includes(pid),
        );
        for (const pid of toAttach) {
          const attachRes = await fetch(
            `${API_BASE}/projects/${project.id}/bills/${billEditingId}/attachments`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ projectFileId: pid }),
            },
          );
          if (!attachRes.ok) {
            const text = await attachRes.text().catch(() => "");
            throw new Error(`Attach failed (${attachRes.status}) ${text}`);
          }
        }
      }

      setProjectBills(null);
      setFinancialSummary(null);
      closeBillModal();
      setBillsMessage("Saved.");
    } catch (err: any) {
      setBillsMessage(err?.message ?? "Save failed.");
    } finally {
      setBillModalSaving(false);
    }
  };

  const htmlEscape = (value: any) => {
    const s = value === null || value === undefined ? "" : String(value);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const fmtDate = (value: any) => {
    if (!value) return "";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString();
  };

  const fmtCurrency = (value: any) => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return "$0.00";
    const abs = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n < 0 ? `($${abs})` : `$${abs}`;
  };

  const printHtmlDocument = (title: string, htmlBody: string) => {
    // Use an iframe so we can print a clean, PDF-friendly HTML document
    // without mutating or re-styling the main app.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "invoice-print");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;

    if (!doc || !win) {
      iframe.remove();
      return;
    }

    const fullHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${htmlEscape(title)}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  html, body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111827; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 13px; margin: 16px 0 8px; }
  .muted { color: #6b7280; font-size: 11px; }
  .meta { margin-top: 8px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px; font-size: 12px; }
  .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
  .kv { display: grid; grid-template-columns: 120px 1fr; row-gap: 4px; column-gap: 8px; }
  .k { color: #6b7280; }
  .v { color: #111827; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .group { background: #f3f4f6; font-weight: 700; }
  .indent { padding-left: 18px; }
  .tag { font-weight: 700; font-size: 10px; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 8px; display: inline-block; margin-left: 8px; }
  .total-row td { font-weight: 700; background: #f9fafb; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;

    doc.open();
    doc.write(fullHtml);
    doc.close();

    // Print after the iframe has had a moment to lay out.
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        // Cleanup later; some browsers are finicky about removing immediately.
        window.setTimeout(() => iframe.remove(), 5000);
      }
    }, 120);
  };

  const printActiveInvoiceAsHtml = (opts: { layout: "KEEP" | "GROUPED" | "FLAT"; groups: "KEEP" | "COLLAPSE_ALL" | "EXPAND_ALL"; }) => {
    if (!activeInvoice) return;

    const resolvedLayout: "GROUPED" | "FLAT" =
      opts.layout === "KEEP" ? (invoiceGroupEnabled ? "GROUPED" : "FLAT") : opts.layout;

    const wantGrouped = resolvedLayout === "GROUPED";

    const getGroupKey = (g: any, idx: number) => {
      const rawKey = String(g?.groupKey ?? g?.groupLabel ?? "").trim();
      return rawKey || `__group_${idx}`;
    };

    const openGroups = (() => {
      if (!wantGrouped) return new Set<string>();
      if (opts.groups === "KEEP") return new Set(invoiceGroupOpenBuildings);
      if (opts.groups === "COLLAPSE_ALL") return new Set<string>();

      const all = new Set<string>();
      (invoicePetlGrouped as any[]).forEach((g, idx) => all.add(getGroupKey(g, idx)));
      return all;
    })();

    const invoiceNo = String(activeInvoice.invoiceNo ?? "Draft invoice");
    const title = invoiceNo ? `Invoice ${invoiceNo}` : "Invoice";

    const logoUrl = `${window.location.origin}/nexus-logo-mark.png`;

    const headerHtml = `
      <div class="box">
        <div style="display:flex; align-items:center; justify-content:space-between; gap: 12px;">
          <div style="display:flex; align-items:center; gap: 10px;">
            <img src="${htmlEscape(logoUrl)}" alt="Nexus" style="height:44px; width:auto;" />
            <div>
              <div style="font-weight:900; letter-spacing:0.06em; font-size:14px; line-height:1;">NEXUS</div>
              <div class="muted" style="margin-top:2px;">Fortified Structures</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="muted">Invoice</div>
            <div style="font-weight:800; font-size:18px; line-height:1.1;">${htmlEscape(invoiceNo || "Invoice")}</div>
          </div>
        </div>

        <div class="muted" style="margin-top: 6px;">Status: ${htmlEscape(activeInvoice.status ?? "")}</div>

        <div class="meta">
          <div class="box">
            <div class="kv">
              <div class="k">Bill to</div><div class="v">${htmlEscape(activeInvoice.billToName ?? "")}</div>
              <div class="k">Email</div><div class="v">${htmlEscape(activeInvoice.billToEmail ?? "")}</div>
              <div class="k">Memo</div><div class="v">${htmlEscape(activeInvoice.memo ?? "")}</div>
            </div>
          </div>
          <div class="box">
            <div class="kv">
              <div class="k">Issued</div><div class="v">${htmlEscape(fmtDate(activeInvoice.issuedAt))}</div>
              <div class="k">Due</div><div class="v">${htmlEscape(fmtDate(activeInvoice.dueAt))}</div>
              <div class="k">Total</div><div class="v">${htmlEscape(fmtCurrency(activeInvoice.totalAmount ?? 0))}</div>
              <div class="k">Paid</div><div class="v">${htmlEscape(fmtCurrency(activeInvoice.paidAmount ?? 0))}</div>
              <div class="k">Balance</div><div class="v">${htmlEscape(fmtCurrency(activeInvoice.balanceDue ?? 0))}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const invoiceLinesHtml = (() => {
      const groups = activeInvoiceLineItemGroups;
      if (!groups || groups.length === 0) {
        return `<h2>Invoice line items</h2><div class="muted">No invoice line items.</div>`;
      }

      const rows = groups
        .flatMap((g) => {
          const out: string[] = [];
          out.push(`
            <tr class="group">
              <td colspan="6">${htmlEscape(g.label)} · ${htmlEscape(fmtCurrency(g.subtotal))}</td>
            </tr>
          `);

          for (const li of g.items) {
            const kind = String(li?.kind ?? "");
            const tag = String(li?.billingTag ?? "");
            out.push(`
              <tr>
                <td>${htmlEscape(kind)}</td>
                <td>${htmlEscape(tag)}</td>
                <td>${htmlEscape(li?.description ?? "")}</td>
                <td class="num">${htmlEscape(li?.qty ?? "")}</td>
                <td class="num">${htmlEscape(li?.unitPrice ?? "")}</td>
                <td class="num">${htmlEscape(fmtCurrency(li?.amount ?? 0))}</td>
              </tr>
            `);
          }
          return out;
        })
        .join("\n");

      return `
        <h2>Invoice line items</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 120px">Kind</th>
              <th style="width: 140px">Tag</th>
              <th>Description</th>
              <th class="num" style="width: 70px">Qty</th>
              <th class="num" style="width: 90px">Unit</th>
              <th class="num" style="width: 110px">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    })();

    const petlHtml = (() => {
      const lines = activeInvoicePetlLines;
      if (!lines || lines.length === 0) {
        return `<h2>Estimate line items (PETL)</h2><div class="muted">No PETL-derived invoice detail lines.</div>`;
      }

      const totalDelta = lines.reduce((sum, x) => sum + (Number(x?.thisInvTotal ?? 0) || 0), 0);

      if (wantGrouped) {
        const rows = (invoicePetlGrouped as any[])
          .flatMap((g, idx) => {
            const groupKey = getGroupKey(g, idx);
            const isOpen = openGroups.has(groupKey);
            const groupLabel = String(g?.groupLabel ?? g?.groupKey ?? "(Unlabeled)");

            const out: string[] = [];
            out.push(`
              <tr class="group">
                <td>${htmlEscape(groupLabel)}${!isOpen ? ` <span class="muted">(collapsed)</span>` : ""}</td>
                <td class="num">—</td>
                <td class="num">—</td>
                <td class="num">—</td>
                <td class="num">${htmlEscape(fmtCurrency(g?.subtotal ?? 0))}</td>
              </tr>
            `);

            if (!isOpen) return out;

            const groupLines = Array.isArray(g?.lines) ? g.lines : [];
            for (const li of groupLines) {
              const isCredit = String(li?.kind) === "ACV_HOLDBACK_CREDIT";
              const cat = String(li?.categoryCodeSnapshot ?? "").trim();
              const sel = String(li?.selectionCodeSnapshot ?? "").trim();
              const task = String(li?.descriptionSnapshot ?? "").trim();
              const lineNo = li?.lineNoSnapshot != null ? String(li.lineNoSnapshot) : "";

              const baseLabel = isCredit
                ? "ACV holdback (80%)"
                : `${lineNo}${cat || sel ? ` · ${cat}${sel ? `/${sel}` : ""}` : ""}${task ? ` · ${task}` : ""}`;

              const effectiveTag = getInvoicePetlEffectiveTag(li);
              const tagLabel = formatBillingTag(effectiveTag);

              const pct = li?.percentCompleteSnapshot != null ? `${Number(li.percentCompleteSnapshot).toFixed(0)}%` : "—";
              out.push(`
                <tr>
                  <td class="indent">${htmlEscape(baseLabel)}${tagLabel ? `<span class="tag">${htmlEscape(tagLabel)}</span>` : ""}</td>
                  <td class="num">${htmlEscape(pct)}</td>
                  <td class="num">${htmlEscape(fmtCurrency(li?.earnedTotal ?? 0))}</td>
                  <td class="num">${htmlEscape(fmtCurrency(li?.prevBilledTotal ?? 0))}</td>
                  <td class="num">${htmlEscape(fmtCurrency(li?.thisInvTotal ?? 0))}</td>
                </tr>
              `);
            }

            return out;
          })
          .join("\n");

        return `
          <h2>Estimate line items (PETL)</h2>
          <table>
            <thead>
              <tr>
                <th>Estimate Line Item</th>
                <th class="num" style="width: 70px">%</th>
                <th class="num" style="width: 100px">Earned</th>
                <th class="num" style="width: 110px">Prev billed</th>
                <th class="num" style="width: 110px">This (Δ)</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="4" class="num">Total PETL (Δ)</td>
                <td class="num">${htmlEscape(fmtCurrency(totalDelta))}</td>
              </tr>
            </tfoot>
          </table>
        `;
      }

      const sorted = [...lines].sort((a, b) => {
        const pa = String(a?.projectTreePathSnapshot ?? "");
        const pb = String(b?.projectTreePathSnapshot ?? "");
        if (pa !== pb) return pa.localeCompare(pb);
        const la = Number(a?.lineNoSnapshot ?? 0);
        const lb = Number(b?.lineNoSnapshot ?? 0);
        if (la !== lb) return la - lb;
        const ka = String(a?.kind ?? "");
        const kb = String(b?.kind ?? "");
        return ka.localeCompare(kb);
      });

      const rows = sorted
        .map((li: any) => {
          const isCredit = String(li?.kind) === "ACV_HOLDBACK_CREDIT";
          const cat = String(li?.categoryCodeSnapshot ?? "").trim();
          const sel = String(li?.selectionCodeSnapshot ?? "").trim();
          const task = String(li?.descriptionSnapshot ?? "").trim();
          const lineNo = li?.lineNoSnapshot != null ? String(li.lineNoSnapshot) : "";

          const baseLabel = isCredit
            ? "ACV holdback (80%)"
            : `${lineNo}${cat || sel ? ` · ${cat}${sel ? `/${sel}` : ""}` : ""}${task ? ` · ${task}` : ""}`;

          const effectiveTag = getInvoicePetlEffectiveTag(li);
          const tagLabel = formatBillingTag(effectiveTag);

          const pct = li?.percentCompleteSnapshot != null ? `${Number(li.percentCompleteSnapshot).toFixed(0)}%` : "—";

          return `
            <tr>
              <td>${htmlEscape(baseLabel)}${tagLabel ? `<span class="tag">${htmlEscape(tagLabel)}</span>` : ""}</td>
              <td>${htmlEscape(li?.projectParticleLabelSnapshot ?? "")}</td>
              <td>${htmlEscape(li?.projectUnitLabelSnapshot ?? "")}</td>
              <td>${htmlEscape(li?.projectBuildingLabelSnapshot ?? "")}</td>
              <td class="num">${htmlEscape(pct)}</td>
              <td class="num">${htmlEscape(fmtCurrency(li?.earnedTotal ?? 0))}</td>
              <td class="num">${htmlEscape(fmtCurrency(li?.prevBilledTotal ?? 0))}</td>
              <td class="num">${htmlEscape(fmtCurrency(li?.thisInvTotal ?? 0))}</td>
            </tr>
          `;
        })
        .join("\n");

      return `
        <h2>Estimate line items (PETL)</h2>
        <table>
          <thead>
            <tr>
              <th>Estimate Line Item</th>
              <th>Room</th>
              <th>Unit</th>
              <th>Building</th>
              <th class="num" style="width: 70px">%</th>
              <th class="num" style="width: 100px">Earned</th>
              <th class="num" style="width: 110px">Prev billed</th>
              <th class="num" style="width: 110px">This (Δ)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="7" class="num">Total PETL (Δ)</td>
              <td class="num">${htmlEscape(fmtCurrency(totalDelta))}</td>
            </tr>
          </tfoot>
        </table>
      `;
    })();

    const body = `${headerHtml}\n${invoiceLinesHtml}\n${petlHtml}`;
    printHtmlDocument(title, body);
  };

  const extractUnitGroupCode = (label: any) => {
    const s = String(label ?? "").trim();
    if (!s) return null;

    // e.g. "RISK__E - Risk - Exterior" or "ELECTRI — Electrical Room"
    // Note: group codes often contain underscores.
    const dashMatch = s.match(/^([A-Za-z0-9_]+)\s*[-–—].+$/);
    if (dashMatch) return dashMatch[1];

    // e.g. "RISK__E" or "ELECTRI Electrical Room" (building label is "CODE NAME")
    const firstToken = s.split(/\s+/)[0] ?? "";
    if (/^[A-Z0-9_]{3,}$/.test(firstToken)) return firstToken;

    return null;
  };

  const getInvoiceGroupLabels = (l: any) => {
    const buildingRaw = String(l?.projectBuildingLabelSnapshot ?? "").trim();
    const unitRaw = String(l?.projectUnitLabelSnapshot ?? "").trim();
    const roomRaw = String(l?.projectParticleLabelSnapshot ?? "").trim();

    const groupCode =
      extractUnitGroupCode(buildingRaw) ??
      extractUnitGroupCode(unitRaw) ??
      extractUnitGroupCode(roomRaw) ??
      null;

    const stripPrefix = (raw: string) => {
      if (!groupCode || !raw) return raw;
      const esc = groupCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const m = raw.match(new RegExp(`^${esc}\\s*[-–—]\\s*(.+)$`));
      return m?.[1] ? String(m[1]).trim() : raw;
    };

    const unit = stripPrefix(unitRaw) || null;
    const room = stripPrefix(roomRaw) || null;

    return {
      groupCode: groupCode || null,
      building: buildingRaw || null,
      unit,
      room,
    };
  };

  const activeInvoiceLineItemGroups = useMemo(() => {
    const items = Array.isArray(activeInvoice?.lineItems) ? activeInvoice.lineItems : [];

    const order = ["MANUAL", "BILLABLE_HOURS", "EQUIPMENT_RENTAL", "COST_BOOK", "OTHER"];
    const labelByKind: Record<string, string> = {
      MANUAL: "Manual",
      BILLABLE_HOURS: "Billable hours",
      EQUIPMENT_RENTAL: "Equipment rental",
      COST_BOOK: "From Cost Book",
      OTHER: "Other",
    };

    const groups = new Map<string, any[]>();
    for (const it of items) {
      const kind = String(it?.kind ?? "MANUAL").trim().toUpperCase() || "MANUAL";
      const bucket = groups.get(kind) ?? [];
      bucket.push(it);
      groups.set(kind, bucket);
    }

    const seen = new Set(order);
    const remainingKinds = [...groups.keys()]
      .filter((k) => !seen.has(k))
      .sort((a, b) => a.localeCompare(b));

    return [...order, ...remainingKinds]
      .map((kind) => {
        const groupItems = groups.get(kind) ?? [];
        const subtotal = groupItems.reduce(
          (sum, li) => sum + (Number(li?.amount ?? 0) || 0),
          0,
        );
        return {
          kind,
          label: labelByKind[kind] ?? kind,
          items: groupItems,
          subtotal,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [activeInvoice?.lineItems]);

  const submitAddInvoiceLinesFromCostBook = async (selection: CostBookSelection[]) => {
    if (!project) return;

    if (!activeInvoice || activeInvoice.status !== "DRAFT") {
      setInvoiceMessage("Open a draft invoice first (Open living invoice), then add Cost Book lines.");
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setInvoiceMessage("Missing access token.");
      return;
    }

    if (!selection || selection.length === 0) {
      setInvoiceMessage("No cost book items selected.");
      return;
    }

    setInvoiceMessage(null);
    setInvoiceCostBookPickerBusy(true);

    try {
      let lastInvoiceJson: any = null;

      // Add sequentially to preserve a predictable line ordering.
      for (const sel of selection) {
        const item = sel.item;
        const qty = sel.qty;

        const cat = String(item.cat ?? "").trim();
        const selCode = String(item.sel ?? "").trim();
        const baseDesc = String(item.description ?? "").trim();
        const prefix = cat || selCode ? `${cat}${selCode ? `/${selCode}` : ""}` : "";
        const description = prefix ? `${prefix}${baseDesc ? ` - ${baseDesc}` : ""}` : baseDesc;

        const unitPrice =
          typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice) ? item.unitPrice : 0;

        const res = await fetch(
          `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/lines`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              description: description || "(Cost Book item)",
              kind: "COST_BOOK",
              companyPriceListItemId: item.id,
              qty,
              unitPrice,
            }),
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to add cost book line (${res.status}) ${text}`);
        }

        lastInvoiceJson = await res.json();
      }

      if (lastInvoiceJson) {
        setActiveInvoice(lastInvoiceJson);
        setProjectInvoices(null);
      }

      setInvoiceMessage(`Added ${selection.length} cost book line(s).`);
      setInvoiceCostBookPickerOpen(false);
    } catch (err: any) {
      setInvoiceMessage(err?.message ?? "Failed to add cost book lines.");
    } finally {
      setInvoiceCostBookPickerBusy(false);
    }
  };

  const toggleInvoiceBuildingOpen = (buildingKey: string) => {
    setInvoiceGroupOpenBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(buildingKey)) next.delete(buildingKey);
      else next.add(buildingKey);
      return next;
    });
  };



  const invoicePetlBillingTagById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of activeInvoicePetlLines) {
      const id = String(l?.id ?? "").trim();
      if (!id) continue;
      const tag = String(l?.billingTag ?? "NONE").trim() || "NONE";
      map.set(id, tag);
    }
    return map;
  }, [activeInvoicePetlLines]);

  const getInvoicePetlEffectiveTag = (line: any): string => {
    const tag = String(line?.billingTag ?? "NONE").trim() || "NONE";
    if (tag !== "NONE") return tag;

    const parentId = String(line?.parentLineId ?? "").trim();
    if (!parentId) return "NONE";

    const parentTag = invoicePetlBillingTagById.get(parentId) ?? "NONE";
    return parentTag || "NONE";
  };

  const formatBillingTag = (tag: string) => {
    switch (tag) {
      case "PETL_LINE_ITEM":
        return "PETL Line Item";
      case "CHANGE_ORDER":
        return "Change Order";
      case "SUPPLEMENT":
        return "Supplement";
      case "WARRANTY":
        return "Warranty";
      default:
        return "";
    }
  };

  const invoicePetlGrouped = useMemo(() => {
    type Line = any;
    type Group = { groupKey: string; groupLabel: string; lines: Line[]; subtotal: number };

    // Goal: make Unit 01..15 the primary groups (no synthetic "Estimate line items" group row).
    // If a line has no Unit snapshot, fall back to group code / building label.
    const byGroup = new Map<string, Line[]>();

    for (const l of activeInvoicePetlLines) {
      const meta = getInvoiceGroupLabels(l);

      const unitLabel = String(meta.unit ?? "").trim();
      const fallbackLabel =
        String(meta.groupCode ?? "").trim() ||
        String(meta.building ?? "").trim() ||
        "(No unit)";

      const groupLabel = unitLabel || fallbackLabel;
      const groupKey = groupLabel;

      const bucket = byGroup.get(groupKey) ?? [];
      bucket.push(l);
      byGroup.set(groupKey, bucket);
    }

    const groups: Group[] = [];

    const parseUnitNo = (label: string): number | null => {
      const m = label.match(/^Unit\s*(\d+)/i);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    };

    for (const [groupKey, lines] of byGroup.entries()) {
      const sorted = [...lines].sort((a, b) => {
        const pa = String(a?.projectTreePathSnapshot ?? "");
        const pb = String(b?.projectTreePathSnapshot ?? "");
        if (pa !== pb) return pa.localeCompare(pb);
        const la = Number(a?.lineNoSnapshot ?? 0);
        const lb = Number(b?.lineNoSnapshot ?? 0);
        if (la !== lb) return la - lb;
        const ka = String(a?.kind ?? "");
        const kb = String(b?.kind ?? "");
        return ka.localeCompare(kb);
      });

      const subtotal = sorted.reduce((sum, x) => sum + (Number(x?.thisInvTotal ?? 0) || 0), 0);

      groups.push({ groupKey, groupLabel: groupKey, lines: sorted, subtotal });
    }

    groups.sort((a, b) => {
      const au = parseUnitNo(a.groupLabel);
      const bu = parseUnitNo(b.groupLabel);
      const aIsUnit = au != null;
      const bIsUnit = bu != null;
      // Put non-unit groups (e.g. ELECTRI) before unit groups.
      if (aIsUnit !== bIsUnit) return aIsUnit ? 1 : -1;
      // Unit groups sort numerically.
      if (aIsUnit && bIsUnit) return (au ?? 0) - (bu ?? 0);
      return a.groupLabel.localeCompare(b.groupLabel);
    });

    return groups;
  }, [activeInvoicePetlLines]);

  const [newInvoiceLineKind, setNewInvoiceLineKind] = useState<string>("MANUAL");
  const [newInvoiceLineBillingTag, setNewInvoiceLineBillingTag] = useState<string>("NONE");
  const [newInvoiceLineDesc, setNewInvoiceLineDesc] = useState("");
  const [newInvoiceLineQty, setNewInvoiceLineQty] = useState<string>("");
  const [newInvoiceLineUnitPrice, setNewInvoiceLineUnitPrice] = useState<string>("");
  const [newInvoiceLineAmount, setNewInvoiceLineAmount] = useState<string>("");

  const [invoiceCostBookPickerOpen, setInvoiceCostBookPickerOpen] = useState(false);
  const [invoiceCostBookPickerBusy, setInvoiceCostBookPickerBusy] = useState(false);

  const [issueBillToName, setIssueBillToName] = useState<string>("");
  const [issueBillToEmail, setIssueBillToEmail] = useState<string>("");
  const [issueMemo, setIssueMemo] = useState<string>("");
  const [issueDueAt, setIssueDueAt] = useState<string>("");

  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("ACH");
  const [payPaidAt, setPayPaidAt] = useState<string>("");
  const [payReference, setPayReference] = useState<string>("");
  const [payNote, setPayNote] = useState<string>("");
  const [recordPaymentSaving, setRecordPaymentSaving] = useState(false);

  const [projectPayments, setProjectPayments] = useState<any[] | null>(null);
  const [projectPaymentsLoading, setProjectPaymentsLoading] = useState(false);
  const [projectPaymentsError, setProjectPaymentsError] = useState<string | null>(null);

  // Reduce noise: keep the Payments card collapsed by default (persisted per project).
  const paymentsCollapsedStorageKey = `financialPaymentsCollapsed:v1:${id}`;
  const [paymentsCollapsed, setPaymentsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(paymentsCollapsedStorageKey);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(paymentsCollapsedStorageKey, paymentsCollapsed ? "1" : "0");
  }, [paymentsCollapsedStorageKey, paymentsCollapsed]);

  // Apply UI (per payment)
  const [applyInvoiceByPaymentId, setApplyInvoiceByPaymentId] = useState<Record<string, string>>({});
  const [applyAmountByPaymentId, setApplyAmountByPaymentId] = useState<Record<string, string>>({});
  const [applySavingPaymentId, setApplySavingPaymentId] = useState<string | null>(null);
  const [applyMessageByPaymentId, setApplyMessageByPaymentId] = useState<Record<string, string>>({});

  const projectPaymentsSorted = useMemo(() => {
    const payments = projectPayments;
    if (!Array.isArray(payments)) return [];

    const sortKey = (p: any) => {
      const raw = p?.paidAt ?? p?.createdAt ?? null;
      const t = raw ? new Date(raw).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };

    return [...payments].sort((a, b) => sortKey(b) - sortKey(a));
  }, [projectPayments]);

  const projectPaymentsTotal = useMemo(() => {
    return projectPaymentsSorted.reduce((sum, p: any) => sum + (Number(p?.amount ?? 0) || 0), 0);
  }, [projectPaymentsSorted]);

  const projectPaymentsUnappliedTotal = useMemo(() => {
    return projectPaymentsSorted.reduce(
      (sum, p: any) => sum + (Number(p?.unappliedAmount ?? 0) || 0),
      0,
    );
  }, [projectPaymentsSorted]);

  // Payroll roster (who has been paid on this project, including subs/1099s)
  const [payrollEmployees, setPayrollEmployees] = useState<ProjectEmployee[] | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);

  // Actor identity + project-level roles (for header display)
  const [actorDisplayName, setActorDisplayName] = useState<string | null>(null);
  const [actorProjectRoles, setActorProjectRoles] = useState<string[] | null>(null);

  const isPmOrAbove = useMemo(() => {
    const projectRoleOk =
      (actorProjectRoles ?? []).includes("OWNER") || (actorProjectRoles ?? []).includes("MANAGER");
    const companyRoleOk = actorCompanyRole === "OWNER" || actorCompanyRole === "ADMIN";
    const globalOk = actorGlobalRole === "SUPER_ADMIN";
    return globalOk || companyRoleOk || projectRoleOk;
  }, [actorProjectRoles, actorCompanyRole, actorGlobalRole]);

  const isAdminOrAbove = useMemo(() => {
    const companyRoleOk = actorCompanyRole === "OWNER" || actorCompanyRole === "ADMIN";
    const globalOk = actorGlobalRole === "SUPER_ADMIN";
    return globalOk || companyRoleOk;
  }, [actorCompanyRole, actorGlobalRole]);

  const [petlDeleteBusy, setPetlDeleteBusy] = useState(false);
  const [petlDeleteMessage, setPetlDeleteMessage] = useState<string | null>(null);

  const [petlDiagnosticsModalOpen, setPetlDiagnosticsModalOpen] = useState(false);
  const [adminPetlToolsModalOpen, setAdminPetlToolsModalOpen] = useState(false);

  const deletePetlLineItem = async (item: PetlItem) => {
    setPetlDeleteMessage(null);
    if (!isAdminOrAbove) {
      setPetlDeleteMessage("Only Admin+ can delete PETL line items.");
      return;
    }

    const ok = window.confirm(
      `Delete PETL line #${item.lineNo}?\n\nThis will permanently remove the line item and associated reconciliation/edit history for this line.`,
    );
    if (!ok) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPetlDeleteMessage("Missing access token.");
      return;
    }

    try {
      setPetlDeleteBusy(true);

      await busyOverlay.run(`Deleting line #${item.lineNo}…`, async () => {
        const res = await fetch(`${API_BASE}/projects/${id}/petl/${item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setPetlDeleteMessage(`Delete failed (${res.status}). ${text || ""}`.trim());
          return;
        }

        // Update local UI immediately.
        setPetlItems(prev => prev.filter(it => it.id !== item.id));
        setPetlReconActivityIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setPetlReconFlagIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });

        if (petlReconPanel.open && petlReconPanel.sowItemId === item.id) {
          setPetlReconPanel(prev => ({ ...prev, open: false }));
        }

        // Refresh PETL + groups + summary from server.
        setPetlReloadTick(t => t + 1);

        setPetlDeleteMessage(`Deleted line #${item.lineNo}.`);
      });
    } catch (err: any) {
      setPetlDeleteMessage(err?.message ?? "Delete failed.");
    } finally {
      setPetlDeleteBusy(false);
    }
  };

  const deletePetlAndComponents = async () => {
    setPetlDeleteMessage(null);
    if (!isAdminOrAbove) {
      setPetlDeleteMessage("Only Admin+ can delete PETL/components.");
      return;
    }

    const ok = window.confirm(
      "Delete PETL + Components for this project?\n\nThis wipes all imported estimate versions, PETL line items, components, and related reconciliation/edit data. This cannot be undone.",
    );
    if (!ok) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPetlDeleteMessage("Missing access token.");
      return;
    }

    try {
      setPetlDeleteBusy(true);

      await busyOverlay.run("Deleting PETL + components…", async () => {
        const res = await fetch(`${API_BASE}/projects/${id}/petl`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setPetlDeleteMessage(`Delete failed (${res.status}). ${text || ""}`.trim());
          return;
        }

        // Reset local PETL state immediately.
        setPetlItems([]);
        setPetlReconciliationEntries([]);
        setPetlReconActivityIds(new Set());
        setGroups([]);
        setUnitGroups([]);
        setSelectionSummary(null);
        setPetlItemCount(0);
        setPetlTotalAmount(0);
        setComponentsCount(0);
        setPetlReconFlagIds(new Set());

        if (petlReconPanel.open) {
          setPetlReconPanel(prev => ({ ...prev, open: false }));
        }

        // Reload summary endpoints.
        setPetlReloadTick(t => t + 1);

        setPetlDeleteMessage("Deleted PETL + components for this project.");
      });
    } catch (err: any) {
      setPetlDeleteMessage(err?.message ?? "Delete failed.");
    } finally {
      setPetlDeleteBusy(false);
    }
  };

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [dailyLogsLoading, setDailyLogsLoading] = useState(false);
  const [dailyLogSaving, setDailyLogSaving] = useState(false);
  const [dailyLogMessage, setDailyLogMessage] = useState<string | null>(null);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [showPendingClientOnly, setShowPendingClientOnly] = useState(false);
  // Person/s onsite multi-select state for Daily Logs
  const [personOnsiteList, setPersonOnsiteList] = useState<string[]>([]);
  const [personOnsiteDraft, setPersonOnsiteDraft] = useState<string>("");
  const [personOnsiteGroups, setPersonOnsiteGroups] = useState<
    { id: string; name: string; members: string[] }[]
  >([]);
  const [selectedPersonOnsiteGroupId, setSelectedPersonOnsiteGroupId] = useState<string>("");
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

  // PETL reconciliation drawer
  const [petlReconPanel, setPetlReconPanel] = useState<{
    open: boolean;
    sowItemId: string | null;
    loading: boolean;
    error: string | null;
    data: any | null;
  }>({ open: false, sowItemId: null, loading: false, error: null, data: null });

  const [reconCreditComponents, setReconCreditComponents] = useState<{
    itemAmount: boolean;
    salesTaxAmount: boolean;
    opAmount: boolean;
  }>({ itemAmount: true, salesTaxAmount: true, opAmount: true });

  const [reconNote, setReconNote] = useState<string>("");

  type ReconEntryTag = "" | "SUPPLEMENT" | "CHANGE_ORDER" | "OTHER" | "WARRANTY";
  const [reconEntryTag, setReconEntryTag] = useState<ReconEntryTag>("");

  const [reconPlaceholderKind, setReconPlaceholderKind] = useState<string>(
    "NOTE_ONLY",
  );

  const [reconEntryEdit, setReconEntryEdit] = useState<
    | null
    | {
        entry: any;
        draft: {
          tag: ReconEntryTag;
          description: string;
          note: string;
          rcvAmount: string;
        };
        saving: boolean;
        error: string | null;
      }
  >(null);

  const [costBookModalOpen, setCostBookModalOpen] = useState(false);
  const [petlCostBookPickerBusy, setPetlCostBookPickerBusy] = useState(false);

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

  // Precompute a breadcrumb label for each room particle so click handlers don't
  // have to walk/flatten the hierarchy tree (helps INP on PETL buttons).
  const roomBreadcrumbByParticleId = useMemo(() => {
    const map = new Map<string, string>();
    if (!hierarchy) return map;

    const formatBuilding = (b: any) => `${b?.code || ""} ${b?.name || ""}`.trim();
    const formatUnit = (u: any) => {
      if (!u) return "";
      const floorLabel = typeof u.floor === "number" ? ` (Floor ${u.floor})` : "";
      return `${u.label || ""}${floorLabel}`.trim();
    };
    const formatRoom = (p: any) => (p?.fullLabel || p?.name || "").trim();

    for (const b of hierarchy.buildings ?? []) {
      for (const u of b.units ?? []) {
        for (const p of u.particles ?? []) {
          const parts = [formatBuilding(b), formatUnit(u), formatRoom(p)].filter(Boolean);
          if (p?.id) map.set(p.id, parts.join(" · "));
        }
      }
      for (const p of b.particles ?? []) {
        const parts = [formatBuilding(b), formatRoom(p)].filter(Boolean);
        if (p?.id) map.set(p.id, parts.join(" · "));
      }
    }

    for (const u of hierarchy.units ?? []) {
      for (const p of u.particles ?? []) {
        const parts = [formatUnit(u), formatRoom(p)].filter(Boolean);
        if (p?.id) map.set(p.id, parts.join(" · "));
      }
    }

    return map;
  }, [hierarchy]);

  // Avoid O(rooms * items) filtering during render of the Rooms/Zones table.
  // Build a lookup map once per PETL/filter change.
  const petlItemsByRoomParticleId = useMemo(() => {
    const map = new Map<string, PetlItem[]>();

    for (const item of petlItems) {
      const particleId = item.projectParticle?.id;
      if (!particleId) continue;

      if (roomParticleIdFilterSet.size > 0 && !roomParticleIdFilterSet.has(particleId)) {
        continue;
      }

      if (categoryCodeFilterSet.size > 0) {
        const code = item.categoryCode ?? "";
        if (!code || !categoryCodeFilterSet.has(code)) continue;
      }

      if (selectionCodeFilterSet.size > 0) {
        const code = item.selectionCode ?? "";
        if (!code || !selectionCodeFilterSet.has(code)) continue;
      }

      const existing = map.get(particleId);
      if (existing) existing.push(item);
      else map.set(particleId, [item]);
    }

    // Ensure consistent ordering for the per-room expanded list.
    for (const items of map.values()) {
      items.sort((a, b) => a.lineNo - b.lineNo);
    }

    return map;
  }, [petlItems, roomParticleIdFilterSet, categoryCodeFilterSet, selectionCodeFilterSet]);

  // Derived list of known project participants for use in the Daily Log
  // "Person/s onsite" multi-select. We include both myOrganization and
  // collaborators, deduplicated by display label.
  const personOnsiteOptions = useMemo(() => {
    if (!participants) return [] as { value: string; label: string }[];

    const opts: { value: string; label: string }[] = [];

    const addParticipant = (m: Participant) => {
      const user: any = m.user as any;
      const first = (user?.firstName || "").trim();
      const last = (user?.lastName || "").trim();
      const name = [first, last].filter(Boolean).join(" ");
      const label = name || (user?.email as string) || "(user)";
      if (!label) return;
      opts.push({ value: label, label });
    };

    for (const m of participants.myOrganization ?? []) addParticipant(m as any);
    for (const m of participants.collaborators ?? []) addParticipant(m as any);

    const seen = new Set<string>();
    const deduped = opts.filter(opt => {
      const key = opt.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort((a, b) => a.label.localeCompare(b.label));
    return deduped;
  }, [participants]);

  // Helper to keep Person/s onsite list, backing string, and manpower count in sync.
  function updatePersonOnsiteList(updater: (prev: string[]) => string[]) {
    setPersonOnsiteList(prevNames => {
      const next = updater(prevNames).map(name => name.trim()).filter(Boolean);
      const joined = next.join(", ");
      setNewDailyLog(prevLog => ({
        ...prevLog,
        personOnsite: joined,
        manpowerOnsite: next.length ? String(next.length) : "",
      }));
      return next;
    });
  }

  // Favorite Person/s onsite groups (saved locally per project).
  useEffect(() => {
    if (!project) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`dailyLogPersonGroups:${project.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed
        .filter((g: any) => g && typeof g.name === "string" && Array.isArray(g.members))
        .map((g: any) => ({
          id: String(g.id ?? `${g.name}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(g.name),
          members: g.members.map((m: any) => String(m)).filter((m: string) => !!m.trim()),
        }));
      setPersonOnsiteGroups(cleaned);
    } catch {
      // ignore localStorage parsing errors
    }
  }, [project]);

  function persistPersonOnsiteGroups(next: { id: string; name: string; members: string[] }[]) {
    setPersonOnsiteGroups(next);
    if (typeof window !== "undefined" && project) {
      try {
        window.localStorage.setItem(`dailyLogPersonGroups:${project.id}`, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    }
  }

  const [structureOpen, setStructureOpen] = useState(false);

  // Split "which tab is highlighted" from "which tab content is mounted".
  // Switching content can be expensive (unmounting a large tab + mounting PETL), so we
  // update the underline immediately, then transition the content change on the next frame.
  const [activeTab, setActiveTab] = useState<TabKey>("SUMMARY");
  const [activeTabUi, setActiveTabUi] = useState<TabKey>("SUMMARY");
  const [, startTabTransition] = useTransition();

  const setTab = useCallback(
    (next: TabKey, opts?: { deferContentSwitch?: boolean }) => {
      setActiveTabUi(next);

      if (opts?.deferContentSwitch) {
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            startTabTransition(() => setActiveTab(next));
          });
        } else {
          setActiveTab(next);
        }
        return;
      }

      setActiveTab(next);
    },
    [startTabTransition],
  );

  // PETL UI is very heavy to mount; show a lightweight shell first so the tab content
  // paints quickly, then mount the full PETL UI on the next frame.
  const [petlTabMounted, setPetlTabMounted] = useState(false);
  useEffect(() => {
    if (activeTab !== "PETL") {
      setPetlTabMounted(false);
      return;
    }

    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      setPetlTabMounted(true);
    });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [activeTab]);

  // PETL fetch is expensive; avoid duplicate in-flight loads and avoid re-fetching
  // on simple tab switches (SUMMARY <-> PETL) unless explicitly reloaded.
  const petlLoadInFlightRef = useRef(false);
  const petlLastSuccessfulLoadRef = useRef<null | { projectId: string; reloadTick: number }>(
    null,
  );

  // Load/save reconciliation flags per project.
  useEffect(() => {
    if (!project || typeof window === "undefined") return;
    const key = `petlReconFlags:${project.id}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setPetlReconFlagIds(new Set());
        return;
      }
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) {
        setPetlReconFlagIds(new Set(ids.filter((v) => typeof v === "string")));
      }
    } catch {
      setPetlReconFlagIds(new Set());
    }
  }, [project]);

  useEffect(() => {
    if (!project || typeof window === "undefined") return;
    const key = `petlReconFlags:${project.id}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(Array.from(petlReconFlagIds)));
    } catch {
      // ignore storage errors
    }
  }, [project, petlReconFlagIds]);

  // Default Time Accounting link to "today" for this project
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Reveal PID only after user clicks the project name in the header
  const [showPid, setShowPid] = useState(false);


  // Project header edit state
  const [editProjectMode, setEditProjectMode] = useState(false);

  // The project page is very large; toggling edit mode can cause a noticeable UI stall.
  // Track it as a transition and surface a delayed overlay (after 20ms) so the click
  // feels responsive even when React has heavy work to do.
  const [isEditTransitionPending, startEditTransition] = useTransition();
  const editTransitionOverlayLabelRef = useRef<string>("Working…");
  const editTransitionOverlayDoneRef = useRef<null | (() => void)>(null);

  // PETL tab is also heavy (large tables, filtering, reconciliation drawer). Use a
  // dedicated transition so PETL UI work yields and the delayed overlay can show.
  const [isPetlTransitionPending, startPetlTransition] = useTransition();
  const petlTransitionOverlayLabelRef = useRef<string>("Working…");
  const petlTransitionOverlayDoneRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (isEditTransitionPending) {
      if (!editTransitionOverlayDoneRef.current) {
        editTransitionOverlayDoneRef.current = busyOverlay.begin(
          editTransitionOverlayLabelRef.current,
        );
      }
      return;
    }

    if (editTransitionOverlayDoneRef.current) {
      editTransitionOverlayDoneRef.current();
      editTransitionOverlayDoneRef.current = null;
    }
  }, [isEditTransitionPending, busyOverlay.begin]);

  useEffect(() => {
    if (isPetlTransitionPending) {
      if (!petlTransitionOverlayDoneRef.current) {
        petlTransitionOverlayDoneRef.current = busyOverlay.begin(
          petlTransitionOverlayLabelRef.current,
        );
      }
      return;
    }

    if (petlTransitionOverlayDoneRef.current) {
      petlTransitionOverlayDoneRef.current();
      petlTransitionOverlayDoneRef.current = null;
    }
  }, [isPetlTransitionPending, busyOverlay.begin]);

  // SOP: when PETL is doing real work (network + heavy table renders), show the
  // delayed overlay automatically based on the existing loading flags.
  const petlLoadingOverlayDoneRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    // Only show this overlay when the user is actually on the PETL tab.
    if (activeTab !== "PETL") {
      if (petlLoadingOverlayDoneRef.current) {
        petlLoadingOverlayDoneRef.current();
        petlLoadingOverlayDoneRef.current = null;
      }
      return;
    }

    if (petlLoading) {
      if (!petlLoadingOverlayDoneRef.current) {
        busyOverlay.setMessage("Loading PETL…");
        petlLoadingOverlayDoneRef.current = busyOverlay.begin("Loading PETL…");
      }
      return;
    }

    if (petlLoadingOverlayDoneRef.current) {
      petlLoadingOverlayDoneRef.current();
      petlLoadingOverlayDoneRef.current = null;
    }
  }, [activeTab, busyOverlay.begin, busyOverlay.setMessage, petlLoading]);

  const pendingApprovalsOverlayDoneRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    if (activeTab !== "PETL") {
      if (pendingApprovalsOverlayDoneRef.current) {
        pendingApprovalsOverlayDoneRef.current();
        pendingApprovalsOverlayDoneRef.current = null;
      }
      return;
    }

    if (pendingPetlLoading) {
      if (!pendingApprovalsOverlayDoneRef.current) {
        busyOverlay.setMessage("Loading approvals…");
        pendingApprovalsOverlayDoneRef.current = busyOverlay.begin(
          "Loading approvals…",
        );
      }
      return;
    }

    if (pendingApprovalsOverlayDoneRef.current) {
      pendingApprovalsOverlayDoneRef.current();
      pendingApprovalsOverlayDoneRef.current = null;
    }
  }, [activeTab, busyOverlay.begin, busyOverlay.setMessage, pendingPetlLoading]);

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

  const invoiceFullscreen = searchParams?.get("invoiceFullscreen") === "1";
  const invoiceIdFromUrl = searchParams?.get("invoiceId") || null;

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
      setTab(tab as TabKey);
    } else if (tab.toUpperCase() === "PETL") {
      setTab("PETL");
    }
  }, [searchParams, setTab]);

  const overallSummary = useMemo(() => {
    if (petlItems.length === 0 && petlReconciliationEntries.length === 0) {
      return null;
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

    for (const entry of petlReconciliationEntries) {
      const amt = entry?.rcvAmount ?? 0;
      const pct = entry?.isPercentCompleteLocked ? 0 : (entry?.percentComplete ?? 0);
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
  }, [petlItems, petlReconciliationEntries]);

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

  // Reconciliation entries grouped by parent PETL sowItemId.
  const reconEntriesBySowItemId = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const entry of petlReconciliationEntries) {
      const parentId = String(entry?.parentSowItemId ?? "").trim();
      if (!parentId) continue;
      const arr = map.get(parentId);
      if (arr) arr.push(entry);
      else map.set(parentId, [entry]);
    }

    // Keep deterministic order for rendering and numbering.
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ta = new Date(a?.createdAt ?? 0).getTime();
        const tb = new Date(b?.createdAt ?? 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
      });
      map.set(k, arr);
    }

    return map;
  }, [petlReconciliationEntries]);

  // UI: expand/collapse reconciliation sub-lines per PETL line item.
  const [petlReconExpandedIds, setPetlReconExpandedIds] = useState<Set<string>>(
    () => new Set(),
  );

  // When entering "Reconciliation only" mode, auto-expand all lines that have reconciliation activity.
  useEffect(() => {
    if (petlDisplayMode !== "RECONCILIATION_ONLY") return;
    setPetlReconExpandedIds(new Set(Array.from(petlReconActivityIds)));
  }, [petlDisplayMode, petlReconActivityIds]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of petlItems) {
      if (item.categoryCode) set.add(item.categoryCode);
    }
    for (const entry of petlReconciliationEntries) {
      const cat = entry?.categoryCode;
      if (typeof cat === "string" && cat.trim()) set.add(cat);
    }
    return Array.from(set.values()).sort();
  }, [petlItems, petlReconciliationEntries]);

  const selectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of petlItems) {
      if (item.selectionCode) set.add(item.selectionCode);
    }
    for (const entry of petlReconciliationEntries) {
      const sel = entry?.selectionCode;
      if (typeof sel === "string" && sel.trim()) set.add(sel);
    }
    return Array.from(set.values()).sort();
  }, [petlItems, petlReconciliationEntries]);

  const hasReconciliationActivity = (sowItemId: string) => {
    return petlReconActivityIds.has(sowItemId);
  };

  const matchesFilters = (item: PetlItem) => {
    const particleId = item.projectParticle?.id ?? null;
    const recon = reconEntriesBySowItemId.get(item.id) ?? [];

    if (roomParticleIdFilterSet.size > 0) {
      const candidateParticleIds = new Set<string>();
      if (particleId) candidateParticleIds.add(particleId);
      for (const e of recon) {
        const pid = String(e?.projectParticleId ?? "").trim();
        if (pid) candidateParticleIds.add(pid);
      }

      // Must match at least one particle.
      const ok = Array.from(candidateParticleIds).some((pid) => roomParticleIdFilterSet.has(pid));
      if (!ok) return false;
    }

    if (categoryCodeFilterSet.size > 0) {
      const itemCode = String(item.categoryCode ?? "").trim();
      const reconCodes = recon.map((e) => String(e?.categoryCode ?? "").trim()).filter(Boolean);
      if (!itemCode && reconCodes.length === 0) return false;
      const ok =
        (itemCode && categoryCodeFilterSet.has(itemCode)) ||
        reconCodes.some((c) => categoryCodeFilterSet.has(c));
      if (!ok) return false;
    }

    if (selectionCodeFilterSet.size > 0) {
      const itemCode = String(item.selectionCode ?? "").trim();
      const reconCodes = recon.map((e) => String(e?.selectionCode ?? "").trim()).filter(Boolean);
      if (!itemCode && reconCodes.length === 0) return false;
      const ok =
        (itemCode && selectionCodeFilterSet.has(itemCode)) ||
        reconCodes.some((c) => selectionCodeFilterSet.has(c));
      if (!ok) return false;
    }

    return true;
  };


  const petlFlatItems = useMemo(() => {
    const filtered = petlItems.filter((it) => {
      if (!matchesFilters(it)) return false;
      if (petlDisplayMode === "RECONCILIATION_ONLY") {
        return petlReconActivityIds.has(it.id);
      }
      return true;
    });

    filtered.sort((a, b) => a.lineNo - b.lineNo);
    return filtered;
  }, [
    petlItems,
    petlReconciliationEntries,
    reconEntriesBySowItemId,
    petlDisplayMode,
    petlReconActivityIds,
    roomParticleIdFilterSet,
    categoryCodeFilterSet,
    selectionCodeFilterSet,
  ]);

  const petlFlatListRef = useRef<HTMLDivElement | null>(null);

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

    const shouldLoadPetl =
      activeTab === "PETL" ||
      activeTab === "STRUCTURE" ||
      activeTab === "SUMMARY" ||
      petlDiagnosticsModalOpen ||
      adminPetlToolsModalOpen;

    if (!shouldLoadPetl) {
      // SUMMARY also benefits from PETL data for overall/selection summaries
      return;
    }

    // Avoid double-fetching when the user toggles tabs quickly.
    if (petlLoadInFlightRef.current) return;

    // If we already loaded successfully for the current reload tick, don't re-fetch
    // just because the tab switched.
    const last = petlLastSuccessfulLoadRef.current;
    const alreadyLoadedForTick =
      last?.projectId === project.id && last?.reloadTick === petlReloadTick;

    if (alreadyLoadedForTick && !petlDiagnosticsModalOpen && !adminPetlToolsModalOpen) {
      return;
    }

    let cancelled = false;

    const loadPetl = async () => {
      petlLoadInFlightRef.current = true;

      const petlUrl = `${API_BASE}/projects/${project.id}/petl`;
      const groupsUrl = `${API_BASE}/projects/${project.id}/petl-groups`;
      const summaryUrl = `${API_BASE}/projects/${project.id}/estimate-summary`;

      try {
        setPetlLoading(true);
        setPetlLoadError(null);

        const [petlRes, groupsRes, summaryRes] = await Promise.all([
          fetch(petlUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(groupsUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(summaryUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const debug: any = {
          requestedAt: new Date().toISOString(),
          apiBase: API_BASE,
          projectId: project.id,
          petl: {
            url: petlUrl,
            status: petlRes.status,
            ok: petlRes.ok,
          },
          groups: {
            url: groupsUrl,
            status: groupsRes.status,
            ok: groupsRes.ok,
          },
          estimateSummary: {
            url: summaryUrl,
            status: summaryRes.status,
            ok: summaryRes.ok,
          },
        };

        // PETL
        if (!cancelled && petlRes.ok) {
          const petl: any = await petlRes.json();
          const items: PetlItem[] = Array.isArray(petl.items) ? petl.items : [];
          const recon: any[] = Array.isArray(petl.reconciliationEntries)
            ? petl.reconciliationEntries
            : [];
          const activityIds: string[] = Array.isArray(petl.reconciliationActivitySowItemIds)
            ? petl.reconciliationActivitySowItemIds
            : [];

          setPetlItems(items);
          setPetlReconciliationEntries(recon);
          setPetlReconActivityIds(
            new Set(activityIds.filter((v) => typeof v === "string" && v.length > 0)),
          );

          // Mark this reload tick as successfully loaded so tab switches don't trigger
          // redundant refreshes.
          petlLastSuccessfulLoadRef.current = { projectId: project.id, reloadTick: petlReloadTick };

          debug.petl.estimateVersionId = petl?.estimateVersionId ?? null;
          debug.petl.itemsCount = items.length;
          debug.petl.reconciliationEntriesCount = recon.length;
          debug.petl.reconciliationActivitySowItemIdsCount = activityIds.length;
        } else if (!cancelled && !petlRes.ok) {
          const text = await petlRes.text().catch(() => "");
          debug.petl.errorText = text.slice(0, 5000);

          setPetlItems([]);
          setPetlReconciliationEntries([]);
          setPetlReconActivityIds(new Set());

          setPetlLoadError(
            `PETL fetch failed (${petlRes.status}). ${text || "<empty response>"}`.slice(0, 8000),
          );
          setPetlShowDiagnostics(true);
        }

        // Groups
        if (!cancelled && groupsRes.ok) {
          const json: any = await groupsRes.json();
          setGroups(Array.isArray(json.groups) ? json.groups : []);
          setUnitGroups(Array.isArray(json.unitGroups) ? json.unitGroups : []);
          debug.groups.groupsCount = Array.isArray(json.groups) ? json.groups.length : 0;
          debug.groups.unitGroupsCount = Array.isArray(json.unitGroups) ? json.unitGroups.length : 0;
        } else if (!cancelled && !groupsRes.ok) {
          const text = await groupsRes.text().catch(() => "");
          debug.groups.errorText = text.slice(0, 2000);
        }

        // Estimate summary
        if (!cancelled && summaryRes.ok) {
          const summary: any = await summaryRes.json();
          setPetlItemCount(typeof summary.itemCount === "number" ? summary.itemCount : null);
          setPetlTotalAmount(typeof summary.totalAmount === "number" ? summary.totalAmount : null);
          setComponentsCount(typeof summary.componentsCount === "number" ? summary.componentsCount : null);

          debug.estimateSummary.itemCount = summary?.itemCount ?? null;
          debug.estimateSummary.totalAmount = summary?.totalAmount ?? null;
          debug.estimateSummary.componentsCount = summary?.componentsCount ?? null;
        } else if (!cancelled && !summaryRes.ok) {
          const text = await summaryRes.text().catch(() => "");
          debug.estimateSummary.errorText = text.slice(0, 2000);
        }

        if (!cancelled) {
          setPetlLastLoadDebug(debug);
        }
      } catch (err: any) {
        if (cancelled) return;
        setPetlItems([]);
        setPetlReconciliationEntries([]);
        setPetlReconActivityIds(new Set());
        setPetlLoadError(err?.message ?? "PETL fetch failed (network error)");
        setPetlShowDiagnostics(true);
        setPetlLastLoadDebug({
          requestedAt: new Date().toISOString(),
          apiBase: API_BASE,
          projectId: project.id,
          error: err?.message ?? String(err),
        });
      } finally {
        petlLoadInFlightRef.current = false;
        if (!cancelled) setPetlLoading(false);
      }
    };

    void loadPetl();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab, petlReloadTick, petlDiagnosticsModalOpen, adminPetlToolsModalOpen]);

  // Load pending PETL % update sessions (PM/owner/admin only)
  useEffect(() => {
    if (!project) return;
    if (activeTab !== "PETL") return;

    // Clear when not allowed so we don't show stale data after role changes.
    if (!isPmOrAbove) {
      setPendingPetlSessions(null);
      setPendingPetlError(null);
      setPendingPetlLoading(false);
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let cancelled = false;

    const loadPending = async () => {
      setPendingPetlLoading(true);
      setPendingPetlError(null);
      try {
        const res = await fetch(
          `${API_BASE}/projects/${project.id}/petl/percent-updates/pending`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (cancelled) return;

        if (res.status === 403) {
          // Hide queue for non-PM roles.
          setPendingPetlSessions(null);
          return;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load pending approvals (${res.status}) ${text}`);
        }

        const json: any = await res.json();
        setPendingPetlSessions(Array.isArray(json) ? json : []);
      } catch (err: any) {
        if (!cancelled) {
          setPendingPetlError(err?.message ?? "Failed to load pending approvals.");
        }
      } finally {
        if (!cancelled) setPendingPetlLoading(false);
      }
    };

    void loadPending();

    return () => {
      cancelled = true;
    };
  }, [project, activeTab, isPmOrAbove, pendingPetlReloadTick]);

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

  // Load organization-related metadata (company members, tags, participants, actor roles).
  // Keep this available for PM-gated actions in PETL/FINANCIAL tabs as well.
  useEffect(() => {
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const shouldLoad =
      activeTab === "SUMMARY" ||
      activeTab === "DAILY_LOGS" ||
      activeTab === "PETL" ||
      activeTab === "FINANCIAL";
    if (!shouldLoad) return;

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

    for (const roomParticleId of roomParticleIdFilters) {
      params.append("roomParticleId", roomParticleId);
    }
    for (const categoryCode of categoryCodeFilters) {
      params.append("categoryCode", categoryCode);
    }
    for (const selectionCode of selectionCodeFilters) {
      params.append("selectionCode", selectionCode);
    }

    let cancelled = false;

    // Always use the server for selection rollups so reconciliation adjustments
    // are included (even when no filters are set).
    fetch(
      `${API_BASE}/projects/${project.id}/petl-selection-summary?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json) return;
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

    return () => {
      cancelled = true;
    };
  }, [project, roomParticleIdFilters, categoryCodeFilters, selectionCodeFilters, petlItems]);

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

  // Lazy-load bills list when Financial tab is opened
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;
    if (activeTab !== "FINANCIAL") return;
    if (projectBills) return;

    let cancelled = false;

    setProjectBillsLoading(true);
    setProjectBillsError(null);

    fetch(`${API_BASE}/projects/${project.id}/bills`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: any) => {
        if (cancelled) return;
        setProjectBills(Array.isArray(json) ? json : []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setProjectBillsError(err?.message ?? "Failed to load bills.");
      })
      .finally(() => {
        if (cancelled) return;
        setProjectBillsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, project, projectBills]);

  // Lazy-load project files for bill attachment picker
  useEffect(() => {
    if (!billModalOpen) return;
    if (!project) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    if (billAttachmentFileOptions) return;

    let cancelled = false;

    setBillAttachmentFileLoading(true);
    setBillAttachmentFileError(null);

    fetch(`${API_BASE}/projects/${project.id}/files`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: any) => {
        if (cancelled) return;
        setBillAttachmentFileOptions(Array.isArray(json) ? json : []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setBillAttachmentFileError(err?.message ?? "Failed to load project files.");
      })
      .finally(() => {
        if (cancelled) return;
        setBillAttachmentFileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [billModalOpen, project, billAttachmentFileOptions]);

  // Lazy-load invoices list when Financial tab is opened
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;
    if (activeTab !== "FINANCIAL") return;
    if (projectInvoices) return;

    let cancelled = false;

    setProjectInvoicesLoading(true);
    setProjectInvoicesError(null);

    fetch(`${API_BASE}/projects/${project.id}/invoices`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: any) => {
        if (cancelled) return;
        setProjectInvoices(Array.isArray(json) ? json : []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setProjectInvoicesError(err?.message ?? "Failed to load invoices.");
      })
      .finally(() => {
        if (cancelled) return;
        setProjectInvoicesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, project, projectInvoices]);

  // If the URL requests a specific invoice, load it automatically (useful for full-screen invoice tabs).
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;
    if (activeTab !== "FINANCIAL") return;
    if (!invoiceIdFromUrl) return;

    // Avoid reloading if already active.
    if (String(activeInvoice?.id ?? "") === invoiceIdFromUrl) return;

    let cancelled = false;

    setActiveInvoiceLoading(true);
    setActiveInvoiceError(null);

    fetch(`${API_BASE}/projects/${project.id}/invoices/${invoiceIdFromUrl}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load invoice (${res.status}) ${text}`);
        }
        return res.json();
      })
      .then((json: any) => {
        if (cancelled) return;
        setActiveInvoice(json);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setActiveInvoiceError(err?.message ?? "Failed to load invoice.");
      })
      .finally(() => {
        if (cancelled) return;
        setActiveInvoiceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, project, invoiceIdFromUrl]);

  // Lazy-load project payments (cash receipts) when Financial tab is opened.
  // If the Payments card is collapsed, defer loading until the user expands it.
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || !project) return;
    if (activeTab !== "FINANCIAL") return;
    if (paymentsCollapsed) return;
    if (projectPayments) return;

    let cancelled = false;

    setProjectPaymentsLoading(true);
    setProjectPaymentsError(null);

    fetch(`${API_BASE}/projects/${project.id}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: any) => {
        if (cancelled) return;
        setProjectPayments(Array.isArray(json) ? json : []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setProjectPaymentsError(err?.message ?? "Failed to load payments.");
      })
      .finally(() => {
        if (cancelled) return;
        setProjectPaymentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, project, projectPayments, paymentsCollapsed]);

  // Keep issue form defaults in sync with the currently opened invoice
  useEffect(() => {
    if (!activeInvoice) return;
    setIssueBillToName(String(activeInvoice.billToName ?? ""));
    setIssueBillToEmail(String(activeInvoice.billToEmail ?? ""));
    setIssueMemo(String(activeInvoice.memo ?? ""));
    setIssueDueAt(activeInvoice.dueAt ? String(activeInvoice.dueAt).slice(0, 10) : "");
  }, [activeInvoice?.id]);

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

  const toggleRoomExpanded = useCallback(
    (particleId: string | null) => {
      if (!particleId) return;

      petlTransitionOverlayLabelRef.current = "Updating room view…";
      busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);

      startPetlTransition(() => {
        setExpandedRooms(prev => {
          const next = new Set(prev);
          if (next.has(particleId)) next.delete(particleId);
          else next.add(particleId);
          return next;
        });
      });
    },
    [busyOverlay.setMessage, startPetlTransition],
  );

  const toggleUnitExpanded = useCallback(
    (unitId: string | null) => {
      const key = unitId ?? "__no_unit__";

      petlTransitionOverlayLabelRef.current = "Updating unit view…";
      busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);

      startPetlTransition(() => {
        setExpandedUnits(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      });
    },
    [busyOverlay.setMessage, startPetlTransition],
  );

  const isPetlReconFlagged = (sowItemId: string) => petlReconFlagIds.has(sowItemId);

  const togglePetlReconFlag = (sowItemId: string) => {
    setPetlReconFlagIds((prev) => {
      const next = new Set(prev);
      if (next.has(sowItemId)) next.delete(sowItemId);
      else next.add(sowItemId);
      return next;
    });
  };

  const loadPetlReconciliation = async (sowItemId: string) => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setPetlReconPanel({
        open: true,
        sowItemId,
        loading: false,
        error: "Missing access token. Please login again.",
        data: null,
      });
      return;
    }

    setPetlReconPanel(prev => ({
      ...prev,
      open: true,
      sowItemId,
      loading: true,
      error: null,
    }));

    try {
      await busyOverlay.run("Loading reconciliation…", async () => {
        const res = await fetch(
          `${API_BASE}/projects/${id}/petl/${sowItemId}/reconciliation`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setPetlReconPanel(prev => ({
            ...prev,
            loading: false,
            error: `Failed to load reconciliation (${res.status}) ${text}`,
            data: null,
          }));
          return;
        }

        const json: any = await res.json();
        setPetlReconPanel(prev => ({
          ...prev,
          loading: false,
          error: null,
          data: json,
        }));
      });

    } catch (err: any) {
      setPetlReconPanel(prev => ({
        ...prev,
        loading: false,
        error: err?.message ?? "Failed to load reconciliation",
        data: null,
      }));
    }
  };
  const openPetlReconciliation = async (sowItemId: string) => {
    // Keep this click feeling instant: open the drawer first (cheap render), then
    // fetch details in the background.
    setReconNote("");
    setReconCreditComponents({ itemAmount: true, salesTaxAmount: true, opAmount: true });
    setReconPlaceholderKind("NOTE_ONLY");
    setCostBookModalOpen(false);
    setPetlCostBookPickerBusy(false);

    // Ensure the drawer shows immediately, even if the fetch takes time.
    setPetlReconPanel(prev => ({
      ...prev,
      open: true,
      sowItemId,
      loading: true,
      error: null,
      data: null,
    }));

    // Kick the network fetch to the next tick so the open-state paint can happen first.
    window.setTimeout(() => {
      void loadPetlReconciliation(sowItemId);
    }, 0);
  };

  // The line-sequence PETL table can be very large. Memoize its JSX so opening the
  // reconciliation drawer doesn't force React to rebuild thousands of rows.
  const petlLineSequenceTable = useMemo(() => {
    // Critical: don't even *build* the large JSX tree unless the PETL tab content is mounted.
    // (PETL data may load while on SUMMARY for the progress summary.)
    if (activeTab !== "PETL") return null;

    const shouldShow =
      (petlDisplayMode === "LINE_SEQUENCE" || petlDisplayMode === "RECONCILIATION_ONLY") &&
      !petlLoading &&
      petlItems.length > 0;

    if (!shouldShow) return null;

    return (
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          {petlDisplayMode === "RECONCILIATION_ONLY"
            ? "Estimate items (Reconciliation activity only)"
            : "Estimate items"}
        </h2>
        <div
          ref={petlFlatListRef}
          style={{
            height: "calc(100vh - 320px)",
            overflow: "auto",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
          }}
        >
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
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Line
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Room
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Task
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Unit
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Total
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  RCV
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  %
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Cat
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Sel
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#f9fafb",
                  }}
                >
                  Recon
                </th>
              </tr>
            </thead>
            <tbody>
              {petlFlatItems.flatMap((item) => {
                const flagged = isPetlReconFlagged(item.id);
                const hasRecon = hasReconciliationActivity(item.id);

                const allRecon = reconEntriesBySowItemId.get(item.id) ?? [];
                const reconFinancial = allRecon.filter((e) => e?.rcvAmount != null);
                const reconSeqById = new Map<string, number>();
                reconFinancial.forEach((e, idx) => {
                  if (e?.id) reconSeqById.set(String(e.id), idx + 1);
                });

                const expanded = petlReconExpandedIds.has(item.id);
                const showSublines = expanded && reconFinancial.length > 0;

                const bg = flagged
                  ? "#fef3c7"
                  : hasRecon
                    ? "#e0f2fe"
                    : "transparent";

                const out: any[] = [];

                out.push(
                  <tr key={item.id} style={{ backgroundColor: bg }}>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {reconFinancial.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPetlReconExpandedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 12,
                              color: "#2563eb",
                              width: 14,
                              textAlign: "center",
                            }}
                            aria-label={expanded ? "Collapse reconciliation lines" : "Expand reconciliation lines"}
                            title={expanded ? "Collapse reconciliation lines" : `Show ${reconFinancial.length} reconciliation line(s)`}
                          >
                            {showSublines ? "▾" : "▸"}
                          </button>
                        ) : (
                          <span style={{ width: 14 }} />
                        )}
                        <span>{item.lineNo}</span>
                      </div>
                    </td>
                    <td
                      title={item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 220,
                      }}
                    >
                      {item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
                    </td>
                    <td
                      title={item.description ?? ""}
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 520,
                      }}
                    >
                      {item.description ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.qty ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.unit ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                        whiteSpace: "nowrap",
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
                        whiteSpace: "nowrap",
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
                        whiteSpace: "nowrap",
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

                          await busyOverlay.run(`Updating line #${item.lineNo}…`, async () => {
                            try {
                              setPetlItems((prev) =>
                                prev.map((it) =>
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

                              // After a single-line edit in the flat PETL table,
                              // also refresh the server-backed PETL + groups so the
                              // Rooms/Zones summary reflects the current values.
                              try {
                                const petlRes = await fetch(`${API_BASE}/projects/${id}/petl`, {
                                  headers: { Authorization: `Bearer ${token}` },
                                });
                                if (petlRes.ok) {
                                  const petl: any = await petlRes.json();
                                  const items: PetlItem[] = Array.isArray(petl.items)
                                    ? petl.items
                                    : [];
                                  setPetlItems(items);
                                }
                              } catch {
                                // non-fatal
                              }

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
                                  setUnitGroups(
                                    Array.isArray(json.unitGroups) ? json.unitGroups : [],
                                  );
                                }
                              } catch {
                                // non-fatal
                              } finally {
                                setGroupLoading(false);
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          });
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
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.categoryCode ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.selectionCode ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            petlTransitionOverlayLabelRef.current = flagged
                              ? "Removing flag…"
                              : "Flagging for review…";
                            busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);
                            startPetlTransition(() => togglePetlReconFlag(item.id));
                          }}
                          style={{
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: flagged ? "1px solid #b45309" : "1px solid #d1d5db",
                            background: flagged ? "#fffbeb" : "#ffffff",
                            fontSize: 11,
                            cursor: "pointer",
                            color: flagged ? "#92400e" : "#374151",
                          }}
                        >
                          {flagged ? "Needs review" : "Flag"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void openPetlReconciliation(item.id);
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
                          Reconcile
                        </button>
                        {isAdminOrAbove && (
                          <button
                            type="button"
                            disabled={petlDeleteBusy}
                            onClick={() => {
                              void deletePetlLineItem(item);
                            }}
                            style={{
                              padding: "2px 6px",
                              borderRadius: 999,
                              border: "1px solid #b91c1c",
                              background: "#fff1f2",
                              fontSize: 11,
                              cursor: petlDeleteBusy ? "default" : "pointer",
                              color: "#b91c1c",
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,
                );

                if (showSublines) {
                  for (const e of reconFinancial) {
                    const entryId = String(e?.id ?? "");
                    if (!entryId) continue;
                    const seq = reconSeqById.get(entryId);
                    if (!seq) continue;

                    const lineLabel = `${item.lineNo}.${seq}`;
                    const kind = String(e?.kind ?? "").trim();
                    const desc = String(e?.description ?? "").trim();
                    const note = String(e?.note ?? "").trim();
                    const label = desc || note ? `${kind}: ${desc || note}` : kind;

                    const itemAmt = typeof e?.itemAmount === "number" ? e.itemAmount : null;
                    const rcvAmt = typeof e?.rcvAmount === "number" ? e.rcvAmount : null;
                    const isCredit = kind === "CREDIT" || (rcvAmt != null && rcvAmt < 0);
                    const pct = e?.isPercentCompleteLocked ? 0 : (e?.percentComplete ?? 0);

                    out.push(
                      <tr
                        key={`${item.id}::recon::${entryId}`}
                        style={{
                          backgroundColor: "#f8fafc",
                          color: isCredit ? "#b91c1c" : "#111827",
                        }}
                      >
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            whiteSpace: "nowrap",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                          }}
                        >
                          <span style={{ paddingLeft: 18 }}>↳ {lineLabel}</span>
                        </td>
                        <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                          {/* under the parent row */}
                        </td>
                        <td
                          title={label}
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 520,
                          }}
                        >
                          <span style={{ color: "#6b7280" }}>[{kind}]</span>{" "}
                          {desc || note || ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e?.qty ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e?.unit ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {itemAmt != null
                            ? itemAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                          }}
                        >
                          {rcvAmt != null
                            ? rcvAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e?.isPercentCompleteLocked ? (
                            "—"
                          ) : (
                            <select
                              value={String(pct)}
                              onChange={(ev) => {
                                const next = Number(ev.target.value);
                                if (Number.isNaN(next)) return;
                                void submitReconEntryPercent(entryId, next);
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
                            </select>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e?.categoryCode ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e?.selectionCode ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 8px",
                            borderTop: "1px solid #e5e7eb",
                            whiteSpace: "nowrap",
                            color: "#6b7280",
                            fontSize: 11,
                          }}
                        >
                          {/* no actions */}
                        </td>
                      </tr>,
                    );
                  }
                }

                return out;
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [
    activeTab,
    id,
    isAdminOrAbove,
    petlDeleteBusy,
    petlDisplayMode,
    petlFlatItems,
    petlLoading,
    petlReconActivityIds,
    petlReconExpandedIds,
    petlReconFlagIds,
    petlItems.length,
    reconEntriesBySowItemId,
  ]);

  const submitReconCredit = async () => {
    const sowItemId = petlReconPanel.sowItemId;
    if (!sowItemId) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      await busyOverlay.run("Creating credit…", async () => {
        const res = await fetch(
          `${API_BASE}/projects/${id}/petl/${sowItemId}/reconciliation/credit`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              note: reconNote || null,
              tag: reconEntryTag || null,
              components: reconCreditComponents,
            }),
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          alert(`Failed to create credit (${res.status}) ${text}`);
          return;
        }

        setPetlReloadTick(t => t + 1);
        await loadPetlReconciliation(sowItemId);
      });

    } catch (err: any) {
      alert(err?.message ?? "Failed to create credit");
    }
  };

  const submitReconPlaceholder = async () => {
    const sowItemId = petlReconPanel.sowItemId;
    if (!sowItemId) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      await busyOverlay.run("Creating placeholder…", async () => {
        const res = await fetch(
          `${API_BASE}/projects/${id}/petl/${sowItemId}/reconciliation/placeholder`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              kind: reconPlaceholderKind,
              tag: reconEntryTag || null,
              note: reconNote || null,
            }),
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          alert(`Failed to create placeholder (${res.status}) ${text}`);
          return;
        }

        setPetlReloadTick(t => t + 1);
        await loadPetlReconciliation(sowItemId);
      });

    } catch (err: any) {
      alert(err?.message ?? "Failed to create placeholder");
    }
  };

  const submitAddFromCostBook = async (companyPriceListItemId: string, qty: number) => {
    const sowItemId = petlReconPanel.sowItemId;
    if (!sowItemId) return false;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return false;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Qty must be a positive number");
      return false;
    }

    try {
      return await busyOverlay.run("Adding from cost book…", async () => {
        const res = await fetch(
          `${API_BASE}/projects/${id}/petl/${sowItemId}/reconciliation/add-from-cost-book`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              companyPriceListItemId,
              qty,
              tag: reconEntryTag || null,
              note: reconNote || null,
            }),
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          alert(`Failed to add from cost book (${res.status}) ${text}`);
          return false;
        }

        setPetlReloadTick(t => t + 1);
        await loadPetlReconciliation(sowItemId);
        return true;
      });

    } catch (err: any) {
      alert(err?.message ?? "Failed to add from cost book");
      return false;
    }
  };

  const submitReconEntryPercent = async (entryId: string, newPercent: number) => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    try {
      await busyOverlay.run("Updating reconciliation percent…", async () => {
        const res = await fetch(
          `${API_BASE}/projects/${id}/petl-reconciliation/entries/${entryId}/percent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ newPercent }),
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          alert(`Failed to update percent (${res.status}) ${text}`);
          return;
        }

        setPetlReloadTick(t => t + 1);
        if (petlReconPanel.sowItemId) {
          await loadPetlReconciliation(petlReconPanel.sowItemId);
        }
      });

    } catch (err: any) {
      alert(err?.message ?? "Failed to update percent");
    }
  };

  const openReconEntryEdit = (entry: any) => {
    const tag = String(entry?.tag ?? "").trim();
    const draftTag: ReconEntryTag =
      tag === "SUPPLEMENT" || tag === "CHANGE_ORDER" || tag === "OTHER" || tag === "WARRANTY"
        ? (tag as ReconEntryTag)
        : "";

    setReconEntryEdit({
      entry,
      draft: {
        tag: draftTag,
        description: String(entry?.description ?? ""),
        note: String(entry?.note ?? ""),
        rcvAmount:
          typeof entry?.rcvAmount === "number" && Number.isFinite(entry.rcvAmount)
            ? String(entry.rcvAmount)
            : "",
      },
      saving: false,
      error: null,
    });
  };

  const closeReconEntryEdit = () => setReconEntryEdit(null);

  const saveReconEntryEdit = async () => {
    if (!reconEntryEdit) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      alert("Missing access token; please log in again.");
      return;
    }

    const entry = reconEntryEdit.entry;
    const d = reconEntryEdit.draft;

    const patch: any = {};

    const nextTag = d.tag || null;
    const prevTag = entry?.tag ?? null;
    if (nextTag !== prevTag) patch.tag = nextTag;

    const nextDesc = d.description.trim() || null;
    const prevDesc = entry?.description ?? null;
    if (nextDesc !== prevDesc) patch.description = nextDesc;

    const nextNote = d.note.trim() || null;
    const prevNote = entry?.note ?? null;
    if (nextNote !== prevNote) patch.note = nextNote;

    const rcvRaw = d.rcvAmount.trim();
    const nextRcv = rcvRaw === "" ? null : Number(rcvRaw);
    if (rcvRaw !== "" && (!Number.isFinite(nextRcv) || Number.isNaN(nextRcv))) {
      alert("RCV must be a number (or blank). ");
      return;
    }
    const prevRcv = typeof entry?.rcvAmount === "number" ? entry.rcvAmount : null;
    if (nextRcv !== prevRcv) patch.rcvAmount = nextRcv;

    if (Object.keys(patch).length === 0) {
      closeReconEntryEdit();
      return;
    }

    setReconEntryEdit((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

    try {
      const res = await fetch(
        `${API_BASE}/projects/${id}/petl-reconciliation/entries/${entry.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setReconEntryEdit((prev) =>
          prev ? { ...prev, saving: false, error: `Save failed (${res.status}) ${text}` } : prev,
        );
        return;
      }

      setPetlReloadTick((t) => t + 1);
      if (petlReconPanel.sowItemId) {
        await loadPetlReconciliation(petlReconPanel.sowItemId);
      }

      closeReconEntryEdit();
    } catch (err: any) {
      setReconEntryEdit((prev) =>
        prev ? { ...prev, saving: false, error: err?.message ?? "Save failed" } : prev,
      );
    }
  };

  const filteredItemsForRoom = (particleId: string | null) => {
    if (!particleId) return [] as PetlItem[];
    return petlItemsByRoomParticleId.get(particleId) ?? ([] as PetlItem[]);
  };

  const openRoomComponentsPanel = async (roomId: string | null, roomName: string) => {
    if (!roomId) return;

    // PETL interaction: show delayed overlay for potentially heavy fetch + rerender.
    const done = busyOverlay.begin("Loading components…");

    // Preserve old behavior: clicking "Components" scopes the Room filter to that room.
    setRoomParticleIdFilters([roomId]);

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
      done();
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("roomParticleId", roomId);

      // Multi-select filters: repeat query params.
      for (const cat of categoryCodeFilters) params.append("categoryCode", cat);
      for (const sel of selectionCodeFilters) params.append("selectionCode", sel);

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
    } finally {
      done();
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
      await busyOverlay.run("Saving daily log…", async () => {
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
        setPersonOnsiteList([]);
        setPersonOnsiteDraft("");
        setSelectedPersonOnsiteGroupId("");

        setPudlContext({
          open: false,
          buildingId: null,
          unitId: null,
          roomParticleId: null,
          sowItemId: null,
          breadcrumb: null,
        });

        setDailyLogMessage("Daily log saved.");
      });
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

    editTransitionOverlayLabelRef.current = "Opening editor…";
    busyOverlay.setMessage(editTransitionOverlayLabelRef.current);

    startEditTransition(() => {
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
    });
  };

  const cancelEditProject = () => {
    editTransitionOverlayLabelRef.current = "Closing editor…";
    busyOverlay.setMessage(editTransitionOverlayLabelRef.current);

    startEditTransition(() => {
      setEditProjectMode(false);
      setEditProjectMessage(null);
      setDeleteProjectMessage(null);
    });
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
      await busyOverlay.run("Saving project…", async () => {
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
      });
    } catch (err: any) {
      setEditProjectMessage(err?.message ?? "Error saving project.");
    } finally {
      setEditProjectSaving(false);
    }
  };

  // No separate deactivate/delete functions anymore; state is controlled via
  // the Project state toggle + status field and saved in saveEditProject.

  return (
    <div
      className="app-card"
      style={
        invoiceFullscreen
          ? {
              // Cancel app shell padding so the invoice can use the full viewport.
              margin: "-12px -20px -24px",
              borderRadius: 0,
              padding: 12,
              maxHeight: "none",
            }
          : undefined
      }
    >
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

                  <button
                    type="button"
                    onClick={() => {
                      setPetlShowDiagnostics(true);
                      setPetlDiagnosticsModalOpen(true);
                    }}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      color: "#374151",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    PETL Diagnostics
                  </button>

                  {isAdminOrAbove && (
                    <button
                      type="button"
                      onClick={() => {
                        setAdminPetlToolsModalOpen(true);
                      }}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: "1px solid #b91c1c",
                        backgroundColor: "#fff1f2",
                        color: "#b91c1c",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Admin PETL Tools
                    </button>
                  )}
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
            onClick={() => {
              // PETL is heavy: update underline instantly, then transition the content
              // switch (unmounting previous tab + mounting PETL shell) on the next frame.
              if (tab.key === "PETL") {
                setPetlTabMounted(false);
                setTab("PETL", { deferContentSwitch: true });
                return;
              }

              setTab(tab.key);
            }}
            style={{
              border: "none",
              borderBottom:
                activeTabUi === tab.key
                  ? "2px solid #2563eb"
                  : "2px solid transparent",
              padding: "6px 8px",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: activeTabUi === tab.key ? "#111827" : "#6b7280",
              fontWeight: activeTabUi === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTabUi === "PETL" && activeTab !== "PETL" && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>Opening PETL…</div>
      )}

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
              {roomParticleIdFilters.length ||
              categoryCodeFilters.length ||
              selectionCodeFilters.length
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
        <div
          style={
            invoiceFullscreen
              ? { marginTop: 0, marginBottom: 0 }
              : { marginTop: 8, marginBottom: 16 }
          }
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Financial Overview</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={exportInvoicesCsv}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Export invoices (CSV)
              </button>
              <button
                type="button"
                onClick={exportPaymentsCsv}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Export payments (CSV)
              </button>
              <button
                type="button"
                onClick={() => setInvoiceCostBookPickerOpen(true)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #2563eb",
                  backgroundColor: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Open Tenant Cost Book
              </button>
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
                  whiteSpace: "nowrap",
                }}
              >
                Open Time Accounting
              </a>
            </div>
          </div>

          {invoiceCostBookPickerOpen && (
            <CostBookPickerModal
              title="Tenant Cost Book"
              subtitle={
                activeInvoice?.status === "DRAFT"
                  ? "Select line items to add to the current draft invoice."
                  : "Browse the tenant cost book. (Open a draft invoice to add selected items.)"
              }
              confirmLabel={invoiceCostBookPickerBusy ? "Adding…" : "Add selected to invoice"}
              confirmDisabled={
                invoiceCostBookPickerBusy || !activeInvoice || activeInvoice.status !== "DRAFT"
              }
              onConfirm={submitAddInvoiceLinesFromCostBook}
              onClose={() => {
                if (invoiceCostBookPickerBusy) return;
                setInvoiceCostBookPickerOpen(false);
              }}
            />
          )}

          {billModalOpen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 70,
                backgroundColor: "rgba(15, 23, 42, 0.35)",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                padding: "8vh 12px",
              }}
              onClick={closeBillModal}
            >
              <div
                style={{
                  width: 760,
                  maxWidth: "96vw",
                  backgroundColor: "#ffffff",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {billEditingId ? "Edit bill" : "Add bill"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Single line item MVP. Add multiple attachments if needed.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeBillModal}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: billModalSaving ? "default" : "pointer",
                      fontSize: 18,
                      lineHeight: 1,
                      padding: 6,
                      opacity: billModalSaving ? 0.5 : 1,
                    }}
                    aria-label="Close bill modal"
                    disabled={billModalSaving}
                  >
                    ×
                  </button>
                </div>

                <div style={{ padding: 12, fontSize: 12 }}>
                  {billsMessage && (
                    <div
                      style={{
                        marginBottom: 10,
                        color: billsMessage.toLowerCase().includes("fail") ? "#b91c1c" : "#4b5563",
                      }}
                    >
                      {billsMessage}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Vendor</div>
                      <input
                        value={billVendorName}
                        onChange={(e) => setBillVendorName(e.target.value)}
                        placeholder="Vendor name"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Bill #</div>
                      <input
                        value={billBillNumber}
                        onChange={(e) => setBillBillNumber(e.target.value)}
                        placeholder="(optional)"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Bill date</div>
                      <input
                        type="date"
                        value={billBillDate}
                        onChange={(e) => setBillBillDate(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Due date</div>
                      <input
                        type="date"
                        value={billDueAt}
                        onChange={(e) => setBillDueAt(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Status</div>
                      <select
                        value={billStatus}
                        onChange={(e) => setBillStatus(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="POSTED">Posted</option>
                        <option value="PAID">Paid</option>
                        <option value="VOID">Void</option>
                      </select>
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Memo</div>
                      <input
                        value={billMemo}
                        onChange={(e) => setBillMemo(e.target.value)}
                        placeholder="(optional)"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Line kind</div>
                      <select
                        value={billLineKind}
                        onChange={(e) => setBillLineKind(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      >
                        <option value="MATERIALS">Materials</option>
                        <option value="LABOR">Labor</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Amount</div>
                      <input
                        value={billLineAmount}
                        onChange={(e) => setBillLineAmount(e.target.value)}
                        placeholder={billLineKind === "LABOR" ? "(optional; derive from timecards)" : "Amount"}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Line description</div>
                      <input
                        value={billLineDescription}
                        onChange={(e) => setBillLineDescription(e.target.value)}
                        placeholder="What is this bill for?"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    </div>

                    {billLineKind === "LABOR" && (
                      <>
                        <div>
                          <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Timecards start</div>
                          <input
                            type="date"
                            value={billLineTimecardStartDate}
                            onChange={(e) => setBillLineTimecardStartDate(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                            }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Timecards end</div>
                          <input
                            type="date"
                            value={billLineTimecardEndDate}
                            onChange={(e) => setBillLineTimecardEndDate(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                            }}
                          />
                        </div>
                        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#6b7280" }}>
                          Leave Amount blank to derive labor from timecards using each worker&apos;s default pay rate.
                        </div>
                      </>
                    )}

                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 6 }}>Attachments</div>
                      <div
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: 8,
                          maxHeight: 220,
                          overflowY: "auto",
                          background: "#f9fafb",
                        }}
                      >
                        {billAttachmentFileLoading && (
                          <div style={{ color: "#6b7280" }}>Loading files…</div>
                        )}
                        {billAttachmentFileError && !billAttachmentFileLoading && (
                          <div style={{ color: "#b91c1c" }}>{billAttachmentFileError}</div>
                        )}
                        {!billAttachmentFileLoading &&
                          !billAttachmentFileError &&
                          billAttachmentFileOptions &&
                          billAttachmentFileOptions.length === 0 && (
                            <div style={{ color: "#6b7280" }}>No project files found.</div>
                          )}
                        {!billAttachmentFileLoading &&
                          !billAttachmentFileError &&
                          billAttachmentFileOptions &&
                          billAttachmentFileOptions.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {billAttachmentFileOptions.slice(0, 50).map((f: any) => {
                                const fileId = String(f?.id ?? "");
                                if (!fileId) return null;
                                const checked = billAttachmentProjectFileIds.includes(fileId);
                                const label = String(f?.fileName ?? f?.name ?? "File");
                                return (
                                  <label
                                    key={fileId}
                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setBillAttachmentProjectFileIds((prev) =>
                                          prev.includes(fileId)
                                            ? prev.filter((x) => x !== fileId)
                                            : [...prev, fileId],
                                        );
                                      }}
                                    />
                                    <span style={{ fontSize: 12, color: "#111827" }}>{label}</span>
                                  </label>
                                );
                              })}
                              {billAttachmentFileOptions.length > 50 && (
                                <div style={{ fontSize: 11, color: "#6b7280" }}>
                                  Showing first 50 files. (Use the Files tab to manage more.)
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={closeBillModal}
                      disabled={billModalSaving}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#ffffff",
                        cursor: billModalSaving ? "default" : "pointer",
                        fontSize: 12,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitBillModal}
                      disabled={billModalSaving}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #0f172a",
                        background: "#0f172a",
                        color: "#f9fafb",
                        cursor: billModalSaving ? "default" : "pointer",
                        fontSize: 12,
                      }}
                    >
                      {billModalSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {invoiceFullscreen && (
            <div style={{ marginBottom: 8 }}>
              <a
                href={`/projects/${id}?tab=FINANCIAL`}
                style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}
              >
                ← Back to project
              </a>
            </div>
          )}

          {!invoiceFullscreen && (
            <>
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
                    <div>Invoiced to date</div>
                    <div style={{ textAlign: "right" }}>
                      ${(
                        invoiceRollup?.invoiced ?? financialSummary.billedToDate
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>Paid to date</div>
                    <div style={{ textAlign: "right" }}>
                      {invoiceRollup ? (
                        <>${invoiceRollup.paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </div>

                    <div
                      style={{
                        fontWeight: 600,
                        borderBottom: "1px solid #e5e7eb",
                        paddingBottom: 4,
                        marginBottom: 2,
                      }}
                    >
                      Outstanding
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        borderBottom: "1px solid #e5e7eb",
                        paddingBottom: 4,
                        marginBottom: 2,
                      }}
                    >
                      {invoiceRollup ? (
                        <>${invoiceRollup.balanceDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </div>

                    <div>Work complete (earned) not yet billed</div>
                    <div style={{ textAlign: "right" }}>
                      ${Math.max(
                        0,
                        financialSummary.totalDueWorkBillable -
                          (invoiceRollup?.invoiced ?? financialSummary.billedToDate),
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div>
                      Deposit baseline ({Math.round(financialSummary.depositRate * 100)}%)
                    </div>
                    <div style={{ textAlign: "right" }}>
                      ${financialSummary.depositBaseline.toLocaleString(undefined, {
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
                    Invoiced/Paid/Outstanding are calculated from issued invoices (excluding draft/void).
                    Deposit baseline is {Math.round(financialSummary.depositRate * 100)}% of Total Due.
                    Work complete not yet billed includes the baseline deposit portion; Due Amount is only the portion above that baseline.
                  </p>
                </div>
              </div>

            </>
          )}

          {/* Bills (Expenses) */}
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
                borderBottom: billsCollapsed ? "none" : "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setBillsCollapsed((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {billsCollapsed ? "▸" : "▾"}
                </span>
                <span>Bills (Expenses)</span>
                {billsRollup && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#6b7280" }}>
                    · {billsRollup.count} · Total {formatMoney(billsRollup.total)}
                  </span>
                )}
              </button>

              {!billsCollapsed && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setBillsMessage(null);
                      setProjectBills(null);
                    }}
                    disabled={projectBillsLoading}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      cursor: projectBillsLoading ? "default" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {projectBillsLoading ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={openCreateBillModal}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #0f172a",
                      background: "#0f172a",
                      color: "#f9fafb",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    + Add bill
                  </button>
                </div>
              )}
            </div>

            {!billsCollapsed && (
              <div style={{ padding: 10, fontSize: 12 }}>
                {billsMessage && (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 12,
                      color: billsMessage.toLowerCase().includes("fail") ? "#b91c1c" : "#4b5563",
                    }}
                  >
                    {billsMessage}
                  </div>
                )}

                {projectBillsLoading && <div style={{ color: "#6b7280" }}>Loading bills…</div>}
                {projectBillsError && !projectBillsLoading && (
                  <div style={{ color: "#b91c1c" }}>{projectBillsError}</div>
                )}

                {!projectBillsLoading && !projectBillsError && projectBills && projectBills.length === 0 && (
                  <div style={{ color: "#6b7280" }}>No bills recorded yet.</div>
                )}

                {!projectBillsLoading && !projectBillsError && projectBills && projectBills.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                          <th style={{ padding: "6px 8px" }}>Vendor</th>
                          <th style={{ padding: "6px 8px" }}>Bill date</th>
                          <th style={{ padding: "6px 8px" }}>Status</th>
                          <th style={{ padding: "6px 8px" }}>Kind</th>
                          <th style={{ padding: "6px 8px" }}>Description</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Amount</th>
                          <th style={{ padding: "6px 8px" }}>Attachments</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...projectBills]
                          .sort((a, b) => {
                            const da = String(a?.billDate ?? "");
                            const db = String(b?.billDate ?? "");
                            if (da !== db) return db.localeCompare(da);
                            return String(b?.createdAt ?? "").localeCompare(String(a?.createdAt ?? ""));
                          })
                          .map((b: any) => {
                            const li = Array.isArray(b?.lineItems) ? b.lineItems[0] : null;
                            const attachments: any[] = Array.isArray(b?.attachments) ? b.attachments : [];
                            return (
                              <tr key={String(b?.id ?? Math.random())}>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                  {b?.vendorName ?? "—"}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563" }}>
                                  {b?.billDate ? String(b.billDate).slice(0, 10) : "—"}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563" }}>
                                  {b?.status ?? "—"}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563" }}>
                                  {li?.kind ?? "—"}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                  <div style={{ fontWeight: 600 }}>{li?.description ?? "—"}</div>
                                  {b?.billNumber && (
                                    <div style={{ fontSize: 11, color: "#6b7280" }}>#{String(b.billNumber)}</div>
                                  )}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 600 }}>
                                  {formatMoney(b?.totalAmount)}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                  {attachments.length === 0 ? (
                                    <span style={{ color: "#9ca3af" }}>—</span>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                      {attachments.slice(0, 3).map((a: any) => (
                                        <a
                                          key={String(a?.id ?? a?.projectFileId ?? Math.random())}
                                          href={String(a?.fileUrl ?? "#")}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{ fontSize: 11, color: "#2563eb", textDecoration: "none" }}
                                        >
                                          {String(a?.fileName ?? "Attachment")}
                                        </a>
                                      ))}
                                      {attachments.length > 3 && (
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                                          +{attachments.length - 3} more
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                                  <button
                                    type="button"
                                    onClick={() => openEditBillModal(b)}
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      border: "1px solid #d1d5db",
                                      background: "#ffffff",
                                      fontSize: 11,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payments */}
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
                borderBottom: paymentsCollapsed ? "none" : "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setPaymentsCollapsed((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111827",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {paymentsCollapsed ? "▸" : "▾"}
                </span>
                <span>Payments</span>
                {projectPayments && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#6b7280" }}>
                    · {projectPaymentsSorted.length} · Total {formatMoney(projectPaymentsTotal)} · Unapplied{" "}
                    {formatMoney(projectPaymentsUnappliedTotal)}
                  </span>
                )}
              </button>

              {!paymentsCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentsMessage(null);
                    setProjectPayments(null);
                  }}
                  disabled={projectPaymentsLoading}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    cursor: projectPaymentsLoading ? "default" : "pointer",
                    fontSize: 12,
                  }}
                >
                  {projectPaymentsLoading ? "Refreshing…" : "Refresh"}
                </button>
              )}
            </div>

            {!paymentsCollapsed && (
              <div style={{ padding: 10, fontSize: 12 }}>
              {paymentsMessage && (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    color: paymentsMessage.toLowerCase().includes("fail") ? "#b91c1c" : "#4b5563",
                  }}
                >
                  {paymentsMessage}
                </div>
              )}

              {projectPaymentsLoading && (
                <div style={{ color: "#6b7280" }}>Loading payments…</div>
              )}
              {projectPaymentsError && !projectPaymentsLoading && (
                <div style={{ color: "#b91c1c" }}>{projectPaymentsError}</div>
              )}

              {!projectPaymentsLoading &&
                !projectPaymentsError &&
                projectPayments &&
                projectPayments.length === 0 && (
                  <div style={{ color: "#6b7280" }}>No payments recorded yet.</div>
                )}

              {!projectPaymentsLoading &&
                !projectPaymentsError &&
                projectPayments &&
                projectPayments.length > 0 && (
                  <>
                    <div style={{ marginBottom: 8, fontSize: 11, color: "#6b7280" }}>
                      Showing <strong>{projectPaymentsSorted.length}</strong> payments · Total{" "}
                      <strong>{formatMoney(projectPaymentsTotal)}</strong>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                        gap: 8,
                      }}
                    >
                      {projectPaymentsSorted.map((p: any) => {
                      const paidAtLabel = p?.paidAt
                        ? new Date(p.paidAt).toLocaleDateString()
                        : "—";
                      const method = String(p?.method ?? "").trim() || "—";
                      const reference = String(p?.reference ?? "").trim();
                      const note = String(p?.note ?? "").trim();

                      const appliedAmount = Number(p?.appliedAmount ?? 0) || 0;
                      const unappliedAmount = Number(p?.unappliedAmount ?? 0) || 0;
                      const apps: any[] = Array.isArray(p?.applications) ? p.applications : [];

                      const invoiceOptions = (projectInvoices ?? []).filter(
                        (inv: any) => String(inv?.status) !== "VOID",
                      );

                      const paymentId = String(p?.id ?? "");
                      const selectedInvoiceId = applyInvoiceByPaymentId[paymentId] ?? "";
                      const selectedAmountStr = applyAmountByPaymentId[paymentId] ?? "";
                      const applyMsg = applyMessageByPaymentId[paymentId] ?? "";

                      return (
                        <div
                          key={paymentId}
                          style={{
                            flex: "0 0 auto",
                            minWidth: 240,
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "#f9fafb",
                            padding: 8,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontWeight: 700 }}>{formatMoney(p?.amount)}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{paidAtLabel}</div>
                          </div>
                          <div style={{ marginTop: 2, fontSize: 11, color: "#4b5563" }}>
                            {method}
                            {reference ? ` · ${reference}` : ""}
                          </div>

                          <div style={{ marginTop: 6, fontSize: 11, color: "#4b5563" }}>
                            Applied: <strong>{formatMoney(appliedAmount)}</strong> · Unapplied:{" "}
                            <strong>{formatMoney(unappliedAmount)}</strong>
                          </div>

                          {apps.length > 0 && (
                            <div style={{ marginTop: 6, fontSize: 11, color: "#4b5563" }}>
                              <div style={{ fontWeight: 600, marginBottom: 2 }}>Applications</div>
                              {apps.map((a: any) => {
                                const invId = String(a?.invoiceId ?? "").trim();
                                const canRemove = Boolean(invId);
                                const label = a.invoiceNo ?? "(draft)";

                                return (
                                  <div
                                    key={a.id}
                                    style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}
                                  >
                                    <span>{label}</span>
                                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <span style={{ fontWeight: 600 }}>{formatMoney(a.amount)}</span>
                                      {canRemove && (
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!project) return;
                                            const token = localStorage.getItem("accessToken");
                                            if (!token) {
                                              setPaymentsMessage("Missing access token.");
                                              return;
                                            }

                                            const ok = window.confirm(
                                              `Remove this payment from invoice ${label}?\n\nThis does not delete the payment record; it just unassigns it so you can apply it elsewhere.`,
                                            );
                                            if (!ok) return;

                                            setPaymentsMessage(null);
                                            setApplyMessageByPaymentId((prev) => ({
                                              ...prev,
                                              [paymentId]: `Removing from ${label}…`,
                                            }));

                                            try {
                                              const res = await fetch(
                                                `${API_BASE}/projects/${project.id}/payments/${paymentId}/apply/${invId}`,
                                                {
                                                  method: "DELETE",
                                                  headers: { Authorization: `Bearer ${token}` },
                                                },
                                              );
                                              if (!res.ok) {
                                                const text = await res.text().catch(() => "");
                                                const msg = `Remove failed (${res.status}) ${text}`;
                                                setPaymentsMessage(msg);
                                                setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: msg }));
                                                return;
                                              }

                                              // refresh lists + active invoice if open
                                              setProjectPayments(null);
                                              setProjectInvoices(null);
                                              setFinancialSummary(null);

                                              if (activeInvoice?.id === invId) {
                                                const invRes = await fetch(
                                                  `${API_BASE}/projects/${project.id}/invoices/${invId}`,
                                                  { headers: { Authorization: `Bearer ${token}` } },
                                                );
                                                if (invRes.ok) {
                                                  const json = await invRes.json();
                                                  setActiveInvoice(json);
                                                }
                                              }

                                              setApplyMessageByPaymentId((prev) => ({
                                                ...prev,
                                                [paymentId]: `Removed from ${label}.`,
                                              }));
                                            } catch (err: any) {
                                              const msg = err?.message ?? "Remove failed.";
                                              setPaymentsMessage(msg);
                                              setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: msg }));
                                            }
                                          }}
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: 6,
                                            border: "1px solid #b91c1c",
                                            background: "#fee2e2",
                                            color: "#991b1b",
                                            fontSize: 11,
                                            cursor: "pointer",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {note && (
                            <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                              {note}
                            </div>
                          )}

                          {applyMsg && (
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                color: applyMsg.toLowerCase().includes("fail") ? "#b91c1c" : "#4b5563",
                              }}
                            >
                              {applyMsg}
                            </div>
                          )}

                          {unappliedAmount > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
                                Apply payment
                              </div>

                              {projectInvoicesLoading && (
                                <div style={{ fontSize: 11, color: "#6b7280" }}>Loading invoices…</div>
                              )}

                              {!projectInvoicesLoading && invoiceOptions.length === 0 && (
                                <div style={{ fontSize: 11, color: "#6b7280" }}>
                                  No invoices available to apply to.
                                </div>
                              )}

                              {!projectInvoicesLoading && invoiceOptions.length > 0 && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <select
                                    value={selectedInvoiceId}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      setApplyInvoiceByPaymentId((prev) => ({ ...prev, [paymentId]: next }));
                                      setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: "" }));
                                    }}
                                    style={{
                                      flex: "1 1 180px",
                                      padding: "6px 8px",
                                      borderRadius: 4,
                                      border: "1px solid #d1d5db",
                                      fontSize: 12,
                                    }}
                                  >
                                    <option value="">Select invoice…</option>
                                    {invoiceOptions.map((inv: any) => (
                                      <option key={inv.id} value={inv.id}>
                                        {(inv.invoiceNo ?? "(draft)") +
                                          ` · ${inv.status}` +
                                          ` · Bal ${formatMoney(inv.balanceDue ?? 0)}`}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    placeholder={`Amount (max ${formatMoney(unappliedAmount)})`}
                                    value={selectedAmountStr}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      setApplyAmountByPaymentId((prev) => ({ ...prev, [paymentId]: next }));
                                      setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: "" }));
                                    }}
                                    style={{
                                      width: 140,
                                      padding: "6px 8px",
                                      borderRadius: 4,
                                      border: "1px solid #d1d5db",
                                      fontSize: 12,
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={applySavingPaymentId === paymentId}
                                    onClick={async () => {
                                      if (!project) return;
                                      const token = localStorage.getItem("accessToken");
                                      if (!token) {
                                        setPaymentsMessage("Missing access token.");
                                        setApplyMessageByPaymentId((prev) => ({
                                          ...prev,
                                          [paymentId]: "Apply failed: missing access token.",
                                        }));
                                        return;
                                      }

                                      const invoiceId = (applyInvoiceByPaymentId[paymentId] ?? "").trim();
                                      if (!invoiceId) {
                                        setApplyMessageByPaymentId((prev) => ({
                                          ...prev,
                                          [paymentId]: "Select an invoice to apply to.",
                                        }));
                                        return;
                                      }

                                      const amountRaw = (applyAmountByPaymentId[paymentId] ?? "").trim();
                                      const normalizedAmountRaw = amountRaw.replace(/[$,\s]/g, "");
                                      const amount = Number(normalizedAmountRaw);
                                      if (!Number.isFinite(amount) || amount <= 0) {
                                        setApplyMessageByPaymentId((prev) => ({
                                          ...prev,
                                          [paymentId]: "Apply amount must be a positive number.",
                                        }));
                                        return;
                                      }

                                      setApplySavingPaymentId(paymentId);
                                      setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: "Applying…" }));
                                      setPaymentsMessage(null);
                                      try {
                                        const res = await fetch(
                                          `${API_BASE}/projects/${project.id}/payments/${paymentId}/apply`,
                                          {
                                            method: "POST",
                                            headers: {
                                              "Content-Type": "application/json",
                                              Authorization: `Bearer ${token}`,
                                            },
                                            body: JSON.stringify({ invoiceId, amount }),
                                          },
                                        );
                                        if (!res.ok) {
                                          const text = await res.text().catch(() => "");
                                          const hint =
                                            res.status >= 500 &&
                                            (text.includes("ProjectPaymentApplication") ||
                                              text.toLowerCase().includes("paymentapplication") ||
                                              text.toLowerCase().includes("not migrated"))
                                              ? " Apply requires the payment application migration; run database migrations and restart the API."
                                              : "";
                                          const msg = `Apply failed (${res.status}) ${text}${hint}`.trim();
                                          setPaymentsMessage(msg);
                                          setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: msg }));
                                          return;
                                        }

                                        setProjectPayments(null);
                                        setProjectInvoices(null);
                                        setFinancialSummary(null);

                                        if (activeInvoice?.id === invoiceId) {
                                          const invRes = await fetch(
                                            `${API_BASE}/projects/${project.id}/invoices/${invoiceId}`,
                                            { headers: { Authorization: `Bearer ${token}` } },
                                          );
                                          if (invRes.ok) {
                                            const json = await invRes.json();
                                            setActiveInvoice(json);
                                          }
                                        }

                                        setApplyInvoiceByPaymentId((prev) => ({ ...prev, [paymentId]: "" }));
                                        setApplyAmountByPaymentId((prev) => ({ ...prev, [paymentId]: "" }));
                                        setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: "Payment applied." }));
                                        setPaymentsMessage("Payment applied.");
                                      } catch (err: any) {
                                        const msg = err?.message ?? "Apply failed.";
                                        setPaymentsMessage(msg);
                                        setApplyMessageByPaymentId((prev) => ({ ...prev, [paymentId]: msg }));
                                      } finally {
                                        setApplySavingPaymentId(null);
                                      }
                                    }}
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 4,
                                      border: "1px solid #0f172a",
                                      background: "#0f172a",
                                      color: "#f9fafb",
                                      fontSize: 12,
                                      cursor: applySavingPaymentId === paymentId ? "default" : "pointer",
                                    }}
                                  >
                                    {applySavingPaymentId === paymentId ? "Applying…" : "Apply"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>
                  </>
                )}

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Record payment</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    placeholder="Amount"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    style={{
                      width: 120,
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  >
                    <option value="WIRE">WIRE</option>
                    <option value="ACH">ACH</option>
                    <option value="CHECK">CHECK</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                  <input
                    type="date"
                    value={payPaidAt}
                    onChange={e => setPayPaidAt(e.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                  <input
                    placeholder="Reference"
                    value={payReference}
                    onChange={e => setPayReference(e.target.value)}
                    style={{
                      width: 160,
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                  <input
                    placeholder="Note"
                    value={payNote}
                    onChange={e => setPayNote(e.target.value)}
                    style={{
                      flex: "1 1 200px",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="button"
                    disabled={recordPaymentSaving}
                    onClick={async () => {
                      if (!project) return;
                      const token = localStorage.getItem("accessToken");
                      if (!token) {
                        setPaymentsMessage("Missing access token.");
                        return;
                      }

                      const amountRaw = String(payAmount ?? "").trim();
                      const normalizedAmountRaw = amountRaw.replace(/[$,\s]/g, "");
                      const amount = Number(normalizedAmountRaw);
                      if (!Number.isFinite(amount) || amount <= 0) {
                        setPaymentsMessage("Payment amount must be a positive number.");
                        return;
                      }

                      setRecordPaymentSaving(true);
                      setPaymentsMessage(null);
                      try {
                        const res = await fetch(`${API_BASE}/projects/${project.id}/payments`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            amount,
                            method: payMethod,
                            paidAt: payPaidAt || undefined,
                            reference: payReference.trim() || undefined,
                            note: payNote.trim() || undefined,
                          }),
                        });
                        if (!res.ok) {
                          const text = await res.text().catch(() => "");
                          const hint =
                            text.includes("billing is not initialized") ||
                            text.includes("billing tables") ||
                            text.includes("ProjectPayment")
                              ? " Run DB migrations + prisma generate, then restart the API."
                              : "";
                          setPaymentsMessage(`Record payment failed (${res.status}) ${text}${hint}`);
                          return;
                        }

                        setProjectPayments(null);
                        setFinancialSummary(null);

                        setPayAmount("");
                        setPayPaidAt("");
                        setPayReference("");
                        setPayNote("");
                        setPaymentsMessage("Payment recorded.");
                      } catch (err: any) {
                        setPaymentsMessage(err?.message ?? "Record payment failed.");
                      } finally {
                        setRecordPaymentSaving(false);
                      }
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #0f172a",
                      background: recordPaymentSaving ? "#e5e7eb" : "#0f172a",
                      color: recordPaymentSaving ? "#4b5563" : "#f9fafb",
                      fontSize: 12,
                      cursor: recordPaymentSaving ? "default" : "pointer",
                    }}
                  >
                    {recordPaymentSaving ? "Recording…" : "Record"}
                  </button>
                </div>
              </div>
              </div>
            )}
          </div>

          {/* Payroll & Workforce roster */}
          <div
            style={{
              marginTop: 10,
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

              {!payrollLoading &&
                !payrollError &&
                (!payrollEmployees || payrollEmployees.length === 0) && (
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

          {/* Invoices */}
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
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>Invoices</span>
              <button
                type="button"
                onClick={() => {
                  setInvoiceMessage(null);
                  setProjectInvoices(null);
                  setActiveInvoice(null);
                }}
                disabled={projectInvoicesLoading}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: projectInvoicesLoading ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {projectInvoicesLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div style={{ padding: 10, fontSize: 12 }}>
              {invoiceMessage && (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    color: invoiceMessage.toLowerCase().includes("fail") ? "#b91c1c" : "#4b5563",
                  }}
                >
                  {invoiceMessage}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!project) return;
                    const token = localStorage.getItem("accessToken");
                    if (!token) {
                      setInvoiceMessage("Missing access token.");
                      return;
                    }

                    setInvoiceMessage(null);
                    setActiveInvoiceLoading(true);
                    setActiveInvoiceError(null);

                    try {
                      const res = await fetch(`${API_BASE}/projects/${project.id}/invoices/draft`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({}),
                      });

                      if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        throw new Error(`Failed to open draft invoice (${res.status}) ${text}`);
                      }

                      const json: any = await res.json();

                      if (!invoiceFullscreen) {
                        // Open invoice in a new tab for full-screen editing.
                        window.open(
                          `/projects/${project.id}?tab=FINANCIAL&invoiceFullscreen=1&invoiceId=${json.id}`,
                          "_blank",
                          "noopener,noreferrer",
                        );
                        setInvoiceMessage("Opened draft invoice in a new tab.");
                        setActiveInvoice(null);
                        return;
                      }

                      setActiveInvoice(json);
                      setProjectInvoices(null);
                    } catch (err: any) {
                      setActiveInvoiceError(err?.message ?? "Failed to open draft invoice.");
                    } finally {
                      setActiveInvoiceLoading(false);
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
                  Open living invoice (draft)
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!project) return;
                    const token = localStorage.getItem("accessToken");
                    if (!token) {
                      setInvoiceMessage("Missing access token.");
                      return;
                    }

                    const ok = window.confirm(
                      "Create a new draft invoice?\n\nThis will create a separate draft even if another draft exists.",
                    );
                    if (!ok) return;

                    setInvoiceMessage(null);
                    setActiveInvoiceLoading(true);
                    setActiveInvoiceError(null);

                    try {
                      const res = await fetch(`${API_BASE}/projects/${project.id}/invoices/draft`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ forceNew: true }),
                      });

                      if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        throw new Error(`Failed to create draft invoice (${res.status}) ${text}`);
                      }

                      const json: any = await res.json();

                      if (!invoiceFullscreen) {
                        window.open(
                          `/projects/${project.id}?tab=FINANCIAL&invoiceFullscreen=1&invoiceId=${json.id}`,
                          "_blank",
                          "noopener,noreferrer",
                        );
                        setInvoiceMessage("Opened new draft invoice in a new tab.");
                        setActiveInvoice(null);
                        setProjectInvoices(null);
                        return;
                      }

                      setActiveInvoice(json);
                      setProjectInvoices(null);
                      setInvoiceMessage("New draft invoice created.");
                    } catch (err: any) {
                      setActiveInvoiceError(err?.message ?? "Failed to create draft invoice.");
                    } finally {
                      setActiveInvoiceLoading(false);
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "1px solid #2563eb",
                    backgroundColor: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  New invoice
                </button>

                {activeInvoiceLoading && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Loading invoice…</span>
                )}
                {activeInvoiceError && (
                  <span style={{ fontSize: 12, color: "#b91c1c" }}>{activeInvoiceError}</span>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                {projectInvoicesLoading && (
                  <div style={{ color: "#6b7280" }}>Loading invoices…</div>
                )}
                {projectInvoicesError && !projectInvoicesLoading && (
                  <div style={{ color: "#b91c1c" }}>{projectInvoicesError}</div>
                )}

                {!projectInvoicesLoading &&
                  !projectInvoicesError &&
                  projectInvoices &&
                  projectInvoices.length === 0 && (
                    <div style={{ color: "#6b7280" }}>No invoices yet.</div>
                  )}

                {!projectInvoicesLoading &&
                  !projectInvoicesError &&
                  projectInvoices &&
                  projectInvoices.length > 0 && (
                    <div style={{ maxHeight: invoiceFullscreen ? "45vh" : 240, overflow: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f9fafb" }}>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Invoice</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Total</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Paid</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Balance</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Issued</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectInvoices.map((inv: any) => (
                            <tr
                              key={inv.id}
                              style={{ cursor: "pointer" }}
                              onClick={async () => {
                                const token = localStorage.getItem("accessToken");
                                if (!token) {
                                  setInvoiceMessage("Missing access token.");
                                  return;
                                }

                                if (!invoiceFullscreen) {
                                  window.open(
                                    `/projects/${project.id}?tab=FINANCIAL&invoiceFullscreen=1&invoiceId=${inv.id}`,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                  setInvoiceMessage("Opened invoice in a new tab.");
                                  return;
                                }

                                setInvoiceMessage(null);
                                setActiveInvoiceLoading(true);
                                setActiveInvoiceError(null);
                                try {
                                  const res = await fetch(
                                    `${API_BASE}/projects/${project.id}/invoices/${inv.id}`,
                                    { headers: { Authorization: `Bearer ${token}` } },
                                  );
                                  if (!res.ok) {
                                    const text = await res.text().catch(() => "");
                                    throw new Error(
                                      `Failed to load invoice (${res.status}) ${text}`,
                                    );
                                  }
                                  const json: any = await res.json();
                                  setActiveInvoice(json);
                                } catch (err: any) {
                                  setActiveInvoiceError(err?.message ?? "Failed to load invoice.");
                                } finally {
                                  setActiveInvoiceLoading(false);
                                }
                              }}
                            >
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  fontWeight: inv.status === "DRAFT" ? 600 : 400,
                                }}
                              >
                                {inv.invoiceNo ?? "(draft)"}
                              </td>
                              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                {inv.status}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                }}
                              >
                                {(inv.totalAmount ?? 0).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                }}
                              >
                                {(inv.paidAmount ?? 0).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                }}
                              >
                                {(inv.balanceDue ?? 0).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>

              {activeInvoice && (
                <div
                  data-print-scope="invoice"
                  style={{
                    marginTop: 12,
                    borderTop: "1px solid #e5e7eb",
                    paddingTop: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img
                          src="/nexus-logo-mark.png"
                          alt="Nexus"
                          style={{ height: 24, width: "auto" }}
                        />
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {activeInvoice.invoiceNo ?? "Draft invoice"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Status: {activeInvoice.status}
                        {activeInvoice.issuedAt
                          ? ` · Issued ${new Date(activeInvoice.issuedAt).toLocaleDateString()}`
                          : ""}
                      </div>

                      {invoiceFullscreen && (
                        <div className="no-print" style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setInvoicePrintLayout("KEEP");
                              setInvoicePrintGroups("KEEP");
                              setInvoicePrintDialogOpen(true);
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px solid #0f172a",
                              background: "#0f172a",
                              color: "#f9fafb",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            Print / Save PDF
                          </button>

                          <div style={{ fontSize: 11, color: "#6b7280", alignSelf: "center" }}>
                            Tip: choose “Save as PDF” in the print dialog.
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Total</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {(activeInvoice.totalAmount ?? 0).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>

                  {invoicePrintDialogOpen && (
                    <div
                      className="no-print"
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 80,
                        background: "rgba(15,23,42,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 12,
                      }}
                      onClick={() => setInvoicePrintDialogOpen(false)}
                    >
                      <div
                        style={{
                          width: 560,
                          maxWidth: "96vw",
                          maxHeight: "90vh",
                          overflow: "auto",
                          background: "#ffffff",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
                        }}
                        onClick={(e) => e.stopPropagation()}
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
                            background: "#f3f4f6",
                          }}
                        >
                          <div>
                            Print invoice
                            <div style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>
                              Configure layout for printing / PDF export.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInvoicePrintDialogOpen(false)}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 18,
                              lineHeight: 1,
                            }}
                            aria-label="Close print dialog"
                          >
                            ×
                          </button>
                        </div>

                        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ fontSize: 12, color: "#374151" }}>
                            This will print the <strong>currently open invoice</strong>. For best results,
                            use “Save as PDF” in your browser’s print dialog.
                          </div>

                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Layout</div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                                <input
                                  type="radio"
                                  name="invoicePrintLayout"
                                  value="KEEP"
                                  checked={invoicePrintLayout === "KEEP"}
                                  onChange={() => setInvoicePrintLayout("KEEP")}
                                />
                                Keep current
                              </label>
                              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                                <input
                                  type="radio"
                                  name="invoicePrintLayout"
                                  value="GROUPED"
                                  checked={invoicePrintLayout === "GROUPED"}
                                  onChange={() => setInvoicePrintLayout("GROUPED")}
                                />
                                Grouped
                              </label>
                              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                                <input
                                  type="radio"
                                  name="invoicePrintLayout"
                                  value="FLAT"
                                  checked={invoicePrintLayout === "FLAT"}
                                  onChange={() => setInvoicePrintLayout("FLAT")}
                                />
                                Flat list
                              </label>
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                              Group expansion
                            </div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                                <input
                                  type="radio"
                                  name="invoicePrintGroups"
                                  value="KEEP"
                                  checked={invoicePrintGroups === "KEEP"}
                                  onChange={() => setInvoicePrintGroups("KEEP")}
                                />
                                Keep current
                              </label>
                              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                                <input
                                  type="radio"
                                  name="invoicePrintGroups"
                                  value="COLLAPSE_ALL"
                                  checked={invoicePrintGroups === "COLLAPSE_ALL"}
                                  onChange={() => setInvoicePrintGroups("COLLAPSE_ALL")}
                                />
                                Collapse all
                              </label>
                              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                                <input
                                  type="radio"
                                  name="invoicePrintGroups"
                                  value="EXPAND_ALL"
                                  checked={invoicePrintGroups === "EXPAND_ALL"}
                                  onChange={() => setInvoicePrintGroups("EXPAND_ALL")}
                                />
                                Expand all
                              </label>
                            </div>
                            <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                              Tip: choose “Keep current” to expand only some groups, then print.
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setInvoicePrintDialogOpen(false)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #d1d5db",
                                background: "#ffffff",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={invoicePrintBusy}
                              onClick={() => {
                                if (!activeInvoice) return;

                                setInvoicePrintBusy(true);
                                try {
                                  // Print a clean HTML document (PDF-friendly) based on the current screen layout.
                                  printActiveInvoiceAsHtml({
                                    layout: invoicePrintLayout,
                                    groups: invoicePrintGroups,
                                  });
                                  setInvoicePrintDialogOpen(false);
                                } finally {
                                  window.setTimeout(() => setInvoicePrintBusy(false), 300);
                                }
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #0f172a",
                                background: invoicePrintBusy ? "#e5e7eb" : "#0f172a",
                                color: invoicePrintBusy ? "#4b5563" : "#f9fafb",
                                cursor: invoicePrintBusy ? "default" : "pointer",
                                fontSize: 12,
                              }}
                            >
                              {invoicePrintBusy ? "Preparing…" : "Print / Save PDF"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detailed invoice (PETL) */}
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>Estimate line items (PETL)</div>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={invoiceGroupEnabled}
                          onChange={(e) => setInvoiceGroupEnabledPersisted(e.target.checked)}
                        />
                        Group
                      </label>
                    </div>

                    {activeInvoicePetlLines.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        No PETL-derived invoice detail lines yet. (If you just enabled this feature,
                        run database migrations and restart the API.)
                      </div>
                    ) : (
                      <div
                        className="print-expand-scroll"
                        style={{
                          maxHeight: invoiceFullscreen ? "60vh" : 360,
                          overflow: "auto",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                        }}
                      >
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ backgroundColor: "#f9fafb" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Estimate Line Item</th>
                              {!invoiceGroupEnabled && (
                                <>
                                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Room</th>
                                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Unit</th>
                                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Building</th>
                                </>
                              )}
                              <th style={{ textAlign: "right", padding: "6px 8px", width: 70 }}>%</th>
                              <th style={{ textAlign: "right", padding: "6px 8px", width: 90 }}>Earned</th>
                              <th style={{ textAlign: "right", padding: "6px 8px", width: 110 }}>Prev billed</th>
                              <th style={{ textAlign: "right", padding: "6px 8px", width: 110 }}>This (Δ)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoiceGroupEnabled ? (
                              invoicePetlGrouped.flatMap((g: any, groupIndex: number) => {
                                const out: any[] = [];

                                // Defensive: never allow empty/undefined group keys, since React keys
                                // must be unique and stable.
                                const rawGroupKey = String(g.groupKey ?? g.groupLabel ?? "").trim();
                                const groupKey = rawGroupKey || `__group_${groupIndex}`;
                                const groupLabel =
                                  String(g.groupLabel ?? rawGroupKey).trim() || rawGroupKey || "(Unlabeled)";

                                const groupOpen = invoiceGroupOpenBuildings.has(groupKey);

                                out.push(
                                  <tr
                                    key={`g-${groupKey}`}
                                    style={{ background: "#eef2ff", cursor: "pointer" }}
                                    onClick={() => toggleInvoiceBuildingOpen(groupKey)}
                                  >
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", fontWeight: 700 }}>
                                      {groupOpen ? "▾ " : "▸ "}
                                      {groupLabel}
                                    </td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>—</td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>—</td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>—</td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700 }}>
                                      {formatMoney(g.subtotal)}
                                    </td>
                                  </tr>,
                                );

                                if (!groupOpen) return out;

                                const lines = Array.isArray(g.lines) ? g.lines : [];
                                for (const li of lines) {
                                  const isCredit = String(li.kind) === "ACV_HOLDBACK_CREDIT";
                                  const cat = String(li.categoryCodeSnapshot ?? "").trim();
                                  const sel = String(li.selectionCodeSnapshot ?? "").trim();
                                  const task = String(li.descriptionSnapshot ?? "").trim();
                                  const lineNo = li.lineNoSnapshot != null ? String(li.lineNoSnapshot) : "";

                                  const label = isCredit
                                    ? "↳ ACV holdback (80%)"
                                    : `${lineNo}${cat || sel ? ` · ${cat}${sel ? `/${sel}` : ""}` : ""}${task ? ` · ${task}` : ""}`;

                                  const effectiveTag = getInvoicePetlEffectiveTag(li);
                                  const tagLabel = formatBillingTag(effectiveTag);
                                  const canEditTag = !isCredit && !li?.parentLineId;
                                  const isEditingTag = canEditTag && invoicePetlTagEditingLineId === li.id;

                                  out.push(
                                    <tr key={li.id ?? `${groupKey}-${li.sowItemId}-${li.kind}-${label}`}>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 10,
                                          }}
                                        >
                                          <span
                                            style={{
                                              paddingLeft: isCredit ? 44 : 36,
                                              color: isCredit ? "#b91c1c" : "#111827",
                                              whiteSpace: "nowrap",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                            }}
                                            title={label}
                                          >
                                            {label}
                                          </span>

                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {tagLabel && !isEditingTag && (
                                              <span
                                                style={{
                                                  fontSize: 10,
                                                  fontWeight: 700,
                                                  padding: "2px 8px",
                                                  borderRadius: 999,
                                                  border: "1px solid #d1d5db",
                                                  background: "#ffffff",
                                                  color: "#374151",
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                {tagLabel}
                                              </span>
                                            )}

                                            {canEditTag && !isEditingTag && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setInvoicePetlTagEditingLineId(String(li.id));
                                                  setInvoicePetlTagDraft(String(li?.billingTag ?? "NONE") || "NONE");
                                                }}
                                                style={{
                                                  border: "1px solid #d1d5db",
                                                  background: "#ffffff",
                                                  cursor: "pointer",
                                                  padding: "2px 8px",
                                                  borderRadius: 999,
                                                  fontSize: 11,
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                Edit
                                              </button>
                                            )}

                                            {isEditingTag && (
                                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <select
                                                  value={invoicePetlTagDraft}
                                                  onChange={(e) => setInvoicePetlTagDraft(e.target.value)}
                                                  style={{
                                                    padding: "2px 6px",
                                                    borderRadius: 6,
                                                    border: "1px solid #d1d5db",
                                                    fontSize: 11,
                                                  }}
                                                >
                                                  <option value="NONE">—</option>
                                                  <option value="PETL_LINE_ITEM">PETL Line Item</option>
                                                  <option value="CHANGE_ORDER">Change Order</option>
                                                  <option value="SUPPLEMENT">Supplement</option>
                                                  <option value="WARRANTY">Warranty</option>
                                                </select>
                                                <button
                                                  type="button"
                                                  disabled={invoicePetlTagSaving}
                                                  onClick={async () => {
                                                    if (!project || !activeInvoice?.id || !li?.id) return;
                                                    const token = localStorage.getItem("accessToken");
                                                    if (!token) {
                                                      setInvoiceMessage("Missing access token.");
                                                      return;
                                                    }
                                                    setInvoicePetlTagSaving(true);
                                                    setInvoiceMessage(null);
                                                    try {
                                                      const res = await fetch(
                                                        `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/petl-lines/${li.id}`,
                                                        {
                                                          method: "PATCH",
                                                          headers: {
                                                            "Content-Type": "application/json",
                                                            Authorization: `Bearer ${token}`,
                                                          },
                                                          body: JSON.stringify({ billingTag: invoicePetlTagDraft }),
                                                        },
                                                      );
                                                      if (!res.ok) {
                                                        const text = await res.text().catch(() => "");
                                                        setInvoiceMessage(`Update failed (${res.status}) ${text}`);
                                                        return;
                                                      }
                                                      const updated = await res.json().catch(() => null);
                                                      setActiveInvoice((prev: any) => {
                                                        if (!prev) return prev;
                                                        const lines = Array.isArray(prev.petlLines) ? prev.petlLines : [];
                                                        return {
                                                          ...prev,
                                                          petlLines: lines.map((x: any) =>
                                                            x?.id === updated?.id ? { ...x, ...updated } : x,
                                                          ),
                                                        };
                                                      });
                                                      setInvoicePetlTagEditingLineId(null);
                                                    } catch (err: any) {
                                                      setInvoiceMessage(err?.message ?? "Update failed.");
                                                    } finally {
                                                      setInvoicePetlTagSaving(false);
                                                    }
                                                  }}
                                                  style={{
                                                    padding: "2px 8px",
                                                    borderRadius: 6,
                                                    border: "1px solid #0f172a",
                                                    background: "#0f172a",
                                                    color: "#f9fafb",
                                                    fontSize: 11,
                                                    cursor: invoicePetlTagSaving ? "default" : "pointer",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  {invoicePetlTagSaving ? "Saving…" : "Save"}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={invoicePetlTagSaving}
                                                  onClick={() => setInvoicePetlTagEditingLineId(null)}
                                                  style={{
                                                    padding: "2px 8px",
                                                    borderRadius: 6,
                                                    border: "1px solid #d1d5db",
                                                    background: "#ffffff",
                                                    fontSize: 11,
                                                    cursor: invoicePetlTagSaving ? "default" : "pointer",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
                                        {li.percentCompleteSnapshot != null ? `${Number(li.percentCompleteSnapshot).toFixed(0)}%` : "—"}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
                                        {formatMoney(li.earnedTotal)}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
                                        {formatMoney(li.prevBilledTotal)}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 600 }}>
                                        {formatMoney(li.thisInvTotal)}
                                      </td>
                                    </tr>,
                                  );
                                }

                                return out;
                              })
                            ) : (
                              [...activeInvoicePetlLines]
                                .sort((a, b) => {
                                  const pa = String(a?.projectTreePathSnapshot ?? "");
                                  const pb = String(b?.projectTreePathSnapshot ?? "");
                                  if (pa !== pb) return pa.localeCompare(pb);
                                  const la = Number(a?.lineNoSnapshot ?? 0);
                                  const lb = Number(b?.lineNoSnapshot ?? 0);
                                  if (la !== lb) return la - lb;
                                  const ka = String(a?.kind ?? "");
                                  const kb = String(b?.kind ?? "");
                                  return ka.localeCompare(kb);
                                })
                                .map((li: any) => {
                                  const isCredit = String(li.kind) === "ACV_HOLDBACK_CREDIT";
                                  const cat = String(li.categoryCodeSnapshot ?? "").trim();
                                  const sel = String(li.selectionCodeSnapshot ?? "").trim();
                                  const task = String(li.descriptionSnapshot ?? "").trim();
                                  const lineNo = li.lineNoSnapshot != null ? String(li.lineNoSnapshot) : "";

                                  const label = isCredit
                                    ? "↳ ACV holdback (80%)"
                                    : `${lineNo}${cat || sel ? ` · ${cat}${sel ? `/${sel}` : ""}` : ""}${task ? ` · ${task}` : ""}`;

                                  const effectiveTag = getInvoicePetlEffectiveTag(li);
                                  const tagLabel = formatBillingTag(effectiveTag);
                                  const canEditTag = !isCredit && !li?.parentLineId;
                                  const isEditingTag = canEditTag && invoicePetlTagEditingLineId === li.id;

                                  return (
                                    <tr key={li.id ?? `${li.sowItemId}-${li.kind}-${label}`}>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                          <span
                                            style={{
                                              paddingLeft: isCredit ? 18 : 0,
                                              color: isCredit ? "#b91c1c" : "#111827",
                                              whiteSpace: "nowrap",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                            }}
                                            title={label}
                                          >
                                            {label}
                                          </span>

                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {tagLabel && !isEditingTag && (
                                              <span
                                                style={{
                                                  fontSize: 10,
                                                  fontWeight: 700,
                                                  padding: "2px 8px",
                                                  borderRadius: 999,
                                                  border: "1px solid #d1d5db",
                                                  background: "#ffffff",
                                                  color: "#374151",
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                {tagLabel}
                                              </span>
                                            )}

                                            {canEditTag && !isEditingTag && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setInvoicePetlTagEditingLineId(String(li.id));
                                                  setInvoicePetlTagDraft(String(li?.billingTag ?? "NONE") || "NONE");
                                                }}
                                                style={{
                                                  border: "1px solid #d1d5db",
                                                  background: "#ffffff",
                                                  cursor: "pointer",
                                                  padding: "2px 8px",
                                                  borderRadius: 999,
                                                  fontSize: 11,
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                Edit
                                              </button>
                                            )}

                                            {isEditingTag && (
                                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <select
                                                  value={invoicePetlTagDraft}
                                                  onChange={(e) => setInvoicePetlTagDraft(e.target.value)}
                                                  style={{
                                                    padding: "2px 6px",
                                                    borderRadius: 6,
                                                    border: "1px solid #d1d5db",
                                                    fontSize: 11,
                                                  }}
                                                >
                                                  <option value="NONE">—</option>
                                                  <option value="PETL_LINE_ITEM">PETL Line Item</option>
                                                  <option value="CHANGE_ORDER">Change Order</option>
                                                  <option value="SUPPLEMENT">Supplement</option>
                                                  <option value="WARRANTY">Warranty</option>
                                                </select>
                                                <button
                                                  type="button"
                                                  disabled={invoicePetlTagSaving}
                                                  onClick={async () => {
                                                    if (!project || !activeInvoice?.id || !li?.id) return;
                                                    const token = localStorage.getItem("accessToken");
                                                    if (!token) {
                                                      setInvoiceMessage("Missing access token.");
                                                      return;
                                                    }
                                                    setInvoicePetlTagSaving(true);
                                                    setInvoiceMessage(null);
                                                    try {
                                                      const res = await fetch(
                                                        `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/petl-lines/${li.id}`,
                                                        {
                                                          method: "PATCH",
                                                          headers: {
                                                            "Content-Type": "application/json",
                                                            Authorization: `Bearer ${token}`,
                                                          },
                                                          body: JSON.stringify({ billingTag: invoicePetlTagDraft }),
                                                        },
                                                      );
                                                      if (!res.ok) {
                                                        const text = await res.text().catch(() => "");
                                                        setInvoiceMessage(`Update failed (${res.status}) ${text}`);
                                                        return;
                                                      }
                                                      const updated = await res.json().catch(() => null);
                                                      setActiveInvoice((prev: any) => {
                                                        if (!prev) return prev;
                                                        const lines = Array.isArray(prev.petlLines) ? prev.petlLines : [];
                                                        return {
                                                          ...prev,
                                                          petlLines: lines.map((x: any) =>
                                                            x?.id === updated?.id ? { ...x, ...updated } : x,
                                                          ),
                                                        };
                                                      });
                                                      setInvoicePetlTagEditingLineId(null);
                                                    } catch (err: any) {
                                                      setInvoiceMessage(err?.message ?? "Update failed.");
                                                    } finally {
                                                      setInvoicePetlTagSaving(false);
                                                    }
                                                  }}
                                                  style={{
                                                    padding: "2px 8px",
                                                    borderRadius: 6,
                                                    border: "1px solid #0f172a",
                                                    background: "#0f172a",
                                                    color: "#f9fafb",
                                                    fontSize: 11,
                                                    cursor: invoicePetlTagSaving ? "default" : "pointer",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  {invoicePetlTagSaving ? "Saving…" : "Save"}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={invoicePetlTagSaving}
                                                  onClick={() => setInvoicePetlTagEditingLineId(null)}
                                                  style={{
                                                    padding: "2px 8px",
                                                    borderRadius: 6,
                                                    border: "1px solid #d1d5db",
                                                    background: "#ffffff",
                                                    fontSize: 11,
                                                    cursor: invoicePetlTagSaving ? "default" : "pointer",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        {li.projectParticleLabelSnapshot ?? ""}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563" }}>
                                        {li.projectUnitLabelSnapshot ?? ""}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", color: "#4b5563" }}>
                                        {li.projectBuildingLabelSnapshot ?? ""}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
                                        {li.percentCompleteSnapshot != null ? `${Number(li.percentCompleteSnapshot).toFixed(0)}%` : "—"}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
                                        {formatMoney(li.earnedTotal)}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", color: "#4b5563" }}>
                                        {formatMoney(li.prevBilledTotal)}
                                      </td>
                                      <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 600 }}>
                                        {formatMoney(li.thisInvTotal)}
                                      </td>
                                    </tr>
                                  );
                                })
                            )}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: "#f9fafb" }}>
                              <td
                                colSpan={invoiceGroupEnabled ? 4 : 7}
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                  fontWeight: 700,
                                }}
                              >
                                Total PETL (Δ)
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderTop: "1px solid #e5e7eb",
                                  textAlign: "right",
                                  fontWeight: 700,
                                }}
                              >
                                {formatMoney(
                                  activeInvoicePetlLines.reduce(
                                    (sum, x) => sum + (Number(x?.thisInvTotal ?? 0) || 0),
                                    0,
                                  ),
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Draft: line item CRUD + issue */}
                  {activeInvoice.status === "DRAFT" && (
                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>Line items</div>
                        <button
                          type="button"
                          onClick={() => setInvoiceCostBookPickerOpen(true)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 999,
                            border: "1px solid #2563eb",
                            backgroundColor: "#eff6ff",
                            color: "#1d4ed8",
                            fontSize: 11,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Add from Cost Book
                        </button>
                      </div>

                      <div style={{ maxHeight: invoiceFullscreen ? "45vh" : 240, overflow: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 12,
                          }}
                        >
                          <thead>
                            <tr style={{ backgroundColor: "#f9fafb" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>Qty</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>Unit $</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>Amount</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeInvoiceLineItemGroups.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={5}
                                  style={{
                                    padding: "8px 10px",
                                    borderTop: "1px solid #e5e7eb",
                                    color: "#6b7280",
                                    fontSize: 12,
                                  }}
                                >
                                  No invoice lines yet.
                                </td>
                              </tr>
                            ) : (
                              activeInvoiceLineItemGroups.flatMap((group) => {
                                const rows: React.ReactNode[] = [];

                                rows.push(
                                  <tr key={`group-${group.kind}`} style={{ background: "#f3f4f6" }}>
                                    <td
                                      colSpan={5}
                                      style={{
                                        padding: "6px 8px",
                                        borderTop: "1px solid #e5e7eb",
                                        fontWeight: 700,
                                        color: "#111827",
                                      }}
                                    >
                                      {group.label} · {formatMoney(group.subtotal)}
                                    </td>
                                  </tr>,
                                );

                                for (const li of group.items) {
                                  rows.push(
                                    <tr key={li.id}>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                        }}
                                      >
                                        {li.description}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                          color: "#4b5563",
                                        }}
                                      >
                                        {li.qty ?? "—"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                          color: "#4b5563",
                                        }}
                                      >
                                        {li.unitPrice ?? "—"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                        }}
                                      >
                                        {(li.amount ?? 0).toLocaleString(undefined, {
                                          maximumFractionDigits: 2,
                                        })}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          borderTop: "1px solid #e5e7eb",
                                          textAlign: "right",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!project) return;
                                            const token = localStorage.getItem("accessToken");
                                            if (!token) {
                                              setInvoiceMessage("Missing access token.");
                                              return;
                                            }

                                            const nextDesc =
                                              prompt("Description", String(li.description ?? "")) ??
                                              String(li.description ?? "");

                                            const nextAmountStr =
                                              prompt("Amount", String(li.amount ?? "")) ??
                                              String(li.amount ?? "");
                                            const nextAmount = Number(nextAmountStr);
                                            if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
                                              setInvoiceMessage("Amount must be a positive number.");
                                              return;
                                            }

                                            const nextKindRaw =
                                              prompt(
                                                "Kind (MANUAL, BILLABLE_HOURS, EQUIPMENT_RENTAL, COST_BOOK, OTHER)",
                                                String(li.kind ?? "MANUAL"),
                                              ) ?? String(li.kind ?? "MANUAL");
                                            const nextKind = nextKindRaw.trim().toUpperCase();
                                            const allowedKinds = new Set([
                                              "MANUAL",
                                              "BILLABLE_HOURS",
                                              "EQUIPMENT_RENTAL",
                                              "COST_BOOK",
                                              "OTHER",
                                            ]);
                                            if (!allowedKinds.has(nextKind)) {
                                              setInvoiceMessage("Invalid kind.");
                                              return;
                                            }

                                            const nextTagRaw =
                                              prompt(
                                                "Billing tag (NONE, PETL_LINE_ITEM, CHANGE_ORDER, SUPPLEMENT, WARRANTY)",
                                                String(li.billingTag ?? "NONE"),
                                              ) ?? String(li.billingTag ?? "NONE");
                                            const nextTag = nextTagRaw.trim().toUpperCase();
                                            const allowedTags = new Set([
                                              "NONE",
                                              "PETL_LINE_ITEM",
                                              "CHANGE_ORDER",
                                              "SUPPLEMENT",
                                              "WARRANTY",
                                            ]);
                                            if (!allowedTags.has(nextTag)) {
                                              setInvoiceMessage("Invalid billing tag.");
                                              return;
                                            }

                                            try {
                                              const res = await fetch(
                                                `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/lines/${li.id}`,
                                                {
                                                  method: "PATCH",
                                                  headers: {
                                                    "Content-Type": "application/json",
                                                    Authorization: `Bearer ${token}`,
                                                  },
                                                  body: JSON.stringify({
                                                    description: nextDesc,
                                                    amount: nextAmount,
                                                    kind: nextKind,
                                                    billingTag: nextTag,
                                                  }),
                                                },
                                              );
                                              if (!res.ok) {
                                                const text = await res.text().catch(() => "");
                                                setInvoiceMessage(
                                                  `Edit failed (${res.status}) ${text}`,
                                                );
                                                return;
                                              }
                                              const json: any = await res.json();
                                              setActiveInvoice(json);
                                              setProjectInvoices(null);
                                            } catch (err: any) {
                                              setInvoiceMessage(err?.message ?? "Edit failed.");
                                            }
                                          }}
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: 4,
                                            border: "1px solid #d1d5db",
                                            background: "#ffffff",
                                            fontSize: 11,
                                            cursor: "pointer",
                                            marginRight: 6,
                                          }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!project) return;
                                            const token = localStorage.getItem("accessToken");
                                            if (!token) {
                                              setInvoiceMessage("Missing access token.");
                                              return;
                                            }
                                            if (!confirm("Delete this line item?") ) return;

                                            try {
                                              const res = await fetch(
                                                `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/lines/${li.id}`,
                                                {
                                                  method: "DELETE",
                                                  headers: { Authorization: `Bearer ${token}` },
                                                },
                                              );
                                              if (!res.ok) {
                                                const text = await res.text().catch(() => "");
                                                setInvoiceMessage(
                                                  `Delete failed (${res.status}) ${text}`,
                                                );
                                                return;
                                              }
                                              const json: any = await res.json();
                                              setActiveInvoice(json);
                                              setProjectInvoices(null);
                                            } catch (err: any) {
                                              setInvoiceMessage(err?.message ?? "Delete failed.");
                                            }
                                          }}
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: 4,
                                            border: "1px solid #b91c1c",
                                            background: "#fee2e2",
                                            color: "#991b1b",
                                            fontSize: 11,
                                            cursor: "pointer",
                                          }}
                                        >
                                          Delete
                                        </button>
                                      </td>
                                    </tr>,
                                  );
                                }

                                return rows;
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <select
                          value={newInvoiceLineKind}
                          onChange={e => setNewInvoiceLineKind(e.target.value)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                            minWidth: 160,
                          }}
                        >
                          <option value="MANUAL">Manual</option>
                          <option value="BILLABLE_HOURS">Billable hours</option>
                          <option value="EQUIPMENT_RENTAL">Equipment rental</option>
                          <option value="OTHER">Other</option>
                        </select>

                        <select
                          value={newInvoiceLineBillingTag}
                          onChange={e => setNewInvoiceLineBillingTag(e.target.value)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                            minWidth: 160,
                          }}
                        >
                          <option value="NONE">(no tag)</option>
                          <option value="PETL_LINE_ITEM">PETL Line Item</option>
                          <option value="CHANGE_ORDER">Change Order</option>
                          <option value="SUPPLEMENT">Supplement</option>
                          <option value="WARRANTY">Warranty</option>
                        </select>
                        <input
                          placeholder="Description"
                          value={newInvoiceLineDesc}
                          onChange={e => setNewInvoiceLineDesc(e.target.value)}
                          style={{
                            flex: "1 1 260px",
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                        <input
                          placeholder="Qty"
                          value={newInvoiceLineQty}
                          onChange={e => setNewInvoiceLineQty(e.target.value)}
                          style={{
                            width: 80,
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                        <input
                          placeholder="Unit $"
                          value={newInvoiceLineUnitPrice}
                          onChange={e => setNewInvoiceLineUnitPrice(e.target.value)}
                          style={{
                            width: 100,
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                        <input
                          placeholder="Amount (optional)"
                          value={newInvoiceLineAmount}
                          onChange={e => setNewInvoiceLineAmount(e.target.value)}
                          style={{
                            width: 140,
                            padding: "6px 8px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                            fontSize: 12,
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!project) return;
                            const token = localStorage.getItem("accessToken");
                            if (!token) {
                              setInvoiceMessage("Missing access token.");
                              return;
                            }

                            const desc = newInvoiceLineDesc.trim();
                            if (!desc) {
                              setInvoiceMessage("Line description is required.");
                              return;
                            }

                            const qty = newInvoiceLineQty.trim() === "" ? undefined : Number(newInvoiceLineQty);
                            const unitPrice =
                              newInvoiceLineUnitPrice.trim() === "" ? undefined : Number(newInvoiceLineUnitPrice);
                            const amount =
                              newInvoiceLineAmount.trim() === "" ? undefined : Number(newInvoiceLineAmount);

                            if (
                              (qty !== undefined && !Number.isFinite(qty)) ||
                              (unitPrice !== undefined && !Number.isFinite(unitPrice)) ||
                              (amount !== undefined && !Number.isFinite(amount))
                            ) {
                              setInvoiceMessage("Qty / Unit / Amount must be valid numbers.");
                              return;
                            }

                            try {
                              const res = await fetch(
                                `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/lines`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    kind: newInvoiceLineKind,
                                    billingTag: newInvoiceLineBillingTag,
                                    description: desc,
                                    qty,
                                    unitPrice,
                                    amount,
                                  }),
                                },
                              );
                              if (!res.ok) {
                                const text = await res.text().catch(() => "");
                                setInvoiceMessage(
                                  `Add line failed (${res.status}) ${text}`,
                                );
                                return;
                              }
                              const json: any = await res.json();
                              setActiveInvoice(json);
                              setProjectInvoices(null);
                              setNewInvoiceLineDesc("");
                              setNewInvoiceLineQty("");
                              setNewInvoiceLineUnitPrice("");
                              setNewInvoiceLineAmount("");
                              setInvoiceMessage("Line added.");
                            } catch (err: any) {
                              setInvoiceMessage(err?.message ?? "Add line failed.");
                            }
                          }}
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
                          Add line
                        </button>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Issue invoice</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input
                            placeholder="Bill to name"
                            value={issueBillToName}
                            onChange={e => setIssueBillToName(e.target.value)}
                            style={{
                              flex: "1 1 180px",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                          <input
                            placeholder="Bill to email"
                            value={issueBillToEmail}
                            onChange={e => setIssueBillToEmail(e.target.value)}
                            style={{
                              flex: "1 1 220px",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                          <input
                            placeholder="Memo"
                            value={issueMemo}
                            onChange={e => setIssueMemo(e.target.value)}
                            style={{
                              flex: "1 1 260px",
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                          <input
                            type="date"
                            value={issueDueAt}
                            onChange={e => setIssueDueAt(e.target.value)}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 4,
                              border: "1px solid #d1d5db",
                              fontSize: 12,
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!project) return;
                              const token = localStorage.getItem("accessToken");
                              if (!token) {
                                setInvoiceMessage("Missing access token.");
                                return;
                              }
                              setInvoiceMessage(null);
                              try {
                                const res = await fetch(
                                  `${API_BASE}/projects/${project.id}/invoices/${activeInvoice.id}/issue`,
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      billToName: issueBillToName.trim() || undefined,
                                      billToEmail: issueBillToEmail.trim() || undefined,
                                      memo: issueMemo.trim() || undefined,
                                      dueAt: issueDueAt || undefined,
                                    }),
                                  },
                                );
                                if (!res.ok) {
                                  const text = await res.text().catch(() => "");
                                  setInvoiceMessage(
                                    `Issue failed (${res.status}) ${text}`,
                                  );
                                  return;
                                }
                                const json: any = await res.json();
                                setActiveInvoice(json);
                                setProjectInvoices(null);
                                setFinancialSummary(null);
                                setInvoiceMessage("Invoice issued and locked.");
                              } catch (err: any) {
                                setInvoiceMessage(err?.message ?? "Issue failed.");
                              }
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 4,
                              border: "1px solid #16a34a",
                              background: "#dcfce7",
                              color: "#166534",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            Issue &amp; lock
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Issued: payments shown above Payroll & Workforce */}
                </div>
              )}
            </div>
          </div>
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

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 6,
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 2, minWidth: 0 }}>
                      <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                        Person/s onsite
                      </label>
                      {(() => {
                        const availableOptions = personOnsiteOptions.filter(opt =>
                          !personOnsiteList.some(
                            name => name.toLowerCase() === opt.value.toLowerCase(),
                          ),
                        );
                        return (
                          <>
                            {availableOptions.length > 0 && (
                              <div style={{ marginBottom: 4 }}>
                                <select
                                  value=""
                                  onChange={e => {
                                    const value = e.target.value;
                                    if (!value) return;
                                    updatePersonOnsiteList(prev =>
                                      prev.some(
                                        name =>
                                          name.toLowerCase() === value.toLowerCase(),
                                      )
                                        ? prev
                                        : [...prev, value],
                                    );
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "4px 6px",
                                    borderRadius: 4,
                                    border: "1px solid #d1d5db",
                                    fontSize: 12,
                                    marginBottom: 4,
                                  }}
                                >
                                  <option value="">Add from project roster…</option>
                                  {availableOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div
                              style={{
                                minHeight: 34,
                                padding: "4px 6px",
                                borderRadius: 4,
                                border: "1px solid #d1d5db",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                cursor: "text",
                              }}
                              onClick={() => {
                                const inputEl = document.getElementById(
                                  "person-onsite-draft-input",
                                ) as HTMLInputElement | null;
                                inputEl?.focus();
                              }}
                            >
                              {personOnsiteList.map(name => (
                                <span
                                  key={name}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 6px",
                                    borderRadius: 999,
                                    backgroundColor: "#eff6ff",
                                    border: "1px solid #bfdbfe",
                                    fontSize: 11,
                                    color: "#1d4ed8",
                                  }}
                                >
                                  <span>{name}</span>
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      updatePersonOnsiteList(prev =>
                                        prev.filter(n => n !== name),
                                      );
                                    }}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      cursor: "pointer",
                                      fontSize: 11,
                                      color: "#1d4ed8",
                                    }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              <input
                                id="person-onsite-draft-input"
                                type="text"
                                value={personOnsiteDraft}
                                onChange={e => setPersonOnsiteDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" || e.key === ",") {
                                    e.preventDefault();
                                    const raw = personOnsiteDraft.trim();
                                    if (!raw) return;
                                    updatePersonOnsiteList(prev =>
                                      prev.some(
                                        name =>
                                          name.toLowerCase() === raw.toLowerCase(),
                                      )
                                        ? prev
                                        : [...prev, raw],
                                    );
                                    setPersonOnsiteDraft("");
                                  }
                                }}
                                onBlur={e => {
                                  const raw = e.target.value.trim();
                                  if (!raw) {
                                    setPersonOnsiteDraft("");
                                    return;
                                  }
                                  updatePersonOnsiteList(prev =>
                                    prev.some(
                                      name =>
                                        name.toLowerCase() === raw.toLowerCase(),
                                    )
                                      ? prev
                                      : [...prev, raw],
                                  );
                                  setPersonOnsiteDraft("");
                                }}
                                placeholder={
                                  personOnsiteList.length === 0
                                    ? "Type a person onsite and press Enter…"
                                    : "Type another name and press Enter…"
                                }
                                style={{
                                  flex: 1,
                                  minWidth: 120,
                                  border: "none",
                                  outline: "none",
                                  fontSize: 12,
                                  padding: 0,
                                }}
                              />
                            </div>

                            <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                              If a person isn&apos;t in the roster dropdown, type their name
                              above. We&apos;ll create a workflow item for tenant admin to add
                              them to this project.
                            </div>

                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                color: "#4b5563",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                                alignItems: "center",
                              }}
                            >
                              <button
                                type="button"
                                disabled={personOnsiteList.length === 0}
                                onClick={() => {
                                  if (!personOnsiteList.length) return;
                                  const name = window.prompt(
                                    "Name this person/s onsite group (favorites)",
                                  );
                                  if (!name) return;
                                  const trimmed = name.trim();
                                  if (!trimmed) return;
                                  const id = `grp-${Date.now().toString(36)}-${Math.random()
                                    .toString(36)
                                    .slice(2, 8)}`;
                                  const group = {
                                    id,
                                    name: trimmed,
                                    members: [...personOnsiteList],
                                  };
                                  persistPersonOnsiteGroups([
                                    ...personOnsiteGroups,
                                    group,
                                  ]);
                                  setSelectedPersonOnsiteGroupId(id);
                                }}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: 999,
                                  border: "1px solid #d1d5db",
                                  backgroundColor:
                                    personOnsiteList.length === 0
                                      ? "#f9fafb"
                                      : "#ffffff",
                                  fontSize: 11,
                                  cursor:
                                    personOnsiteList.length === 0
                                      ? "default"
                                      : "pointer",
                                }}
                              >
                                Save group as favorite
                              </button>
                              {personOnsiteGroups.length > 0 && (
                                <>
                                  <span>Favorites:</span>
                                  <select
                                    value={selectedPersonOnsiteGroupId}
                                    onChange={e => {
                                      const id = e.target.value;
                                      setSelectedPersonOnsiteGroupId(id);
                                      const group = personOnsiteGroups.find(g => g.id === id);
                                      if (group) {
                                        updatePersonOnsiteList(() => [...group.members]);
                                      }
                                    }}
                                    style={{
                                      padding: "3px 6px",
                                      borderRadius: 4,
                                      border: "1px solid #d1d5db",
                                      fontSize: 11,
                                    }}
                                  >
                                    <option value="">Select group…</option>
                                    {personOnsiteGroups.map(g => (
                                      <option key={g.id} value={g.id}>
                                        {g.name}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                        Manpower onsite DL
                      </label>
                      <input
                        type="text"
                        value={personOnsiteList.length ? String(personOnsiteList.length) : ""}
                        readOnly
                        style={{
                          width: "100%",
                          padding: "4px 6px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                          backgroundColor: "#f9fafb",
                          color: "#4b5563",
                        }}
                      />
                    </div>
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
          {!petlTabMounted && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              Opening PETL…
            </div>
          )}

          {petlTabMounted && (
            <>
              {/* Pending approvals (PM/owner/admin) */}
          {isPmOrAbove && (
            <div
              style={{
                marginBottom: 12,
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
                  justifyContent: "space-between",
                }}
              >
                <span>Pending PETL % approvals</span>
                <button
                  type="button"
                  onClick={() => {
                    petlTransitionOverlayLabelRef.current = "Refreshing approvals…";
                    busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);
                    startPetlTransition(() => setPendingPetlReloadTick(t => t + 1));
                  }}
                  disabled={pendingPetlLoading}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    cursor: pendingPetlLoading ? "default" : "pointer",
                    fontSize: 12,
                    color: "#111827",
                  }}
                >
                  {pendingPetlLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              <div style={{ padding: 10, fontSize: 12 }}>
                {pendingPetlMessage && (
                  <div style={{ marginBottom: 6, color: "#4b5563" }}>{pendingPetlMessage}</div>
                )}

                {pendingPetlLoading && (
                  <div style={{ color: "#6b7280" }}>Loading pending approvals…</div>
                )}

                {pendingPetlError && !pendingPetlLoading && (
                  <div style={{ color: "#b91c1c" }}>{pendingPetlError}</div>
                )}

                {!pendingPetlLoading &&
                  !pendingPetlError &&
                  pendingPetlSessions &&
                  pendingPetlSessions.length === 0 && (
                    <div style={{ color: "#6b7280" }}>No pending percent updates.</div>
                  )}

                {!pendingPetlLoading &&
                  !pendingPetlError &&
                  pendingPetlSessions &&
                  pendingPetlSessions.length > 0 && (
                    <div style={{ maxHeight: 220, overflow: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f9fafb" }}>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Created</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>By</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Updates</th>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Preview</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingPetlSessions.map((s: any) => {
                            const created = s.createdAt ? new Date(s.createdAt).toLocaleString() : "—";
                            const createdBy = s.createdBy?.email ?? "(unknown)";
                            const updates = Array.isArray(s.updates) ? s.updates : [];
                            const preview = updates
                              .slice(0, 3)
                              .map((u: any) => `${u.oldPercent ?? 0}→${u.newPercent ?? 0}`)
                              .join(", ");

                            return (
                              <tr key={s.id}>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {created}
                                </td>
                                <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                  {createdBy}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    textAlign: "right",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {updates.length}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    color: "#4b5563",
                                    fontSize: 11,
                                  }}
                                >
                                  {preview}
                                  {updates.length > 3 ? " …" : ""}
                                </td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    borderTop: "1px solid #e5e7eb",
                                    textAlign: "right",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const token = localStorage.getItem("accessToken");
                                      if (!token) {
                                        setPendingPetlMessage("Missing access token.");
                                        return;
                                      }
                                      setPendingPetlMessage(null);

                                      await busyOverlay.run("Approving…", async () => {
                                        try {
                                          const res = await fetch(
                                            `${API_BASE}/projects/${id}/petl/percent-updates/${s.id}/approve`,
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type": "application/json",
                                                Authorization: `Bearer ${token}`,
                                              },
                                              body: JSON.stringify({ reviewNote: null }),
                                            },
                                          );
                                          if (!res.ok) {
                                            const text = await res.text().catch(() => "");
                                            setPendingPetlMessage(
                                              `Approve failed (${res.status}) ${text}`,
                                            );
                                            return;
                                          }
                                          setPendingPetlMessage("Approved.");
                                          setPendingPetlReloadTick(t => t + 1);
                                          setPetlReloadTick(t => t + 1);
                                        } catch (err: any) {
                                          setPendingPetlMessage(err?.message ?? "Approve failed.");
                                        }
                                      });
                                    }}
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      border: "1px solid #16a34a",
                                      backgroundColor: "#dcfce7",
                                      color: "#166534",
                                      fontSize: 11,
                                      cursor: "pointer",
                                      marginRight: 6,
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const token = localStorage.getItem("accessToken");
                                      if (!token) {
                                        setPendingPetlMessage("Missing access token.");
                                        return;
                                      }
                                      setPendingPetlMessage(null);

                                      await busyOverlay.run("Rejecting…", async () => {
                                        try {
                                          const res = await fetch(
                                            `${API_BASE}/projects/${id}/petl/percent-updates/${s.id}/reject`,
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type": "application/json",
                                                Authorization: `Bearer ${token}`,
                                              },
                                              body: JSON.stringify({ reviewNote: null }),
                                            },
                                          );
                                          if (!res.ok) {
                                            const text = await res.text().catch(() => "");
                                            setPendingPetlMessage(
                                              `Reject failed (${res.status}) ${text}`,
                                            );
                                            return;
                                          }
                                          setPendingPetlMessage("Rejected.");
                                          setPendingPetlReloadTick(t => t + 1);
                                        } catch (err: any) {
                                          setPendingPetlMessage(err?.message ?? "Reject failed.");
                                        }
                                      });
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
          )}

          {/* Project hierarchy: Job (property) → Buildings / Structures → Units → Rooms */}
          {hierarchy && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => {
                  petlTransitionOverlayLabelRef.current = "Updating layout view…";
                  busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);
                  startPetlTransition(() => setStructureOpen(o => !o));
                }}
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

      {/* PETL view toggle */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#4b5563" }}>View:</div>
          <div
            style={{
              display: "flex",
              border: "1px solid #d1d5db",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setPetlDisplayModePersisted("PROJECT_GROUPING")}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background:
                  petlDisplayMode === "PROJECT_GROUPING" ? "#0f172a" : "#ffffff",
                color:
                  petlDisplayMode === "PROJECT_GROUPING" ? "#f9fafb" : "#111827",
              }}
            >
              Project grouping
            </button>
            <button
              type="button"
              onClick={() => setPetlDisplayModePersisted("LINE_SEQUENCE")}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background:
                  petlDisplayMode === "LINE_SEQUENCE" ? "#0f172a" : "#ffffff",
                color:
                  petlDisplayMode === "LINE_SEQUENCE" ? "#f9fafb" : "#111827",
                borderLeft: "1px solid #d1d5db",
              }}
            >
              Line sequence
            </button>
            <button
              type="button"
              onClick={() => setPetlDisplayModePersisted("RECONCILIATION_ONLY")}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background:
                  petlDisplayMode === "RECONCILIATION_ONLY" ? "#0f172a" : "#ffffff",
                color:
                  petlDisplayMode === "RECONCILIATION_ONLY" ? "#f9fafb" : "#111827",
                borderLeft: "1px solid #d1d5db",
              }}
            >
              Recon only
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#2563eb",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 420,
            }}
          >
            Apply % complete to filtered items
          </div>

          <button
            type="button"
            onClick={() => setImportsModalOpen(true)}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Reconcile Imports
          </button>
        </div>
      </div>

      {/* Progress controls: filters + operation */}
      {petlItems.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 12,
            alignItems: "flex-end",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Room</div>
            <CheckboxMultiSelect
              placeholder="All rooms"
              options={roomOptions}
              selectedValues={roomParticleIdFilters}
              onChangeSelectedValues={setRoomParticleIdFilters}
              minWidth={180}
              minListHeight={220}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Cat</div>
            <CheckboxMultiSelect
              placeholder="All"
              options={categoryOptions.map((cat) => ({ value: cat, label: cat }))}
              selectedValues={categoryCodeFilters}
              onChangeSelectedValues={setCategoryCodeFilters}
              minWidth={110}
              minListHeight={220}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 2 }}>Sel</div>
            <CheckboxMultiSelect
              placeholder="All"
              options={selectionOptions.map((sel) => ({ value: sel, label: sel }))}
              selectedValues={selectionCodeFilters}
              onChangeSelectedValues={setSelectionCodeFilters}
              minWidth={110}
              minListHeight={220}
            />
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

              // Pending approvals currently track percent changes only.
              // Avoid letting non-PMs toggle ACV-only so we don't create a pending session
              // that cannot accurately represent the requested change.
              if (isAcv && !isPmOrAbove) {
                setBulkMessage("ACV only can only be applied by a PM/Owner/Admin.");
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

              if (roomParticleIdFilters.length) {
                filters.roomParticleIds = roomParticleIdFilters;
              }
              if (categoryCodeFilters.length) {
                filters.categoryCodes = categoryCodeFilters;
              }
              if (selectionCodeFilters.length) {
                filters.selectionCodes = selectionCodeFilters;
              }

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

                if (json?.status === "pending") {
                  setBulkMessage(
                    `Submitted ${json?.pendingCount ?? 0} change(s) for approval (session ${json?.sessionId ?? "—"}).`,
                  );
                  setPendingPetlReloadTick(t => t + 1);
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
                  const groupsRes = await fetch(`${API_BASE}/projects/${id}/petl-groups`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
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
              gap: 6,
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#2563eb",
                whiteSpace: "nowrap",
              }}
            >
              Operation
            </span>
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

          {bulkMessage && (
            <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6, width: "100%" }}>
              {bulkMessage}
            </div>
          )}
        </div>
      )}

      {/* Imports modal (rarely used; keep off initial render) */}
      {importsModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            backgroundColor: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "8vh 12px",
          }}
          onClick={closeImportsModal}
        >
          <div
            style={{
              width: 960,
              maxWidth: "96vw",
              backgroundColor: "#ffffff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
              overflow: "hidden",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid #e5e7eb",
                backgroundColor: "#f8fafc",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Reconcile Imports</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Percent complete import and reconcile notes import.
                </div>
              </div>
              <button
                type="button"
                onClick={closeImportsModal}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 6,
                }}
                aria-label="Close imports modal"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12 }}>
              {petlItems.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4b5563" }}>
                  Imports are available after estimate items have been loaded for this project.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      flex: "1 1 420px",
                      minWidth: 360,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Import % Complete (CSV)
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                      Uses line item number (#) and % Complete to update PETL line percentages.
                    </div>
                    <form
                      onSubmit={handlePetlPercentImport}
                      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
                    >
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={e => setPetlPercentFile(e.target.files?.[0] ?? null)}
                        style={{ fontSize: 12 }}
                      />

                      <button
                        type="button"
                        onClick={downloadPetlPercentCsv}
                        disabled={petlItems.length === 0}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 4,
                          border: "1px solid #94a3b8",
                          backgroundColor: petlItems.length === 0 ? "#e5e7eb" : "#ffffff",
                          color: petlItems.length === 0 ? "#4b5563" : "#0f172a",
                          cursor: petlItems.length === 0 ? "default" : "pointer",
                          fontSize: 12,
                        }}
                      >
                        Download CSV
                      </button>

                      <button
                        type="submit"
                        disabled={petlPercentImporting || !petlPercentFile}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 4,
                          border: "1px solid #0f172a",
                          backgroundColor:
                            petlPercentImporting || !petlPercentFile ? "#e5e7eb" : "#0f172a",
                          color:
                            petlPercentImporting || !petlPercentFile ? "#4b5563" : "#f9fafb",
                          cursor:
                            petlPercentImporting || !petlPercentFile ? "default" : "pointer",
                          fontSize: 12,
                        }}
                      >
                        {petlPercentImporting ? "Uploading…" : "Queue percent import"}
                      </button>
                    </form>
                    {petlPercentImportError && (
                      <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
                        {petlPercentImportError}
                      </div>
                    )}
                    {(petlPercentJob || petlPercentJobError) && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 8,
                          borderRadius: 6,
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Import job status</div>
                        {petlPercentJobError && (
                          <div style={{ color: "#b91c1c", marginBottom: 4 }}>
                            {petlPercentJobError}
                          </div>
                        )}
                        {petlPercentJob && (
                          <>
                            <div>
                              <strong>Status:</strong> {petlPercentJob.status ?? "UNKNOWN"}
                            </div>
                            <div>
                              <strong>Progress:</strong>{" "}
                              {typeof petlPercentJob.progress === "number"
                                ? `${petlPercentJob.progress}%`
                                : "—"}
                            </div>
                            {petlPercentJob.message && (
                              <div>
                                <strong>Message:</strong> {petlPercentJob.message}
                              </div>
                            )}

                            {petlPercentJob.status === "FAILED" && petlPercentJob.errorJson && (
                              <div style={{ marginTop: 6 }}>
                                <strong>Error:</strong>
                                <pre
                                  style={{
                                    marginTop: 4,
                                    padding: 6,
                                    background: "#fef2f2",
                                    borderRadius: 4,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {JSON.stringify(petlPercentJob.errorJson, null, 2)}
                                </pre>
                              </div>
                            )}

                            {petlPercentJob.resultJson && (
                              <div style={{ marginTop: 6 }}>
                                <strong>Result:</strong>
                                <pre
                                  style={{
                                    marginTop: 4,
                                    padding: 6,
                                    background: "#f8fafc",
                                    borderRadius: 4,
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {JSON.stringify(petlPercentJob.resultJson, null, 2)}
                                </pre>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      flex: "1 1 420px",
                      minWidth: 360,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Import Reconcile Notes (CSV)
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                      Attaches notes to PETL line items by line number (#).
                    </div>
                    <form
                      onSubmit={handlePetlReconcileNotesImport}
                      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
                    >
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={e => {
                          setPetlReconcileNotesImportResult(null);
                          setPetlReconcileNotesFile(e.target.files?.[0] ?? null);
                        }}
                        style={{ fontSize: 12 }}
                      />
                      <button
                        type="submit"
                        disabled={petlReconcileNotesImporting || !petlReconcileNotesFile}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 4,
                          border: "1px solid #0f172a",
                          backgroundColor:
                            petlReconcileNotesImporting || !petlReconcileNotesFile
                              ? "#e5e7eb"
                              : "#0f172a",
                          color:
                            petlReconcileNotesImporting || !petlReconcileNotesFile
                              ? "#4b5563"
                              : "#f9fafb",
                          cursor:
                            petlReconcileNotesImporting || !petlReconcileNotesFile
                              ? "default"
                              : "pointer",
                          fontSize: 12,
                        }}
                      >
                        {petlReconcileNotesImporting ? "Importing…" : "Import notes"}
                      </button>
                    </form>
                    {petlReconcileNotesImportError && (
                      <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
                        {petlReconcileNotesImportError}
                      </div>
                    )}
                    {petlReconcileNotesImportResult && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 8,
                          borderRadius: 6,
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Import result</div>
                        <pre
                          style={{
                            marginTop: 4,
                            padding: 6,
                            background: "#f8fafc",
                            borderRadius: 4,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {JSON.stringify(petlReconcileNotesImportResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project grouping: Units → Rooms (expandable) */}
      {petlDisplayMode === "PROJECT_GROUPING" && !groupLoading && unitGroups.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Units</h2>
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
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Unit / Room</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Tasks</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Completed</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>% Complete</th>
                </tr>
              </thead>
              <tbody>
                {unitGroups
                  .map((u) => {
                    const rooms =
                      roomParticleIdFilters.length > 0
                        ? (u.rooms ?? []).filter(
                            (r) => r.particleId && roomParticleIdFilterSet.has(r.particleId),
                          )
                        : (u.rooms ?? []);

                    if (rooms.length === 0) return null;

                    const tasks = rooms.reduce((sum, r) => sum + (r.itemsCount ?? 0), 0);
                    const total = rooms.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
                    const completed = rooms.reduce((sum, r) => sum + (r.completedAmount ?? 0), 0);
                    const pct = total > 0 ? (completed / total) * 100 : 0;

                    const unitKey = u.unitId ?? "__no_unit__";
                    const isUnitExpanded = expandedUnits.has(unitKey);

                    return (
                      <Fragment key={unitKey}>
                        <tr>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderTop: "1px solid #e5e7eb",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                            onClick={() => toggleUnitExpanded(u.unitId)}
                          >
                            {isUnitExpanded ? "▾ " : "▸ "}
                            {u.unitLabel || "(No unit)"}
                            <span style={{ marginLeft: 8, fontWeight: 400, color: "#6b7280" }}>
                              ({rooms.length} room{rooms.length === 1 ? "" : "s"})
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                              fontWeight: 600,
                            }}
                          >
                            {tasks}
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                              fontWeight: 600,
                            }}
                          >
                            {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                              fontWeight: 600,
                            }}
                          >
                            {completed.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td
                            style={{
                              padding: "6px 12px",
                              borderTop: "1px solid #e5e7eb",
                              textAlign: "right",
                              fontWeight: 600,
                            }}
                          >
                            {pct.toFixed(2)}%
                          </td>
                        </tr>

                        {isUnitExpanded &&
                          rooms.map((g) => {
                            const itemsForRoom = filteredItemsForRoom(g.particleId);
                            const isExpanded = g.particleId ? expandedRooms.has(g.particleId) : false;

                            return (
                              <Fragment key={g.particleId ?? String(g.id)}>
                                <tr>
                                  <td
                                    style={{
                                      padding: "6px 12px",
                                      paddingLeft: 28,
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
                                          onClick={(e) => {
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
                                          onClick={(e) => {
                                            e.stopPropagation();

                                            const breadcrumb =
                                              (g.particleId &&
                                                roomBreadcrumbByParticleId.get(g.particleId)) ||
                                              g.roomName;

                                            setPudlContext({
                                              open: true,
                                              buildingId: null,
                                              unitId: u.unitId ?? null,
                                              roomParticleId: g.particleId,
                                              sowItemId: null,
                                              breadcrumb,
                                            });

                                            setNewDailyLog((prev) => ({
                                              ...prev,
                                              roomParticleId: g.particleId,
                                            }));

                                            setTab("DAILY_LOGS");
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

                                {g.particleId && isExpanded && itemsForRoom.length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={5}
                                      style={{
                                        padding: "0 12px 8px 12px",
                                        borderTop: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                      }}
                                    >
                                      <table
                                        style={{
                                          width: "100%",
                                          borderCollapse: "collapse",
                                          marginTop: 6,
                                          fontSize: 11,
                                        }}
                                      >
                                        <thead>
                                          <tr style={{ backgroundColor: "#f8fafc" }}>
                                            <th style={{ textAlign: "left", padding: "4px 8px" }}>Line</th>
                                            <th style={{ textAlign: "left", padding: "4px 8px" }}>Task</th>
                                            <th style={{ textAlign: "right", padding: "4px 8px" }}>Qty</th>
                                            <th style={{ textAlign: "right", padding: "4px 8px" }}>Unit</th>
                                            <th style={{ textAlign: "right", padding: "4px 8px" }}>Total</th>
                                            <th style={{ textAlign: "right", padding: "4px 8px" }}>RCV</th>
                                            <th style={{ textAlign: "right", padding: "4px 8px" }}>%</th>
                                            <th style={{ textAlign: "left", padding: "4px 8px" }}>Cat</th>
                                            <th style={{ textAlign: "left", padding: "4px 8px" }}>Sel</th>
                                            <th style={{ textAlign: "left", padding: "4px 8px" }}>PUDL</th>
                                            <th style={{ textAlign: "left", padding: "4px 8px" }}>Recon</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {itemsForRoom
                                            .filter((it: PetlItem) => matchesFilters(it))
                                            .map((item: PetlItem) => {
                                              const flagged = isPetlReconFlagged(item.id);
                                              const hasRecon = hasReconciliationActivity(item.id);
                                              const bg = flagged
                                                ? "#fef3c7"
                                                : hasRecon
                                                  ? "#e0f2fe"
                                                  : "transparent";

                                              return (
                                                <tr key={item.id} style={{ backgroundColor: bg }}>
                                                  <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                                    {item.lineNo}
                                                  </td>
                                                  <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
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
                                                    {item.unit ?? ""}
                                                  </td>
                                                  <td
                                                    style={{
                                                      padding: "3px 8px",
                                                      borderTop: "1px solid #e5e7eb",
                                                      textAlign: "right",
                                                    }}
                                                  >
                                                    {(item.itemAmount ?? 0).toLocaleString(undefined, {
                                                      maximumFractionDigits: 2,
                                                    })}
                                                  </td>
                                                  <td
                                                    style={{
                                                      padding: "3px 8px",
                                                      borderTop: "1px solid #e5e7eb",
                                                      textAlign: "right",
                                                    }}
                                                  >
                                                    {(item.rcvAmount ?? 0).toLocaleString(undefined, {
                                                      maximumFractionDigits: 2,
                                                    })}
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
                                                          setPetlItems((prev) =>
                                                            prev.map((it) =>
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

                                                          try {
                                                            setGroupLoading(true);
                                                            const groupsRes = await fetch(
                                                              `${API_BASE}/projects/${id}/petl-groups`,
                                                              {
                                                                headers: {
                                                                  Authorization: `Bearer ${token}`,
                                                                },
                                                              },
                                                            );
                                                            if (groupsRes.ok) {
                                                              const json: any = await groupsRes.json();
                                                              setGroups(Array.isArray(json.groups) ? json.groups : []);
                                                              setUnitGroups(
                                                                Array.isArray(json.unitGroups) ? json.unitGroups : [],
                                                              );
                                                            }
                                                          } catch {
                                                            // non-fatal
                                                          } finally {
                                                            setGroupLoading(false);
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
                                                  <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                                    {item.categoryCode ?? ""}
                                                  </td>
                                                  <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                                    {item.selectionCode ?? ""}
                                                  </td>
                                                  <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        const sowLabel = item.description || `Line ${item.lineNo}`;
                                                        const parts: string[] = [];
                                                        parts.push(g.roomName);
                                                        parts.push(`SOW: ${sowLabel}`);
                                                        const breadcrumb = parts.filter(Boolean).join(" · ");

                                                        setPudlContext({
                                                          open: true,
                                                          buildingId: null,
                                                          unitId: u.unitId ?? null,
                                                          roomParticleId: g.particleId ?? null,
                                                          sowItemId: item.id,
                                                          breadcrumb,
                                                        });

                                                        setNewDailyLog((prev) => ({
                                                          ...prev,
                                                          roomParticleId: g.particleId ?? prev.roomParticleId,
                                                          sowItemId: item.id,
                                                        }));

                                                        setTab("DAILY_LOGS");
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
                                                  <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          const flagged2 = isPetlReconFlagged(item.id);
                                                          petlTransitionOverlayLabelRef.current = flagged2
                                                            ? "Removing flag…"
                                                            : "Flagging for review…";
                                                          busyOverlay.setMessage(
                                                            petlTransitionOverlayLabelRef.current,
                                                          );
                                                          startPetlTransition(() => togglePetlReconFlag(item.id));
                                                        }}
                                                        style={{
                                                          padding: "2px 6px",
                                                          borderRadius: 999,
                                                          border: flagged
                                                            ? "1px solid #b45309"
                                                            : "1px solid #d1d5db",
                                                          background: flagged ? "#fffbeb" : "#ffffff",
                                                          fontSize: 11,
                                                          cursor: "pointer",
                                                          color: flagged ? "#92400e" : "#374151",
                                                        }}
                                                      >
                                                        {flagged ? "Needs review" : "Flag"}
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          void openPetlReconciliation(item.id);
                                                        }}
                                                        style={{
                                                          padding: "2px 6px",
                                                          borderRadius: 999,
                                                          border: hasRecon
                                                            ? "1px solid #0284c7"
                                                            : "1px solid #d1d5db",
                                                          background: hasRecon ? "#e0f2fe" : "#ffffff",
                                                          fontSize: 11,
                                                          cursor: "pointer",
                                                          color: hasRecon ? "#075985" : "#374151",
                                                        }}
                                                      >
                                                        Recon
                                                      </button>
                                                    </div>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                        </tbody>
                                      </table>
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
        </div>
      )}

      {/* Fallback: room-only grouping (older API) */}
      {petlDisplayMode === "PROJECT_GROUPING" && !groupLoading && unitGroups.length === 0 && groups.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Rooms / Zones</h2>
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
                {(roomParticleIdFilters.length
                  ? groups.filter((g) => g.particleId && roomParticleIdFilterSet.has(g.particleId))
                  : groups
                ).map((g) => {
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
                        </td>
                        <td style={{ padding: "6px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          {g.itemsCount}
                        </td>
                        <td style={{ padding: "6px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          {g.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "6px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          {g.completedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "6px 12px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                          {g.percentComplete.toFixed(2)}%
                        </td>
                      </tr>

                      {g.particleId && isExpanded && itemsForRoom.length > 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            style={{
                              padding: "0 12px 8px 12px",
                              borderTop: "1px solid #e5e7eb",
                              background: "#ffffff",
                            }}
                          >
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                marginTop: 6,
                                fontSize: 11,
                              }}
                            >
                              <thead>
                                <tr style={{ backgroundColor: "#f8fafc" }}>
                                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Line</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Task</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Qty</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Unit</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Total</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px" }}>RCV</th>
                                  <th style={{ textAlign: "right", padding: "4px 8px" }}>%</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Cat</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Sel</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itemsForRoom
                                  .filter((it: PetlItem) => matchesFilters(it))
                                  .map((item: PetlItem) => (
                                    <tr key={item.id}>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        {item.lineNo}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        {item.description}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                                        {item.qty ?? ""}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                                        {item.unit ?? ""}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                                        {(item.itemAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                                        {(item.rcvAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
                                        {item.percentComplete}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        {item.categoryCode ?? ""}
                                      </td>
                                      <td style={{ padding: "3px 8px", borderTop: "1px solid #e5e7eb" }}>
                                        {item.selectionCode ?? ""}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
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

      {petlLineSequenceTable}

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
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>Code</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>Description</th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>Qty</th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>Unit</th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roomComponentsPanel.components.map((c) => (
                        <tr key={c.code}>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                            }}
                          >
                            {c.code}
                          </td>
                          <td
                            style={{
                              padding: "4px 6px",
                              borderTop: "1px solid #e5e7eb",
                            }}
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

      {/* PETL reconciliation side drawer */}
      {petlReconPanel.open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 45,
            display: "flex",
            justifyContent: "flex-end",
            backgroundColor: "rgba(15,23,42,0.35)",
          }}
          onClick={() =>
            setPetlReconPanel(prev => ({
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
              width: 520,
              maxWidth: "92vw",
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
                PETL Reconciliation
                <div style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>
                  {petlReconPanel.data?.sowItem?.description || ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPetlReconPanel(prev => ({
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
                aria-label="Close reconciliation panel"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12, fontSize: 12, flex: 1, overflow: "auto" }}>
              {petlReconPanel.loading && (
                <div style={{ color: "#6b7280" }}>Loading reconciliation…</div>
              )}

              {!petlReconPanel.loading && petlReconPanel.error && (
                <div style={{ color: "#b91c1c" }}>{petlReconPanel.error}</div>
              )}

              {!petlReconPanel.loading && !petlReconPanel.error && petlReconPanel.data && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      RCV breakdown (baseline)
                    </div>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: 10,
                        background: "#f9fafb",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <div>Qty: {petlReconPanel.data.rcvBreakdown?.qty ?? ""}</div>
                        <div>Unit cost: {petlReconPanel.data.rcvBreakdown?.unitCost ?? ""}</div>
                        <div>
                          Item: {petlReconPanel.data.rcvBreakdown?.itemAmount ?? 0}
                        </div>
                        <div>
                          Tax: {petlReconPanel.data.rcvBreakdown?.salesTaxAmount ?? 0}
                        </div>
                        <div>O&P/Other: {petlReconPanel.data.rcvBreakdown?.opAmount ?? 0}</div>
                        <div style={{ fontWeight: 600 }}>
                          RCV: {petlReconPanel.data.rcvBreakdown?.rcvAmount ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Note</div>
                    <textarea
                      value={reconNote}
                      onChange={e => setReconNote(e.target.value)}
                      placeholder="Add a journal note for this reconciliation action..."
                      style={{
                        width: "100%",
                        minHeight: 70,
                        padding: 8,
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Tag</div>
                    <select
                      value={reconEntryTag}
                      onChange={e => setReconEntryTag(e.target.value as ReconEntryTag)}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        fontSize: 12,
                        width: "100%",
                      }}
                    >
                      <option value="">—</option>
                      <option value="SUPPLEMENT">Supplement</option>
                      <option value="CHANGE_ORDER">Change order</option>
                      <option value="OTHER">Other</option>
                      <option value="WARRANTY">Warranty</option>
                    </select>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                      Applied to new entries created below (you can edit tags later).
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Create credit</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                      {(
                        [
                          { key: "itemAmount", label: "Item" },
                          { key: "salesTaxAmount", label: "Tax" },
                          { key: "opAmount", label: "O&P/Other" },
                        ] as const
                      ).map(opt => (
                        <label key={opt.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={reconCreditComponents[opt.key]}
                            onChange={e =>
                              setReconCreditComponents(prev => ({
                                ...prev,
                                [opt.key]: e.target.checked,
                              }))
                            }
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={submitReconCredit}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #0f172a",
                        background: "#0f172a",
                        color: "#f9fafb",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Create credit
                    </button>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Placeholder / note-only</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select
                        value={reconPlaceholderKind}
                        onChange={e => setReconPlaceholderKind(e.target.value)}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          fontSize: 12,
                        }}
                      >
                        <option value="NOTE_ONLY">Note only</option>
                        <option value="CHANGE_ORDER_CLIENT_PAY">Change order (client pay)</option>
                        <option value="REIMBURSE_OWNER">Reimburse owner</option>
                      </select>
                      <button
                        type="button"
                        onClick={submitReconPlaceholder}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Add placeholder
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Add from Cost Book</div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => {
                          petlTransitionOverlayLabelRef.current = "Opening cost book…";
                          busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);
                          startPetlTransition(() => setCostBookModalOpen(true));
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #2563eb",
                          background: "#eff6ff",
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#1d4ed8",
                        }}
                      >
                        Open Cost Book
                      </button>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        Pre-filtered to current CAT; current CAT/SEL line is highlighted.
                      </div>
                    </div>
                    {costBookModalOpen && (
                      <CostBookPickerModal
                        title="Cost Book"
                        subtitle={(() => {
                          const cat = String(petlReconPanel.data?.sowItem?.categoryCode ?? "").trim();
                          const sel = String(petlReconPanel.data?.sowItem?.selectionCode ?? "").trim();
                          const desc = String(petlReconPanel.data?.sowItem?.description ?? "").trim();
                          const head = cat || sel ? `Baseline: ${cat}${sel ? `/${sel}` : ""}` : "Baseline";
                          return desc ? `${head} — ${desc}` : head;
                        })()}
                        initialCats={(() => {
                          const cat = String(petlReconPanel.data?.sowItem?.categoryCode ?? "").trim();
                          return cat ? [cat] : [];
                        })()}
                        defaultQty={(() => {
                          const q = petlReconPanel.data?.rcvBreakdown?.qty;
                          return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 1;
                        })()}
                        confirmLabel={petlCostBookPickerBusy ? "Adding…" : "Add selected"}
                        confirmDisabled={petlCostBookPickerBusy}
                        onConfirm={async (selection) => {
                          if (petlCostBookPickerBusy) return;
                          if (selection.length === 0) {
                            alert("Select a cost book line item first.");
                            return;
                          }
                          if (selection.length > 1) {
                            alert("For PETL reconciliation, please select exactly one line item.");
                            return;
                          }

                          const first = selection[0];
                          setPetlCostBookPickerBusy(true);
                          try {
                            const ok = await submitAddFromCostBook(first.item.id, first.qty);
                            if (ok) {
                              petlTransitionOverlayLabelRef.current = "Closing cost book…";
                              busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);
                              startPetlTransition(() => setCostBookModalOpen(false));
                            }
                          } finally {
                            setPetlCostBookPickerBusy(false);
                          }
                        }}
                        onClose={() => {
                          if (petlCostBookPickerBusy) return;
                          petlTransitionOverlayLabelRef.current = "Closing cost book…";
                          busyOverlay.setMessage(petlTransitionOverlayLabelRef.current);
                          startPetlTransition(() => setCostBookModalOpen(false));
                        }}
                      />
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Reconciliation entries</div>
                    {(petlReconPanel.data.reconciliationCase?.entries || []).length === 0 ? (
                      <div style={{ color: "#6b7280" }}>No entries yet.</div>
                    ) : (
                      <div
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#f9fafb" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px", width: 70 }}>Line</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Kind</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Tag</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>RCV</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>%</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Note</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}>Edit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const entries = (petlReconPanel.data.reconciliationCase?.entries || []) as any[];
                              const baseLineNoRaw = petlReconPanel.data?.sowItem?.lineNo;
                              const baseLineNo =
                                typeof baseLineNoRaw === "number" && Number.isFinite(baseLineNoRaw)
                                  ? baseLineNoRaw
                                  : null;

                              // Only number “real” financial entries; note-only entries don’t shift the decimal.
                              const numbered = entries.filter((x) => String(x.kind) !== "NOTE_ONLY");
                              const seqById = new Map<string, number>();
                              numbered.forEach((x, idx) => {
                                if (x?.id) seqById.set(String(x.id), idx + 1);
                              });

                              return entries.map((e: any) => {
                                const pct = e.isPercentCompleteLocked ? 0 : (e.percentComplete ?? 0);
                                const seq = seqById.get(String(e.id));
                                const lineLabel =
                                  baseLineNo != null && seq != null ? `${baseLineNo}.${seq}` : "—";

                                const tagRaw = String(e?.tag ?? "").trim();
                                const tagLabel =
                                  tagRaw === "SUPPLEMENT"
                                    ? "Supplement"
                                    : tagRaw === "CHANGE_ORDER"
                                      ? "Change order"
                                      : tagRaw === "OTHER"
                                        ? "Other"
                                        : tagRaw === "WARRANTY"
                                          ? "Warranty"
                                          : "";

                                return (
                                  <tr key={e.id}>
                                    <td
                                      style={{
                                        padding: "6px 8px",
                                        borderTop: "1px solid #e5e7eb",
                                        fontFamily:
                                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                                        color: "#4b5563",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {lineLabel}
                                    </td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                      {e.kind}
                                    </td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                      {tagLabel ? (
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            padding: "2px 8px",
                                            borderRadius: 999,
                                            border: "1px solid #d1d5db",
                                            background: "#ffffff",
                                            fontSize: 11,
                                            color: "#374151",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {tagLabel}
                                        </span>
                                      ) : (
                                        <span style={{ color: "#9ca3af" }}>—</span>
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 8px",
                                        borderTop: "1px solid #e5e7eb",
                                        textAlign: "right",
                                      }}
                                    >
                                      {(e.rcvAmount ?? 0).toLocaleString(undefined, {
                                        maximumFractionDigits: 2,
                                      })}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 8px",
                                        borderTop: "1px solid #e5e7eb",
                                        textAlign: "right",
                                      }}
                                    >
                                      {e.isPercentCompleteLocked ? (
                                        "—"
                                      ) : (
                                        <select
                                          value={String(pct)}
                                          onChange={(ev) => {
                                            const next = Number(ev.target.value);
                                            if (Number.isNaN(next)) return;
                                            void submitReconEntryPercent(e.id, next);
                                          }}
                                          style={{
                                            width: 70,
                                            padding: "2px 4px",
                                            borderRadius: 6,
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
                                        </select>
                                      )}
                                    </td>
                                    <td style={{ padding: "6px 8px", borderTop: "1px solid #e5e7eb" }}>
                                      {e.note ?? ""}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 8px",
                                        borderTop: "1px solid #e5e7eb",
                                        textAlign: "right",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => openReconEntryEdit(e)}
                                        style={{
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          border: "1px solid #d1d5db",
                                          background: "#ffffff",
                                          cursor: "pointer",
                                          fontSize: 12,
                                        }}
                                      >
                                        Edit
                                      </button>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {reconEntryEdit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
          onClick={closeReconEntryEdit}
        >
          <div
            style={{
              width: 640,
              maxWidth: "96vw",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
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
                background: "#f3f4f6",
              }}
            >
              <div>
                Edit reconciliation entry
                <div style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>
                  {reconEntryEdit.entry?.kind ?? ""}
                </div>
              </div>
              <button
                type="button"
                onClick={closeReconEntryEdit}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close reconciliation entry editor"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tag</div>
                <select
                  value={reconEntryEdit.draft.tag}
                  onChange={(e) => {
                    const v = e.target.value as ReconEntryTag;
                    setReconEntryEdit((prev) =>
                      prev ? { ...prev, draft: { ...prev.draft, tag: v } } : prev,
                    );
                  }}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                    width: "100%",
                  }}
                >
                  <option value="">—</option>
                  <option value="SUPPLEMENT">Supplement</option>
                  <option value="CHANGE_ORDER">Change order</option>
                  <option value="OTHER">Other</option>
                  <option value="WARRANTY">Warranty</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>RCV</div>
                <input
                  value={reconEntryEdit.draft.rcvAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReconEntryEdit((prev) =>
                      prev ? { ...prev, draft: { ...prev.draft, rcvAmount: v } } : prev,
                    );
                  }}
                  placeholder="(blank for note-only)"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                    width: "100%",
                  }}
                />
                <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                  For CREDIT entries, we’ll keep this negative; for ADD entries, we’ll keep it positive.
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description</div>
                <input
                  value={reconEntryEdit.draft.description}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReconEntryEdit((prev) =>
                      prev ? { ...prev, draft: { ...prev.draft, description: v } } : prev,
                    );
                  }}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                    width: "100%",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Note</div>
                <textarea
                  value={reconEntryEdit.draft.note}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReconEntryEdit((prev) =>
                      prev ? { ...prev, draft: { ...prev.draft, note: v } } : prev,
                    );
                  }}
                  style={{
                    width: "100%",
                    minHeight: 90,
                    padding: 8,
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </div>

              {reconEntryEdit.error && (
                <div style={{ fontSize: 12, color: "#b91c1c" }}>{reconEntryEdit.error}</div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeReconEntryEdit}
                  disabled={reconEntryEdit.saving}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#ffffff",
                    cursor: reconEntryEdit.saving ? "default" : "pointer",
                    fontSize: 12,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveReconEntryEdit}
                  disabled={reconEntryEdit.saving}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #0f172a",
                    background: reconEntryEdit.saving ? "#e5e7eb" : "#0f172a",
                    color: reconEntryEdit.saving ? "#4b5563" : "#f9fafb",
                    cursor: reconEntryEdit.saving ? "default" : "pointer",
                    fontSize: 12,
                  }}
                >
                  {reconEntryEdit.saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

            </>
          )}

        </div>
      )}

      {/* PETL Diagnostics modal (opened from Edit Project) */}
      {petlDiagnosticsModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
          onClick={() => setPetlDiagnosticsModalOpen(false)}
        >
          <div
            style={{
              width: 720,
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
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
                background: "#f3f4f6",
              }}
            >
              <span>PETL Diagnostics{petlLoadError ? " (error)" : ""}</span>
              <button
                type="button"
                onClick={() => setPetlDiagnosticsModalOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close PETL diagnostics"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12 }}>
              <div
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${petlLoadError ? "#b91c1c" : "#e5e7eb"}`,
                  background: petlLoadError ? "#fef2f2" : "#f8fafc",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 600 }}>
                    PETL Diagnostics{petlLoadError ? " (error)" : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPetlShowDiagnostics((s) => !s)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "#ffffff",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {petlShowDiagnostics ? "Hide" : "Show"}
                  </button>
                </div>

                {(petlShowDiagnostics || petlLoadError) ? (
                  <>
                    <div style={{ marginTop: 6, fontSize: 11, color: "#4b5563" }}>
                      <div>
                        <strong>API_BASE</strong>: {API_BASE}
                      </div>
                      <div>
                        <strong>Project</strong>: {id}
                      </div>
                      <div>
                        <strong>Local</strong>: petlItems={petlItems.length}, recon={petlReconciliationEntries.length}
                      </div>
                    </div>

                    {petlLoadError && (
                      <pre
                        style={{
                          marginTop: 8,
                          marginBottom: 0,
                          whiteSpace: "pre-wrap",
                          color: "#b91c1c",
                          fontSize: 11,
                        }}
                      >
                        {petlLoadError}
                      </pre>
                    )}

                    {petlShowDiagnostics && petlLastLoadDebug && (
                      <pre
                        style={{
                          marginTop: 8,
                          marginBottom: 0,
                          padding: 8,
                          borderRadius: 6,
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          whiteSpace: "pre-wrap",
                          fontSize: 11,
                          maxHeight: 380,
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(petlLastLoadDebug, null, 2)}
                      </pre>
                    )}
                  </>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                    Hidden (click Show)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin PETL Tools modal (opened from Edit Project) */}
      {adminPetlToolsModalOpen && isAdminOrAbove && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
          onClick={() => setAdminPetlToolsModalOpen(false)}
        >
          <div
            style={{
              width: 720,
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
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
                background: "#f3f4f6",
              }}
            >
              <span>Admin PETL Tools</span>
              <button
                type="button"
                onClick={() => setAdminPetlToolsModalOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-label="Close Admin PETL tools"
              >
                ×
              </button>
            </div>

            <div style={{ padding: 12 }}>
              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #fecaca",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#ffe4e6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Admin PETL tools</span>
                  <button
                    type="button"
                    disabled={petlDeleteBusy}
                    onClick={deletePetlAndComponents}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #b91c1c",
                      background: petlDeleteBusy ? "#e5e7eb" : "#b91c1c",
                      cursor: petlDeleteBusy ? "default" : "pointer",
                      fontSize: 12,
                      color: petlDeleteBusy ? "#4b5563" : "#ffffff",
                    }}
                  >
                    {petlDeleteBusy ? "Working…" : "Delete PETL + Components"}
                  </button>
                </div>
                <div style={{ padding: 10, fontSize: 12, color: "#7f1d1d" }}>
                  <div style={{ marginBottom: 6 }}>
                    Use this to wipe imported estimate data so you can re-import. This is destructive and
                    cannot be undone.
                  </div>
                  {petlDeleteMessage && (
                    <div style={{ color: petlDeleteMessage.toLowerCase().includes("fail") ? "#b91c1c" : "#7f1d1d" }}>
                      {petlDeleteMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
