import { prisma } from "@repo/database";

async function main() {
  const projectId = process.argv[2];
  const companyId = process.argv[3];

  if (!projectId || !companyId) {
    console.error("Usage: ts-node scripts/debug-petl-for-project.ts <projectId> <companyId>");
    process.exit(1);
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      console.error("Project not found in this company", { projectId, companyId });
      process.exit(1);
    }

    console.log("Project:", {
      id: project.id,
      name: project.name,
      status: project.status,
    });

    // Mirror getPetlForProject() logic to see what estimateVersion it selects.
    let latestVersion = await prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

    if (!latestVersion) {
      console.log("No estimate versions found for this project.");
      return;
    }

    console.log("Latest estimateVersion:", {
      id: latestVersion.id,
      sequenceNo: latestVersion.sequenceNo,
      importedAt: latestVersion.importedAt,
      createdAt: latestVersion.createdAt,
    });

    const itemCount = await prisma.sowItem.count({
      where: { estimateVersionId: latestVersion.id },
    });

    console.log("SOW item count for latest version:", itemCount);

    if (itemCount > 0) {
      const sampleItems = await prisma.sowItem.findMany({
        where: { estimateVersionId: latestVersion.id },
        orderBy: { lineNo: "asc" },
        take: 5,
        include: { projectParticle: true },
      });
      console.log(
        "Sample PETL items:",
        sampleItems.map((i: any) => ({
          id: i.id,
          lineNo: i.lineNo,
          categoryCode: i.categoryCode,
          selectionCode: i.selectionCode,
          activity: i.activity,
          description: i.description,
          rcvAmount: i.rcvAmount,
        })),
      );
    }
  } catch (err) {
    console.error("Error in debug-petl-for-project:", err);
    process.exit(1);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

main().catch((err) => {
  console.error("Fatal error in debug-petl-for-project:", err);
  process.exit(1);
});
