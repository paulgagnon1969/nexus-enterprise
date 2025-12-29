# Goal
Establish a robust, **truly parallel** CSV import standard for Nexus Enterprise so that large uploads (Golden PETL, Golden Components, Xact imports) are processed via **chunked background jobs** that can run in parallel, while preserving correctness, idempotency, and good observability.
## Current State (High Level)
* All imports are represented by a single `ImportJob` row (`ImportJobType` enum in `schema.prisma`).
* Worker (`apps/api/src/worker.ts`) processes **one job per file**:
    * `XACT_RAW` → `importXactCsvForProject`.
    * `XACT_COMPONENTS` → `importXactComponentsCsvForEstimate`.
    * `PRICE_LIST` → `importPriceListFromFile` (Golden PETL).
    * `PRICE_LIST_COMPONENTS` → `importGoldenComponentsFromFile` (Golden Components).
* Each of those functions currently:
    * Reads the entire CSV into memory (`csv-parse/sync`).
    * Performs all DB work for that file in a single job (sometimes with batched `createMany` inside a transaction).
* BullMQ:
    * Single queue `IMPORT_QUEUE_NAME` and one `Worker` with configurable `IMPORT_WORKER_CONCURRENCY` controlling **job-level** concurrency (file → job), not **intra-file** parallelism.
* Frontend (`apps/web/app/financial/page.tsx`) already:
    * Treats imports as asynchronous `ImportJob`s, polling `/import-jobs/:id` and `/import-jobs/pending`.
## Target State
* A generalized **chunked import** pattern:
    * One **parent ImportJob** per upload (existing model).
    * The worker **expands** this into multiple **chunk jobs** that can run in parallel.
    * Each chunk job processes a disjoint partition of the work (e.g., specific CAT/SEL buckets, line ranges, or hash partitions), performing only **local, conflict-free writes**.
    * The system tracks **totalChunks / completedChunks** and exposes a meaningful `progress` percentage.
    * When all chunks succeed, the parent ImportJob is marked `SUCCEEDED` and its `resultJson` describes the overall outcome.
* This becomes the **standard** for heavy imports:
    * Phase 1: Golden Components (`PRICE_LIST_COMPONENTS`).
    * Phase 2: Golden PETL (`PRICE_LIST`).
    * Phase 3: XACT RAW and XACT Components (`XACT_RAW`, `XACT_COMPONENTS`).
# Design Decisions
## 1. Data model extensions (ImportJob chunk metadata)
* Extend `ImportJob` in `packages/database/prisma/schema.prisma` with **optional** fields:
    * `totalChunks Int?` – number of chunk jobs planned for this ImportJob.
    * `completedChunks Int?` – how many chunks have finished successfully.
    * (Optional, but recommended) `metaJson Json?` – structured metadata for planner/worker, e.g. `{ priceListId, strategy: "cat-sel-hash", chunkCount }`.
* Keep `ImportJobStatus` as-is (QUEUED/RUNNING/SUCCEEDED/FAILED); we don’t introduce new statuses.
* Progress convention:
    * `progress` 0–10 while planning (reading CSV, computing partitions, global wipes).
    * `progress` ~10–99 as `completedChunks / totalChunks` advances.
    * 100 when finalized.
## 2. Queue job protocol (parent vs. chunk jobs)
* Keep a **single BullMQ queue** (`IMPORT_QUEUE_NAME`) but extend the Job payload schema.
* Define payload shape:
    * Parent job:
        * `{ kind: "parent"; importJobId: string }`
        * Backward compatible: if `kind` is missing, treat as `"parent"`.
    * Chunk job (generalized):
        * `{ kind: "chunk"; importJobId: string; chunkIndex: number; chunkCount: number; strategy: string; payload: any }`
        * `strategy` identifies which importer-specific chunk handler to use (e.g. `"PRICE_LIST_COMPONENTS:cat-sel-hash"`).
        * `payload` holds strategy-specific data (for Golden Components: chunk file path, priceListId, hash window, etc.).
