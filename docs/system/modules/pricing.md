# Module: Pricing – Golden vs Tenant Cost Books

## Purpose

The Pricing module manages the system-wide Golden Price List and per-tenant Cost Books used as the baseline for estimates, quotes, and financial reporting.

- **Golden Price List**: A Nexus System–owned, global Xactimate price list that acts as the canonical baseline for all tenants.
- **Tenant Cost Book**: A per-company copy of Golden that can evolve locally via CSV/PETL uploads and (future) repricing, without mutating Golden.

## High-level design

### Golden Price List (system-wide)

- Stored in `PriceList` / `PriceListItem` with `kind = GOLDEN`.
- Only **SUPER_ADMIN** users in the Nexus System context can upload or modify Golden.
- Golden uploads are handled via a PETL (CSV) pipeline, with work tracked in `ImportJob` records.

### Tenant Cost Books (per company)

- Each tenant company can have one or more `CompanyPriceList` records (active Cost Books).
- `CompanyPriceListItem` rows are initially seeded from Golden, but can diverge over time.
- Tenant CSV/PETL uploads **only** update `CompanyPriceListItem`, never Golden.
- Xactimate repricing can later be re-pointed to tenant Cost Books instead of Golden.

## Data model summary

**Core models** (Prisma schema):

- `PriceList`
  - `kind: PriceListKind` (e.g. `GOLDEN`, `ACTIVE`)
  - `companyLists: CompanyPriceList[]` (reverse relation to tenant Cost Books)

- `PriceListItem`
  - Golden line items (Cat/Sel/Activity/Desc, unit price, etc.)
  - `canonicalKeyHash` used to match rows across revisions and to tenant items
  - `companyItems: CompanyPriceListItem[]` (reverse relation to tenant items)

- `CompanyPriceList`
  - `companyId`: owning organization (tenant)
  - `basePriceListId`: Golden revision it was originally seeded from
  - `label`, `revision`, `effectiveDate`, `currency`, `isActive`

- `CompanyPriceListItem`
  - Mirrors key Golden fields but is scoped to a single tenant Cost Book
  - `companyPriceListId`: link to `CompanyPriceList`
  - `priceListItemId?`: optional pointer back to Golden `PriceListItem`
  - `canonicalKeyHash`: same hash algorithm as Golden for alignment
  - `unitPrice`, `lastKnownUnitPrice`: current vs previous tenant prices

- `ImportJob` (pricing-related types)
  - `type: PRICE_LIST` – Golden PETL uploads (system-wide)
  - `type: PRICE_LIST_COMPONENTS` – Golden components import
  - `type: COMPANY_PRICE_LIST` – tenant Cost Book CSV imports

## API surface (current)

> All routes below are under the `PricingController` (`/pricing`), and protected by JWT.

### Golden – Nexus System only

- `POST /pricing/price-list/import`
  - **Who**: `globalRole = SUPER_ADMIN` only.
  - **What**: Accepts a Golden price list CSV and enqueues a `PRICE_LIST` ImportJob.
  - **Worker behavior**: Imports the CSV into a new `PriceList(kind=GOLDEN)` revision, deactivates previous active Golden, and logs a `GoldenPriceUpdateLog` event with `source = GOLDEN_PETL`.

- `POST /pricing/price-list/current`
  - Returns metadata about the current active Golden price list and (if available) the last successful Golden import job for the caller’s company.

- `POST /pricing/price-list/table`
  - Returns a raw table view of the active Golden list (Cat/Sel/Description, unit price, last known price, division mapping).

- `POST /pricing/price-list/uploads`
  - Returns recent Golden uploads (label, revision, effective date, item counts).

### Tenant Cost Books – per company

- `POST /pricing/company-price-list/seed-from-golden`
  - **Who**: Tenant `OWNER` / `ADMIN` (or higher), or `SUPER_ADMIN`.
  - **What**: Ensures the calling company has an active `CompanyPriceList` seeded from the current Golden. If one exists, it is returned; otherwise a new Cost Book is created and populated from Golden.
  - **Returns**: `{ companyPriceListId, basePriceListId, label, revision, effectiveDate, currency, isActive, createdAt }`.

- `POST /pricing/company-price-list/import`
  - **Who**: Tenant `OWNER` / `ADMIN` (or higher), or `SUPER_ADMIN`.
  - **What**: Accepts a tenant CSV/PETL file and enqueues a `COMPANY_PRICE_LIST` ImportJob.
  - **Worker behavior**:
    - Ensures a `CompanyPriceList` exists for the company (seeding from Golden if needed).
    - For each row, computes `canonicalKeyHash` from Cat/Sel/Activity/Desc.
    - If a matching `CompanyPriceListItem` exists, updates `unitPrice` and preserves the prior value in `lastKnownUnitPrice`.
    - If no match exists, inserts a new `CompanyPriceListItem`, optionally linking to the Golden `PriceListItem` with the same hash.
  - **ResultJson** (stored on ImportJob): `{ companyPriceListId, updatedCount, createdCount, totalProcessed }`.

## RBAC overview (Pricing)

- **Nexus System (SUPER_ADMIN):**
  - Can upload Golden price lists via `/pricing/price-list/import`.
  - Can seed and import tenant Cost Books for any company if needed.

- **Tenant OWNER / ADMIN:**
  - Cannot upload Golden.
  - Can seed their own company’s Cost Book from Golden.
  - Can upload tenant CSVs that update only their `CompanyPriceListItem` rows.

## Change journal

> All timestamps UTC unless otherwise noted.

- **2026-01-06** – Golden vs Tenant Cost Books separation
  - Added `CompanyPriceList` and `CompanyPriceListItem` models in Prisma and corresponding SQL migration.
  - Extended `ImportJobType` with `COMPANY_PRICE_LIST` for tenant Cost Book imports.
  - Tightened Golden upload RBAC so only `SUPER_ADMIN` can call `/pricing/price-list/import`.
  - Added `ensureCompanyPriceListForCompany(companyId)` to seed a Cost Book from the active Golden list.
  - Introduced tenant Cost Book endpoints:
    - `POST /pricing/company-price-list/seed-from-golden`
    - `POST /pricing/company-price-list/import`
  - Updated the worker to handle `COMPANY_PRICE_LIST` ImportJobs and upsert `CompanyPriceListItem` rows without mutating Golden.

- **2025-12-22** – Golden Price List foundation (historical)
  - Introduced `PriceList` / `PriceListItem` models and Golden PETL import pipeline.
  - Enabled `PRICE_LIST` ImportJobs to ingest Golden CSVs into a versioned, system-wide price list.

## Notes for Nexus System support staff

- When troubleshooting pricing issues, determine whether the problem is with:
  - The **Golden list** (affects all tenants) – check Golden PETL imports and `PriceList` revisions.
  - A specific **tenant Cost Book** – inspect `CompanyPriceList` / `CompanyPriceListItem` and tenant-level `COMPANY_PRICE_LIST` ImportJobs.
- Before advising a tenant to upload a new CSV, confirm they have an active Cost Book seeded from Golden via `/pricing/company-price-list/seed-from-golden`.
- Golden uploads should only be performed after validating data quality, since they establish the baseline for all future Cost Books.
