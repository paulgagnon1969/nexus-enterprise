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

// ─── Crew Timecard Types & API ────────────────────────────────────

export interface CrewTimecardEntry {
  id: string;
  workerId: string;
  workerName: string | null;
  workerFirstName: string | null;
  workerLastName: string | null;
  locationCode: string | null;
  stHours: number;
  otHours: number;
  dtHours: number;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: number;
}

export interface CrewTimecardResponse {
  id: string | null;
  companyId: string;
  projectId: string;
  projectName: string;
  date: string;
  foremanStatus: string | null;
  foremanUserId?: string | null;
  foremanApprovedAt?: string | null;
  foremanNotes?: string | null;
  superStatus: string | null;
  superUserId?: string | null;
  superApprovedAt?: string | null;
  payrollStatus: string | null;
  payrollUserId?: string | null;
  payrollApprovedAt?: string | null;
  entries: CrewTimecardEntry[];
}

export interface ApprovalResponse {
  id: string;
  foremanStatus: string | null;
  superStatus: string | null;
  payrollStatus: string | null;
}

/**
 * Get crew timecard for a project/date (Foreman+ only)
 */
export async function getCrewTimecard(
  projectId: string,
  date: string,
): Promise<CrewTimecardResponse> {
  return apiJson<CrewTimecardResponse>(
    `/timecard/crew?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`,
  );
}

/**
 * Edit a crew member's time entry (Foreman+ only)
 */
export async function editCrewEntry(
  entryId: string,
  data: { timeIn?: string | null; timeOut?: string | null; stHours?: number; otHours?: number; dtHours?: number },
): Promise<CrewTimecardEntry> {
  return apiJson<CrewTimecardEntry>(`/timecard/crew/entries/${entryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/**
 * Foreman approves a day's timecard
 */
export async function approveTimecard(
  timecardId: string,
  notes?: string,
): Promise<ApprovalResponse> {
  return apiJson<ApprovalResponse>(`/timecard/crew/${timecardId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

/**
 * Superintendent approves a timecard
 */
export async function superApproveTimecard(
  timecardId: string,
  notes?: string,
): Promise<ApprovalResponse> {
  return apiJson<ApprovalResponse>(`/timecard/crew/${timecardId}/super-approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

/**
 * PM+/Admin payroll-approves a timecard
 */
export async function payrollApproveTimecard(
  timecardId: string,
  notes?: string,
): Promise<ApprovalResponse> {
  return apiJson<ApprovalResponse>(`/timecard/crew/${timecardId}/payroll-approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}
