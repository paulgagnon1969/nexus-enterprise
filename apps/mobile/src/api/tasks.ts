import { apiJson, apiFetch } from "./client";
import type { TaskItem, CreateTaskRequest, TaskStatus, TaskDisposition, TaskActivityItem } from "../types/api";

/**
 * Fetch tasks linked to a specific daily log.
 */
export async function fetchTasksForDailyLog(dailyLogId: string): Promise<TaskItem[]> {
  const params = new URLSearchParams({
    relatedEntityType: "DAILY_LOG",
    relatedEntityId: dailyLogId,
  });
  return apiJson<TaskItem[]>(`/tasks?${params.toString()}`);
}

/**
 * Fetch all tasks for the current user.
 * Foreman+ (OWNER/ADMIN) will see all tasks; others see only their assigned tasks.
 */
export async function fetchAllTasks(options?: {
  projectId?: string;
  status?: string;
  overdueOnly?: boolean;
}): Promise<TaskItem[]> {
  const params = new URLSearchParams();
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.status) params.set("status", options.status);
  if (options?.overdueOnly) params.set("overdueOnly", "true");
  const query = params.toString();
  return apiJson<TaskItem[]>(query ? `/tasks?${query}` : "/tasks");
}

/**
 * Create a new task (optionally linked to a daily log).
 */
export async function createTask(data: CreateTaskRequest): Promise<TaskItem> {
  return apiJson<TaskItem>("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/**
 * Update the status of an existing task.
 */
export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<TaskItem> {
  return apiJson<TaskItem>(`/tasks/${encodeURIComponent(taskId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

/**
 * Update a task (reassign, change title, description, priority, due date, status).
 */
export async function updateTask(
  taskId: string,
  data: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
    status?: TaskStatus;
    priority?: string;
    dueDate?: string | null;
  },
): Promise<TaskItem> {
  return apiJson<TaskItem>(`/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/**
 * Submit a disposition (Approve / Reject / Reassign) with optional note.
 */
export async function disposeTask(
  taskId: string,
  data: { disposition: TaskDisposition; note?: string; assigneeId?: string },
): Promise<TaskItem> {
  return apiJson<TaskItem>(`/tasks/${encodeURIComponent(taskId)}/dispose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/**
 * Add a note / memo to a task.
 */
export async function addTaskNote(
  taskId: string,
  note: string,
): Promise<TaskActivityItem> {
  return apiJson<TaskActivityItem>(`/tasks/${encodeURIComponent(taskId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

/**
 * Fetch the full activity log for a task.
 */
export async function fetchTaskActivities(
  taskId: string,
): Promise<TaskActivityItem[]> {
  return apiJson<TaskActivityItem[]>(`/tasks/${encodeURIComponent(taskId)}/activities`);
}

/**
 * Lightweight member type for reassignment picker.
 */
export interface TeamMember {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Fetch company members for reassignment.
 * Uses /users/me memberships as a lightweight source.
 */
export async function fetchCompanyMembers(): Promise<TeamMember[]> {
  // The API doesn't have a dedicated members endpoint yet,
  // so we pull from /companies/me/members if available, otherwise
  // fall back to returning an empty list.
  try {
    return await apiJson<TeamMember[]>("/companies/me/members");
  } catch {
    return [];
  }
}
