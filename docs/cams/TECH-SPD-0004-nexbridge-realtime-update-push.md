---
cam_id: TECH-SPD-0004
title: "NexBRIDGE Real-Time Update Push via Compute Mesh"
mode: TECH
category: SPD
revision: "1.0"
tags: [cam, tech, spd, nexbridge, compute-mesh, auto-update, fleet-management]
status: draft
created: 2026-03-09
updated: 2026-03-09
author: Warp
scores:
  uniqueness: 7
  value: 7
  demonstrable: 8
  defensible: 6
  total: 70
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# NexBRIDGE Real-Time Update Push via Compute Mesh

## Work ↔ Signal
> **The Work**: API broadcasts update:available through the Distributed Compute Mesh to all connected desktops instantly. Offline devices catch up via standard polling.
> **The Signal**: Fleet-wide update freshness signals platform health and operator engagement — the mesh knows which installations are current and active. (→ Capability: fleet currency)

## Elevator Pitch
When a new NexBRIDGE Connect build is published, the API server instantly broadcasts an `update:available` event through the existing Distributed Compute Mesh to every connected desktop app. All online devices begin downloading the update within seconds — no waiting for the next 30-minute poll cycle. Offline devices still catch up via standard polling.

## The Problem
Desktop app fleets in field-service companies suffer from version fragmentation. When a critical bug fix or feature ships, some devices don't pick it up for hours. Traditional polling intervals trade battery/bandwidth for freshness. Enterprise MDM solutions are expensive and overkill for a 5–50 device fleet.

## How It Works

### Server Side
1. Admin calls `POST /updates/publish` with the update manifest (version, download URL, signature).
2. `UpdatesController` stores the manifest in MinIO.
3. Immediately calls `ComputeMeshGateway.broadcastUpdateAvailable(version, notes)`.
4. The gateway emits `update:available` to ALL connected Socket.IO clients via the `/mesh` namespace.

### Client Side
1. `mesh-client.ts` listens for `update:available` on the Socket.IO connection.
2. On receipt, dynamically imports `auto-updater.ts` and calls `triggerCheck()`.
3. The Tauri updater plugin checks the manifest endpoint, verifies the signature, downloads the bundle silently.
4. A "Restart Now" banner appears. Update installs on next launch.

### Fallback
- 30-minute polling interval continues as a safety net for devices not connected to the mesh at publish time.
- Initial check on app launch (5-second delay) catches updates missed while offline.

## Fleet Inventory
- **Device registration** (`/auth/register-device`): tracks every install with device name, platform, app version, last-seen timestamp.
- **Mesh status** (`mesh:status` Socket.IO event): real-time view of all connected nodes, their versions, platform, CPU load, and active jobs.
- Combined, these give a complete picture of the fleet — who's online, what version they're running, and whether the update has propagated.

## Competitive Differentiation
- **Xactimate**: Uses IT-managed installers; no real-time push, no mesh.
- **CompanyCam**: Mobile-only; relies on App Store update cycles (hours to days).
- **Custom Electron apps**: Typically poll-only (15–60 min intervals).
- **NexBRIDGE**: Zero-delay push through an existing compute mesh that also handles distributed processing — the update channel is free.

## Demo Script
1. Show the mesh status — 3 NexBRIDGE nodes connected, all on v1.3.0.
2. Publish v1.4.0 via `POST /updates/publish`.
3. Watch the API log: "Broadcast update:available v1.4.0 to 3 connected node(s)".
4. On each device, the update banner appears within 5 seconds.
5. Click "Restart Now" on one device — it relaunches on v1.4.0.

## Technical Architecture
- `apps/api/src/modules/compute-mesh/compute-mesh.gateway.ts` — `broadcastUpdateAvailable()`
- `apps/api/src/modules/updates/updates.controller.ts` — triggers broadcast after publish
- `apps/nexbridge-connect/src/lib/mesh-client.ts` — listens for `update:available`
- `apps/nexbridge-connect/src/lib/auto-updater.ts` — `triggerCheck()` for on-demand checks

## NexOP Impact
- **Category**: Technology Speed — Fleet Consistency
- **Estimated NexOP contribution**: ~0.06%
- **Basis**: Version fragmentation causes support incidents when field devices run different app versions. Real-time push reduces the "stale version" window from hours to seconds. For a 20-device fleet, each stale-version support incident costs ~30 min of IT time. Preventing 2–3 incidents/month = ~$3K–$6K/year in IT overhead eliminated. Critical bug fixes also reach the field instantly instead of waiting for the next poll cycle.

## Future Extensions
- **Staged rollouts**: Push to 10% of fleet first, monitor crash telemetry, then auto-promote to 100%.
- **Version pinning**: Allow specific devices to stay on an older version (e.g., demo machines).
- **Mandatory updates**: Block app usage below a minimum version for security patches.
- **Update analytics**: Dashboard showing rollout progress, devices updated, devices pending, time-to-full-propagation.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-09 | Initial release — real-time push via mesh, fleet inventory |
