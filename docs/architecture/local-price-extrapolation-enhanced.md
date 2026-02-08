# Enhanced Local Price Extrapolation Strategy
## With Real-Time Tax API & Bidirectional Cost Book Sync

This document extends the base Local Price Extrapolation strategy with your specific requirements.

---

## 1. Real-Time Tax Rates by ZIP Code

### Integration Approach

Instead of learning tax rates from PETL (which can be outdated or project-specific), we'll pull real-time tax rates from an API.

#### Recommended API: Sales Tax USA
- **Cost-effective:** 80% cheaper than TaxJar
- **Accurate:** Real-time rates for all US ZIP codes
- **Fast:** Sub-100ms response times
- **Simple:** REST API with ZIP code lookup

#### Data Model Addition

```prisma
model ProjectTaxConfig {
  id           String   @id @default(cuid())
  projectId    String   @unique
  companyId    String
  
  // Location for tax lookup
  taxZipCode   String?  // Primary project ZIP
  taxCity      String?
  taxState     String?
  
  // Cached tax rate (refreshed periodically)
  cachedTaxRate       Float?   // Combined rate (e.g., 0.0825 for 8.25%)
  cachedStateTaxRate  Float?
  cachedCountyTaxRate Float?
  cachedCityTaxRate   Float?
  
  // API response metadata
  taxRateSource       String?  // "sales-tax-usa", "zip2tax", etc.
  taxRateLastFetched  DateTime?
  taxRateValidUntil   DateTime? // Cache expiry
  
  // Manual override (if user wants to override API)
  manualTaxRateOverride Float?
  useManualTaxRate      Boolean @default(false)
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  project      Project  @relation(fields: [projectId], references: [id])
  company      Company  @relation(fields: [companyId], references: [id])
  
  @@index([projectId])
  @@index([companyId])
}
```

#### Implementation Flow

