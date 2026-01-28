import { prisma } from "./index";

function parseCatSelFromComponentCode(code: string | null | undefined): {
  cat: string | null;
  sel: string | null;
} {
  if (!code) return { cat: null, sel: null };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { cat: null, sel: null };

  // In Xact, component codes are typically Cat+Sel (e.g. DRY1/2, APPDW+).
  // The PETL Cat is generally 3 letters, so we treat the first 3 leading letters as Cat.
  const letters = (trimmed.match(/^[A-Z]+/)?.[0] ?? "").trim();
  if (!letters) return { cat: null, sel: null };

  const cat = letters.length >= 3 ? letters.slice(0, 3) : letters;
  const remainder = trimmed.slice(cat.length).trim();
  const sel = remainder ? remainder : null;

  return { cat, sel };
}

type SowItemBasisRow = {
  id: string;
  categoryCode: string | null;
  selectionCode: string | null;
  activity: string | null;
  itemAmount: number | null;
  rcvAmount: number | null;
};

type WeightSet = {
  // Precomputed allocation fractions that sum to ~1 (only positive fractions included).
  entries: { sowItemId: string; fraction: number }[];
  allocationBasis: string;
};

function buildWeightSet(opts: {
  scope: "global" | "by_category" | "by_cat_sel";
  candidates: SowItemBasisRow[];
}): WeightSet {
  const { scope, candidates } = opts;

  const weights = candidates.map((item) => {
    const basis = item.rcvAmount ?? item.itemAmount ?? 0;
    return basis > 0 ? basis : 0;
  });

  let basisTotal = weights.reduce((sum, v) => sum + v, 0);
  let useEqualSplit = basisTotal <= 0;

  if (useEqualSplit) {
    // If we have no monetary basis, allocate evenly by count.
    basisTotal = candidates.length;
    for (let i = 0; i < weights.length; i++) weights[i] = 1;
  }

  const entries: { sowItemId: string; fraction: number }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0 || basisTotal <= 0) continue;
    const fraction = w / basisTotal;
    if (!Number.isFinite(fraction) || fraction <= 0) continue;
    entries.push({ sowItemId: candidates[i]!.id, fraction });
  }

  const allocationBasis =
    scope === "global"
      ? useEqualSplit
        ? "equal_global"
        : "proportional_rcv_global"
      : scope === "by_cat_sel"
        ? useEqualSplit
          ? "equal_by_cat_sel"
          : "proportional_rcv_by_cat_sel"
        : useEqualSplit
          ? "equal_by_category"
          : "proportional_rcv_by_category";

  return { entries, allocationBasis };
}

