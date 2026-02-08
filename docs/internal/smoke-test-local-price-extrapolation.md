# Smoke Test: Local Price Extrapolation System

**Purpose:** Quick validation that the Local Price Extrapolation system works end-to-end  
**Duration:** ~10 minutes  
**Environment:** Development database (127.0.0.1:5433)

---

## Prerequisites

✅ Database migration applied  
✅ Mary Lewis project with PETL import exists  
✅ Cost book has active price list  
✅ Docker/PostgreSQL running

---

## Test 1: Database Schema Validation (30 seconds)

**Verify tables exist:**

```bash
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
psql -c "\dt" | grep -E "(ProjectRegionalFactors|ProjectCategoryAdjustment|ProjectTaxConfig)"
```

**Expected output:**
```
 public | ProjectCategoryAdjustment | table | nexus_user
 public | ProjectRegionalFactors    | table | nexus_user
 public | ProjectTaxConfig          | table | nexus_user
```

✅ **PASS:** All 3 tables exist  
❌ **FAIL:** Missing tables → Run migration

---

## Test 2: Learning Function (2 minutes)

**Run the automated test script:**

```bash
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
  npm run test:extrapolation
```

**Expected output:**
```
🧪 Testing Local Price Extrapolation System

✅ Found project: Mary Lewis - 1139 Hidden Fawn
📊 Step 1: Learning regional factors...
   Tax Rate: 0.00%
   O&P Rate: 20.00%
   Categories: 2
💰 Step 2: Testing single item extrapolation...
   Final price: $4.31
📦 Step 3: Testing batch extrapolation...
   5 items extrapolated successfully
🔍 Step 4: Verifying database records...
   ✅ ProjectRegionalFactors record exists
   ✅ ProjectTaxConfig record exists

✅ All tests completed successfully!
```

✅ **PASS:** All 4 steps complete without errors  
❌ **FAIL:** Check error messages, verify database connection

---

## Test 3: Manual Database Verification (1 minute)

**Check learned data:**

```sql
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
psql -c "
SELECT 
  p.name AS project,
  prf.aggregateTaxRate * 100 AS tax_pct,
  prf.aggregateOPRate * 100 AS op_pct,
  prf.confidence * 100 AS confidence_pct,
  prf.totalLineItems AS items,
  COUNT(pca.id) AS categories
FROM ProjectRegionalFactors prf
JOIN Project p ON p.id = prf.projectId
LEFT JOIN ProjectCategoryAdjustment pca ON pca.regionalFactorsId = prf.id
GROUP BY prf.id, p.name, prf.aggregateTaxRate, prf.aggregateOPRate, prf.confidence, prf.totalLineItems
LIMIT 5;
"
```

**Expected output:**
```
         project          | tax_pct | op_pct | confidence_pct | items | categories
--------------------------+---------+--------+----------------+-------+------------
 Mary Lewis - 1139 Hidden |    0.00 |  20.00 |              7 |     4 |          2
```

✅ **PASS:** At least 1 row returned with reasonable values  
❌ **FAIL:** Empty result → Learning function didn't run

---

## Test 4: API Integration Check (3 minutes)

**Test extrapolation via TypeScript:**

```bash
cd packages/database
cat > /tmp/smoke-test-extrapolation.ts << 'EOF'
import { extrapolateCostBookItem, prisma } from './src/index';

async function smokeTest() {
  // Find Mary Lewis project
  const project = await prisma.project.findFirst({
    where: { name: { contains: 'Mary Lewis', mode: 'insensitive' } }
  });
  
  if (!project) {
    console.error('❌ Mary Lewis project not found');
    process.exit(1);
  }
  
  // Find a DRY cost book item
  const item = await prisma.companyPriceListItem.findFirst({
    where: {
      cat: 'DRY',
      companyPriceList: {
        companyId: project.companyId,
        isActive: true
      }
    }
  });
  
  if (!item) {
    console.error('❌ No DRY items in cost book');
    process.exit(1);
  }
  
  // Extrapolate
  const result = await extrapolateCostBookItem(item.id, project.id);
  
  console.log('✅ Smoke test PASSED');
  console.log(`   Original: $${result.originalItem.unitPrice.toFixed(2)}`);
  console.log(`   Final: $${result.finalUnitPrice.toFixed(2)}`);
  console.log(`   O&P: ${(result.opRate * 100).toFixed(0)}%`);
  console.log(`   Source: ${result.opSource}`);
  
  await prisma.$disconnect();
}

smokeTest().catch(err => {
  console.error('❌ Smoke test FAILED:', err.message);
  process.exit(1);
});
EOF

DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
  npx ts-node /tmp/smoke-test-extrapolation.ts
```

