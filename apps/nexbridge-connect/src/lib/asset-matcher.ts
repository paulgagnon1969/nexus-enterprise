/**
 * Asset folder → Asset matching engine.
 *
 * Pure TypeScript — no Tauri or Node dependencies.
 * Ported from packages/database/src/scripts/import-asset-folders.ts
 */

// ── Types ──────────────────────────────────────────────────────────

export interface AssetRecord {
  id: string;
  name: string;
  serialNumberOrVin: string | null;
  code: string | null;
}

export type MatchType = "vin" | "name-exact" | "name-fuzzy" | "unmatched";

export interface MatchResult {
  assetId: string | null;
  assetName: string | null;
  assetCode: string | null;
  matchType: MatchType;
  confidence: number; // 0-100
}

export type AttachmentCategory =
  | "PHOTO" | "TITLE" | "INSURANCE" | "MANUAL" | "RECEIPT"
  | "DIAGNOSTIC" | "CONTRACT" | "WARRANTY" | "SCHEMATIC" | "OTHER";

// ── VIN / serial extraction ────────────────────────────────────────

const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/i;

export function extractVin(folderName: string): string | null {
  const m = folderName.match(VIN_RE);
  return m ? m[1].toUpperCase() : null;
}

function isYearLike(s: string): boolean {
  const n = Number(s);
  return n >= 1900 && n <= 2100;
}

export function extractSerial(folderName: string): string | null {
  const cleaned = folderName.replace(/^#+\s*/, "");
  const parts = cleaned.split(/[-–—]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const trimmed = parts[i].trim();
    const m = trimmed.match(/^(\d{4,10})$/);
    if (m && m[1].length >= 4 && !isYearLike(m[1])) {
      return m[1];
    }
  }
  return null;
}

// ── Text normalization & tokenization ──────────────────────────────

export function normalize(s: string): string {
  return s
    .replace(/^#+\s*/, "")
    .replace(/[-–—_/\\]/g, " ")
    .replace(/[^a-z0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stemSimple(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((t) => t.length > 1)
      .map(stemSimple),
  );
}

function tokenOverlap(a: string, b: string): number {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) {
    if (tokB.has(t)) overlap++;
  }
  const minSize = Math.min(tokA.size, tokB.size);
  return (overlap / minSize) * 100;
}

// ── Matching engine ────────────────────────────────────────────────

function findBestNameMatch(
  folderName: string,
  assets: AssetRecord[],
): { asset: AssetRecord; score: number; type: "name-exact" | "name-fuzzy" } | null {
  const normFolder = normalize(folderName);

  // Exact normalized match
  for (const a of assets) {
    if (normalize(a.name) === normFolder) {
      return { asset: a, score: 100, type: "name-exact" };
    }
  }

  // Token overlap — require >= 60% overlap with at least 2 matching tokens
  let best: { asset: AssetRecord; score: number } | null = null;
  for (const a of assets) {
    const score = tokenOverlap(folderName, a.name);
    const tokA = tokenize(folderName);
    const tokB = tokenize(a.name);
    let matchCount = 0;
    for (const t of tokA) {
      if (tokB.has(t)) matchCount++;
    }
    if (score >= 60 && matchCount >= 2) {
      if (!best || score > best.score) {
        best = { asset: a, score };
      }
    }
  }

  return best ? { asset: best.asset, score: best.score, type: "name-fuzzy" } : null;
}

/**
 * Match a folder name against a list of assets.
 * Priority: VIN → serial → exact name → fuzzy name
 */
export function matchFolder(folderName: string, assets: AssetRecord[]): MatchResult {
  // Build VIN/serial lookup
  const vinMap = new Map<string, AssetRecord>();
  for (const a of assets) {
    if (a.serialNumberOrVin) {
      vinMap.set(a.serialNumberOrVin.toUpperCase(), a);
    }
  }

  // 1. VIN match
  const vin = extractVin(folderName);
  if (vin && vinMap.has(vin)) {
    const a = vinMap.get(vin)!;
    return { assetId: a.id, assetName: a.name, assetCode: a.code, matchType: "vin", confidence: 100 };
  }

  // 2. Serial match
  const serial = extractSerial(folderName);
  if (serial) {
    for (const a of assets) {
      if (a.serialNumberOrVin && a.serialNumberOrVin === serial) {
        return { assetId: a.id, assetName: a.name, assetCode: a.code, matchType: "vin", confidence: 95 };
      }
    }
  }

  // 3. Name match
  const nameMatch = findBestNameMatch(folderName, assets);
  if (nameMatch) {
    return {
      assetId: nameMatch.asset.id,
      assetName: nameMatch.asset.name,
      assetCode: nameMatch.asset.code,
      matchType: nameMatch.type,
      confidence: nameMatch.score,
    };
  }

  return { assetId: null, assetName: null, assetCode: null, matchType: "unmatched", confidence: 0 };
}

// ── Category auto-detection ────────────────────────────────────────

export function categorizeFile(fileName: string): AttachmentCategory {
  const lower = fileName.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));

  // Image extensions → PHOTO (unless keywords override)
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].includes(ext)) {
    if (/title/i.test(lower)) return "TITLE";
    if (/insurance|ins card|geico|usaa|progressive|statefarm/i.test(lower)) return "INSURANCE";
    if (/receipt/i.test(lower)) return "RECEIPT";
    if (/diagnostic|diag|inspection/i.test(lower)) return "DIAGNOSTIC";
    return "PHOTO";
  }

  // PDF / doc heuristics
  if (/title/i.test(lower) && !/(subtitle|entitled)/i.test(lower)) return "TITLE";
  if (/insurance|ins card|geico|usaa|progressive|statefarm|autoidcard/i.test(lower)) return "INSURANCE";
  if (/owner.*manual|owners.*manual/i.test(lower)) return "MANUAL";
  if (/manual|handbook|guide|instructions/i.test(lower)) return "MANUAL";
  if (/receipt|invoice|order.*complete|purchase/i.test(lower)) return "RECEIPT";
  if (/diagnostic|diag.*report|inspection.*report|error|dtc|trouble.*code/i.test(lower)) return "DIAGNOSTIC";
  if (/warranty/i.test(lower)) return "WARRANTY";
  if (/contract|agreement|lease|bill.*sale/i.test(lower)) return "CONTRACT";
  if (/schematic|wiring|diagram|fuse.*box|fuse.*panel/i.test(lower)) return "SCHEMATIC";
  if (/registration/i.test(lower)) return "TITLE";

  return "OTHER";
}

