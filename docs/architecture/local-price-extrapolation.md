# Local Price Extrapolation Strategy

## Overview

**Goal:** Use actual PETL (estimate) data as the "source of truth" to extrapolate regional tax and O&P rates, then apply those learned rates to normalize stale cost book prices for accurate local pricing.

## Problem Statement

When using a centralized cost book (Golden Price List):
1. **Stale regional pricing** - Cost book prices may be from different regions/markets
2. **Tax rate variance** - Sales tax rates vary by jurisdiction
3. **O&P variance** - Overhead & Profit margins vary by project type, contractor, region
4. **PETL is truth** - The imported Xactimate estimate already has accurate local pricing baked in

## Proposed Solution: Reverse-Engineer Local Multipliers

### Phase 1: Extract Regional Factors from PETL

For each estimate (EstimateVersion), analyze the relationship between line items to determine:

#### A. Aggregate Tax Rate
```typescript
// From RawXactRow
aggregateTaxRate = SUM(salesTax) / SUM(itemAmount)
```

**Rationale:** Xactimate applies local sales tax rates. By comparing total tax to total item amounts, we get the effective regional tax rate.

#### B. Aggregate O&P Rate
```typescript
// From RawXactRow
// O&P is embedded in RCV vs item pricing
aggregateOPRate = (SUM(rcv) - SUM(itemAmount) - SUM(salesTax)) / (SUM(itemAmount) + SUM(salesTax))
```

**Rationale:** RCV (Replacement Cost Value) = ItemAmount + SalesTax + O&P. Solving for O&P gives us the regional/contractor overhead & profit margin.

#### C. Labor/Material Component Ratios (Optional Enhancement)
```typescript
// If we want to be more granular
laborRatio = SUM(workersWage + laborBurden + laborOverhead) / itemAmount
materialRatio = material / itemAmount
equipmentRatio = equipment / itemAmount
```

**Rationale:** Different regions have different labor costs. By understanding the labor/material split from PETL, we can apply different adjustment factors.

### Phase 2: Match PETL Lines to Cost Book Items

For each SowItem (processed PETL line):
1. **Match by CAT/SEL** - `categoryCode` + `selectionCode` → Cost book `cat` + `sel`
2. **Compare prices** - `SowItem.unitCost` vs `CompanyPriceListItem.unitPrice`
3. **Calculate variance** - `priceVariance = sowItem.unitCost / costBookItem.unitPrice`

```typescript
interface PetlCostBookMatch {
  sowItemId: string;
  costBookItemId: string;
  cat: string;
  sel: string;
  
  // PETL values (source of truth)
  petlUnitCost: number;
  petlItemAmount: number;
  petlTax: number;
  
  // Cost book values (potentially stale)
  costBookUnitPrice: number;
  
  // Calculated variance
  priceVariance: number; // e.g., 1.15 means PETL is 15% higher
  activity: string; // R&R, Remove, Replace, etc.
}
```

### Phase 3: Aggregate Variance by Category

Rather than applying line-by-line adjustments, calculate **category-level adjustment factors**:

```typescript
interface CategoryAdjustmentFactor {
  categoryCode: string; // e.g., "PLB", "ELE", "FRM"
  activity?: string;    // Optional: different factors for R&R vs Install
  
  // Aggregate statistics
  avgPriceVariance: number;      // Mean variance across all matches
  medianPriceVariance: number;   // More robust to outliers
  sampleSize: number;            // Number of matched items
  
  // Component-level factors (if we want granularity)
  laborAdjustmentFactor?: number;
  materialAdjustmentFactor?: number;
  equipmentAdjustmentFactor?: number;
}
```

**Why aggregate?**
- Smooths out noise from individual line items
- More statistically robust with larger sample sizes
- Accounts for regional market conditions holistically

### Phase 4: Extrapolate Cost Book Prices

When a user adds a cost book item to a new estimate:

