import * as SecureStore from "expo-secure-store";
import type { AuthTokens, SyncCredentials } from "../types/api";

const ACCESS_TOKEN_KEY = "nexus.accessToken";
const REFRESH_TOKEN_KEY = "nexus.refreshToken";
const SYNC_USER_TOKEN_KEY = "nexus.sync.userToken";
const SYNC_COMPANY_TOKEN_KEY = "nexus.sync.companyToken";

export async function getTokens(): Promise<AuthTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function setTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

// --- Sync credentials (permanent DeviceSync tokens) ---

export async function getSyncCredentials(): Promise<SyncCredentials | null> {
  const [userToken, companyToken] = await Promise.all([
    SecureStore.getItemAsync(SYNC_USER_TOKEN_KEY),
    SecureStore.getItemAsync(SYNC_COMPANY_TOKEN_KEY),
  ]);

  if (!userToken || !companyToken) return null;
  return { userToken, companyToken };
}

export async function setSyncCredentials(creds: SyncCredentials): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(SYNC_USER_TOKEN_KEY, creds.userToken),
    SecureStore.setItemAsync(SYNC_COMPANY_TOKEN_KEY, creds.companyToken),
  ]);
}

export async function clearSyncCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SYNC_USER_TOKEN_KEY),
    SecureStore.deleteItemAsync(SYNC_COMPANY_TOKEN_KEY),
  ]);
}

/**
 * Clear all auth data (JWT tokens + sync credentials).
 * Call this on logout.
 */
export async function clearAllAuth(): Promise<void> {
  await Promise.all([
    clearTokens(),
    clearSyncCredentials(),
  ]);
}
