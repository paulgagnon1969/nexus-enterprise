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