```typescript
function extrapolateCostBookItem(
  costBookItem: CompanyPriceListItem,
  projectId: string,
  estimateVersionId: string
): ExtrapolatedCostItem {
  // 1. Get the project's learned regional factors
  const regionalFactors = getProjectRegionalFactors(projectId);
  
  // 2. Get category-specific adjustment
  const categoryAdjustment = getCategoryAdjustment(
    regionalFactors,
    costBookItem.cat,
    costBookItem.activity
  );
  
  // 3. Apply adjustment to base price
  const adjustedUnitPrice = costBookItem.unitPrice * categoryAdjustment.medianPriceVariance;
  
  // 4. Apply regional tax rate
  const itemAmount = adjustedUnitPrice * quantity;
  const salesTax = itemAmount * regionalFactors.aggregateTaxRate;
  
  // 5. Apply regional O&P
  const subtotal = itemAmount + salesTax;
  const opAmount = subtotal * regionalFactors.aggregateOPRate;
  const rcvAmount = subtotal + opAmount;
  
  return {
    unitPrice: adjustedUnitPrice,
    itemAmount,
    salesTax,
    opAmount,
    rcvAmount,
    adjustmentMetadata: {
      originalUnitPrice: costBookItem.unitPrice,
      adjustmentFactor: categoryAdjustment.medianPriceVariance,
      taxRate: regionalFactors.aggregateTaxRate,
      opRate: regionalFactors.aggregateOPRate,
      confidence: calculateConfidence(categoryAdjustment.sampleSize),
    },
  };
}
```

## Data Model Additions

### New Table: ProjectRegionalFactors

```prisma
model ProjectRegionalFactors {
  id                String   @id @default(cuid())
  projectId         String
  estimateVersionId String   // The estimate we learned from
  
  // Aggregate rates learned from PETL
  aggregateTaxRate  Float    // e.g., 0.0825 for 8.25%
  aggregateOPRate   Float    // e.g., 0.20 for 20% O&P
  
  // Optional: component breakdowns
  avgLaborRatio     Float?
  avgMaterialRatio  Float?
  avgEquipmentRatio Float?
  
  // Metadata
  totalItemAmount   Float    // Total $ analyzed
  totalLineItems    Int      // Number of PETL lines analyzed
  confidence        Float    // 0-1 score based on sample size
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  project           Project         @relation(fields: [projectId], references: [id])
  sourceEstimate    EstimateVersion @relation(fields: [estimateVersionId], references: [id])
  categoryAdjustments ProjectCategoryAdjustment[]
  
  @@unique([projectId, estimateVersionId])
  @@index([projectId])
}

model ProjectCategoryAdjustment {
  id                    String   @id @default(cuid())
  regionalFactorsId     String
  
  categoryCode          String   // e.g., "PLB", "FRM", "ELE"
  activity              String?  // e.g., "R&R", "Remove", "Install"
  
  // Adjustment factors
  avgPriceVariance      Float    // Mean variance
  medianPriceVariance   Float    // Median variance (more robust)
  sampleSize            Int      // Number of matched items
  
  // Optional: granular factors
  laborAdjustment       Float?
  materialAdjustment    Float?
  equipmentAdjustment   Float?
  
  createdAt             DateTime @default(now())
  
  regionalFactors       ProjectRegionalFactors @relation(fields: [regionalFactorsId], references: [id])
  
  @@unique([regionalFactorsId, categoryCode, activity])
  @@index([regionalFactorsId])
}
```

### Update: CompanyPriceListItem

Add provenance tracking for extrapolated items:

```prisma
model CompanyPriceListItem {
  // ... existing fields ...
  
  // Extrapolation metadata
  isExtrapolated                Boolean  @default(false)
  extrapolatedFromEstimateId    String?
  extrapolatedAdjustmentFactor  Float?
  extrapolatedTaxRate           Float?
  extrapolatedOPRate            Float?
  extrapolatedConfidence        Float?
  extrapolatedAt                DateTime?
  
  // Relations
  sourceEstimate EstimateVersion? @relation("CostBookSourceEstimate", fields: [extrapolatedFromEstimateId], references: [id])
}
```

## Implementation Workflow

### Workflow A: Learning Phase (Post-Import)

After importing a new Xactimate estimate:

