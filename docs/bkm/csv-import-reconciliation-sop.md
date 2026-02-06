# CSV Import and Line Item Reconciliation
## Best Known Method (BKM) | Policies & Procedures

**Document ID:** BKM-NCC-001  
**Category:** NEXUS 101 — Core Operations  
**Last Updated:** February 2026  
**Owner:** Operations Team  
**Review Cycle:** Quarterly

---

# Purpose

This document defines the standard operating procedure for importing insurance estimates into NEXUS and reconciling line items. It is intended for all team members who work with project estimates.

**Audience:** Project Managers, Estimators, Field Staff, Administrators

---

# Quick Start Script

> **Read this section first.** It walks you through the entire process from start to finish in plain English.

## What You'll Learn

By the end of this guide, you'll know how to:
1. Create a project to hold your estimate
2. Import a CSV file from Xactimate
3. Review and reconcile individual line items
4. Track your progress

## Before You Begin

**You will need:**
- A NEXUS account with Project Manager access or higher
- An Xactimate estimate exported as CSV (the "RAW" export)
- About 15 minutes for your first import

**Don't have an Xactimate CSV yet?** You can still follow along — just skip the import step and explore an existing project.

---

# The Process (5 Steps)

## Step 1: Create a Project

*You need somewhere to put your estimate. That's a Project.*

**What to do:**
1. Log into NEXUS
2. Click **Projects** in the left menu
3. Click the **+ New Project** button (top right)
4. Fill in the basics:
   - **Project Name** — Something descriptive (e.g., "Smith Residence - Water Damage")
   - **Address** — The property address
   - **Client** — Select or create the client
5. Click **Create Project**

**What happens:** NEXUS creates an empty project. You'll see it in your project list. Now you have a container for your estimate.

---

## Step 2: Export Your Estimate from Xactimate

*NEXUS reads CSV files exported from Xactimate. Here's how to get one.*

**What to do in Xactimate:**
1. Open your estimate in Xactimate
2. Go to **Reports** → **Export**
3. Select **CSV** format
4. Choose the **Line Items (RAW)** export type
5. Save the file to your computer

**What you'll have:** A `.csv` file with all your line items — descriptions, quantities, costs, and RCV values.

**Optional:** If you also want component-level detail, export the **Components** CSV too.

---

## Step 3: Import the CSV into NEXUS

*This is where the magic happens. Your spreadsheet becomes a structured estimate.*

**What to do:**
1. Open your project in NEXUS
2. Click the **Import** tab (or go to Projects → Import)
3. Make sure your project is selected in the dropdown
4. Under **"Xactimate RAW CSV"**, click **Choose File**
5. Select the CSV you exported from Xactimate
6. Click **Import RAW CSV**

**What happens:**
- You'll see a progress bar while the file uploads
- A "Job Console" window shows real-time status:
  ```
  [10:30:15] Job queued
  [10:30:17] Processing rows 1-500...
  [10:30:42] Processing rows 501-847...
  [10:30:58] Import completed successfully
  ```
- When finished, you're taken to the **PETL tab** (your line item list)

**How long does it take?** Small estimates (under 500 lines): 30 seconds. Large estimates (2000+ lines): 2-3 minutes.

---

## Step 4: Review Your Line Items

*Your estimate is now in NEXUS. Let's make sure it looks right.*

**What to do:**
1. You should already be on the **PETL** tab
2. Scroll through the list — each row is one line item from your estimate
3. Spot-check a few items:
   - Do the descriptions look right?
   - Are quantities and costs correct?
   - Do the RCV totals match your Xactimate report?

**Understanding the display:**

| Column | What it shows |
|--------|---------------|
| **Line** | The line number from your estimate |
| **Room** | Which room/area this item belongs to |
| **Task** | The description of the work |
| **Qty** | Quantity (e.g., 150 SF) |
| **Unit** | Unit of measure (SF, LF, EA, etc.) |
| **Total** | Line item total cost |
| **RCV** | Replacement Cost Value |
| **%** | Percent complete (starts at 0%) |

**Visual cues:**
- 🟦 **Blue rows** = This item has reconciliation activity
- 🟨 **Yellow rows** = This item is flagged for review
- ▸ **Arrow** = Click to expand and see sub-entries

---

## Step 5: Reconcile a Line Item

*This is where you track changes — credits, supplements, notes, and progress.*

### Opening the Reconciliation Panel

1. Find a line item you want to work on
2. Click the **Reconcile** button on that row
3. A panel slides open on the right side

### What You Can Do

**Add a Credit** (when actual cost is less than estimated)
1. Review the RCV breakdown shown
2. Check which components to credit (Item, Tax, O&P)
3. Type a note explaining why (e.g., "Used existing materials")
4. Click **Create Credit**

**Add a Supplement** (when you need to add work)
1. Click **Open Cost Book**
2. Search for the item you need to add
3. Enter the quantity
4. Click **Add to Reconciliation**