* Worker behavior in `apps/api/src/worker.ts`:
    * If `kind === "chunk"` → dispatch to `processImportChunk`.
    * Else (default) → existing `processImportJob` becomes the **parent** planner/driver.
## 3. Parallelization strategy for Golden Components (Phase 1)
Golden Components are a good first candidate because:
* We can safely **wipe and rebuild** all `PriceListComponent` rows for the active Golden price list per import.
* Each resulting component row is keyed by `(priceListItemId, componentCode)` with a unique constraint.
### 3.1. Parent planning for `PRICE_LIST_COMPONENTS`
* For `ImportJobType.PRICE_LIST_COMPONENTS`, `processImportJob` will:
    1. Resolve the active GOLDEN `PriceList` (`priceListId`), error if missing.
    2. Perform a **once-per-import wipe** of components for that price list:
        * `deleteMany({ where: { priceListItem: { priceListId } } })`.
    3. Decide a fixed `chunkCount` (configurable, e.g. 4 or 8) based on file size and/or environment variable.
    4. Read the **original CSV once** and partition rows into **bucket-specific temporary CSV files** under `uploads/pricing`:
        * Derive a deterministic **partition key** from `Cat`/`Sel` and `Component Code` (or `Code`).
        * Example: `bucketIndex = hash(cat||"::"||sel||"::"||componentCode) % chunkCount`.
        * For each bucket, create `pricelist-components-<timestamp>-chunk-<k>.csv`.
        * This guarantees that **all rows contributing to a given `(priceListItemId, componentCode)` pair live in exactly one chunk file**.
    5. Create/update the parent `ImportJob`:
        * Set `status = RUNNING`, `totalChunks = chunkCount`, `completedChunks = 0`.
        * Store `metaJson` like `{ priceListId, strategy: "PRICE_LIST_COMPONENTS:cat-sel-hash", chunkCount }`.
        * Optionally set a low `progress` (e.g. 10).
    6. For each bucket `k`:
        * Enqueue a **chunk job** with payload:
        * `{ kind: "chunk", importJobId, chunkIndex: k, chunkCount, strategy, payload: { csvPath: chunkPath, priceListId } }`.
    7. Return; the parent job’s BullMQ task completes quickly, while chunk jobs do heavy work in parallel.
### 3.2. Chunk worker for Golden Components
* New helper in `packages/database/src/import-pricelist-components.ts`:
    * Factor the existing `importGoldenComponentsFromFile` into:
        * A reusable **core** that takes an in-memory list of parsed records and a `priceListId` (no global delete, no `fs.readFileSync`).
        * A new `importGoldenComponentsChunk` that:
        * Reads exactly one chunk CSV file.
        * Uses the core logic to:
        * Map records → `PendingComponent[]` for that chunk.
        * Aggregate by `(priceListItemId, componentCode)` **within chunk only**.
        * Writes components without any `deleteMany`, using `createMany` with `skipDuplicates: true`.
        * Uniqueness of `(priceListItemId, componentCode)` across chunks is guaranteed by the hash partitioning in the parent planner.
        * Returns `{ priceListId, itemCount, componentCount }` **for this chunk**.
* `processImportChunk` in the worker will:
    1. Look up the parent `ImportJob` to confirm it’s still RUNNING.
    2. Dispatch to `importGoldenComponentsChunk` based on `strategy`.
    3. When chunk succeeds:
        * `completedChunks++` using an atomic `update` on `ImportJob`.
        * Recompute `progress`, e.g.: `progress = 10 + Math.floor(80 * completedChunks / totalChunks)`.
        * Optionally aggregate counts in `resultJson` using a `metaJson` or separate fields.
    4. When the **last chunk** finishes (`completedChunks === totalChunks` after update):
        * Perform any finalization needed (e.g., compute final `itemCount` / `componentCount` via a cheap DB query).
        * Mark `status = SUCCEEDED`, set `finishedAt`, and finalize `message` / `resultJson`.
