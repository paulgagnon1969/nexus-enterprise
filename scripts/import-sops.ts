#!/usr/bin/env ts-node
/**
 * SOP Sync Script
 *
 * Syncs Markdown SOPs from docs/sops-staging/ to Nexus Documents.
 * Converts MD → HTML and creates/updates documents via the API.
 *
 * Usage:
 *   npx ts-node scripts/import-sops.ts [--file <filename>] [--all] [--dry-run] [--watch]
 *
 * Environment:
 *   NEXUS_API_URL      - Base URL for the API (default: http://localhost:3100)
 *   NEXUS_API_TOKEN    - JWT token for authentication (required)
 *
 * Examples:
 *   npx ts-node scripts/import-sops.ts --file token-authentication-sop.md
 *   npx ts-node scripts/import-sops.ts --all
 *   npx ts-node scripts/import-sops.ts --all --dry-run
 *   npx ts-node scripts/import-sops.ts --watch   # Live sync on file changes
 */

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import { createHash } from "crypto";

// --- Configuration -----------------------------------------------------------

const STAGING_DIR = path.resolve(__dirname, "../docs/sops-staging");
const API_URL = process.env.NEXUS_API_URL || "http://localhost:3100";
const API_TOKEN = process.env.NEXUS_API_TOKEN;

// --- Types -------------------------------------------------------------------

interface SopFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: "draft" | "published";
  created: string;
  updated: string;
  author: string;
}

interface ParsedSop {
  filename: string;
  frontmatter: SopFrontmatter;
  markdown: string;
  html: string;
}

interface TemplatePayload {
  type: "SOP";
  code: string;
  label: string;
  description: string;
  templateHtml: string;
  versionLabel: string;
  versionNotes: string;
}

interface ExistingTemplate {
  id: string;
  code: string;
  label: string;
  currentVersion?: {
    id: string;
    versionNo: number;
    contentHash?: string;
  };
}

// --- Markdown Processor ------------------------------------------------------

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// --- Helper Functions --------------------------------------------------------

function listSopFiles(): string[] {
  if (!fs.existsSync(STAGING_DIR)) {
    console.error(`Staging directory not found: ${STAGING_DIR}`);
    process.exit(1);
  }

  return fs
    .readdirSync(STAGING_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md");
}

function parseSopFile(filename: string): ParsedSop {
  const filepath = path.join(STAGING_DIR, filename);
  const raw = fs.readFileSync(filepath, "utf-8");
  const { data, content } = matter(raw);

  const frontmatter = data as SopFrontmatter;

  // Convert markdown to HTML
  const html = md.render(content);

  return {
    filename,
    frontmatter,
    markdown: content,
    html,
  };
}

function generateCode(frontmatter: SopFrontmatter, filename: string): string {
  // Use module name or derive from filename
  const base = frontmatter.module || filename.replace(/-sop\.md$/, "");
  return `SOP-${base.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;
}

function buildPayload(sop: ParsedSop): TemplatePayload {
  const code = generateCode(sop.frontmatter, sop.filename);
  const tags = sop.frontmatter.tags?.join(", ") || "";

  return {
    type: "SOP",
    code,
    label: sop.frontmatter.title || sop.filename,
    description: `Module: ${sop.frontmatter.module || "N/A"}\nTags: ${tags}\nAuthor: ${sop.frontmatter.author || "Unknown"}`,
    templateHtml: sop.html,
    versionLabel: `Rev ${sop.frontmatter.revision || "1.0"}`,
    versionNotes: `Synced from ${sop.filename} on ${new Date().toISOString().split("T")[0]}`,
  };
}

// --- API Functions -----------------------------------------------------------

async function fetchExistingTemplates(): Promise<ExistingTemplate[]> {
  const url = `${API_URL}/documents/templates`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch templates: ${error}`);
  }

  return response.json() as Promise<ExistingTemplate[]>;
}

async function createDocument(payload: TemplatePayload): Promise<any> {
  const url = `${API_URL}/documents/templates`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}

async function updateDocument(
  templateId: string,
  payload: Partial<TemplatePayload>,
): Promise<any> {
  const url = `${API_URL}/documents/templates/${templateId}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update document: ${error}`);
  }

  return response.json();
}

async function setDocumentInactive(templateId: string): Promise<void> {
  await updateDocument(templateId, { active: false } as any);
}

// --- Sync Logic --------------------------------------------------------------

