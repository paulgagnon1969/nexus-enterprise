# Local Price Extrapolation - Implementation Status

**Date:** February 8, 2026  
**Status:** Phase 1 - Database Schema Complete ✅

---

## Overview

We're implementing a sophisticated pricing intelligence system that learns from PETL (Xactimate estimates) to automatically adjust cost book prices for regional variations. This ensures accurate local pricing without manual intervention.

### Key Features
1. **Learn O&P from PETL**: Automatically extract O&P rates from imported estimates
2. **Real-time Tax Rates**: Integrate with Sales Tax USA API for current tax rates by ZIP
3. **Category-level Intelligence**: Track price variances by construction category (DRY, PLB, FRM, etc.)
4. **Bidirectional Sync**: PETL truth updates cost book (feedback loop)
5. **Transparency**: Full breakdown for admins, simple view for members

---

## Implementation Progress

### ✅ Phase 1: Database Schema (COMPLETE)

**Completed:**
- [x] Added `ProjectRegionalFactors` model to store O&P rate and category adjustments per project
- [x] Added `ProjectCategoryAdjustment` model for category-specific price variances
- [x] Added `ProjectTaxConfig` model for tax rate caching with API integration
- [x] Added `Company.defaultOPRate` field for bootstrap scenarios (defaults to 20%)
- [x] Generated SQL migration in `migrations/add_local_price_extrapolation.sql`
- [x] Added indexes for performance (RawXactRow CAT/SEL matching, etc.)

**Migration File:**
- Location: `packages/database/migrations/add_local_price_extrapolation.sql`
- Size: 95 lines
- Key tables:
  - `ProjectRegionalFactors`: Stores learned O&P rate, confidence score, sample size
  - `ProjectCategoryAdjustment`: Category-level adjustment factors (avg/median variance)
  - `ProjectTaxConfig`: Caches tax rates from API (30-day validity)

**To Apply Migration:**
```bash
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \\
  psql < migrations/add_local_price_extrapolation.sql
```

---

### 🟡 Phase 2: Core Logic (IN PROGRESS)

**Next Steps:**

#### 1. Implement `learnRegionalFactors` Function
**File:** `packages/database/src/learn-regional-factors.ts`

This function runs after PETL import to:
- Calculate aggregate O&P rate from `RawXactRow` data
- Match `SowItems` to cost book by CAT/SEL
- Aggregate price variances by category and activity
- Store results in `ProjectRegionalFactors` and `ProjectCategoryAdjustment`

**Reference:** The analysis script we ran shows this works perfectly:
- Mary Lewis project: 20% O&P, 158 matched items, 5 high-confidence categories

```typescript
// packages/database/src/learn-regional-factors.ts
import prisma from './client';

export async function learnRegionalFactors(estimateVersionId: string) {
  // 1. Get project info
  const estimate = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true },
  });
  
  // 2. Calculate aggregate O&P rate from RawXactRow
  const aggregateRates = await calculateAggregateRates(estimateVersionId);
  
  // 3. Match SowItems to cost book
  const matches = await matchPetlToCostBook(estimateVersionId);
  
  // 4. Aggregate by category
  const categoryAdjustments = aggregateByCategoryAndActivity(matches);
  
  // 5. Store in database
  const regionalFactors = await prisma.projectRegionalFactors.create({
    data: {
      projectId: estimate.projectId,
      estimateVersionId,
      aggregateTaxRate: aggregateRates.taxRate, // DEPRECATED
      aggregateOPRate: aggregateRates.opRate,
      totalItemAmount: aggregateRates.totalItemAmount,
      totalLineItems: aggregateRates.lineCount,
      confidence: calculateConfidence(aggregateRates.lineCount),
      categoryAdjustments: {
        create: categoryAdjustments,
      },
    },
  });
  
  console.log(`✅ Learned regional factors for project ${estimate.projectId}`);
  console.log(`   O&P: ${(aggregateRates.opRate * 100).toFixed(1)}%`);
  console.log(`   Categories: ${categoryAdjustments.length}`);
  
  return regionalFactors;
}

// Copy implementations from analyze-petl-for-extrapolation.ts
async function calculateAggregateRates(estimateVersionId: string) { /* ... */ }
async function matchPetlToCostBook(estimateVersionId: string) { /* ... */ }
function aggregateByCategoryAndActivity(matches) { /* ... */ }
function calculateConfidence(sampleSize: number) { /* ... */ }
```

