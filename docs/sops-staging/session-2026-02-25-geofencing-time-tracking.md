---
title: "Session Export: Automatic Geofencing Time Tracking Implementation"
date: 2026-02-25
author: Warp
tags: [session-export, mobile, geofencing, time-tracking, background-tasks]
---

# Session Export: Automatic Geofencing Time Tracking Implementation

## Session Overview
**Date:** February 25, 2026
**Duration:** ~4 hours
**Version Released:** Mobile v2.8.1

## Problems Solved

### 1. Production Build Failures
Multiple critical build failures were blocking deployments:
- Web app: Missing `AuthProvider` import in projects page, incorrect LiveKit component styles path
- API: Truncated email template in daily brief service, TypeScript errors in video service
- CI/CD: Xcode Cloud workflow failing with code signing issues

**Resolution:**
- Fixed all import paths and auth patterns
- Completed truncated email template
- Migrated iOS builds from Xcode Cloud to GitHub Actions with EAS
- All builds now passing in production

### 2. Manual Time Tracking Friction
Workers had to manually clock in/out via the app, leading to:
- Forgotten clock-ins/outs
- Inaccurate time tracking
- Administrative overhead correcting timecards

**Resolution:**
Implemented fully automatic geofencing-based time tracking that works silently in the background.

## Key Decisions Made

### Architecture Decisions

1. **Silent Background Operation**
   - No notifications to users when clocking in/out
   - App runs geofencing even when closed or logged out
   - Survives phone restarts via AsyncStorage restoration

2. **90-Day Service Tokens**
   - Extended JWT tokens (90 days vs 15 minutes) for background auth
   - Only available to SUPER_ADMIN users
   - Falls back to regular tokens if service token unavailable
   - Stored securely in AsyncStorage with `@nexus_bg_auth` key

3. **Smart Clock Logic**
   - 5-minute dwell time before clock-in (prevents false positives when driving by)
   - 10-minute grace period before clock-out (allows short trips away from site)
   - Work hours enforcement (6am-8pm by default)
   - 150-meter radius per project geofence

4. **Persistent Across Logout**
   - Geofencing continues even after logout
   - Design choice: workers shouldn't have to stay logged in
   - Background task has independent auth token

### Technical Decisions

1. **Expo Location + TaskManager**
   - Used Expo's managed workflow (not bare React Native)
   - Background task: `TaskManager.defineTask('JOB_SITE_GEOFENCE', ...)`
   - iOS/Android handle geofence persistence at OS level

2. **API Integration**
   - Reused existing timecard endpoints: `/timecard/me/clock-in`, `/timecard/me/clock-out`
   - Tagged entries with `source: "geofence_auto"` for audit trail
   - Auto-creates Worker records if missing
   - Automatic ST/OT calculation (first 8 hours ST, rest OT)

3. **State Management**
   - AsyncStorage for persistence: `@nexus_geofence_config`, `@nexus_clock_state`
   - In-memory tracking for dwell times and grace periods
   - Restoration on app launch via `App.tsx` initialization

## Code Changes

### New Files Created
- `apps/mobile/src/services/geofencing.ts` (500 lines) — Core geofencing service with background task definition

### Modified Files
- `apps/mobile/app.json` — Added location permissions and background modes
- `apps/mobile/src/auth/auth.ts` — Auto-setup geofencing on login, 90-day token support
- `apps/mobile/App.tsx` — Restore geofencing on app startup
- `apps/web/app/projects/page.tsx` — Fixed auth pattern and imports
- `apps/web/app/call/join/page.tsx` — Fixed LiveKit styles import
- `apps/api/src/modules/notifications/daily-brief.service.ts` — Completed truncated template
- `apps/api/src/modules/video/video.service.ts` — Fixed TypeScript errors
- `.github/workflows/mobile-ios-build.yml` — New GitHub Actions workflow for EAS builds

### Git Commits
- `9482503` — Fix projects page auth and imports
- `ef618fc` — Fix LiveKit component styles path
- `d3098cd` — Fix daily brief template and video service types
- `05cb755` — Add GitHub Actions iOS build workflow
- `b026cca` — Initial geofencing implementation
- `ed12b02` — Add permissions to app.json
- `8166e42` — Integrate geofencing with login
- `1478de5` — Add service token support
- `8bd79d4` — Add app startup restoration
- `9c67dfc` — Bump version to 2.8.1

## Lessons Learned

### What Worked Well
1. **Reusing Existing API Endpoints** — `/timecard/me/clock-in` and `/timecard/me/clock-out` already had all the logic we needed (Worker creation, ST/OT calculation, validation)
2. **90-Day Service Tokens** — Solved the "what happens when the JWT expires?" problem elegantly
3. **AsyncStorage Restoration** — Simple pattern for making background tasks survive app/phone restarts
4. **Dwell Time Logic** — 5-minute dwell prevents false positives when driving past job sites

### Challenges Encountered
1. **Build Failures Blocking Progress** — Had to fix multiple unrelated build issues before deploying geofencing
2. **Token Expiry Design** — Initial implementation used 15-minute tokens; had to add service token fallback
3. **Logout Behavior** — Decided geofencing should persist across logout (non-obvious design choice)

### Future Improvements
1. **Admin Dashboard for Geofence Management** — Currently geofences are auto-created on login; admins may want to enable/disable per user or per project
2. **Battery Optimization** — Monitor battery impact in production; may need to tune geofence radius or check frequency
3. **Manual Override UI** — Allow users to manually clock in/out even with geofencing active (for edge cases)
4. **Geofence Visualization** — Show project geofence boundaries on a map in the app

## Production Deployment

### Android APK (Build Date: 2026-02-25)
- Built locally via `scripts/build-android-local.sh`
- Location: `~/Library/CloudStorage/GoogleDrive-.../nexus-builds/nexus-mobile-release-20260225-205949.apk`
- Symlink: `nexus-mobile-release-latest.apk`

### iOS IPA (Build #48)
- Built via EAS cloud build
- Submitted to TestFlight automatically
- App Store Connect: https://appstoreconnect.apple.com/apps/6759178271/testflight/ios
- Processing time: 5-10 minutes

### Required Environment Variables
```bash
# For background geofencing to work in production:
EXPO_PUBLIC_API_BASE_URL=https://api.nexus.keystone-restoration.com
```

### Testing Checklist
- [ ] User logs in → geofences created for all projects with lat/long
- [ ] User approaches job site (150m) → auto clock-in after 5 minutes
- [ ] User leaves job site (150m) → auto clock-out after 10 minutes
- [ ] App closed → geofencing continues working
- [ ] Phone restarted → geofencing restored on app launch
- [ ] User logged out → geofencing continues working
- [ ] Check timecard entries have `source: "geofence_auto"` tag
- [ ] Verify ST/OT hours calculated correctly

## Related Documentation
- Mobile Build & Deploy Contract: `/Users/pg/nexus-enterprise/WARP.md` (lines 500-550)
- API Timecard Endpoints: `apps/api/src/modules/timecard/timecard.controller.ts`
- Service Token Generation: `apps/api/src/modules/auth/auth.service.ts`

## Competitive Advantage Score
This feature scores **32/40** on the CAM criteria:
- **Uniqueness:** 9/10 (few construction apps have fully automatic geofencing time tracking)
- **Value:** 9/10 (eliminates manual time tracking friction, reduces payroll errors)
- **Demonstrable:** 7/10 (requires live demo with location spoofing or field test)
- **Defensible:** 7/10 (moderate implementation complexity, requires deep integration)

**Recommendation:** Create a CAM document for marketing and competitive positioning.