async function syncFile(
  filename: string,
  existingTemplates: Map<string, ExistingTemplate>,
  dryRun: boolean,
): Promise<"created" | "updated" | "unchanged" | "error"> {
  try {
    const sop = parseSopFile(filename);
    const payload = buildPayload(sop);
    const contentHash = hashContent(payload.templateHtml);

    console.log(`Processing: ${filename}`);
    console.log(`  → Code: ${payload.code}`);
    console.log(`  → Label: ${payload.label}`);

    const existing = existingTemplates.get(payload.code);

    if (existing) {
      // Check if content actually changed
      const existingHash = existing.currentVersion?.contentHash;
      if (existingHash === contentHash) {
        console.log(`  ✓ No changes detected\n`);
        return "unchanged";
      }

      console.log(`  → Updating existing document (${existing.id})`);
      console.log(`  → New version: ${(existing.currentVersion?.versionNo || 0) + 1}`);

      if (dryRun) {
        console.log(`  ✓ Would update document (dry run)\n`);
        return "updated";
      }

      await updateDocument(existing.id, {
        label: payload.label,
        description: payload.description,
        templateHtml: payload.templateHtml,
        versionLabel: payload.versionLabel,
        versionNotes: payload.versionNotes,
      });
      console.log(`  ✓ Updated with new version\n`);
      return "updated";
    } else {
      // Create new document
      console.log(`  → Creating new document`);

      if (dryRun) {
        console.log(`  ✓ Would create document (dry run)\n`);
        return "created";
      }

      const created = await createDocument(payload);
      console.log(`  → Created: ${created.id}`);

      // Set it as inactive (unpublished) for new documents
      await setDocumentInactive(created.id);
      console.log(`  ✓ Created as unpublished\n`);
      return "created";
    }
  } catch (error: any) {
    console.error(`  ✗ Failed: ${error.message}\n`);
    return "error";
  }
}

async function syncAll(files: string[], dryRun: boolean): Promise<void> {
  console.log(`\n📄 SOP Sync${dryRun ? " (DRY RUN)" : ""}`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Files: ${files.length}\n`);

  // Fetch existing templates to enable upsert
  let existingTemplates = new Map<string, ExistingTemplate>();
  if (!dryRun) {
    try {
      const templates = await fetchExistingTemplates();
      templates.forEach((t) => existingTemplates.set(t.code, t));
      console.log(`   Existing SOPs: ${existingTemplates.size}\n`);
    } catch (error: any) {
      console.error(`Warning: Could not fetch existing templates: ${error.message}`);
      console.log(`   Will create all as new\n`);
    }
  }

  const results = { created: 0, updated: 0, unchanged: 0, error: 0 };

  for (const filename of files) {
    const result = await syncFile(filename, existingTemplates, dryRun);
    results[result]++;
  }

  console.log("Summary:");
  console.log(`  Created: ${results.created}`);
  console.log(`  Updated: ${results.updated}`);
  console.log(`  Unchanged: ${results.unchanged}`);
  console.log(`  Errors: ${results.error}`);
  console.log("\nDone!");
}

// --- Watch Mode --------------------------------------------------------------

function startWatchMode(): void {
  console.log(`\n👀 SOP Watch Mode`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Watching: ${STAGING_DIR}`);
  console.log(`   Press Ctrl+C to stop\n`);

  let existingTemplates = new Map<string, ExistingTemplate>();
  let debounceTimer: NodeJS.Timeout | null = null;

  // Initial fetch of existing templates
  fetchExistingTemplates()
    .then((templates) => {
      templates.forEach((t) => existingTemplates.set(t.code, t));
      console.log(`   Loaded ${existingTemplates.size} existing SOPs\n`);
    })
    .catch((err) => {
      console.error(`Warning: Could not fetch existing templates: ${err.message}\n`);
    });

  fs.watch(STAGING_DIR, { persistent: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".md") || filename === "README.md") {
      return;
    }

    // Debounce rapid changes (e.g., editor auto-save)
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      console.log(`\n📝 Change detected: ${filename}`);

      // Refresh existing templates to get latest version numbers
      try {
        const templates = await fetchExistingTemplates();
        existingTemplates.clear();
        templates.forEach((t) => existingTemplates.set(t.code, t));
      } catch (err) {
        // Continue with stale data
      }

      await syncFile(filename, existingTemplates, false);
    }, 500);
  });
}

// --- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const watchMode = args.includes("--watch");
  const importAll = args.includes("--all");
  const fileIndex = args.indexOf("--file");
  const specificFile = fileIndex !== -1 ? args[fileIndex + 1] : null;

  if (!watchMode && !importAll && !specificFile) {
    console.log("Usage: import-sops.ts [--file <filename>] [--all] [--dry-run] [--watch]");
    console.log("");
    console.log("Options:");
    console.log("  --file <name>  Sync a specific SOP file");
    console.log("  --all          Sync all SOP files");
    console.log("  --dry-run      Preview without making changes");
    console.log("  --watch        Watch for changes and sync automatically");
    console.log("");
    console.log("Available SOPs:");
    listSopFiles().forEach((f) => console.log(`  - ${f}`));
    process.exit(0);
  }

  if (!dryRun && !API_TOKEN) {
    console.error("NEXUS_API_TOKEN environment variable is required");
    console.error("Get a token by logging in via the API or web app");
    process.exit(1);
  }

  if (watchMode) {
    startWatchMode();
    return; // Watch mode runs indefinitely
  }

  const files = specificFile ? [specificFile] : listSopFiles();
  await syncAll(files, dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
