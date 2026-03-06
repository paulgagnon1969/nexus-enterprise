---
title: "Session Export — Client Portal Implementation"
session_date: 2026-03-06
topics: [client-portal, auth, project-service, typescript, client-invite]
status: decisions-captured
related_cam: CLT-COLLAB-0001
---

# Session: Client Portal — Full Stack Implementation

**Date:** 2026-03-06
**Participants:** Paul, Warp
**Follows:** `session-2026-03-06-client-onboarding-simplification.md` (design/decision phase)

## What Was Built

This session implemented the full client invite and portal flow designed earlier in the day. All work is on `main`.

### Frontend (`apps/web`)

**`app/ui-shell.tsx`**
- Added `path.startsWith('/client-portal')` and `path.startsWith('/register/client')` to `isPublicRoute` — strips the NCC sidebar/shell from these pages so clients get a clean standalone experience.

**`app/login/page.tsx`**
- Added `CLIENT` userType routing: after login, users with `userType === 'CLIENT'` are redirected to `/client-portal` instead of the main dashboard.

**`app/register/client/page.tsx`** (full redesign)
- Dark welcome-page aesthetic (`#0f172a`/`#1e293b` background, `#3b82f6` accent)
- Contractor name and project name displayed prominently as trust signals
- Auto-login on success: stores `accessToken`/`refreshToken`/`userType` from API response, 1.8s success flash, then redirect to `/client-portal`
- Graceful fallback to `/login` if API doesn't return tokens

**`app/client-portal/page.tsx`** (full redesign)
- Dark header with NCC logo, username, and sign-out
- Card grid layout grouped by contractor
- Status pills (green/blue/yellow)
- Contractor avatar initials
- Empty state: "No projects yet"
- Footer with privacy link

**`app/welcome/page.tsx`**
- Added "Invited to view a project? Client Sign In →" secondary pill CTA below hero buttons
- Muted styling — doesn't compete with the contractor pitch

**`app/projects/layout.tsx`** (New Project form)
- Added `inviteClient` checkbox (default: ON when `primaryContactEmail` present)
- Dynamic description: checked = email invite sent; unchecked = contact saved, no invite
- Passes `inviteClient: bool` in the POST body to the API

### Backend (`apps/api`)

**`modules/project/dto/project.dto.ts`**
- Added `@IsOptional() @IsBoolean() inviteClient?: boolean` to `CreateProjectDto`

**`modules/project/project.service.ts`**
- Injected `RedisService` and `EmailService` (both `@Global()` — no module changes needed)
- Added private `inviteProjectClient()` method:
  - Resolves contractor name from DB
  - Finds or creates `User` with `userType: CLIENT` and `$INVITE_PENDING$` placeholder hash
  - Finds or creates `TenantClient` record (by email within company), links `userId`
  - Updates `project.tenantClientId` if not already set
  - Calls `syncClientMembershipForProject()` for `ProjectMembership` with `EXTERNAL_CONTACT` scope
  - Stores 7-day Redis token: `clientinvite:{uuid}` → `{userId, email, firstName, lastName, companyName, projectName, projectId, companyId}`
  - Fire-and-forgets `email.sendClientPortalInvite()` — new users get a registration link, existing users get a "you've been added" notification
- Wired into `createProject()`: after `syncClientMembershipForProject`, if `dto.inviteClient && dto.primaryContactEmail`, calls `inviteProjectClient()` in try/catch (non-fatal)

**`modules/auth/auth.service.ts`** — 5 changes:

1. **`issueTokens()`** — Added optional `userType` param; includes it in JWT payload and Redis payload; stores `userId` explicitly in Redis alongside `sub` (fixes pre-existing bug where `refresh()` looked for `payload.userId` but the stored object only had `payload.sub`)

2. **`login()`** — Added CLIENT user path before the membership check: if `user.userType === UserType.CLIENT`, issues tokens with `companyId: ''` and `userType: CLIENT` and returns early (no membership required)

3. **`refresh()`** — Fixed two issues:
   - Resolves userId from `payload.userId || payload.sub` (backward compat with old Redis tokens)
   - Skips the membership check for CLIENT users (same pattern as SUPER_ADMIN bypass)
   - Allows empty `companyId` for CLIENT users in validation check

4. **`completeClientRegistration()`** — After setting password, now issues tokens and returns `{ok, email, accessToken, refreshToken, userType: 'CLIENT'}` for immediate auto-login on the registration page

5. **`getClientInviteInfo()`** — Added `projectName` to the stored payload type; returns it in the response so the registration page can display the project name as a trust signal

### TypeScript Fixes (`apps/api`)

- **`tsconfig.json`**: Removed `"rootDir": "src"` (caused TS6059 errors when `@repo/database` path alias pulled in source files from `packages/database/src/`) and removed `"types": ["node"]` (was silently suppressing all other installed `@types/*` packages — root cause of 30+ false TS7016 errors)
- **`tsconfig.build.json`**: Added `"rootDir": "src"` here where it belongs (production builds resolve `@repo/database` to `packages/database/dist/*.d.ts`, so no rootDir conflict)
- Installed `@types/express` and `@types/pg` (were the two genuinely missing type packages)
- Result: `tsc --noEmit` now exits 0 with zero errors

## Key Technical Decisions

### Placeholder password hash
New CLIENT users created during invite get `passwordHash: '$INVITE_PENDING$'`. This is an intentionally invalid argon2/bcrypt string — `argon2.verify()` will throw for it, causing `login()` to return "Invalid credentials" if they try to log in before completing registration. `completeClientRegistration()` overwrites it with the real argon2 hash.

### Fire-and-forget email
The email send is fire-and-forget within `inviteProjectClient()` (which itself is awaited by `createProject()`). DB operations (user creation, TenantClient linking, membership creation) are synchronous and guaranteed. If the email fails, it logs a warning but doesn't fail project creation.

### CLIENT companyId sentinel
CLIENT users don't belong to any company. Their JWT payload carries `companyId: ''` (empty string). Most API guards check `companyId` from the token to scope queries — CLIENT users can only access dedicated client-portal endpoints that don't rely on `companyId`. The `refresh()` validation was updated to allow empty `companyId` when `userType === 'CLIENT'`.

## CAM Status
All implementation work maps to **CLT-COLLAB-0001** (rev 1.2 — marked `implementation_status: complete`). No new CAMs created this session.
