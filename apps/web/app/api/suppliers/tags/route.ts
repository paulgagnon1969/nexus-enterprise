import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? undefined;
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${API_BASE}/suppliers/tags${searchParams ? `?${searchParams}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? undefined;
  const body = await req.json();

  const res = await fetch(`${API_BASE}/suppliers/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
