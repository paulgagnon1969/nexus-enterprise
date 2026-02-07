/**
 * Seed SOPs from docs/sops-staging/ into the database
 * 
 * Usage: npx ts-node src/seed-sops.ts
 * 
 * This script reads markdown files from docs/sops-staging/,
 * parses the frontmatter, and creates staged documents with
 * the 'sop' tag so they appear in the Unpublished SOPs section.
 */

import prisma from "./client";
import { StagedDocumentStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

interface SOPFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: string;
  created: string;
  updated: string;
  author: string;
}

function parseFrontmatter(content: string): { frontmatter: SOPFrontmatter; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error("No frontmatter found");
  }

  const frontmatterStr = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Simple YAML parser for our known structure
  const frontmatter: any = {};
  const lines = frontmatterStr.split("\n");
  
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    
    // Handle arrays like [sop, document-import, admin]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1);
      frontmatter[key] = value.split(",").map((s: string) => s.trim());
    } 
    // Handle quoted strings
    else if (value.startsWith('"') && value.endsWith('"')) {
      frontmatter[key] = value.slice(1, -1);
    }
    else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter: frontmatter as SOPFrontmatter, body };
}

async function seedSOPs() {
  console.log("🔍 Looking for SOPs in docs/sops-staging/...\n");

  // Find the repo root (go up from packages/database)
  const repoRoot = path.resolve(__dirname, "../../../");
  const sopsDir = path.join(repoRoot, "docs/sops-staging");

  if (!fs.existsSync(sopsDir)) {
    console.error(`❌ Directory not found: ${sopsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(sopsDir).filter(f => f.endsWith(".md") && f !== "README.md");
  console.log(`📁 Found ${files.length} SOP files\n`);

  // Get the first company to seed SOPs into (for dev purposes)
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!company) {
    console.error("❌ No company found in database. Please create one first.");
    process.exit(1);
  }

  // Find an admin/owner user to attribute the import to
  const user = await prisma.user.findFirst({
    where: {
      memberships: {
        some: {
          companyId: company.id,
          role: { in: ["OWNER", "ADMIN"] },
        },
      },
    },
  });

  if (!user) {
    console.error("❌ No admin/owner user found. Please create one first.");
    process.exit(1);
  }

  // Create or find a scan job for SOP imports
  let scanJob = await prisma.documentScanJob.findFirst({
    where: {
      companyId: company.id,
      scanPath: "docs/sops-staging",
    },
  });

  if (!scanJob) {
    scanJob = await prisma.documentScanJob.create({
      data: {
        company: { connect: { id: company.id } },
        createdBy: { connect: { id: user.id } },
        scanPath: "docs/sops-staging",
        status: "COMPLETED",
        documentsFound: files.length,
        documentsProcessed: files.length,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    console.log(`📋 Created scan job: ${scanJob.id}`);
  } else {
    console.log(`📋 Using existing scan job: ${scanJob.id}`);
  }

  console.log(`🏢 Seeding SOPs into company: ${company.name} (${company.id})\n`);

  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(sopsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    try {
      const { frontmatter, body } = parseFrontmatter(content);
      
      // Check if this SOP already exists (by filename)
      const existing = await prisma.stagedDocument.findFirst({
        where: {
          companyId: company.id,
          fileName: file,
          tags: { has: "sop" },
        },
      });

      if (existing) {
        console.log(`⏭️  Skipping (already exists): ${frontmatter.title}`);
        skipped++;
        continue;
      }

      // Ensure 'sop' is in tags
      const tags = [...new Set(["sop", ...(frontmatter.tags || [])])];

      // Create the staged document
      await prisma.stagedDocument.create({
        data: {
          company: { connect: { id: company.id } },
          scanJob: { connect: { id: scanJob.id } },
          scannedBy: { connect: { id: user.id } },
          fileName: file,
          filePath: filePath,
          fileType: "md",
          fileSize: BigInt(Buffer.byteLength(content, "utf-8")),
          mimeType: "text/markdown",
          breadcrumb: ["docs", "sops-staging", file],
          status: StagedDocumentStatus.ACTIVE, // Unpublished/draft
          scannedAt: new Date(),
          // SOP-specific metadata
          displayTitle: frontmatter.title,
          displayDescription: body.slice(0, 500).replace(/^#.*\n/, "").trim(),
          tags: tags,
          category: "sop",
          revisionNumber: parseFloat(frontmatter.revision) || 1,
          revisionNotes: `Initial import from ${file}`,
        },
      });

      console.log(`✅ Created: ${frontmatter.title} (Rev ${frontmatter.revision})`);
      console.log(`   Tags: ${tags.join(", ")}`);
      created++;
    } catch (err: any) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
    }
  }

  console.log(`\n📊 Summary: ${created} created, ${skipped} skipped`);
  console.log("\n✨ SOPs seeded! They will appear in Admin → Documents → Unpublished SOPs");
}

seedSOPs()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
