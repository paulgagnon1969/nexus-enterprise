/**
 * Seed the NCC Programming Manual (NccPM) as a NEXUS-internal manual.
 * 
 * This creates the manual with:
 * - isNexusInternal: true
 * - requiredGlobalRoles: [SUPER_ADMIN, NCC_SYSTEM_DEVELOPER]
 * 
 * Run with: DATABASE_URL=postgresql://... npx ts-node src/seed-nccpm.ts
 */

import { GlobalRole, ManualVersionChangeType, Prisma } from "@prisma/client";
import prisma from "./client";

type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

async function main() {
  console.log("Seeding NCC Programming Manual (NccPM)...");

  // Check if manual already exists
  const existing = await prisma.manual.findUnique({
    where: { code: "nccpm" },
  });

  if (existing) {
    console.log("NccPM manual already exists, skipping creation.");
    console.log("Manual ID:", existing.id);
    return;
  }

  // Find a SUPER_ADMIN user to be the creator
  const adminUser = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.SUPER_ADMIN },
  });

  if (!adminUser) {
    console.error("No SUPER_ADMIN user found. Please create one first.");
    process.exit(1);
  }

  // Create the NccPM manual
  const manual = await prisma.$transaction(async (tx: TxClient) => {
    const newManual = await tx.manual.create({
      data: {
        code: "nccpm",
        title: "NCC Programming Manual (NccPM)",
        description:
          "The authoritative technical reference for the Nexus Control Center (NCC) application. " +
          "Documents system architecture, module specifications, design decisions, and development procedures. " +
          "Internal use only for NEXUS System developers.",
        iconEmoji: "📘",
        status: "PUBLISHED",
        currentVersion: 1,
        createdByUserId: adminUser.id,
        publishedAt: new Date(),
        // NEXUS-internal access control
        ownerCompanyId: null, // NEXUS System manual (not tenant-owned)
        isNexusInternal: true,
        requiredGlobalRoles: [GlobalRole.SUPER_ADMIN, GlobalRole.NCC_SYSTEM_DEVELOPER],
        // Not public, not distributed to tenants
        isPublic: false,
        publishToAllTenants: false,
      },
    });

    // Create initial version
    await tx.manualVersion.create({
      data: {
        manualId: newManual.id,
        version: 1,
        changeType: ManualVersionChangeType.INITIAL,
        changeNotes: "NccPM manual created",
        createdByUserId: adminUser.id,
        structureSnapshot: { chapters: [], documents: [] },
      },
    });

    // Create chapters matching the docs/nccpm structure
    const chapters = [
      { title: "Architecture", description: "System-wide design and patterns", sortOrder: 1 },
      { title: "Modules", description: "Feature-by-feature specifications", sortOrder: 2 },
      { title: "Architecture Decisions (ADRs)", description: "Records of significant technical decisions", sortOrder: 3 },
      { title: "Procedures", description: "Development workflows and processes", sortOrder: 4 },
      { title: "Session Logs", description: "Chronological development context", sortOrder: 5 },
    ];

    for (const ch of chapters) {
      await tx.manualChapter.create({
        data: {
          manualId: newManual.id,
          title: ch.title,
          description: ch.description,
          sortOrder: ch.sortOrder,
        },
      });
    }

    return newManual;
  });

  console.log("NccPM manual created successfully!");
  console.log("Manual ID:", manual.id);
  console.log("Code:", manual.code);
  console.log("Title:", manual.title);
  console.log("isNexusInternal:", manual.isNexusInternal);
  console.log("requiredGlobalRoles:", manual.requiredGlobalRoles);
}

main()
  .catch((e) => {
    console.error("Error seeding NccPM:", e);
    process.exit(1);
  });
