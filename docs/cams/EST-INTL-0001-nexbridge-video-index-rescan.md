---
cam_id: EST-INTL-0001
title: "NexBRIDGE Video Index — Local Evidence Library & Assessment Re-scan"
mode: EST
category: INTL
revision: "1.0"
tags: [cam, est, intl, nexbridge, video-assessment, evidence-management]
status: draft
created: 2026-03-09
updated: 2026-03-09
author: Warp
scores:
  uniqueness: 8
  value: 8
  demonstrable: 9
  defensible: 7
  total: 32
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
---

# NexBRIDGE Video Index — Local Evidence Library & Assessment Re-scan

## Work ↔ Signal
> **The Work**: Persistent local video index stores every assessment's video path + server frame URIs. One-click re-scan preserves all existing findings while extracting new ones.
> **The Signal**: The ability to revisit and refine assessments without losing prior work signals thorough, iterative quality control. (→ Reputation: assessment diligence)

## Elevator Pitch
NexBRIDGE Connect maintains a persistent local index of every video used for property assessments. Saved assessments store both the server-side frame URIs and the local video path, enabling users to reopen any past assessment and instantly re-extract high-resolution frames — or fall back to server-stored images when the video has been moved. A one-click "Re-scan" lets adjusters refine assessments with fresh frames without losing existing findings.

## The Problem
Traditional video-based inspection tools treat the assessment as a one-shot process: record → analyze → save → done. If an adjuster needs to revisit the raw footage weeks later to zoom into a specific area, verify a finding, or extract better frames, they must create an entirely new assessment and lose all prior AI analysis, manual overrides, and narrative edits.

## How It Works

### Local Video Index (`video-index.json`)
- Tauri plugin-store persists a JSON index on the local SSD, keyed by video file path.
- Each entry stores: file name, duration, resolution, linked assessment IDs, creation date, last accessed date.
- On assessment save, the video is automatically registered in the index.

### Frame URI Persistence
- Uploaded frame URIs (MinIO `gs://` paths) are stored in `assessmentJson.frameUris`.
- The local video path is stored in `assessmentJson.localVideoPath`.
- Both persist through the API into the database.

### Reopen Flow (Two-Tier Fallback)
1. **Local video exists** → Re-extract frames via FFmpeg (full quality, zoom/teach/NexCAD all work).
2. **Video moved/deleted** → Fetch signed URLs from MinIO for stored frames (read-only thumbnails with zoom).

### Re-scan Action
- One-click "Re-scan Video" button on any reopened assessment.
- Opens file picker → extracts frames → uploads to server → updates assessmentJson.
- All existing findings, narrative, overrides, and supplemental teach results are preserved.
- Video is registered/updated in the local index.

## Competitive Differentiation
- **Xactimate/XactScope**: No local video indexing; video assessments are not reopenable with frame data.
- **CompanyCam**: Photo-focused; no video frame extraction or AI assessment linkage.
- **Hover**: 3D model focused; no iterative video assessment refinement.
- **Generic inspection apps**: Treat each capture session as independent; no cross-session evidence continuity.

## Demo Script
1. Open NexBRIDGE Connect → run a new video assessment → save it.
2. Close the assessment, return to dashboard.
3. Click the saved assessment card → it reopens with all frames restored.
4. Double-click a frame → zoom lightbox.
5. Click "Re-scan Video" → select same or different video → frames refresh, findings stay.
6. Show a second device where the video doesn't exist → fallback frames load from server.

## Technical Architecture
- `src/lib/video-index.ts` — Tauri store CRUD for IndexedVideo records
- `src/lib/api.ts` — `getSignedUrl()` for MinIO fallback
- `src/pages/VideoAssessment.tsx` — save/reopen/rescan integration
- `apps/api/src/modules/uploads/uploads.controller.ts` — `GET /uploads/signed` endpoint

## NexOP Impact
- **Category**: Estimating Intelligence — Evidence Continuity
- **Estimated NexOP contribution**: ~0.18%
- **Basis**: Eliminates re-assessment waste. Without video indexing, adjusters who need to revisit findings create entirely new assessments (losing 15–30 minutes of AI analysis + manual overrides per re-do). For a firm running 5 video assessments/week, 20% needing re-inspection = ~52 re-scans/year × 25 min saved = ~22 hours/year of estimator time. Additionally, the persistent evidence library serves as audit documentation for disputed claims.

## Future Extensions
- **Cloud index sync**: Back up the local video index to the API so assessments are recoverable on a new device.
- **Video timeline markers**: Show AI findings as markers on a video timeline scrubber — click a finding to jump to the exact frame.
- **Batch re-scan**: Select multiple saved assessments and re-extract frames from a single new video (useful when a property is revisited months later).
- **Assessment diff**: Compare two assessments of the same property side-by-side to show damage progression.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-09 | Initial release — video index, frame persistence, re-scan |
