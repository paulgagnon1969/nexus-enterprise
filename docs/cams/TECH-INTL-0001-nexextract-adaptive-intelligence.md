---
cam_id: "TECH-INTL-0001"
title: "NexEXTRACT™ — Adaptive Intelligence Video Assessment"
mode: TECH
category: INTL
revision: "2.0"
tags: [cam, tech, intelligence, video-assessment, drone, nexextract, ai, proprietary, learning-loop]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
scores:
  uniqueness: 9
  value: 9
  demonstrable: 9
  defensible: 8
  total: 35
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
website: true
---

# NexEXTRACT™ — Adaptive Intelligence Video Assessment

## Executive Summary

NexEXTRACT is NEXUS's proprietary video processing technology that intelligently selects frames from drone and handheld property walkthrough videos based on **camera motion and scene complexity** rather than fixed time intervals. This ensures critical damage areas captured during fast pans, turns, and approach maneuvers are never missed — a problem that plagues every competitor using simple interval-based frame sampling.

Combined with NEXUS's **Zoom & Teach** AI learning loop, NexEXTRACT creates a continuously improving assessment pipeline where human expertise trains the AI to recognize materials and damage patterns specific to each company's market.

## Work ↔ Signal
> **The Work**: Per-company learning loop where every correction improves future extraction accuracy. Adaptive to each tenant's unique vendor naming, terminology, and regional variations.
> **The Signal**: Extraction accuracy that improves with use is a compounding capability signal — the longer a tenant uses the system, the better it understands their business. (→ Capability: adaptive intelligence)

## The Problem

Standard video-to-AI assessment tools extract frames at fixed intervals (e.g., one frame every 10 seconds). This creates two failure modes:

1. **Missed critical frames**: During a drone turn over a damaged ridge cap, or a fast pan across hail-impacted siding, fixed-interval sampling may skip the exact frames showing the damage. A 3-second turn at 10-second intervals has a 70% chance of being missed entirely.

2. **Wasted frames on static shots**: When a drone hovers over an undamaged section, fixed sampling generates duplicate near-identical frames that waste AI processing tokens without adding assessment value.

The result: inconsistent assessment quality that varies based on luck — whether the fixed interval happened to align with the most informative moments in the video.

## How NexEXTRACT Works

### Adaptive Hybrid Selection

NexEXTRACT uses a three-rule frame selection engine running inside FFmpeg's filter pipeline:

1. **Guaranteed Baseline** — Always capture at least one frame every `max_interval` seconds (default: 8s). This ensures full coverage even during steady flight.

2. **Motion-Triggered Capture** — When the visual scene changes beyond a calibrated threshold (camera turn, new surface, approach to structure), capture an additional frame. This fires during the exact moments a human inspector would snap a photo.

3. **Duplicate Prevention** — Never capture faster than `min_interval` seconds (default: 2s). Prevents burst-capture during rapid oscillation (e.g., wind-buffeted drone) that would produce near-identical frames.

### Real-Time Timestamp Tracking

Unlike fixed-interval extraction where frame timestamps are estimated, NexEXTRACT captures actual presentation timestamps from the video stream. This means findings in the AI assessment can be traced back to the exact moment in the video, enabling precise re-inspection.

### Source-Adaptive Defaults

| Source Type | Mode | Min Interval | Max Interval | Scene Threshold | Max Frames |
|-------------|------|-------------|-------------|-----------------|------------|
| Drone | Adaptive | 2s | 8s | 0.15 | 60 |
| Handheld | Fixed | — | 8s | — | 30 |
| Security Cam | Fixed | — | 30s | — | 20 |

Drone footage benefits most from adaptive extraction because flight paths involve frequent speed and direction changes. Handheld footage tends to be more deliberate and benefits less from motion detection.

## Zoom & Teach — The Learning Loop

NexEXTRACT is half the story. The other half is **Zoom & Teach**, which turns every human correction into training data:

