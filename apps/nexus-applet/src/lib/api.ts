import { getStoredToken, getApiUrl } from "./auth";

export interface PersonalContact {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;       // Primary email (for invites)
  phone: string | null;       // Primary phone (for invites)
  allEmails: string[] | null; // All emails from device
  allPhones: string[] | null; // All phones from device
  source: string;
}

export interface ImportContactInput {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  allEmails?: string[] | null;
  allPhones?: string[] | null;
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
  const url = `${apiUrl}${endpoint}`;

  console.log(`[API] ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      console.error(`[API] Error ${response.status}:`, error);
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`[API] Response:`, data);
    return data;
  } catch (err) {
    console.error(`[API] Fetch error:`, err);
    throw err;
  }
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

export async function updatePrimaryContact(
  contactId: string,
  primaryEmail?: string | null,
  primaryPhone?: string | null
): Promise<PersonalContact> {
  return apiFetch(`/personal-contacts/${contactId}/primary`, {
    method: "PATCH",
    body: JSON.stringify({ email: primaryEmail, phone: primaryPhone }),
  });
}
