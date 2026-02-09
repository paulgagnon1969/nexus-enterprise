import prisma from './client';

interface AggregateRates {
  taxRate: number;
  opRate: number;
  totalItemAmount: number;
  totalSalesTax: number;
  totalRcv: number;
  lineCount: number;
}

interface PetlCostBookMatch {
  sowItemId: string;
  costBookItemId: string;
  cat: string;
  sel: string;
  petlUnitCost: number;
  costBookUnitPrice: number;
  priceVariance: number;
  activity: string | null;
}

interface CategoryAdjustment {
  categoryCode: string;
  activity: string | null;
  avgPriceVariance: number;
  medianPriceVariance: number;
  sampleSize: number;
}

/**
 * Learn regional pricing factors from a PETL import.
 * Called automatically after successful estimate import.
 */
export async function learnRegionalFactors(estimateVersionId: string) {
  console.log(`\n📊 Learning regional factors from estimate: ${estimateVersionId}`);
  
  // 1. Get project info
  const estimate = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { 
      project: { 
        select: { 
          id: true, 
          name: true, 
          postalCode: true,
          city: true,
          state: true,
          companyId: true,
        } 
      } 
    },
  });
  
  if (!estimate) {
    throw new Error(`Estimate version ${estimateVersionId} not found`);
  }
  
  // 2. Calculate aggregate tax & O&P rates from RawXactRow
  const aggregateRates = await calculateAggregateRates(estimateVersionId);
  
  console.log(`   Tax Rate: ${(aggregateRates.taxRate * 100).toFixed(2)}%`);
  console.log(`   O&P Rate: ${(aggregateRates.opRate * 100).toFixed(2)}%`);
  console.log(`   Line Items: ${aggregateRates.lineCount}`);
  
  // 3. Match SowItems to cost book to find price variances
  const matches = await matchPetlToCostBook(estimateVersionId);
  
  console.log(`   Matched Items: ${matches.length}`);
  
  // 4. Aggregate variances by category and activity
  const categoryAdjustments = aggregateByCategoryAndActivity(matches);
  
  console.log(`   Categories: ${categoryAdjustments.length}`);
  
  // 5. Calculate confidence score
  const confidence = calculateConfidence(aggregateRates.lineCount);
  
  // 6. Store in database
  const regionalFactors = await prisma.projectRegionalFactors.upsert({
    where: { projectId: estimate.projectId },
    create: {
      projectId: estimate.projectId,
      estimateVersionId,
      aggregateTaxRate: aggregateRates.taxRate,
      aggregateOPRate: aggregateRates.opRate,
      totalItemAmount: aggregateRates.totalItemAmount,
      totalLineItems: aggregateRates.lineCount,
      confidence,
      categoryAdjustments: {
        create: categoryAdjustments,
      },
    },
    update: {
      // Update with most recent estimate data
      estimateVersionId,
      aggregateTaxRate: aggregateRates.taxRate,
      aggregateOPRate: aggregateRates.opRate,
      totalItemAmount: aggregateRates.totalItemAmount,
      totalLineItems: aggregateRates.lineCount,
      confidence,
      updatedAt: new Date(),
      // Delete old category adjustments and create new ones
      categoryAdjustments: {
        deleteMany: {},
        create: categoryAdjustments,
      },
    },
    include: {
      categoryAdjustments: true,
    },
  });
  
  // 7. Also update ProjectTaxConfig for easy access
  await prisma.projectTaxConfig.upsert({
    where: { projectId: estimate.projectId },
    create: {
      projectId: estimate.projectId,
      companyId: estimate.project.companyId,
      taxZipCode: estimate.project.postalCode,
      taxCity: estimate.project.city,
      taxState: estimate.project.state,
      learnedTaxRate: aggregateRates.taxRate,
      learnedFromEstimateId: estimateVersionId,
      taxRateSource: 'learned-from-petl',
      taxRateLastUpdated: new Date(),
      taxRateConfidence: confidence,
    },
    update: {
      learnedTaxRate: aggregateRates.taxRate,
      learnedFromEstimateId: estimateVersionId,
      taxRateLastUpdated: new Date(),
      taxRateConfidence: confidence,
    },
  });
  
  console.log(`✅ Regional factors learned successfully`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(0)}%`);
  
  return regionalFactors;
}

/**
 * Calculate aggregate tax and O&P rates from RawXactRow data
 */
async function calculateAggregateRates(estimateVersionId: string): Promise<AggregateRates> {
  const rawRows = await prisma.rawXactRow.findMany({
    where: { estimateVersionId },
    select: {
      itemAmount: true,
      salesTax: true,
      rcv: true,
    },
  });

  const totalItemAmount = rawRows.reduce((sum: number, row: typeof rawRows[0]) => sum + (row.itemAmount || 0), 0);
  const totalSalesTax = rawRows.reduce((sum: number, row: typeof rawRows[0]) => sum + (row.salesTax || 0), 0);
  const totalRcv = rawRows.reduce((sum: number, row: typeof rawRows[0]) => sum + (row.rcv || 0), 0);

  // Tax rate = total tax / total item amount
  const taxRate = totalItemAmount > 0 ? totalSalesTax / totalItemAmount : 0;
  
  // O&P calculation: RCV = ItemAmount + SalesTax + O&P
  // Therefore: O&P = RCV - ItemAmount - SalesTax
  // O&P Rate = O&P / (ItemAmount + SalesTax)
  const totalOpAmount = totalRcv - totalItemAmount - totalSalesTax;
  const subtotal = totalItemAmount + totalSalesTax;
  const opRate = subtotal > 0 ? totalOpAmount / subtotal : 0;

  return {
    taxRate,
    opRate,
    totalItemAmount,
    totalSalesTax,
    totalRcv,
    lineCount: rawRows.length,
  };
}

/**
 * Match SowItems to cost book items by CAT/SEL to find price variances
 */
async function matchPetlToCostBook(estimateVersionId: string): Promise<PetlCostBookMatch[]> {
  // Get SowItems for this estimate
  const sowItems = await prisma.sowItem.findMany({
    where: { estimateVersionId },
    select: {
      id: true,
      categoryCode: true,
      selectionCode: true,
      unitCost: true,
      activity: true,
    },
  });

  // Get the active cost book for this company
  const estimate = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    select: { 
      project: { 
        select: { companyId: true } 
      } 
    },
  });

  if (!estimate) {
    return [];
  }

  const priceList = await prisma.companyPriceList.findFirst({
    where: { 
      companyId: estimate.project.companyId,
      isActive: true 
    },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          cat: true,
          sel: true,
          unitPrice: true,
        },
      },
    },
  });

  if (!priceList) {
    console.warn('⚠️  No active cost book found');
    return [];
  }

  // Build a lookup map for fast matching
  const costBookMap = new Map<string, { id: string; unitPrice: number }>();
  for (const item of priceList.items) {
    if (item.cat && item.sel && item.unitPrice) {
      const key = `${item.cat}|${item.sel}`;
      costBookMap.set(key, { id: item.id, unitPrice: item.unitPrice });
    }
  }

  // Match SowItems to cost book
  const matches: PetlCostBookMatch[] = [];
  for (const sowItem of sowItems) {
    if (!sowItem.categoryCode || !sowItem.selectionCode || !sowItem.unitCost) {
      continue;
    }

    const key = `${sowItem.categoryCode}|${sowItem.selectionCode}`;
    const costBookItem = costBookMap.get(key);

    if (costBookItem && costBookItem.unitPrice > 0) {
      const priceVariance = sowItem.unitCost / costBookItem.unitPrice;
      
      matches.push({
        sowItemId: sowItem.id,
        costBookItemId: costBookItem.id,
        cat: sowItem.categoryCode,
        sel: sowItem.selectionCode,
        petlUnitCost: sowItem.unitCost,
        costBookUnitPrice: costBookItem.unitPrice,
        priceVariance,
        activity: sowItem.activity,
      });
    }
  }

  return matches;
}

/**
 * Aggregate price variances by category and activity
 */
function aggregateByCategoryAndActivity(matches: PetlCostBookMatch[]): CategoryAdjustment[] {
  // Group by category + activity
  const groups = new Map<string, PetlCostBookMatch[]>();

  for (const match of matches) {
    const key = `${match.cat}|${match.activity || 'ALL'}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(match);
  }

  // Calculate statistics for each group
  const adjustments: CategoryAdjustment[] = [];

  for (const [key, groupMatches] of groups) {
    const [cat, activity] = key.split('|');
    
    const variances = groupMatches.map(m => m.priceVariance).sort((a, b) => a - b);
    const avgVariance = variances.reduce((sum, v) => sum + v, 0) / variances.length;
    const medianVariance = variances[Math.floor(variances.length / 2)];

    adjustments.push({
      categoryCode: cat,
      activity: activity === 'ALL' ? null : activity,
      avgPriceVariance: avgVariance,
      medianPriceVariance: medianVariance,
      sampleSize: groupMatches.length,
    });
  }

  return adjustments;
}

/**
 * Calculate confidence score based on sample size
 * Returns 0-1, where 1 = highest confidence
 */
function calculateConfidence(sampleSize: number): number {
  // Simple sigmoid-like function
  // 0 samples = 0% confidence
  // 50 samples = ~50% confidence
  // 100+ samples = ~90% confidence
  return Math.min(1.0, sampleSize / (sampleSize + 50));
}
