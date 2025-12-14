import { prisma } from "./index";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: ts-node src/debug-list-component-allocations.ts <estimateVersionId> [componentPrefix]"
    );
    process.exit(1);
  }

  const estimateVersionId = String(args[0] ?? "");
  const componentPrefix = (args[1] ?? "DRY").toString();

  const estimateVersion = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true }
  });

  if (!estimateVersion) {
    console.error("EstimateVersion not found:", estimateVersionId);
    process.exit(1);
  }

  const project = estimateVersion.project;

  console.log("EstimateVersion:", estimateVersionId);
  console.log("Project:", project.id, "-", project.name);
  console.log("Component prefix:", componentPrefix);
  console.log("---");

  const components = await prisma.componentSummary.findMany({
    where: {
      estimateVersionId,
      code: {
        startsWith: componentPrefix,
        mode: "insensitive"
      }
    },
    orderBy: { code: "asc" }
  });

  if (components.length === 0) {
    console.log("No ComponentSummary rows found for prefix", componentPrefix);
    process.exit(0);
  }

  const allocations = await prisma.sowComponentAllocation.findMany({
    where: {
      estimateVersionId,
      code: {
        startsWith: componentPrefix,
        mode: "insensitive"
      }
    },
    include: {
      sowItem: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          categoryCode: true,
          itemAmount: true,
          rcvAmount: true
        }
      },
      componentSummary: {
        select: {
          id: true,
          code: true,
          description: true,
          quantity: true,
          total: true
        }
      }
    },
    orderBy: [{ code: "asc" }, { sowItemId: "asc" }]
  });

  if (allocations.length === 0) {
    console.log("No SowComponentAllocation rows found for prefix", componentPrefix);
    process.exit(0);
  }

  // Summaries per code
  const componentByCode = new Map<string, typeof components[number]>();
  for (const comp of components) {
    componentByCode.set(comp.code, comp);
  }

  type CodeSummary = {
    componentCode: string;
    componentTotal: number;
    allocatedTotal: number;
    componentQuantity: number | null;
    allocatedQuantity: number | null;
  };

  const summariesByCode = new Map<string, CodeSummary>();

  for (const alloc of allocations) {
    const code = alloc.code;
    const comp = componentByCode.get(code);
    const key = code;
    const existing = summariesByCode.get(key) || {
      componentCode: code,
      componentTotal: comp?.total ?? 0,
      allocatedTotal: 0,
      componentQuantity: comp?.quantity ?? null,
      allocatedQuantity: null as number | null
    };

    existing.allocatedTotal += alloc.total ?? 0;
    if (alloc.quantity != null) {
      existing.allocatedQuantity =
        (existing.allocatedQuantity ?? 0) + alloc.quantity;
    }

    summariesByCode.set(key, existing);
  }

  console.log("Per-code summary (component vs allocated totals):");
  for (const summary of Array.from(summariesByCode.values()).sort((a, b) =>
    a.componentCode.localeCompare(b.componentCode)
  )) {
    const diff = summary.allocatedTotal - summary.componentTotal;
    console.log(
      `  Code ${summary.componentCode}: componentTotal=${summary.componentTotal.toFixed(
        2
      )}, allocatedTotal=${summary.allocatedTotal.toFixed(2)}, diff=${diff.toFixed(
        2
      )}`
    );
  }

  console.log("---");
  console.log("Sample allocations (first 25 rows):");

  for (const alloc of allocations.slice(0, 25)) {
    const s = alloc.sowItem;
    console.log(
      `  code=${alloc.code}, lineNo=${s.lineNo}, cat=${s.categoryCode}, desc=${
        s.description
      }, allocTotal=${alloc.total?.toFixed(2) ?? "0.00"}, basis=${
        alloc.allocationBasis
      }`
    );
  }

  console.log("---");
  console.log("Total allocations rows:", allocations.length);
}

main().catch((err) => {
  console.error("Error in debug-list-component-allocations:", err);
  process.exit(1);
});
