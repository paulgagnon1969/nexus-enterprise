# NCC Estimate & SOW Design – Working Specification

## 1. Scope

NCC ("NEXUS Contractor Connect") needs to:

- Import detailed Xactimate estimates from Excel (`XACT_RAW` tab).
- Preserve a **full RAW archive** of each upload.
- Normalize the data into a relational model for:
  - Project hierarchy (Project → Building → Room),
  - SOW & line items,
  - Carrier vs client payer responsibility,
  - Carrier & client reconciliation flows,
  - Percent complete tracking (per line, per selection, and per project),
  - Audit history and QC across multiple estimate versions.

We focus only on the **`XACT_RAW`** worksheet in the carrier file for v1.

---

## 2. Excel `XACT_RAW` format

### 2.1 Columns

Headers for the `XACT_RAW` tab:

1. `#` (line number)
2. `Group Code`
3. `Group Description`
4. `Desc`
5. `Age`
6. `Condition`
7. `Qty`
8. `Item Amount`
9. `Reported Cost`
10. `Unit Cost`
11. `Unit`
12. `Coverage`
13. `Activity`
14. `Worker's Wage`
15. `Labor burden`
16. `Labor Overhead`
17. `Material`
18. `Equipment`
19. `Market Conditions`
20. `Labor Minimum`
21. `Sales Tax`
22. `RCV`
23. `Life`
24. `Depreciation Type`
25. `Depreciation Amount`
26. `Recoverable`
27. `ACV`
28. `Tax`
29. `Replace`
30. `Cat`
31. `Sel`
32. `Owner`
33. `Original Vendor`
34. `Source Name`
35. `Date`
36. `Note 1`
37. `ADJ_SOURCE`

We import **all** of these into a RAW archive table unchanged.

### 2.2 Hierarchy conventions

- **Project name** (in NCC) = geographic street address / overall job.
- **Building / structure (sub‑project)**: typically represented by `Group Code` (column B).
- **Room / area (sub‑sub‑project / P&L bucket)**: represented by `Group Description` (column C).
  - Column C is the **true bucket** for SOW and line‑item costs.

Line items live under the room/area (C), and may or may not have a useful Group Code (B).

---

## 3. Data model layers

We split the design into three layers:

1. **RAW layer** – immutable archive of every upload.
2. **MODEL layer** – relational, normalized tables NCC queries and updates.
3. **AUDIT/QC layer** – history of changes (grouping, reconciliation, progress) and cross‑version QC.

### 3.1 RAW layer

#### 3.1.1 `estimate_versions`

Represents each file / version of an estimate for a project:

- `id`
- `project_id`
- `source_type` – e.g. `xact_raw_carrier`
- `file_name`
- `stored_path`
- `estimate_kind` – `initial`, `carrier_supplement`, `client_change_order`, `other`
- `sequence_no` – version order per project (0 = initial, 1 = first supplement, etc.)
- `default_payer_type` – `carrier` or `client`
- `description` – human label
- `imported_by_user_id`
- `imported_at`
- `status` – `pending`, `completed`, `failed`
- Timestamps

#### 3.1.2 `raw_xact_rows`

Raw copy of each `XACT_RAW` row:

- `id`
- `estimate_version_id`
- `line_no` – `#`
- All 36 data columns from `XACT_RAW` (`group_code`, `group_description`, `desc`, `age`, `condition`, `qty`, `item_amount`, `reported_cost`, `unit_cost`, `unit`, `coverage`, `activity`, `workers_wage`, `labor_burden`, `labor_overhead`, `material`, `equipment`, `market_conditions`, `labor_minimum`, `sales_tax`, `rcv`, `life`, `depreciation_type`, `depreciation_amount`, `recoverable`, `acv`, `tax`, `replace`, `cat`, `sel`, `owner`, `original_vendor`, `source_name`, `date`, `note_1`, `adj_source`).
- `raw_row` – optional JSON snapshot
- Timestamps

RAW rows are **append‑only**, never modified.

---

### 3.2 MODEL layer – project hierarchy and SOW

#### 3.2.1 Project hierarchy

We separate **building‑level groups** and **room‑level groups**.

##### `building_groups`

- `id`
- `project_id`
- `raw_code` – from `Group Code`
- `raw_description` – optional
- `display_name` – editable alias (e.g. "Unit 1", "Building A")
- Timestamps

##### `room_groups` (primary P&L units)

- `id`
- `project_id`
- `building_group_id` (nullable)
- `raw_name` – from `Group Description`
- `display_name` – editable alias (e.g. "Unit 1 – Hallway")
- Timestamps