### 3.3. Failure handling
* If any chunk job fails:
    * Worker `failed` handler already marks `ImportJob` as `FAILED` and stores `errorJson`.
    * We will:
        * Leave any partially written components in place (acceptable for now; a failed import should be explicitly fixed by rerunning the job from scratch).
        * Optionally, future improvement: wrap the entire import in a “versioned” `PriceListComponentSet` concept and flip an `isActive` flag only when all chunks succeed.
### 3.4. API / frontend impact
* APIs remain the same:
    * Upload endpoint already creates `ImportJob` and queues the parent job.
    * `/import-jobs/:id` returns `totalChunks`, `completedChunks`, `progress`, `status`.
* Frontend:
    * Can continue polling as before.
    * We may optionally surface a more detailed message like `"Processing chunk 2 of 4…"` based on `totalChunks` / `completedChunks`.
## 4. Future phases (outline only)
### 4.1. Golden PETL (`PRICE_LIST`)
* More complex because the import:
    * Marks previous GOLDEN lists inactive.
    * Creates a **new PriceList** and many `PriceListItem` rows in a single transaction.
* Likely design:
    * Phase 0 (planner): single-threaded creation of the new `PriceList` row and global metadata (revision, division mapping, prev price map).
    * Phase 1: chunk `PriceListItem` creation by line ranges or CAT buckets, each chunk performing `createMany` against the **same** `priceListId`.
    * Requires refactoring `importPriceListFromFile` into a planner + chunk writer similar to components.
### 4.2. XACT RAW / XACT Components
* These imports have more intertwined domain logic (units, particles, logical items, SOW creation, golden sync), so chunking will require:
    * Separating **pure data ingestion** (raw rows, summaries) from **higher-order modeling** (units, particles, SOW, Golden sync).
    * Likely pattern: chunked ingestion of raw rows and summaries, then single follow-up job for the model-building phases.
# Implementation Plan (Phase 1: Golden Components)
## Step 1 – Prisma schema + migration
* Edit `packages/database/prisma/schema.prisma`:
    * Add `totalChunks Int?`, `completedChunks Int?`, `metaJson Json?` to `ImportJob`.
* Create a new Prisma migration under `packages/database/prisma/migrations` that adds these columns.
* Run `npm install` (if needed) and `npx prisma migrate dev` in `packages/database` against the dev DB.
## Step 2 – Update ImportJob DTOs and API layer
* Update `apps/api/src/modules/import-jobs/dto/import-jobs.dto.ts` and `ImportJobsService` types (if needed) to surface new fields.
* Ensure `/import-jobs/:id` returns `totalChunks`, `completedChunks`, and `metaJson` (if useful to the UI).
* Update comments in `ImportJobsService.summarizePendingForCompany` to reflect that Golden PETL/Components are now async and appear in pending summary (or intentionally keep them filtered out, but update the rationale).
## Step 3 – Extend queue payload and worker routing
* Update `ImportJobPayload` in `apps/api/src/worker.ts` to support discriminated union:
    * `kind?: "parent" | "chunk"; importJobId: string; chunkIndex?: number; chunkCount?: number; strategy?: string; payload?: any;`.
* Change the `Worker` processor function to branch:
    * `if (data.kind === "chunk") processImportChunk(...); else processImportJob(...);`.
* Keep existing producers (`getImportQueue().add("process", { importJobId })`) working by defaulting `kind` to `"parent"` when undefined.
## Step 4 – Implement Golden Components planner (parent job)
* In `apps/api/src/worker.ts` (or a dedicated helper module), modify `processImportJob` for `ImportJobType.PRICE_LIST_COMPONENTS` so that it:
    1. Resolves the GOLDEN price list.
    2. Performs a global delete for that price list’s components.
    3. Computes `chunkCount` (from env or fallback default, e.g. 4).
    4. Reads the original CSV at `job.csvPath`, splitting into chunk files based on hash partitioning over `(Cat, Sel, Component Code)`.
    5. Updates `ImportJob` with `status=RUNNING`, `totalChunks`, `completedChunks=0`, `metaJson`, and baseline `progress`.
    6. Enqueues `chunk` jobs with the appropriate payload.
    7. Returns without directly calling `importGoldenComponentsFromFile`.
