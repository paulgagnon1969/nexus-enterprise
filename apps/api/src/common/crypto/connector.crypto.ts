import * as crypto from "node:crypto";

/**
 * Encrypt / decrypt IMAP passwords for EmailReceiptConnector records.
 *
 * Uses AES-256-GCM (same scheme as portfolio-hr.crypto.ts).
 * Set CONNECTOR_ENCRYPTION_KEY in your env to a strong secret.
 * We derive a 32-byte key via SHA-256 so ops can provide any-length secret.
 *
 * Wire format: iv (12 bytes) + authTag (16 bytes) + ciphertext
 */

function getKey(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY || "change-me-connector-key";
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt a plaintext string → Buffer suitable for Prisma `Bytes` column. */
export function encryptConnectorPassword(plaintext: string): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Layout: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]);
}

/** Decrypt a Buffer (from Prisma `Bytes` column) → plaintext string. */
export function decryptConnectorPassword(encrypted: Buffer): string {
  const key = getKey();

  if (!encrypted || encrypted.length < 12 + 16) {
    throw new Error("Invalid encrypted connector password payload");
  }

  const iv = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