**Rules:**

- Every SOW line **must** belong to a `room_group`.
- It may optionally be linked to a `building_group` (if Group Code is present).
- If estimators are sloppy (blank Group Code), the room_group still exists and can be re‑assigned to a building later.

#### 3.2.2 SOW headers & logical identity

##### `sows`

One SOW per estimate version per project:

- `id`
- `project_id`
- `estimate_version_id`
- `source_type`
- `total_amount` (cached sum)
- Timestamps

##### `sow_logical_items`

Logical identity of a line item across versions, even when the carrier renumbers it:

- `id`
- `project_id`
- `room_group_id`
- `signature_hash` – hash of the “stable” columns: `Group Description` (C), `Desc` (D), `Qty` (G), `Item Amount` (H), `Unit Cost` (J), `Unit` (K), `Activity` (M), `Sales Tax` (U), `RCV` (V), `ACV` (AA), `Cat` (AD), `Sel` (AE)
- Timestamps

On new estimate imports, we compute this hash and either:

- Reuse an existing `sow_logical_items.id` (same logical line), or
- Create a new one.

#### 3.2.3 `sow_items` – normalized estimate lines

Each item is a normalized copy of a RAW row, tied to a logical item and version:

- `id`
- `sow_id`
- `estimate_version_id`
- `raw_row_id`
- `logical_item_id`
- `line_no` – the `#` for this version
- `building_group_id` (nullable)
- `room_group_id` (required)

Key fields (normalized from raw; names can be tuned):

- `description` (`desc`)
- `qty`
- `unit`
- `unit_cost`
- `item_amount`
- `rcv_amount`
- `acv_amount`
- `depreciation_amount`
- `sales_tax_amount`
- `category_code` (`cat`)
- `selection_code` (`sel`)
- `activity`
- `material_amount`
- `equipment_amount`
- etc., as needed.

**Payer & performance:**

- `payer_type` – `carrier` or `client`  
  - Initialized from `estimate_version.default_payer_type`.
- `performed` – bool (did we do this work?)
- `eligible_for_acv_refund` – bool
- `acv_refund_amount` – numeric (e.g. `acv_amount * 0.8` for unperformed, eligible lines).

**Progress:**

- `percent_complete` – decimal (0–1; displayed as 0–100%).

Timestamps on each row.

---

### 3.3 QC: line number history

Because carriers may renumber lines across versions, even if logically the same:

#### `line_number_history`

- `id`
- `logical_item_id`
- `old_estimate_version_id`
- `old_line_no`
- `new_estimate_version_id`
- `new_line_no`
- `detected_at`
- Timestamps

When importing a new estimate version, if we find a matching `logical_item_id` with a different `line_no`, we log a history entry instead of overwriting.

This gives a full record of renumbering between versions.

---

## 4. Carrier reconciliation

We track how the carrier responds to each proposed line.

### 4.1 `carrier_line_decisions`

Per item, per version:

- `id`
- `estimate_version_id`
- `sow_item_id`
- `decision_status` – `proposed`, `approved`, `modified`, `denied`
- `carrier_qty` – numeric (nullable)
- `carrier_unit_cost` – numeric (nullable)
- `carrier_total_amount` – numeric (nullable)
- `notes` – text
- `decided_at` – datetime
- `decided_by` – string or FK
- Timestamps

### 4.2 `carrier_reconciliation_events`

Event stream for audit:

- `id`
- `estimate_version_id`
- `sow_item_id`
- `user_id` (internal staff)
- `event_type` – e.g. `line_added_for_carrier`, `line_approved`, `line_modified`, `line_denied`
- `payload` – JSON with before/after snapshots (qty, cost, totals, etc.)
- `created_at`

This provides a complete audit trail for carrier negotiations per line.

---

## 5. Client reconciliation & ACV / O&P

After job completion, we reconcile between:

- **Carrier‑approved amounts**.
- **Client change orders** (client‑paid items).
- **ACV refunds** for unperformed work.

Key points:

- `sow_items.acv_amount` contains the per‑line ACV from Xactimate.
- The carrier distributes Overhead & Profit (O&P) across each line.
- When refunding ACV to the client for unperformed work, O&P is removed:

  ```text
  refundable_ACV = ACV * 0.8   // if O&P is 20%
  ```

We model:

- `sow_items.payer_type` – who pays for this line (carrier vs client).
- `sow_items.performed` – whether the SOW line was actually performed.
- `sow_items.eligible_for_acv_refund` – whether ACV refund applies.
- `sow_items.acv_refund_amount` – stored or derived from `acv_amount * 0.8`.

