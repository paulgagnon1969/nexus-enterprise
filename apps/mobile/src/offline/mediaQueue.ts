import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "./db";
import { enqueueOutbox, markOutboxDone, markOutboxError, markOutboxProcessing } from "./outbox";
import { getNetworkTier, getFileSize, type NetworkTier } from "../utils/mediaCompressor";
import { apiFetch } from "../api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaUploadStatus = "QUEUED" | "UPLOADING" | "DONE" | "ERROR";

export interface MediaUploadRow {
  id: string;
  outboxId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video";
  bytesTotal: number;
  bytesUploaded: number;
  status: MediaUploadStatus;
  networkTier: NetworkTier;
  wifiOnly: number; // 0 or 1
  createdAt: number;
}

export interface EnqueueMediaOpts {
  /** The daily log (or other entity) this attachment belongs to. */
  logId?: string;
  /** Local log ID if not yet synced to server. */
  localLogId?: string;
  /** URI of the compressed/ready-to-upload file. */
  fileUri: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video";
  /** Total file size in bytes. */
  bytesTotal: number;
  /** Network tier at capture time. */
  networkTier: NetworkTier;
  /** If true, only upload when on WiFi. */
  wifiOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELLULAR_CONCURRENCY = 1;
const WIFI_CONCURRENCY = 3;
const CELLULAR_DELAY_MS = 500;

let processingCount = 0;
let isProcessing = false;

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

function makeMediaId(): string {
  return `mu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a media file for upload. Creates both an outbox entry (for the
 * general sync system) and a media_uploads row (for progress tracking).
 */
export async function enqueueMedia(opts: EnqueueMediaOpts): Promise<string> {
  const id = makeMediaId();

  // Create outbox entry for the sync system
  const outboxId = await enqueueOutbox("media.upload", {
    mediaUploadId: id,
    logId: opts.logId,
    localLogId: opts.localLogId,
    fileUri: opts.fileUri,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    mediaType: opts.mediaType,
    wifiOnly: opts.wifiOnly ?? opts.mediaType === "video",
  });

  // Create progress tracking row
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO media_uploads (id, outboxId, fileUri, fileName, mimeType, mediaType, bytesTotal, bytesUploaded, status, networkTier, wifiOnly, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'QUEUED', ?, ?, ?)`,
    [
      id,
      outboxId,
      opts.fileUri,
      opts.fileName,
      opts.mimeType,
      opts.mediaType,
      opts.bytesTotal,
      opts.networkTier,
      opts.wifiOnly ?? opts.mediaType === "video" ? 1 : 0,
      Date.now(),
    ],
  );

  return id;
}

// ---------------------------------------------------------------------------
// Queue processing
// ---------------------------------------------------------------------------

/**
 * Process pending media uploads respecting bandwidth constraints.
 * Called by the sync system — handles concurrency and WiFi-gating.
 */
export async function processMediaQueue(): Promise<{
  uploaded: number;
  skipped: number;
  failed: number;
}> {
  if (isProcessing) return { uploaded: 0, skipped: 0, failed: 0 };
  isProcessing = true;

  try {
    const tier = await getNetworkTier();
    const maxConcurrency = tier === "wifi" ? WIFI_CONCURRENCY : CELLULAR_CONCURRENCY;

    const db = await getDb();
    const pending = await db.getAllAsync<MediaUploadRow>(
      `SELECT * FROM media_uploads WHERE status IN ('QUEUED', 'ERROR') ORDER BY createdAt ASC LIMIT 20`,
    );

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    // Process items respecting concurrency
    const batch: Promise<void>[] = [];

    for (const item of pending) {
      // WiFi-only items skip when on cellular
      if (item.wifiOnly && tier !== "wifi") {
        skipped++;
        continue;
      }

      // Respect concurrency limit
      if (processingCount >= maxConcurrency) {
        // Wait for one to finish before continuing
        if (batch.length > 0) {
          await Promise.race(batch);
        }
      }

      const promise = processOneUpload(item, tier)
        .then((success) => {
          if (success) uploaded++;
          else failed++;
        })
        .catch(() => {
          failed++;
        });

      batch.push(promise);

      // Cellular delay between dispatches
      if (tier === "cellular") {
        await new Promise((r) => setTimeout(r, CELLULAR_DELAY_MS));
      }
    }

    // Wait for all remaining
    await Promise.allSettled(batch);

    return { uploaded, skipped, failed };
  } finally {
    isProcessing = false;
  }
}

