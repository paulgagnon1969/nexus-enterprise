/**
 * Seed script: FeatureAnnouncement
 *
 * Creates the initial NexBRIDGE feature announcements for the
 * Intelligent Feature Discovery system.
 *
 * Usage:
 *   cd packages/database
 *   npx ts-node seed/seed-feature-announcements.ts
 */

import prisma from "../src/client";

const ANNOUNCEMENTS = [
  {
    moduleCode: "NEXBRIDGE",
    camId: null,
    title: "NexBRIDGE Desktop Companion",
    description:
      "Run powerful desktop-class tools alongside NCC. NexBRIDGE connects your workstation to the cloud — enabling local file processing, AI-assisted workflows, and seamless data sync. Available for macOS and Windows.",
    ctaLabel: "Download NexBRIDGE",
    ctaUrl: "/downloads",
    sortOrder: 0,
    targetRoles: ["OWNER", "ADMIN"],
  },
  {
    moduleCode: "NEXBRIDGE_ASSESS",
    camId: null,
    title: "AI Video Property Assessment",
    description:
      "Walk a property with your phone and let AI identify damage, measure areas, and auto-generate a preliminary scope. Integrates with Xactimate line items for instant estimate creation.",
    ctaLabel: "Enable Module",
    ctaUrl: "/settings/billing",
    sortOrder: 1,
    targetRoles: ["OWNER", "ADMIN"],
  },
  {
    moduleCode: "NEXBRIDGE_NEXPLAN",
    camId: null,
    title: "NexPLAN Selections & Planning",
    description:
      "Manage material selections, room-by-room planning, and vendor product specs. Homeowners can view and approve selections through the Collaborator portal.",
    ctaLabel: "Enable Module",
    ctaUrl: "/settings/billing",
    sortOrder: 2,
    targetRoles: ["OWNER", "ADMIN"],
  },
  {
    moduleCode: "NEXBRIDGE_AI",
    camId: null,
    title: "NexBRIDGE AI Features",
    description:
      "Unlock AI-powered document analysis, smart categorization, predictive scheduling, and natural-language search across your project data. Requires NexBRIDGE base module.",
    ctaLabel: "Enable Module",
    ctaUrl: "/settings/billing",
    sortOrder: 3,
    targetRoles: ["OWNER", "ADMIN"],
  },
];

async function main() {
  console.log("Seeding feature announcements…");

  for (const a of ANNOUNCEMENTS) {
    const existing = await prisma.featureAnnouncement.findFirst({
      where: { moduleCode: a.moduleCode },
    });

    if (existing) {
      console.log(`  ⏭  ${a.title} (${a.moduleCode}) — already exists, skipping`);
      continue;
    }

    await prisma.featureAnnouncement.create({
      data: {
        moduleCode: a.moduleCode,
        camId: a.camId,
        title: a.title,
        description: a.description,
        ctaLabel: a.ctaLabel,
        ctaUrl: a.ctaUrl,
        sortOrder: a.sortOrder,
        targetRoles: a.targetRoles,
        active: true,
      },
    });

    console.log(`  ✅ ${a.title} (${a.moduleCode})`);
  }

  console.log("Done — seeded feature announcements.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
