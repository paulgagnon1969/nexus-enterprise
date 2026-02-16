# Session Log: Documents Dashboard Consolidation

**Date:** 2026-02-16
**Duration:** ~45 minutes
**Participants:** PG, Warp Agent

## Objective
Consolidate all document-related links into a unified Documents landing page for both tenants and NEXUS System, ensuring consistent UI/UX while preserving admin-only tools for NEXUS System.

## Context
- Tenant `/documents` page had a card-based dashboard layout
- NEXUS System `/system/documents` was a simple list view
- User wanted NEXUS System to have the same card structure as tenants, plus additional admin tools
- NccPM (NCC Programming Manual) needed to remain restricted to `/system/documents/manuals` for SUPER_ADMIN and NCC_SYSTEM_DEVELOPER only

## Changes Made

### 1. Refactored `/system/documents/page.tsx`
**Before:** Simple list view of system documents with a header link to manuals.

**After:** Card-based dashboard matching tenant structure:

**Tenant-equivalent section (top):**
- 📥 Document Inbox → `/documents/inbox`
- 📋 Published Documents → `/documents/copies`
- 📝 Templates → `/documents/templates`
- 📚 Policies & Procedures → `/documents/pnp`
- 🛡️ Safety Manual → `/learning/safety`
- 📘 Manuals → `/documents/manuals`

**System Administration section:**
- 📚 System Documents Library → `/system/documents/library`
- 📖 System Manuals → `/system/documents/manuals`
- 📝 Staged SOPs → `/system/documents/staged-sops`

**Publishing & Distribution section:**
- 🚀 Publish to Tenants → `/system/documents/publish`
- 📊 Tenant Document Status → `/system/documents/tenant-status`
- 📤 Unpublished eDocs → `/admin/documents`

**Quick Actions:**
- + New System Document, + New Manual, + New Template, Review Staged SOPs, Publish to Tenants, Check Inbox

### 2. Created `/system/documents/library/page.tsx`
Moved the original system documents list view to a sub-route, preserving full CRUD functionality for system documents.

### 3. Added Dashboard Stats API Endpoint
`GET /system-documents/dashboard-stats` returns:
- Tenant-equivalent stats: inbox, published, templates, pnp, safety, manuals
- System admin stats: systemDocs, stagedSops, publications, tenantCopies

### 4. Updated System Layout Navigation
Changed "Documents" pill in NEXUS System header bar to link to `/system/documents` instead of `/admin/documents`.

## Architecture Decisions

### NEXUS System as Superset
The `/system/documents` page is a **superset** of the tenant `/documents` page:
- Includes all tenant-visible cards (so NEXUS admins can access tenant-equivalent features)
- Adds system-level admin tools not available to regular tenants
- Maintains consistent UI patterns across both contexts

### NccPM Access Control
NccPM remains restricted:
- **Location:** `/system/documents/manuals` only
- **Access:** `SUPER_ADMIN` and `NCC_SYSTEM_DEVELOPER` only
- **Properties:** `isNexusInternal: true`, `ownerCompanyId: null`

### Route Structure Clarification
| Route | Purpose | Access |
|-------|---------|--------|
| `/documents` | Tenant documents dashboard | All tenant users |
| `/documents/manuals` | Tenant-owned manuals | All tenant users |
| `/admin/documents` | Tenant admin eDoc staging | ADMIN/OWNER |
| `/system/documents` | NEXUS System documents dashboard | SUPER_ADMIN |
| `/system/documents/manuals` | System manuals (NccPM, etc.) | SUPER_ADMIN, NCC_SYSTEM_DEVELOPER |
| `/system/documents/library` | System document CRUD | SUPER_ADMIN |

## Files Changed
- `apps/web/app/system/documents/page.tsx` - Complete rewrite to card-based dashboard
- `apps/web/app/system/documents/library/page.tsx` - New file (moved list view)
- `apps/web/app/system/layout.tsx` - Updated Documents link
- `apps/api/src/modules/system-documents/system-documents.controller.ts` - Added dashboard-stats endpoint
- `apps/api/src/modules/system-documents/system-documents.service.ts` - Added getDashboardStats method

## Testing
- Verified TypeScript compilation for both API and web
- Confirmed NccPM exists in database with correct access controls
- Smoke tested navigation flow: `/system/documents` → System Manuals card → NccPM visible

## Next Steps
- Build out placeholder pages (Staged SOPs, Publish, Tenant Status) as needed
- Consider adding actual stats fetching for tenant-equivalent metrics
- Document the Manual Making Process (MMP) workflow
