import * as crypto from "node:crypto";

/**
 * Nex-Plac QR Placard — HMAC-SHA256 signing & verification.
 *
 * Payload format: nexplac://a/<assetId>?co=<companyId>&sig=<signature>
 * Signature = base64url(HMAC-SHA256(assetId|companyId, secret))[0..22]
 *
 * Set NEXPLAC_HMAC_SECRET in the environment to a strong random value.
 */

const PAYLOAD_PREFIX = "nexplac://a/";

function getSecret(): string {
  const secret = process.env.NEXPLAC_HMAC_SECRET;
  if (!secret) throw new Error("NEXPLAC_HMAC_SECRET is not configured");
  return secret;
}

/** Create a truncated base64url HMAC-SHA256 signature (22 chars ≈ 128 bits). */
export function signPlacard(assetId: string, companyId: string): string {
  const message = `${assetId}|${companyId}`;
  const hmac = crypto.createHmac("sha256", getSecret()).update(message).digest();
  // base64url, then truncate to 22 chars (≈ 128-bit security)
  return hmac.toString("base64url").slice(0, 22);
}

/** Build the full QR payload URI. */
export function buildPlacardPayload(assetId: string, companyId: string): string {
  const sig = signPlacard(assetId, companyId);
  return `${PAYLOAD_PREFIX}${assetId}?co=${companyId}&sig=${sig}`;
}

/** Parse a nexplac:// URI and return its components, or null if malformed. */
export function parsePlacardPayload(
  payload: string,
): { assetId: string; companyId: string; sig: string } | null {
  if (!payload.startsWith(PAYLOAD_PREFIX)) return null;
  try {
    const afterPrefix = payload.slice(PAYLOAD_PREFIX.length);
    const qIdx = afterPrefix.indexOf("?");
    if (qIdx < 1) return null;

    const assetId = afterPrefix.slice(0, qIdx);
    const params = new URLSearchParams(afterPrefix.slice(qIdx + 1));
    const companyId = params.get("co");
    const sig = params.get("sig");

    if (!assetId || !companyId || !sig) return null;
    return { assetId, companyId, sig };
  } catch {
    return null;
  }
}

/**
 * Verify the HMAC signature in a parsed placard payload.
 * Returns true when the signature matches the computed HMAC.
 */
export function verifyPlacardSignature(
  assetId: string,
  companyId: string,
  sig: string,
): boolean {
  const expected = signPlacard(assetId, companyId);
  // Constant-time comparison
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
