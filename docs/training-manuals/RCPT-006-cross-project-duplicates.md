---
title: "Cross-Project Duplicate Scanner"
code: RCPT-006
chapter: 3
module: expense-capture
revision: "1.0"
difficulty: 🔴 Advanced
roles: [ACCOUNTING, PM]
tags: [training, expense, duplicates, cross-project, scanner]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [accounting, pm, admin]
cam_references:
  - id: FIN-ACC-0003
    title: "Cross-Project Duplicate Expense Scanner"
    score: 31
---

# RCPT-006 — Cross-Project Duplicate Scanner

🔴 Advanced · 💰 ACCOUNTING · 📋 PM

> **Chapter 3: Expense Capture & Receipt Management** · [← NexVERIFY](./RCPT-005-nexverify.md) · [Next: OCR Pipeline →](./RCPT-007-ocr-pipeline.md)

---

## Purpose

While NexVERIFY handles within-project duplicates (same purchase from two sources on one project), the Cross-Project Duplicate Scanner finds the same expense posted to *different* projects. This is the company-wide version of NexDupE.

## Who Uses This

- **Accounting** — run periodic company-wide scans
- **PMs** — scan specific projects they manage

## Step-by-Step Procedure

See **[EST-007 — NexDupE](./EST-007-nexdupe.md)** for the full procedure — the workflow is identical:

1. Financial → 🔍 Duplicate Expenses → scan runs → results with EXACT/FUZZY badges → side-by-side comparison → disposition → SibE archival.

## Powered By — CAM Reference

> **FIN-ACC-0003 — Cross-Project Duplicate Expense Scanner** (31/40 ⭐ Strong)
> *Why this matters:* Cross-project duplicates are more common than within-project duplicates because they span different accounting silos. A receipt scanned for Job A and a CC charge assigned to Job B for the same $485 purchase — nobody catches this with manual review because the PM for Job A never sees Job B's expenses. The dual-strategy scanner (exact transaction ID match + fuzzy vendor/amount/date) catches what humans can't. Status: validated (production-tested). NexOP contribution: ~0.45% of revenue.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
