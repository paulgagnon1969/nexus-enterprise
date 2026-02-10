import { prisma } from "./index";

async function investigate() {
  const projectId = "cmjwjdojx000b01s68ew1wjjw";

  const ev = await prisma.estimateVersion.findFirst({
    where: { projectId },
    orderBy: [{ sequenceNo: "desc" }, { importedAt: "desc" }],
    select: { id: true, versionLabel: true, sequenceNo: true },
  });

  console.log("Latest EstimateVersion:", ev);

  if (!ev) {
    console.log("No estimate version found");
    return;
  }

  const sowItem = await prisma.sowItem.findFirst({
    where: { estimateVersionId: ev.id, lineNo: 117 },
    select: {
      id: true,
      lineNo: true,
      logicalItemId: true,
      description: true,
      categoryCode: true,
      selectionCode: true,
      rawRow: { select: { lineNo: true } },
    },
  });

  console.log("\nSowItem lineNo=117:", sowItem);

  if (!sowItem) {
    console.log("No SowItem found for lineNo 117");
    return;
  }

  // Check for reconciliation cases
  const cases = await prisma.petlReconciliationCase.findMany({
    where: {
      projectId,
      OR: [{ sowItemId: sowItem.id }, { logicalItemId: sowItem.logicalItemId }],
    },
    include: { entries: true },
  });

  console.log("\nReconciliation Cases:", JSON.stringify(cases, null, 2));

  // Check all entries for this project to see if any reference line 117
  const allEntries = await prisma.petlReconciliationEntry.findMany({
    where: { projectId },
    select: {
      id: true,
      parentSowItemId: true,
      kind: true,
      note: true,
      sourceSnapshotJson: true,
      parentSowItem: { select: { lineNo: true } },
    },
  });

  console.log("\nAll entries for project:", JSON.stringify(allEntries, null, 2));
}

investigate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
