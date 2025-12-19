import * as crypto from "node:crypto";

// NOTE: For production, set PORTFOLIO_HR_ENCRYPTION_KEY to a strong secret.
// We derive a 32-byte key via SHA-256 so ops can provide any-length secret.
function getKey(): Buffer {
  const raw = process.env.PORTFOLIO_HR_ENCRYPTION_KEY || "change-me-portfolio-hr";
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function encryptPortfolioHrJson(payload: unknown): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(12); // recommended IV size for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload ?? {}), "utf8");

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Layout: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptPortfolioHrJson(encrypted: Buffer): any {
  const key = getKey();

  if (!encrypted || encrypted.length < 12 + 16) {
    throw new Error("Invalid encrypted payload");
  }

  const iv = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const text = plaintext.toString("utf8");

  try {
    return JSON.parse(text);
  } catch {
    // If the payload can't be parsed, treat it as empty.
    return {};
  }
}
