import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const tokenField = form.get("accessToken");
    const accessToken =
      typeof tokenField === "string" ? tokenField : tokenField instanceof File ? await tokenField.text() : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file field in form-data" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use OS tmp dir (or NCC_UPLOAD_TMP_DIR) so this works on read-only /var/task
    const baseTmpDir = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
    const uploadDir = path.join(baseTmpDir, "ncc_uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(
      uploadDir,
      `${projectId}-${Date.now()}-${safeName}`,
    );

    // Keep writing to disk so local-dev (shared FS) can still use csvPath
    await fs.writeFile(filePath, buffer);

    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    const authHeaderFromReq = req.headers.get("authorization") ?? undefined;
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : authHeaderFromReq;

    const isLocalApi = /localhost|127\.0\.0\.1/.test(apiBase);

    if (isLocalApi) {
      // Local dev: enqueue an async import job that reads from the shared
      // filesystem on the same host as the API/worker.
      const endpoint = `${apiBase}/projects/${projectId}/import-jobs/xact-components`;
      const payload = { csvPath: filePath };

      const apiRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await apiRes.json().catch(() => ({}));

      if (!apiRes.ok) {
        return NextResponse.json(
          { error: "API components import failed", detail: json },
          { status: apiRes.status },
        );
      }

      return NextResponse.json(json, { status: 200 });
    }

    // Cloud / remote API path: use GCS signed uploads and URI-based ImportJob.
    // 1) Ask the API for a signed upload URL in the configured XACT uploads bucket.
    const uploadMetaRes = await fetch(
      `${apiBase}/projects/${projectId}/xact-components/upload-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ contentType: file.type || "text/csv" }),
      },
    );

    const uploadMeta = await uploadMetaRes.json().catch(() => ({} as any));

    if (!uploadMetaRes.ok) {
      return NextResponse.json(
        { error: "Failed to create components upload URL", detail: uploadMeta },
        { status: uploadMetaRes.status },
      );
    }

    const { uploadUrl, fileUri } = uploadMeta as {
      uploadUrl?: string;
      fileUri?: string;
    };

    if (!uploadUrl || !fileUri) {
      return NextResponse.json(
        { error: "Components upload URL response missing uploadUrl or fileUri" },
        { status: 500 },
      );
    }

    // 2) Upload the CSV to storage using the signed URL.
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "text/csv",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Components upload to storage failed", detail: text || undefined },
        { status: uploadRes.status },
      );
    }

    // 3) Ask the API to create an XACT_COMPONENTS ImportJob from the storage URI.
    const importRes = await fetch(
      `${apiBase}/projects/${projectId}/import-xact-components-from-uri`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ fileUri }),
      },
    );

    const importJson = await importRes.json().catch(() => ({}));

    if (!importRes.ok) {
      return NextResponse.json(
        { error: "API components import failed", detail: importJson },
        { status: importRes.status },
      );
    }

    return NextResponse.json(importJson, { status: 200 });
  } catch (err: any) {
    console.error("Error in import-xact-components route", err);
    return NextResponse.json(
      {
        error: "Internal error in components import route",
        detail: err?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}
