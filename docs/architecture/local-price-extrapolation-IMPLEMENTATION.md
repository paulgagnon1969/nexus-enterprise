# Local Price Extrapolation - Implementation Guide
## Learning Tax & O&P from PETL Data (No External API)

**Updated:** February 8, 2026  
**Approach:** Learn tax rates directly from PETL imports (RawXactRow data)

---

## Strategy Overview

Instead of using an external API, we'll **learn tax rates from your actual PETL imports**:

```
PETL Import (RawXactRow) 
    ↓
Calculate: aggregateTaxRate = SUM(salesTax) / SUM(itemAmount)
Calculate: aggregateOPRate = (SUM(rcv) - SUM(itemAmount) - SUM(salesTax)) / (itemAmount + salesTax)
    ↓
Store in ProjectRegionalFactors
    ↓
Use for future cost book extrapolations
```

**Benefits:**
- ✅ **No external dependencies** - Uses your existing data
- ✅ **No monthly costs** - No API fees
- ✅ **Accurate to your projects** - Tax rates reflect actual project locations
- ✅ **Improves over time** - Each import refines the data
- ✅ **Historical tracking** - See tax rate changes project-by-project

---

## Implementation Steps

### Step 1: Apply Database Migration

```bash
cd /Users/pg/nexus-enterprise/packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \
  psql -h 127.0.0.1 -p 5433 -U nexus_user -d nexus_db < migrations/add_local_price_extrapolation.sql
```

### Step 2: Implement `learnRegionalFactors` Function

**File:** `packages/database/src/learn-regional-factors.ts`

```typescript
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

  const totalItemAmount = rawRows.reduce((sum, row) => sum + (row.itemAmount || 0), 0);
  const totalSalesTax = rawRows.reduce((sum, row) => sum + (row.salesTax || 0), 0);
  const totalRcv = rawRows.reduce((sum, row) => sum + (row.rcv || 0), 0);

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

  const priceList = await prisma.companyPriceList.findFirst({
    where: { 
      companyId: estimate.project.companyId,
      isActive: true 
    },
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
```

### Step 3: Hook into PETL Import Workflow

Find where PETL imports are completed and add the learning hook:

**File:** `apps/api/src/modules/project/project.service.ts` (or wherever imports happen)

```typescript
import { learnRegionalFactors } from '@repo/database';

// After successful PETL import...
async function afterPetlImportSuccess(estimateVersionId: string) {
  try {
    // Learn regional pricing factors
    await learnRegionalFactors(estimateVersionId);
    console.log(`✅ Regional factors learned for estimate ${estimateVersionId}`);
  } catch (error) {
    console.error(`⚠️  Failed to learn regional factors:`, error);
    // Don't fail the import if learning fails
  }
}
```

### Step 4: Implement `extrapolateCostBookItem` Function

**File:** `packages/database/src/extrapolate-cost-book-item.ts`

```typescript
import prisma from './client';

export interface ExtrapolatedCostItem {
  unitPrice: number;
  itemAmount: number;
  salesTax: number;
  opAmount: number;
  rcvAmount: number;
  taxRate: number;
  adjustmentMetadata: {
    originalUnitPrice: number;
    priceAdjustmentFactor: number;
    taxRate: number;
    taxRateSource: string;
    opRate: number;
    opRateSource: string;
    confidence: number;
  };
}

/**
 * Extrapolate accurate local pricing for a cost book item
 * Uses learned regional factors (tax, O&P, category adjustments)
 */
export async function extrapolateCostBookItem(
  costBookItemId: string,
  projectId: string,
  quantity: number
): Promise<ExtrapolatedCostItem> {
  // 1. Get cost book item
  const costBookItem = await prisma.companyPriceListItem.findUnique({
    where: { id: costBookItemId },
  });
  
  if (!costBookItem) {
    throw new Error(`Cost book item ${costBookItemId} not found`);
  }
  
  // 2. Get project's regional factors
  const regionalFactors = await prisma.projectRegionalFactors.findUnique({
    where: { projectId },
    include: { categoryAdjustments: true },
  });
  
  // 3. Get company defaults for bootstrap mode
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { 
      company: { 
        select: { defaultOPRate: true } 
      } 
    },
  });
  
  // 4. Determine tax rate (learned or default)
  const taxRate = regionalFactors?.aggregateTaxRate || 0;
  const taxRateSource = regionalFactors ? 'learned-from-petl' : 'default-zero';
  
  // 5. Determine O&P rate (learned or company default)
  const opRate = regionalFactors?.aggregateOPRate || project.company.defaultOPRate || 0.20;
  const opRateSource = regionalFactors ? 'learned-from-petl' : 'company-default';
  
  // 6. Get category-specific price adjustment
  const categoryAdjustment = regionalFactors?.categoryAdjustments.find(
    adj => adj.categoryCode === costBookItem.cat && 
           (adj.activity === costBookItem.activity || adj.activity === null)
  );
  
  const adjustmentFactor = categoryAdjustment?.medianPriceVariance || 1.0;
  const confidence = categoryAdjustment ? Math.min(1.0, categoryAdjustment.sampleSize / 10) : 0;
  
  // 7. Apply regional pricing
  const adjustedUnitPrice = (costBookItem.unitPrice || 0) * adjustmentFactor;
  const itemAmount = adjustedUnitPrice * quantity;
  
  // 8. Apply learned tax rate
  const salesTax = itemAmount * taxRate;
  
  // 9. Apply learned O&P rate
  const subtotal = itemAmount + salesTax;
  const opAmount = subtotal * opRate;
  const rcvAmount = subtotal + opAmount;
  
  return {
    unitPrice: adjustedUnitPrice,
    itemAmount,
    salesTax,
    opAmount,
    rcvAmount,
    taxRate,
    adjustmentMetadata: {
      originalUnitPrice: costBookItem.unitPrice || 0,
      priceAdjustmentFactor: adjustmentFactor,
      taxRate: taxRate,
      taxRateSource,
      opRate: opRate,
      opRateSource,
      confidence,
    },
  };
}
```

