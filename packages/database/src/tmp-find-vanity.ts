import { prisma } from "./index";

async function findVanity() {
  const projectId = "cmjwjdojx000b01s68ew1wjjw";

  const ev = await prisma.estimateVersion.findFirst({
    where: { projectId },
    orderBy: [{ sequenceNo: "desc" }, { importedAt: "desc" }],
    select: { id: true, versionLabel: true, sequenceNo: true },
  });

  console.log("Latest EstimateVersion:", ev);
  if (!ev) return;

  // Find items matching "Vanity" description
  const vanityItems = await prisma.sowItem.findMany({
    where: {
      estimateVersionId: ev.id,
      description: { contains: "Vanity", mode: "insensitive" },
    },
    select: {
      id: true,
      lineNo: true,
      description: true,
      categoryCode: true,
      selectionCode: true,
      logicalItemId: true,
      rawRow: { select: { lineNo: true } },
    },
  });

  console.log("\nVanity items found:");
  for (const it of vanityItems) {
    console.log({
      petlLineNo: it.lineNo,
      xactLineNo: it.rawRow?.lineNo,
      description: it.description,
      cat: it.categoryCode,
      sel: it.selectionCode,
      id: it.id,
    });
  }

  // Also check line 117 specifically
  const line117 = await prisma.sowItem.findFirst({
    where: { estimateVersionId: ev.id, lineNo: 117 },
    select: {
      id: true,
      lineNo: true,
      description: true,
      categoryCode: true,
      logicalItemId: true,
      rawRow: { select: { lineNo: true } },
    },
  });

  console.log("\nPETL line 117:", line117);

  // Check if there are any reconciliation entries for Vanity items
  for (const it of vanityItems) {
    const reconCase = await prisma.petlReconciliationCase.findFirst({
      where: {
        projectId,
        OR: [{ sowItemId: it.id }, { logicalItemId: it.logicalItemId }],
      },
      include: { entries: true },
    });

    if (reconCase) {
      console.log(`\nRecon case for lineNo ${it.lineNo}:`, {
        caseId: reconCase.id,
        entries: reconCase.entries.map((e) => ({
          kind: e.kind,
          note: e.note,
          rcvAmount: e.rcvAmount,
        })),
      });
    }
  }
}

findVanity()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
