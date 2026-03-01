/**
 * NexFetch — Project Matcher (Three-Signal Scoring)
 *
 * Scores each parsed receipt against active projects to determine the
 * best match.  Three independent signals are combined:
 *
 *   Signal 1 — PO/Job Name  (0–0.50)  fuzzy match vs project.name / externalId
 *   Signal 2 — Geo-Proximity (0–0.30)  store address vs project lat/lng
 *   Signal 3 — Historical    (0–0.20)  previous store→project assignments
 *
 * Thresholds:
 *   ≥ 0.95  →  auto-assign  (ASSIGNED)
 *   0.50–0.94  →  suggest    (MATCHED)
 *   < 0.50  →  no match     (UNASSIGNED)
 */

import { PrismaClient, EmailReceiptStatus } from "@prisma/client";
import type { ParsedReceipt } from "./parsers/types";

// ── Types ────────────────────────────────────────────────────────────

export interface MatchResult {
  projectId: string | null;
  projectName: string | null;
  confidence: number;
  status: EmailReceiptStatus;
  reason: string;
  signals: {
    poJobName: number;
    geoProximity: number;
    historical: number;
  };
}

interface ProjectCandidate {
  id: string;
  name: string;
  externalId: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
}

// ── Jaro-Winkler similarity (inline — no external dep) ──────────────

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ── Haversine distance (miles) ───────────────────────────────────────

function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ── Normalization ────────────────────────────────────────────────────

const ABBREVIATIONS: Record<string, string> = {
  st: "street", ave: "avenue", blvd: "boulevard", dr: "drive",
  ln: "lane", rd: "road", ct: "court", pl: "place",
  res: "restoration", reno: "renovation", rehab: "rehabilitation",
  bldg: "building", apt: "apartment", ste: "suite",
  ctr: "center", hw: "highway", hwy: "highway",
};

function normalize(s: string): string {
  let n = s.toLowerCase().trim();
  // Strip special chars
  n = n.replace(/[^a-z0-9\s]/g, " ");
  // Collapse whitespace
  n = n.replace(/\s+/g, " ").trim();
  // Expand abbreviations
  n = n
    .split(" ")
    .map((w) => ABBREVIATIONS[w] || w)
    .join(" ");
  return n;
}

// ── Store geocode cache ──────────────────────────────────────────────
// In production, this would be backed by a DB table or Google Geocoding API.
// For the import script, we cache by store number to avoid re-geocoding.

const storeGeoCache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Simple geocode stub for store addresses.
 * For the initial import, we skip geocoding and rely on PO/Job Name +
 * historical matching.  When we integrate Google Geocoding API, this
 * function will be replaced.
 */
async function geocodeStoreAddress(
  _address: string,
  _city: string | null,
  _state: string | null,
  _zip: string | null,
): Promise<{ lat: number; lng: number } | null> {
  // TODO: Integrate Google Geocoding API here
  // For now, return null (skip geo signal)
  return null;
}

// ── Matcher ──────────────────────────────────────────────────────────

const PERSONAL_KEYWORDS = ["personal", "none", "n/a", "na", "home", "self"];

