import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { apiFetch, apiJson } from "../api/client";
import type { DailyLogCreateRequest } from "../types/api";
import { getWifiOnlySync } from "../storage/settings";
import { getCache, setCache } from "./cache";
import { getKv, setKv } from "./kv";
import {
  getPendingOutbox,
  markOutboxDone,
  markOutboxError,
  markOutboxProcessing,
} from "./outbox";
import { processMediaQueue } from "./mediaQueue";

export async function canSyncNow(): Promise<boolean> {
  const wifiOnly = await getWifiOnlySync();
  const state = await NetInfo.fetch();

  if (!state.isConnected) return false;
  if (wifiOnly) {
    return state.type === "wifi";
  }
  return true;
}

async function reconcileDailyLogCache(params: {
  projectId: string;
  localLogId: string;
  serverLog: any;
}) {
  const { projectId, localLogId, serverLog } = params;

  const key = `dailyLogs:${projectId}`;
  const current = (await getCache<any[]>(key)) || [];

  // Replace the local placeholder with the server log.
  const next = current.map((l) => {
    if (l?.id === localLogId) {
      return serverLog;
    }
    return l;
  });

  await setCache(key, next);
}

/**
 * Resolve a file URI that may have a stale iOS container UUID.
 * iOS reassigns the app container path between launches, so absolute URIs
 * stored in the outbox can become invalid.  We detect this and reconstruct
 * the path using the current documentDirectory.
 */
async function resolveFileUri(storedUri: string): Promise<string> {
  // Fast path — file exists at the stored URI
  const info = await FileSystem.getInfoAsync(storedUri);
  if (info.exists) return storedUri;

  // Try to recover: extract the relative portion after "Documents/"
  const marker = "Documents/";
  const idx = storedUri.indexOf(marker);
  if (idx === -1) {
    throw new Error(`File does not exist and cannot resolve path: ${storedUri}`);
  }

  const relativePath = storedUri.substring(idx + marker.length);
  const docDir = FileSystem.documentDirectory;
  if (!docDir) {
    throw new Error("FileSystem.documentDirectory is not available");
  }

  const resolved = `${docDir}${relativePath}`;
  console.log(`[Sync] Resolved stale URI:\n  old: ${storedUri}\n  new: ${resolved}`);

  const resolvedInfo = await FileSystem.getInfoAsync(resolved);
  if (!resolvedInfo.exists) {
    throw new Error(`File not found at original or resolved path: ${resolved}`);
  }

  return resolved;
}

async function uploadDailyLogAttachment(params: {
  logId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const { logId, fileName, mimeType } = params;

  console.log(`[Sync] Uploading attachment: ${fileName} to log ${logId}`);
  console.log(`[Sync] Stored file URI: ${params.fileUri}`);

  // Resolve the file URI (handles iOS container UUID drift)
  const resolvedUri = await resolveFileUri(params.fileUri);

  // Get file size for metadata
  const fileInfo = await FileSystem.getInfoAsync(resolvedUri, { size: true });
  const sizeBytes = (fileInfo as any).size ?? undefined;

  // ── Step 1: Request a signed GCS upload URL from the API ──
  console.log(`[Sync] Requesting signed upload URL...`);
  const { uploadUrl, publicUrl } = await apiJson<{
    uploadUrl: string;
    publicUrl: string;
    gcsKey: string;
  }>(`/daily-logs/${encodeURIComponent(logId)}/attachments/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: fileName || "attachment.bin",
      mimeType: mimeType || "application/octet-stream",
      sizeBytes,
    }),
  });

  console.log(`[Sync] Got signed URL, uploading directly to GCS...`);

  // ── Step 2: Upload file directly to GCS (bypasses API server) ──
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, resolvedUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
    },
  });

  console.log(`[Sync] GCS upload response: ${uploadResult.status}`);

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    console.error(`[Sync] GCS upload failed: ${uploadResult.status} ${uploadResult.body?.slice(0, 500)}`);
    throw new Error(`GCS upload failed: ${uploadResult.status}`);
  }

  // ── Step 3: Record the attachment metadata via /link endpoint ──
  console.log(`[Sync] Recording attachment metadata...`);
  await apiJson(`/daily-logs/${encodeURIComponent(logId)}/attachments/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrl: publicUrl,
      fileName: fileName || "attachment.bin",
      mimeType: mimeType || null,
      sizeBytes: sizeBytes ?? null,
    }),
  });

  console.log(`[Sync] Attachment uploaded and recorded successfully`);
}

