---
title: "NexBRIDGE Subscription Model SOP"
module: nexbridge
revision: "1.0"
tags: [sop, nexbridge, billing, subscription, modules, pricing]
status: draft
created: 2026-03-07
updated: 2026-03-07
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# NexBRIDGE Subscription Model

## Purpose

This SOP defines the tiered subscription model for NexBRIDGE Connect, the desktop companion app for NCC. NexBRIDGE uses a hybrid pricing model: a base bundle plus optional add-on modules, each gated by the existing NCC entitlement and billing infrastructure.

## Module Tiers

### NEXBRIDGE — Base Bundle ($29/seat/month)
Included features:
- **Contacts**: Sync macOS/Windows contacts to NCC
- **Documents**: Scan local folders, convert DOCX/PDF/MD to HTML, upload to NCC
- **Assets**: View and manage company assets, upload attachments, rental pool
- **Settings**: App configuration, environment selection
- **Support**: In-app support access

This is the prerequisite for all add-on modules. Without `NEXBRIDGE`, the app shows the `EntitlementBlockedScreen`.

### NEXBRIDGE_ASSESS — Video Assessment ($29/seat/month)
Requires: `NEXBRIDGE`
- FFmpeg-powered video frame extraction (adaptive and fixed modes)
- GCS upload + Gemini AI analysis
- Zoom & Teach: re-analyze frame crops with web-grounded AI
- Assessment persistence to NCC with findings, severity, and costbook codes

### NEXBRIDGE_NEXPLAN — NexPLAN Selections ($39/seat/month)
Requires: `NEXBRIDGE`
- Vendor catalog browser (offline SQLite cache)
- Floor plan upload and AI-assisted dimension extraction
- Natural language layout design with AI
- Selection sheet generation (HTML eDoc + SVG floor plan)
- Sync selection sheets to NCC Nexus Documents

### NEXBRIDGE_AI — AI Features Pack ($19/seat/month)
Requires: `NEXBRIDGE`
- Local AI inference via Rust (dimension extraction, product fitting)
- Enhanced OpenAI Vision analysis across all modules
- Offline dimension extraction from architectural drawings
- Auto-suggest nearest catalog match

## Pricing Summary

| Configuration | Monthly Cost |
|---|---|
| Base only | $29 |
| Base + Assess | $58 |
| Base + NexPLAN | $68 |
| Base + AI | $48 |
| Full stack (all 4) | $116 |

**Trial tenants**: All features enabled during trial period.
**Internal tenants**: All features permanently enabled.

## How Entitlements Work

### API Side
1. Each module is a row in `ModuleCatalog` with a unique `code`, `stripePriceId`, and `prerequisites[]`
2. When a tenant enables a module, a `TenantModuleSubscription` record is created
3. The `EntitlementService` resolves entitlements: override → subscription → trial → core
4. Results are cached in Redis (60s TTL, fail-open)
5. API endpoints are gated by `@RequiresModule('CODE')` decorator on controllers

### Client Side
1. On login, NexBRIDGE calls `GET /billing/entitlements`
2. Response includes `modules[]` (enabled codes) and `features` map:
   ```json
   {
     "modules": ["NEXBRIDGE", "NEXBRIDGE_ASSESS"],
     "features": {
       "nexbridge": true,
       "assess": true,
       "nexplan": false,
       "ai": false
     }
   }
   ```
3. `useAuth()` exposes `hasFeature(code)` and `features` object
4. Nav items with `requiresModule` are hidden when the module is not enabled
5. Routes render `UpsellCard` when the feature is not available
6. UpsellCard directs user to NCC Settings → Membership to enable the module

### License Lifecycle
Applies to the base `NEXBRIDGE` module:
- **ACTIVE**: Full access
- **GRACE_PERIOD**: 14 days after subscription lapses; full access with warning banner
- **EXPORT_ONLY**: 30 days after grace period; read-only, can export data
- **LOCKED**: Past export window; sign-out only

## Enabling a Module

### For Tenants
1. Open NCC web → Settings → Membership
2. Find the NexBRIDGE add-on module
3. Click "Enable" → Stripe adds a subscription item with proration
4. NexBRIDGE rechecks entitlements on next API call (within 60s)

### For Admins (Override)
```bash
# Grant a module directly (bypasses Stripe)
curl -X POST https://staging-api.nfsgrp.com/billing/modules/NEXBRIDGE_NEXPLAN/grant \
  -H "Authorization: Bearer $TOKEN"
```

### Via Stripe Webhook
When a subscription item is added/removed, the webhook:
1. Updates `TenantModuleSubscription`
2. Calls `entitlements.invalidate(companyId)` to bust the Redis cache
3. Next NexBRIDGE API call picks up the change

## File Locations

| Component | Path |
|---|---|
| Module catalog seed | `apps/api/src/scripts/seed-module-catalog.ts` |
| Entitlement service | `apps/api/src/modules/billing/entitlement.service.ts` |
| Module guard | `apps/api/src/modules/billing/module.guard.ts` |
| Entitlements endpoint | `apps/api/src/modules/billing/billing.controller.ts` (`GET /billing/entitlements`) |
| License interceptor | `apps/api/src/common/license-status.interceptor.ts` |
| NexBRIDGE auth hook | `apps/nexbridge-connect/src/hooks/useAuth.ts` |
| NexBRIDGE API client | `apps/nexbridge-connect/src/lib/api.ts` |
| UpsellCard component | `apps/nexbridge-connect/src/components/UpsellCard.tsx` |
| Feature-gated nav | `apps/nexbridge-connect/src/App.tsx` |

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-07 | Initial draft — 4-tier hybrid subscription model |