// ── MIME type mapping ──────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export function getMimeType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

// ── Helpers ────────────────────────────────────────────────────────

/** Default binary / junk extensions to auto-exclude from sync */
export const EXCLUDED_EXTENSIONS = new Set([
  ".dylib", ".app", ".exe", ".dll", ".so", ".dmg", ".pkg", ".msi",
  ".nib", ".car", ".icns", ".strings", ".plist", ".bin",
]);

/** Check if a file extension should be auto-excluded */
export function isExcludedExtension(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return EXCLUDED_EXTENSIONS.has(ext);
}

/** Format bytes as human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Category display config */
export const CATEGORY_CONFIG: Record<AttachmentCategory, { label: string; color: string }> = {
  PHOTO: { label: "Photo", color: "bg-sky-100 text-sky-700" },
  TITLE: { label: "Title", color: "bg-indigo-100 text-indigo-700" },
  INSURANCE: { label: "Insurance", color: "bg-emerald-100 text-emerald-700" },
  MANUAL: { label: "Manual", color: "bg-purple-100 text-purple-700" },
  RECEIPT: { label: "Receipt", color: "bg-amber-100 text-amber-700" },
  DIAGNOSTIC: { label: "Diagnostic", color: "bg-orange-100 text-orange-700" },
  CONTRACT: { label: "Contract", color: "bg-rose-100 text-rose-700" },
  WARRANTY: { label: "Warranty", color: "bg-teal-100 text-teal-700" },
  SCHEMATIC: { label: "Schematic", color: "bg-cyan-100 text-cyan-700" },
  OTHER: { label: "Other", color: "bg-slate-100 text-slate-600" },
};
