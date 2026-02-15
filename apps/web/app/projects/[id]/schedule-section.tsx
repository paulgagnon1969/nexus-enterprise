"use client";

import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  memo,
} from "react";

// Mermaid configuration
const MERMAID_CDN_SRC = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";

const MERMAID_INIT_CONFIG = {
  startOnLoad: false,
  maxTextSize: 2_000_000,
  gantt: {
    topAxis: true,
    weekday: "monday",
  },
};

let mermaidLoadPromise: Promise<NonNullable<Window["mermaid"]>> | null = null;
let mermaidInitialized = false;

async function loadMermaid(): Promise<NonNullable<Window["mermaid"]>> {
  if (typeof window === "undefined") {
    throw new Error("Mermaid can only be loaded in the browser");
  }

  if (window.mermaid) {
    if (!mermaidInitialized) {
      window.mermaid.initialize(MERMAID_INIT_CONFIG);
      mermaidInitialized = true;
    }
    return window.mermaid;
  }

  if (!mermaidLoadPromise) {
    mermaidLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-nexus-mermaid="true"]') as
        | HTMLScriptElement
        | null;

      const onLoaded = () => {
        if (!window.mermaid) {
          reject(new Error("Mermaid script loaded, but window.mermaid is missing"));
          return;
        }
        if (!mermaidInitialized) {
          window.mermaid.initialize(MERMAID_INIT_CONFIG);
          mermaidInitialized = true;
        }
        resolve(window.mermaid);
      };

      if (existing) {
        existing.addEventListener("load", onLoaded);
        existing.addEventListener("error", () => reject(new Error("Failed to load Mermaid")));
        if ((existing as any).readyState === "complete" || (existing as any).readyState === "loaded") {
          onLoaded();
        }
        return;
      }

      const script = document.createElement("script");
      script.src = MERMAID_CDN_SRC;
      script.async = true;
      script.dataset.nexusMermaid = "true";
      script.addEventListener("load", onLoaded);
      script.addEventListener("error", () => reject(new Error("Failed to load Mermaid")));
      document.head.appendChild(script);
    });
  }

  return mermaidLoadPromise;
}

function makeMermaidSafeId(input: string) {
  return input.replace(/[^A-Za-z0-9_]/g, "_");
}

function scheduleExtractGroupCode(label: any): string | null {
  const s = String(label ?? "").trim();
  if (!s) return null;

  const dashMatch = s.match(/^([A-Za-z0-9_]+)\s*[-–—].+$/);
  if (dashMatch) return dashMatch[1];

  const firstToken = s.split(/\s+/)[0] ?? "";
  if (/^[A-Z0-9_]{3,}$/.test(firstToken)) return firstToken;

  return null;
}

// MermaidGantt component (local to schedule section)
const MermaidGantt = memo(function MermaidGantt(props: {
  ganttText: string;
  stickyHeader?: boolean;
  maxHeightPx?: number;
}) {
  const { ganttText, stickyHeader = true, maxHeightPx = 560 } = props;

  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const headerEl = headerRef.current;
      const bodyEl = bodyRef.current;
      if (!headerEl || !bodyEl) return;

      if (!ganttText.trim()) {
        headerEl.innerHTML = "";
        bodyEl.innerHTML = "";
        return;
      }

      const mermaid = await loadMermaid();
      if (cancelled) return;

      const id = `gantt_${makeMermaidSafeId(String(Date.now()))}`;
      const { svg, bindFunctions } = await mermaid.render(id, ganttText);
      if (cancelled) return;

      headerEl.innerHTML = svg;
      bodyEl.innerHTML = svg;

      try {
        if (bindFunctions) {
          bindFunctions(headerEl);
          bindFunctions(bodyEl);
        }
      } catch {
        // ignore
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [ganttText]);

  const headerHeightPx = 64;

  return (
    <div
      style={{
        maxHeight: maxHeightPx,
        overflow: "auto",
        position: "relative",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      }}
    >
      {stickyHeader && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 5,
            height: headerHeightPx,
            overflow: "hidden",
            background: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div ref={headerRef} />
        </div>
      )}

      <div
        style={{
          marginTop: stickyHeader ? -headerHeightPx : 0,
        }}
      >
        <div ref={bodyRef} />
      </div>
    </div>
  );
});

// CheckboxMultiSelect for org group filters
type CheckboxMultiSelectOption = { value: string; label: string };

