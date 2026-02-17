/**
 * Sync all staged SOPs to SystemDocument table (production-safe).
 * 
 * This script reads markdown files from docs/sops-staging and docs/policies,
 * parses them, and upserts into SystemDocument/SystemDocumentVersion tables.
 * Documents are created as unpublished and added to the NccPM manual.
 * 
 * Run with:
 *   ./scripts/prod-db-run-with-proxy.sh -- npx ts-node packages/database/src/sync-sops-to-production.ts
 * 
 * Or for dry-run:
 *   ./scripts/prod-db-run-with-proxy.sh -- npx ts-node packages/database/src/sync-sops-to-production.ts --dry-run
 */

import * as path from "path";
import * as fs from "fs";
import prisma from "./client";
import { parseAllSops, type ParsedSop } from "./sop-sync";
import { GlobalRole, Prisma } from "@prisma/client";

// Find repo root by looking for package.json with workspaces
function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) {
          return dir;
        }
      } catch {}
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume we're in repo root
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const STAGING_DIR = path.join(REPO_ROOT, "docs/sops-staging");
const POLICIES_DIR = path.join(REPO_ROOT, "docs/policies");
const SOURCE_DIRS = [STAGING_DIR, POLICIES_DIR];

const NCCPM_MANUAL_CODE = "nccpm";

interface SyncResult {
  code: string;
  title: string;
  action: "created" | "updated" | "unchanged" | "error";
  error?: string;
  systemDocumentId?: string;
}

/**
 * Map SOP module name to NccPM chapter title
 */
function getChapterTitleForModule(module: string): string | null {
  const moduleChapterMap: Record<string, string | null> = {
    // Feature SOPs
    "description-keeper": "Feature SOPs",
    "saved-phrases": "Feature SOPs",
    "document-import": "Feature SOPs",
    "daily-logs": "Feature SOPs",
    "invoicing": "Feature SOPs",
    "billing": "Feature SOPs",
    "timecard": "Feature SOPs",
    "user-management": "Feature SOPs",
    "supplier-bid-portal": "Feature SOPs",
    
    // Admin SOPs
    "admin": "Admin SOPs",
    "admin-only": "Admin SOPs",
    "system": "Admin SOPs",
    
    // Session Logs
    "session-log": "Session Logs",
    "development": "Session Logs",
    
    // General goes to root
    "general": null,
  };

  const lowerModule = module.toLowerCase();
  
  if (lowerModule in moduleChapterMap) {
    return moduleChapterMap[lowerModule];
  }

  for (const [key, chapter] of Object.entries(moduleChapterMap)) {
    if (lowerModule.includes(key) || key.includes(lowerModule)) {
      return chapter;
    }
  }

  // Default: Feature SOPs
  return "Feature SOPs";
}

