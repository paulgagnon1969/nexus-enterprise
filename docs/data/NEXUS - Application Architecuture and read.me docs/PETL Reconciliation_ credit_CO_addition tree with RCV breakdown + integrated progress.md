# Problem
We need PETL line\-item reconciliation that can:
* Attach credits and client change orders to a specific baseline PETL line \(a reconciliation “tree”\)\.
* Replace a baseline line item by crediting it out \(negative\) and attaching a new line item from the tenant “Golden PETL” \(Company Cost Book\)\.
* Support notes/journal \+ attachments per reconciliation\.
* Use RCV as the monetary basis, with an RCV breakdown UI \(Qty, Unit Cost, Item Amount, Tax, O&P/Other\) and a simple calculator\-style selector to choose what portion to credit/charge\.
* Have reconciliation entries affect PETL totals and percent complete in real time\.
# Current state
* PETL lines are `SowItem` rows \(RCV in `rcvAmount`, item total in `itemAmount`, tax in `salesTaxAmount`\)\.
* PETL endpoints \(`GET /projects/:id/petl`, `GET /petl-groups`, `GET /petl-selection-summary`, `GET /estimate-summary`, `GET /financial-summary`\) compute totals from `SowItem` only\.
* The web PETL UI \(`apps/web/app/projects/[id]/page.tsx`\) shows:
    * Project grouping \(Rooms/Zones with expandable per\-room items\)
    * Line sequence \(flat items table\)
* We added a local “Needs review” flag stored in localStorage, but there is no persisted reconciliation model\.
# Proposed changes
## 1\) Database: persisted reconciliation entries that behave like PETL lines
Add new Prisma models \(names can be tuned\):
* `PetlReconciliationCase`
    * Anchors reconciliation to `projectId` \+ `logicalItemId` \(preferred\) and/or a specific `sowItemId` for the current estimate version\.
    * One case per baseline logical line \(supports cross\-version stability\)\.
    * Optional `noteThreadId` \(MessageThread of type JOURNAL\) for notes/attachments\.
* `PetlReconciliationEntry`
    * Represents child nodes in the reconciliation tree\.
    * Fields include:
        * `projectId`, `estimateVersionId`
        * `caseId`
        * `projectParticleId` \(for room grouping\)
        * `kind` enum \(CREDIT, ADD\_SCOPE, CHANGE\_ORDER\_CLIENT\_PAY, OWNER\_REIMBURSEMENT, NOTE\_ONLY\)
        * Monetary breakdown fields \(all optional but typically populated\):
        * `qty`, `unit`, `unitCost`
        * `itemAmount`, `salesTaxAmount`, `opAmount` \(derived “O&P/Other”\)
        * `rcvAmount` \(stored for fast rollups; equals item\+tax\+op\)
        * `percentComplete` \(editable only for positive work scope; credits default to 0 and are locked\)
        * Optional source link to tenant cost book:
        * `companyPriceListItemId` \(or `priceListItemId` if needed\)
        * `createdByUserId`, timestamps
## 2\) RCV breakdown semantics
For baseline `SowItem`:
* Display fields:
    * Qty
    * Unit cost
    * Item Amount \(from Xact\)
    * Sales tax amount
    * O&P/Other = \(RCV \- Item Amount \- Sales Tax\), clamped/rounded
* In the “calculator” selector, user can toggle which components are included in the credit/add calculation\.
* For credits, the created entry stores negative values for the selected components and a negative `rcvAmount`\.
## 3\) API: reconciliation \+ cost\-book search
### 3\.1 Reconciliation endpoints \(Project module\)
Add endpoints:
* `GET /projects/:id/petl/:sowItemId/rcv-breakdown`
    * Returns the baseline breakdown rows for the calculator UI\.
* `POST /projects/:id/petl-reconcile/:sowItemId/credit`
    * Body: selected component toggles \+ optional note text\.
    * Creates/gets the `PetlReconciliationCase` and inserts a CREDIT entry\.
