/**
 * Import NCC Handbook as a structured Manual with individual chapter documents.
 *
 * This script:
 * 1. Parses HTML into individual chapters (by <div class="chapter">)
 * 2. Creates/updates the Manual record
 * 3. Creates ManualChapters for logical groupings
 * 4. Creates individual SystemDocuments for each chapter
 * 5. Links documents to chapters via ManualDocument
 * 6. On re-import, revs existing documents (new version) instead of duplicating
 *
 * Run with:
 *   ./scripts/prod-db-run-with-proxy.sh -- npx ts-node packages/database/src/import-handbook-chapters.ts
 *
 * Options:
 *   --dry-run       Preview what would be created/updated
 *   --clean         Remove existing handbook documents first (fresh start)
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import prisma from "./client";
import { GlobalRole, ManualStatus, Prisma } from "@prisma/client";

// Find repo root
function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return dir;
      } catch {}
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const HANDBOOK_PATH = path.join(REPO_ROOT, "docs/manuals/ncc-handbook-full.html");

// Manual metadata
const MANUAL_CODE = "NCC-CONTRACTOR-HANDBOOK";
const MANUAL_TITLE = "NCC Contractor Handbook";
const MANUAL_ICON = "📘";
const MANUAL_DESCRIPTION = "Progressive guide from first login to full enterprise mastery";

// Chapter groupings for ManualChapters
const CHAPTER_GROUPS = [
  { title: "Getting Started", chapters: ["ch1", "ch2", "ch3"] },
  { title: "Project Lifecycle", chapters: ["ch4", "ch5", "ch6", "ch7"] },
  { title: "Operations & Finance", chapters: ["ch8", "ch9", "ch10"] },
  { title: "Growth & Administration", chapters: ["ch11", "ch12", "ch13"] },
  { title: "Mobile & Support", chapters: ["ch14", "ch15"] },
  { title: "Appendices", chapters: ["appa", "appb", "appc"] },
];

interface ParsedChapter {
  id: string;           // e.g., "ch1", "appa"
  code: string;         // e.g., "NCC-HB-CH1", "NCC-HB-APPA"
  title: string;        // e.g., "Chapter 1: Welcome to Nexus Contractor Connect"
  htmlContent: string;  // Full HTML of the chapter div
  contentHash: string;
}

interface HandbookMeta {
  title: string;
  version: string;
  date: string;
}

function parseMetaTags(html: string): HandbookMeta {
  const titleMatch = html.match(/<meta\s+name="ncc:title"\s+content="([^"]*)"/i);
  const versionMatch = html.match(/Version:\s*([^\|<]+)/i);
  const dateMatch = html.match(/Date:\s*([^<\n]+)/i);

  return {
    title: titleMatch?.[1] || "NCC Contractor Handbook",
    version: versionMatch?.[1]?.trim() || "1.0",
    date: dateMatch?.[1]?.trim() || new Date().toISOString().split("T")[0],
  };
}

function extractStyles(html: string): string {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return styleMatch ? `<style>${styleMatch[1]}</style>` : "";
}

function parseChapters(html: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  const styles = extractStyles(html);

  // Match all chapter divs: <div id="ch1" class="chapter">...</div>
  const chapterRegex = /<div\s+id="([^"]+)"\s+class="chapter">([\s\S]*?)(?=<div\s+id="[^"]+"\s+class="chapter">|<\/body>)/gi;

  let match;
  while ((match = chapterRegex.exec(html)) !== null) {
    const id = match[1];
    const content = match[2].trim();

    // Extract title from first <h1>
    const titleMatch = content.match(/<h1>([^<]+)<\/h1>/i);
    const title = titleMatch?.[1]?.trim() || `Section ${id}`;

    // Generate document code
    const code = `NCC-HB-${id.toUpperCase()}`;

    // Wrap content with styles for standalone viewing
    const htmlContent = `${styles}\n<div class="chapter">\n${content}\n</div>`;

    chapters.push({
      id,
      code,
      title,
      htmlContent,
      contentHash: createHash("sha256").update(htmlContent).digest("hex"),
    });
  }

  return chapters;
}

function getChapterGroupTitle(chapterId: string): string | null {
  for (const group of CHAPTER_GROUPS) {
    if (group.chapters.includes(chapterId)) {
      return group.title;
    }
  }
  return null;
}

async function cleanExistingHandbook(dryRun: boolean) {
  console.log("\n--- Cleaning existing handbook documents ---");

  // Find all documents with NCC-HB- prefix or old handbook codes
  const existingDocs = await prisma.systemDocument.findMany({
    where: {
      OR: [
        { code: { startsWith: "NCC-HB-" } },
        { code: { startsWith: "NCC-HANDBOOK-FULL" } },
      ],
    },
    select: { id: true, code: true, title: true },
  });

  if (existingDocs.length === 0) {
    console.log("  No existing handbook documents found.");
    return;
  }

  console.log(`  Found ${existingDocs.length} existing documents to remove:`);
  for (const doc of existingDocs) {
    console.log(`    - ${doc.code}: ${doc.title}`);
  }

  if (dryRun) {
    console.log("  [DRY-RUN] Would delete these documents.");
    return;
  }

  // Delete in transaction
  await prisma.$transaction(async (tx) => {
    for (const doc of existingDocs) {
      // Delete manual document links
      await tx.manualDocument.deleteMany({
        where: { systemDocumentId: doc.id },
      });
      // Delete versions
      await tx.systemDocumentVersion.deleteMany({
        where: { systemDocumentId: doc.id },
      });
      // Delete document
      await tx.systemDocument.delete({
        where: { id: doc.id },
      });
    }
  });

  console.log(`  ✓ Deleted ${existingDocs.length} documents.`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const clean = args.includes("--clean");

  console.log("=".repeat(60));
  console.log("NCC Handbook Chapter Import");
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("*** DRY-RUN MODE - No changes will be made ***\n");
  }

  // Check file exists
  if (!fs.existsSync(HANDBOOK_PATH)) {
    console.error(`ERROR: Handbook file not found: ${HANDBOOK_PATH}`);
    process.exit(1);
  }

  // Read and parse HTML
  const htmlContent = fs.readFileSync(HANDBOOK_PATH, "utf8");
  const meta = parseMetaTags(htmlContent);
  const chapters = parseChapters(htmlContent);

  console.log(`Handbook: ${meta.title}`);
  console.log(`Version: ${meta.version} | Date: ${meta.date}`);
  console.log(`Parsed ${chapters.length} chapters:\n`);

  for (const ch of chapters) {
    const group = getChapterGroupTitle(ch.id) || "Ungrouped";
    console.log(`  [${group}] ${ch.code}: ${ch.title.substring(0, 50)}...`);
  }

  // Find admin user
  const adminUser = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.SUPER_ADMIN },
  });

  if (!adminUser) {
    console.error("\nERROR: No SUPER_ADMIN user found. Cannot proceed.");
    process.exit(1);
  }
  console.log(`\nUsing admin user: ${adminUser.email}`);

  // Clean existing if requested
  if (clean) {
    await cleanExistingHandbook(dryRun);
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] Would create/update:");
    console.log(`  - Manual: ${MANUAL_CODE}`);
    console.log(`  - ${CHAPTER_GROUPS.length} ManualChapters`);
    console.log(`  - ${chapters.length} SystemDocuments`);
    console.log("\nDone (dry-run).");
    return;
  }

  // Main transaction
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const stats = { docsCreated: 0, docsUpdated: 0, chaptersCreated: 0 };

    // 1. Create or find Manual
    let manual = await tx.manual.findUnique({
      where: { code: MANUAL_CODE },
    });

    if (!manual) {
      console.log(`\nCreating Manual: ${MANUAL_CODE}`);
      manual = await tx.manual.create({
        data: {
          code: MANUAL_CODE,
          title: MANUAL_TITLE,
          description: MANUAL_DESCRIPTION,
          status: ManualStatus.DRAFT,
          iconEmoji: MANUAL_ICON,
          isPublic: false,
          publishToAllTenants: false,
          createdByUserId: adminUser.id,
        },
      });
    } else {
      console.log(`\nFound existing Manual: ${MANUAL_CODE} (id: ${manual.id})`);
    }

    // 2. Create ManualChapters
    const chapterMap = new Map<string, string>(); // groupTitle -> chapterId

    for (let i = 0; i < CHAPTER_GROUPS.length; i++) {
      const group = CHAPTER_GROUPS[i];

      let chapter = await tx.manualChapter.findFirst({
        where: { manualId: manual.id, title: group.title, active: true },
      });

      if (!chapter) {
        chapter = await tx.manualChapter.create({
          data: {
            manualId: manual.id,
            title: group.title,
            sortOrder: i + 1,
          },
        });
        stats.chaptersCreated++;
        console.log(`  Created chapter: ${group.title}`);
      }

      chapterMap.set(group.title, chapter.id);
    }

    // 3. Create/update SystemDocuments and link to Manual
    console.log("\nProcessing documents...");

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const groupTitle = getChapterGroupTitle(ch.id);
      const chapterId = groupTitle ? chapterMap.get(groupTitle) : null;

      // Check for existing document
      let systemDoc = await tx.systemDocument.findUnique({
        where: { code: ch.code },
        include: { currentVersion: true },
      });

      if (!systemDoc) {
        // Create new document
        systemDoc = await tx.systemDocument.create({
          data: {
            code: ch.code,
            title: ch.title,
            description: `Part of the NCC Contractor Handbook`,
            category: "NCC Handbook",
            subcategory: groupTitle || "General",
            tags: ["handbook", "ncc", ch.id],
            active: true,
            isPublic: false,
            createdByUserId: adminUser.id,
          },
        });

        const version = await tx.systemDocumentVersion.create({
          data: {
            systemDocumentId: systemDoc.id,
            versionNo: 1,
            htmlContent: ch.htmlContent,
            contentHash: ch.contentHash,
            notes: `Initial import - ${meta.version}`,
            createdByUserId: adminUser.id,
          },
        });

        await tx.systemDocument.update({
          where: { id: systemDoc.id },
          data: { currentVersionId: version.id },
        });

        stats.docsCreated++;
        console.log(`  ✓ Created: ${ch.code}`);

      } else if (systemDoc.currentVersion?.contentHash !== ch.contentHash) {
        // Content changed - create new version
        const latestVersion = await tx.systemDocumentVersion.findFirst({
          where: { systemDocumentId: systemDoc.id },
          orderBy: { versionNo: "desc" },
        });

        const newVersionNo = (latestVersion?.versionNo ?? 0) + 1;

        const version = await tx.systemDocumentVersion.create({
          data: {
            systemDocumentId: systemDoc.id,
            versionNo: newVersionNo,
            htmlContent: ch.htmlContent,
            contentHash: ch.contentHash,
            notes: `Updated - ${meta.version}`,
            createdByUserId: adminUser.id,
          },
        });

        await tx.systemDocument.update({
          where: { id: systemDoc.id },
          data: {
            currentVersionId: version.id,
            title: ch.title,
          },
        });

        stats.docsUpdated++;
        console.log(`  ↑ Updated: ${ch.code} (v${newVersionNo})`);

      } else {
        console.log(`  - Unchanged: ${ch.code}`);
      }

      // 4. Link to Manual (if not already linked)
      const existingLink = await tx.manualDocument.findFirst({
        where: {
          manualId: manual.id,
          systemDocumentId: systemDoc.id,
          active: true,
        },
      });

      if (!existingLink) {
        await tx.manualDocument.create({
          data: {
            manualId: manual.id,
            chapterId: chapterId,
            systemDocumentId: systemDoc.id,
            sortOrder: i + 1,
            addedInManualVersion: manual.currentVersion,
          },
        });
      }
    }

    return { manual, stats };
  }, { timeout: 120000 });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Manual: ${result.manual.code} (${result.manual.id})`);
  console.log(`Chapters created: ${result.stats.chaptersCreated}`);
  console.log(`Documents created: ${result.stats.docsCreated}`);
  console.log(`Documents updated: ${result.stats.docsUpdated}`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