## Step 5 – Factor Golden Components logic into a chunk-capable helper
* In `packages/database/src/import-pricelist-components.ts`:
    * Extract common parsing + mapping logic into a reusable function that:
        * Accepts parsed CSV records and `priceListId`.
        * Produces aggregated `PendingComponent[]` for that subset (no `deleteMany`).
    * Implement `importGoldenComponentsChunk(payload)` that:
        * Reads its chunk CSV file.
        * Uses the refactored core to build `uniqueComponents` for that chunk.
        * Performs `createMany` with `skipDuplicates: true`.
        * Returns `{ priceListId, itemCount, componentCount }` for the chunk.
    * Keep the existing `importGoldenComponentsFromFile` as a thin wrapper around the same core so that:
        * CLI tools (`run-import-pricelist-components.ts`) and any existing callers still work.
## Step 6 – Implement `processImportChunk` in the worker
* Add a new `processImportChunk` function in `apps/api/src/worker.ts` that:
    1. Reads `importJobId`, `chunkIndex`, `chunkCount`, `strategy`, `payload`.
    2. Verifies the parent `ImportJob` exists and is `RUNNING`.
    3. For `strategy === "PRICE_LIST_COMPONENTS:cat-sel-hash"`, calls `importGoldenComponentsChunk(payload)`.
    4. After success, updates the parent `ImportJob` in a transaction:
        * `completedChunks = completedChunks + 1`.
        * `progress` based on completion ratio.
        * Optionally aggregate counts into `resultJson`.
    5. If the update shows `completedChunks === totalChunks`, run finalization:
        * Optionally recompute and store final `itemCount` / `componentCount` via a DB query.
        * Set `status=SUCCEEDED`, `finishedAt`, and final `message`.
## Step 7 – Frontend adjustments (optional but recommended)
* Update `ImportJobDto` type in `apps/web/app/financial/page.tsx` to include `totalChunks` and `completedChunks`.
* When rendering Golden Components upload status, optionally:
    * Show `"Processing chunk X of Y…"` if fields are present.
    * Continue using `progress` and `status` for polling logic as-is.
## Step 8 – Testing and rollout
* Local/dev testing steps:
    1. Run migrations against dev DB.
2. Start dev stack (`./start-dev-clear_ALL.sh`) including worker.
    3. Upload a **small** Golden Components CSV and confirm:
        * ImportJob transitions QUEUED → RUNNING → SUCCEEDED.
        * `totalChunks` and `completedChunks` behave as expected.
        * Components table matches expectations (no duplicates, correct counts).
    4. Upload a **large** Golden Components CSV and monitor:
        * Multiple chunk jobs run in parallel (by increasing `IMPORT_WORKER_CONCURRENCY` or running multiple workers).
        * No unique constraint violations or transaction conflicts.
        * Reasonable end-to-end runtime scaling with concurrency.
* Once stable for components, reuse the same pattern to design chunked Golden PETL and XACT pipelines in follow-up changes.
# Notes / Tradeoffs
* Phase 1 deliberately targets **Golden Components first** to keep scope contained while establishing the chunked import framework.
* We favor **application-level partitioning** (temporary bucket CSVs + deterministic hashing) over more invasive DB schema changes.
* Some invariants (e.g. complete wipe-and-rebuild of Golden components per import) are preserved, but the implementation shifts from single-job to multi-chunk jobs.
* Future work can refine this to:
    * Use GCS instead of local disk for chunk CSVs.
    * Add more advanced failure recovery (e.g., re-running only failed chunks, or versioned component sets).
