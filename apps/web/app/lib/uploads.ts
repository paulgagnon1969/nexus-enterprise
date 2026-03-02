export type UploadedImageLink = { url: string; label: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function extractImageFilesFromClipboard(
  clipboard: DataTransfer | null | undefined,
): File[] {
  if (!clipboard) return [];
  const items = clipboard.items;
  if (!items || items.length === 0) return [];
  const files: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export async function uploadImageFileToNexusUploads(
  file: File,
  scope: "MESSAGE" | "JOURNAL" | "NTT" | "BILL" | "OTHER" = "MESSAGE",
): Promise<UploadedImageLink> {
  if (typeof window === "undefined") {
    throw new Error("Window is not available");
  }
  const token = window.localStorage.getItem("accessToken");
  if (!token) {
    throw new Error("Missing access token; please log in again.");
  }

  // Direct multipart upload — the API stores the file in object storage
  // server-side. This works for both GCS and MinIO without CORS / presigned
  // URL issues.
  const form = new FormData();
  form.append("file", file, file.name || "upload");
  form.append("scope", scope);

  const res = await fetch(`${API_BASE}/uploads/file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `Upload failed (${res.status})`);
  }

  const data: any = await res.json();
  const publicUrl: string | undefined = data.publicUrl || data.fileUri;
  if (!publicUrl) {
    throw new Error("Upload response was incomplete");
  }

  const label = file.name && file.name.trim().length > 0 ? file.name : "Screenshot";
  return { url: publicUrl, label };
}