**Add a Note** (to document something without changing $)
1. Type your note in the Note field
2. Select a tag if applicable (Supplement, Change Order, etc.)
3. Click **Add Placeholder**

**Update % Complete**
1. Click the **%** column on any line item
2. Select the new percentage (0%, 10%, 20%... 100%)
3. It saves automatically

### When You're Done

Click **Save** to close the panel (or **Cancel** to discard changes).

---

# That's It!

You've just:
- ✅ Created a project
- ✅ Imported an Xactimate estimate
- ✅ Reviewed your line items
- ✅ Reconciled an item

**Next steps:**
- Work through your line items, updating % complete as work finishes
- Add credits or supplements as the scope changes
- Use filters to focus on specific rooms or categories

---

# Quick Reference

## Key Terms

| Term | Plain English |
|------|---------------|
| **PETL** | Your line item list (Project Estimate Task List) |
| **RCV** | Replacement Cost Value — the full cost before depreciation |
| **Reconciliation** | Tracking changes to a line item (credits, adds, notes) |
| **Credit** | Money coming off a line item |
| **Supplement** | Additional work being added |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Esc** | Close the reconciliation panel |
| **Enter** | Save inline edits |

## Common Tasks

| I want to... | Do this... |
|--------------|------------|
| Find a specific line item | Use the search/filter at the top |
| See only items I've worked on | Click "Reconciliation only" view |
| Flag something for later | Click the "Flag" button on the row |
| See the history of changes | Open Reconcile → scroll to History |
| Re-import an updated estimate | Go to Import tab → upload new CSV |

---

# Detailed Reference

*The sections below provide more detail for specific tasks.*

## Importing: Complete Details

### What Gets Imported

When you import a RAW CSV, NEXUS extracts:
- Line numbers and descriptions
- Quantities and units of measure
- Unit costs and line totals
- RCV breakdown (item amount, sales tax, O&P)
- Category and selection codes
- Room/area assignments

### Components CSV (Optional)

If you also have a Components export:
1. Upload it under **Components CSV** on the Import page
2. NEXUS automatically matches components to their parent line items
3. You'll see component details when you expand a line item

### Re-Importing (New Versions)

If the estimate changes in Xactimate:
1. Export a new CSV
2. Import it to the same project
3. NEXUS creates a **new version** — your reconciliation work is preserved
4. Check for "orphaned entries" that need to be re-attached to updated line numbers

---

## Reconciliation: Complete Details

### Credit Components Explained

When you create a credit, you choose which parts to credit:

| Component | What it is |
|-----------|------------|
| **Item** | The base cost of labor and materials |
| **Tax** | Sales tax on materials |
| **O&P** | Overhead & Profit (contractor markup) |

Example: A $1,000 line item might break down as:
- Item: $850
- Tax: $50
- O&P: $100

If you credit just the Item, you create a -$850 credit. If you credit all three, it's -$1,000.

### Tags

Tags help you categorize reconciliation entries:

| Tag | When to use |
|-----|-------------|
| **Supplement** | Insurance is paying for additional scope |
| **Change Order** | Scope changed after approval |
| **Warranty** | Covered under warranty |
| **Other** | Anything else |

### Bulk Reconciliation via CSV

For large updates, you can import reconciliation notes from a spreadsheet:

1. Create a CSV with columns: `Line #`, `Note`, `% Complete`
2. Go to the project's admin tools
3. Upload under "Import Reconciliation Notes"
4. Review the preview — it shows which lines matched
5. Confirm to apply

---

## Tracking Progress

### Summary Metrics

At the top of the PETL tab:

| Metric | What it shows |
|--------|---------------|
| **Total RCV** | Sum of all original line item RCVs |
| **Reconciliation Total** | Net of all credits and supplements |
| **Adjusted RCV** | Total RCV + Reconciliation Total |
| **% Complete** | Weighted average completion |

### Finding What Needs Attention

1. **Flagged items** — Yellow highlight; someone marked these for review
2. **0% complete** — Work hasn't started (or hasn't been recorded)
3. **Orphaned entries** — Shown at top of list if present; need re-attachment

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Import fails | Check that your CSV is UTF-8 encoded. Open in a text editor and re-save if needed. |
| Missing line items | They might be filtered out. Click "Clear filters" or "Show all". |
| Can't edit a field | You need Project Manager access or higher. Check with your admin. |
| % Complete won't save | Make sure you clicked off the field. Try refreshing the page. |
| Reconciliation entries missing | If you re-imported, check "Orphaned entries" at the top. |

---

## Team Roles

| Role | What they typically do |
|------|------------------------|
| **Project Manager** | Create projects, import estimates, initial review |
| **Estimator** | Reconcile line items, add credits/supplements |
| **Field Staff** | Update % complete as work finishes |
| **Admin** | Approve changes, review orphaned entries, QA |

---

## Related Documentation

- [CSV Imports and PETL Architecture](../architecture/csv-imports-and-petl-standard.md)
- [Dev Stack Setup](./dev-stack.md)
- [API Reference](../api-contracts/)