async function syncSingleSop(
  sop: ParsedSop,
  adminUserId: string,
  nccpmManualId: string | null,
  dryRun: boolean
): Promise<SyncResult> {
  try {
    const existing = await prisma.systemDocument.findUnique({
      where: { code: sop.code },
      include: { currentVersion: true },
    });

    if (!existing) {
      // Create new document
      if (dryRun) {
        console.log(`  [DRY-RUN] Would CREATE: ${sop.code} - ${sop.frontmatter.title}`);
        return { code: sop.code, title: sop.frontmatter.title, action: "created" };
      }

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const doc = await tx.systemDocument.create({
          data: {
            code: sop.code,
            title: sop.frontmatter.title,
            description: `SOP for ${sop.frontmatter.module}`,
            category: "SOP",
            subcategory: sop.frontmatter.module,
            tags: sop.frontmatter.tags,
            active: true,
            isPublic: false,
            createdByUserId: adminUserId,
          },
        });

        const version = await tx.systemDocumentVersion.create({
          data: {
            systemDocumentId: doc.id,
            versionNo: 1,
            htmlContent: sop.htmlBody,
            contentHash: sop.contentHash,
            notes: `Rev ${sop.frontmatter.revision} - Synced from docs/sops-staging`,
            createdByUserId: adminUserId,
          },
        });

        await tx.systemDocument.update({
          where: { id: doc.id },
          data: { currentVersionId: version.id },
        });

        // Add to NccPM manual if it exists
        if (nccpmManualId) {
          const chapterTitle = getChapterTitleForModule(sop.frontmatter.module);
          let chapterId: string | null = null;

          if (chapterTitle) {
            const existingChapter = await tx.manualChapter.findFirst({
              where: {
                manualId: nccpmManualId,
                title: chapterTitle,
                active: true,
              },
            });

            if (existingChapter) {
              chapterId = existingChapter.id;
            } else {
              const maxOrder = await tx.manualChapter.aggregate({
                where: { manualId: nccpmManualId },
                _max: { sortOrder: true },
              });
              const newChapter = await tx.manualChapter.create({
                data: {
                  manualId: nccpmManualId,
                  title: chapterTitle,
                  sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
                },
              });
              chapterId = newChapter.id;
            }
          }

          // Check if already in manual
          const existingManualDoc = await tx.manualDocument.findFirst({
            where: {
              manualId: nccpmManualId,
              systemDocumentId: doc.id,
              active: true,
            },
          });

          if (!existingManualDoc) {
            const maxDocOrder = await tx.manualDocument.aggregate({
              where: { manualId: nccpmManualId, chapterId, active: true },
              _max: { sortOrder: true },
            });

            const manual = await tx.manual.findUnique({ where: { id: nccpmManualId } });

            await tx.manualDocument.create({
              data: {
                manualId: nccpmManualId,
                chapterId,
                systemDocumentId: doc.id,
                sortOrder: (maxDocOrder._max.sortOrder ?? 0) + 1,
                addedInManualVersion: manual?.currentVersion ?? 1,
              },
            });
          }
        }

        return doc;
      });

      console.log(`  ✓ CREATED: ${sop.code} - ${sop.frontmatter.title}`);
      return { code: sop.code, title: sop.frontmatter.title, action: "created", systemDocumentId: result.id };
    }

    // Check if content changed
    if (existing.currentVersion?.contentHash === sop.contentHash) {
      console.log(`  - UNCHANGED: ${sop.code}`);
      return { code: sop.code, title: sop.frontmatter.title, action: "unchanged", systemDocumentId: existing.id };
    }

    // Create new version
    if (dryRun) {
      console.log(`  [DRY-RUN] Would UPDATE: ${sop.code} - ${sop.frontmatter.title}`);
      return { code: sop.code, title: sop.frontmatter.title, action: "updated", systemDocumentId: existing.id };
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const latestVersion = await tx.systemDocumentVersion.findFirst({
        where: { systemDocumentId: existing.id },
        orderBy: { versionNo: "desc" },
      });

      const newVersionNo = (latestVersion?.versionNo ?? 0) + 1;

      const version = await tx.systemDocumentVersion.create({
        data: {
          systemDocumentId: existing.id,
          versionNo: newVersionNo,
          htmlContent: sop.htmlBody,
          contentHash: sop.contentHash,
          notes: `Rev ${sop.frontmatter.revision} - Synced from docs/sops-staging`,
          createdByUserId: adminUserId,
        },
      });

      await tx.systemDocument.update({
        where: { id: existing.id },
        data: {
          currentVersionId: version.id,
          title: sop.frontmatter.title,
          tags: sop.frontmatter.tags,
          subcategory: sop.frontmatter.module,
        },
      });

      // Flag tenant copies
      await tx.tenantDocumentCopy.updateMany({
        where: { sourceSystemDocumentId: existing.id },
        data: { hasNewerSystemVersion: true },
      });
    });

    console.log(`  ↑ UPDATED: ${sop.code} - ${sop.frontmatter.title}`);
    return { code: sop.code, title: sop.frontmatter.title, action: "updated", systemDocumentId: existing.id };

  } catch (err: any) {
    console.error(`  ✗ ERROR: ${sop.code} - ${err.message}`);
    return { code: sop.code, title: sop.frontmatter.title, action: "error", error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("SOP Sync to Production");
  console.log("=".repeat(60));
  
  if (dryRun) {
    console.log("*** DRY-RUN MODE - No changes will be made ***\n");
  }

  // Find admin user
  const adminUser = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.SUPER_ADMIN },
  });

  if (!adminUser) {
    console.error("ERROR: No SUPER_ADMIN user found. Cannot proceed.");
    process.exit(1);
  }
  console.log(`Using admin user: ${adminUser.email}\n`);

  // Find NccPM manual
  const nccpmManual = await prisma.manual.findUnique({
    where: { code: NCCPM_MANUAL_CODE },
  });
  const nccpmManualId = nccpmManual?.id ?? null;
  
  if (nccpmManualId) {
    console.log(`NccPM manual found: ${nccpmManualId}`);
  } else {
    console.log("NccPM manual not found - SOPs will be created without manual linkage");
  }
  console.log("");

  // Show paths being searched
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log(`Staging dir: ${STAGING_DIR}`);
  console.log(`Policies dir: ${POLICIES_DIR}\n`);

  // Collect all SOPs
  const allSops: ParsedSop[] = [];
  for (const dir of SOURCE_DIRS) {
    try {
      const sops = parseAllSops(dir);
      console.log(`Found ${sops.length} SOPs in ${path.basename(dir)}`);
      allSops.push(...sops);
    } catch (err) {
      console.log(`Skipping ${path.basename(dir)} (not found or empty)`);
    }
  }

  console.log(`\nTotal SOPs to sync: ${allSops.length}\n`);
  console.log("-".repeat(60));

  // Sync each SOP
  const results: SyncResult[] = [];
  for (const sop of allSops) {
    const result = await syncSingleSop(sop, adminUser.id, nccpmManualId, dryRun);
    results.push(result);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total:     ${results.length}`);
  console.log(`Created:   ${results.filter(r => r.action === "created").length}`);
  console.log(`Updated:   ${results.filter(r => r.action === "updated").length}`);
  console.log(`Unchanged: ${results.filter(r => r.action === "unchanged").length}`);
  console.log(`Errors:    ${results.filter(r => r.action === "error").length}`);

  if (results.some(r => r.action === "error")) {
    console.log("\nErrors:");
    for (const r of results.filter(r => r.action === "error")) {
      console.log(`  - ${r.code}: ${r.error}`);
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
