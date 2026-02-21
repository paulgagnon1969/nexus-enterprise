---
cam_id: "TECH-SPD-0003"
title: "Smart Media Upload — Network-Aware Compression & Video"
mode: TECH
category: SPD
score:
  uniqueness: 7
  value: 8
  demonstrable: 9
  defensible: 5
  total: 29
status: draft
created: 2026-02-21
updated: 2026-02-21
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# TECH-SPD-0003: Smart Media Upload

## Competitive Advantage
Field crews on job sites often have unreliable cellular connectivity. Nexus automatically detects the network tier and adjusts image compression, video quality, and upload concurrency in real time — no user intervention required. Videos are WiFi-gated so they never stall critical metadata syncs on cellular. This means daily logs sync faster, use less data, and field teams never lose captured media.

## What It Does
- Automatically compresses images to optimal quality based on WiFi vs. cellular
- Enables video capture across all daily log screens
- Queues uploads with bandwidth throttling (1 concurrent on cellular, 3 on WiFi)
- WiFi-gates video uploads to prevent cellular congestion
- Syncs metadata instantly on any connection; binary files queue separately
- Tracks upload progress per-file with resume capability

## Why It Matters
- Construction sites frequently have poor cellular coverage
- Competing apps either upload full-resolution (slow, data-heavy) or require manual quality selection
- Automatic optimization removes friction for field crews who just want to capture and move on
- Video support for daily logs is increasingly expected but rarely bandwidth-optimized

## Demo Script
1. Show the app on cellular — capture a photo, note the "Cellular" badge and ~150KB file size
2. Switch to WiFi — capture another photo, note the "WiFi" badge and ~400KB file size
3. Record a short video on cellular — show it queues but waits for WiFi
4. Connect to WiFi — video begins uploading with progress indicator
5. Show metadata synced instantly throughout
