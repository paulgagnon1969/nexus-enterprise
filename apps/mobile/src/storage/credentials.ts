import * as SecureStore from "expo-secure-store";

const CRED_EMAIL_KEY = "nexus_saved_email";
const CRED_PASSWORD_KEY = "nexus_saved_password";
const BIOMETRIC_ENABLED_KEY = "nexus_biometric_enabled";

export interface SavedCredentials {
  email: string;
  password: string;
}

/**
 * Save login credentials securely
 */
export async function saveCredentials(creds: SavedCredentials): Promise<void> {
  await SecureStore.setItemAsync(CRED_EMAIL_KEY, creds.email);
  await SecureStore.setItemAsync(CRED_PASSWORD_KEY, creds.password);
}

/**
 * Get saved credentials (if any)
 */
export async function getCredentials(): Promise<SavedCredentials | null> {
  const email = await SecureStore.getItemAsync(CRED_EMAIL_KEY);
  const password = await SecureStore.getItemAsync(CRED_PASSWORD_KEY);

  if (!email || !password) return null;
  return { email, password };
}

/**
 * Clear saved credentials
 */
export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CRED_EMAIL_KEY);
  await SecureStore.deleteItemAsync(CRED_PASSWORD_KEY);
}

/**
 * Check if biometric login is enabled
 */
export async function isBiometricEnabled(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return val === "true";
}

/**
 * Enable or disable biometric login
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
}