```typescript
async function learnRegionalFactors(estimateVersionId: string) {
  // 1. Extract aggregate rates from RawXactRow
  const aggregateRates = await calculateAggregateRates(estimateVersionId);
  
  // 2. Match SowItems to cost book
  const matches = await matchPetlToCostBook(estimateVersionId);
  
  // 3. Calculate category adjustments
  const categoryAdjustments = aggregateByCategoryAndActivity(matches);
  
  // 4. Store learned factors
  await prisma.projectRegionalFactors.create({
    data: {
      projectId,
      estimateVersionId,
      aggregateTaxRate: aggregateRates.taxRate,
      aggregateOPRate: aggregateRates.opRate,
      totalItemAmount: aggregateRates.totalItemAmount,
      totalLineItems: aggregateRates.totalLineItems,
      confidence: calculateConfidence(aggregateRates.totalLineItems),
      categoryAdjustments: {
        create: categoryAdjustments,
      },
    },
  });
  
  console.log(`✅ Learned regional factors for project ${projectId}`);
}
```

### Workflow B: Application Phase (Cost Book Import)

When a user adds a cost book item to an estimate:

```typescript
async function addCostBookItemToEstimate(
  projectId: string,
  estimateVersionId: string,
  costBookItemId: string,
  quantity: number
) {
  // 1. Get cost book item
  const costBookItem = await prisma.companyPriceListItem.findUnique({
    where: { id: costBookItemId },
  });
  
  // 2. Get project's learned regional factors
  const regionalFactors = await prisma.projectRegionalFactors.findFirst({
    where: { projectId },
    include: { categoryAdjustments: true },
    orderBy: { createdAt: 'desc' }, // Use most recent
  });
  
  // 3. Extrapolate pricing
  const extrapolated = extrapolateCostBookItem(
    costBookItem,
    regionalFactors,
    quantity
  );
  
  // 4. Create reconciliation entry with extrapolated pricing
  await prisma.petlReconciliationEntry.create({
    data: {
      projectId,
      estimateVersionId,
      caseId,
      kind: 'ADD',
      description: costBookItem.description,
      categoryCode: costBookItem.cat,
      selectionCode: costBookItem.sel,
      unit: costBookItem.unit,
      qty: quantity,
      unitCost: extrapolated.unitPrice, // Adjusted price
      itemAmount: extrapolated.itemAmount,
      salesTaxAmount: extrapolated.salesTax,
      opAmount: extrapolated.opAmount,
      rcvAmount: extrapolated.rcvAmount,
      companyPriceListItemId: costBookItemId,
      sourceSnapshotJson: {
        originalUnitPrice: costBookItem.unitPrice,
        adjustmentFactor: extrapolated.adjustmentMetadata.adjustmentFactor,
        taxRate: extrapolated.adjustmentMetadata.taxRate,
        opRate: extrapolated.adjustmentMetadata.opRate,
        confidence: extrapolated.adjustmentMetadata.confidence,
      },
    },
  });
  
  return extrapolated;
}
```

## Benefits

1. **Accurate regional pricing** - Automatically adjusts for local market conditions
2. **Maintains PETL integrity** - Never alters the original estimate
3. **Transparent adjustments** - All extrapolations are tracked with confidence scores
4. **Learns over time** - Each new estimate improves regional factor accuracy
5. **Category-level intelligence** - Understands that framing costs vary differently than electrical
6. **User trust** - Shows users "Cost book: $50 → Adjusted: $57.50 (15% regional factor)"

## Edge Cases & Considerations

### 1. No Regional Factors Yet
**Scenario:** First estimate for a new project, no prior PETL data.

**Solution:** 
- Fall back to raw cost book pricing
- Flag items as "unadjusted" in UI
- Suggest user review pricing manually

### 2. Low Confidence Adjustments
**Scenario:** Category has only 1-2 matched items (small sample size).

**Solution:**
- Calculate confidence score: `confidence = min(1.0, sampleSize / 10)`
- If confidence < 0.3, fall back to project-wide average or no adjustment
- Show confidence level to user: "Low confidence adjustment"

### 3. Outlier Detection
**Scenario:** One or two items have wildly different prices (data quality issues).

**Solution:**
- Use **median** instead of mean for category adjustments
- Apply IQR (Interquartile Range) filtering to remove extreme outliers
- Flag extreme variances (>2x or <0.5x) for manual review

### 4. Activity-Specific Adjustments
**Scenario:** "Remove & Replace" has different pricing than "Install Only".

**Solution:**
- Calculate separate adjustment factors per activity type
- Fall back to category-level if activity-specific sample is too small

### 5. Multi-Estimate Projects
**Scenario:** Project has multiple estimates (change orders, revisions).

**Solution:**
- Use most recent estimate's regional factors by default
- Option to average across all estimates for more robust factors
- Weight by total item amount (larger estimates = more confidence)