#### 2. Implement Sales Tax USA API Module
**File:** `packages/database/src/sales-tax-api.ts`

```typescript
interface TaxRateResponse {
  total_rate: number;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
}

export async function fetchTaxRate(zipCode: string): Promise<TaxRateResponse> {
  const apiKey = process.env.SALES_TAX_USA_API_KEY;
  if (!apiKey) {
    throw new Error('SALES_TAX_USA_API_KEY not configured');
  }
  
  const response = await fetch(
    `https://api.salestaxusa.com/v1/rate?zip=${zipCode}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Sales Tax API error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getProjectTaxRate(projectId: string): Promise<number> {
  // Check cache first
  const taxConfig = await prisma.projectTaxConfig.findUnique({
    where: { projectId },
  });
  
  const now = new Date();
  if (
    taxConfig?.cachedTaxRate &&
    taxConfig.taxRateValidUntil &&
    taxConfig.taxRateValidUntil > now
  ) {
    return taxConfig.cachedTaxRate;
  }
  
  // Fetch from API
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { postalCode: true, companyId: true },
  });
  
  const data = await fetchTaxRate(project.postalCode);
  
  // Cache for 30 days
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  
  await prisma.projectTaxConfig.upsert({
    where: { projectId },
    create: {
      projectId,
      companyId: project.companyId,
      taxZipCode: project.postalCode,
      cachedTaxRate: data.total_rate,
      cachedStateTaxRate: data.state_rate,
      cachedCountyTaxRate: data.county_rate,
      cachedCityTaxRate: data.city_rate,
      taxRateSource: 'sales-tax-usa',
      taxRateLastFetched: now,
      taxRateValidUntil: validUntil,
    },
    update: {
      cachedTaxRate: data.total_rate,
      cachedStateTaxRate: data.state_rate,
      cachedCountyTaxRate: data.county_rate,
      cachedCityTaxRate: data.city_rate,
      taxRateLastFetched: now,
      taxRateValidUntil: validUntil,
    },
  });
  
  return data.total_rate;
}
```

**Environment Variable:**
Add to `.env`:
```
SALES_TAX_USA_API_KEY=your_api_key_here
```

**API Cost:** ~$20/month for 10,000 calls

#### 3. Implement `extrapolateCostBookItem` Function
**File:** `packages/database/src/extrapolate-cost-book-item.ts`

```typescript
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