async function processOneUpload(item: MediaUploadRow, tier: NetworkTier): Promise<boolean> {
  const db = await getDb();
  processingCount++;

  try {
    // Mark as uploading
    await db.runAsync(`UPDATE media_uploads SET status = 'UPLOADING' WHERE id = ?`, [item.id]);
    await markOutboxProcessing(item.outboxId);

    // Check file still exists
    const info = await FileSystem.getInfoAsync(item.fileUri);
    if (!info.exists) {
      throw new Error(`File not found: ${item.fileUri}`);
    }

    // Build FormData
    const form = new FormData();
    form.append("file", {
      uri: item.fileUri,
      name: item.fileName,
      type: item.mimeType,
    } as any);
    form.append("quality", tier);
    form.append("mediaType", item.mediaType);

    // Upload — resolve the log ID from the outbox payload
    const outboxRow = await db.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM outbox WHERE id = ?`,
      [item.outboxId],
    );

    if (!outboxRow) throw new Error("Outbox entry not found");

    const payload = JSON.parse(outboxRow.payload);
    let logId = payload.logId;

    // If logId is not available yet (local log), try to resolve it
    if (!logId && payload.localLogId) {
      const mapped = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM kv WHERE key = ?`,
        [`dailyLog.map:${payload.localLogId}`],
      );
      logId = mapped?.value;
    }

    if (!logId) {
      throw new Error("Attachment waiting for daily log creation");
    }

    // Perform the upload
    const res = await apiFetch(
      `/daily-logs/${encodeURIComponent(logId)}/attachments`,
      {
        method: "POST",
        body: form as any,
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed: ${res.status} ${text || res.statusText}`);
    }

    // Mark complete
    await db.runAsync(
      `UPDATE media_uploads SET status = 'DONE', bytesUploaded = bytesTotal WHERE id = ?`,
      [item.id],
    );
    await markOutboxDone(item.outboxId);

    console.log(`[mediaQueue] Uploaded ${item.fileName} (${item.mediaType}, ${tier})`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.runAsync(`UPDATE media_uploads SET status = 'ERROR' WHERE id = ?`, [item.id]);
    await markOutboxError(item.outboxId, err);
    console.log(`[mediaQueue] Failed ${item.fileName}: ${msg}`);
    return false;
  } finally {
    processingCount--;
  }
}

// ---------------------------------------------------------------------------
// Progress queries (for UI)
// ---------------------------------------------------------------------------

/**
 * Get all pending/uploading media items (for queue status display).
 */
export async function getMediaQueueStatus(): Promise<{
  queued: number;
  uploading: number;
  total: number;
  wifiWaiting: number;
}> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: string; wifiOnly: number; c: number }>(
    `SELECT status, wifiOnly, COUNT(1) as c FROM media_uploads WHERE status IN ('QUEUED', 'UPLOADING') GROUP BY status, wifiOnly`,
  );

  let queued = 0;
  let uploading = 0;
  let wifiWaiting = 0;

  for (const row of rows || []) {
    if (row.status === "QUEUED") {
      queued += row.c;
      if (row.wifiOnly) wifiWaiting += row.c;
    } else if (row.status === "UPLOADING") {
      uploading += row.c;
    }
  }

  return { queued, uploading, total: queued + uploading, wifiWaiting };
}

/**
 * Get recent media upload history.
 */
export async function getMediaUploadHistory(limit = 50): Promise<MediaUploadRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MediaUploadRow>(
    `SELECT * FROM media_uploads ORDER BY createdAt DESC LIMIT ?`,
    [limit],
  );
  return rows || [];
}
