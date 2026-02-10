import { apiJson, apiFetch } from "./client";

export interface TimecardEntry {
  id: string;
  workerId: string;
  workerName: string | null;
  locationCode: string | null;
  stHours: number;
  otHours: number;
  dtHours: number;
  timeIn: string | null;
  timeOut: string | null;
}

export interface TimecardResponse {
  id: string | null;
  companyId: string;
  projectId: string;
  date: string;
  entries: TimecardEntry[];
}

export interface ClockInRequest {
  projectId: string;
  locationCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ClockOutRequest {
  projectId: string;
  latitude?: number;
  longitude?: number;
}

export interface ClockStatus {
  isClockedIn: boolean;
  currentEntry: TimecardEntry | null;
  projectId: string | null;
  projectName: string | null;
  clockedInAt: string | null;
}

export interface RecentTimeEntry {
  id: string;
  date: string;
  projectId: string;
  projectName: string | null;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: number;
}

/**
 * Get current clock-in status for the user
 */
export async function getClockStatus(): Promise<ClockStatus> {
  return apiJson<ClockStatus>("/timecard/me/status");
}

/**
 * Clock in to a project
 */
export async function clockIn(req: ClockInRequest): Promise<ClockStatus> {
  return apiJson<ClockStatus>("/timecard/me/clock-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

/**
 * Clock out from current shift
 */
export async function clockOut(req: ClockOutRequest): Promise<ClockStatus> {
  return apiJson<ClockStatus>("/timecard/me/clock-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

/**
 * Get recent time entries for the user (last 14 days)
 */
export async function getRecentEntries(): Promise<RecentTimeEntry[]> {
  return apiJson<RecentTimeEntry[]>("/timecard/me/recent");
}
