import { prisma, Prisma } from "./index";

function deriveCategoryFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  // Take leading letters as the category key, e.g. DRY1/2 -> DRY
  const match = trimmed.match(/^[A-Z]+/);
  const base = (match ? match[0] : trimmed).trim();
  return base || null;
}

export async function allocateComponentsForEstimate(options: {
  estimateVersionId: string;
}) {
  const { estimateVersionId } = options;

  const estimateVersion = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true }
  });

  if (!estimateVersion) {
    throw new Error("EstimateVersion not found");
  }

  const projectId = estimateVersion.projectId;

  // Load normalized components for this estimate
  const components = await prisma.componentSummary.findMany({
    where: { estimateVersionId },
    orderBy: { code: "asc" }
  });

  if (components.length === 0) {
    return {
      estimateVersionId,
      projectId,
      components: 0,
      sowItems: 0,
      allocationsCreated: 0,
      note: "No ComponentSummary rows found for this estimateVersionId"
    };
  }

  // Load sow items with category, activity, and monetary amounts
  const sowItems = await prisma.sowItem.findMany({
    where: { estimateVersionId },
    select: {
      id: true,
      categoryCode: true,
      activity: true,
      itemAmount: true,
      rcvAmount: true
    }
  });

  if (sowItems.length === 0) {
    return {
      estimateVersionId,
      projectId,
      components: components.length,
      sowItems: 0,
      allocationsCreated: 0,
      note: "No SowItem rows found for this estimateVersionId"
    };
  }

  // Group sow items by normalized category code (Cat)
  const itemsByCategory = new Map<string, typeof sowItems>();
  for (const item of sowItems) {
    const cat = (item.categoryCode || "").trim().toUpperCase();
    if (!cat) continue;
    const existing = itemsByCategory.get(cat);
    if (existing) {
      existing.push(item);
    } else {
      itemsByCategory.set(cat, [item]);
    }
  }

  // Load any allocation rules defined for this project/estimate
  const rules = await prisma.componentAllocationRule.findMany({
    where: {
      projectId,
      OR: [
        { estimateVersionId },
        { estimateVersionId: null }
      ]
    }
  });

  const rulesByCode = new Map<string, typeof rules>();
  for (const rule of rules) {
    const key = rule.componentCode;
    const list = rulesByCode.get(key) ?? [];
    list.push(rule);
    rulesByCode.set(key, list);
  }

  // Clear previous allocations for this estimate so we can re-run safely
  await prisma.sowComponentAllocation.deleteMany({ where: { estimateVersionId } });

  const allocations: Prisma.SowComponentAllocationCreateManyInput[] = [];

  let matchedComponents = 0;
  let unmatchedComponents = 0;
  let globalFallbackComponents = 0;

  for (const comp of components) {
    const categoryFromCode = deriveCategoryFromCode(comp.code);

    // Determine candidate PETL rows for this component. Prefer category match; if none,
    // fall back to allocating across the entire SOW so that components still get
    // represented instead of being dropped on the floor.
    let candidates = categoryFromCode
      ? itemsByCategory.get(categoryFromCode) ?? null
      : null;
    let allocationScope: "by_category" | "global" | null = null;

    if (candidates && candidates.length > 0) {
      allocationScope = "by_category";
    } else {
      // Fallback: allocate across all PETL rows for this estimate
      candidates = sowItems;
      if (!candidates || candidates.length === 0) {
        unmatchedComponents++;
        continue;
      }
      allocationScope = "global";
      globalFallbackComponents++;
    }

    matchedComponents++;

    // Use RCV as the primary allocation basis, fall back to Item Amount.
    const basisValues = candidates.map((item) => {
      const basis = item.rcvAmount ?? item.itemAmount ?? 0;
      return basis > 0 ? basis : 0;
    });

    let basisTotal = basisValues.reduce((sum, v) => sum + v, 0);
    const useEqualSplit = basisTotal <= 0;

    if (useEqualSplit) {
      // If we have no monetary basis, allocate evenly by count.
      basisTotal = candidates.length;
      basisValues.fill(1);
    }

    const total = comp.total ?? null;
    const quantity = comp.quantity ?? null;

    candidates.forEach((item, index) => {
      const weight = basisValues[index] ?? 0;
      if (weight <= 0 || basisTotal <= 0) {
        return;
      }
      const fraction = weight / basisTotal;
      if (!Number.isFinite(fraction) || fraction <= 0) {
        return;
      }

      allocations.push({
        projectId,
        estimateVersionId,
        sowItemId: item.id,
        componentSummaryId: comp.id,
        code: comp.code,
        quantity: quantity != null ? quantity * fraction : null,
        total: total != null ? total * fraction : null,
        allocationBasis:
          allocationScope === "global"
            ? useEqualSplit
              ? "equal_global"
              : "proportional_rcv_global"
            : useEqualSplit
              ? "equal_by_category"
              : "proportional_rcv_by_category"
      });
    });
  }

  if (allocations.length > 0) {
    await prisma.sowComponentAllocation.createMany({ data: allocations });
  }

  return {
    estimateVersionId,
    projectId,
    components: components.length,
    sowItems: sowItems.length,
    matchedComponents,
    unmatchedComponents,
    globalFallbackComponents,
    allocationsCreated: allocations.length
  };
}
