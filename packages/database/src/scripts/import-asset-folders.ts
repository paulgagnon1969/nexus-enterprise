/**
 * Import asset document folders from the local 4T drive into MinIO + AssetAttachment records.
 *
 * Usage (from repo root):
 *   COMPANY_ID=cmjr9okjz000401s6rdkbatvr \
 *   DATABASE_URL="postgresql://nexus_user:nexus_password@localhost:5433/NEXUSDEVv3?schema=public" \
 *   npx ts-node packages/database/src/scripts/import-asset-folders.ts
 *
 * Env vars:
 *   COMPANY_ID       — required, target company
 *   DATABASE_URL     — required, Prisma connection
 *   DRY_RUN          — if "1", skip uploads/writes, just produce the report
 *   ROOT_DIR         — override scan root (default: /Volumes/4T Data/NEXUS Dropbox/Paul Gagnon/Vehicles Titles, Trailers, Equipment/)
 *   MINIO_ENDPOINT   — MinIO host (default: localhost)
 *   MINIO_PORT       — MinIO port (default: 9000)
 *   MINIO_ACCESS_KEY — MinIO access key (default: minioadmin)
 *   MINIO_SECRET_KEY — MinIO secret key (default: minioadmin)
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import * as Minio from "minio";
import { prisma, AssetAttachmentCategory } from "../index";

// ── Configuration ──────────────────────────────────────────────────

const COMPANY_ID = process.env.COMPANY_ID;
if (!COMPANY_ID) {
  console.error("COMPANY_ID env var is required");
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === "1";

const ROOT_DIR =
  process.env.ROOT_DIR ||
  "/Volumes/4T Data/NEXUS Dropbox/Paul Gagnon/Vehicles Titles, Trailers, Equipment/";

const BUCKET = "asset-attachments";

const REPORT_DIR = "/Volumes/4T Data/WARP TMP";
const REPORT_PATH = path.join(
  REPORT_DIR,
  `asset-folder-import-report-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.csv`,
);

// ── MinIO client ───────────────────────────────────────────────────

const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: Number(process.env.MINIO_PORT || "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// ── Types ──────────────────────────────────────────────────────────

interface AssetRow {
  id: string;
  name: string;
  serialNumberOrVin: string | null;
  code: string | null;
}

interface MatchResult {
  folderName: string;
  folderPath: string;
  matchType: "vin" | "name-exact" | "name-fuzzy" | "skipped" | "unmatched";
  assetId: string | null;
  assetName: string | null;
  assetCode: string | null;
  confidence: number; // 0-100
  fileCount: number;
  filesUploaded: number;
  totalBytes: number;
  errors: string[];
}

// ── VIN extraction ─────────────────────────────────────────────────

// Standard 17-char VIN (no I, O, Q), plus shorter serials embedded in folder names
const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/i;
const SERIAL_RE = /\b(\d{4,10})\b/; // shorter serial like "175596", "2199"

function extractVin(folderName: string): string | null {
  const m = folderName.match(VIN_RE);
  return m ? m[1].toUpperCase() : null;
}

function extractSerial(folderName: string): string | null {
  // Only use the trailing serial-like number (avoid year numbers)
  // Look for patterns like "VIN- 175596" or "- 2199" at end
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

function isYearLike(s: string): boolean {
  const n = Number(s);
  return n >= 1900 && n <= 2100;
}

// ── Fuzzy name matching ────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .replace(/^#+\s*/, "") // strip leading # markers
    .replace(/[-–—_/\\]/g, " ") // split on dashes, slashes too
    .replace(/[^a-z0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stemSimple(word: string): string {
  // Very basic: strip trailing 's' for plural matching (generators → generator)
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

function tokenize(s: string): Set<string> {
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
  // Jaccard-ish but weighted toward the smaller set (folder name)
  const minSize = Math.min(tokA.size, tokB.size);
  return (overlap / minSize) * 100;
}

function findBestNameMatch(
  folderName: string,
  assets: AssetRow[],
): { asset: AssetRow; score: number; type: "name-exact" | "name-fuzzy" } | null {
  const normFolder = normalize(folderName);

  // Exact normalized match
  for (const a of assets) {
    if (normalize(a.name) === normFolder) {
      return { asset: a, score: 100, type: "name-exact" };
    }
  }

  // Token overlap — require >= 60% overlap with at least 2 matching tokens
  let best: { asset: AssetRow; score: number } | null = null;
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

// ── Category auto-detection ────────────────────────────────────────

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

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function categorizeFile(fileName: string): AssetAttachmentCategory {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);

  // Image extensions → PHOTO
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].includes(ext)) {
    // Unless the name contains keywords for other categories
    if (/title/i.test(lower)) return "TITLE" as AssetAttachmentCategory;
    if (/insurance|ins card|geico|usaa|progressive|statefarm/i.test(lower))
      return "INSURANCE" as AssetAttachmentCategory;
    if (/receipt/i.test(lower)) return "RECEIPT" as AssetAttachmentCategory;
    if (/diagnostic|diag|inspection/i.test(lower))
      return "DIAGNOSTIC" as AssetAttachmentCategory;
    return "PHOTO" as AssetAttachmentCategory;
  }

  // PDF / doc heuristics by filename
  if (/title/i.test(lower) && !/(subtitle|entitled)/i.test(lower))
    return "TITLE" as AssetAttachmentCategory;
  if (/insurance|ins card|geico|usaa|progressive|statefarm|autoIdcard/i.test(lower))
    return "INSURANCE" as AssetAttachmentCategory;
  if (/owner.*manual|owners.*manual/i.test(lower))
    return "MANUAL" as AssetAttachmentCategory;
  if (/manual|handbook|guide|instructions/i.test(lower))
    return "MANUAL" as AssetAttachmentCategory;
  if (/receipt|invoice|order.*complete|purchase/i.test(lower))
    return "RECEIPT" as AssetAttachmentCategory;
  if (/diagnostic|diag.*report|inspection.*report|error|dtc|trouble.*code/i.test(lower))
    return "DIAGNOSTIC" as AssetAttachmentCategory;
  if (/warranty/i.test(lower))
    return "WARRANTY" as AssetAttachmentCategory;
  if (/contract|agreement|lease|bill.*sale/i.test(lower))
    return "CONTRACT" as AssetAttachmentCategory;
  if (/schematic|wiring|diagram|fuse.*box|fuse.*panel/i.test(lower))
    return "SCHEMATIC" as AssetAttachmentCategory;
  if (/registration/i.test(lower))
    return "TITLE" as AssetAttachmentCategory;

  return "OTHER" as AssetAttachmentCategory;
}

// ── File walker ────────────────────────────────────────────────────

async function listFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "Icon\r") continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirectories within an asset folder
      const sub = await listFiles(full);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