## UI/UX Considerations

### Cost Book Picker Modal
When user selects a cost book item, show preview:

```
┌─────────────────────────────────────────────────────────────┐
│ Add Cost Book Item: "Drywall 1/2\" standard"                │
├─────────────────────────────────────────────────────────────┤
│ Quantity: [5.00] SF                                         │
│                                                              │
│ Cost Book Price:      $1.25 / SF                            │
│ Regional Adjustment:  × 1.15  (📊 High confidence)          │
│ ─────────────────────────────────────────────────────────   │
│ Adjusted Unit Price:  $1.44 / SF                            │
│                                                              │
│ Item Amount:          $7.20                                 │
│ Sales Tax (8.25%):    $0.59                                 │
│ Subtotal:             $7.79                                 │
│ O&P (20%):            $1.56                                 │
│ ─────────────────────────────────────────────────────────   │
│ Total RCV:            $9.35                                 │
│                                                              │
│ ℹ️ Pricing adjusted based on 47 similar items in estimate   │
│                                                              │
│ [Cancel]                                      [Add Item →]  │
└─────────────────────────────────────────────────────────────┘
```

### Settings / Override
Allow users to:
- View learned regional factors for a project
- Manually override tax/O&P rates if needed
- Disable extrapolation (use raw cost book prices)

## Future Enhancements

### 1. Multi-Project Regional Intelligence
- Aggregate factors across all projects in a **geographic region** (ZIP/city/state)
- Build a "regional price index" that applies even to first-time projects in that area

### 2. Time-Based Decay
- Apply time decay to adjustment factors (older estimates = less weight)
- Account for inflation/market changes over time

### 3. Machine Learning
- Train ML model to predict pricing variance based on:
  - Project type (residential vs commercial)
  - Project size (total value)
  - Geographic location
  - Season/timing
  - Category/trade

### 4. Supplier Integration
- Pull real-time material prices from supplier APIs
- Use supplier quotes to validate/refine cost book pricing

### 5. Confidence-Based Alerts
- Alert user when adding items with low-confidence adjustments
- Suggest manual review for high-value items with uncertain pricing

## Implementation Priority

**Phase 1 (MVP):**
1. ✅ Define data model (ProjectRegionalFactors, ProjectCategoryAdjustment)
2. ⬜ Implement aggregate rate calculation from RawXactRow
3. ⬜ Implement PETL-to-cost-book matching logic
4. ⬜ Implement category-level variance aggregation
5. ⬜ Implement extrapolation function
6. ⬜ Add "learning phase" post-import hook
7. ⬜ Update cost book picker UI to show adjustments

**Phase 2 (Enhancements):**
8. ⬜ Confidence scoring and outlier detection
9. ⬜ Activity-specific adjustments
10. ⬜ Multi-estimate averaging
11. ⬜ User override controls

**Phase 3 (Advanced):**
12. ⬜ Multi-project regional intelligence
13. ⬜ Time-based decay
14. ⬜ ML-based predictions

## Questions for Review

1. **Tax Rate Extrapolation:** Should we learn tax rates per-project, or would you prefer to maintain a manual tax rate table by ZIP/jurisdiction?

2. **O&P Variance:** O&P can vary by:
   - Contractor (different companies have different margins)
   - Project type (residential vs commercial)
   - Project size (larger jobs = lower margins)
   
   Should we segment O&P by any of these factors, or keep it project-level?

3. **Cost Book Import Timing:** Should regional extrapolation happen:
   - A) Real-time when user adds cost book item (current proposal)
   - B) Batch process that pre-adjusts entire cost book for a project
   - C) Both (pre-adjust on import, but allow manual additions)

4. **UI Transparency:** How much detail should we show users about adjustments?
   - Option A: Full breakdown (adjustment factor, confidence, sample size)
   - Option B: Simple "Regional pricing applied ✓"
   - Option C: Collapsible "Show details" section

5. **Fallback Strategy:** What should happen when there are no regional factors yet?
   - Option A: Use raw cost book prices (risk of inaccuracy)
   - Option B: Block cost book usage until PETL is imported
   - Option C: Prompt user to manually set tax/O&P rates

---

**Next Steps:**
- Review and validate approach with PM/PO
- Create schema migration for new tables
- Implement Phase 1 MVP
- Test with real project data
