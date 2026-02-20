/**
 * Universal Manual Import Script
 * 
 * Imports any manual/booklet from HTML files. All metadata is read from
 * <meta name="ncc:..."> tags in the HTML - no hardcoded values.
 * 
 * Usage:
 *   npx ts-node src/import-manual.ts <path-to-html>
 *   npx ts-node src/import-manual.ts docs/manuals/irb-elmcreek.html
 *   npx ts-node src/import-manual.ts docs/manuals/*.html  # batch import
 * 
 * Options:
 *   --dry-run    Preview without making changes
 *   --set-public Auto-set isPublic=true and use public-slug
 * 
 * Required meta tags in HTML:
 *   ncc:manual-code    Unique identifier (e.g., "IRB-ELMCREEK")
 *   ncc:manual-title   Display title
 * 
 * Optional meta tags:
 *   ncc:manual-icon    Emoji icon (default: 📘)
 *   ncc:library        Library grouping (e.g., "Investor Relations")
 *   ncc:category       Category within library
 *   ncc:description    Brief description
 *   ncc:version        Version string (default: "1.0")
 *   ncc:date           Publication date
 *   ncc:author         Author name
 *   ncc:public         "true" to make publicly accessible
 *   ncc:public-slug    URL-friendly slug for public access
 *   ncc:project        Project name for filtering
 *   ncc:phase          Project phase
 *   ncc:document-type  Type (Prospectus, Pitch Deck, etc.)
 *   ncc:confidentiality Confidentiality level
 *   ncc:status         Draft, Approved, Archived
 *   ncc:tags           Comma-separated tags
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import prisma from "./client";
import { GlobalRole, ManualStatus, Prisma } from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

interface ManualMeta {
  // Required
  manualCode: string;
  manualTitle: string;
  
  // Optional with defaults
  manualIcon: string;
  library: string;
  category: string;
  description: string;
  version: string;
  date: string;
  author: string;
  isPublic: boolean;
  publicSlug: string | null;
  
  // Extended filtering
  project: string | null;
  phase: string | null;
  documentType: string | null;
  confidentiality: string | null;
  status: string;
  tags: string[];
}

interface ParsedChapter {
  id: string;
  code: string;
  title: string;
  htmlContent: string;
  contentHash: string;
}

// ============================================================================
// HTML Parsing
// ============================================================================

function extractMetaTag(html: string, name: string): string | null {
  // Match both formats: content="..." and content='...'
  const regex = new RegExp(
    `<meta\\s+name=["']ncc:${name}["']\\s+content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] || null;
}

function parseManualMeta(html: string, filePath: string): ManualMeta {
  const manualCode = extractMetaTag(html, "manual-code");
  const manualTitle = extractMetaTag(html, "manual-title");
  
  if (!manualCode) {
    throw new Error(`Missing required meta tag 'ncc:manual-code' in ${filePath}`);
  }
  if (!manualTitle) {
    throw new Error(`Missing required meta tag 'ncc:manual-title' in ${filePath}`);
  }
  
  const tagsRaw = extractMetaTag(html, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];
  
  // Add auto-tags based on other fields
  const library = extractMetaTag(html, "library");
  const documentType = extractMetaTag(html, "document-type");
  if (library && !tags.includes(library.toLowerCase())) {
    tags.push(library.toLowerCase().replace(/\s+/g, "-"));
  }
  if (documentType && !tags.includes(documentType.toLowerCase())) {
    tags.push(documentType.toLowerCase().replace(/\s+/g, "-"));
  }
  
  return {
    manualCode,
    manualTitle,
    manualIcon: extractMetaTag(html, "manual-icon") || "📘",
    library: library || "General",
    category: extractMetaTag(html, "category") || "Uncategorized",
    description: extractMetaTag(html, "description") || "",
    version: extractMetaTag(html, "version") || "1.0",
    date: extractMetaTag(html, "date") || new Date().toISOString().split("T")[0],
    author: extractMetaTag(html, "author") || "NEXUS Team",
    isPublic: extractMetaTag(html, "public")?.toLowerCase() === "true",
    publicSlug: extractMetaTag(html, "public-slug"),
    project: extractMetaTag(html, "project"),
    phase: extractMetaTag(html, "phase"),
    documentType: extractMetaTag(html, "document-type"),
    confidentiality: extractMetaTag(html, "confidentiality"),
    status: extractMetaTag(html, "status") || "Draft",
    tags,
  };
}

function extractStyles(html: string): string {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return styleMatch ? `<style>${styleMatch[1]}</style>` : "";
}

function parseChapters(html: string, manualCode: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  const styles = extractStyles(html);
  
  // Match chapter divs: <div id="ch1" class="chapter"> or <div class="chapter" id="ch1">
  const chapterRegex = /<div\s+(?:id="([^"]+)"\s+class="chapter"|class="chapter"\s+id="([^"]+)")>([\s\S]*?)(?=<div\s+(?:id="[^"]+"\s+class="chapter"|class="chapter"\s+id="[^"]+")>|<\/body>)/gi;
  
  let match;
  let index = 0;
  while ((match = chapterRegex.exec(html)) !== null) {
    const id = match[1] || match[2];
    const content = match[3].trim();
    
    // Extract title from first <h1>
    const titleMatch = content.match(/<h1>([^<]+)<\/h1>/i);
    const title = titleMatch?.[1]?.trim() || `Section ${index + 1}`;
    
    // Generate document code based on manual code
    const codePrefix = manualCode.replace(/-/g, "");
    const code = `${codePrefix}-${id.toUpperCase()}`;
    
    // Wrap content with styles for standalone viewing
    const htmlContent = `${styles}\n<div class="chapter">\n${content}\n</div>`;
    
    chapters.push({
      id,
      code,
      title,
      htmlContent,
      contentHash: createHash("sha256").update(htmlContent).digest("hex"),
    });
    
    index++;
  }
  
  return chapters;
}

// Auto-detect chapter groups based on chapter IDs
function inferChapterGroups(chapters: ParsedChapter[]): { title: string; chapters: string[] }[] {
  const groups: { title: string; chapters: string[] }[] = [];
  let currentGroup: { title: string; chapters: string[] } | null = null;
  
  for (const ch of chapters) {
    const id = ch.id.toLowerCase();
    
    // Detect appendices
    if (id.startsWith("app")) {
      if (!currentGroup || currentGroup.title !== "Appendices") {
        currentGroup = { title: "Appendices", chapters: [] };
        groups.push(currentGroup);
      }
      currentGroup.chapters.push(ch.id);
      continue;
    }
    
    // Extract chapter number
    const numMatch = id.match(/ch(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      
      // Group every 3-4 chapters
      const groupIndex = Math.floor((num - 1) / 4);
      const groupTitles = [
        "Getting Started",
        "Core Features",
        "Advanced Features",
        "Administration",
        "Reference",
      ];
      const groupTitle = groupTitles[groupIndex] || `Part ${groupIndex + 1}`;
      
      if (!currentGroup || currentGroup.title !== groupTitle) {
        currentGroup = { title: groupTitle, chapters: [] };
        groups.push(currentGroup);
      }
      currentGroup.chapters.push(ch.id);
    } else {
      // Unknown format - put in "General"
      if (!currentGroup || currentGroup.title !== "General") {
        currentGroup = { title: "General", chapters: [] };
        groups.push(currentGroup);
      }
      currentGroup.chapters.push(ch.id);
    }
  }
  
  return groups;
}

// ============================================================================
// Import Logic
// ============================================================================

async function importManual(
  filePath: string,
  options: { dryRun: boolean; setPublic: boolean }
): Promise<{ success: boolean; manualCode: string; error?: string }> {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(absolutePath)) {
    return { success: false, manualCode: "", error: `File not found: ${absolutePath}` };
  }
  
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Importing: ${path.basename(filePath)}`);
  console.log("─".repeat(60));
  
  const html = fs.readFileSync(absolutePath, "utf8");
  
  // Parse metadata
  let meta: ManualMeta;
  try {
    meta = parseManualMeta(html, filePath);
  } catch (e: any) {
    return { success: false, manualCode: "", error: e.message };
  }
  
  // Parse chapters
  const chapters = parseChapters(html, meta.manualCode);
  const chapterGroups = inferChapterGroups(chapters);
  
  // Display parsed info
  console.log(`\nManual: ${meta.manualCode}`);
  console.log(`Title:  ${meta.manualTitle}`);
  console.log(`Icon:   ${meta.manualIcon}`);
  console.log(`Library: ${meta.library} / ${meta.category}`);
  console.log(`Version: ${meta.version} (${meta.date})`);
  console.log(`Author:  ${meta.author}`);
  console.log(`Public:  ${meta.isPublic} ${meta.publicSlug ? `(slug: ${meta.publicSlug})` : ""}`);
  if (meta.project) console.log(`Project: ${meta.project} ${meta.phase || ""}`);
  if (meta.confidentiality) console.log(`Confidentiality: ${meta.confidentiality}`);
  console.log(`Tags: ${meta.tags.join(", ") || "(none)"}`);
  console.log(`\nChapters: ${chapters.length}`);
  for (const group of chapterGroups) {
    console.log(`  [${group.title}] ${group.chapters.length} items`);
  }
  
  if (options.dryRun) {
    console.log("\n[DRY-RUN] No changes made.");
    return { success: true, manualCode: meta.manualCode };
  }
  
  // Find admin user
  const adminUser = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.SUPER_ADMIN },
  });
  
  if (!adminUser) {
    return { success: false, manualCode: meta.manualCode, error: "No SUPER_ADMIN user found" };
  }
  
  // Import transaction
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const stats = { docsCreated: 0, docsUpdated: 0, chaptersCreated: 0 };
    
    // 1. Create or find Manual
    let manual = await tx.manual.findUnique({
      where: { code: meta.manualCode },
    });
    
    const shouldBePublic = options.setPublic || meta.isPublic;
    const slug = meta.publicSlug || meta.manualCode.toLowerCase();
    
    if (!manual) {
      console.log(`\nCreating Manual: ${meta.manualCode}`);
      manual = await tx.manual.create({
        data: {
          code: meta.manualCode,
          title: meta.manualTitle,
          description: meta.description,
          status: ManualStatus.DRAFT,
          iconEmoji: meta.manualIcon,
          isPublic: shouldBePublic,
          publicSlug: shouldBePublic ? slug : null,
          publishToAllTenants: false,
          createdByUserId: adminUser.id,
        },
      });
    } else {
      console.log(`\nFound existing Manual: ${meta.manualCode}`);
      // Update if needed
      if (shouldBePublic !== manual.isPublic || manual.title !== meta.manualTitle) {
        await tx.manual.update({
          where: { id: manual.id },
          data: {
            title: meta.manualTitle,
            description: meta.description,
            iconEmoji: meta.manualIcon,
            isPublic: shouldBePublic,
            publicSlug: shouldBePublic ? slug : manual.publicSlug,
          },
        });
        console.log(`  Updated manual metadata`);
      }
    }
    
    // 2. Create ManualChapters
    const chapterMap = new Map<string, string>();
    
    for (let i = 0; i < chapterGroups.length; i++) {
      const group = chapterGroups[i];
      
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
      }
      
      chapterMap.set(group.title, chapter.id);
    }
    
    if (stats.chaptersCreated > 0) {
      console.log(`  Created ${stats.chaptersCreated} chapter groups`);
    }
    
    // Helper to find chapter group for a chapter id
    function getChapterGroupTitle(chapterId: string): string | null {
      for (const group of chapterGroups) {
        if (group.chapters.includes(chapterId)) {
          return group.title;
        }
      }
      return null;
    }
    
    // 3. Create/update SystemDocuments
    console.log("\nProcessing documents...");
    
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const groupTitle = getChapterGroupTitle(ch.id);
      const chapterId = groupTitle ? chapterMap.get(groupTitle) : null;
      
      let systemDoc = await tx.systemDocument.findUnique({
        where: { code: ch.code },
        include: { currentVersion: true },
      });
      
      if (!systemDoc) {
        // Create new document
        const newDoc = await tx.systemDocument.create({
          data: {
            code: ch.code,
            title: ch.title,
            description: `Part of ${meta.manualTitle}`,
            category: meta.library,
            subcategory: meta.category,
            tags: [...meta.tags, ch.id],
            active: true,
            isPublic: shouldBePublic,
            createdByUserId: adminUser.id,
          },
        });
        
        const version = await tx.systemDocumentVersion.create({
          data: {
            systemDocumentId: newDoc.id,
            versionNo: 1,
            htmlContent: ch.htmlContent,
            contentHash: ch.contentHash,
            notes: `Initial import - v${meta.version}`,
            createdByUserId: adminUser.id,
          },
        });
        
        await tx.systemDocument.update({
          where: { id: newDoc.id },
          data: { currentVersionId: version.id },
        });
        
        // Link to Manual
        await tx.manualDocument.create({
          data: {
            manualId: manual.id,
            chapterId: chapterId,
            systemDocumentId: newDoc.id,
            sortOrder: i + 1,
            addedInManualVersion: manual.currentVersion,
          },
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
            notes: `Updated - v${meta.version}`,
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
        
        // Ensure link exists
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
    }
    
    return { manual, stats };
  });
  
  console.log(`\n✓ Import complete`);
  console.log(`  Documents created: ${result.stats.docsCreated}`);
  console.log(`  Documents updated: ${result.stats.docsUpdated}`);
  console.log(`  Chapter groups: ${result.stats.chaptersCreated} new`);
  
  if (result.manual.isPublic && result.manual.publicSlug) {
    console.log(`\n  Public URL: /manuals/${result.manual.publicSlug}`);
  }
  
  return { success: true, manualCode: meta.manualCode };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const setPublic = args.includes("--set-public");
  
  // Filter out flags to get file paths
  const files = args.filter(a => !a.startsWith("--"));
  
  if (files.length === 0) {
    console.log(`
Universal Manual Import Script
==============================

Usage:
  npx ts-node src/import-manual.ts <file.html> [options]
  npx ts-node src/import-manual.ts docs/manuals/*.html

Options:
  --dry-run      Preview without making changes
  --set-public   Force manual to be publicly accessible

Required HTML meta tags:
  <meta name="ncc:manual-code" content="IRB-ELMCREEK" />
  <meta name="ncc:manual-title" content="Elm Creek Prospectus" />

Optional HTML meta tags:
  ncc:manual-icon, ncc:library, ncc:category, ncc:description,
  ncc:version, ncc:date, ncc:author, ncc:public, ncc:public-slug,
  ncc:project, ncc:phase, ncc:document-type, ncc:confidentiality,
  ncc:status, ncc:tags
`);
    process.exit(0);
  }
  
  console.log("═".repeat(60));
  console.log("Universal Manual Import");
  console.log("═".repeat(60));
  
  if (dryRun) {
    console.log("*** DRY-RUN MODE ***");
  }
  
  const results: { file: string; success: boolean; code: string; error?: string }[] = [];
  
  for (const file of files) {
    const result = await importManual(file, { dryRun, setPublic });
    results.push({ file, success: result.success, code: result.manualCode, error: result.error });
  }
  
  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("SUMMARY");
  console.log("═".repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total files: ${results.length}`);
  console.log(`Successful:  ${successful.length}`);
  console.log(`Failed:      ${failed.length}`);
  
  if (failed.length > 0) {
    console.log("\nFailed imports:");
    for (const f of failed) {
      console.log(`  ✗ ${f.file}: ${f.error}`);
    }
  }
  
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
