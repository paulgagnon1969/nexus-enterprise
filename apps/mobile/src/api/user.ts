import { apiJson } from "./client";
import type { UserMeResponse } from "../types/api";

export async function getUserMe(): Promise<UserMeResponse> {
  return apiJson<UserMeResponse>("/users/me");
}

// Lightweight helper to fetch the currently-selected company context.
export async function getUserCompanyMe(): Promise<{ id: string; name?: string | null } | null> {
  try {
    const json = await apiJson<any>("/companies/me");
    if (!json || !json.id) return null;
    return { id: String(json.id), name: json.name ?? null };
  } catch {
    return null;
  }
}