### Step 5: Export Functions

**File:** `packages/database/src/index.ts`

```typescript
// ... existing exports ...

// Local price extrapolation
export { learnRegionalFactors } from './learn-regional-factors';
export { extrapolateCostBookItem } from './extrapolate-cost-book-item';
export type { ExtrapolatedCostItem } from './extrapolate-cost-book-item';
```

---

## Testing

### Test with Existing Data

Run the analysis script to see what factors would be learned:

```bash
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \
  npm run analyze:petl-extrapolation
```

**Expected Output:**
```
📊 Analyzing estimate: cmla5uay808l301s641sjtiih
================================================================================

1️⃣  AGGREGATE RATES FROM PETL (RawXactRow)
--------------------------------------------------------------------------------
Total Item Amount:  $66430.14
Total Sales Tax:    $1907.90
Total RCV:          $82005.78

📈 Learned Tax Rate:  2.87%  ← This will be used!
📈 Learned O&P Rate:  20.00% ← This will be used!
📊 Line Items Analyzed: 158

... (rest of output)
```

### Manual Test After Implementation

```typescript
// Test learning
const estimateId = 'cmla5uay808l301s641sjtiih';
await learnRegionalFactors(estimateId);

// Test extrapolation
const costBookItemId = 'some-cost-book-item-id';
const projectId = 'some-project-id';
const extrapolated = await extrapolateCostBookItem(costBookItemId, projectId, 5.0);

console.log('Extrapolated:', extrapolated);
// Expected: unitPrice adjusted, tax rate 2.87%, O&P 20%
```

---

## Benefits of This Approach

### 1. **Accurate to Your Business**
- Tax rates reflect actual project locations
- O&P reflects actual contractor markups
- Price adjustments based on your real estimates

### 2. **No External Dependencies**
- No API keys needed
- No monthly fees
- No rate limits
- Works offline

### 3. **Improves Over Time**
- Each PETL import refines the data
- More estimates = better accuracy
- Historical tracking built-in

### 4. **Transparent & Auditable**
- Can see exactly which estimate factors were learned from
- Confidence scores indicate data quality
- Easy to explain to users

### 5. **Flexible**
- Can override with manual values if needed
- Falls back to company defaults gracefully
- Easy to extend later (e.g., supplier APIs)

---

## What Happens When...

### First Project (No PETL Yet)
**Tax Rate:** 0% (or manual override)  
**O&P Rate:** Company default (20%)  
**Price Adjustment:** 1.0x (no adjustment)  
**UI:** Show warning "Import estimate first for regional pricing"

### After First PETL Import
**Tax Rate:** Learned from RawXactRow (e.g., 2.87%)  
**O&P Rate:** Learned from RCV calculation (e.g., 20%)  
**Price Adjustment:** Category-specific (e.g., DRY: 1.0x, INS: 1.11x)  
**UI:** Show confidence score and sample sizes

### Multiple Projects in Same Region
Each project learns independently, but you could:
- Average factors across projects in same ZIP
- Weight by project size
- Show regional trends

---

## Next Steps

1. **Apply migration** (see Step 1)
2. **Create the two implementation files** (Steps 2 & 4)
3. **Hook into PETL import** (Step 3)
4. **Test with existing data** (use analysis script)
5. **Add UI components** (show learned factors to admins)

---

## Questions?

- Check the STATUS doc: `local-price-extrapolation-STATUS.md`
- Review the analysis script: `src/scripts/analyze-petl-for-extrapolation.ts`
- Run analysis: `npm run analyze:petl-extrapolation`

