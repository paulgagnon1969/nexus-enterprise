---
title: "Session Export — NexBRIDGE Remote Support & Remote Control"
date: 2026-03-10
topic: nexbridge-remote-support
tags: [session, nexbridge, remote-support, remote-control, webrtc, tauri]
author: Warp
---

# Session Export — NexBRIDGE Remote Support & Remote Control

**Date:** 2026-03-10
**Topic:** Build and deploy end-to-end remote tech support with screen sharing and remote control for the NexBRIDGE desktop app

---

## What Was Built

A complete remote support system — from ticket creation to native OS input injection — spanning 4 packages and deployed to production in a single session.

### Scope
| Layer | What Changed |
|---|---|
| `packages/support-client` | Added control event types, signaling helpers, WebRTC `remote-input` data channel |
| `apps/api` | Added 3 Socket.IO relay handlers (`control:request/grant/revoke`) to the support gateway |
| `apps/nexbridge-connect` | New `input.rs` Tauri module (enigo 0.2), full Support.tsx rewrite with consent UI |
| `apps/web` | New `/admin/support` agent dashboard; `/support/viewer` remote control toolbar |

---

## Key Decisions

**1. Normalized coordinates (0–1) over absolute pixels**
Remote input events carry x/y as a fraction of screen dimensions, not pixels. The NexBRIDGE client multiplies by `window.screen.width/height` before injecting. This makes the system resolution-independent — works whether the user runs 1080p or a 5K display.

**2. Named RTCDataChannel (`remote-input`)**
Mouse and keyboard events flow through a dedicated WebRTC data channel rather than the Socket.IO signaling path. This keeps low-latency input off the relay server and makes the path truly peer-to-peer for input events.

**3. Consent-gated control with OS-level visual indicator**
Remote control is never silent. The user sees a pulsing red border rendered by the NexBRIDGE UI itself (Tauri overlay), not just a browser notification — it's always visible regardless of which app has focus.

**4. Same Docker image for API and Worker**
No new container was introduced. The input relay runs inside the existing `nexus-shadow-api` container via the existing Socket.IO gateway. No infra changes required.

---

## Problems Solved During Session

**TypeScript error on viewer deploy:**
The `sendKeyEvent` function was initially written as a single handler accepting a `type` + `KeyboardEvent`, but React's `onKeyDown`/`onKeyUp` props expect two separate `KeyboardEventHandler` callbacks. Fixed by splitting into `handleKeyDown` / `handleKeyUp`.

**TURN_SECRET not set:**
`.env.shadow` doesn't have `TURN_SECRET`. The API logs a non-fatal warning and falls back to `nexus-turn-dev-secret`. Not blocking for staging — added to the future work list.

---

## Files Created / Modified

### New Files
- `apps/nexbridge-connect/src-tauri/src/input.rs` — Rust input injection module
- `apps/web/app/admin/support/page.tsx` — Agent support dashboard

### Modified Files
- `packages/support-client/src/signaling.ts`
- `packages/support-client/src/rtc-connection.ts`
- `packages/support-client/src/index.ts`
- `apps/api/src/modules/support-session/support-session.gateway.ts`
- `apps/nexbridge-connect/src-tauri/Cargo.toml`
- `apps/nexbridge-connect/src-tauri/src/lib.rs`
- `apps/nexbridge-connect/src/pages/Support.tsx`
- `apps/web/app/support/viewer/page.tsx`

---

## Commits
- `dd3a854` — main implementation (signaling, data channel, input.rs, admin panel, viewer, NexBRIDGE consent UI)
- `783af43` — TypeScript fix (split key handlers for React type compatibility)

---

## Production Deployment
Both commits deployed to production via `npm run deploy:shadow` + `npm run deploy:shadow:web`.

- API: `https://staging-api.nfsgrp.com/health` ✅
- Web: `https://staging-ncc.nfsgrp.com` ✅

---

## Documents Created This Session
- **SOP:** `docs/sops-staging/nexbridge-remote-support-sop.md`
- **CAM:** `docs/cams/TECH-COLLAB-0001-nexbridge-remote-support-control.md` (score: 32/40)

---

## Outstanding / Future Work
- Set `TURN_SECRET` in `.env.shadow` (currently using dev fallback)
- Session recording — stream to MinIO for audit trail
- Annotation overlay — agent draws on screen
- Migrate iOS NexBRIDGE to native `getDisplayMedia` (React Native) when available
- Add `TURN_SECRET` setup to `cicd-production-deployment-sop.md`
