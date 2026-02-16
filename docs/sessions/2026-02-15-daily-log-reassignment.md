# Session: Daily Log Reassignment & Mobile Directory Feature
**Date:** February 15-16, 2026

## Summary
This session implemented the daily log reassignment feature and deployed multiple updates to production.

## Features Implemented

### 1. Daily Log Reassignment (API + Web)
Allows PM+ users to move a daily log from one project to another.

**API Changes:**
- New DTO: `apps/api/src/modules/daily-log/dto/reassign-daily-log.dto.ts`
- New endpoint: `POST /daily-logs/:logId/reassign` with body `{ targetProjectId: string }`
- Service method `reassignLog()` in `daily-log.service.ts` (lines 304-394):
  - Validates permissions (author or PM+)
  - Clears PETL context (building, unit, room, SOW item) since they're project-specific
  - Moves linked draft bill to new project if exists
  - Creates audit log entry

**Web Changes:**
- Added "📁 Move" button in view daily log modal header (PM+ only)
- Modal shows dropdown of other projects
- On submit, daily log moves to target project with local state update

### 2. Mobile App Updates
- **Directory Tab**: Replaced Logs tab with a contacts directory
  - Contact cards with quick call, SMS, and email actions
  - Category filtering (Team, Clients, Subs)
  - Search functionality
- **HomeScreen Enhancements**: Project feed showing latest daily logs with inline editing
- **New contacts API**: `apps/mobile/src/api/contacts.ts`

### 3. Dependency Updates
- React updated from 19.0.0 to 19.2.0
- Removed experimental Android flags from app.json

## Commits
1. `d4083bd4` - chore: update React to 19.2.0, remove experimental Android flags
2. `8b89597f` - feat(mobile): add Directory tab with contacts, enhance HomeScreen with project feed
3. `deeccd80` - feat: add daily log reassignment to different project
4. `ce97ba74` - chore(mobile): Add android-apk build profile
5. `35bbf330` - feat: enhance view daily log modal with inline editing

## Deployments
- **Web (Vercel)**: ✅ Deployed to https://ncc.nfsgrp.com
- **Git (GitHub)**: ✅ All commits pushed to origin/main
- **API (Cloud Run)**: ⏳ Deployment attempted but Docker Desktop was not running

## Files Modified

### API
- `apps/api/src/modules/daily-log/dto/reassign-daily-log.dto.ts` (new)
- `apps/api/src/modules/daily-log/daily-log.controller.ts`
- `apps/api/src/modules/daily-log/daily-log.service.ts`

### Web
- `apps/web/app/projects/[id]/page.tsx`

### Mobile
- `apps/mobile/src/api/contacts.ts` (new)
- `apps/mobile/src/api/dailyLog.ts`
- `apps/mobile/src/components/DirectionsDialog.tsx`
- `apps/mobile/src/navigation/AppNavigator.tsx`
- `apps/mobile/src/screens/DirectoryScreen.tsx` (new)
- `apps/mobile/src/screens/HomeScreen.tsx`
- `apps/mobile/app.json`
- `apps/mobile/package.json`

### Root
- `package.json`
- `package-lock.json`

## Pending
- **API Deployment**: Run `./scripts/deploy-api-prod-env.sh` with Docker running to deploy API changes to Cloud Run

## How to Deploy API
```bash
# Ensure Docker Desktop is running
open -a Docker

# Wait for Docker to be ready, then deploy
./scripts/deploy-api-prod-env.sh
```

This will:
1. Build Docker image with current git SHA
2. Push to GCR
3. Run Prisma migrations
4. Deploy to Cloud Run
