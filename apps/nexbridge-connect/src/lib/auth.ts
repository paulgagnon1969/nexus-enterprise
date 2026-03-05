import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "nexbridge-auth.json";

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  apiUrl: string;
  userEmail: string;
  companyName: string;
}

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_PATH);
  }
  return storeInstance;
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  const store = await getStore();
  await store.set("auth", auth);
  await store.save();
}

export async function loadAuth(): Promise<StoredAuth | null> {
  const store = await getStore();
  const auth = await store.get<StoredAuth>("auth");
  return auth ?? null;
}

export async function clearAuth(): Promise<void> {
  const store = await getStore();
  await store.delete("auth");
  await store.save();
  storeInstance = null;
}

// In-memory cache so synchronous callers (contacts/documents) can access credentials
let cachedToken: string | null = null;
let cachedApiUrl: string | null = null;

export function getCachedToken(): string | null {
  return cachedToken;
}

export function getCachedApiUrl(): string {
  return cachedApiUrl || "https://staging-api.nfsgrp.com";
}

export function setCachedCredentials(token: string, apiUrl: string): void {
  cachedToken = token;
  cachedApiUrl = apiUrl;
}

export function clearCachedCredentials(): void {
  cachedToken = null;
  cachedApiUrl = null;
}
