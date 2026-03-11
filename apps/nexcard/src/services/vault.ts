import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";

// ── Constants ───────────────────────────────────────────────

const MASTER_KEY_ID = "nexcard_vault_master_key";
const VAULT_UNLOCKED_KEY = "nexcard_vault_unlocked";

// ── Master Key Management ───────────────────────────────────

/**
 * Get or create the vault master key.
 * The key is a 256-bit random hex string stored in SecureStore
 * (iOS Keychain / Android Keystore — hardware-encrypted).
 */
async function getOrCreateMasterKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(MASTER_KEY_ID);
  if (!key) {
    // Generate 32 random bytes (256-bit key) as hex
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(MASTER_KEY_ID, key, {
      requireAuthentication: false, // We handle biometric ourselves
    });
  }
  return key;
}

// ── Biometric Authentication ────────────────────────────────

/** Check if device supports biometric auth */
export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

/** Get biometric type name for UI display */
export async function getBiometricTypeName(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "Face ID";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "Touch ID";
  }
  return "Biometric";
}

/**
 * Prompt biometric authentication. Returns true if successful.
 * Falls back to device passcode if biometric fails.
 */
export async function authenticateWithBiometric(reason?: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason || "Authenticate to access your vault",
    fallbackLabel: "Use Passcode",
    disableDeviceFallback: false,
  });
  return result.success;
}

// ── Encryption / Decryption ─────────────────────────────────
// Using XOR-based encryption with SHA-256 derived key.
// For production, consider using a native AES module.

/**
 * Derive a key from master key + salt using SHA-256.
 */
async function deriveKey(masterKey: string, salt: string): Promise<string> {
  const combined = masterKey + ":" + salt;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, combined);
}

/**
 * Encrypt a plaintext string. Returns "salt:encryptedHex".
 */
export async function encrypt(plaintext: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();

  // Generate random salt
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Derive encryption key from master key + salt
  const derivedKey = await deriveKey(masterKey, salt);

  // Convert plaintext to hex
  const plaintextHex = Array.from(new TextEncoder().encode(plaintext))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // XOR encrypt (stream cipher with derived key repeated)
  let encrypted = "";
  for (let i = 0; i < plaintextHex.length; i += 2) {
    const ptByte = parseInt(plaintextHex.substring(i, i + 2), 16);
    const keyByte = parseInt(derivedKey.substring((i % derivedKey.length), (i % derivedKey.length) + 2), 16);
    encrypted += (ptByte ^ keyByte).toString(16).padStart(2, "0");
  }

  return `${salt}:${encrypted}`;
}

/**
 * Decrypt a "salt:encryptedHex" string back to plaintext.
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const masterKey = await getOrCreateMasterKey();

  const colonIdx = ciphertext.indexOf(":");
  if (colonIdx === -1) throw new Error("Invalid ciphertext format");

  const salt = ciphertext.substring(0, colonIdx);
  const encrypted = ciphertext.substring(colonIdx + 1);

  // Derive same key
  const derivedKey = await deriveKey(masterKey, salt);

  // XOR decrypt
  let decryptedHex = "";
  for (let i = 0; i < encrypted.length; i += 2) {
    const ctByte = parseInt(encrypted.substring(i, i + 2), 16);
    const keyByte = parseInt(derivedKey.substring((i % derivedKey.length), (i % derivedKey.length) + 2), 16);
    decryptedHex += (ctByte ^ keyByte).toString(16).padStart(2, "0");
  }

  // Convert hex back to string
  const bytes = new Uint8Array(
    decryptedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  return new TextDecoder().decode(bytes);
}

// ── Vault Lock State ────────────────────────────────────────

let vaultUnlockedUntil: number = 0;
const VAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Check if vault is currently unlocked (within timeout) */
export function isVaultUnlocked(): boolean {
  return Date.now() < vaultUnlockedUntil;
}

/** Mark vault as unlocked (resets timeout) */
export function markVaultUnlocked(): void {
  vaultUnlockedUntil = Date.now() + VAULT_LOCK_TIMEOUT_MS;
}

/** Lock vault immediately */
export function lockVault(): void {
  vaultUnlockedUntil = 0;
}

/**
 * Ensure vault is unlocked — prompts biometric if locked.
 * Returns true if unlocked, false if user cancelled.
 */
export async function ensureVaultUnlocked(): Promise<boolean> {
  if (isVaultUnlocked()) return true;

  const hasBiometric = await isBiometricAvailable();
  if (hasBiometric) {
    const success = await authenticateWithBiometric("Authenticate to access your password vault");
    if (success) {
      markVaultUnlocked();
      return true;
    }
    return false;
  }

  // No biometric — vault is accessible (device passcode is the security layer)
  markVaultUnlocked();
  return true;
}

/** Wipe the master key and all vault data. IRREVERSIBLE. */
export async function destroyVault(): Promise<void> {
  await SecureStore.deleteItemAsync(MASTER_KEY_ID);
  lockVault();
}