**Expected output:**
```
✅ Smoke test PASSED
   Original: $3.59
   Final: $4.31
   O&P: 20%
   Source: learned-from-petl
```

✅ **PASS:** Extrapolation returns reasonable prices  
❌ **FAIL:** Check error message, verify project has regional factors

---

## Test 5: Bootstrap Mode Check (2 minutes)

**Verify fallback behavior when no PETL data:**

```bash
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
psql -c "
-- Find a project WITHOUT regional factors
SELECT p.id, p.name 
FROM Project p 
LEFT JOIN ProjectRegionalFactors prf ON prf.projectId = p.id 
WHERE prf.id IS NULL 
LIMIT 1;
"
```

Copy the project ID, then test extrapolation:

```typescript
// Replace PROJECT_ID with actual ID from query above
const result = await extrapolateCostBookItem(
  'any-cost-book-item-id',
  'PROJECT_ID'
);

console.log(result.warning); 
// Should show: "Bootstrap mode: Using company defaults. Import a PETL estimate to learn regional pricing."
```

✅ **PASS:** Warning displayed, uses company defaults  
❌ **FAIL:** Crashes or no warning → Bootstrap logic broken

---

## Test 6: Confidence Scoring (1 minute)

**Verify confidence increases with sample size:**

```sql
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
psql -c "
SELECT 
  totalLineItems AS items,
  ROUND(confidence::numeric * 100, 0) AS confidence_pct,
  CASE 
    WHEN confidence < 0.1 THEN 'LOW (< 10%)'
    WHEN confidence < 0.5 THEN 'MEDIUM (10-50%)'
    ELSE 'HIGH (> 50%)'
  END AS confidence_level
FROM ProjectRegionalFactors
ORDER BY totalLineItems;
"
```

**Expected pattern:**
```
 items | confidence_pct | confidence_level
-------+----------------+------------------
     4 |              7 | LOW (< 10%)
    50 |             50 | MEDIUM (10-50%)
   158 |             76 | HIGH (> 50%)
```

✅ **PASS:** Confidence correlates with sample size  
❌ **FAIL:** Random confidence values → Formula broken

---

## Quick Smoke Test (1 minute)

**Run this if you just need a quick "it works" check:**

```bash
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
  npm run test:extrapolation 2>&1 | grep "✅ All tests completed successfully"
```

✅ **PASS:** You see "✅ All tests completed successfully"  
❌ **FAIL:** No output or error messages

---

## Common Failures & Fixes

### 1. "DATABASE_URL env var is required"

**Fix:**
```bash
export DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db"
```

### 2. "Mary Lewis project not found"

**Fix:** Import PETL for Mary Lewis project first, or use a different project in the test

### 3. "Unknown field 'estimates'" (Prisma error)

**Fix:** 
```bash
cd packages/database
npm run prisma:generate
```

### 4. "ProjectRegionalFactors table doesn't exist"

**Fix:** Run migration:
```bash
cd packages/database
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
  psql < migrations/add_local_price_extrapolation.sql
```

### 5. Test passes but extrapolation returns base price only

**Symptom:** `finalUnitPrice === originalItem.unitPrice`  
**Cause:** No O&P applied (likely bootstrap mode)  
**Check:** Verify `Company.defaultOPRate` is set to 0.20

---

## Success Criteria

✅ All 6 tests pass  
✅ Database has at least 1 ProjectRegionalFactors record  
✅ Extrapolation returns different price than cost book base price  
✅ Confidence scoring works (low for small samples, high for large)  
✅ Bootstrap mode shows warning when no PETL data  
✅ No crashes or unhandled errors

---

## Next Steps After Smoke Test

If all tests pass:
1. ✅ Phase 2 is production-ready
2. ➡️ Proceed to Phase 3: Hook into PETL import workflow
3. ➡️ Proceed to Phase 4: Build UI components

If any test fails:
1. Check troubleshooting section above
2. Review IKBA: `docs/internal/ikba-local-price-extrapolation.md`
3. Check logs for detailed error messages
4. Verify database state with manual SQL queries

---

**Last Updated:** February 8, 2026  
**Maintained By:** Engineering Team