```typescript
// 1. Fetch tax rate when project is created/updated
async function fetchProjectTaxRate(projectId: string, zipCode: string) {
  // Check cache first
  const config = await prisma.projectTaxConfig.findUnique({
    where: { projectId },
  });
  
  const now = new Date();
  if (
    config?.cachedTaxRate &&
    config.taxRateValidUntil &&
    config.taxRateValidUntil > now
  ) {
    return config.cachedTaxRate;
  }
  
  // Fetch from API
  const response = await fetch(
    `https://api.salestaxusa.com/v1/rate?zip=${zipCode}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SALES_TAX_API_KEY}`,
      },
    }
  );
  
  const data = await response.json();
  
  // Cache for 30 days (tax rates don't change frequently)
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  
  await prisma.projectTaxConfig.upsert({
    where: { projectId },
    create: {
      projectId,
      companyId: project.companyId,
      taxZipCode: zipCode,
      cachedTaxRate: data.total_rate,
      cachedStateTaxRate: data.state_rate,
      cachedCountyTaxRate: data.county_rate,
      cachedCityTaxRate: data.city_rate,
      taxRateSource: 'sales-tax-usa',
      taxRateLastFetched: now,
      taxRateValidUntil: validUntil,
    },
    update: {
      taxZipCode: zipCode,
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

// 2. Use real-time tax rate in extrapolation
async function extrapolateCostBookItem(
  costBookItem: CompanyPriceListItem,
  projectId: string,
  quantity: number
) {
  // Get project's learned O&P rate (from PETL analysis)
  const regionalFactors = await getProjectRegionalFactors(projectId);
  
  // Get real-time tax rate (from API)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { propertyZip: true },
  });
  
  const taxRate = await fetchProjectTaxRate(projectId, project.propertyZip);
  
  // Apply category adjustment
  const categoryAdjustment = getCategoryAdjustment(
    regionalFactors,
    costBookItem.cat,
    costBookItem.activity
  );
  
  const adjustedUnitPrice = costBookItem.unitPrice * categoryAdjustment.medianPriceVariance;
  const itemAmount = adjustedUnitPrice * quantity;
  
  // Apply REAL-TIME tax rate (not learned from PETL)
  const salesTax = itemAmount * taxRate;
  
  // Apply learned O&P rate (from PETL)
  const subtotal = itemAmount + salesTax;
  const opAmount = subtotal * regionalFactors.aggregateOPRate;
  const rcvAmount = subtotal + opAmount;
  
  return {
    unitPrice: adjustedUnitPrice,
    itemAmount,
    salesTax,
    opAmount,
    rcvAmount,
    taxRate, // Include for transparency
    adjustmentMetadata: {
      originalUnitPrice: costBookItem.unitPrice,
      priceAdjustmentFactor: categoryAdjustment.medianPriceVariance,
      taxRate: taxRate,
      taxRateSource: 'api',
      opRate: regionalFactors.aggregateOPRate,
      opRateSource: 'learned-from-petl',
      confidence: calculateConfidence(categoryAdjustment.sampleSize),
    },
  };
}
```

#### Benefits of Real-Time Tax API
- ✅ **Always current:** Tax rates change quarterly/annually, API stays updated
- ✅ **Multi-jurisdiction:** Handles complex tax scenarios (special districts, etc.)
- ✅ **Audit trail:** Know exactly what rate was applied and when
- ✅ **Fallback:** Can still learn from PETL if API is unavailable
- ✅ **Override:** Admins can manually override if needed

---

## 2. O&P Segmentation (Elaborated)

You asked: "I don't understand the question, elaborate please"

### The Question Explained

**Overhead & Profit (O&P)** margins vary based on several factors:

#### Factor A: By Contractor/Company
- **General Contractor A:** Uses 20% O&P
- **General Contractor B:** Uses 25% O&P
- **Specialty Contractor C:** Uses 15% O&P

**Question:** Should we track different O&P rates for different contractors within your system?

#### Factor B: By Project Type
- **Residential Insurance Restoration:** 20% O&P (standard)
- **Commercial Construction:** 15% O&P (competitive bidding)
- **Emergency Mitigation:** 25% O&P (high urgency)

**Question:** Should we track different O&P rates for different project types?

#### Factor C: By Project Size
- **Small projects (<$50k):** 25% O&P (fixed costs spread over smaller base)
- **Medium projects ($50k-$500k):** 20% O&P (standard)
- **Large projects (>$500k):** 15% O&P (economies of scale)

**Question:** Should we adjust O&P based on project size?

### My Recommendation: **Keep It Simple (Per-Project)**

Based on your workflow, I recommend:

1. **Learn O&P from each project's PETL** (as proposed)
2. **Store it at the project level** (not segmented)
3. **Display it to admins for transparency** ("This project uses 20.5% O&P")
4. **Allow manual override** if needed

**Rationale:**
- Each Xactimate estimate already has O&P baked in
- That O&P reflects the contractor's actual markup for that specific job
- No need to complicate with segmentation initially
- Can add segmentation later if patterns emerge

**Future Enhancement:**
Once you have data from multiple projects, you could:
- Show average O&P by project type
- Alert if a project's O&P is unusually high/low
- Suggest O&P based on similar historical projects

---

## 3. Bidirectional Cost Book Sync

You said: "We need to do the PETL add realtime with calculations, then we can send back the new PETL truth to the golden price book and our cost book"

### Understanding the Flow

#### Current Workflow (Unidirectional)
```
Cost Book → Extrapolate → Add to PETL
```

#### Your Desired Workflow (Bidirectional)
```
Cost Book → Extrapolate → Add to PETL
                ↓
PETL "Truth" → Update Cost Book (feedback loop)
```

### The Bidirectional Sync Strategy

#### Scenario 1: Adding Cost Book Item to PETL

**Step 1: User adds cost book item with extrapolation**
```typescript
// User adds "Drywall 1/2\" standard" from cost book
// Cost book price: $1.25/SF
// Regional adjustment: 1.15x
// Extrapolated price: $1.44/SF

const reconEntry = await prisma.petlReconciliationEntry.create({
  data: {
    kind: 'ADD',
    categoryCode: 'DRY',
    selectionCode: 'DRY1',
    unitCost: 1.44, // Extrapolated
    companyPriceListItemId: costBookItem.id,
    sourceSnapshotJson: {
      originalCostBookPrice: 1.25,
      adjustmentFactor: 1.15,
      reason: 'regional-extrapolation',
    },
  },
});
```

**Step 2: User reviews/approves the line item**
- Estimator checks the line in PETL UI
- May adjust quantity, may adjust unit price
- Approves the line

**Step 3: Approved PETL becomes "truth" → Update cost book**
```typescript
async function syncPetlTruthToCostBook(reconEntryId: string) {
  const entry = await prisma.petlReconciliationEntry.findUnique({
    where: { id: reconEntryId },
    include: { companyPriceListItem: true },
  });
  
  if (!entry || entry.status !== 'APPROVED') {
    return; // Only sync approved items
  }
  
  const costBookItem = entry.companyPriceListItem;
  const approvedUnitCost = entry.unitCost;
  const originalUnitPrice = costBookItem.unitPrice;
  
  // Calculate the "learned adjustment factor"
  const learnedAdjustment = approvedUnitCost / originalUnitPrice;
  
  // Option A: Update the specific cost book item
  await prisma.companyPriceListItem.update({
    where: { id: costBookItem.id },
    data: {
      unitPrice: approvedUnitCost, // Update to PETL truth
      lastKnownUnitPrice: originalUnitPrice, // Archive old price
      lastPriceChangedAt: new Date(),
      lastPriceChangedSource: `petl-reconciliation-${entry.projectId}`,
      lastPriceChangedByUserId: entry.createdByUserId,
    },
  });
  
  // Option B: Update category adjustment factors
  await updateCategoryAdjustmentFactor(
    entry.projectId,
    entry.categoryCode,
    learnedAdjustment
  );
  
  console.log(
    `✅ Cost book updated: ${costBookItem.description} ` +
    `($${originalUnitPrice} → $${approvedUnitCost})`
  );
}
```

#### Scenario 2: PETL Import Updates Cost Book (Bulk Sync)

After importing a new Xactimate estimate, sync all matched items back to cost book:

```typescript
async function syncPetlImportToCostBook(estimateVersionId: string) {
  // 1. Match SowItems to cost book (same as before)
  const matches = await matchPetlToCostBook(estimateVersionId);
  
  // 2. For each match, update cost book if variance is significant
  for (const match of matches) {
    const variance = match.priceVariance;
    
    // Only update if variance > 10% (to avoid noise)
    if (Math.abs(variance - 1.0) > 0.10) {
      await prisma.companyPriceListItem.update({
        where: { id: match.costBookItemId },
        data: {
          unitPrice: match.petlUnitCost, // Update to PETL truth
          lastKnownUnitPrice: match.costBookUnitPrice, // Archive
          lastPriceChangedAt: new Date(),
          lastPriceChangedSource: `petl-import-${estimateVersionId}`,
          isExtrapolated: false, // This is now real data
        },
      });
      
      console.log(
        `📝 Updated ${match.cat}/${match.sel}: ` +
        `$${match.costBookUnitPrice} → $${match.petlUnitCost} ` +
        `(${((variance - 1) * 100).toFixed(1)}% variance)`
      );
    }
  }
  
  console.log(`✅ Cost book updated with ${matches.length} PETL truth values`);
}
```

#### Sync Policies (Recommended)

**When to sync PETL → Cost Book:**

1. **Manual adds (high confidence):** User added cost book item to PETL, reviewed it, approved it → Update cost book immediately

2. **PETL imports (selective):** After importing Xactimate estimate, only update cost book items where:
   - Variance > 10% (significant difference)
   - Category has high confidence (10+ matches)
   - Most recent data (newer than existing cost book timestamp)

3. **User approval (safeguard):** Show admin a review screen:
   ```
   ┌─────────────────────────────────────────────────────────┐
   │ Cost Book Update Recommendations (47 items)             │
   ├─────────────────────────────────────────────────────────┤
   │ ✓ DRY/DRY1  Drywall 1/2"      $1.25 → $1.44  (+15%)    │
   │ ✓ PLB/PVC1  PVC Pipe 1"       $2.30 → $2.65  (+15%)    │
   │ ✓ FRM/LBR2  2x4 Lumber        $4.50 → $5.80  (+29%)    │
   │ ✗ ELE/WIR1  Wire 12/2         $0.45 → $0.89  (+98%) ⚠️  │
   │                                                          │
   │ [Select All] [Review Flagged] [Apply Selected]          │
   └─────────────────────────────────────────────────────────┘
   ```
   - Admins can review and approve bulk updates
   - Flag extreme variances (>50%) for manual review
   - Prevent bad data from polluting cost book

**Conflict Resolution:**

If cost book item was recently updated from a different project:
```typescript
// Show user both values and let them choose
{
  "currentCostBookPrice": 1.44,
  "currentCostBookSource": "project-abc-2024-01-15",
  "newPetlPrice": 1.52,
  "newPetlSource": "project-xyz-2024-02-01",
  "variance": 0.055,
  "recommendation": "use-newer", // or "use-average" or "manual-review"
}
```

---

## 4. UI Transparency (Admin & Above)

You said: "Show full details for Admin and above for now"

### Admin Cost Book Picker (Detailed View)

```typescript
interface CostBookPickerProps {
  projectId: string;
  userRole: 'ADMIN' | 'MEMBER' | 'CLIENT';
  onSelect: (item: ExtrapolatedCostItem) => void;
}
```

#### Admin View (Full Details)

```
┌──────────────────────────────────────────────────────────────────┐
│ Add Cost Book Item to PETL                                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Selected: Drywall 1/2" standard (DRY/DRY1)                      │
│ Quantity: [5.00] SF                                              │
│                                                                   │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ 💰 PRICING BREAKDOWN                                        │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ Cost Book Base Price:        $1.25 / SF                    │  │
│ │   └─ Last Updated:           2024-11-15 (Project ABC)      │  │
│ │   └─ Source:                 Xactimate Golden Price List   │  │
│ │                                                             │  │
│ │ Regional Price Adjustment:   × 1.15                        │  │
│ │   └─ Category:               Drywall (DRY)                 │  │
│ │   └─ Sample Size:            47 matches                    │  │
│ │   └─ Confidence:             ⭐⭐⭐⭐⭐ High (47 samples)   │  │
│ │   └─ Activity:               Remove & Replace              │  │
│ │   └─ Median Variance:        +15.2%                        │  │
│ │   └─ Avg Variance:           +16.8%                        │  │
│ │   └─ Learned From:           Current project PETL          │  │
│ │                                                             │  │
│ │ Adjusted Unit Price:         $1.44 / SF                    │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ 🧮 CALCULATIONS                                             │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ Item Amount (5 SF × $1.44):  $7.20                         │  │
│ │                                                             │  │
│ │ Sales Tax (8.25%):            $0.59                        │  │
│ │   └─ ZIP Code:               75001 (Dallas, TX)            │  │
│ │   └─ State Tax:              6.25%                         │  │
│ │   └─ County Tax:             0.50%                         │  │
│ │   └─ City Tax:               1.00%                         │  │
│ │   └─ Special District:       0.50%                         │  │
│ │   └─ Rate Fetched:           2024-02-01 (Valid 30 days)   │  │
│ │   └─ Source:                 Sales Tax USA API             │  │
│ │                                                             │  │
│ │ Subtotal:                     $7.79                        │  │
│ │                                                             │  │
│ │ O&P (20.5%):                  $1.60                        │  │
│ │   └─ Learned From:           Project PETL analysis         │  │
│ │   └─ Project Avg O&P:        20.5%                         │  │
│ │   └─ Sample Size:            342 line items                │  │
│ │                                                             │  │
│ │ Total RCV:                    $9.39                        │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ ⚙️ ADMIN OVERRIDES (Optional)                               │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ Override Unit Price:     [ ] $__.__  (leave blank to use   │  │
│ │                                       extrapolated price)   │  │
│ │ Override Tax Rate:       [ ] _.__% (leave blank for API)   │  │
│ │ Override O&P Rate:       [ ] __.__% (leave blank for PETL) │  │
│ │                                                             │  │
│ │ Reason for Override: [_____________________________]        │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ ℹ️ After approval, this item's final price will update the      │
│    cost book for future projects (bidirectional sync).          │
│                                                                   │
│ [Cancel]  [Preview in PETL]              [Add Item →]           │
└──────────────────────────────────────────────────────────────────┘
```

#### Member View (Simplified)

```
┌──────────────────────────────────────────────────────────────────┐
│ Add Cost Book Item to PETL                                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Selected: Drywall 1/2" standard (DRY/DRY1)                      │
│ Quantity: [5.00] SF                                              │
│                                                                   │
│ Unit Price:              $1.44 / SF                              │
│ Item Amount:             $7.20                                   │
│ Sales Tax (8.25%):       $0.59                                   │
│ O&P (20.5%):             $1.60                                   │
│ ────────────────────────────────────                             │
│ Total RCV:               $9.39                                   │
│                                                                   │
│ ✓ Regional pricing applied                                       │
│                                                                   │
│ [Cancel]                                      [Add Item →]       │
└──────────────────────────────────────────────────────────────────┘
```

### Admin Dashboard: Cost Book Health

New admin page showing cost book intelligence:

```
┌──────────────────────────────────────────────────────────────────┐
│ 📊 Cost Book Intelligence Dashboard                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 🔄 RECENT UPDATES (Last 30 Days)                                 │
│ ├─ 142 items updated from PETL truth                            │
│ ├─ Avg variance: +12.3%                                          │
│ └─ Most updated categories: DRY (23), PLB (18), FRM (15)        │
│                                                                   │
│ ⚡ REGIONAL FACTORS (Current Project)                            │
│ ├─ Tax Rate:  8.25% (Dallas, TX - 75001)                        │
│ ├─ O&P Rate:  20.5% (learned from 342 PETL lines)               │
│ └─ Price Adjustment: +15.2% avg (47 categories analyzed)        │
│                                                                   │
│ 🎯 CONFIDENCE SCORES                                             │
│ ├─ High Confidence (10+ samples):   87 categories               │
│ ├─ Medium Confidence (5-9 samples): 34 categories               │
│ └─ Low Confidence (<5 samples):     21 categories               │
│                                                                   │
│ ⚠️ ITEMS NEEDING REVIEW                                          │
│ ├─ 12 items with >50% variance (flagged for manual review)      │
│ ├─ 5 items with conflicting updates from multiple projects      │
│ └─ [Review Now →]                                                │
│                                                                   │
│ 📈 TRENDING                                                       │
│ ├─ Lumber prices: ↑ 18% (last 60 days)                          │
│ ├─ Drywall prices: ↑ 5% (last 60 days)                          │
│ └─ Electrical: → stable                                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. First Project (No PETL Yet)

You said: "We'll make the PETL from the cost book and have to make sure the estimator checks like item pricing. In the future, we'll want to scrape for the same product locally and see (1) what is available within Radii... (2) inventory locally if possible"

### Phase 1: Bootstrap from Cost Book (Current)

When creating first estimate for a new project (no PETL to learn from):

```typescript
async function bootstrapEstimateFromCostBook(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { propertyZip: true, companyId: true },
  });
  
  // Get real-time tax rate (even without PETL)
  const taxRate = await fetchProjectTaxRate(projectId, project.propertyZip);
  
  // Use default O&P for company (fallback)
  const companyDefaults = await prisma.company.findUnique({
    where: { id: project.companyId },
    select: { defaultOPRate: true }, // Add this field to Company model
  });
  
  const opRate = companyDefaults?.defaultOPRate || 0.20; // Default to 20%
  
  return {
    taxRate,
    opRate,
    priceAdjustmentFactor: 1.0, // No adjustment yet (use raw cost book)
    confidence: 'none',
    message: 'No PETL data yet. Using cost book + default O&P. Please review pricing carefully.',
  };
}
```

#### UI Warning for First Project

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠️ No Regional Pricing Data Available                            │
├──────────────────────────────────────────────────────────────────┤
│ This is the first estimate for this project. Regional pricing    │
│ adjustments are not available yet.                               │
│                                                                   │
│ Current settings:                                                │
│ • Cost Book Prices:  Raw prices (no regional adjustment)        │
│ • Tax Rate:          8.25% (Dallas, TX - from API) ✓            │
│ • O&P Rate:          20.0% (company default) ⚠️                  │
│                                                                   │
│ 💡 Recommendation:                                               │
│ Import a Xactimate estimate first to establish regional pricing │
│ baselines, or manually review all cost book prices.             │
│                                                                   │
│ [Import Xactimate Estimate]  [Continue Anyway]                   │
└──────────────────────────────────────────────────────────────────┘
```

### Phase 2: Local Product Scraping (Future)

#### Vision: "Real-Time Local Availability & Pricing"

When user adds a cost book item, check:
1. **Local suppliers** (within radius)
2. **Real-time inventory** (if available)
3. **Current pricing** (if available)

#### Example Integration: Home Depot API

```typescript
async function checkLocalAvailability(
  costBookItem: CompanyPriceListItem,
  projectZip: string,
  radiusMiles: number = 25
) {
  // Example: Check Home Depot stores near project
  const response = await fetch(
    `https://api.homedepot.com/products/search?` +
    `keyword=${encodeURIComponent(costBookItem.description)}&` +
    `zip=${projectZip}&` +
    `radius=${radiusMiles}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.HOME_DEPOT_API_KEY}`,
      },
    }
  );
  
  const products = await response.json();
  
  // Find closest match
  const bestMatch = products.items.find(
    item => item.sku.includes(costBookItem.sel)
  );
  
  if (bestMatch) {
    return {
      available: true,
      currentPrice: bestMatch.price,
      storeLocation: bestMatch.store.address,
      storeDistance: bestMatch.store.distance,
      inStock: bestMatch.inventory.quantity > 0,
      quantity: bestMatch.inventory.quantity,
      leadTimeDays: bestMatch.inventory.leadTime,
    };
  }
  
  return { available: false };
}
```

#### Enhanced UI with Local Availability

```
┌──────────────────────────────────────────────────────────────────┐
│ Add Cost Book Item: Drywall 1/2" standard (DRY/DRY1)            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 💰 PRICING                                                        │
│ Cost Book Price:         $1.25 / SF                              │
│ Regional Adjustment:     × 1.15                                  │
│ Extrapolated Price:      $1.44 / SF                              │
│                                                                   │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ 📍 LOCAL AVAILABILITY (within 25 miles)                     │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ ✅ Home Depot #8472 - 3.2 miles                             │  │
│ │    Current Price:  $1.48 / SF  (+2.8% vs extrapolated)     │  │
│ │    In Stock:       Yes (1,240 SF available)                 │  │
│ │    Lead Time:      Same-day pickup                          │  │
│ │    [Use This Price] [View Product]                          │  │
│ │                                                              │  │
│ │ ✅ Lowe's #1823 - 5.7 miles                                 │  │
│ │    Current Price:  $1.42 / SF  (-1.4% vs extrapolated)     │  │
│ │    In Stock:       Yes (890 SF available)                   │  │
│ │    Lead Time:      Same-day pickup                          │  │
│ │    [Use This Price] [View Product]                          │  │
│ │                                                              │  │
│ │ ⚠️ 84 Lumber #342 - 12.3 miles                              │  │
│ │    Current Price:  $1.55 / SF  (+7.6% vs extrapolated)     │  │
│ │    In Stock:       No (2-3 day lead time)                   │  │
│ │    [Request Quote]                                           │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ 💡 Recommendation: Use Lowe's price ($1.42) - best value +      │
│    available locally                                             │
│                                                                   │
│ [Use Extrapolated]  [Use Local Supplier]  [Manual Override]     │
└──────────────────────────────────────────────────────────────────┘
```

#### Supplier API Integrations (Future Roadmap)

| Supplier | API Available? | Data Provided | Integration Priority |
|----------|----------------|---------------|---------------------|
| Home Depot | ✅ Yes | Price, inventory, location | High |
| Lowe's | ✅ Yes | Price, inventory, location | High |
| 84 Lumber | ⚠️ Limited | Quotes only (email) | Medium |
| Ferguson | ✅ Yes | Price, inventory (plumbing) | Medium |
| Grainger | ✅ Yes | Price, inventory (industrial) | Low |
| Local distributors | ❌ No | Manual entry | Low |

#### Data Model for Local Availability Cache

```prisma
model LocalSupplierPriceCache {
  id                     String   @id @default(cuid())
  companyPriceListItemId String
  supplierName           String   // "Home Depot", "Lowe's", etc.
  supplierStoreId        String   // Store number
  supplierSku            String   // Supplier's product SKU
  
  // Location
  projectZip             String
  storeAddress           String
  storeDistanceMiles     Float
  
  // Pricing
  unitPrice              Float
  priceAsOf              DateTime
  priceValidUntil        DateTime?
  
  // Availability
  inStock                Boolean
  quantityAvailable      Float?
  leadTimeDays           Int?
  
  // Metadata
  apiSource              String   // "home-depot-api", "lowes-api", etc.
  lastChecked            DateTime
  cacheExpiresAt         DateTime
  
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  
  companyPriceListItem   CompanyPriceListItem @relation(fields: [companyPriceListItemId], references: [id])
  
  @@index([companyPriceListItemId, projectZip])
  @@index([projectZip, supplierName])
}
```

---

## Summary: Enhanced Implementation Roadmap

### Phase 1: Core Extrapolation (Now)
1. ✅ Real-time tax rates via Sales Tax USA API
2. ✅ Learn O&P from PETL (per-project, keep simple)
3. ✅ Bidirectional sync (PETL → Cost Book)
4. ✅ Admin-level transparency (full breakdown UI)
5. ✅ Bootstrap mode (first project without PETL)

### Phase 2: Local Intelligence (Next 3-6 months)
6. ⬜ Home Depot API integration
7. ⬜ Lowe's API integration
8. ⬜ Local availability checking (radius-based)
9. ⬜ Price comparison UI
10. ⬜ Supplier price caching

### Phase 3: Advanced Features (6-12 months)
11. ⬜ Multi-supplier inventory aggregation
12. ⬜ Automated quote requests
13. ⬜ Lead time forecasting
14. ⬜ Supplier preference learning
15. ⬜ Bulk ordering optimization

---

## Open Questions (Please Answer)

1. **Tax API Budget:** What's the monthly budget for tax API calls? 
   - Sales Tax USA: ~$20/month for 10k calls
   - Zip2Tax: ~$50/month for 10k calls
   - TaxJar: ~$200/month (premium)

2. **Cost Book Update Policy:** Should PETL → Cost Book sync require admin approval, or auto-update if variance < 20%?

3. **Local Supplier Radius:** What's the max radius for local supplier search? 25 miles? 50 miles? Vary by project type?

4. **Supplier Preference:** Should system learn which suppliers users prefer? (e.g., "This estimator always picks Home Depot over Lowe's")

5. **Inventory Integration:** Do you have existing supplier accounts/APIs we should prioritize? Or start fresh with Home Depot/Lowe's?

---

Let me know your thoughts and I'll proceed with implementation!
