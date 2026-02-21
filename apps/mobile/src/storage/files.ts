import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "../offline/db";

export interface StoredFile {
  uri: string;
  name: string;
  mimeType: string;
}

function safeExtFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/x-m4v") return "m4v";
  return "bin";
}

export async function copyToAppStorage(opts: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): Promise<StoredFile> {
  const srcUri = opts.uri;
  const mimeType = opts.mimeType || "application/octet-stream";

  const ext = safeExtFromMime(mimeType);
  const baseName =
    (opts.name && opts.name.trim()) ||
    `attachment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Use FileSystem.documentDirectory (the standard API)
  const documentDir = FileSystem.documentDirectory;
  if (!documentDir) {
    throw new Error("FileSystem.documentDirectory is not available");
  }

  const dir = `${documentDir}attachments/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const destUri = `${dir}${baseName}`;

  // If the uri is already in our document directory, just return it.
  if (srcUri.startsWith(documentDir)) {
    return { uri: srcUri, name: baseName, mimeType };
  }

  await FileSystem.copyAsync({ from: srcUri, to: destUri });

  return { uri: destUri, name: baseName, mimeType };
}

/**
 * Delete attachment files that are no longer referenced by any pending
 * outbox or media_uploads entry and are older than `maxAgeDays`.
 */
export async function cleanupOrphanedAttachments(maxAgeDays = 7): Promise<number> {
  const documentDir = FileSystem.documentDirectory;
  if (!documentDir) return 0;

  const dir = `${documentDir}attachments/`;

  let files: string[];
  try {
    files = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return 0; // Directory doesn't exist yet
  }

  if (files.length === 0) return 0;

  // Get all file URIs still referenced by pending outbox/media_uploads
  const db = await getDb();
  const pendingOutbox = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM outbox WHERE status IN ('PENDING', 'PROCESSING', 'ERROR')`,
  );
  const pendingMedia = await db.getAllAsync<{ fileUri: string }>(
    `SELECT fileUri FROM media_uploads WHERE status IN ('QUEUED', 'UPLOADING', 'ERROR')`,
  );

  const referencedUris = new Set<string>();

  // Extract fileUri from outbox payloads
  for (const row of pendingOutbox || []) {
    try {
      const p = JSON.parse(row.payload);
      if (p.fileUri) referencedUris.add(p.fileUri);
    } catch { /* ignore */ }
  }

  // Add media upload file URIs
  for (const row of pendingMedia || []) {
    referencedUris.add(row.fileUri);
  }

  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const fileName of files) {
    const fileUri = `${dir}${fileName}`;

    // Skip if still referenced
    if (referencedUris.has(fileUri)) continue;

    // Check file age
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && "modificationTime" in info) {
        const modMs = ((info as any).modificationTime ?? 0) * 1000;
        if (modMs > cutoffMs) continue; // Too new to delete
      }
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      deleted++;
    } catch {
      // Skip files we can't inspect/delete
    }
  }

  if (deleted > 0) {
    console.log(`[files] Cleaned up ${deleted} orphaned attachment(s)`);
  }

  return deleted;
}