* `POST /projects/:id/petl-reconcile/:sowItemId/attach`
    * Body: source selection \(companyPriceListItemId or manual fields\), qty, unitCost, selected components, kind \(ADD\_SCOPE vs CHANGE\_ORDER\_CLIENT\_PAY\)\.
    * Creates an ADD/CO entry attached to the case\.
* `PATCH /projects/:id/petl-reconcile/entry/:entryId/percent`
    * Updates percentComplete \(only if entry is not locked\)\.
* \(Optional v1\) `PATCH /projects/:id/petl-reconcile/entry/:entryId/amount` for editing qty/unitCost/tax/op\.
### 3\.2 PETL list endpoints include reconciliation entries
Update existing endpoints to include reconciliation entries as “effective PETL lines”:
* `GET /projects/:id/petl`
* `GET /projects/:id/petl-groups`
* `GET /projects/:id/petl-selection-summary`
* `GET /projects/:id/estimate-summary`
* `GET /projects/:id/financial-summary`
Implementation approach:
* Query baseline `SowItem` rows for the active estimateVersion\.
* Query `PetlReconciliationEntry` rows for the same project\+estimateVersion\.
* Return a unified list to the web, with a discriminator \(e\.g\. `source: "BASE" | "RECON"`, `reconKind`, `parentSowItemId/logicalItemId`\)\.
* Aggregations \(totals, selection summary, financial summary\) should sum \(base \+ entries\) using `rcvAmount ?? itemAmount ?? 0`\.
### 3\.3 Cost book search \(Pricing module\)
Add endpoint to search tenant cost book for “Golden PETL” replacement lines:
* `POST /pricing/company-price-list/search`
    * Body: `query`, optional `cat`, `sel`, `limit`
    * Returns `CompanyPriceListItem` matches \(id, cat, sel, description, unit, unitPrice\)\.
## 4\) Web UI: reconciliation drawer \+ calculator
In `apps/web/app/projects/[id]/page.tsx`:
* Add a per\-line “Recon” action \(button\) in both Project grouping expanded rows and Line sequence table\.
* Clicking opens a right\-side drawer:
    * Baseline line summary
    * RCV breakdown “calculator” list with toggles:
        * Qty × UnitCost → Item Amount
        * Sales Tax
        * O&P/Other
    * Actions:
        * Create credit \(negative\) from selected components
        * Attach new line from cost book \(search modal\)
        * Attach manual line \(fallback\)
    * Reconciliation tree list:
        * Baseline
        * Child entries \(credits / adds / CO\), showing net delta
    * Notes / attachments:
        * Backed by MessageThread\(JOURNAL\) \+ MessageAttachment / ProjectFile
## 5\) Percent complete semantics
* Baseline `SowItem.percentComplete` remains the primary work tracking\.
* Reconciliation entries:
    * CREDIT entries: `percentComplete` fixed at 0 \(locked\), so they reduce scope totals but do not introduce negative “completed work”\.
    * ADD/CO entries: percentComplete editable like baseline lines and included in all percent\-complete rollups\.
# Rollout strategy
* Phase 1: DB \+ API read/merge \+ simple drawer showing existing entries \(no create\)\.
* Phase 2: Implement “Create credit” \(full RCV by default\) \+ persisted entries and ensure totals update\.
* Phase 3: Implement calculator component selection \(partial credit/add\)\.
* Phase 4: Implement cost book search \+ attach new line\.
* Phase 5: Add notes/attachments integration via MessageThread/JOURNAL\.
# Files likely to change
* `packages/database/prisma/schema.prisma`
* New Prisma migration\(s\)
* `apps/api/src/modules/project/project.controller.ts`
* `apps/api/src/modules/project/project.service.ts`
* `apps/api/src/modules/pricing/pricing.controller.ts` \(cost book search\)
* `apps/web/app/projects/[id]/page.tsx` \(reconciliation UI\)
# Open questions to confirm before coding
* Should credits be allowed to create placeholder entries with no amount \(for O\-column\-style notes\), or should amount be required and we rely on the “Needs review” flag until amount is known?
* When attaching a cost book item, do we want to copy its `description/cat/sel/unit/unitPrice` into the entry \(snapshot\) or always resolve live from the cost book \(snapshot recommended for audit consistency\)\.
