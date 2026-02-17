import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

function getAuthHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  
  // Forward Authorization header if present
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  
  // Forward cookies for session-based auth
  const cookies = req.headers.get("cookie");
  if (cookies) {
    headers["Cookie"] = cookies;
  }
  
  return headers;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${API_BASE}/suppliers${searchParams ? `?${searchParams}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(req),
  });

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${API_BASE}/suppliers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(req),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
