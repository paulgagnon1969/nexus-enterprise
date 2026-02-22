import { apiJson, apiFetch } from "./client";
import type { TaskItem, CreateTaskRequest, TaskStatus } from "../types/api";

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
