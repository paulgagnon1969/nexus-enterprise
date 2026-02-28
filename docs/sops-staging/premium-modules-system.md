---
title: "Premium Module System - Master Costbook, Golden PETL & BOM"
revision: "1.0"
created: 2026-02-28
author: Warp
tags: [billing, premium-features, costbook, petl, bom]
status: implemented
---

# Premium Module System

One-time purchase modules that give lifetime access to premium NEXUS data libraries: Master Costbook, Golden PETL templates, and Golden BOM templates.

## Overview

NEXUS offers three premium modules as **one-time purchases** with lifetime access and all future updates:

| Module | Code | Price | What's Included |
|--------|------|-------|-----------------|
| **Master Costbook** | `MASTER_COSTBOOK` | $4,999 | 50,000+ pre-priced line items: BWC Cabinets, Xactimate components, construction materials |
| **Golden PETL** | `GOLDEN_PETL` | $2,999 | Pre-built estimate templates for common project types (kitchen, bath, roofing, etc.) |
| **Golden BOM** | `GOLDEN_BOM` | $1,999 | Pre-built Bill of Materials templates with material specs and quantities |

## Architecture

### Database Schema

**ModuleCatalog** — Available modules for purchase:
```prisma
model ModuleCatalog {
  code                 String       @unique // "MASTER_COSTBOOK", "GOLDEN_PETL", etc.
  label                String
  description          String?
  pricingModel         PricingModel // ONE_TIME_PURCHASE
  oneTimePurchasePrice Int?         // Price in cents (499900 = $4,999)
  stripeProductId      String?      // Stripe Product ID
  stripePriceId        String?      // Stripe Price ID
  isCore               Boolean      // false for premium modules
  sortOrder            Int
  active               Boolean
}
```

**TenantModuleSubscription** — Active module subscriptions per company:
```prisma
model TenantModuleSubscription {
  companyId                String
  moduleCode               String    // "MASTER_COSTBOOK", etc.
  stripeSubscriptionItemId String?
  enabledAt                DateTime
  disabledAt               DateTime? // null = active

  @@unique([companyId, moduleCode])
}
```

### Entitlement Checking

**ModuleEntitlementService** (`apps/api/src/modules/billing/module-entitlement.service.ts`):

```typescript
import { PremiumModule, ModuleEntitlementService } from '../billing/module-entitlement.service';

// Check if company has access
const hasAccess = await moduleEntitlement.hasAccess(
  companyId,
  PremiumModule.MASTER_COSTBOOK
);

if (!hasAccess) {
  throw new ForbiddenException('Master Costbook access required');
}
```

**Internal Companies (NEXUS-owned):**
Companies with `isInternal = true` automatically bypass all module checks and get access to everything.

## Usage Patterns

### 1. Master Costbook Sharing

Gate the Master Costbook sharing API to require the premium module:

```typescript
// apps/api/src/modules/pricing/pricing.controller.ts
@Post('master-costbook/share')
async shareMasterToTenant(@Request() req, @Body() dto: ShareMasterDto) {
  const hasAccess = await this.moduleEntitlement.hasAccess(
    req.user.companyId,
    PremiumModule.MASTER_COSTBOOK
  );
  
  if (!hasAccess) {
    throw new ForbiddenException(
      'Master Costbook access required. Purchase at Settings → Modules.'
    );
  }
  
  return this.pricingService.shareMasterItemsToTenant(
    req.user.companyId,
    dto.filters
  );
}
```

### 2. Golden PETL Import

Prevent importing Golden PETL templates without purchase:

```typescript
@Post('petl/import-golden')
async importGoldenPetl(@Request() req, @Body() dto: ImportGoldenPetlDto) {
  const hasAccess = await this.moduleEntitlement.hasAccess(
    req.user.companyId,
    PremiumModule.GOLDEN_PETL
  );
  
  if (!hasAccess) {
    throw new ForbiddenException('Golden PETL access required');
  }
  
  // Proceed with import...
}
```

### 3. Golden BOM Templates

Hide BOM templates in UI for non-subscribers:

```typescript
@Get('bom/templates')
async listBomTemplates(@Request() req) {
  const hasAccess = await this.moduleEntitlement.hasAccess(
    req.user.companyId,
    PremiumModule.GOLDEN_BOM
  );
  
  if (!hasAccess) {
    return {
      templates: [],
      locked: true,
      upgradeUrl: '/settings/modules'
    };
  }
  
  return { templates: await this.bomService.getGoldenTemplates() };
}
```

## Purchase Flow

### 1. List Available Modules

```typescript
GET /billing/modules/available

Response:
[
  {
    "code": "MASTER_COSTBOOK",
    "label": "Master Costbook Access",
    "description": "Lifetime access to 50K+ line items...",
    "oneTimePurchasePrice": 499900,
    "formattedPrice": "$4,999.00"
  },
  ...
]
```

### 2. Purchase Module (Stripe Payment Intent)

