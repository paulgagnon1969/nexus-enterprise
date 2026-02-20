/**
 * Import NCC Handbook HTML as a Manual with SystemDocument.
 *
 * This script:
 * 1. Parses the HTML file metadata (ncc:* meta tags)
 * 2. Creates or updates the Manual record
 * 3. Creates or updates the SystemDocument with full HTML content
 * 4. Links the document to the manual
 *
 * Run with:
 *   ./scripts/prod-db-run-with-proxy.sh -- npx ts-node packages/database/src/import-ncc-handbook.ts
 *
 * Or dry-run:
 *   ./scripts/prod-db-run-with-proxy.sh -- npx ts-node packages/database/src/import-ncc-handbook.ts --dry-run
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

interface HandbookMeta {
  code: string;
  title: string;
  description: string;
  category: string;
  manualCode: string;
  manualTitle: string;
  manualIcon: string;
}

function parseMetaTags(html: string): HandbookMeta {
  const getMeta = (name: string): string => {
    const match = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "i"));
    return match?.[1] ?? "";
  };

  return {
    code: getMeta("ncc:code") || "NCC-HANDBOOK-FULL",
    title: getMeta("ncc:title") || "NCC Contractor Handbook",
    description: getMeta("ncc:description") || "",
    category: getMeta("ncc:category") || "Handbook",
    manualCode: getMeta("ncc:manual-code") || "ncc-handbook",
    manualTitle: getMeta("ncc:manual-title") || "NCC Contractor Handbook",
    manualIcon: getMeta("ncc:manual-icon") || "📘",
  };
}

function extractBodyContent(html: string): string {
  // Extract just the body content for storage
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }
  return html;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log("=".repeat(60));
  console.log("NCC Handbook Import to Production");
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
  const bodyContent = extractBodyContent(htmlContent);
  const contentHash = hashContent(bodyContent);

  console.log("Parsed metadata:");
  console.log(`  Document Code: ${meta.code}`);
  console.log(`  Document Title: ${meta.title}`);
  console.log(`  Manual Code: ${meta.manualCode}`);
  console.log(`  Manual Title: ${meta.manualTitle}`);
  console.log(`  Content Hash: ${contentHash.slice(0, 16)}...`);
  console.log(`  Content Length: ${bodyContent.length} chars\n`);

  // Find admin user
  const adminUser = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.SUPER_ADMIN },
  });

  if (!adminUser) {
    console.error("ERROR: No SUPER_ADMIN user found. Cannot proceed.");
    process.exit(1);
  }
  console.log(`Using admin user: ${adminUser.email}\n`);

  if (dryRun) {
    console.log("[DRY-RUN] Would create/update:");
    console.log(`  - Manual: ${meta.manualCode} (${meta.manualTitle})`);
    console.log(`  - SystemDocument: ${meta.code} (${meta.title})`);
    console.log("\nDone (dry-run).");
    return;
  }

  // Transaction: create/update manual and document
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Create or find Manual
    let manual = await tx.manual.findUnique({
      where: { code: meta.manualCode },
    });

    if (!manual) {
      console.log(`Creating new Manual: ${meta.manualCode}`);
      manual = await tx.manual.create({
        data: {
          code: meta.manualCode,
          title: meta.manualTitle,
          description: meta.description,
          status: ManualStatus.DRAFT,
          iconEmoji: meta.manualIcon,
          isPublic: false,
          publishToAllTenants: false,
          createdByUserId: adminUser.id,
        },
      });
    } else {
      console.log(`Found existing Manual: ${meta.manualCode} (id: ${manual.id})`);
    }

    // 2. Create or update SystemDocument
    let systemDoc = await tx.systemDocument.findUnique({
      where: { code: meta.code },
      include: { currentVersion: true },
    });

    let docAction: "created" | "updated" | "unchanged" = "unchanged";

    let createdDocId: string | null = null;

    if (!systemDoc) {
      // Create new document and version
      console.log(`Creating new SystemDocument: ${meta.code}`);

      const newDoc = await tx.systemDocument.create({
        data: {
          code: meta.code,
          title: meta.title,
          description: meta.description,
          category: meta.category,
          tags: ["handbook", "ncc", "user-guide"],
          active: true,
          isPublic: false,
          createdByUserId: adminUser.id,
        },
      });
      createdDocId = newDoc.id;

      const version = await tx.systemDocumentVersion.create({
        data: {
          systemDocumentId: newDoc.id,
          versionNo: 1,
          htmlContent: bodyContent,
          contentHash,
          notes: "Initial import from HTML",
          createdByUserId: adminUser.id,
        },
      });

      await tx.systemDocument.update({
        where: { id: newDoc.id },
        data: { currentVersionId: version.id },
      });

      docAction = "created";
    } else if (systemDoc.currentVersion?.contentHash !== contentHash) {
      // Content changed - create new version
      console.log(`Updating SystemDocument: ${meta.code} (content changed)`);

      const latestVersion = await tx.systemDocumentVersion.findFirst({
        where: { systemDocumentId: systemDoc.id },
        orderBy: { versionNo: "desc" },
      });

      const newVersionNo = (latestVersion?.versionNo ?? 0) + 1;

      const version = await tx.systemDocumentVersion.create({
        data: {
          systemDocumentId: systemDoc.id,
          versionNo: newVersionNo,
          htmlContent: bodyContent,
          contentHash,
          notes: `Updated import (v${newVersionNo})`,
          createdByUserId: adminUser.id,
        },
      });

      await tx.systemDocument.update({
        where: { id: systemDoc.id },
        data: {
          currentVersionId: version.id,
          title: meta.title,
          description: meta.description,
        },
      });

      docAction = "updated";
    } else {
      console.log(`SystemDocument unchanged: ${meta.code}`);
    }

    // 3. Link document to manual (if not already linked)
    const docIdToLink = createdDocId || systemDoc?.id;
    if (!docIdToLink) {
      throw new Error("No document ID to link");
    }

    const existingLink = await tx.manualDocument.findFirst({
      where: {
        manualId: manual.id,
        systemDocumentId: docIdToLink,
        active: true,
      },
    });

    if (!existingLink) {
      console.log(`Linking document to manual...`);

      const maxOrder = await tx.manualDocument.aggregate({
        where: { manualId: manual.id, active: true },
        _max: { sortOrder: true },
      });

      await tx.manualDocument.create({
        data: {
          manualId: manual.id,
          systemDocumentId: docIdToLink,
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
          addedInManualVersion: manual.currentVersion,
        },
      });
    } else {
      console.log(`Document already linked to manual`);
    }

    return {
      manual,
      systemDocId: docIdToLink,
      docAction,
    };
  });

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Manual ID: ${result.manual.id}`);
  console.log(`Manual Code: ${result.manual.code}`);
  console.log(`Document ID: ${result.systemDocId}`);
  console.log(`Document Action: ${result.docAction}`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