export async function allocateComponentsForEstimate(options: { estimateVersionId: string }) {
  const { estimateVersionId } = options;

  const estimateVersion = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true },
  });

  if (!estimateVersion) {
    throw new Error("EstimateVersion not found");
  }

  const projectId = estimateVersion.projectId;

  // Load normalized components for this estimate
  const components = await prisma.componentSummary.findMany({
    where: { estimateVersionId },
    orderBy: { code: "asc" },
  });

  if (components.length === 0) {
    return {
      estimateVersionId,
      projectId,
      components: 0,
      sowItems: 0,
      allocationsCreated: 0,
      note: "No ComponentSummary rows found for this estimateVersionId",
    };
  }

  // Load sow items with category/activity and monetary amounts.
  const sowItems: SowItemBasisRow[] = await prisma.sowItem.findMany({
    where: { estimateVersionId },
    select: {
      id: true,
      categoryCode: true,
      selectionCode: true,
      activity: true,
      itemAmount: true,
      rcvAmount: true,
    },
  });

  if (sowItems.length === 0) {
    return {
      estimateVersionId,
      projectId,
      components: components.length,
      sowItems: 0,
      allocationsCreated: 0,
      note: "No SowItem rows found for this estimateVersionId",
    };
  }

  // Group sow items by Cat and by Cat+Sel
  const itemsByCategory = new Map<string, SowItemBasisRow[]>();
  const itemsByCatSel = new Map<string, SowItemBasisRow[]>();

  for (const item of sowItems) {
    const cat = (item.categoryCode || "").trim().toUpperCase();
    if (!cat) continue;

    const sel = (item.selectionCode || "").trim().toUpperCase() || null;

    const existing = itemsByCategory.get(cat);
    if (existing) existing.push(item);
    else itemsByCategory.set(cat, [item]);

    const key = `${cat}::${sel ?? ""}`;
    const existingSel = itemsByCatSel.get(key);
    if (existingSel) existingSel.push(item);
    else itemsByCatSel.set(key, [item]);
  }

  // NOTE: We still load rules for future use, but allocation currently uses the
  // heuristic category/global approach.
  await prisma.componentAllocationRule.findMany({
    where: {
      projectId,
      OR: [{ estimateVersionId }, { estimateVersionId: null }],
    },
  });

  // Clear previous allocations for this estimate so we can re-run safely
  await prisma.sowComponentAllocation.deleteMany({ where: { estimateVersionId } });

  // Precompute allocation weights so we don't recompute basis totals for every component.
  const weightsByKey = new Map<string, WeightSet>();

  // Global fallback weights
  weightsByKey.set("__global__", buildWeightSet({ scope: "global", candidates: sowItems }));

  // Per-category weights
  for (const [cat, candidates] of itemsByCategory.entries()) {
    weightsByKey.set(cat, buildWeightSet({ scope: "by_category", candidates }));
  }

  // Per Cat+Sel weights
  for (const [key, candidates] of itemsByCatSel.entries()) {
    weightsByKey.set(key, buildWeightSet({ scope: "by_cat_sel", candidates }));
  }

  // Batch inserts to avoid huge createMany payloads and memory spikes.
  const BATCH_SIZE = 5000;
  let allocationsCreated = 0;
  const batch: any[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const toInsert = batch.splice(0, batch.length);
    await prisma.sowComponentAllocation.createMany({ data: toInsert });
    allocationsCreated += toInsert.length;
  };

  let matchedComponents = 0;
  let unmatchedComponents = 0;
  let catSelMatchedComponents = 0;
  let categoryFallbackComponents = 0;
  let globalFallbackComponents = 0;

  for (const comp of components) {
    const { cat, sel } = parseCatSelFromComponentCode(comp.code);

    // Determine candidate set
    const catSelKey = cat ? `${cat}::${(sel ?? "").trim().toUpperCase()}` : null;

    const catSelWeights = catSelKey ? weightsByKey.get(catSelKey) ?? null : null;
    const categoryWeights = cat ? weightsByKey.get(cat) ?? null : null;

    let weightSet: WeightSet | null = null;

    if (catSelWeights && catSelWeights.entries.length > 0) {
      weightSet = catSelWeights;
      catSelMatchedComponents += 1;
    } else if (categoryWeights && categoryWeights.entries.length > 0) {
      // Fallback: allocate across all PETL rows in the matching category.
      weightSet = categoryWeights;
      categoryFallbackComponents += 1;
    } else {
      // Fallback: allocate across all PETL rows for this estimate.
      weightSet = weightsByKey.get("__global__") ?? null;
      globalFallbackComponents += 1;
    }

    if (!weightSet || weightSet.entries.length === 0) {
      unmatchedComponents += 1;
      continue;
    }

    matchedComponents += 1;

    const total = comp.total ?? null;
    const quantity = comp.quantity ?? null;

    for (const e of weightSet.entries) {
      batch.push({
        projectId,
        estimateVersionId,
        sowItemId: e.sowItemId,
        componentSummaryId: comp.id,
        code: comp.code,
        quantity: quantity != null ? quantity * e.fraction : null,
        total: total != null ? total * e.fraction : null,
        allocationBasis: weightSet.allocationBasis,
      });

      if (batch.length >= BATCH_SIZE) {
        await flush();
      }
    }
  }

  await flush();

  return {
    estimateVersionId,
    projectId,
    components: components.length,
    sowItems: sowItems.length,
    matchedComponents,
    unmatchedComponents,
    catSelMatchedComponents,
    categoryFallbackComponents,
    globalFallbackComponents,
    allocationsCreated,
  };
}
