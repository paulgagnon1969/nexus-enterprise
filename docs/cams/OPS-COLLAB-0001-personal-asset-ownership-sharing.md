---
cam_id: OPS-COLLAB-0001
module_code: CORE
title: "Nexus Phantom-Fleet — Making Visible What's Already There"
mode: OPS
category: COLLAB
revision: "1.1"
status: draft
created: 2026-02-28
updated: 2026-03-01
author: Warp
website: false
scores:
  uniqueness: 8
  value: 8
  demonstrable: 9
  defensible: 6
  total: 31
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
tags: [cam, ops, collaboration, asset-management, personal-assets, maintenance-pools, sharing, phantom-fleet]
---

# OPS-COLLAB-0001: Nexus Phantom-Fleet

> *Making visible what's already there.*

## Elevator Pitch
Every GC sits on top of a phantom fleet — vehicles, scaffold sets, generators, and specialty tools owned by their contractors and subs that the company can't see, can't schedule, and can't leverage. Nexus Phantom-Fleet surfaces this hidden inventory with privacy-first controls that let owners decide what the company sees, while maintenance pools decouple "who maintains it" from "who owns it" — turning invisible personal equipment into a discoverable, rentable, trackable resource pool.

## Problem
In restoration and construction, workers routinely bring personal equipment to job sites — scaffold sets, vehicles, specialty tools. Today this creates several pain points:
- **No visibility** — the company doesn't know what personal assets are available until someone asks verbally
- **No economic tracking** — when a worker's personal scaffold set is used on a job, there's no record for rental reimbursement or depreciation
- **Ownership ≠ maintenance** — the person who owns an asset isn't always the person who maintains it; responsibilities get lost
- **Privacy concerns** — employees don't want their full personal inventory visible to everyone by default
- **Fragmented records** — personal assets tracked in spreadsheets, company assets in the system, no unified view

## How It Works
1. **Dual ownership model** — Every asset is either COMPANY or PERSONAL. Company assets are visible to all; personal assets default to Private.
2. **Owner-controlled sharing** — Personal asset owners choose visibility: Private (only me), Company (everyone), or Custom (specific people via ShareGrant).
3. **Maintenance pools** — Named groups (e.g., "Fleet Maintenance Team") can be assigned to any asset. Maintenance notifications follow a resolution chain: Direct Assignee → Pool Members → Owner → Admins.
4. **Unified asset list** — Filterable tabs (All / Company / Personal / My Assets) with ownership badges and sharing indicators give PMs a single view of all available equipment.
5. **CSV import** — Ownership columns in the template allow bulk onboarding of both company and personal inventories.

## Competitive Differentiation
- **The phantom fleet problem is universal** — every GC has contractors with personal equipment they don't know about. No platform solves this.
- **Most construction platforms** track only company-owned assets. Personal assets are invisible to the system.
- **No competitor** offers privacy-first personal asset sharing where the owner controls visibility granularity (private → company → specific users).
- **Maintenance pools** decouple responsibility from ownership — unique in the restoration space where a field crew might maintain equipment owned by another employee or the company.
- **Notification resolution chain** (assignee → pool → owner → admins) ensures maintenance never falls through the cracks regardless of ownership structure.
- **Tagline resonance** — "Making visible what's already there" immediately communicates the value without technical jargon.

## Demo Script
1. Open the Assets page — show company-owned equipment. Ask: *"How many scaffold sets does your crew actually have access to?"*
2. Switch to "My Assets" tab — reveal a personal inventory (6 scaffold sets, a pickup truck, a generator). *"This is Jimmy's phantom fleet."*
3. Open a personal asset → show the Sharing Visibility control set to "Private." *"Jimmy controls what you see."*
4. Change sharing to "Company" → switch to the "All" tab and show the asset now visible with a sharing badge. *"Now the GC knows it exists — and can schedule it."*
5. Create a Maintenance Pool ("Fleet Maintenance Team") → add two members. *"Ownership and maintenance are separate. Jimmy owns it, but your crew maintains it."*
6. Assign the pool to a company vehicle → explain the notification chain.
7. Download the CSV template → point out the ownership columns for bulk onboarding. *"Every sub uploads their phantom fleet in one CSV."*

## Metrics / Value Indicators
- **Equipment utilization** — personal assets become discoverable, reducing unnecessary rentals
- **Rental reimbursement accuracy** — clear ownership records for personal equipment used on company jobs
- **Maintenance compliance** — pool-based assignments with resolution chain eliminate "nobody was responsible" gaps
- **Onboarding speed** — CSV import with ownership columns enables bulk personal inventory registration

## Technical Implementation
- **Schema**: `AssetOwnershipType` and `AssetSharingVisibility` enums; `MaintenancePool`, `MaintenancePoolMember`, `AssetShareGrant` models
- **API**: Visibility-aware asset listing (filters by ownership + sharing grants), maintenance pool CRUD, share/unshare endpoints
- **Frontend**: Ownership filter tabs, sharing controls, maintenance pool assignment in create/edit forms, ownership badges on list/detail views
- **Privacy model**: Personal assets excluded from company queries unless sharing grants exist; owner always retains control

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-28 | Initial draft — personal ownership, maintenance pools, sharing controls |
| 1.1 | 2026-03-01 | Branded as Nexus Phantom-Fleet; added tagline, refined elevator pitch and demo script |