### 5.1 Optional snapshot: `client_reconciliations`

- `id`
- `project_id`
- `reconciled_at`
- `reconciled_by_user_id`
- `summary_carrier_approved`
- `summary_client_change_orders`
- `summary_acv_refund`
- `notes`
- Timestamps

We can compute most numbers directly from `sow_items` and carrier decisions; this table is for freezing a reconciliation at a point in time.

---

## 6. Group & structure history

We maintain how hierarchy evolves over time and who changed it.

### `group_events`

- `id`
- `project_id`
- `user_id`
- `event_type` – e.g. `building_group_created`, `room_group_created`, `room_group_renamed`, `room_group_reassigned_building`, `room_groups_merged`
- `entity_type` – `building_group` or `room_group`
- `entity_id`
- `payload` – JSON (before/after)
- `created_at`

This gives a timeline of project hierarchy changes after import.

---

## 7. Progress / Percent complete

### 7.1 Storage

On each `sow_item`:

- `percent_complete` – decimal (0–1), representing the completion for that line.

### 7.2 Percent complete calculations

We use **basis‑weighted** percentages rather than simple averages.

Let `basis_amount` be a chosen monetary basis per item (e.g. carrier‑approved or `rcv_amount`).

For any set of items \(S\):

```text
percent(S) = (Σ(basis_i * percent_complete_i)) / (Σ(basis_i))
```

This formula is used to compute:

- **Project Percent Complete** – all items for the project.
- **Current Selection Percentage** – items matching current filters.
- **Sub‑project (room/building) Percent Complete** – items in that group only.

### 7.3 Update mechanisms

Two ways to update progress:

#### (a) Line‑item level

```http
PATCH /api/projects/{project}/sow-items/{sow_item}/percent-complete
{
  "percent": 75
}
```

- Updates a single `sow_item.percent_complete`.
- Logs an audit event (e.g. `sow_item_percent_updated`).

#### (b) Bulk update by filter (filtered selection)

```http
POST /api/projects/{project}/progress/bulk-update
{
  "filters": {
    "room_group_ids": [...],
    "task_codes": [...],
    "categories": [...],
    "sels": [...]
  },
  "operation": "set",       // or "increment", "decrement"
  "percent": 50
}
```

- Applies the operation to all `sow_items` matching the filters.
- Logs a bulk event (`bulk_percent_update`) with a filter snapshot and affected count.

### 7.4 Progress summary endpoint

```http
GET /api/projects/{project}/progress?{filters}
```

Returns, at minimum:

- `project_percent_complete` – overall.
- `selection_percent_complete` – with filters applied.
- Per‑group metrics (room_groups/building_groups), e.g.:
  - `room_group_id`, `name`, `percent_complete`, `tasks_count`, `basis_total`, `basis_completed`.
- Optional item list with `percent_complete` and basis amounts.

This powers the “NCC Project Percent Complete” UI (two percentage KPIs, filters across the top, grouped table, bulk update button).

---

## 8. Payer dimension and tags

- `estimate_versions.default_payer_type` – predominant payer for that estimate:
  - `carrier` for initial/supplements.
  - `client` for client change orders.

- `sow_items.payer_type` – actual payer per line (defaults from estimate_version, can be overridden).

We can also reuse the existing `tags` / `taggables` polymorphic system to label:

- `estimate_versions` and/or `sow_items` with tags like `carrier:approved`, `carrier:pending`, `client:upgrade`, `code-upgrade`, etc.

---

## 9. QC across estimate versions

To handle the case where carriers issue new estimates that reuse ~90% of prior lines but renumber them:

- We define **logical identity** via `sow_logical_items` above, keyed by:
  - Project + room_group + hash of \{C, D, G, H, J, K, M, U, V, AA, AD, AE\}.

- On each new import for the same project:
  - For each row from `XACT_RAW`:
    - Compute `signature_hash`.
    - Lookup `sow_logical_items` by `project_id`, `room_group_id`, `signature_hash`.
    - If found: treat as the same logical line, create a new `sow_item` with that `logical_item_id`.
    - If previous `line_no` differs from the new `line_no`, log an entry in `line_number_history`.

This QC logic lets NCC classify lines into:

- **Renumbered but unchanged** (same hash, new `#`).
- **Changed lines** (same room but different key fields → subject to reconciliation).
- **New lines** (no match in previous versions).
- **Removed lines** (present before, no match in new version).

All while maintaining a full RAW archive of each estimate version.
