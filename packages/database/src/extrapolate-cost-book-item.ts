import prisma from './client';

interface CostBookItem {
  id: string;
  cat: string;
  sel: string;
  description: string;
  unitPrice: number;
  activity?: string | null;
  // Other fields from CompanyPriceListItem can be added as needed
}

interface ExtrapolatedItem {
  // Original item data
  originalItem: CostBookItem;
  
  // Adjusted base price (with category adjustment)
  adjustedUnitPrice: number;
  categoryAdjustmentFactor: number;
  categoryAdjustmentSource: 'learned' | 'none';
  
  // Tax calculation
  taxRate: number;
  taxAmount: number;
  taxSource: 'learned-from-petl' | 'company-default';
  
  // O&P calculation
  opRate: number;
  opAmount: number;
  opSource: 'learned-from-petl' | 'company-default';
  
  // Final price
  finalUnitPrice: number;
  
  // Metadata
  confidence: number;
  warning?: string;
}

/**
 * Extrapolate a cost book item with regional pricing factors.
 * 
 * This function:
 * 1. Applies category-specific price adjustment (if available)
 * 2. Applies learned tax rate
 * 3. Applies learned O&P rate
 * 
 * If no regional factors are available (bootstrap mode), falls back to company defaults.
 */
export async function extrapolateCostBookItem(
  costBookItemId: string,
  projectId: string,
  quantity: number = 1
): Promise<ExtrapolatedItem> {
  // 1. Fetch the cost book item
  const costBookItem = await prisma.companyPriceListItem.findUnique({
    where: { id: costBookItemId },
    select: {
      id: true,
      cat: true,
      sel: true,
      description: true,
      unitPrice: true,
      activity: true,
    },
  });

  if (!costBookItem) {
    throw new Error(`Cost book item ${costBookItemId} not found`);
  }

  // 2. Fetch regional factors for this project
  const regionalFactors = await prisma.projectRegionalFactors.findUnique({
    where: { projectId },
    include: {
      categoryAdjustments: true,
    },
  });

  // 3. Fetch project for company info
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      companyId: true,
      company: {
        select: {
          defaultOPRate: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // 4. Fetch tax config
  const taxConfig = await prisma.projectTaxConfig.findUnique({
    where: { projectId },
  });

  // 5. Apply category adjustment
  const { adjustedPrice, adjustmentFactor, adjustmentSource } = applyCategoryAdjustment(
    costBookItem,
    regionalFactors
  );

  // 6. Get tax rate
  const { taxRate, taxSource } = getTaxRate(taxConfig, project.company.defaultOPRate);

  // 7. Get O&P rate
  const { opRate, opSource } = getOPRate(regionalFactors, project.company.defaultOPRate);

  // 8. Calculate final price
  // Formula: FinalPrice = (AdjustedPrice × (1 + TaxRate)) × (1 + OPRate)
  const priceWithTax = adjustedPrice * (1 + taxRate);
  const taxAmount = adjustedPrice * taxRate;
  const subtotal = adjustedPrice + taxAmount;
  const opAmount = subtotal * opRate;
  const finalPrice = subtotal + opAmount;

  // 9. Generate warning if in bootstrap mode
  let warning: string | undefined;
  if (!regionalFactors) {
    warning = 'Bootstrap mode: Using company defaults. Import a PETL estimate to learn regional pricing.';
  } else if (regionalFactors.confidence < 0.5) {
    warning = `Low confidence (${(regionalFactors.confidence * 100).toFixed(0)}%). More PETL data needed for accurate pricing.`;
  }

  return {
    originalItem: costBookItem as CostBookItem,
    adjustedUnitPrice: adjustedPrice,
    categoryAdjustmentFactor: adjustmentFactor,
    categoryAdjustmentSource: adjustmentSource,
    taxRate,
    taxAmount,
    taxSource,
    opRate,
    opAmount,
    opSource,
    finalUnitPrice: finalPrice,
    confidence: regionalFactors?.confidence || 0,
    warning,
  };
}

/**
 * Apply category-specific price adjustment
 */
function applyCategoryAdjustment(
  item: { cat: string; sel: string; activity?: string | null; unitPrice: number },
  regionalFactors: { categoryAdjustments: any[] } | null
): {
  adjustedPrice: number;
  adjustmentFactor: number;
  adjustmentSource: 'learned' | 'none';
} {
  if (!regionalFactors || !item.cat) {
    return {
      adjustedPrice: item.unitPrice,
      adjustmentFactor: 1.0,
      adjustmentSource: 'none',
    };
  }

  // Try to find a category adjustment
  // 1. First try: match category + activity
  let adjustment = regionalFactors.categoryAdjustments.find(
    (adj) => adj.categoryCode === item.cat && adj.activity === item.activity
  );

  // 2. Second try: match category only (activity = null means "ALL")
  if (!adjustment) {
    adjustment = regionalFactors.categoryAdjustments.find(
      (adj) => adj.categoryCode === item.cat && adj.activity === null
    );
  }

  // 3. No adjustment found or low confidence
  if (!adjustment || adjustment.sampleSize < 3) {
    return {
      adjustedPrice: item.unitPrice,
      adjustmentFactor: 1.0,
      adjustmentSource: 'none',
    };
  }

  // Use median variance (more robust to outliers)
  const adjustmentFactor = adjustment.medianPriceVariance;
  const adjustedPrice = item.unitPrice * adjustmentFactor;

  return {
    adjustedPrice,
    adjustmentFactor,
    adjustmentSource: 'learned',
  };
}

/**
 * Get tax rate (learned or default)
 */
function getTaxRate(
  taxConfig: { learnedTaxRate: number | null; manualTaxRateOverride: number | null; useManualTaxRate: boolean } | null,
  companyDefaultOP: number
): {
  taxRate: number;
  taxSource: 'learned-from-petl' | 'company-default';
} {
  // Manual override takes precedence
  if (taxConfig?.useManualTaxRate && taxConfig.manualTaxRateOverride !== null) {
    return {
      taxRate: taxConfig.manualTaxRateOverride,
      taxSource: 'learned-from-petl', // Treat manual as learned
    };
  }

  // Use learned rate
  if (taxConfig?.learnedTaxRate !== null && taxConfig?.learnedTaxRate !== undefined) {
    return {
      taxRate: taxConfig.learnedTaxRate,
      taxSource: 'learned-from-petl',
    };
  }

  // Bootstrap: no tax rate available, use 0%
  return {
    taxRate: 0,
    taxSource: 'company-default',
  };
}

/**
 * Get O&P rate (learned or default)
 */
function getOPRate(
  regionalFactors: { aggregateOPRate: number } | null,
  companyDefaultOP: number
): {
  opRate: number;
  opSource: 'learned-from-petl' | 'company-default';
} {
  if (regionalFactors?.aggregateOPRate !== null && regionalFactors?.aggregateOPRate !== undefined) {
    return {
      opRate: regionalFactors.aggregateOPRate,
      opSource: 'learned-from-petl',
    };
  }

  // Bootstrap: use company default
  return {
    opRate: companyDefaultOP || 0.20, // Default to 20%
    opSource: 'company-default',
  };
}

/**
 * Batch extrapolate multiple cost book items
 */
export async function extrapolateCostBookItems(
  costBookItemIds: string[],
  projectId: string
): Promise<ExtrapolatedItem[]> {
  // Fetch all data in parallel for efficiency
  const [regionalFactors, project, taxConfig, costBookItems] = await Promise.all([
    prisma.projectRegionalFactors.findUnique({
      where: { projectId },
      include: { categoryAdjustments: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        companyId: true,
        company: { select: { defaultOPRate: true } },
      },
    }),
    prisma.projectTaxConfig.findUnique({
      where: { projectId },
    }),
    prisma.companyPriceListItem.findMany({
      where: { id: { in: costBookItemIds } },
      select: {
        id: true,
        cat: true,
        sel: true,
        description: true,
        unitPrice: true,
        activity: true,
      },
    }),
  ]);

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Apply extrapolation to each item
  const results: ExtrapolatedItem[] = [];

  for (const item of costBookItems) {
    const { adjustedPrice, adjustmentFactor, adjustmentSource } = applyCategoryAdjustment(
      item,
      regionalFactors
    );

    const { taxRate, taxSource } = getTaxRate(taxConfig, project.company.defaultOPRate);
    const { opRate, opSource } = getOPRate(regionalFactors, project.company.defaultOPRate);

    const priceWithTax = adjustedPrice * (1 + taxRate);
    const taxAmount = adjustedPrice * taxRate;
    const subtotal = adjustedPrice + taxAmount;
    const opAmount = subtotal * opRate;
    const finalPrice = subtotal + opAmount;

    let warning: string | undefined;
    if (!regionalFactors) {
      warning = 'Bootstrap mode: Using company defaults. Import a PETL estimate to learn regional pricing.';
    } else if (regionalFactors.confidence < 0.5) {
      warning = `Low confidence (${(regionalFactors.confidence * 100).toFixed(0)}%). More PETL data needed for accurate pricing.`;
    }

    results.push({
      originalItem: item as CostBookItem,
      adjustedUnitPrice: adjustedPrice,
      categoryAdjustmentFactor: adjustmentFactor,
      categoryAdjustmentSource: adjustmentSource,
      taxRate,
      taxAmount,
      taxSource,
      opRate,
      opAmount,
      opSource,
      finalUnitPrice: finalPrice,
      confidence: regionalFactors?.confidence || 0,
      warning,
    });
  }

  return results;
}
