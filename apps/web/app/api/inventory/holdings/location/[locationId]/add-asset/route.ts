import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  const authHeader = req.headers.get('authorization') ?? undefined;
  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${API_BASE}/inventory/holdings/location/${locationId}/add-asset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }

  return NextResponse.json(json, { status: 200 });
}