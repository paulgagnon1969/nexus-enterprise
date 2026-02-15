import { apiJson } from "./client";
import type { Contact, ContactCategory } from "../types/api";

/**
 * Fetch contacts for the current company.
 * Optionally filter by category.
 */
export async function fetchContacts(options?: {
  category?: ContactCategory;
  search?: string;
}): Promise<Contact[]> {
  const params = new URLSearchParams();

  if (options?.category) {
    params.set("category", options.category);
  }
  if (options?.search) {
    params.set("search", options.search);
  }

  const query = params.toString();
  const path = query ? `/contacts?${query}` : "/contacts";

  return apiJson<Contact[]>(path);
}

/**
 * Fetch a single contact by ID.
 */
export async function fetchContact(contactId: string): Promise<Contact> {
  return apiJson<Contact>(`/contacts/${encodeURIComponent(contactId)}`);
}
