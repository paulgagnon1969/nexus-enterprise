# Xactimate → Gantt Importer
## Problem
We need a robust, repeatable way to convert Xactimate exports into Nexus Gantt tasks. The importer must use the Xactimate price list (golden PETL) and components export as the system of record for productivity and labor assumptions, and must support water-mitigation dry-out windows from equipment rentals.
## Current state
We have sample CSVs under docs/data/REPO - Nexus Enterprise CSV Files for Import/ including:
* PWCFINAL_POL ALL XACT RAW.csv: project-level line items with Cat, Sel, Qty, Unit, labor/material breakdowns per room.
* PWCFINAL_POL COMPONENTS XACT RAW.csv: components-level export (equipment, materials, etc.).
* ALL Pricelist Xactimate.csv: master Xactimate price list with Cat, Sel, Unit, labor matrix (Worker's Wage, Labor burden, Labor Overhead), and Labor Minimum.
The Nexus app already uses Xactimate price lists for pricing, but there is no end-to-end importer that turns a specific project estimate + price list into a scheduled Gantt with tasks, durations, and mitigation/dry-out steps.
## Goals
* Use the Xactimate price list as the golden source for labor productivity and hourly rates.
* Use project-level ALL XACT RAW exports to compute labor hours per line item and aggregate to room/trade/phase work packages.
* Use COMPONENTS exports and/or specific WTR equipment lines to derive mitigation/dry-out windows.
* Generate deterministic, explainable schedule tasks (start/end dates, durations, dependencies) for use in Nexus Gantt and workflows.
* Make mappings and assumptions configurable (not hard-coded) so they can evolve with real data.
## Proposed changes
### 1) Data model extensions
We will add or extend database tables in the API service to represent Xactimate pricing, project imports, and schedule artifacts.
Core tables:
* xact_price_list: id, name, carrier_id, region_code, effective_date, raw_file_reference
* xact_price_item: id, price_list_id, cat, sel, desc, unit, coverage, activity, labor_minimum_code, workers_wage, labor_burden, labor_overhead, material_cost, equipment_cost, market_conditions, labor_cost_per_unit (derived), unit_cost, hours_per_unit (derived)
* xact_labor_matrix: id, price_list_id, labor_minimum_code, hourly_rate, notes
* xact_component_item: id, price_list_id, code, description, tax_status, contractor_supplied, unit, unit_price, is_equipment, is_material, default_usage_class
* xact_import: id, project_id, price_list_id, file_name, source_type, uploaded_by, uploaded_at, status, error_message
* xact_line_item: id, import_id, line_no, group_code, group_description, desc, qty, unit, item_amount, reported_cost, unit_cost, coverage, activity, workers_wage, labor_burden, labor_overhead, material, equipment, market_conditions, labor_minimum_code, sales_tax, rcv, depreciation_amount, recoverable, acv, cat, sel, date, note, adj_source, include_in_schedule, trade, phase_code, phase_label, hours_per_unit, labor_hours
* xact_equipment_usage: id, import_id, source, room, code, description, quantity, unit, inferred_units, start_hint_date, end_hint_date
* schedule_work_package: id, project_id, import_id, room, trade, phase_code, phase_label, total_labor_hours, crew_size, duration_days_raw, duration_days
* schedule_task: id, project_id, work_package_id, name, room, trade, phase_code, task_type, start_date, end_date, duration_days, predecessors, source_line_item_ids, source_equipment_usage_ids
### 2) Price list and labor matrix importer
We will create an importer that processes ALL Pricelist Xactimate.csv and stores the golden price list and labor productivity data.
Steps:
* Parse CSV header to field mapping (robust to minor header variations).
* For each row: Compute labor_cost_per_unit = workers_wage + labor_burden + labor_overhead. Persist a xact_price_item row.
* Identify hourly labor matrices: For rows with unit == 'HR', map labor_minimum_code -> hourly_rate = labor_cost_per_unit. Insert into xact_labor_matrix.
* Derive hours_per_unit for all items: For each xact_price_item row with labor_minimum_code LM, look up hourly_rate[LM]. If present, set hours_per_unit = labor_cost_per_unit / hourly_rate[LM]. If absent, flag the item for review and leave hours_per_unit null.
* Provide an admin/reporting view to see items with missing labor_minimum_code or missing matrix.
### 3) Components importer (equipment and materials)
We will build a companion importer for COMPONENTS CSVs.
Goals: Canonicalize equipment and material codes. Tag water mitigation equipment for deriving dry-out windows.
Steps:
* Parse header mapping: Code, Description, Tax Status, Contractor Supplied, Quantity, Unit, Unit Price, Total.
* Persist xact_component_item entries keyed by code.
* Classify: is_equipment = true for codes like WTRDHM>>, WTRDRY. default_usage_class = water_mitigation for WTRDHM>>, WTRDRY.
* For project-level imports, use components rows to create xact_equipment_usage entries.
### 4) Project estimate importer (ALL XACT RAW)
We will implement an endpoint and service to import an ALL XACT RAW file and tie it to a specific price list.
Interface: Endpoint POST /projects/:projectId/xactimate/import with body { priceListId, fileType: 'all_raw', fileUploadRef, options }
Service steps:
* Parse CSV into xact_line_item rows. Map columns exactly. Normalize units. Flag obvious non-scheduled rows.
* Join to xact_price_item by (price_list_id, cat, sel) to get hours_per_unit and labor_minimum_code.
* Compute labor_hours per line: Default line_labor_hours = qty * hours_per_unit. Optional adjustment mode: re-derive hours_unit_est.
* Classify each line into trade and phase using a configurable mapping table keyed by (cat, sel, activity). Persist trade, phase_code, phase_label on xact_line_item.
### 5) Mitigation/dry-out window derivation
We will derive explicit water mitigation windows as separate schedule tasks.
Inputs: xact_equipment_usage rows from components import. WTR equipment lines from ALL XACT RAW.
Approach:
* Normalize equipment usage to equipment-days.
* Aggregate mitigation usage by room (or project-wide).
* Create mitigation schedule tasks with task_type = 'mitigation', trade = 'Mitigation', phase_code = 5 or 15, duration_days = mitigation_duration_days.
* Enforce dependency: demo/rebuild work packages in that room cannot start before mitigation task end_date.
### 6) Work package aggregation
We will convert line-level labor hours into room/trade/phase work packages.
Steps:
* Filter xact_line_item to include_in_schedule = true.
* Group by: room, trade, phase_code.
* For each group, compute: total_labor_hours, crew_size, duration_days_raw, duration_days.
* Persist as schedule_work_package records linked to the import and project.
### 7) Scheduling engine (calendar + capacities + dependencies)
We will add a scheduling service that takes work packages, mitigation tasks, and a calendar/capacity configuration and produces Gantt-ready schedule_task rows.
Inputs: schedule_work_package set, mitigation tasks, project-level work calendar, trade capacity.
Algorithm:
* Initialize: project_start_date, trade timeline of busy intervals.
* Schedule mitigation tasks first.
* For each room, sort work packages by phase_code.
* For each work package, determine predecessor constraints, compute earliest_start, compute end_date.
* Create schedule_task with name, start_date, end_date, duration_days, predecessors.
* Update trade capacity timeline.
### 8) API and UI integration
We will expose the importer and scheduler via the API and surface status in the UI.
Endpoints:
* POST /projects/:projectId/xactimate/price-lists
* POST /projects/:projectId/xactimate/components
* POST /projects/:projectId/xactimate/import
* POST /projects/:projectId/xactimate/schedule
* GET /projects/:projectId/xactimate/imports/:importId/coverage
UI hooks: In project view, allow uploading Xactimate exports and seeing a Schedule Preview with Gantt. Allow PMs to override crew_size, lock specific tasks, and re-run scheduler.
### 9) Configuration and safety nets
To make the system tunable and safe for production use:
* Mapping configuration: Maintain server-side mapping of (cat, sel_pattern, activity) -> (trade, phase_code, include_in_schedule).
* Validation and failure modes: If a line item has no matching xact_price_item, log it and report in coverage.
* Auditing and transparency: For each schedule_task, store source_line_item_ids and source_equipment_usage_ids.
### 10) Rollout plan
* Phase 1: Implement price list importer and labor matrix derivation.
* Phase 2: Implement ALL XACT RAW importer for a single project.
* Phase 3: Implement work package aggregation and basic scheduler.
* Phase 4: Add mitigation/dry-out window derivation.
* Phase 5: Add trade capacity and calendar/holiday support.
* Phase 6: Expose APIs and add UI hooks.
