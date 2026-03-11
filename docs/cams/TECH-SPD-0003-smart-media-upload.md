---
cam_id: TECH-SPD-0003
title: "Smart Media Upload — Network-Aware Compression & Video"
mode: TECH
category: SPD
revision: "2.1"
status: draft
created: 2026-02-21
updated: 2026-03-04
author: Warp
website: false
scores:
  uniqueness: 7
  value: 8
  demonstrable: 9
  defensible: 5
  total: 29
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, field]
tags: [cam, technology, speed, media, upload, compression, video, bandwidth, mobile, field]
---

# TECH-SPD-0003: Smart Media Upload

> *Capture everything. Upload smart. Never lose a photo.*

## Work ↔ Signal
> **The Work**: Network-tier detection with automatic compression, concurrency, and video gating adjustments. Metadata syncs instantly; heavy files queue intelligently.
> **The Signal**: Higher media upload success rates mean more complete project documentation — the system ensures field evidence is captured regardless of connectivity. (→ Reputation: documentation completeness)

## Elevator Pitch
Field crews capture hundreds of photos and videos per week on job sites with spotty cellular. Nexus automatically detects the network tier and adjusts image compression, upload concurrency, and video gating in real time — no settings, no manual quality selection, no lost media. Metadata syncs instantly on any connection; heavy files queue intelligently and upload when bandwidth allows. Competing apps either upload full-resolution images (slow, expensive data) or force manual quality choices that field workers ignore.

## The Problem
Construction sites have notoriously unreliable connectivity — steel structures, basements, rural locations, and temporary job-site WiFi all create dead zones and bandwidth constraints. Field documentation depends on photos and videos:

- **Full-resolution uploads on cellular** — a single 4K photo is 8-12MB. Ten photos from a walkthrough = 80-120MB on a metered cellular plan. Upload takes minutes, blocks metadata sync, and often times out.
- **Manual quality selection** — some apps offer "Low/Medium/High" quality settings. Field crews either ignore them (always high) or set-and-forget (always low, losing detail when it matters).
- **Video is avoided entirely** — most field apps don't support video in daily logs because the upload problem is unsolved. Crews resort to taking 20 photos instead of one 15-second video.
- **Lost media** — upload failures on cellular with no retry mechanism mean photos disappear. The field worker assumes they uploaded; the PM sees nothing.
- **Data plan overages** — companies with 10+ field workers routinely see $200-500/month in cellular overage charges from unoptimized media uploads.

## How It Works

1. **Network detection** — On every upload, the app checks the current connection type (WiFi, 5G, LTE, 3G).
2. **Adaptive compression** — Images are compressed to the optimal quality tier for the detected network:
   - WiFi: ~400KB (high quality, full detail for documentation)
   - Cellular: ~150KB (optimized, still legible for all construction documentation needs)
3. **Concurrency throttling** — Upload queue runs 3 concurrent uploads on WiFi, 1 on cellular. Prevents bandwidth saturation that would block other app functions.
4. **WiFi-gated video** — Video files are captured and queued immediately, but upload is held until WiFi is detected. A progress indicator shows pending videos.
5. **Metadata-first sync** — Log text, timestamps, GPS coordinates, and field notes sync instantly on any connection. Binary files (photos/videos) queue separately so the log record is never delayed by media.
6. **Resume capability** — Each upload tracks byte-level progress. If the connection drops, the upload resumes from where it left off — no re-upload of the entire file.

## Expected Operational Impact

All impact figures are expressed as a **percentage of annual revenue** so they scale naturally across company sizes.

| Category | % of Revenue | What It Represents |
|----------|-------------|--------------------|
| **Field time saved** | ~0.14% | Upload waits eliminated — crews document and move on instead of watching progress bars |
| **PM time saved** | ~0.03% | PMs no longer chasing missing photos from field workers |
| **Video documentation enabled** | ~0.03% | Rework prevented by video evidence that was previously impossible to upload from the field |
| **Cellular data cost reduction** | ~0.03% | ~60% compression savings on metered data plans across all field devices |
| **Prevented lost media** | ~0.01% | Upload failures with no retry eliminated — every photo and video arrives |
| **Total Smart Media Impact** | **~0.24%** | **Combined field efficiency and documentation reliability as a share of revenue** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | Smart Media Impact (~0.24%) |
|---------------|----------------------------|
| **$1M** | **~$3,200** |
| **$2M** | **~$7,000** |
| **$5M** | **~$12,000** |
| **$10M** | **~$23,700** |
| **$50M** | **~$89,000** |