async function processOutboxItem(type: string, payloadStr: string): Promise<void> {
  const payload = JSON.parse(payloadStr) as any;

  switch (type) {
    case "inventory.moveAsset": {
      const { toLocationId, assetId, reason, note } = payload as {
        toLocationId: string;
        assetId: string;
        reason?: string;
        note?: string;
      };

      await apiJson(`/inventory/holdings/location/${encodeURIComponent(toLocationId)}/move-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, reason, note }),
      });

      // Best-effort: refresh destination holdings cache.
      try {
        const updated = await apiJson<any>(
          `/inventory/holdings/location/${encodeURIComponent(toLocationId)}`,
        );
        await setCache(`inventory.holdings.location:${toLocationId}`, updated);
      } catch {
        // ignore
      }

      return;
    }

    case "dailyLog.create": {
      const { projectId, localLogId, dto } = payload as {
        projectId: string;
        localLogId?: string;
        dto: DailyLogCreateRequest;
      };

      const created = await apiJson<any>(
        `/projects/${encodeURIComponent(projectId)}/daily-logs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dto),
        },
      );

      if (localLogId && created?.id) {
        await setKv(`dailyLog.map:${localLogId}`, String(created.id));
        await reconcileDailyLogCache({ projectId, localLogId, serverLog: created });
      }

      // Best-effort: refresh logs cache.
      try {
        const latest = await apiJson<any[]>(
          `/projects/${encodeURIComponent(projectId)}/daily-logs`,
        );
        await setCache(`dailyLogs:${projectId}`, latest);
      } catch {
        // ignore
      }

      return;
    }

    case "dailyLog.uploadAttachment": {
      const { logId, localLogId, fileUri, fileName, mimeType } = payload as {
        logId?: string;
        localLogId?: string;
        fileUri: string;
        fileName: string;
        mimeType: string;
      };

      let resolvedLogId = logId || null;
      if (!resolvedLogId && localLogId) {
        resolvedLogId = await getKv(`dailyLog.map:${localLogId}`);
      }

      if (!resolvedLogId) {
        throw new Error("Attachment waiting for daily log creation");
      }

      await uploadDailyLogAttachment({
        logId: resolvedLogId,
        fileUri,
        fileName: fileName || "attachment.bin",
        mimeType: mimeType || "application/octet-stream",
      });

      return;
    }

    case "dailyLog.update": {
      const { logId, updates } = payload as {
        logId: string;
        updates: Record<string, any>;
      };

      await apiJson(`/daily-logs/${encodeURIComponent(logId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      return;
    }

    case "fieldPetl.edit": {
      const { projectId, sowItemId, incorrect, fieldQty, percent, note } = payload as {
        projectId: string;
        sowItemId: string;
        incorrect: boolean;
        fieldQty: number | null;
        percent: number | null;
        note: string | null;
      };

      // 1) Qty flags (always send an explicit state so server can clear flags when needed).
      await apiJson(`/projects/${encodeURIComponent(projectId)}/petl-field/qty-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              sowItemId,
              qtyFlaggedIncorrect: incorrect,
              qtyFieldReported: incorrect ? fieldQty : null,
              notes: incorrect ? note : null,
            },
          ],
        }),
      });

      // 2) Optional percent update.
      if (percent != null) {
        await apiJson(`/projects/${encodeURIComponent(projectId)}/petl/percentage-edits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changes: [
              {
                sowItemId,
                newPercent: percent,
              },
            ],
          }),
        });
      }

      // Best-effort: no local cache reconciliation for Field PETL yet; web + next reload
      // of the Daily Logs screen will pick up the latest state.
      return;
    }

    case "media.upload": {
      // Media uploads are handled by the dedicated media queue,
      // which respects bandwidth throttling and WiFi-gating.
      // Skip here — processMediaQueue() handles these items directly.
      return;
    }

    case "fieldPetl.bulkUpdatePercent": {
      const { projectId, sowItemIds, newPercent } = payload as {
        projectId: string;
        sowItemIds: string[];
        newPercent: number;
        filterDescription?: string;
        itemCount?: number;
        previousPercent?: string;
      };

      // Send bulk percent update to server
      await apiJson(`/projects/${encodeURIComponent(projectId)}/petl/percentage-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: sowItemIds.map((sowItemId) => ({
            sowItemId,
            newPercent,
          })),
        }),
      });

      return;
    }

    case "timecard.clockIn": {
      const { projectId, timestamp, latitude, longitude } = payload as {
        projectId: string;
        timestamp: string;
        latitude?: number;
        longitude?: number;
      };

      await apiJson("/timecard/me/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          timestamp,
          latitude,
          longitude,
        }),
      });

      // Best-effort: refresh status cache
      try {
        const status = await apiJson<any>("/timecard/me/status");
        await setCache("timecard.status", status);
      } catch {
        // ignore
      }

      return;
    }

    case "timecard.clockOut": {
      const { projectId, timestamp, clockedInAt, latitude, longitude } = payload as {
        projectId: string;
        timestamp: string;
        clockedInAt?: string;
        latitude?: number;
        longitude?: number;
      };

      await apiJson("/timecard/me/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          timestamp,
          clockedInAt,
          latitude,
          longitude,
        }),
      });

      // Best-effort: refresh status and recent entries cache
      try {
        const [status, recent] = await Promise.all([
          apiJson<any>("/timecard/me/status"),
          apiJson<any[]>("/timecard/me/recent"),
        ]);
        await setCache("timecard.status", status);
        await setCache("timecard.recent", recent);
      } catch {
        // ignore
      }

      return;
    }

    default:
      throw new Error(`Unknown outbox type: ${type}`);
  }
}