1. AI analyzes extracted frames and produces a damage assessment
2. Inspector reviews findings, selects a frame, and provides a correction: *"This is 3-tab shingle, not synthetic slate"*
3. The correction is stored as a **Teaching Example** tied to the company
4. On future assessments, confirmed corrections are injected as few-shot context, making the AI progressively more accurate for that company's typical projects

Over time, each company's NexEXTRACT pipeline becomes uniquely tuned to their market — Florida stucco and tile roofs vs. Midwest 3-tab shingle homes vs. Pacific Northwest cedar shake.

## Competitive Differentiation

### What competitors do
- **Hover/EagleView**: Aerial imagery (still photos), no video processing
- **IMGING**: Fixed-interval frame sampling, no motion awareness
- **Xactimate AI**: Document analysis, not video-based
- **Generic GPT-4o/Vision tools**: Require manual frame selection, no extraction pipeline

### What NexEXTRACT does differently
- **Motion-aware extraction** — no competitor adapts frame rate to camera movement
- **On-device processing** — FFmpeg runs locally on the inspector's machine, no cloud upload of full video
- **Integrated teaching loop** — corrections improve future accuracy per-company
- **Multi-provider AI backend** — swappable between Grok, GPT-4o, Gemini without changing the extraction pipeline
- **Accurate timestamps** — every finding maps to an exact video timecode

## Technical Architecture

```
Video File (MP4/MOV)
  │
  ▼
┌─────────────────────────────────────────┐
│  NexEXTRACT Engine (Rust/FFmpeg)        │
│                                         │
│  select='                               │
│    isnan(prev_selected_t)               │  ← first frame
│    + gte(t-prev_selected_t, MIN)        │  ← cooldown
│      * (                                │
│        gte(t-prev_selected_t, MAX)      │  ← guaranteed baseline
│        + gt(scene, THRESHOLD)           │  ← motion trigger
│      )                                  │
│  '                                      │
│                                         │
│  showinfo → actual PTS timestamps       │
│  scale 1024×1024 → JPEG @ quality 2     │
└─────────────────────┬───────────────────┘
                      │
                      ▼
              Base64-encoded frames
              + accurate timestamps
                      │
                      ▼
┌─────────────────────────────────────────┐
│  Upload to MinIO (presigned PUT)        │
│  4 concurrent workers                   │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  Vision AI Analysis (Grok 4.1 Fast)    │
│                                         │
│  200+ line domain-specific prompts      │
│  + company teaching examples            │
│  → Structured JSON assessment           │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  Inspector Review + Zoom & Teach        │
│  Corrections → AssessmentTeachingExample│
│  → Injected into future assessments     │
└─────────────────────────────────────────┘
```

## Demo Script

For sales demos or client presentations:

1. Load a 3-minute drone video in NexBridge
2. Show "Source Type: Drone" → note "adaptive" extraction mode
3. Run extraction — point out frame count (typically 20-40 frames vs. the ~18 a fixed 10s interval would produce)
4. Show the frame gallery — note how frames cluster during turns and spread out during hover
5. Show the AI assessment with material identification and severity ratings
6. Demonstrate Zoom & Teach: select a frame, type a correction, show the AI re-analyzing with the hint
7. Confirm the teaching — explain how this improves future assessments

**Key talking point**: *"Every assessment your team runs makes the next one more accurate. NexEXTRACT learns your market."*

## Metrics to Track

- **Frame yield ratio**: Adaptive frames extracted vs. fixed-interval equivalent (target: 1.5-2.5x more frames during motion)
- **Assessment accuracy delta**: Findings accuracy with adaptive vs. fixed extraction (A/B test ongoing)
- **Teaching velocity**: Corrections per company per month (leading indicator of accuracy improvement)
- **Token efficiency**: Findings per 1,000 AI tokens consumed (adaptive should produce more findings per token by sending better frames)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial release — adaptive extraction engine, Grok 4.1 integration, Zoom & Teach loop |
| 2.0 | 2026-03-05 | Reclassified ACC → INTL. Core differentiator is the per-company learning intelligence, not just extraction accuracy. Bumped defensibility (8) and value (9) scores to reflect learning flywheel moat. |
