import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; bidRequestId: string }> }
) {
  const { projectId, bidRequestId } = await context.params;
  const authHeader = req.headers.get("authorization") ?? undefined;

  const res = await fetch(
    `${API_BASE}/projects/${projectId}/bid-requests/${bidRequestId}`,
    {
      method: "GET",
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    }
  );

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; bidRequestId: string }> }
) {
  const { projectId, bidRequestId } = await context.params;
  const authHeader = req.headers.get("authorization") ?? undefined;
  const body = await req.json();

  const res = await fetch(
    `${API_BASE}/projects/${projectId}/bid-requests/${bidRequestId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    }
  );

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; bidRequestId: string }> }
) {
  const { projectId, bidRequestId } = await context.params;
  const authHeader = req.headers.get("authorization") ?? undefined;

  const res = await fetch(
    `${API_BASE}/projects/${projectId}/bid-requests/${bidRequestId}`,
    {
      method: "DELETE",
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    }
  );

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