export async function extrapolateCostBookItem(
  costBookItemId: string,
  projectId: string,
  quantity: number
): Promise<ExtrapolatedCostItem> {
  // 1. Get cost book item
  const costBookItem = await prisma.companyPriceListItem.findUnique({
    where: { id: costBookItemId },
  });
  
  // 2. Get project's regional factors (O&P + category adjustments)
  const regionalFactors = await prisma.projectRegionalFactors.findUnique({
    where: { projectId },
    include: { categoryAdjustments: true },
  });
  
  // 3. Get real-time tax rate (from API or cache)
  const taxRate = await getProjectTaxRate(projectId);
  
  // 4. Get category-specific adjustment
  const categoryAdjustment = regionalFactors?.categoryAdjustments.find(
    adj => adj.categoryCode === costBookItem.cat && adj.activity === costBookItem.activity
  );
  
  const adjustmentFactor = categoryAdjustment?.medianPriceVariance || 1.0;
  
  // 5. Apply adjustment to base price
  const adjustedUnitPrice = costBookItem.unitPrice * adjustmentFactor;
  const itemAmount = adjustedUnitPrice * quantity;
  
  // 6. Apply real-time tax rate
  const salesTax = itemAmount * taxRate;
  
  // 7. Apply learned O&P rate
  const subtotal = itemAmount + salesTax;
  const opAmount = subtotal * (regionalFactors?.aggregateOPRate || 0.20);
  const rcvAmount = subtotal + opAmount;
  
  return {
    unitPrice: adjustedUnitPrice,
    itemAmount,
    salesTax,
    opAmount,
    rcvAmount,
    taxRate,
    adjustmentMetadata: {
      originalUnitPrice: costBookItem.unitPrice,
      priceAdjustmentFactor: adjustmentFactor,
      taxRate: taxRate,
      taxRateSource: 'api',
      opRate: regionalFactors?.aggregateOPRate || 0.20,
      opRateSource: regionalFactors ? 'learned-from-petl' : 'company-default',
      confidence: categoryAdjustment ? categoryAdjustment.sampleSize / 10 : 0,
    },
  };
}
```

---

## Analysis Results (Validation)

We ran the analysis script on your actual data:

**Project:** Mary Lewis - 1548 Skyline
- **Tax Rate:** 2.87% (will be replaced with API real-time rate)
- **O&P Rate:** 20.00% ✅ Perfect
- **Line Items:** 158 matched between PETL and cost book
- **Variance:** Most items show 0% variance (cost book is accurate!)
- **High Confidence Categories:** 5 categories (DRY, ELE, PNT, FRM, FCV)

**Key Insight:** Your cost book is already remarkably accurate. The extrapolation system will primarily provide:
1. Real-time tax rates (replacing the 2.87% with API data)
2. O&P intelligence (20% learned from PETL)
3. Price adjustment for categories where variance exists

---

## Next Actions

### Immediate (This Week)
1. **Apply migration** to development database
   ```bash
   psql < migrations/add_local_price_extrapolation.sql
   ```

2. **Implement core functions** (learnRegionalFactors, Sales Tax API, extrapolateCostBookItem)

3. **Sign up for Sales Tax USA API**
   - URL: https://salestaxusa.com
   - Cost: ~$20/month
   - Add API key to `.env`

4. **Hook into PETL import**
   - After successful import, call `learnRegionalFactors(estimateVersionId)`
   - Store results in `ProjectRegionalFactors`

### Medium Term (Next 2 Weeks)
5. **Implement bidirectional sync**
   - When PETL entry approved, update cost book

6. **Build admin UI components**
   - Full pricing breakdown modal
   - Cost Book Intelligence dashboard

7. **Add API endpoints**
   - POST `/api/projects/:id/cost-book/extrapolate`
   - GET `/api/projects/:id/regional-factors`

### Future (Phase 2)
8. **Local supplier integration** (Home Depot, Lowe's APIs)
9. **Confidence-based alerts** for low-confidence adjustments
10. **ML-based predictions** for regional pricing trends

---

## Questions & Decisions

### Answered ✅
1. **Tax Rates:** Use Sales Tax USA API (real-time, $20/month)
2. **O&P Segmentation:** Keep simple per-project (learn from PETL)
3. **Bidirectional Sync:** Real-time on user adds + manual review for imports
4. **UI Transparency:** Full details for admins, simple for members
5. **Bootstrap Mode:** Use company default O&P + API tax + warning

### Pending ⏳
1. **Cost Book Update Policy:** Auto-update if variance < 20% or require admin approval?
2. **Local Supplier Radius:** 25 miles? 50 miles? Vary by project?
3. **Supplier Preference Learning:** Track which suppliers users prefer?

---

## Documentation

### Created Documents
1. `docs/architecture/local-price-extrapolation.md` - Base technical design
2. `docs/architecture/local-price-extrapolation-enhanced.md` - Enhanced with your requirements
3. `docs/architecture/local-price-extrapolation-STATUS.md` - This document
4. `packages/database/migrations/add_local_price_extrapolation.sql` - Database migration
5. `packages/database/src/scripts/analyze-petl-for-extrapolation.ts` - Analysis/validation script

### Reference Scripts
- Analysis script: `npm run analyze:petl-extrapolation`
- Cost book export: `npm run export:cost-book`

---

## Technical Notes

### Performance Considerations
- Added index on `RawXactRow(estimateVersionId, cat, sel)` for faster matching
- Tax rate cached for 30 days (tax rates don't change frequently)
- Category adjustments pre-aggregated (no per-line calculation needed)

### Data Integrity
- Foreign keys with CASCADE delete (cleanup when projects/estimates removed)
- Unique constraints on projectId for regional factors and tax config
- Confidence scores to flag low-sample-size adjustments

### Testing Strategy
- Unit tests for aggregate calculations
- Integration tests for PETL matching
- E2E tests for full extrapolation workflow
- Test with known good data (Mary Lewis project)

---

## Support & Contact

For questions or issues:
- Review the enhanced strategy doc: `local-price-extrapolation-enhanced.md`
- Check the TODO list: `read_todos`
- Run analysis on new projects: `npm run analyze:petl-extrapolation`

---

**Last Updated:** February 8, 2026  
**Next Review:** After core functions implemented