```typescript
POST /billing/modules/purchase
Body: { moduleCode: "MASTER_COSTBOOK" }

Creates Stripe PaymentIntent → User completes payment → Webhook grants access
```

### 3. Grant Access (Webhook Handler)

```typescript
// After successful payment
await moduleEntitlement.grantAccess(
  companyId,
  PremiumModule.MASTER_COSTBOOK,
  stripeSubscriptionItemId // optional, for tracking
);
```

## Seeding

**Initial Setup:**
```bash
# Add modules to catalog
npx ts-node scripts/seed-premium-modules.ts

# Output:
# ✅ Created MASTER_COSTBOOK - $4,999.00
# ✅ Created GOLDEN_PETL - $2,999.00
# ✅ Created GOLDEN_BOM - $1,999.00
```

**Granting to Internal Company:**
```sql
-- Auto-grant all modules to NEXUS-owned companies
UPDATE "Company" SET "isInternal" = true WHERE "id" = 'cmm0sv0sw00037n7n83z71ln9';
```

## Stripe Integration

### Create Stripe Products

```bash
# Master Costbook
stripe products create \
  --name="Master Costbook Access" \
  --description="Lifetime access to 50K+ pre-priced line items"

# Create one-time Price
stripe prices create \
  --product={PRODUCT_ID} \
  --unit-amount=499900 \
  --currency=usd \
  --billing-scheme=per_unit

# Update ModuleCatalog with IDs
UPDATE "ModuleCatalog" 
SET "stripeProductId" = 'prod_...', "stripePriceId" = 'price_...'
WHERE "code" = 'MASTER_COSTBOOK';
```

### Webhook Handling

```typescript
// apps/api/src/modules/billing/billing.controller.ts
@Post('webhooks/stripe')
async handleStripeWebhook(@Body() event: any) {
  if (event.type === 'payment_intent.succeeded') {
    const metadata = event.data.object.metadata;
    
    if (metadata.moduleCode && metadata.companyId) {
      await this.moduleEntitlement.grantAccess(
        metadata.companyId,
        metadata.moduleCode
      );
    }
  }
}
```

## UI Integration

### Settings → Modules Page

Show available modules with purchase buttons:

```typescript
const modules = await fetch('/billing/modules/available');
const companyModules = await fetch('/billing/modules/company');

modules.forEach(mod => {
  const owned = companyModules.some(cm => cm.code === mod.code);
  
  if (owned) {
    // Show "✓ Purchased - Lifetime Access"
  } else {
    // Show "Purchase - $X,XXX" button
  }
});
```

### Feature Upsell Modals

When user tries to access locked feature:

```tsx
<Modal>
  <h2>Master Costbook Required</h2>
  <p>Get instant access to 50,000+ pre-priced line items...</p>
  <Button href="/settings/modules">
    Upgrade Now - $4,999 One-Time
  </Button>
</Modal>
```

## Testing

### Grant Access Manually (Dev)

```typescript
import { PremiumModule, ModuleEntitlementService } from '...';

// Grant Master Costbook to Iron Shield, LLC
await moduleEntitlement.grantAccess(
  'cmm0sv0sw00037n7n83z71ln9',
  PremiumModule.MASTER_COSTBOOK
);
```

### Check Access

```typescript
const hasAccess = await moduleEntitlement.hasAccess(
  'cmm0sv0sw00037n7n83z71ln9',
  PremiumModule.MASTER_COSTBOOK
);

console.log(hasAccess); // true
```

## Migration Path

### Before Premium System
- Master Costbook was free, auto-shared to all tenants
- Golden PETL/BOM didn't exist

### After Premium System
1. **Existing customers**: Grandfathered in (auto-grant access via migration)
2. **New customers**: Must purchase to access
3. **Internal companies**: Always get all modules (`isInternal = true`)

### Grandfathering Script

```sql
-- Grant Master Costbook to all existing companies (before launch date)
INSERT INTO "TenantModuleSubscription" ("id", "companyId", "moduleCode", "enabledAt")
SELECT 
  gen_random_uuid(),
  id,
  'MASTER_COSTBOOK',
  NOW()
FROM "Company"
WHERE "createdAt" < '2026-03-01' -- Launch date
ON CONFLICT DO NOTHING;
```

## Pricing Rationale

| Module | Price | Reasoning |
|--------|-------|-----------|
| Master Costbook | $4,999 | Replaces 100+ hours of manual costbook building ($50-100/hr = $5K-10K in labor) |
| Golden PETL | $2,999 | Saves 20-40 hours per template × 10 templates = 200-400 hours saved |
| Golden BOM | $1,999 | Instant BOMs for common scopes = 10-20 hours saved per project |

**ROI**: Companies save 10-50x the purchase price in labor costs within first year.

## Future Enhancements

- [ ] Bundle pricing: All 3 modules for $7,999 (save $2,000)
- [ ] Annual update subscriptions: $499/year for Master Costbook updates (optional)
- [ ] Custom PETL/BOM creation service: $999 per custom template
- [ ] White-label pricing: Resellers can rebrand and mark up 20-50%

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-28 | Initial premium module system |