// ── Ensure MinIO bucket exists ─────────────────────────────────────

async function ensureBucket(): Promise<void> {
  try {
    const exists = await minio.bucketExists(BUCKET);
    if (!exists) {
      await minio.makeBucket(BUCKET);
      console.log(`Created MinIO bucket: ${BUCKET}`);
    }
  } catch (err) {
    // Best-effort
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70));
  console.log("Asset Folder Import");
  console.log(`Company:  ${COMPANY_ID}`);
  console.log(`Root:     ${ROOT_DIR}`);
  console.log(`Dry run:  ${DRY_RUN}`);
  console.log("=".repeat(70));

  // Verify root exists
  if (!fs.existsSync(ROOT_DIR)) {
    console.error(`Root directory not found: ${ROOT_DIR}`);
    process.exit(1);
  }

  // Load all assets for this company
  const assets: AssetRow[] = await prisma.asset.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, name: true, serialNumberOrVin: true, code: true },
  });
  console.log(`Loaded ${assets.length} assets from database`);

  // Build VIN/serial lookup
  const vinMap = new Map<string, AssetRow>();
  for (const a of assets) {
    if (a.serialNumberOrVin) {
      vinMap.set(a.serialNumberOrVin.toUpperCase(), a);
    }
  }

  // Ensure bucket
  if (!DRY_RUN) {
    await ensureBucket();
  }

  // List top-level directories
  const topEntries = await fsp.readdir(ROOT_DIR, { withFileTypes: true });
  const folders = topEntries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);

  console.log(`Found ${folders.length} top-level folders`);

  const results: MatchResult[] = [];
  let totalUploaded = 0;
  let totalSkipped = 0;

  for (const folderName of folders) {
    const folderPath = path.join(ROOT_DIR, folderName);

    // Skip ### prefixed folders (archive/meta)
    if (folderName.startsWith("###")) {
      results.push({
        folderName,
        folderPath,
        matchType: "skipped",
        assetId: null,
        assetName: null,
        assetCode: null,
        confidence: 0,
        fileCount: 0,
        filesUploaded: 0,
        totalBytes: 0,
        errors: ["Skipped: ### archive folder"],
      });
      totalSkipped++;
      continue;
    }

    // Get files in this folder
    const files = await listFiles(folderPath);
    if (files.length === 0) {
      results.push({
        folderName,
        folderPath,
        matchType: "skipped",
        assetId: null,
        assetName: null,
        assetCode: null,
        confidence: 0,
        fileCount: 0,
        filesUploaded: 0,
        totalBytes: 0,
        errors: ["Skipped: empty folder"],
      });
      totalSkipped++;
      continue;
    }

    // Try matching: VIN first, then serial, then name
    let matched: AssetRow | null = null;
    let matchType: MatchResult["matchType"] = "unmatched";
    let confidence = 0;

    // 1. VIN match
    const vin = extractVin(folderName);
    if (vin && vinMap.has(vin)) {
      matched = vinMap.get(vin)!;
      matchType = "vin";
      confidence = 100;
    }

    // 2. Serial match (shorter numbers like "175596", "2199")
    if (!matched) {
      const serial = extractSerial(folderName);
      if (serial) {
        for (const a of assets) {
          if (a.serialNumberOrVin && a.serialNumberOrVin === serial) {
            matched = a;
            matchType = "vin"; // still a serial/vin match
            confidence = 95;
            break;
          }
        }
      }
    }

    // 3. Name match
    if (!matched) {
      const nameMatch = findBestNameMatch(folderName, assets);
      if (nameMatch) {
        matched = nameMatch.asset;
        matchType = nameMatch.type;
        confidence = nameMatch.score;
      }
    }

    if (!matched) {
      let totalBytes = 0;
      for (const f of files) {
        const stat = await fsp.stat(f);
        totalBytes += stat.size;
      }
      results.push({
        folderName,
        folderPath,
        matchType: "unmatched",
        assetId: null,
        assetName: null,
        assetCode: null,
        confidence: 0,
        fileCount: files.length,
        filesUploaded: 0,
        totalBytes,
        errors: ["No matching asset found"],
      });
      continue;
    }

    // Process matched folder — upload files
    const result: MatchResult = {
      folderName,
      folderPath,
      matchType,
      assetId: matched.id,
      assetName: matched.name,
      assetCode: matched.code,
      confidence,
      fileCount: files.length,
      filesUploaded: 0,
      totalBytes: 0,
      errors: [],
    };

    console.log(
      `\n[${matchType}:${confidence}%] "${folderName}" → ${matched.name} (${matched.code})`,
    );

    for (const filePath of files) {
      try {
        const stat = await fsp.stat(filePath);
        result.totalBytes += stat.size;
        const fileName = path.basename(filePath);
        const mimeType = getMimeType(fileName);
        const category = categorizeFile(fileName);

        const storageKey = `${COMPANY_ID}/${matched.id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        if (DRY_RUN) {
          console.log(`  [dry] ${fileName} → ${category} (${(stat.size / 1024).toFixed(1)} KB)`);
          result.filesUploaded++;
          continue;
        }

        // Upload to MinIO
        const buffer = await fsp.readFile(filePath);
        await minio.putObject(BUCKET, storageKey, buffer, buffer.length, {
          "Content-Type": mimeType,
        });

        // Create AssetAttachment record
        await prisma.assetAttachment.create({
          data: {
            companyId: COMPANY_ID,
            assetId: matched.id,
            fileName,
            fileType: mimeType,
            fileSize: stat.size,
            storageKey,
            category,
            notes: `Imported from: ${path.relative(ROOT_DIR, filePath)}`,
            uploadedByUserId: null, // system import
          },
        });

        result.filesUploaded++;
        totalUploaded++;

        if (totalUploaded % 50 === 0) {
          console.log(`  ... ${totalUploaded} files uploaded so far`);
        }
      } catch (err: any) {
        result.errors.push(`${path.basename(filePath)}: ${err.message}`);
        console.error(`  ERROR: ${path.basename(filePath)} — ${err.message}`);
      }
    }

    console.log(
      `  → ${result.filesUploaded}/${result.fileCount} files, ${(result.totalBytes / 1024 / 1024).toFixed(1)} MB`,
    );
    results.push(result);
  }

  // Also scan loose files in root (not in a subfolder)
  const rootFiles = (await fsp.readdir(ROOT_DIR, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith(".") && e.name !== "Icon\r")
    .map((e) => e.name);

  if (rootFiles.length > 0) {
    results.push({
      folderName: "(root loose files)",
      folderPath: ROOT_DIR,
      matchType: "skipped",
      assetId: null,
      assetName: null,
      assetCode: null,
      confidence: 0,
      fileCount: rootFiles.length,
      filesUploaded: 0,
      totalBytes: 0,
      errors: [`${rootFiles.length} loose files in root — manual review needed`],
    });
  }

  // ── Generate report ────────────────────────────────────────────────

  await fsp.mkdir(REPORT_DIR, { recursive: true });

  const header = [
    "folder_name",
    "match_type",
    "confidence",
    "asset_id",
    "asset_name",
    "asset_code",
    "file_count",
    "files_uploaded",
    "total_mb",
    "errors",
  ].join(",");

  const rows = results.map((r) =>
    [
      csvEscape(r.folderName),
      r.matchType,
      r.confidence,
      r.assetId || "",
      csvEscape(r.assetName || ""),
      r.assetCode || "",
      r.fileCount,
      r.filesUploaded,
      (r.totalBytes / 1024 / 1024).toFixed(2),
      csvEscape(r.errors.join("; ")),
    ].join(","),
  );

  fs.writeFileSync(REPORT_PATH, [header, ...rows].join("\n"), "utf8");

  // ── Summary ────────────────────────────────────────────────────────

  const matched = results.filter((r) => r.assetId);
  const unmatched = results.filter((r) => r.matchType === "unmatched");
  const skipped = results.filter((r) => r.matchType === "skipped");

  console.log("\n" + "=".repeat(70));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total folders scanned: ${results.length}`);
  console.log(`  Matched:   ${matched.length} (${matched.filter((r) => r.matchType === "vin").length} by VIN, ${matched.filter((r) => r.matchType === "name-exact").length} exact name, ${matched.filter((r) => r.matchType === "name-fuzzy").length} fuzzy name)`);
  console.log(`  Unmatched: ${unmatched.length}`);
  console.log(`  Skipped:   ${skipped.length}`);
  console.log(`Total files uploaded: ${totalUploaded}`);
  console.log(`Report saved: ${REPORT_PATH}`);

  if (unmatched.length > 0) {
    console.log("\nUNMATCHED FOLDERS (need manual review):");
    for (const r of unmatched) {
      console.log(`  ${r.folderName} (${r.fileCount} files)`);
    }
  }

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN — no files were actually uploaded or records created.");
  }

  console.log("\nDone.");
  process.exit(0);
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
