# PETL Reconciliation & Invoice Flow - Best Known Method (BKM)

## Overview
This document explains how PETL (Project Estimate Task List) data flows into invoices, including reconciliation entries, percent complete updates, and ACV-only items.

## Living Invoice Concept
A **living invoice** is a draft invoice that automatically syncs with PETL data. It reflects:
- Current percent complete on all PETL line items
- Approved reconciliation entries (supplements, change orders)
- ACV-only holdbacks

### Auto-Creation
When an Xactimate CSV is imported, a draft living invoice is automatically created with:
- All PETL items at 50% complete (default deposit percentage)
- Ready to issue as a deposit invoice

---

## PETL Line Items → Invoice

### How It Works
1. Each PETL `SowItem` becomes a `ProjectInvoicePetlLine` with kind = `BASE`
2. The invoice line amounts are calculated as:
   - `earnedAmount = contractAmount × (percentComplete / 100)`
   - `thisInvoiceAmount = earnedAmount - previouslyBilledAmount`

### ACV-Only Items
When a line is marked as **ACV Only** (`isAcvOnly = true`):
1. The BASE line still appears with earned amounts
2. An additional `ACV_HOLDBACK_CREDIT` line is added
3. The credit amount = -80% of earned amounts (20% holdback rate)

**Example:**
- HVAC line: Contract $10,000, 50% complete = $5,000 earned
- If marked ACV Only: Credit line = -$4,000 (80% × $5,000)
- Net billable = $1,000 (the 20% ACV portion)

---

## Reconciliation Entries → Invoice

### Requirements for Invoice Inclusion
Reconciliation entries appear on invoices ONLY when ALL of these conditions are met:

| Requirement | Field | Value |
|-------------|-------|-------|
| 1. Status | `status` | `APPROVED` |
| 2. Has dollar amount | `rcvAmount` | Not null |
| 3. Tied to PETL line | `parentSowItemId` | Not null |
| 4. Billable tag | `tag` | `SUPPLEMENT` or `CHANGE_ORDER` |

### Entry Types

#### Supplements (`tag = SUPPLEMENT`)
- Additional scope approved by carrier
- Added to contract value
- Appears as sub-line under parent PETL item (e.g., "15.001")

#### Change Orders (`tag = CHANGE_ORDER`)
- Client-requested changes outside carrier scope
- Client pays directly
- Also appears as sub-line

#### Non-Invoice Entries
These do NOT appear on invoices:
- `NOTE_ONLY` - Documentation only
- `REJECTED` status - Not approved
- Missing `rcvAmount` - No billable amount
- Orphan entries (no `parentSowItemId`)

---

## Invoice Sync Triggers

The living invoice automatically re-syncs when:
1. Bulk percent complete is applied
2. Single line percent is updated
3. Reconciliation entry is created/updated/deleted
4. Invoice is opened (draft is fetched)

### Manual Refresh
If changes don't appear, refresh by:
1. Clicking "Refresh" on the Invoices section
2. Reopening the living invoice (draft)

---

## Pre-Issue Validation Checklist

Before issuing an invoice, verify:

### 1. PETL Completeness
- [ ] All active line items have appropriate percent complete
- [ ] ACV-only items are correctly flagged

### 2. Reconciliation Entries
- [ ] All supplements/COs that should be billed have `rcvAmount` set
- [ ] All billable entries have status = `APPROVED`
- [ ] Entries are tied to correct parent PETL lines

### 3. Missing RCV Warning (Future Feature)
- System should flag reconciliation entries with:
  - Status = `APPROVED`
  - Tag = `SUPPLEMENT` or `CHANGE_ORDER`
  - But `rcvAmount` is null or zero

---

## Common Issues

### "Reconciliation entry not appearing on invoice"
Check:
1. Is status = APPROVED? (Not PENDING or REJECTED)
2. Is rcvAmount set? (Not null or zero)
3. Is parentSowItemId set? (Tied to a PETL line)
4. Is tag SUPPLEMENT or CHANGE_ORDER? (Not NOTE_ONLY)

### "Invoice total not updating after PETL changes"
1. Refresh the financial page
2. Reopen the living invoice
3. Check API logs for sync errors

### "ACV credit not showing"
1. Verify the line has `isAcvOnly = true`
2. Check that percent complete > 0
3. Look for the ACV_HOLDBACK_CREDIT line (may be grouped)

---

## Database Schema Reference

### Key Fields

**SowItem (PETL line)**
- `percentComplete` - 0-100
- `isAcvOnly` - Boolean
- `rcvAmount` - Total RCV for line

**PetlReconciliationEntry**
- `status` - PENDING | APPROVED | REJECTED
- `tag` - SUPPLEMENT | CHANGE_ORDER | (null)
- `kind` - ADD | CREDIT | NOTE_ONLY | CHANGE_ORDER_CLIENT_PAY
- `rcvAmount` - Total RCV (null = not billable)
- `parentSowItemId` - FK to parent PETL line (null = orphan)
- `percentComplete` - For independent billing progress
- `isPercentCompleteLocked` - If true, uses 0% regardless of value

**ProjectInvoicePetlLine**
- `kind` - BASE | ACV_HOLDBACK_CREDIT
- `billingTag` - PETL_LINE_ITEM | SUPPLEMENT | CHANGE_ORDER
- `thisInvTotal` - Amount billed on this invoice
- `prevBilledTotal` - Previously billed amount
- `earnedTotal` - Total earned to date
