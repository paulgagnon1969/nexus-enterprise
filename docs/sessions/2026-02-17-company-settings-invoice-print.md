# Session: Company Settings & Invoice Print Improvements

**Date:** 2026-02-17  
**Duration:** ~4 hours  
**Author:** Warp AI + Paul Gagnon

## Summary

This session addressed multiple issues related to company settings persistence and invoice printing functionality:

1. **Company contact information** - Added ability for tenants to configure their company contact info (phone, email, address, tagline) for use on invoices
2. **Invoice PDF improvements** - Fixed PDF filename defaults and receipt image loading
3. **Database migration** - Created migration to add company contact fields to the Company table

---

## Issues Addressed

### 1. Company Settings Save Not Working

**Problem:** Saving company information at `/settings/company` appeared to work but data wasn't persisting.

**Root Cause:** 
- The `UpdateCompanyDto` in the API didn't include the new contact fields
- The `updateCurrentCompany` service method only processed `name`, `defaultTimeZone`, and `defaultPayrollConfig`
- No database migration existed for the contact fields (they were in the schema but never migrated to production)

**Solution:**
1. Updated `apps/api/src/modules/company/dto/update-company.dto.ts` to include:
   - `phone`, `email`, `website`
   - `addressLine1`, `addressLine2`, `city`, `state`, `postalCode`
   - `tagline`

2. Updated `apps/api/src/modules/company/company.service.ts`:
   - `updateCurrentCompany()` now persists all contact fields
   - `getCurrentCompany()` now returns all contact fields

3. Created migration `20260217173000_add_company_contact_info`:
```sql
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'US';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
```

**Files Modified:**
- `apps/api/src/modules/company/dto/update-company.dto.ts`
- `apps/api/src/modules/company/company.service.ts`
- `packages/database/prisma/migrations/20260217173000_add_company_contact_info/migration.sql` (new)

---

### 2. Invoice PDF Filename Not Defaulting to Invoice Number

**Problem:** When printing/saving an invoice as PDF, the browser's save dialog didn't default to the invoice number as the filename.

**Root Cause:** Browsers use the main document's `document.title` for the PDF filename, not the iframe's `<title>` tag.

**Solution:** Modified `printHtmlDocument()` in the project page to:
1. Save the original `document.title`
2. Set `document.title` to the invoice title before printing
3. Restore the original title after print dialog closes

**File Modified:**
- `apps/web/app/projects/[id]/page.tsx` (lines ~2634-2973)

**Filename Format:** `INV-001 - $1,234.56 - 2026.02.17`

---

### 3. Receipt Images Not Appearing in Invoice PDF

**Problem:** When printing an invoice with attached receipts, the images showed as empty placeholders.

**Root Cause:** The print dialog opened before images had time to load (only 120ms timeout).

**Solution:** Added `waitForImages()` function that:
1. Finds all `<img>` elements in the iframe
2. Waits for each image to load (or error)
3. Has a 10-second safety timeout
4. Only triggers print after all images are ready

**File Modified:**
- `apps/web/app/projects/[id]/page.tsx` (lines ~2980-3008)

---

### 4. Invoice Print Using Hardcoded Company Info

**Problem:** Invoice prints showed hardcoded company info ("Nexus Fortified Structures LLC, 123 Construction Way...") instead of the tenant's actual company information.

**Root Cause:** The invoice print template had hardcoded values instead of using data from the database.

**Solution:**
1. Added `companyInfo` state to the project page to store company contact info
2. Updated the `/companies/me` fetch handler to populate `companyInfo`
3. Modified the invoice print template to use dynamic values:

```typescript
// Before (hardcoded)
<div class="company-name">Nexus Fortified Structures LLC</div>
<div>123 Construction Way, Suite 100</div>
<div>Tampa, FL 33601</div>

// After (dynamic)
<div class="company-name">${htmlEscape(companyInfo?.name ?? "Company")}</div>
${companyAddressLines.map(line => `<div>${htmlEscape(line)}</div>`).join("\n")}
${companyInfo?.phone ? `<div>Phone: ${htmlEscape(companyInfo.phone)}</div>` : ""}
${companyInfo?.tagline ? `<div class="company-tagline">${htmlEscape(companyInfo.tagline)}</div>` : ""}
```

**File Modified:**
- `apps/web/app/projects/[id]/page.tsx` (lines ~1148-1161, ~7515-7527, ~3077-3095)

---

## Deployment

All changes were:
1. Committed to `main` branch
2. Pushed to GitHub
3. Deployed to production via `./scripts/deploy-prod.sh`
   - Migration applied to production database
   - API redeployed to Cloud Run
   - Web auto-deployed via Vercel

---

## Testing Checklist

- [ ] Go to `/settings/company` and enter company contact info
- [ ] Click Save and verify "Company profile updated" message
- [ ] Refresh the page and verify data persists
- [ ] Navigate to a project with an invoice
- [ ] Print the invoice and verify:
  - [ ] PDF save dialog defaults to invoice number filename
  - [ ] Company info at top shows your actual company data
  - [ ] Attached receipt images appear in the PDF

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/api/src/modules/company/dto/update-company.dto.ts` | API DTO for company updates |
| `apps/api/src/modules/company/company.service.ts` | Company CRUD service |
| `apps/web/app/settings/company/page.tsx` | Company settings UI |
| `apps/web/app/projects/[id]/page.tsx` | Invoice print functionality |
| `packages/database/prisma/schema.prisma` | Company model with contact fields |

---

## Commits

1. `feat(api): add company contact fields to PATCH /companies/me`
2. `fix(web): set document title to invoice number for PDF save default filename`
3. `fix(web): wait for images to load before printing invoice PDF`
4. `feat: add company contact info migration and use in invoice print`
