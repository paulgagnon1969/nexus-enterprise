---
title: "Price List Management & Cost Books"
code: EST-003
chapter: 2
module: estimating-xactimate
revision: "1.0"
difficulty: 🟡 Intermediate
roles: [PM, ADMIN]
tags: [training, estimating, price-list, cost-book, golden-price-list, redis]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [pm, admin]
cam_references:
  - id: EST-SPD-0001
    title: "Redis Price List Caching"
    score: 29
  - id: FIN-INTL-0003
    title: "NexPRICE: Regional Pricing Intelligence"
    score: 35
---

# EST-003 — Price List Management & Cost Books

🟡 Intermediate · 📋 PM · 🔧 ADMIN

> **Chapter 2: Estimating & Xactimate Import** · [← Xactimate Import](./EST-002-xactimate-import.md) · [Next: BOM Pricing →](./EST-004-bom-pricing.md)

---

## Purpose

Price lists (cost books) are the foundation of every estimate in NCC. They define what things cost — materials, labor, equipment — organized by category and selection code. NCC supports multiple price lists per company, with one designated as the "Golden" (active master) list.

## Who Uses This

- **PMs** — select which cost book to use for each project
- **Admins** — upload and manage price lists

## Key Concepts

- **Golden Price List** — the currently active master cost book. Used as the default for new estimates.
- **Price List Items** — individual rows in the cost book (Category, Selection, Description, Unit, Unit Price, Labor%, Material%).
- **Price List Components** — optional detailed breakdown of each item (individual material and labor components).
- **Cost Book Picker** — the dropdown on the project PETL tab that lets PMs switch between available price lists.

## Step-by-Step: Uploading a New Price List

1. Navigate to **Projects → Import** (`/projects/import`).
2. Upload a **RAW CSV** — this creates or updates the Golden Price List.
3. Optionally upload a **Components CSV** for detailed breakdowns.
4. The new price list becomes the Golden list automatically.
5. Redis cache is invalidated — the next lookup loads fresh data.

## Step-by-Step: Using the Cost Book Picker

1. Open a project → **PETL** tab.
2. Click the **Cost Book Picker** dropdown at the top of the PETL section.
3. Select the price list you want to use for this project.
4. Line item prices update to reflect the selected cost book.
5. You can switch between cost books at any time — the PETL items adjust accordingly.

## Powered By — CAM Reference

> **EST-SPD-0001 — Redis Price List Caching** (29/40 ✅ Qualified)
> *Why this matters:* 54,000 prices in 50ms. The entire Golden Price List is cached in Redis with a 1-hour TTL. Every PETL import auto-invalidates the cache so data is always fresh. If Redis goes down, a synchronous DB fallback kicks in. Competitors like Xactimate use desktop file sync; Buildertrend and CoConstruct use direct DB queries with no caching. NCC is 16× faster.
>
> **FIN-INTL-0003 — NexPRICE: Regional Pricing Intelligence** (35/40 🏆 Elite)
> *Why this matters:* Every tenant's purchases passively feed an anonymized Master Cost Book. Over time, NCC builds a crowdsourced regional pricing database — real purchase prices, not estimates — normalized by ZIP-level cost-of-living index. Your cost book gets smarter as more companies use the platform.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
