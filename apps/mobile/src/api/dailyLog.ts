import { apiJson, apiFetch } from "./client";
import type {
  DailyLogFeedResponse,
  DailyLogDetail,
  DailyLogUpdateRequest,
  DailyLogRevision,
  ProjectListItem,
} from "../types/api";

/**
 * Fetch daily logs across all projects the user has access to.
 * Optionally filter by specific project IDs.
 */
export async function fetchDailyLogFeed(options?: {
  projectIds?: string[];
  limit?: number;
  offset?: number;
}): Promise<DailyLogFeedResponse> {
  const params = new URLSearchParams();

  if (options?.projectIds?.length) {
    params.set("projectIds", options.projectIds.join(","));
  }
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset != null) {
    params.set("offset", String(options.offset));
  }

  const query = params.toString();
  const path = query ? `/daily-logs?${query}` : "/daily-logs";

  return apiJson<DailyLogFeedResponse>(path);
}

/**
 * Fetch a single daily log by ID with full details.
 */
export async function fetchDailyLogDetail(logId: string): Promise<DailyLogDetail> {
  return apiJson<DailyLogDetail>(`/daily-logs/${encodeURIComponent(logId)}`);
}

/**
 * Fetch all projects the user has access to (for filter chips).
 */
export async function fetchUserProjects(): Promise<ProjectListItem[]> {
  return apiJson<ProjectListItem[]>("/projects");
}

/**
 * Update a daily log.
 */
export async function updateDailyLog(
  logId: string,
  data: DailyLogUpdateRequest,
): Promise<DailyLogDetail> {
  return apiJson<DailyLogDetail>(`/daily-logs/${encodeURIComponent(logId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/**
 * Flag a daily log for delayed publication.
 */
export async function delayPublishLog(logId: string): Promise<void> {
  await apiFetch(`/daily-logs/${encodeURIComponent(logId)}/delay-publish`, {
    method: "POST",
  });
}

/**
 * Publish a delayed log (make it visible again).
 */
export async function publishLog(logId: string): Promise<void> {
  await apiFetch(`/daily-logs/${encodeURIComponent(logId)}/publish`, {
    method: "POST",
  });
}

/**
 * Fetch revision history for a daily log.
 */
export async function fetchRevisions(logId: string): Promise<DailyLogRevision[]> {
  return apiJson<DailyLogRevision[]>(
    `/daily-logs/${encodeURIComponent(logId)}/revisions`,
  );
}

/**
 * Upload an attachment to a daily log.
 */
export async function uploadAttachment(
  logId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  console.log(`[dailyLog.uploadAttachment] Uploading ${fileName} to log ${logId}`);
  console.log(`[dailyLog.uploadAttachment] File URI: ${fileUri}`);

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as any);

  // Use apiFetch for FormData uploads (don't try to parse JSON response)
  const res = await apiFetch(`/daily-logs/${encodeURIComponent(logId)}/attachments`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[dailyLog.uploadAttachment] Failed: ${res.status} ${errText}`);
    throw new Error(`Upload failed: ${res.status} ${errText || res.statusText}`);
  }

  console.log(`[dailyLog.uploadAttachment] Success`);
}

/**
 * Trigger OCR on the most recent attachment for a daily log.
 * Returns extracted receipt data (vendor, amount, date, confidence).
 */
export async function triggerLogOcr(
  logId: string,
): Promise<{ vendor?: string; amount?: number; date?: string; confidence?: number; success: boolean; error?: string }> {
  return apiJson(`/daily-logs/${encodeURIComponent(logId)}/attachments/ocr`, {
    method: "POST",
  });
}

/**
 * Trigger immediate OCR on a specific project file (before saving).
 * Used for preview-before-save flow.
 */
export async function triggerProjectFileOcr(
  projectId: string,
  projectFileId: string,
): Promise<{ vendor?: string; amount?: number; date?: string; confidence?: number; success: boolean; error?: string }> {
  return apiJson(`/projects/${encodeURIComponent(projectId)}/daily-logs/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectFileId }),
  });
}

/**
 * Delete an attachment from a daily log.
 */
export async function deleteAttachment(
  logId: string,
  attachmentId: string,
): Promise<void> {
  await apiFetch(
    `/daily-logs/${encodeURIComponent(logId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
}

/**
 * Reassign a daily log to a different project.
 */
export async function reassignDailyLog(
  logId: string,
  targetProjectId: string,
): Promise<DailyLogDetail> {
  return apiJson<DailyLogDetail>(
    `/daily-logs/${encodeURIComponent(logId)}/reassign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProjectId }),
    },
  );
}
