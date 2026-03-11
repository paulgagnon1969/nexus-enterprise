---
title: "Module Subscriptions & Billing"
code: ADMIN-006
chapter: 1
module: security-roles-setup
revision: "1.0"
difficulty: 🟡 Intermediate
roles: [OWNER]
tags: [training, admin, subscriptions, billing, modules, stripe, nexfit]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [owner]
cam_references:
  - id: FIN-INTG-0001
    title: "Living Membership: Modular Commerce"
    score: 30
  - id: CLT-INTL-0001
    title: "NexFIT: Module Discovery & ROI Engine"
    score: 36
---

# ADMIN-006 — Module Subscriptions & Billing

🟡 Intermediate · 👑 OWNER

> **Chapter 1: Security, Roles & Company Setup** · [← Client Access](./ADMIN-005-client-access.md) · [Next Chapter: Understanding PETL →](./EST-001-understanding-petl.md)

---

## Purpose

NCC uses a modular subscription model — you pay for the features you use. The Modules page lets Owners browse available premium modules, purchase them via Stripe, and manage active subscriptions.

## Who Uses This

- **Owners** — purchase and manage module subscriptions
- **Admins** — view which modules are active (read-only)

## Step-by-Step Procedure

1. Navigate to **Settings → Modules** (`/settings/modules`).
2. The page displays two sections:
   - **Purchased Modules** — modules your company already owns
   - **Available Modules** — premium modules available for purchase
3. To purchase a module:
   - Click **Purchase** on the desired module card.
   - A Stripe payment modal appears.
   - Enter payment information and confirm.
   - On success, the module activates immediately.
4. Purchased modules show the purchase date and are permanent (one-time purchase, lifetime access).

## Tips & Best Practices

- **Entitlement guards fail-open.** If there's ever a billing system outage, NCC does NOT block access to your purchased modules. Field work is never interrupted by a billing glitch. This is a deliberate architectural decision.
- **Check the NexFIT wizard** (`/nexfit`) to get personalized module recommendations based on your company size, trade, and pain points — it shows projected ROI for each module.

## Powered By — CAM Reference

> **FIN-INTG-0001 — Living Membership: Modular Commerce** (30/40 ⭐ Strong)
> *Why this matters:* Most construction SaaS forces flat-tier pricing — you either get everything or nothing. NCC's per-module subscriptions with Stripe mean a 5-person roofing crew pays only for what they use, while a 200-person GC unlocks the full platform. Redis-cached entitlement checks keep the UI fast, and the fail-open safety net means a Stripe outage never stops a crew in the field.
>
> **CLT-INTL-0001 — NexFIT: Module Discovery & ROI Engine** (36/40 🏆 Elite)
> *Why this matters:* NexFIT's 8-question wizard analyzes your company profile and recommends the modules with the highest projected ROI. It uses NexOP data from all 47 CAMs to calculate personalized dollar savings. No competitor offers an interactive ROI engine tied to actual operational metrics.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
