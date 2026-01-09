"use client";

import React, { useEffect, useMemo, useState } from "react";
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
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
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
  const [timecard, setTimecard] = useState<TimecardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);

  // Load workers for the company (simple global list for now)
  useEffect(() => {
    async function loadWorkers() {
      try {
        const data = await apiFetch(`/workers`);
        const opts: WorkerOption[] = (data?.workers ?? data ?? []).map((w: any) => ({
          id: w.id,
          fullName: w.fullName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`.trim(),
        }));
        setWorkers(opts);
      } catch (err) {
        console.error("Failed to load workers", err);
      }
    }
    loadWorkers();
  }, []);

  // Load timecard when projectId or date changes
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const tc = await apiFetch(`/projects/${projectId}/timecards?date=${date}`);
        setTimecard(tc);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Failed to load timecard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId, date]);

  const handleChangeDate = (next: string) => {
    setDate(next);
    router.replace(`/projects/${projectId}/timecards/${next}`);
  };

  const handleCopyFromPrevious = async () => {
    setSaving(true);
    setError(null);
    try {
      const tc = await apiFetch(`/projects/${projectId}/timecards/copy-from-previous`, {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setTimecard(tc);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to copy from previous day");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!timecard) return;

    setSaving(true);
    setError(null);
    try {
      const body = {
        date,
        entries: timecard.entries.map((e) => ({
          workerId: e.workerId,
          locationCode: e.locationCode ?? undefined,
          stHours: e.stHours,
          otHours: e.otHours ?? 0,
          dtHours: e.dtHours ?? 0,
        })),
      };

      const tc = await apiFetch(`/projects/${projectId}/timecards`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTimecard(tc);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to save timecard");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRow = () => {
    if (!timecard) return;
    const next: TimecardEntryDto = {
      workerId: workers[0]?.id ?? "",
      workerName: workers[0]?.fullName ?? "",
      locationCode: "CBS",
      stHours: 8,
      otHours: 0,
      dtHours: 0,
    };
    setTimecard({ ...timecard, entries: [...timecard.entries, next] });
  };

  const handleUpdateRow = (idx: number, patch: Partial<TimecardEntryDto>) => {
    if (!timecard) return;
    const entries = [...timecard.entries];
    const current = entries[idx];
    let next = { ...current, ...patch };

    if (patch.workerId) {
      const w = workers.find((x) => x.id === patch.workerId);
      next.workerName = w?.fullName ?? next.workerName;
    }

    entries[idx] = next;
    setTimecard({ ...timecard, entries });
  };

  const handleDeleteRow = (idx: number) => {
    if (!timecard) return;
    const entries = [...timecard.entries];
    entries.splice(idx, 1);
    setTimecard({ ...timecard, entries });
  };

  const totalHours = useMemo(
    () =>
      timecard?.entries.reduce((sum, e) => sum + (e.stHours || 0) + (e.otHours || 0) + (e.dtHours || 0), 0) ?? 0,
    [timecard],
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Daily Timecard</h1>
          <span className="text-sm text-gray-500">Project: {projectId}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => handleChangeDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopyFromPrevious}
          disabled={saving || loading}
          className="border rounded px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Copy from previous day
        </button>
        <button
          type="button"
          onClick={handleAddRow}
          disabled={saving || loading || workers.length === 0}
          className="border rounded px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Add worker
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || !timecard}
          className="border rounded px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <span className="ml-auto text-sm text-gray-600">
          Total hours: {totalHours.toFixed(2)}
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading timecard...</div>
      ) : !timecard ? (
        <div className="text-sm text-gray-500">No timecard data.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Worker</th>
                <th className="border px-2 py-1 text-left">Location</th>
                <th className="border px-2 py-1 text-right">ST Hours</th>
                <th className="border px-2 py-1 text-right">OT Hours</th>
                <th className="border px-2 py-1 text-right">DT Hours</th>
                <th className="border px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {timecard.entries.map((e, idx) => (
                <tr key={idx}>
                  <td className="border px-2 py-1">
                    <select
                      className="border rounded px-1 py-0.5 text-sm w-full"
                      value={e.workerId}
                      onChange={(ev) => handleUpdateRow(idx, { workerId: ev.target.value })}
                    >
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
                      value={e.locationCode ?? ""}
                      onChange={(ev) => handleUpdateRow(idx, { locationCode: ev.target.value })}
                    />
                  </td>
                  <td className="border px-2 py-1 text-right">
                    <input
                      type="number"
                      step="0.25"
                      className="border rounded px-1 py-0.5 text-sm w-20 text-right"
                      value={e.stHours}
                      onChange={(ev) =>
                        handleUpdateRow(idx, { stHours: parseFloat(ev.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="border px-2 py-1 text-right">
                    <input
                      type="number"
                      step="0.25"
                      className="border rounded px-1 py-0.5 text-sm w-20 text-right"
                      value={e.otHours ?? 0}
                      onChange={(ev) =>
                        handleUpdateRow(idx, { otHours: parseFloat(ev.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="border px-2 py-1 text-right">
                    <input
                      type="number"
                      step="0.25"
                      className="border rounded px-1 py-0.5 text-sm w-20 text-right"
                      value={e.dtHours ?? 0}
                      onChange={(ev) =>
                        handleUpdateRow(idx, { dtHours: parseFloat(ev.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(idx)}
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
