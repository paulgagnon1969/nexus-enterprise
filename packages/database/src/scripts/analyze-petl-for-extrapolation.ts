import prisma from '../client';

/**
 * Proof-of-concept script to analyze PETL data and validate the
 * Local Price Extrapolation strategy.
 * 
 * This script:
 * 1. Analyzes RawXactRow data to extract tax/O&P rates
 * 2. Matches SowItems to cost book items by CAT/SEL
 * 3. Calculates price variances
 * 4. Aggregates by category to show adjustment factors
 */

interface AggregateRates {
  totalItemAmount: number;
  totalSalesTax: number;
  totalRcv: number;
  taxRate: number;
  opRate: number;
  lineCount: number;
}

interface PetlCostBookMatch {
  sowItemId: string;
  costBookItemId: string;
  cat: string;
  sel: string;
  petlUnitCost: number;
  petlItemAmount: number;
  costBookUnitPrice: number;
  priceVariance: number;
  activity: string | null;
}

interface CategoryAdjustment {
  categoryCode: string;
  activity: string | null;
  avgVariance: number;
  medianVariance: number;
  sampleSize: number;
  matches: PetlCostBookMatch[];
}

async function analyzeEstimate(estimateVersionId: string) {
  console.log(`\n📊 Analyzing estimate: ${estimateVersionId}`);
  console.log('='.repeat(80));

  // 1. Get aggregate rates from RawXactRow
  const aggregateRates = await calculateAggregateRates(estimateVersionId);
  
  console.log('\n1️⃣  AGGREGATE RATES FROM PETL (RawXactRow)');
  console.log('-'.repeat(80));
  console.log(`Total Item Amount:  $${aggregateRates.totalItemAmount.toFixed(2)}`);
  console.log(`Total Sales Tax:    $${aggregateRates.totalSalesTax.toFixed(2)}`);
  console.log(`Total RCV:          $${aggregateRates.totalRcv.toFixed(2)}`);
  console.log(`\n📈 Learned Tax Rate:  ${(aggregateRates.taxRate * 100).toFixed(2)}%`);
  console.log(`📈 Learned O&P Rate:  ${(aggregateRates.opRate * 100).toFixed(2)}%`);
  console.log(`📊 Line Items Analyzed: ${aggregateRates.lineCount}`);

  // 2. Match SowItems to cost book
  const matches = await matchPetlToCostBook(estimateVersionId);
  
  console.log(`\n2️⃣  PETL TO COST BOOK MATCHING`);
  console.log('-'.repeat(80));
  console.log(`Total matches found: ${matches.length}`);
  
  if (matches.length > 0) {
    // Show sample matches
    console.log('\n📋 Sample matches (first 5):');
    matches.slice(0, 5).forEach((match, i) => {
      console.log(`\n  ${i + 1}. ${match.cat}/${match.sel} (${match.activity || 'N/A'})`);
      console.log(`     PETL Unit Cost:      $${match.petlUnitCost.toFixed(2)}`);
      console.log(`     Cost Book Price:     $${match.costBookUnitPrice.toFixed(2)}`);
      console.log(`     Variance:            ${(match.priceVariance * 100).toFixed(1)}%`);
    });
  }

  // 3. Aggregate by category
  const categoryAdjustments = aggregateByCategoryAndActivity(matches);
  
  console.log(`\n3️⃣  CATEGORY-LEVEL ADJUSTMENT FACTORS`);
  console.log('-'.repeat(80));
  console.log(`Categories with matches: ${categoryAdjustments.length}`);
  
  if (categoryAdjustments.length > 0) {
    console.log('\n📊 Top 10 categories by sample size:\n');
    console.log('CAT  | Activity | Samples | Avg Variance | Median Variance');
    console.log('-'.repeat(65));
    
    categoryAdjustments
      .sort((a, b) => b.sampleSize - a.sampleSize)
      .slice(0, 10)
      .forEach((adj) => {
        const activity = adj.activity || 'ALL';
        const avgVar = ((adj.avgVariance - 1) * 100).toFixed(1);
        const medVar = ((adj.medianVariance - 1) * 100).toFixed(1);
        console.log(
          `${adj.categoryCode.padEnd(5)} | ${activity.padEnd(8)} | ${String(adj.sampleSize).padStart(7)} | ${avgVar.padStart(11)}% | ${medVar.padStart(14)}%`
        );
      });
  }

  // 4. Summary recommendations
  console.log(`\n4️⃣  RECOMMENDATIONS`);
  console.log('-'.repeat(80));
  
  const highConfidenceCategories = categoryAdjustments.filter(adj => adj.sampleSize >= 10);
  const mediumConfidenceCategories = categoryAdjustments.filter(adj => adj.sampleSize >= 5 && adj.sampleSize < 10);
  const lowConfidenceCategories = categoryAdjustments.filter(adj => adj.sampleSize < 5);
  
  console.log(`✅ High confidence (10+ samples): ${highConfidenceCategories.length} categories`);
  console.log(`⚠️  Medium confidence (5-9 samples): ${mediumConfidenceCategories.length} categories`);
  console.log(`❌ Low confidence (<5 samples): ${lowConfidenceCategories.length} categories`);
  
  if (aggregateRates.taxRate > 0) {
    console.log(`\n💡 Apply ${(aggregateRates.taxRate * 100).toFixed(2)}% tax rate to all cost book items for this project`);
  }
  
  if (aggregateRates.opRate > 0) {
    console.log(`💡 Apply ${(aggregateRates.opRate * 100).toFixed(2)}% O&P rate to all cost book items for this project`);
  }
  
  if (highConfidenceCategories.length > 0) {
    console.log(`💡 Use category-specific adjustment factors for ${highConfidenceCategories.length} high-confidence categories`);
  }
  
  if (lowConfidenceCategories.length > 0) {
    console.log(`⚠️  Consider manual review for ${lowConfidenceCategories.length} low-confidence categories`);
  }
}

