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
  scope: "MESSAGE" | "JOURNAL" | "NTT" | "OTHER" = "MESSAGE",
): Promise<UploadedImageLink> {
  if (typeof window === "undefined") {
    throw new Error("Window is not available");
  }
  const token = window.localStorage.getItem("accessToken");
  if (!token) {
    throw new Error("Missing access token; please log in again.");
  }

  const metaRes = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contentType: file.type || "image/png",
      fileName: file.name || "screenshot.png",
      scope,
    }),
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to prepare upload (${metaRes.status})`);
  }

  const meta: any = await metaRes.json();
  const uploadUrl: string | undefined = meta.uploadUrl;
  const publicUrl: string | undefined = meta.publicUrl || meta.fileUri;
  if (!uploadUrl || !publicUrl) {
    throw new Error("Upload metadata was incomplete");
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Failed to upload image (${putRes.status})`);
  }

  const label = file.name && file.name.trim().length > 0 ? file.name : "Screenshot";
  return { url: publicUrl, label };
}
