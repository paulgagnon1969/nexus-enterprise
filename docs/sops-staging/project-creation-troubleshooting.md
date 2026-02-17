---
title: "Project Creation Troubleshooting SOP"
module: project-management
revision: "1.0"
tags: [sop, project-management, api, troubleshooting, admin]
status: draft
created: 2026-02-17
updated: 2026-02-17
author: Warp
---

# Project Creation Troubleshooting

## Purpose
Documents the resolution of the 500 Internal Server Error encountered when creating new projects via the web interface, and provides guidance for similar API validation issues.

## Who Uses This
- Developers debugging API errors
- DevOps investigating production incidents
- Admin users reporting project creation failures

## Issue Summary
**Symptom:** Users receive `Create failed (500) {"statusCode":500,"message":"Internal server error"}` when attempting to create a new project in production.

**Root Cause:** Empty string values (`""`) for optional foreign key fields (specifically `tenantClientId`) were being passed to Prisma instead of `undefined`. Prisma interprets an empty string as a valid ID and attempts to create a foreign key relationship with a non-existent record.

**Affected Code:** `apps/api/src/modules/project/project.service.ts` - `createProject()` method

## Technical Details

### The Problem
The frontend sends empty strings for optional fields when no value is provided:
```json
{
  "name": "Test Project",
  "addressLine1": "123 Main St",
  "city": "Denver",
  "state": "CO",
  "tenantClientId": ""  // Empty string, not null/undefined
}
```

The backend used nullish coalescing (`??`) which only handles `null` and `undefined`:
```typescript
// BEFORE (broken)
tenantClientId: dto.tenantClientId ?? undefined  // "" passes through as ""
```

### The Fix
Changed to logical OR (`||`) which treats empty strings as falsy:
```typescript
// AFTER (fixed)
tenantClientId: dto.tenantClientId || undefined  // "" becomes undefined
```

### Fields Updated
All optional string fields in `createProject()` were updated:
- `externalId`
- `addressLine2`
- `postalCode`
- `country`
- `primaryContactName`
- `primaryContactPhone`
- `primaryContactEmail`
- `tenantClientId`

## Workflow

### Debugging Steps for Similar Issues

```mermaid
flowchart TD
    A[User reports 500 error] --> B{Check API logs}
    B --> C[Identify failing endpoint]
    C --> D[Review Prisma query]
    D --> E{Foreign key constraint?}
    E -->|Yes| F[Check for empty string values]
    E -->|No| G[Check other constraints]
    F --> H[Update ?? to || for optional FK fields]
    H --> I[Run type check]
    I --> J[Deploy fix]
    G --> K[Investigate further]
```

### Step-by-Step Resolution
1. Identify the failing endpoint from error message or logs
2. Locate the service method handling the request
3. Check Prisma `create()` or `update()` calls for optional foreign key fields
4. Verify nullish coalescing vs logical OR usage for string fields
5. Update `??` to `||` for optional string fields that could be empty
6. Run `npm run check-types` to verify changes compile
7. Commit and deploy

## Prevention Guidelines

### For Developers
- Use `||` (logical OR) instead of `??` (nullish coalescing) for optional string fields that may receive empty strings from the frontend
- Consider adding validation in DTOs to transform empty strings to undefined
- Add explicit null checks for foreign key fields before Prisma operations

### Example DTO Transform (Future Enhancement)
```typescript
@Transform(({ value }) => value || undefined)
@IsOptional()
@IsString()
tenantClientId?: string;
```

## Related Modules
- [Project Management](/docs/architecture/ncc-overview.md)
- [API Error Handling](/apps/api/src/common)
- [Prisma Database Layer](/packages/database)

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-17 | Initial release - Documents tenantClientId empty string fix |