export async function syncOnce(): Promise<{ processed: number; failed: number; skippedReason?: string }> {
  const wifiOnly = await getWifiOnlySync();
  const netState = await NetInfo.fetch();

  // Check connectivity
  if (!netState.isConnected) {
    return { processed: 0, failed: 0, skippedReason: "No network connection" };
  }
  if (wifiOnly && netState.type !== "wifi") {
    return { processed: 0, failed: 0, skippedReason: `Wi-Fi only enabled but on ${netState.type}` };
  }

  const items = await getPendingOutbox(50);

  let processed = 0;
  let failed = 0;
  let authFailure = false;

  for (const item of items) {
    // If we hit an auth failure, stop processing further items
    // (they'll all fail with 401 anyway)
    if (authFailure) {
      break;
    }

    try {
      await markOutboxProcessing(item.id);
      await processOutboxItem(item.type, item.payload);
      await markOutboxDone(item.id);
      processed += 1;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await markOutboxError(item.id, err);
      failed += 1;

      // Detect auth failures and stop early
      if (errMsg.includes("401") || errMsg.includes("Unauthorized") || errMsg.includes("Missing refresh token") || errMsg.includes("Refresh failed")) {
        authFailure = true;
      }
    }
  }

  if (authFailure) {
    return { processed, failed, skippedReason: "Authentication failed - please log in again" };
  }

  // After processing standard outbox items, run the media queue
  try {
    const mediaResult = await processMediaQueue();
    processed += mediaResult.uploaded;
    failed += mediaResult.failed;
  } catch (err) {
    console.log(`[sync] Media queue error:`, err instanceof Error ? err.message : err);
  }

  return { processed, failed };
}

// Helper for optimistic UI: add a locally-created daily log row into the cached list.
export async function addLocalDailyLog(projectId: string, localLog: any): Promise<void> {
  const key = `dailyLogs:${projectId}`;
  const current = (await getCache<any[]>(key)) || [];
  await setCache(key, [localLog, ...current]);
}
