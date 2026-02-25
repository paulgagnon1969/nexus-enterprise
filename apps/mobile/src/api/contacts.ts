import { apiJson } from "./client";
import type { Contact, ContactCategory } from "../types/api";

/**
 * Fetch unified contacts directory (NCC org + personal).
 */
export async function fetchContacts(options?: {
  category?: ContactCategory;
  search?: string;
  includePersonal?: boolean;
}): Promise<Contact[]> {
  const params = new URLSearchParams();

  if (options?.category) {
    params.set("category", options.category);
  }
  if (options?.search) {
    params.set("search", options.search);
  }
  if (options?.includePersonal !== undefined) {
    params.set("includePersonal", String(options.includePersonal));
  }

  const query = params.toString();
  const path = query ? `/contacts/directory?${query}` : "/contacts/directory";

  return apiJson<Contact[]>(path);
}

/**
 * Fetch a single contact by ID.
 */
export async function fetchContact(contactId: string): Promise<Contact> {
  return apiJson<Contact>(`/personal-contacts/${encodeURIComponent(contactId)}`);
}
