"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface TimecardEntryDto {
  id?: string;
  workerId: string;
  workerName?: string | null;
  locationCode?: string | null;
  stHours: number;
  otHours?: number;
  dtHours?: number;
}

interface TimecardDto {
  id: string | null;
  companyId: string;
  projectId: string;
  date: string; // YYYY-MM-DD
  entries: TimecardEntryDto[];
}

interface WorkerOption {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
}

interface WeekDayInfo {
  iso: string; // YYYY-MM-DD
  label: string; // e.g. Sun 01/04
}

interface WeeklyRow {
  tempId: string;
  workerId: string; // empty string means "blank" row ready for selection
  workerName?: string;
  locationCode: string;
  days: { st: number; ot: number; dt: number }[]; // one entry per day in week
}

interface TimecardEditLogDto {
  id: string;
  date: string; // YYYY-MM-DD
  locationCode?: string | null;
  oldWorkerId: string;
  oldWorkerName?: string | null;
  newWorkerId: string;
  newWorkerName?: string | null;
  oldStHours: number;
  oldOtHours: number;
  oldDtHours: number;
  newStHours: number;
  newOtHours: number;
  newDtHours: number;
  editedByUserId?: string | null;
  editedByName?: string | null;
  createdAt: string | Date;
}

// Used to infer a default location filter for specific projects (e.g. CBS/CCT)
const DEFAULT_LOCATION_BY_PROJECT_ID: Record<string, string> = {
  // Fortified Structures CBS & CCT projects
  cmk65uim5000601s685j7bbpj: "CBS",
  cmjwjgmlf000f01s6c5atcwuu: "CCT",
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Treat work weeks as Sunday	00	Saturday based on the selected date
function getWeekStartIso(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateIso;
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return toIsoDate(d);
}

function buildWeekDays(weekStartIso: string): WeekDayInfo[] {
  const start = new Date(weekStartIso + "T00:00:00");
  if (Number.isNaN(start.getTime())) return [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const result: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toIsoDate(d);
    const label = `${dayNames[d.getDay()]} ${d.toLocaleDateString(undefined, {
      month: "2-digit",
      day: "2-digit",
    })}`;
    result.push({ iso, label });
  }
  return result;
}

function createBlankWeeklyRow(dayCount: number): WeeklyRow {
  return {
    tempId: `blank-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    workerId: "",
    workerName: undefined,
    locationCode: "CBS",
    days: Array.from({ length: dayCount }, () => ({ st: 0, ot: 0, dt: 0 })),
  };
}

function ensureTrailingBlankRow(rows: WeeklyRow[], dayCount: number): WeeklyRow[] {
  const hasBlank = rows.some((r) => !r.workerId);
  if (hasBlank) return rows;
  return [...rows, createBlankWeeklyRow(dayCount)];
}

function buildWeeklyRowsFromDaily(
  weekDays: WeekDayInfo[],
  dailyByDate: Map<string, TimecardDto>,
): WeeklyRow[] {
  const dayCount = weekDays.length;
  const rowsByKey = new Map<string, WeeklyRow>();

  weekDays.forEach((day, dayIndex) => {
    const tc = dailyByDate.get(day.iso);
    if (!tc) return;
    tc.entries.forEach((e) => {
      const key = `${e.workerId}::${e.locationCode ?? ""}`;
      let row = rowsByKey.get(key);
      if (!row) {
        row = {
          tempId: key,
          workerId: e.workerId,
          workerName: e.workerName ?? undefined,
          locationCode: e.locationCode ?? "",
          days: Array.from({ length: dayCount }, () => ({ st: 0, ot: 0, dt: 0 })),
        };
        rowsByKey.set(key, row);
      }
      row.days[dayIndex] = {
        st: e.stHours ?? 0,
        ot: e.otHours ?? 0,
        dt: e.dtHours ?? 0,
      };
    });
  });

  return Array.from(rowsByKey.values());
}

async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});

  // Ensure JSON Content-Type by default unless caller overrides.
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Attach Bearer token from localStorage if present and not already provided.
  if (typeof window !== "undefined") {
    try {
      const token = window.localStorage.getItem("accessToken");
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch (err) {
      // Ignore localStorage errors; request will just be unauthenticated.
      // eslint-disable-next-line no-console
      console.warn("Failed to read accessToken from localStorage", err);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export default function ProjectTimecardPage({
  params,
}: {
  params: Promise<{ id: string; date: string }>;
}) {
  const { id: projectId, date: initialDate } = React.use(params);
  const router = useRouter();

  const [date, setDate] = useState(initialDate);
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

  const [reloadToken, setReloadToken] = useState(0);

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteSubmitting, setPasteSubmitting] = useState(false);
  const [pasteWarnings, setPasteWarnings] = useState<string[] | null>(null);
  const [pasteSummary, setPasteSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<TimecardEditLogDto[]>([]);

  const weekStartIso = useMemo(() => getWeekStartIso(date), [date]);
  const weekDays = useMemo<WeekDayInfo[]>(() => buildWeekDays(weekStartIso), [weekStartIso]);

  // Load workers for the company (simple global list for now)
  useEffect(() => {
    async function loadWorkers() {
      try {
        const data = await apiFetch(`/workers`);
        const opts: WorkerOption[] = (data?.workers ?? data ?? []).map((w: any) => ({
          id: w.id,
          fullName: w.fullName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`.trim(),
          firstName: w.firstName ?? undefined,
          lastName: w.lastName ?? undefined,
        }));
        setWorkers(opts);
      } catch (err: any) {
        const msg = err?.message ?? String(err ?? "");
        // In prod, /workers may not exist yet; treat 404 as non-fatal so the
        // weekly grid still works and we just have an empty dropdown.
        if (msg.includes("API error 404")) {
          // eslint-disable-next-line no-console
          console.warn("/workers endpoint not available; worker dropdown will be empty");
        } else {
          // eslint-disable-next-line no-console
          console.error("Failed to load workers", err);
        }
      }
    }
    loadWorkers();
  }, []);

  // Load weekly timecard (all 7 days in the current work week)
  useEffect(() => {
    async function loadWeek() {
      setLoading(true);
      setError(null);
      try {
        const dailyByDate = new Map<string, TimecardDto>();

        // Fetch each day in the selected work week
        for (const day of weekDays) {
          try {
            const tc = await apiFetch(`/projects/${projectId}/timecards?date=${day.iso}`);
            dailyByDate.set(day.iso, tc);
          } catch (err: any) {
            // If a particular day has no timecard yet or returns 404, skip it silently
            console.warn("Failed to load daily timecard", day.iso, err?.message ?? err);
          }
        }

        const dayCount = weekDays.length || 7;
        let rows = buildWeeklyRowsFromDaily(weekDays, dailyByDate);
        if (rows.length === 0) {
          rows = [createBlankWeeklyRow(dayCount)];
        }
        rows = ensureTrailingBlankRow(rows, dayCount);
        setWeeklyRows(rows);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Failed to load weekly timecard");
      } finally {
        setLoading(false);
      }
    }

    if (weekDays.length > 0) {
      loadWeek();
    }
  }, [projectId, weekDays, reloadToken]);

  // When rows load for a project, default the location filter to the
  // project's primary location code (e.g. CBS/CCT) if present in the data.
  useEffect(() => {
    if (selectedLocations.length > 0) return;
    if (!weeklyRows.length) return;

    const projectDefault = DEFAULT_LOCATION_BY_PROJECT_ID[projectId];
    if (!projectDefault) return;

    const allLocs = new Set<string>();
    weeklyRows.forEach((row) => {
      const loc = (row.locationCode ?? "").trim();
      if (loc) allLocs.add(loc);
    });

    if (allLocs.has(projectDefault)) {
      setSelectedLocations([projectDefault]);
    }
  }, [projectId, weeklyRows, selectedLocations.length]);

  const handleChangeDate = (next: string) => {
    setDate(next);
    router.replace(`/projects/${projectId}/timecards/${next}`);
  };

  const handleCopyFromPreviousWeek = async () => {
    if (weekDays.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Build previous week (7 days before current week start)
      const firstDayIso = weekDays[0].iso;
      const firstDate = new Date(firstDayIso + "T00:00:00");
      firstDate.setDate(firstDate.getDate() - 7);
      const prevWeekStartIso = toIsoDate(firstDate);
      const prevWeekDays = buildWeekDays(prevWeekStartIso);

      const dailyByDate = new Map<string, TimecardDto>();
      for (const day of prevWeekDays) {
        try {
          const tc = await apiFetch(`/projects/${projectId}/timecards?date=${day.iso}`);
          dailyByDate.set(day.iso, tc);
        } catch (err: any) {
          console.warn("Failed to load prior week daily timecard", day.iso, err?.message ?? err);
        }
      }

      let rows = buildWeeklyRowsFromDaily(prevWeekDays, dailyByDate);
      if (rows.length === 0) {
        setError("No prior week timecards found to copy.");
        return;
      }
      const dayCount = weekDays.length || 7;
      rows = ensureTrailingBlankRow(rows, dayCount);
      setWeeklyRows(rows);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to copy from last week");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (weekDays.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // Persist each day in this work week as its own DailyTimecard
      for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex += 1) {
        const dayIso = weekDays[dayIndex].iso;
        const entries = weeklyRows
          .filter((row) =>
            row.workerId &&
            (row.days[dayIndex].st || row.days[dayIndex].ot || row.days[dayIndex].dt),
          )
          .map((row) => ({
            workerId: row.workerId,
            locationCode: row.locationCode || undefined,
            stHours: row.days[dayIndex].st,
            otHours: row.days[dayIndex].ot,
            dtHours: row.days[dayIndex].dt,
          }));

        const body = { date: dayIso, entries };
        await apiFetch(`/projects/${projectId}/timecards`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to save weekly timecard");
    } finally {
      setSaving(false);
    }
  };

  const handleImportFromBackendRefresh = () => {
    setReloadToken(prev => prev + 1);
  };

  const handleOpenAuditModal = async () => {
    if (!weekDays.length) return;
    setShowAuditModal(true);
    setAuditLoading(true);
    setAuditError(null);
    try {
      const weekStart = weekDays[0].iso;
      const weekEnd = weekDays[weekDays.length - 1].iso;
      const resp = await apiFetch(
        `/projects/${projectId}/timecards/audit?weekStart=${weekStart}&weekEnd=${weekEnd}`,
      );
      setAuditLogs((resp?.logs ?? []) as TimecardEditLogDto[]);
    } catch (e: any) {
      setAuditError(e?.message ?? "Failed to load audit history.");
    } finally {
      setAuditLoading(false);
    }
  };

  const handleFileUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const text = String(e.target?.result || "");
      setPasteText(text);
      setPasteWarnings(null);
      setPasteSummary(null);
      setShowPasteModal(true);
    };
    reader.readAsText(file);
    // Reset value so selecting the same file again retriggers onChange
    // eslint-disable-next-line no-param-reassign
    event.target.value = "";
  };

  const handleOpenPasteModal = () => {
    setPasteWarnings(null);
    setPasteSummary(null);
    setShowPasteModal(true);
  };

  const handleClosePasteModal = () => {
    if (!pasteSubmitting) {
      setShowPasteModal(false);
    }
  };

  const handlePasteImport = async () => {
    if (!pasteText.trim()) {
      setPasteWarnings(["Paste area is empty. Please paste CSV including the header row."]);
      return;
    }
    setPasteSubmitting(true);
    setPasteWarnings(null);
    setPasteSummary(null);
    try {
      const resp = await apiFetch(`/projects/${projectId}/timecards/import-weekly-from-csv`, {
        method: "POST",
        body: JSON.stringify({ csvText: pasteText }),
      });
      const processed = resp?.processedRows ?? 0;
      const warnings: string[] = resp?.warnings ?? [];
      setPasteSummary(`Imported ${processed} row(s).`);
      setPasteWarnings(warnings.length ? warnings : null);
      handleImportFromBackendRefresh();
    } catch (e: any) {
      setPasteWarnings([e?.message ?? "Failed to import weekly timecards."]);
    } finally {
      setPasteSubmitting(false);
    }
  };

  const handleAddRow = () => {
    const dayCount = weekDays.length || 7;
    setWeeklyRows((prev) => ensureTrailingBlankRow([...prev, createBlankWeeklyRow(dayCount)], dayCount));
  };

  const handleUpdateWorker = (rowId: string, workerId: string) => {
    setWeeklyRows((prev) => {
      const dayCount = weekDays.length || 7;
      const next = [...prev];
      const idx = next.findIndex((r) => r.tempId === rowId);
      if (idx < 0) return prev;
      const row = { ...next[idx] };
      row.workerId = workerId;
      const w = workers.find((x) => x.id === workerId);
      row.workerName = w?.fullName ?? row.workerName;
      next[idx] = row;

      const hasBlank = next.some((r) => !r.workerId);
      if (!hasBlank) {
        next.push(createBlankWeeklyRow(dayCount));
      }
      return next;
    });
  };

  const handleUpdateLocation = (rowId: string, locationCode: string) => {
    setWeeklyRows((prev) => {
      const next = [...prev];
      const idx = next.findIndex((r) => r.tempId === rowId);
      if (idx < 0) return prev;
      const row = { ...next[idx], locationCode };
      next[idx] = row;
      return next;
    });
  };

  const handleUpdateHours = (
    rowId: string,
    dayIndex: number,
    field: "st" | "ot" | "dt",
    value: number,
  ) => {
    setWeeklyRows((prev) => {
      const next = [...prev];
      const idx = next.findIndex((r) => r.tempId === rowId);
      if (idx < 0) return prev;
      const row = { ...next[idx] };
      const days = row.days.map((d, i) => (i === dayIndex ? { ...d } : d));
      const day = { ...days[dayIndex] };
      day[field] = Number.isNaN(value) ? 0 : value;
      days[dayIndex] = day;
      row.days = days;
      next[idx] = row;
      return next;
    });
  };

  const handleDeleteRow = (rowId: string) => {
    setWeeklyRows((prev) => {
      const dayCount = weekDays.length || 7;
      const next = prev.filter((r) => r.tempId !== rowId);
      if (next.length === 0) {
        next.push(createBlankWeeklyRow(dayCount));
      }
      return next;
    });
  };

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    weeklyRows.forEach((row) => {
      const loc = (row.locationCode ?? "").trim();
      if (loc) set.add(loc);
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [weeklyRows]);

  function getWorkerNamesForRow(row: WeeklyRow) {
    const worker = workers.find((w) => w.id === row.workerId);
    const fullName = (worker?.fullName || row.workerName || "").trim();

    let firstName = worker?.firstName?.trim() || "";
    let lastName = worker?.lastName?.trim() || "";

    if (!firstName && !lastName && fullName) {
      const parts = fullName.split(/\s+/);
      if (parts.length === 1) {
        // Single token – treat as last name
        // eslint-disable-next-line prefer-destructuring
        lastName = parts[0];
      } else if (parts.length > 1) {
        lastName = parts[parts.length - 1];
        firstName = parts.slice(0, -1).join(" ");
      }
    }

    return { fullName, firstName, lastName };
  }

  const filterWorkerOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    weeklyRows.forEach((row) => {
      if (!row.workerId || seen.has(row.workerId)) return;
      seen.add(row.workerId);
      const { fullName } = getWorkerNamesForRow(row);
      opts.push({ id: row.workerId, name: fullName || row.workerId });
    });
    opts.sort((a, b) => a.name.localeCompare(b.name));
    return opts;
  }, [weeklyRows, workers]);

  const visibleRows = useMemo(() => {
    const nonBlank: WeeklyRow[] = [];
    const blanks: WeeklyRow[] = [];

    weeklyRows.forEach((row) => {
      if (!row.workerId) {
        blanks.push(row);
      } else {
        nonBlank.push(row);
      }
    });

    const filtered = nonBlank.filter((row) => {
      if (selectedWorkerIds.length && !selectedWorkerIds.includes(row.workerId)) {
        return false;
      }
      const loc = (row.locationCode ?? "").trim();
      if (selectedLocations.length && !selectedLocations.includes(loc)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const na = getWorkerNamesForRow(a);
      const nb = getWorkerNamesForRow(b);

      const la = na.lastName.toLowerCase();
      const lb = nb.lastName.toLowerCase();
      if (la < lb) return -1;
      if (la > lb) return 1;

      const fa = na.firstName.toLowerCase();
      const fb = nb.firstName.toLowerCase();
      if (fa < fb) return -1;
      if (fa > fb) return 1;

      return na.fullName.toLowerCase().localeCompare(nb.fullName.toLowerCase());
    });

    return [...filtered, ...blanks];
  }, [weeklyRows, workers, selectedWorkerIds, selectedLocations]);

  const totalHours = useMemo(
    () =>
      weeklyRows.reduce(
        (sum, row) =>
          sum + row.days.reduce((inner, d) => inner + d.st + d.ot + d.dt, 0),
        0,
      ),
    [weeklyRows],
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Weekly Time Accounting</h1>
          <span className="text-sm text-gray-500">Project: {projectId}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col text-xs text-gray-500">
            {weekDays.length > 0 && (
              <span>
                Week: {weekDays[0].label} 												- {weekDays[weekDays.length - 1].label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Any date in week:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => handleChangeDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleFileUploadClick}
          disabled={saving || loading}
          className="border rounded px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Upload weekly CSV
        </button>
        <button
          type="button"
          onClick={handleOpenPasteModal}
          disabled={saving || loading}
          className="border rounded px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Paste weekly CSV
        </button>
        <button
          type="button"
          onClick={handleCopyFromPreviousWeek}
          disabled={saving || loading}
          className="border rounded px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Copy from last week
        </button>
        <button
          type="button"
          onClick={handleAddRow}
          disabled={saving || loading}
          className="border rounded px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Add worker
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="border rounded px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleOpenAuditModal}
          disabled={loading}
          className="border rounded px-2 py-1 text-xs bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          View changes
        </button>
        <span className="ml-auto text-sm text-gray-600">
          Total hours (week): {totalHours.toFixed(2)}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {showPasteModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl rounded-md bg-white p-4 shadow-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Paste Weekly Timecard CSV</h2>
              <button
                type="button"
                onClick={handleClosePasteModal}
                className="text-gray-500 hover:text-gray-800 text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Paste the CSV text including the header row. Expected columns match
              <code className="ml-1 px-1 py-0.5 rounded bg-gray-100 text-[10px]">
                docs/timecards/import-timecards.sample.csv
              </code>
              .
            </p>
            <textarea
              className="w-full border rounded p-2 text-xs font-mono h-56"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="company_id,project_code,week_end_date,worker_name,location_code,st_sun,ot_sun,dt_sun,..."
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <div className="flex flex-col gap-1 max-w-md">
                {pasteSummary && <div className="text-green-700">{pasteSummary}</div>}
                {pasteWarnings && pasteWarnings.length > 0 && (
                  <ul className="list-disc pl-4 text-red-700 max-h-32 overflow-auto">
                    {pasteWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClosePasteModal}
                  disabled={pasteSubmitting}
                  className="border rounded px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePasteImport}
                  disabled={pasteSubmitting}
                  className="border rounded px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {pasteSubmitting ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuditModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-4xl rounded-md bg-white p-4 shadow-lg border border-gray-200 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Timecard change history</h2>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="text-gray-500 hover:text-gray-800 text-sm"
              >
                ✕
              </button>
            </div>
            {auditLoading ? (
              <div className="text-xs text-gray-500">Loading edits...</div>
            ) : auditError ? (
              <div className="text-xs text-red-600">{auditError}</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-xs text-gray-500">No changes recorded for this week.</div>
            ) : (
              <table className="min-w-full text-xs border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">Date</th>
                    <th className="border px-2 py-1 text-left">Location</th>
                    <th className="border px-2 py-1 text-left">Old worker</th>
                    <th className="border px-2 py-1 text-left">New worker</th>
                    <th className="border px-2 py-1 text-center">ST (old → new)</th>
                    <th className="border px-2 py-1 text-center">OT (old → new)</th>
                    <th className="border px-2 py-1 text-center">DT (old → new)</th>
                    <th className="border px-2 py-1 text-left">Edited by</th>
                    <th className="border px-2 py-1 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    const created = new Date(log.createdAt);
                    const createdLabel = Number.isNaN(created.getTime())
                      ? ""
                      : created.toLocaleString();
                    return (
                      <tr key={log.id}>
                        <td className="border px-2 py-1">
                          {log.date}
                        </td>
                        <td className="border px-2 py-1">
                          {log.locationCode ?? ""}
                        </td>
                        <td className="border px-2 py-1">
                          {log.oldWorkerName ?? log.oldWorkerId}
                        </td>
                        <td className="border px-2 py-1">
                          {log.newWorkerName ?? log.newWorkerId}
                        </td>
                        <td className="border px-2 py-1 text-center">
                          {log.oldStHours.toFixed(2)} → {log.newStHours.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-center">
                          {log.oldOtHours.toFixed(2)} → {log.newOtHours.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1 text-center">
                          {log.oldDtHours.toFixed(2)} → {log.newDtHours.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1">
                          {log.editedByName ?? ""}
                        </td>
                        <td className="border px-2 py-1">
                          {createdLabel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading weekly timecard...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left align-bottom">Worker</th>
                <th className="border px-2 py-1 text-left align-bottom">Location</th>
                <th className="border px-2 py-1 text-center align-bottom">Total Hrs</th>
                {weekDays.map((day) => (
                  <th
                    key={day.iso}
                    colSpan={3}
                    className="border px-2 py-1 text-center align-bottom"
                  >
                    <div className="text-xs font-medium whitespace-nowrap">{day.label}</div>
                  </th>
                ))}
                <th className="border px-2 py-1" />
              </tr>
              <tr>
                {/* Worker filter under Worker column */}
                <th className="border px-1 py-0.5 text-left align-middle">
                  <select
                    id="workerFilter"
                    value={selectedWorkerIds[0] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedWorkerIds(v ? [v] : []);
                    }}
                    className="border rounded px-1 py-0.5 text-[10px] w-full"
                  >
                    <option value="">All workers</option>
                    {filterWorkerOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </th>
                {/* Location filter under Location column */}
                <th className="border px-1 py-0.5 text-left align-middle">
                  <select
                    id="locationFilter"
                    value={selectedLocations[0] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedLocations(v ? [v] : []);
                    }}
                    className="border rounded px-1 py-0.5 text-[10px] w-full"
                  >
                    <option value="">All locations</option>
                    {locationOptions.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </th>
                {/* Empty cell under Total Hrs to align with ST/OT/DT row */}
                <th className="border px-1 py-0.5" />
                {weekDays.map((day) => (
                  <React.Fragment key={`${day.iso}-sub`}>
                    <th className="border px-1 py-0.5 text-[10px] text-gray-500 text-center">ST</th>
                    <th className="border px-1 py-0.5 text-[10px] text-gray-500 text-center">OT</th>
                    <th className="border px-1 py-0.5 text-[10px] text-gray-500 text-center">DT</th>
                  </React.Fragment>
                ))}
    <th className="border px-1 py-0.5 text-center text-[10px] text-gray-500">
                  {selectedWorkerIds.length > 0 || selectedLocations.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWorkerIds([]);
                        setSelectedLocations([]);
                      }}
                      className="border rounded px-1 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200"
                    >
                      Clear
                    </button>
                  ) : null}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={row.tempId ?? rowIndex}>
                  <td className="border px-2 py-1">
                    <select
                      className="border rounded px-1 py-0.5 text-sm w-full"
                      value={row.workerId}
                      onChange={(ev) => handleUpdateWorker(row.tempId, ev.target.value)}
                    >
                      <option value="">Select worker</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.fullName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="text"
                      className="border rounded px-1 py-0.5 text-sm w-full"
                      value={row.locationCode ?? ""}
                      onChange={(ev) => handleUpdateLocation(row.tempId, ev.target.value)}
                    />
                  </td>
                  <td className="border px-2 py-1 text-right text-sm">
                    {row.days
                      .reduce((sum, d) => sum + d.st + d.ot + d.dt, 0)
                      .toFixed(2)}
                  </td>
                  {weekDays.map((day, dayIndex) => (
                    <React.Fragment key={`${row.tempId}-${day.iso}`}>
                      <td className="border px-1 py-1 text-center">
                        <input
                          type="number"
                          step="0.25"
                          inputMode="decimal"
                          size={5}
className={`border rounded px-0.5 py-0.5 text-xs text-center ${
                            (row.days[dayIndex]?.st ?? 0) === 0
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-white text-gray-900"
                          }`}
                          style={{ width: "5ch" }}
                          value={row.days[dayIndex]?.st ?? 0}
                          onChange={(ev) =>
                            handleUpdateHours(
                              row.tempId,
                              dayIndex,
                              "st",
                              parseFloat(ev.target.value) || 0,
                            )
                          }
                        />
                      </td>
                      <td className="border px-1 py-1 text-center">
                        <input
                          type="number"
                          step="0.25"
                          inputMode="decimal"
                          size={5}
className={`border rounded px-0.5 py-0.5 text-xs text-center ${
                            (row.days[dayIndex]?.ot ?? 0) === 0
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-white text-gray-900"
                          }`}
                          style={{ width: "5ch" }}
                          value={row.days[dayIndex]?.ot ?? 0}
                          onChange={(ev) =>
                            handleUpdateHours(
                              row.tempId,
                              dayIndex,
                              "ot",
                              parseFloat(ev.target.value) || 0,
                            )
                          }
                        />
                      </td>
                      <td className="border px-1 py-1 text-center">
                        <input
                          type="number"
                          step="0.25"
                          inputMode="decimal"
                          size={5}
className={`border rounded px-0.5 py-0.5 text-xs text-center ${
                            (row.days[dayIndex]?.dt ?? 0) === 0
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-white text-gray-900"
                          }`}
                          style={{ width: "5ch" }}
                          value={row.days[dayIndex]?.dt ?? 0}
                          onChange={(ev) =>
                            handleUpdateHours(
                              row.tempId,
                              dayIndex,
                              "dt",
                              parseFloat(ev.target.value) || 0,
                            )
                          }
                        />
                      </td>
                    </React.Fragment>
                  ))}
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.tempId)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
