import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = params.projectId;

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

    const uploadDir = path.join(process.cwd(), "tmp_uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(
      uploadDir,
      `${projectId}-${Date.now()}-${safeName}`,
    );

    await fs.writeFile(filePath, buffer);

    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    const authHeaderFromReq = req.headers.get("authorization") ?? undefined;
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : authHeaderFromReq;

    const isLocalApi = /localhost|127\.0\.0\.1/.test(apiBase);

    const endpoint = isLocalApi
      ? `${apiBase}/projects/${projectId}/import-jobs/xact-components`
      : `${apiBase}/projects/${projectId}/import-xact-components`;

    const payload = isLocalApi ? { csvPath: filePath } : { csvPath: filePath };

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
