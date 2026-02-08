# IKBA: Local Price Extrapolation System

**Document Type:** Internal Knowledge Base Article  
**Audience:** Engineering, Support, Product, Operations  
**Last Updated:** February 8, 2026  
**Status:** Active (Phase 2 Complete)

---

## What is This?

The **Local Price Extrapolation System** is an intelligent pricing engine that learns from real Xactimate estimates (PETL imports) to automatically adjust cost book prices for regional variations. Instead of using stale national averages, the system learns what actual projects cost in specific regions and applies that knowledge when building new estimates.

### The Problem We're Solving

**Before this system:**
1. Cost book has national average prices (e.g., $3.59 for 1/2" drywall)
2. User adds item to estimate in San Francisco
3. Price is wrong because:
   - Tax rate is different (8.5% vs 6%)
   - Labor costs more in SF
   - Material costs vary by region
   - O&P rates differ by company/region
4. User manually adjusts EVERY line item (tedious, error-prone)

**After this system:**
1. System learns from previous SF projects (PETL imports)
2. User adds same drywall item
3. System automatically applies:
   - SF tax rate (learned: 8.5%)
   - Regional price adjustment (learned: 1.15x for DRY category)
   - Company O&P rate (learned: 22% from previous estimates)
4. Final price: $4.89 (accurate for SF without manual work)

---

## How It Works (The Learning Loop)

### Step 1: Learning Phase (Automatic)

**Trigger:** A PETL file (Xactimate CSV export) is imported for a project.

**What happens:**
```
1. Extract PETL data → RawXactRow table (itemAmount, salesTax, rcv, cat, sel)
2. Calculate aggregate rates:
   - Tax Rate = SUM(salesTax) / SUM(itemAmount)
   - O&P Rate = (SUM(rcv) - SUM(itemAmount) - SUM(salesTax)) / (itemAmount + salesTax)
3. Match PETL items to cost book by CAT/SEL codes
4. Calculate category-specific adjustments:
   - For each category (DRY, PLB, FRM, etc.):
     - Compare PETL prices vs cost book prices
     - Store median variance (e.g., DRY is 1.15x in this region)
5. Store results in ProjectRegionalFactors + ProjectCategoryAdjustment tables
```

**Example:**
```typescript
// Mary Lewis project after PETL import:
ProjectRegionalFactors {
  projectId: "cml6qq0m6000301s66r83y8lf",
  aggregateTaxRate: 0.0287,      // 2.87% learned from PETL
  aggregateOPRate: 0.20,          // 20% learned from PETL
  confidence: 0.76,               // 76% confidence (158 items analyzed)
  categoryAdjustments: [
    { categoryCode: 'DRY', medianPriceVariance: 1.00, sampleSize: 45 },
    { categoryCode: 'PNT', medianPriceVariance: 1.05, sampleSize: 23 },
    { categoryCode: 'FRM', medianPriceVariance: 0.98, sampleSize: 18 }
  ]
}
```

### Step 2: Extrapolation Phase (On-Demand)

**Trigger:** User adds a cost book item to an estimate.

**What happens:**
```
1. Fetch cost book item (base price from CompanyPriceListItem)
2. Look up ProjectRegionalFactors for this project
3. Apply category adjustment (if available):
   - DRY item with 1.05x adjustment → $3.59 × 1.05 = $3.77
4. Apply learned tax rate:
   - $3.77 × 2.87% = $0.11 tax
5. Apply learned O&P rate:
   - ($3.77 + $0.11) × 20% = $0.78 O&P
6. Final price: $3.77 + $0.11 + $0.78 = $4.66
```

**Bootstrap Mode (No PETL Data Yet):**
If this is the first project for a company with no PETL imports yet:
- Category adjustment: None (use base price)
- Tax rate: 0% (or manual override if set)
- O&P rate: Company.defaultOPRate (defaults to 20%)
- Warning: "Bootstrap mode: Import a PETL estimate to learn regional pricing"

---

## Key Concepts

### 1. Regional Factors (Per-Project)

**Why per-project?** Because pricing varies by:
- Geographic location (SF vs rural Texas)
- Project type (commercial vs residential)
- Market conditions (2024 vs 2026)

**Storage:** `ProjectRegionalFactors` table
- One record per project
- Updated each time a new PETL is imported for that project
- Links to the source estimate we learned from

### 2. Category Adjustments

**Why by category?** Because different trades have different regional variances:
- Labor-heavy categories (FRM, DRY) vary more
- Material-heavy categories (CON, MAS) vary less
- Equipment categories (DEM) barely vary at all

**Example:**
```
San Francisco adjustments (learned from 5 projects):
- DRY (Drywall): 1.15x (labor expensive)
- PNT (Painting): 1.22x (labor expensive)
- CON (Concrete): 1.03x (material-driven)
- DEM (Demolition): 1.01x (equipment-driven)
```

### 3. Confidence Scoring

**Formula:** `confidence = min(1.0, sampleSize / (sampleSize + 50))`

**Interpretation:**
- 0 items → 0% confidence
- 10 items → 17% confidence (low, use with caution)
- 50 items → 50% confidence (medium, fairly reliable)
- 100 items → 67% confidence (high, very reliable)
- 200+ items → 80%+ confidence (excellent)

**Why this matters:**
- Low confidence → Show warning to user
- High confidence → Apply adjustments automatically
- Admins can review low-confidence adjustments before applying

### 4. Median vs Average (Why Median?)

**Problem with averages:**
```
Prices: [$100, $105, $110, $500 (outlier)]
Average: $203.75 ← BAD! Skewed by outlier
Median: $107.50 ← GOOD! Ignores outliers
```

**Why outliers exist:**
- Data entry errors in PETL
- Special materials (high-end finishes)
- Emergency/overtime pricing
- Incorrect CAT/SEL codes

**Solution:** Use median variance for category adjustments (robust to outliers)

---

## Database Schema

### Core Tables

#### ProjectRegionalFactors
Stores learned pricing intelligence per project.

```prisma
model ProjectRegionalFactors {
  id                String   @id @default(cuid())
  projectId         String   @unique
  estimateVersionId String   // Source estimate we learned from
  
  // Learned rates
  aggregateTaxRate  Float    // e.g., 0.0825 for 8.25%
  aggregateOPRate   Float    // e.g., 0.20 for 20%
  
  // Metadata
  totalItemAmount   Float    // Total $ analyzed
  totalLineItems    Int      // Number of PETL lines
  confidence        Float    // 0-1 score
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  project           Project  @relation(...)
  categoryAdjustments ProjectCategoryAdjustment[]
}
```

#### ProjectCategoryAdjustment
Category-specific price adjustments (one per category per project).

```prisma
model ProjectCategoryAdjustment {
  id                    String  @id @default(cuid())
  regionalFactorsId     String
  
  categoryCode          String  // e.g., "DRY", "PLB", "FRM"
  activity              String? // e.g., "R&R", "Remove", "Install"
  
  avgPriceVariance      Float   // Mean variance (for reference)
  medianPriceVariance   Float   // USED for extrapolation
  sampleSize            Int     // Number of items in this category
  
  regionalFactors       ProjectRegionalFactors @relation(...)
  
  @@unique([regionalFactorsId, categoryCode, activity])
}
```

#### ProjectTaxConfig
Tax configuration with learned rates and manual overrides.

```prisma
model ProjectTaxConfig {
  id                      String   @id @default(cuid())
  projectId               String   @unique
  companyId               String
  
  // Location
  taxZipCode              String?
  taxCity                 String?
  taxState                String?
  
  // Learned tax rate (from PETL)
  learnedTaxRate          Float?   // e.g., 0.0825
  learnedFromEstimateId   String?
  taxRateSource           String?  // 'learned-from-petl'
  taxRateLastUpdated      DateTime?
  taxRateConfidence       Float?
  
  // Manual override (takes precedence)
  manualTaxRateOverride   Float?
  useManualTaxRate        Boolean  @default(false)
  
  project                 Project  @relation(...)
  company                 Company  @relation(...)
}
```

---

## API Usage

### For Developers

#### 1. Learning After PETL Import

```typescript
import { learnRegionalFactors } from '@repo/database';

// In your PETL import success handler:
async function onPetlImportSuccess(estimateVersionId: string) {
  try {
    const factors = await learnRegionalFactors(estimateVersionId);
    console.log(`Learned O&P: ${factors.aggregateOPRate * 100}%`);
    console.log(`Categories: ${factors.categoryAdjustments.length}`);
  } catch (error) {
    // Learning should not block imports
    console.error('Failed to learn regional factors:', error);
  }
}
```

#### 2. Extrapolating Cost Book Items

**Single item:**
```typescript
import { extrapolateCostBookItem } from '@repo/database';

const result = await extrapolateCostBookItem(
  costBookItemId,
  projectId,
  quantity
);

console.log(result);
// {
//   originalItem: { id, cat, sel, description, unitPrice: 3.59 },
//   adjustedUnitPrice: 3.77,
//   categoryAdjustmentFactor: 1.05,
//   categoryAdjustmentSource: 'learned',
//   taxRate: 0.0287,
//   taxAmount: 0.11,
//   taxSource: 'learned-from-petl',
//   opRate: 0.20,
//   opAmount: 0.78,
//   opSource: 'learned-from-petl',
//   finalUnitPrice: 4.66,
//   confidence: 0.76,
//   warning: undefined
// }
```

**Batch (for performance):**
```typescript
import { extrapolateCostBookItems } from '@repo/database';

const results = await extrapolateCostBookItems(
  [itemId1, itemId2, itemId3],
  projectId
);
// Returns array of ExtrapolatedItem objects
```

---

## Common Scenarios

### Scenario 1: First Project (No PETL Yet)

**Situation:** New company, first project, no PETL imported yet.

**System behavior:**
- `ProjectRegionalFactors`: Does not exist
- Category adjustment: None (1.0x)
- Tax rate: 0% (no data)
- O&P rate: Company.defaultOPRate (20% default)
- Warning: "Bootstrap mode: Import a PETL estimate to learn regional pricing"

**User experience:**
- Cost book items added at base price + company O&P
- No tax calculated (user must add manually or set override)
- After first PETL import, system learns real rates

### Scenario 2: Low Confidence Warning

**Situation:** Only 3 PETL items imported, confidence = 6%.

**System behavior:**
- Shows warning: "Low confidence (6%). More PETL data needed for accurate pricing."
- Still applies learned rates (but flags them as low confidence)
- Admins should review before finalizing estimate

### Scenario 3: Manual Tax Override

**Situation:** User knows the tax rate is 7.5% but PETL shows 0% (tax-exempt project).

**Admin action:**
1. Go to project settings → Tax Configuration
2. Set manual override: 7.5%
3. Toggle "Use manual tax rate" = true

**System behavior:**
- `ProjectTaxConfig.manualTaxRateOverride = 0.075`
- `ProjectTaxConfig.useManualTaxRate = true`
- Extrapolation uses 7.5% instead of learned 0%

### Scenario 4: Category with No Data

**Situation:** User adds a CAB (Cabinets) item, but no CAB items in PETL.

**System behavior:**
- Category adjustment: None (1.0x, uses base price)
- Tax rate: Learned from PETL (applies to all categories)
- O&P rate: Learned from PETL (applies to all categories)

**Result:** Partial extrapolation (tax + O&P only, no category adjustment)

---

## Troubleshooting

### Issue: "No regional factors found"

**Cause:** `ProjectRegionalFactors` record doesn't exist for this project.

**Solutions:**
1. Check if PETL was imported: `SELECT * FROM EstimateVersion WHERE projectId = '...'`
2. Manually trigger learning: `npm run test:extrapolation` (for testing)
3. Check PETL import logs for errors
4. Verify RawXactRow data exists: `SELECT COUNT(*) FROM RawXactRow WHERE estimateVersionId = '...'`

### Issue: "All category adjustments are 1.0x (no variance)"

**Cause:** PETL prices exactly match cost book prices.

**This is GOOD!** It means:
- Your cost book is already accurate for this region
- No adjustments needed (system confirms accuracy)
- Tax and O&P still learned and applied

### Issue: "Confidence is too low (< 10%)"

**Cause:** Not enough PETL data (< 5 items).

**Solutions:**
1. Import more PETL files for this project
2. Use data from similar projects (future feature: regional pooling)
3. Fall back to company defaults (system does this automatically)
4. Don't trust category adjustments with < 3 samples (system filters these)

### Issue: "Tax rate learned as 0%"

**Cause:** PETL estimate had no sales tax (tax-exempt project or incorrect PETL export).

**Solutions:**
1. Check PETL raw data: `SELECT SUM(salesTax) FROM RawXactRow WHERE estimateVersionId = '...'`
2. Set manual tax override in ProjectTaxConfig
3. Re-import PETL with correct tax data if available

---

## Testing & Validation

### Test Script

```bash
# Run comprehensive test with Mary Lewis project
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
  npm run test:extrapolation
```

**Expected output:**
```
✅ Found project: Mary Lewis - 1139 Hidden Fawn
📊 Step 1: Learning regional factors...
   Tax Rate: 0.00%
   O&P Rate: 20.00%
   Categories: 2
💰 Step 2: Testing single item extrapolation...
   DRY-1/2+: $3.59 → $4.31 (with O&P)
📦 Step 3: Testing batch extrapolation...
   5 items extrapolated successfully
🔍 Step 4: Verifying database records...
   ✅ ProjectRegionalFactors record exists
   ✅ ProjectTaxConfig record exists
```

### Manual Validation

```sql
-- Check learned factors for a project
SELECT 
  prf.projectId,
  p.name AS projectName,
  prf.aggregateTaxRate * 100 AS taxRatePct,
  prf.aggregateOPRate * 100 AS opRatePct,
  prf.confidence * 100 AS confidencePct,
  prf.totalLineItems,
  COUNT(pca.id) AS numCategories
FROM ProjectRegionalFactors prf
JOIN Project p ON p.id = prf.projectId
LEFT JOIN ProjectCategoryAdjustment pca ON pca.regionalFactorsId = prf.id
WHERE p.companyId = 'YOUR_COMPANY_ID'
GROUP BY prf.id, p.name;

-- Check category adjustments
SELECT 
  categoryCode,
  activity,
  medianPriceVariance,
  sampleSize
FROM ProjectCategoryAdjustment
WHERE regionalFactorsId = 'REGIONAL_FACTORS_ID'
ORDER BY sampleSize DESC;
```

---

## Future Enhancements

### Phase 3: Integration (Next)
- Hook `learnRegionalFactors()` into PETL import workflow
- Update API endpoints to use `extrapolateCostBookItem()`
- Add extrapolation to cost book picker UI

### Phase 4: UI Components
- Admin: Full pricing breakdown modal
- Member: Simple "Extrapolated ✓" indicator
- Dashboard: Cost Book Intelligence page

### Phase 5: Advanced Features
- **Bidirectional sync:** PETL truth updates cost book
- **Regional pooling:** Learn from similar projects (same city/state)
- **Time-series analysis:** Track pricing trends over time
- **ML predictions:** Predict future regional pricing shifts
- **Supplier integration:** Compare to Home Depot/Lowe's real-time prices

---

## FAQ

**Q: Why learn tax from PETL instead of using an API?**  
A: Cost savings ($0 vs $20/month) and accuracy (actual project tax vs API estimate). PETL tax is what was actually charged.

**Q: What if PETL data is wrong?**  
A: Median variance is robust to outliers. Low confidence scores flag suspicious data. Manual overrides available.

**Q: Can we learn from multiple projects in the same region?**  
A: Not yet (Phase 5 feature). Currently per-project only. This keeps it simple and accurate.

**Q: What happens if we re-import PETL for the same project?**  
A: System updates `ProjectRegionalFactors` with new data (upsert). Most recent estimate becomes source of truth.

**Q: How do we handle tax-exempt projects?**  
A: System learns 0% tax rate. Use manual override if this project should have tax but PETL doesn't.

---

## Support

**For technical questions:**
- Check implementation guide: `docs/architecture/local-price-extrapolation-IMPLEMENTATION.md`
- Review status doc: `docs/architecture/local-price-extrapolation-STATUS.md`
- Run test script: `npm run test:extrapolation`

**For data issues:**
- Query ProjectRegionalFactors table
- Check RawXactRow import logs
- Verify cost book CAT/SEL codes match PETL

**For feature requests:**
- File issue in GitHub
- Tag: `enhancement`, `pricing`, `regional-factors`

---

**Document Version:** 1.0  
**Next Review:** After Phase 3 integration  
**Maintained By:** Engineering Team