const CheckboxMultiSelect = memo(function CheckboxMultiSelect(props: {
  placeholder: string;
  options: CheckboxMultiSelectOption[];
  selectedValues: string[];
  onChangeSelectedValues: (next: string[]) => void;
  minWidth?: number;
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleOption = useCallback(
    (val: string) => {
      if (selectedSet.has(val)) {
        onChangeSelectedValues(selectedValues.filter((v) => v !== val));
      } else {
        onChangeSelectedValues([...selectedValues, val]);
      }
    },
    [selectedSet, selectedValues, onChangeSelectedValues]
  );

  const label = selectedValues.length === 0 ? placeholder : `${selectedValues.length} selected`;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          minWidth,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: "#ffffff",
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        {label}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            minWidth,
            maxHeight: minListHeight,
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}
        >
          {options.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(opt.value)}
                onChange={() => toggleOption(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
});

// Props for ScheduleSection
export interface ScheduleSectionProps {
  projectId: string;
  petlEstimateVersionId: string | null;
  roomToUnitLabel: Map<string, string>;
  unitGroups: {
    unitLabel: string;
    rooms: { roomName: string }[];
  }[];
  mode: "SUMMARY" | "SCHEDULE";
  apiBase: string;
}

// Main ScheduleSection component
export const ScheduleSection = memo(function ScheduleSection(props: ScheduleSectionProps) {
  const { projectId, petlEstimateVersionId, roomToUnitLabel, unitGroups, mode, apiBase } = props;

  // General UI transition
  const [, startUiTransition] = useTransition();

  // Schedule state
  const [schedulePreview, setSchedulePreview] = useState<any | null>(null);
  const [schedulePreviewLoading, setSchedulePreviewLoading] = useState(false);
  const [schedulePreviewError, setSchedulePreviewError] = useState<string | null>(null);

  const [schedulePersistedTasks, setSchedulePersistedTasks] = useState<any[] | null>(null);
  const [schedulePersistedLoading, setSchedulePersistedLoading] = useState(false);
  const [schedulePersistedError, setSchedulePersistedError] = useState<string | null>(null);

  const [scheduleSource, setScheduleSource] = useState<"PREVIEW" | "ORG">("PREVIEW");
  const [scheduleGroupMode, setScheduleGroupMode] = useState<"ROOM" | "TRADE" | "UNIT">("ROOM");
  const [scheduleUnitFilter, setScheduleUnitFilter] = useState<string>("ALL");
  const [scheduleOrgGroupFilters, setScheduleOrgGroupFilters] = useState<string[]>([]);
  const [scheduleSummaryExpanded, setScheduleSummaryExpanded] = useState(false);

  const [scheduleDraftOverrides, setScheduleDraftOverrides] = useState<
    Record<string, { durationDays?: number; startDate?: string; lockType?: "SOFT" | "HARD" }>
  >({});

  const [scheduleDraftDeps, setScheduleDraftDeps] = useState<
    Record<string, { predecessorId: string; lagDays: number }[]>
  >({});

  const [scheduleOverridesPayload, setScheduleOverridesPayload] = useState<
    Record<string, { durationDays?: number; startDate?: string; lockType?: "SOFT" | "HARD" }> | null
  >(null);

  const [scheduleInlineEditTaskId, setScheduleInlineEditTaskId] = useState<string | null>(null);

  const [scheduleStartDate, setScheduleStartDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const isoAddDays = (iso: string, days: number): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const [scheduleViewPreset, setScheduleViewPreset] = useState<"ALL" | "30D" | "60D" | "90D" | "CUSTOM">(
    "60D"
  );

  const [scheduleZoom, setScheduleZoom] = useState<"AUTO" | "DAY" | "WEEK" | "MONTH">("AUTO");

  const [scheduleViewFrom, setScheduleViewFrom] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [scheduleViewTo, setScheduleViewTo] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return isoAddDays(today, 60);
  });

  useEffect(() => {
    if (scheduleViewPreset === "ALL" || scheduleViewPreset === "CUSTOM") return;
    const days = scheduleViewPreset === "30D" ? 30 : scheduleViewPreset === "60D" ? 60 : 90;
    setScheduleViewFrom(scheduleStartDate);
    setScheduleViewTo(isoAddDays(scheduleStartDate, days));
  }, [scheduleStartDate, scheduleViewPreset]);

  const [scheduleReloadTick, setScheduleReloadTick] = useState(0);

  // Transition-wrapped setters to avoid INP issues
  const setScheduleZoomTransition = useCallback(
    (next: "AUTO" | "DAY" | "WEEK" | "MONTH") => {
      startUiTransition(() => setScheduleZoom(next));
    },
    [startUiTransition]
  );

  const setScheduleViewPresetTransition = useCallback(
    (next: "ALL" | "30D" | "60D" | "90D" | "CUSTOM") => {
      startUiTransition(() => setScheduleViewPreset(next));
    },
    [startUiTransition]
  );

  const setScheduleGroupModeTransition = useCallback(
    (next: "ROOM" | "TRADE" | "UNIT") => {
      startUiTransition(() => setScheduleGroupMode(next));
    },
    [startUiTransition]
  );

  const setScheduleSourceTransition = useCallback(
    (next: "PREVIEW" | "ORG") => {
      startUiTransition(() => setScheduleSource(next));
    },
    [startUiTransition]
  );

  const setScheduleSummaryExpandedTransition = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      startUiTransition(() => setScheduleSummaryExpanded(next));
    },
    [startUiTransition]
  );

  const setScheduleReloadTickTransition = useCallback(
    (fn: (t: number) => number) => {
      startUiTransition(() => setScheduleReloadTick(fn));
    },
    [startUiTransition]
  );

  // Unique list of unit labels for the schedule filter
  const scheduleUnitLabels = useMemo(() => {
    const labels = unitGroups.map((ug) => String(ug?.unitLabel || "(No unit)").trim());
    const unique = Array.from(new Set(labels));

    const unitSortKey = (label: string) => {
      const s = String(label ?? "");
      const m = s.match(/^Unit\s+0*(\d+)\b/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return { kind: 0, n, s };
      }
      return { kind: 1, n: Number.POSITIVE_INFINITY, s: s.toLowerCase() };
    };

    return unique.sort((a, b) => {
      const ka = unitSortKey(a);
      const kb = unitSortKey(b);
      if (ka.kind !== kb.kind) return ka.kind - kb.kind;
      if (ka.n !== kb.n) return ka.n - kb.n;
      return ka.s.localeCompare(kb.s);
    });
  }, [unitGroups]);

  // Show schedule based on mode
  const showSchedule = mode === "SCHEDULE" || (mode === "SUMMARY" && scheduleSummaryExpanded);

  // Load schedule preview (Xact-driven estimate)
  useEffect(() => {
    if (!showSchedule) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setSchedulePreview(null);
      setSchedulePreviewError("Missing access token. Please login again.");
      setSchedulePreviewLoading(false);
      return;
    }

    if (!petlEstimateVersionId) {
      setSchedulePreview(null);
      setSchedulePreviewError(null);
      setSchedulePreviewLoading(false);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      setSchedulePreviewLoading(true);
      setSchedulePreviewError(null);

      try {
        const res = await fetch(
          `${apiBase}/projects/${projectId}/xact-schedule/estimate/${petlEstimateVersionId}/preview`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              startDate: scheduleStartDate,
              taskOverrides: scheduleOverridesPayload ?? undefined,
            }),
          }
        );

        if (cancelled) return;

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setSchedulePreview(null);
          setSchedulePreviewError(
            `Failed to generate schedule preview (${res.status}). ${text}`.slice(0, 2000)
          );
          return;
        }

        const json: any = await res.json();
        if (cancelled) return;
        setSchedulePreview(json);
      } catch (err: any) {
        if (cancelled) return;
        setSchedulePreview(null);
        setSchedulePreviewError(err?.message ?? "Failed to generate schedule preview");
      } finally {
        if (!cancelled) setSchedulePreviewLoading(false);
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [
    showSchedule,
    projectId,
    petlEstimateVersionId,
    scheduleStartDate,
    scheduleReloadTick,
    scheduleOverridesPayload,
    apiBase,
  ]);

  // Load canonical persisted schedule tasks (ORG source)
  useEffect(() => {
    if (!showSchedule) return;
    if (scheduleSource !== "ORG") return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setSchedulePersistedTasks(null);
      setSchedulePersistedError("Missing access token. Please login again.");
      setSchedulePersistedLoading(false);
      return;
    }

    if (!petlEstimateVersionId) {
      setSchedulePersistedTasks(null);
      setSchedulePersistedError(null);
      setSchedulePersistedLoading(false);
      return;
    }

    let cancelled = false;

    const loadTasks = async () => {
      setSchedulePersistedLoading(true);
      setSchedulePersistedError(null);

      try {
        const res = await fetch(
          `${apiBase}/projects/${projectId}/xact-schedule/estimate/${petlEstimateVersionId}/tasks`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (cancelled) return;

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setSchedulePersistedTasks(null);
          setSchedulePersistedError(
            `Failed to load canonical schedule tasks (${res.status}). ${text}`.slice(0, 2000)
          );
          return;
        }

        const json: any = await res.json();
        if (cancelled) return;

        const rows = Array.isArray(json) ? json : [];
        setSchedulePersistedTasks(rows);
      } catch (err: any) {
        if (cancelled) return;
        setSchedulePersistedTasks(null);
        setSchedulePersistedError(err?.message ?? "Failed to load canonical schedule tasks");
      } finally {
        if (!cancelled) setSchedulePersistedLoading(false);
      }
    };

    void loadTasks();

    return () => {
      cancelled = true;
    };
  }, [showSchedule, projectId, petlEstimateVersionId, scheduleSource, scheduleReloadTick, apiBase]);

  // Helper functions
  const addDaysIso = (iso: string, deltaDays: number): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  };

  const bumpToWeekdayIso = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() + 2);
    if (day === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const maxIso = (a: string, b: string): string => {
    if (!a) return b;
    if (!b) return a;
    return a >= b ? a : b;
  };

  // Derived schedule data
  const schedulePreviewTasksAll: any[] = useMemo(
    () =>
      Array.isArray(schedulePreview?.scheduledTasks)
        ? (schedulePreview!.scheduledTasks as any[])
        : [],
    [schedulePreview]
  );

  const scheduleOrgTasksAll: any[] = useMemo(
    () => (Array.isArray(schedulePersistedTasks) ? schedulePersistedTasks : []),
    [schedulePersistedTasks]
  );

  const scheduleOrgGroupCodes = useMemo(() => {
    const codes = new Set<string>();

    const sourceTasks =
      scheduleSource === "ORG" && scheduleOrgTasksAll.length > 0
        ? scheduleOrgTasksAll
        : schedulePreviewTasksAll;

    for (const t of sourceTasks as any[]) {
      const explicit = String((t as any)?.orgGroupCode ?? "").trim();
      if (explicit) {
        codes.add(explicit);
        continue;
      }

      const room = String((t as any)?.room ?? "").trim();
      if (!room) continue;
      const code = scheduleExtractGroupCode(room);
      if (code) codes.add(code);
    }

    return Array.from(codes.values()).sort((a, b) => a.localeCompare(b));
  }, [scheduleSource, schedulePreviewTasksAll, scheduleOrgTasksAll]);

  const scheduleOrgGroupFilterSet = useMemo(
    () => new Set(scheduleOrgGroupFilters),
    [scheduleOrgGroupFilters]
  );

  const scheduleTasks: any[] = useMemo(() => {
    const all = schedulePreviewTasksAll;

    if (all.length === 0) return [];

    const filtered = all.filter((t: any) => {
      const room = String(t?.room ?? "").trim();
      const unitLabel = roomToUnitLabel.get(room) ?? (room ? "Unassigned" : "Project");

      const explicit = String((t as any)?.orgGroupCode ?? "").trim();
      const groupCode = explicit || scheduleExtractGroupCode(room);

      if (scheduleOrgGroupFilterSet.size > 0) {
        if (!groupCode || !scheduleOrgGroupFilterSet.has(groupCode)) return false;
      }

      if (scheduleUnitFilter && scheduleUnitFilter !== "ALL") {
        if (unitLabel !== scheduleUnitFilter) return false;
      }

      return true;
    });

    const hasFilters =
      scheduleOrgGroupFilterSet.size > 0 || (scheduleUnitFilter && scheduleUnitFilter !== "ALL");

    if (!hasFilters) return all;
    return filtered;
  }, [schedulePreviewTasksAll, scheduleOrgGroupFilterSet, scheduleUnitFilter, roomToUnitLabel]);

  const scheduleGanttTasks: any[] = useMemo(() => {
    const baseAll =
      scheduleSource === "ORG" && scheduleOrgTasksAll.length > 0
        ? scheduleOrgTasksAll
        : schedulePreviewTasksAll;

    if (baseAll.length === 0) return [];

    const filtered = baseAll.filter((t: any) => {
      const room = String(t?.room ?? "").trim();
      const unitLabel = roomToUnitLabel.get(room) ?? (room ? "Unassigned" : "Project");

      const explicit = String((t as any)?.orgGroupCode ?? "").trim();
      const groupCode = explicit || scheduleExtractGroupCode(room);

      if (scheduleOrgGroupFilterSet.size > 0) {
        if (!groupCode || !scheduleOrgGroupFilterSet.has(groupCode)) return false;
      }

      if (scheduleUnitFilter && scheduleUnitFilter !== "ALL") {
        if (unitLabel !== scheduleUnitFilter) return false;
      }

      return true;
    });

    const hasFilters =
      scheduleOrgGroupFilterSet.size > 0 || (scheduleUnitFilter && scheduleUnitFilter !== "ALL");

    if (!hasFilters) return baseAll;
    return filtered;
  }, [
    scheduleSource,
    schedulePreviewTasksAll,
    scheduleOrgTasksAll,
    scheduleOrgGroupFilterSet,
    scheduleUnitFilter,
    roomToUnitLabel,
  ]);

  const scheduleTaskById = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of schedulePreviewTasksAll) {
      if (t?.id) m.set(String(t.id), t);
    }
    return m;
  }, [schedulePreviewTasksAll]);

  const buildOverridesFromDrafts = useCallback(() => {
    const overrides: Record<
      string,
      { durationDays?: number; startDate?: string; lockType?: "SOFT" | "HARD" }
    > = JSON.parse(JSON.stringify(scheduleDraftOverrides || {}));

    for (const [taskId, deps] of Object.entries(scheduleDraftDeps || {})) {
      if (!Array.isArray(deps) || deps.length === 0) continue;

      let requiredStart = "";
      for (const dep of deps) {
        const predId = String(dep?.predecessorId ?? "").trim();
        if (!predId) continue;
        const pred = scheduleTaskById.get(predId);
        if (!pred) continue;

        const predEnd = String(pred?.endDate ?? pred?.startDate ?? "").trim();
        if (!predEnd) continue;

        const lag = Number(dep?.lagDays ?? 0);
        const candidate = bumpToWeekdayIso(addDaysIso(predEnd, Number.isFinite(lag) ? lag : 0));
        requiredStart = requiredStart ? maxIso(requiredStart, candidate) : candidate;
      }

      if (!requiredStart) continue;

      const existing = overrides[taskId] ?? {};
      const nextStart = existing.startDate ? maxIso(existing.startDate, requiredStart) : requiredStart;
      overrides[taskId] = { ...existing, startDate: nextStart };
    }

    return overrides;
  }, [scheduleDraftOverrides, scheduleDraftDeps, scheduleTaskById]);

  // Generate Gantt text
  const scheduleGanttText = useMemo(() => {
    const allTasks: any[] = scheduleGanttTasks;

    if (allTasks.length === 0) return "";

    const fromIso = scheduleViewPreset === "ALL" ? "" : String(scheduleViewFrom || "").trim();
    const toIso = scheduleViewPreset === "ALL" ? "" : String(scheduleViewTo || "").trim();

    const tasks = allTasks.filter((t) => {
      if (scheduleViewPreset === "ALL") return true;
      const s = String(t?.startDate ?? "").trim();
      const e = String(t?.endDate ?? t?.startDate ?? "").trim();

      if (!fromIso || !toIso) return true;
      if (!s || !e) return true;

      return s <= toIso && e >= fromIso;
    });

    if (tasks.length === 0) return "";

    const titleSuffix =
      scheduleViewPreset === "ALL" ? "" : ` · ${fromIso || "?"} → ${toIso || "?"}`;

    const titleBase =
      scheduleSource === "ORG" ? "Project Schedule (org structure)" : "Project Schedule (preview)";

    const daysBetweenIso = (aIso: string, bIso: string): number => {
      const a = new Date(aIso);
      const b = new Date(bIso);
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
      const ms = b.getTime() - a.getTime();
      return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    };

    const inferredZoom = (() => {
      if (scheduleZoom !== "AUTO") return scheduleZoom;

      let from = fromIso;
      let to = toIso;

      if (!from || !to) {
        let min = "";
        let max = "";
        for (const t of tasks) {
          const s = String(t?.startDate ?? "").trim();
          const e = String(t?.endDate ?? t?.startDate ?? "").trim();
          if (s && (!min || s < min)) min = s;
          if (e && (!max || e > max)) max = e;
        }
        from = min;
        to = max;
      }

      const spanDays = from && to ? daysBetweenIso(from, to) : 0;
      if (spanDays <= 21) return "DAY";
      if (spanDays <= 140) return "WEEK";
      return "MONTH";
    })();

    const axisFormat =
      inferredZoom === "MONTH" ? "%b %Y" : inferredZoom === "WEEK" ? "%b W%W" : "%b %d";

    const tickInterval =
      inferredZoom === "MONTH" ? "1month" : inferredZoom === "WEEK" ? "1week" : "1day";

    const header: string[] = [
      "gantt",
      `  title ${titleBase}${titleSuffix}`,
      "  dateFormat  YYYY-MM-DD",
      `  axisFormat  ${axisFormat}`,
      `  tickInterval ${tickInterval}`,
      ...(inferredZoom === "WEEK" ? ["  weekday monday"] : []),
      "",
    ];

    const groupOf = (t: any): string => {
      if (scheduleGroupMode === "TRADE") {
        return String(t?.trade ?? "Unknown").trim() || "Unknown";
      }

      const room = String(t?.room ?? "").trim();
      if (scheduleGroupMode === "UNIT") {
        return roomToUnitLabel.get(room) ?? (room ? "Unassigned" : "Project");
      }

      return room || "Project";
    };

    const hoursSuffixOf = (t: any): string => {
      const h = Number(t?.totalLaborHours);
      if (!Number.isFinite(h) || h <= 0) return "";
      const rounded = h >= 100 ? Math.round(h) : Math.round(h * 10) / 10;
      return ` (${rounded}h)`;
    };

    const labelOf = (t: any): string => {
      const hoursSuffix = hoursSuffixOf(t);

      const room = String(t?.room ?? "Project").trim() || "Project";
      const trade = String(t?.trade ?? "Trade").trim() || "Trade";
      const phase = String(t?.phaseLabel ?? "Work").trim() || "Work";

      if (scheduleGroupMode === "TRADE") {
        return `${room} · ${phase}${hoursSuffix}`;
      }

      if (scheduleGroupMode === "UNIT") {
        return `${room} · ${trade} · ${phase}${hoursSuffix}`;
      }

      return `${trade} · ${phase}${hoursSuffix}`;
    };

    const durationToken = (t: any): string => {
      const d = Number(t?.durationDays);
      if (!Number.isFinite(d) || d <= 0) return "1d";
      if (Math.abs(d - Math.round(d)) < 1e-9) {
        return `${Math.round(d)}d`;
      }
      const hours = Math.max(1, Math.round(d * 8));
      return `${hours}h`;
    };

    const grouped = new Map<string, any[]>();
    for (const t of tasks) {
      const g = groupOf(t);
      const arr = grouped.get(g);
      if (arr) arr.push(t);
      else grouped.set(g, [t]);
    }

    const unitSortKey = (label: string) => {
      const s = String(label ?? "");
      const m = s.match(/^Unit\s+0*(\d+)\b/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return { kind: 0, n, s };
      }
      return { kind: 1, n: Number.POSITIVE_INFINITY, s: s.toLowerCase() };
    };

    let groupNames = Array.from(grouped.keys());
    if (scheduleGroupMode === "UNIT") {
      groupNames = groupNames.sort((a, b) => {
        const ka = unitSortKey(a);
        const kb = unitSortKey(b);
        if (ka.kind !== kb.kind) return ka.kind - kb.kind;
        if (ka.n !== kb.n) return ka.n - kb.n;
        return ka.s.localeCompare(kb.s);
      });
    } else {
      groupNames = groupNames.sort((a, b) => a.localeCompare(b));
    }

    for (const groupName of groupNames) {
      header.push(`  section ${groupName.replace(/\r|\n/g, " ")}`);
      const groupTasks = grouped.get(groupName) ?? [];
      groupTasks.sort((a, b) => {
        const sa = String(a?.startDate ?? "");
        const sb = String(b?.startDate ?? "");
        if (sa !== sb) return sa.localeCompare(sb);
        const pa = Number(a?.phaseCode ?? 0);
        const pb = Number(b?.phaseCode ?? 0);
        return pa - pb;
      });

      for (const t of groupTasks) {
        const start = String(t?.startDate ?? "").trim();
        if (!start) continue;

        const rawLabel = labelOf(t).replace(/:/g, "-");

        const hoursMatch = rawLabel.match(/ \([0-9.]+h\)$/);
        const hoursSuffix = hoursMatch ? hoursMatch[0] : "";
        const base = hoursSuffix ? rawLabel.slice(0, -hoursSuffix.length) : rawLabel;

        const maxLen = 72;
        const baseMax = Math.max(20, maxLen - hoursSuffix.length);
        const baseTrunc =
          base.length > baseMax ? `${base.slice(0, Math.max(0, baseMax - 1))}…` : base;
        const label = `${baseTrunc}${hoursSuffix}`;
        const id = makeMermaidSafeId(`${t?.id ?? "task"}_${groupName}`);
        header.push(`  ${label}: ${id}, ${start}, ${durationToken(t)}`);
      }

      header.push("");
    }

    return header.join("\n");
  }, [
    scheduleGanttTasks,
    scheduleGroupMode,
    roomToUnitLabel,
    scheduleViewPreset,
    scheduleViewFrom,
    scheduleViewTo,
    scheduleZoom,
    scheduleSource,
  ]);

  return (
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>Schedule (Gantt)</span>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {mode === "SUMMARY" && (
            <button
              type="button"
              onClick={() => setScheduleSummaryExpandedTransition((v) => !v)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {scheduleSummaryExpanded ? "Hide Schedule" : "Show Schedule"}
            </button>
          )}

          {(mode === "SCHEDULE" || scheduleSummaryExpanded) && (
            <Fragment>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Source:</span>
                <button
                  type="button"
                  onClick={() => setScheduleSourceTransition("PREVIEW")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleSource === "PREVIEW" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  title="Xact-driven estimate preview (live interpolation)"
                >
                  Estimate (Xact)
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleSourceTransition("ORG")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleSource === "ORG" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  title="Canonical org-structure schedule (persisted)"
                >
                  Org structure
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setScheduleOverridesPayload(buildOverridesFromDrafts());
                  setScheduleReloadTick((t) => t + 1);
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="Apply manual edits (durations / dependencies) to the preview"
              >
                Apply edits
              </button>

              <button
                type="button"
                onClick={() => {
                  setScheduleDraftOverrides({});
                  setScheduleDraftDeps({});
                  setScheduleOverridesPayload(null);
                  setScheduleReloadTick((t) => t + 1);
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="Clear manual edits"
              >
                Reset edits
              </button>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Group:</span>
                <button
                  type="button"
                  onClick={() => setScheduleGroupModeTransition("ROOM")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleGroupMode === "ROOM" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Room
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleGroupModeTransition("TRADE")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleGroupMode === "TRADE" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Trade
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleGroupModeTransition("UNIT")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleGroupMode === "UNIT" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Unit
                </button>
              </div>

              {scheduleGroupMode === "UNIT" && scheduleUnitLabels.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Unit scope:</span>
                  <select
                    value={scheduleUnitFilter}
                    onChange={(e) => setScheduleUnitFilter(e.target.value)}
                    style={{
                      padding: "3px 6px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  >
                    <option value="ALL">All units</option>
                    {scheduleUnitLabels.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scheduleOrgGroupCodes.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>Org group:</span>
                  <CheckboxMultiSelect
                    placeholder="All groups"
                    options={scheduleOrgGroupCodes.map((code) => ({ value: code, label: code }))}
                    selectedValues={scheduleOrgGroupFilters}
                    onChangeSelectedValues={setScheduleOrgGroupFilters}
                    minWidth={160}
                    minListHeight={220}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Schedule Start:</span>
                <input
                  type="date"
                  value={scheduleStartDate}
                  onChange={(e) => setScheduleStartDate(e.target.value)}
                  style={{
                    padding: "3px 6px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Zoom:</span>
                <button
                  type="button"
                  onClick={() => setScheduleZoomTransition("AUTO")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleZoom === "AUTO" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleZoomTransition("DAY")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleZoom === "DAY" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleZoomTransition("WEEK")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleZoom === "WEEK" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleZoomTransition("MONTH")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleZoom === "MONTH" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Month
                </button>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Window:</span>

                <button
                  type="button"
                  onClick={() => setScheduleViewPresetTransition("ALL")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    background: scheduleViewPreset === "ALL" ? "#e0f2fe" : "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  All
                </button>

                {(
                  [
                    { key: "30D", label: "30d" },
                    { key: "60D", label: "60d" },
                    { key: "90D", label: "90d" },
                  ] as { key: "30D" | "60D" | "90D"; label: string }[]
                ).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setScheduleViewPresetTransition(p.key)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: scheduleViewPreset === p.key ? "#e0f2fe" : "#ffffff",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {p.label}
                  </button>
                ))}

                <input
                  type="date"
                  value={scheduleViewFrom}
                  onChange={(e) => {
                    setScheduleViewPreset("CUSTOM");
                    setScheduleViewFrom(e.target.value);
                  }}
                  style={{
                    padding: "3px 6px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                  disabled={scheduleViewPreset === "ALL"}
                  title="Window start"
                />
                <span style={{ color: "#6b7280" }}>→</span>
                <input
                  type="date"
                  value={scheduleViewTo}
                  onChange={(e) => {
                    setScheduleViewPreset("CUSTOM");
                    setScheduleViewTo(e.target.value);
                  }}
                  style={{
                    padding: "3px 6px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 12,
                  }}
                  disabled={scheduleViewPreset === "ALL"}
                  title="Window end"
                />
              </div>

              <button
                type="button"
                onClick={() => setScheduleReloadTickTransition((t) => t + 1)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Refresh
              </button>
            </Fragment>
          )}
        </div>
      </div>

      {mode === "SUMMARY" && !scheduleSummaryExpanded ? null : (
        <div style={{ padding: 10 }}>
          {!petlEstimateVersionId && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Waiting for estimate data… (Open PETL at least once, or import Xactimate RAW +
              Components.)
            </div>
          )}

          {petlEstimateVersionId && scheduleSource === "PREVIEW" && schedulePreviewLoading && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>Generating schedule preview…</div>
          )}

          {petlEstimateVersionId && scheduleSource === "ORG" && schedulePersistedLoading && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>Loading canonical org schedule…</div>
          )}

          {petlEstimateVersionId &&
            scheduleSource === "PREVIEW" &&
            schedulePreviewError &&
            !schedulePreviewLoading && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  fontSize: 12,
                }}
              >
                {schedulePreviewError}
              </div>
            )}

          {petlEstimateVersionId &&
            scheduleSource === "ORG" &&
            schedulePersistedError &&
            !schedulePersistedLoading && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  fontSize: 12,
                }}
              >
                {schedulePersistedError}
              </div>
            )}

          {petlEstimateVersionId &&
            !schedulePreviewError &&
            !schedulePersistedError &&
            !schedulePreviewLoading &&
            !schedulePersistedLoading &&
            !scheduleGanttText && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                No schedule tasks available yet. (Make sure Xact RAW + Components are imported.)
              </div>
            )}

          {petlEstimateVersionId && scheduleGanttText && (
            <div style={{ marginTop: 10 }}>
              <MermaidGantt ganttText={scheduleGanttText} stickyHeader maxHeightPx={1280} />
            </div>
          )}

          {/* Edit panel (basic) */}
          {petlEstimateVersionId && scheduleTasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Edit schedule</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                Select a task to override duration/start. Dependencies are modeled as "must start
                after predecessor end + lag days".
              </div>

              <div
                style={{
                  maxHeight: 440,
                  overflow: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f9fafb" }}>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Task
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Start
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        End
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "6px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Days
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "6px 8px",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Hours
                      </th>
                      <th style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleTasks
                      .filter((t) => String(t?.kind ?? "") !== "MITIGATION")
                      .slice()
                      .sort((a, b) =>
                        String(a?.startDate ?? "").localeCompare(String(b?.startDate ?? ""))
                      )
                      .slice(0, 200)
                      .map((t) => {
                        const taskId = String(t.id);
                        const isOpen = scheduleInlineEditTaskId === taskId;
                        const override = scheduleDraftOverrides[taskId] ?? {};
                        const deps = scheduleDraftDeps[taskId] ?? [];

                        const setOverride = (patch: any) => {
                          setScheduleDraftOverrides((prev) => ({
                            ...prev,
                            [taskId]: { ...(prev[taskId] ?? {}), ...patch },
                          }));
                        };

                        const setDeps = (next: any[]) => {
                          setScheduleDraftDeps((prev) => ({
                            ...prev,
                            [taskId]: next,
                          }));
                        };

                        const allTaskOptions = isOpen
                          ? scheduleTasks
                              .filter(
                                (x) =>
                                  x &&
                                  String(x.id) !== taskId &&
                                  String(x.kind ?? "") !== "MITIGATION"
                              )
                              .slice()
                              .sort((a, b) =>
                                String(a?.startDate ?? "").localeCompare(String(b?.startDate ?? ""))
                              )
                          : [];

                        return (
                          <Fragment key={taskId}>
                            <tr>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{taskId}</div>
                                <div style={{ color: "#6b7280" }}>
                                  {(String(t?.room ?? "") || "Project") +
                                    " · " +
                                    (String(t?.trade ?? "") || "")}
                                </div>
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                              >
                                {String(t?.startDate ?? "")}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                              >
                                {String(t?.endDate ?? "")}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                }}
                              >
                                {Number(t?.durationDays ?? 0).toFixed(1)}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                }}
                              >
                                {Number(t?.totalLaborHours ?? 0).toFixed(0)}
                              </td>
                              <td
                                style={{
                                  padding: "6px 8px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setScheduleInlineEditTaskId((prev) =>
                                      prev === taskId ? null : taskId
                                    )
                                  }
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    border: "1px solid #d1d5db",
                                    background: "#ffffff",
                                    cursor: "pointer",
                                    fontSize: 12,
                                  }}
                                >
                                  {isOpen ? "Close" : "Edit"}
                                </button>
                              </td>
                            </tr>

                            {isOpen && (
                              <tr>
                                <td
                                  colSpan={6}
                                  style={{
                                    padding: 10,
                                    borderBottom: "1px solid #f3f4f6",
                                    background: "#f9fafb",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 12,
                                      flexWrap: "wrap",
                                      alignItems: "center",
                                      marginBottom: 10,
                                    }}
                                  >
                                    <label
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                        fontSize: 12,
                                      }}
                                    >
                                      <span style={{ color: "#6b7280" }}>Start</span>
                                      <input
                                        type="date"
                                        value={override.startDate ?? ""}
                                        onChange={(e) =>
                                          setOverride({
                                            startDate: e.target.value || undefined,
                                          })
                                        }
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: 6,
                                          border: "1px solid #d1d5db",
                                          fontSize: 12,
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setOverride({ startDate: undefined })}
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: 6,
                                          border: "1px solid #d1d5db",
                                          background: "#ffffff",
                                          cursor: "pointer",
                                          fontSize: 12,
                                        }}
                                      >
                                        Clear
                                      </button>
                                    </label>

                                    <label
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                        fontSize: 12,
                                      }}
                                    >
                                      <span style={{ color: "#6b7280" }}>Lock</span>
                                      <select
                                        value={override.lockType ?? "SOFT"}
                                        onChange={(e) =>
                                          setOverride({ lockType: e.target.value as any })
                                        }
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: 6,
                                          border: "1px solid #d1d5db",
                                          fontSize: 12,
                                        }}
                                      >
                                        <option value="SOFT">Soft</option>
                                        <option value="HARD">Hard</option>
                                      </select>
                                    </label>

                                    <label
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                        fontSize: 12,
                                      }}
                                    >
                                      <span style={{ color: "#6b7280" }}>Duration (days)</span>
                                      <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        value={override.durationDays ?? ""}
                                        placeholder={String(t?.durationDays ?? "")}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setOverride({
                                            durationDays: v === "" ? undefined : Number(v),
                                          });
                                        }}
                                        style={{
                                          width: 70,
                                          padding: "3px 6px",
                                          borderRadius: 6,
                                          border: "1px solid #d1d5db",
                                          fontSize: 12,
                                        }}
                                      />
                                    </label>
                                  </div>

                                  {/* Dependency editor */}
                                  <div style={{ marginTop: 10 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        marginBottom: 6,
                                      }}
                                    >
                                      Dependencies
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                        marginBottom: 6,
                                      }}
                                    >
                                      <select
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: 6,
                                          border: "1px solid #d1d5db",
                                          fontSize: 12,
                                          maxWidth: 200,
                                        }}
                                        value=""
                                        onChange={(e) => {
                                          const predId = e.target.value;
                                          if (!predId) return;
                                          if (deps.some((d: any) => d.predecessorId === predId))
                                            return;
                                          setDeps([...deps, { predecessorId: predId, lagDays: 0 }]);
                                        }}
                                      >
                                        <option value="">Add predecessor…</option>
                                        {allTaskOptions
                                          .filter(
                                            (x) => !deps.some((d: any) => d.predecessorId === x.id)
                                          )
                                          .map((x) => (
                                            <option key={x.id} value={x.id}>
                                              {x.id} ({x.room || "Project"})
                                            </option>
                                          ))}
                                      </select>
                                    </div>

                                    {deps.length > 0 && (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 6,
                                        }}
                                      >
                                        {deps.map((d: any) => (
                                          <div
                                            key={d.predecessorId}
                                            style={{
                                              display: "flex",
                                              gap: 8,
                                              alignItems: "center",
                                              fontSize: 12,
                                            }}
                                          >
                                            <span style={{ color: "#6b7280" }}>
                                              After{" "}
                                              <strong style={{ color: "#111827" }}>
                                                {d.predecessorId}
                                              </strong>
                                            </span>

                                            <label
                                              style={{
                                                display: "flex",
                                                gap: 4,
                                                alignItems: "center",
                                              }}
                                            >
                                              <span style={{ color: "#6b7280" }}>+</span>
                                              <input
                                                type="number"
                                                step="1"
                                                min="0"
                                                value={d.lagDays}
                                                onChange={(e) => {
                                                  const newLag = Number(e.target.value) || 0;
                                                  setDeps(
                                                    deps.map((x: any) =>
                                                      x.predecessorId === d.predecessorId
                                                        ? { ...x, lagDays: newLag }
                                                        : x
                                                    )
                                                  );
                                                }}
                                                style={{
                                                  width: 50,
                                                  padding: "3px 6px",
                                                  borderRadius: 6,
                                                  border: "1px solid #d1d5db",
                                                  fontSize: 12,
                                                }}
                                              />
                                              <span style={{ color: "#6b7280" }}>days</span>
                                            </label>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setDeps(
                                                  deps.filter(
                                                    (x: any) => x.predecessorId !== d.predecessorId
                                                  )
                                                );
                                              }}
                                              style={{
                                                padding: "3px 6px",
                                                borderRadius: 6,
                                                border: "1px solid #d1d5db",
                                                background: "#ffffff",
                                                cursor: "pointer",
                                                fontSize: 12,
                                              }}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
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
        </div>
      )}
    </div>
  );
});

export default ScheduleSection;
