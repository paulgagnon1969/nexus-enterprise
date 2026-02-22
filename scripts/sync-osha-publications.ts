#!/usr/bin/env ts-node
/**
 * OSHA Publications Library Scraper
 *
 * Fetches all pages from https://www.osha.gov/publications/all,
 * parses publication metadata (title, OSHA number, year, language, type),
 * downloads all PDFs and HTML docs to data/osha-publications/,
 * and writes a manifest.json index.
 *
 * Usage:
 *   npx ts-node scripts/sync-osha-publications.ts              # full sync
 *   npx ts-node scripts/sync-osha-publications.ts --pages=0-2   # first 3 pages only
 *   npx ts-node scripts/sync-osha-publications.ts --skip-download # parse only, no downloads
 *   npx ts-node scripts/sync-osha-publications.ts --resume       # skip already-downloaded files
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.osha.gov";
const PUBLICATIONS_PATH = "/publications/all";
const MAX_PAGE = 25; // 0-indexed, 26 pages total
const OUTPUT_DIR = "/Volumes/4T Data/ALL OSHA MANUALS";
const FILES_DIR = path.join(OUTPUT_DIR, "files");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const DELAY_MS = 500; // polite delay between page fetches
const DOWNLOAD_DELAY_MS = 200; // delay between file downloads
const CONCURRENT_DOWNLOADS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicationVariant {
  language: string;
  format: "PDF" | "HTML";
  url: string;
  oshaNumber: string; // e.g. "OSHA 3676"
  year: string | null; // e.g. "2014"
  localFile: string | null; // filled after download
}

interface Publication {
  title: string;
  variants: PublicationVariant[];
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string): string | null {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : null;
}

const hasFlag = (name: string) => args.includes(`--${name}`);

const pageRange = getArg("pages");
let startPage = 0;
let endPage = MAX_PAGE;
if (pageRange) {
  const [s, e] = pageRange.split("-").map(Number);
  startPage = s;
  endPage = e ?? s;
}

const skipDownload = hasFlag("skip-download");
const resume = hasFlag("resume");

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "NexusEnterprise-OSHA-Sync/1.0" } }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redir = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${BASE_URL}${res.headers.location}`;
        return fetchPage(redir).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "NexusEnterprise-OSHA-Sync/1.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redir = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${BASE_URL}${res.headers.location}`;
        return downloadFile(redir, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on("finish", () => resolve());
      ws.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// HTML Parser (no dependencies — regex-based)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function parsePublicationsFromHtml(html: string): Publication[] {
  const publications: Publication[] = [];

  // The page is a flat sequence of:
  //   <h3><h5>Title</h5></h3>          ← publication boundary
  //   <div class="...views-row">...</div>  ← variant (may repeat)
  //
  // Strategy: collect all title and row positions, then walk them in order.
  // Each views-row is assigned to the most recent preceding title.

  interface Token {
    type: "title" | "row";
    index: number;
    text: string; // title text or full row HTML
  }

  const tokens: Token[] = [];

  // Find titles
  const titleRegex = /<h3><h5>(.*?)<\/h5><\/h3>/g;
  let m: RegExpExecArray | null;
  while ((m = titleRegex.exec(html)) !== null) {
    tokens.push({ type: "title", index: m.index, text: decodeHtmlEntities(m[1].trim()) });
  }

  // Find variant rows — match from views-row"> to the row-closing </div>
  // The row ends with `    )\n  \n  </div>` so we grab everything up to that.
  const rowRegex = /<div class="view-id-publications[^"]*views-row">(.*?)\)\s*<\/div>/gs;
  while ((m = rowRegex.exec(html)) !== null) {
    tokens.push({ type: "row", index: m.index, text: m[1] });
  }

  // Sort all tokens by position in the HTML
  tokens.sort((a, b) => a.index - b.index);

  // Walk tokens: each title starts a new publication, rows add variants
  let current: Publication | null = null;

  for (const tok of tokens) {
    if (tok.type === "title") {
      if (current) publications.push(current);
      current = { title: tok.text, variants: [] };
      continue;
    }

    // tok.type === "row"
    if (!current) continue;
    const row = tok.text;

    // Extract OSHA number + year: (OSHA FS-3697 - 2014) or (1997)
    const pubIdMatch = row.match(/field-content">\s*\(([^)]+)\)/);
    let oshaNumber = "";
    let year: string | null = null;
    if (pubIdMatch) {
      const raw = decodeHtmlEntities(pubIdMatch[1].trim());
      const dashIdx = raw.lastIndexOf(" - ");
      if (dashIdx >= 0) {
        oshaNumber = raw.slice(0, dashIdx).trim();
        year = raw.slice(dashIdx + 3).trim();
      } else {
        // Could be just a year like "1997" or an OSHA number with no year
        oshaNumber = /^\d{4}$/.test(raw) ? "" : raw;
        year = /^\d{4}$/.test(raw) ? raw : null;
      }
    }

    // Extract language from <b lang=...>Language:</b>
    const langMatch = row.match(/<b[^>]*>([^<]+):<\/b>/);
    const language = langMatch
      ? decodeHtmlEntities(langMatch[1].trim().replace(/:$/, ""))
      : "English";

    // Extract download link and format
    const linkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>(PDF|HTML)<\/a>/i);
    if (linkMatch) {
      const href = linkMatch[1];
      const format = linkMatch[2].toUpperCase() as "PDF" | "HTML";
      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      current.variants.push({
        language,
        format,
        url,
        oshaNumber,
        year,
        localFile: null,
      });
    }
  }

  // Don't forget the last publication
  if (current) publications.push(current);

  return publications;
}

// ---------------------------------------------------------------------------
// Download logic
// ---------------------------------------------------------------------------

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9_\-. ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function downloadVariants(publications: Publication[]): Promise<number> {
  fs.mkdirSync(FILES_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const total = publications.reduce((n, p) => n + p.variants.length, 0);

  // Build a flat list of download tasks
  const tasks: { pub: Publication; variant: PublicationVariant; idx: number }[] = [];
  let idx = 0;
  for (const pub of publications) {
    for (const v of pub.variants) {
      tasks.push({ pub, variant: v, idx: idx++ });
    }
  }

  // Process in batches of CONCURRENT_DOWNLOADS
  for (let i = 0; i < tasks.length; i += CONCURRENT_DOWNLOADS) {
    const batch = tasks.slice(i, i + CONCURRENT_DOWNLOADS);
    await Promise.all(
      batch.map(async ({ pub, variant, idx: taskIdx }) => {
        const ext = variant.format === "PDF" ? ".pdf" : ".html";
        const nameBase = sanitizeFilename(
          `${variant.oshaNumber || "unknown"}_${variant.language}`.replace(/\s+/g, "_"),
        );
        const fileName = `${nameBase}${ext}`;
        const destPath = path.join(FILES_DIR, fileName);
        variant.localFile = `files/${fileName}`;

        if (resume && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
          skipped++;
          return;
        }

        try {
          await downloadFile(variant.url, destPath);
          downloaded++;
          const pct = (((downloaded + skipped + failed) / total) * 100).toFixed(0);
          if ((downloaded + skipped) % 20 === 0 || downloaded + skipped + failed === total) {
            console.log(
              `  [${pct}%] ${downloaded} downloaded, ${skipped} skipped, ${failed} failed / ${total}`,
            );
          }
        } catch (err: any) {
          failed++;
          console.error(`  ✗ Failed: ${variant.url} — ${err.message}`);
        }

        await sleep(DOWNLOAD_DELAY_MS);
      }),
    );
  }

  console.log(
    `\nDownload complete: ${downloaded} new, ${skipped} skipped (resume), ${failed} failed out of ${total} total`,
  );
  return downloaded;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== OSHA Publications Scraper ===");
  console.log(`Pages: ${startPage}–${endPage} | Output: ${OUTPUT_DIR}`);
  if (skipDownload) console.log("Mode: parse only (--skip-download)");
  if (resume) console.log("Mode: resume (skip existing files)");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Fetch and parse all pages
  const allPublications: Publication[] = [];

  for (let page = startPage; page <= endPage; page++) {
    const url = page === 0
      ? `${BASE_URL}${PUBLICATIONS_PATH}`
      : `${BASE_URL}${PUBLICATIONS_PATH}?page=${page}`;

    console.log(`\nFetching page ${page}/${endPage}: ${url}`);
    try {
      const html = await fetchPage(url);
      const pubs = parsePublicationsFromHtml(html);
      console.log(`  → Parsed ${pubs.length} publications (${pubs.reduce((n, p) => n + p.variants.length, 0)} variants)`);
      allPublications.push(...pubs);
    } catch (err: any) {
      console.error(`  ✗ Failed to fetch page ${page}: ${err.message}`);
    }

    if (page < endPage) await sleep(DELAY_MS);
  }

  // Deduplicate by title (same title can appear on boundary pages)
  const seen = new Map<string, Publication>();
  for (const pub of allPublications) {
    const existing = seen.get(pub.title);
    if (existing) {
      // Merge variants
      for (const v of pub.variants) {
        if (!existing.variants.some((ev) => ev.url === v.url)) {
          existing.variants.push(v);
        }
      }
    } else {
      seen.set(pub.title, pub);
    }
  }
  const publications = Array.from(seen.values());

  const totalVariants = publications.reduce((n, p) => n + p.variants.length, 0);
  console.log(`\n=== Parsed ${publications.length} unique publications with ${totalVariants} downloadable variants ===`);

  // 2. Download files
  if (!skipDownload) {
    console.log(`\nDownloading ${totalVariants} files to ${FILES_DIR}...`);
    await downloadVariants(publications);
  }

  // 3. Write manifest
  const manifest = {
    scrapedAt: new Date().toISOString(),
    source: `${BASE_URL}${PUBLICATIONS_PATH}`,
    pagesScraped: { start: startPage, end: endPage },
    totalPublications: publications.length,
    totalVariants,
    publications,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${MANIFEST_PATH}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
