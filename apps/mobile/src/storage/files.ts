import * as FileSystem from "expo-file-system";

export interface StoredFile {
  uri: string;
  name: string;
  mimeType: string;
}

function safeExtFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/heic") return "heic";
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

  const documentDir = (FileSystem as any).Paths?.document?.uri as string | undefined;
  if (!documentDir) {
    throw new Error("Missing FileSystem.Paths.document.uri");
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