*Scales with field crew size and photo volume. The video documentation savings compound over time — insurance carriers increasingly accept video evidence for supplement support, and a single video walkthrough can prevent $5K+ in disputed scope.*

## Competitive Landscape

| Competitor | Adaptive Compression? | WiFi-Gated Video? | Resume Upload? | Metadata-First Sync? | Concurrency Throttle? |
|------------|----------------------|-------------------|---------------|---------------------|----------------------|
| CompanyCam | No — full resolution always | No video in logs | No | No | No |
| Buildertrend | No — manual quality | No | No | No | No |
| Procore | Partial — basic compression | No | Partial | No | No |
| CoConstruct | No | No video support | No | No | No |
| JobNimbus | No | No | No | No | No |
| Fieldwire | Partial | No | No | No | No |

No competitor offers the full stack: adaptive compression + WiFi-gated video + resume + metadata-first sync + concurrency throttling.

## Demo Script
1. Show the app on cellular — capture a photo, note the **"Cellular"** badge and ~150KB file size in the upload indicator.
2. Switch to WiFi — capture another photo, note the **"WiFi"** badge and ~400KB file size (higher quality, same capture effort).
3. Record a 15-second video on cellular — show it captured and queued with a "Waiting for WiFi" badge.
4. Connect to WiFi — video begins uploading with a per-file progress bar.
5. Kill the WiFi mid-upload — show upload pauses. Reconnect — upload resumes from where it stopped (no restart).
6. Open the daily log on the web — show metadata (text, time, GPS) already synced even though the video is still uploading. *"The PM already has the log. The media follows."*
7. Show the monthly data usage comparison: Nexus vs. a competitor uploading full-res. *"That's $300/month your crews aren't spending on data overages."*

## Technical Implementation

- **Network detection**: React Native `NetInfo` API for connection type + effective bandwidth estimation
- **Image compression**: `react-native-image-resizer` with quality tiers mapped to network type
- **Upload queue**: Custom FIFO queue with concurrency limiter (1 for cellular, 3 for WiFi)
- **WiFi gate**: Video uploads held in queue with `waitForWifi: true` flag; released on `NetInfo` WiFi event
- **Resume**: `Content-Range` header-based chunked upload to MinIO/S3; progress persisted to AsyncStorage
- **Metadata-first**: Log record POST fires immediately; media uploads are decoupled and linked by `dailyLogId`

## Scoring Rationale

- **Uniqueness (7/10)**: Network-aware upload optimization exists in consumer apps (Google Photos, iCloud) but is absent from construction PM tools. The combination of adaptive compression + WiFi gating + resume + metadata-first sync is unique in this vertical.
- **Value (8/10)**: Field documentation is the #1 daily workflow for construction crews. Removing upload friction directly increases documentation quality and completeness. The data cost savings alone justify the feature for companies with 10+ field workers.
- **Demonstrable (9/10)**: Extremely visual — show the network badge, the file size difference, the video queue, the resume. Every step is visible and intuitive. One of the easiest CAMs to demo on stage.
- **Defensible (5/10)**: The individual techniques are well-known (compression, queuing, resume). The defensibility is in the integration — all five optimizations working together transparently, tuned for construction-site network conditions.

**Total: 29/40** — Exceeds CAM threshold (24).

## Related CAMs

- `FIN-AUTO-0001` — Inline Receipt OCR (receipt photos benefit from smart compression)
- `OPS-VIS-0001` — Field Qty Discrepancy Pipeline (field photos documenting discrepancies upload reliably)
- `OPS-VIS-0002` — Urgency Task Dashboard (task photos from daily logs sync without blocking metadata)
- `TECH-ACC-0001` — Graceful Sync Fallback (same resilience philosophy applied to media uploads)

## Expansion Opportunities

- **Offline capture queue** — full offline mode with local storage and batch sync on reconnection
- **AI-assisted quality check** — reject blurry or dark photos before upload ("This photo may not be usable — retake?")
- **Bandwidth scheduling** — schedule large video uploads for off-peak hours (overnight WiFi sync)
- **Photo deduplication** — detect and skip duplicate photos (same subject, same angle, seconds apart)
- **Progressive image loading** — serve low-res thumbnails immediately, full-res on demand in the web app
- **Timelapse generation** — auto-compile daily progress photos into project timelapse videos

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-21 | Initial draft — smart media upload concept |
| 2.0 | 2026-03-04 | Full rewrite: standardized format, elevator pitch, operational savings, competitive landscape, scoring rationale, related CAMs, expansion opportunities |
| 2.1 | 2026-03-05 | Converted financial impact to NexOP (% of revenue) format with tenant scaling table |
