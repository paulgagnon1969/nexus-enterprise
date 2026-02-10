import NetInfo from "@react-native-community/netinfo";
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

async function uploadDailyLogAttachment(params: {
  logId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const { logId, fileUri, fileName, mimeType } = params;

  const form = new FormData();
  form.append(
    "file",
    {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any,
  );

  const res = await apiFetch(`/daily-logs/${encodeURIComponent(logId)}/attachments`, {
    method: "POST",
    // Let fetch set the multipart boundary.
    // RN/Expo requires leaving Content-Type unset for FormData.
    body: form as any,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Attachment upload failed: ${res.status} ${text || res.statusText}`);
  }
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

export async function syncOnce(): Promise<{ processed: number; failed: number }> {
  const allowed = await canSyncNow();
  if (!allowed) {
    return { processed: 0, failed: 0 };
  }

  const items = await getPendingOutbox(50);

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await markOutboxProcessing(item.id);
      await processOutboxItem(item.type, item.payload);
      await markOutboxDone(item.id);
      processed += 1;
    } catch (err) {
      await markOutboxError(item.id, err);
      failed += 1;
    }
  }

  return { processed, failed };
}

// Helper for optimistic UI: add a locally-created daily log row into the cached list.
export async function addLocalDailyLog(projectId: string, localLog: any): Promise<void> {
  const key = `dailyLogs:${projectId}`;
  const current = (await getCache<any[]>(key)) || [];
  await setCache(key, [localLog, ...current]);
}
