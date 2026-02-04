import { getStoredToken, getApiUrl } from "./auth";

export interface PersonalContact {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
}

export interface ImportContactInput {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source: "MACOS" | "WINDOWS" | "IOS" | "ANDROID" | "UPLOAD";
}

export interface ImportResult {
  count: number;
  createdCount: number;
  updatedCount: number;
  contacts: PersonalContact[];
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const apiUrl = getApiUrl();

  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: any }> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function importContacts(
  contacts: ImportContactInput[]
): Promise<ImportResult> {
  return apiFetch("/personal-contacts/import", {
    method: "POST",
    body: JSON.stringify({ contacts }),
  });
}

export async function listContacts(
  search?: string,
  limit = 200
): Promise<PersonalContact[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  return apiFetch(`/personal-contacts?${params.toString()}`);
}