export async function matchReceiptToProject(
  receipt: ParsedReceipt,
  companyId: string,
  prisma: PrismaClient,
): Promise<MatchResult> {
  const poJobName = receipt.loyalty?.poJobName || null;
  const storeNumber = receipt.store.storeNumber || null;

  // ── Check for "personal" tag ────────────────────────────
  if (poJobName && PERSONAL_KEYWORDS.includes(normalize(poJobName))) {
    return {
      projectId: null,
      projectName: null,
      confidence: 0,
      status: EmailReceiptStatus.UNASSIGNED,
      reason: `PO/Job Name "${poJobName}" flagged as personal expense`,
      signals: { poJobName: 0, geoProximity: 0, historical: 0 },
    };
  }

  // ── Load active projects ────────────────────────────────
  const projects: ProjectCandidate[] = await prisma.project.findMany({
    where: { companyId, status: "active" },
    select: {
      id: true,
      name: true,
      externalId: true,
      latitude: true,
      longitude: true,
      city: true,
      state: true,
    },
  });

  if (projects.length === 0) {
    return {
      projectId: null,
      projectName: null,
      confidence: 0,
      status: EmailReceiptStatus.UNASSIGNED,
      reason: "No active projects found",
      signals: { poJobName: 0, geoProximity: 0, historical: 0 },
    };
  }

  // ── Signal 1: PO/Job Name fuzzy match (0–0.50) ─────────
  const poScores = new Map<string, { score: number; reason: string }>();

  if (poJobName) {
    const normalizedPo = normalize(poJobName);

    for (const proj of projects) {
      const normalizedName = normalize(proj.name);

      // Exact match
      if (normalizedPo === normalizedName) {
        poScores.set(proj.id, { score: 0.50, reason: `PO/Job "${poJobName}" exact match` });
        continue;
      }

      // Check externalId
      if (proj.externalId && normalize(proj.externalId) === normalizedPo) {
        poScores.set(proj.id, { score: 0.50, reason: `PO/Job "${poJobName}" matches claim ID` });
        continue;
      }

      // Fuzzy match
      const similarity = jaroWinkler(normalizedPo, normalizedName);
      if (similarity >= 0.85) {
        const score = 0.30 + (similarity - 0.85) * (0.20 / 0.15); // Scale 0.85–1.0 → 0.30–0.50
        poScores.set(proj.id, {
          score: Math.min(score, 0.45), // Cap at 0.45 for fuzzy (not exact)
          reason: `PO/Job "${poJobName}" fuzzy match "${proj.name}" (${Math.round(similarity * 100)}%)`,
        });
      }
    }
  }

  // ── Signal 2: Geo-Proximity (0–0.30) ───────────────────
  const geoScores = new Map<string, { score: number; distance: number }>();

  if (storeNumber && receipt.store.city && receipt.store.state) {
    const cacheKey = `${receipt.vendor}-${storeNumber}`;
    let storeLoc = storeGeoCache.get(cacheKey);

    if (storeLoc === undefined) {
      storeLoc = await geocodeStoreAddress(
        receipt.store.address || "",
        receipt.store.city,
        receipt.store.state,
        receipt.store.zip,
      );
      storeGeoCache.set(cacheKey, storeLoc);
    }

    if (storeLoc) {
      for (const proj of projects) {
        if (proj.latitude == null || proj.longitude == null) continue;

        const dist = haversineDistanceMiles(
          storeLoc.lat, storeLoc.lng,
          proj.latitude, proj.longitude,
        );

        let score = 0;
        if (dist < 5) score = 0.30;
        else if (dist < 15) score = 0.20;
        else if (dist < 30) score = 0.10;

        if (score > 0) {
          geoScores.set(proj.id, { score, distance: Math.round(dist * 10) / 10 });
        }
      }
    }
  }

  // ── Signal 3: Historical Pattern (0–0.20) ──────────────
  const histScores = new Map<string, { score: number; count: number }>();

  if (storeNumber) {
    // Find previous receipts from the same store that were ASSIGNED
    const previous = await prisma.emailReceipt.findMany({
      where: {
        companyId,
        status: EmailReceiptStatus.ASSIGNED,
        projectId: { not: null },
        // Match on matchReason containing the store number
        matchReason: { contains: storeNumber },
      },
      select: { projectId: true },
      take: 50,
    });

    // Count assignments per project
    const counts = new Map<string, number>();
    for (const r of previous) {
      if (r.projectId) counts.set(r.projectId, (counts.get(r.projectId) || 0) + 1);
    }

    for (const [projId, count] of counts) {
      if (count >= 3) {
        histScores.set(projId, { score: 0.20, count });
      } else if (count >= 1) {
        histScores.set(projId, { score: 0.10, count });
      }
    }
  }

  // ── Composite scoring ──────────────────────────────────
  let bestMatch: MatchResult = {
    projectId: null,
    projectName: null,
    confidence: 0,
    status: EmailReceiptStatus.UNASSIGNED,
    reason: poJobName
      ? `PO/Job "${poJobName}" — no matching project found`
      : "No PO/Job Name on receipt; manual assignment required",
    signals: { poJobName: 0, geoProximity: 0, historical: 0 },
  };

  for (const proj of projects) {
    const poSignal = poScores.get(proj.id)?.score || 0;
    const geoSignal = geoScores.get(proj.id)?.score || 0;
    const histSignal = histScores.get(proj.id)?.score || 0;

    const composite = poSignal + geoSignal + histSignal;

    if (composite > bestMatch.confidence) {
      // Build reason string
      const reasons: string[] = [];
      if (poSignal > 0) reasons.push(poScores.get(proj.id)!.reason);
      if (geoSignal > 0) {
        const dist = geoScores.get(proj.id)!.distance;
        reasons.push(`Store #${storeNumber} is ${dist} mi from project`);
      }
      if (histSignal > 0) {
        const count = histScores.get(proj.id)!.count;
        reasons.push(`${count} previous receipts from this store assigned here`);
      }

      let status: EmailReceiptStatus;
      if (composite >= 0.95) status = EmailReceiptStatus.ASSIGNED;
      else if (composite >= 0.50) status = EmailReceiptStatus.MATCHED;
      else status = EmailReceiptStatus.UNASSIGNED;

      bestMatch = {
        projectId: proj.id,
        projectName: proj.name,
        confidence: Math.round(composite * 100) / 100,
        status,
        reason: reasons.join(" + ") + ` (${Math.round(composite * 100)}% confidence)`,
        signals: { poJobName: poSignal, geoProximity: geoSignal, historical: histSignal },
      };
    }
  }

  return bestMatch;
}