async function calculateAggregateRates(estimateVersionId: string): Promise<AggregateRates> {
  const rawRows = await prisma.rawXactRow.findMany({
    where: { estimateVersionId },
    select: {
      itemAmount: true,
      salesTax: true,
      rcv: true,
    },
  });

  const totalItemAmount = rawRows.reduce((sum, row) => sum + (row.itemAmount || 0), 0);
  const totalSalesTax = rawRows.reduce((sum, row) => sum + (row.salesTax || 0), 0);
  const totalRcv = rawRows.reduce((sum, row) => sum + (row.rcv || 0), 0);

  const taxRate = totalItemAmount > 0 ? totalSalesTax / totalItemAmount : 0;
  
  // O&P calculation: RCV = ItemAmount + SalesTax + O&P
  // Therefore: O&P = RCV - ItemAmount - SalesTax
  // O&P Rate = O&P / (ItemAmount + SalesTax)
  const totalOpAmount = totalRcv - totalItemAmount - totalSalesTax;
  const subtotal = totalItemAmount + totalSalesTax;
  const opRate = subtotal > 0 ? totalOpAmount / subtotal : 0;

  return {
    totalItemAmount,
    totalSalesTax,
    totalRcv,
    taxRate,
    opRate,
    lineCount: rawRows.length,
  };
}

async function matchPetlToCostBook(estimateVersionId: string): Promise<PetlCostBookMatch[]> {
  // Get SowItems for this estimate
  const sowItems = await prisma.sowItem.findMany({
    where: { estimateVersionId },
    select: {
      id: true,
      categoryCode: true,
      selectionCode: true,
      unitCost: true,
      itemAmount: true,
      activity: true,
    },
  });

  // Get cost book items (use the first active price list for now)
  const priceList = await prisma.companyPriceList.findFirst({
    where: { isActive: true },
    include: {
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
        petlItemAmount: sowItem.itemAmount || 0,
        costBookUnitPrice: costBookItem.unitPrice,
        priceVariance,
        activity: sowItem.activity,
      });
    }
  }

  return matches;
}

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
      avgVariance,
      medianVariance,
      sampleSize: groupMatches.length,
      matches: groupMatches,
    });
  }

  return adjustments;
}

// Main execution
async function main() {
  // Find the most recent estimate version to analyze
  const latestEstimate = await prisma.estimateVersion.findFirst({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sequenceNo: true,
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!latestEstimate) {
    console.error('❌ No estimate versions found in database');
    process.exit(1);
  }

  console.log('\n🔍 Found most recent estimate:');
  console.log(`   Project: ${latestEstimate.project.name}`);
  console.log(`   Estimate Version: ${latestEstimate.sequenceNo}`);

  await analyzeEstimate(latestEstimate.id);

  console.log('\n' + '='.repeat(80));
  console.log('✅ Analysis complete!\n');
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
