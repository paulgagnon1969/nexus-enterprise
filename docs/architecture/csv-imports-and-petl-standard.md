# CSV Imports, PETL Standard, and Parallel Worker Architecture

This document defines the standard operating procedure (SOP) for **all CSV-based imports** in Nexus Enterprise, and explains why we use a **PETL-style, job-based, parallel worker** pattern instead of synchronous processing.

## Goals

- Handle **large CSV files** (tens or hundreds of thousands of rows) without blocking HTTP requests or freezing the UI.
- Ensure imports are **observable, resumable, and auditable** via `ImportJob` records.
- Provide a **consistent pattern** that new imports must follow (controller → ImportJob → worker → polling UI).
- Support **horizontal and vertical scaling** of import throughput by:
  - Increasing worker concurrency.
  - Running multiple worker instances.
  - Splitting individual imports into **parallelizable chunks**.

## Core Concepts

### ImportJob model

All imports are represented by an `ImportJob` row in the database (see `ImportJob` and `ImportJobType` in `packages/database/prisma/schema.prisma`).

Key fields:

- `id`: unique identifier for the job.
- `companyId`, `projectId?`: scoping context.
- `type`: which import pipeline to run (e.g. `XACT_RAW`, `XACT_COMPONENTS`, `PRICE_LIST`, `PRICE_LIST_COMPONENTS`).
- `status`: `QUEUED | RUNNING | SUCCEEDED | FAILED`.
- `progress`: integer 0–100 for coarse progress reporting.
- `csvPath`: path or URI to the uploaded CSV (local filesystem today; object storage in the future).
- `resultJson?`, `errorJson?`: structured success/failure payloads.
- `createdAt`, `startedAt?`, `finishedAt?`: lifecycle timestamps.

### Import queue and worker

- We use a single BullMQ queue (`IMPORT_QUEUE_NAME`) backed by Redis.
- A NestJS worker process (`apps/api/src/worker.ts`) is responsible for **all import execution**.
- Controllers never perform heavy import work directly; instead they:
  - Validate and store the uploaded CSV.
  - Create an `ImportJob`.
  - Enqueue a job on the import queue.
  - Return an immediate response (typically `{ jobId }`).

The worker picks up jobs, looks up the corresponding `ImportJob` row, updates its status/progress, and runs the appropriate pipeline.

### PETL standard

We treat imports as **PETL**:

1. **Parse**: read CSV rows into normalized records.
2. **Enrich**: resolve lookups, compute hashes, attach domain context.
3. **Transform**: aggregate and normalize into Nexus-specific models.
4. **Load**: write to Postgres in **batches** (`createMany`, transactions) to minimize chattiness to Cloud SQL.

The PETL steps live in shared helpers in `packages/database` and/or dedicated API services, not in controllers.

## Why we need this architecture

### Problems with synchronous, in-request imports

Historically, some endpoints (e.g. early Golden Components import) performed all work in the HTTP request handler:

- The browser upload request would stay open until the entire file was processed.
- Large files caused:
  - **Long-running requests** that often exceeded front-end or proxy timeouts.
  - **Poor user experience** (no progress feedback, spinner for minutes).
  - Harder debugging and no durable record of what happened.

### Benefits of job-based, parallel imports

By standardizing on `ImportJob` + worker + PETL we get:

- **Reliability**: work is decoupled from the HTTP lifecycle; transient front-end/network issues do not abort imports.
- **Observability**: each job has status, progress, timestamps, and result/error JSON.
- **Scalability**:
  - We can increase `IMPORT_WORKER_CONCURRENCY` to process multiple jobs at once.
  - We can run multiple worker instances; BullMQ distributes jobs across them.
- **Parallelism within a single file** (new standard): for very large CSVs we can split the work into **chunk jobs** that run in parallel.
- **Consistency**: the front-end can handle imports in a single way (poll `ImportJob`s), regardless of which domain is being imported.

## Parallel (Chunked) Import Standard

Large imports (e.g. Golden PETL, Golden Components, XACT imports) should not be processed as a single monolithic job. Instead, we use a **parent + chunks** pattern.

### ImportJob chunk metadata

We extend `ImportJob` with optional metadata for parallel execution:

- `totalChunks Int?` – total number of planned chunk jobs for this import.
- `completedChunks Int?` – how many chunk jobs have completed successfully.
- `metaJson Json?` – strategy-specific metadata (e.g. `{ priceListId, strategy: "PRICE_LIST_COMPONENTS:cat-sel-hash", chunkCount }`).

`status` and `progress` semantics:

- `QUEUED`: job has been created but no work has started.
- `RUNNING`:
  - 0–10: planning/preparation (global deletes, computing partitions).
  - 10–99: active chunk execution; `progress` should roughly track `completedChunks / totalChunks`.
- `SUCCEEDED`: all work finished successfully; `finishedAt` is set.
- `FAILED`: unrecoverable error; details are recorded in `errorJson`.

### Queue payloads: parent vs. chunk jobs

We distinguish two shapes of BullMQ jobs on `IMPORT_QUEUE_NAME`:

- **Parent job** (planner/driver):
  - Payload: `{ kind: "parent", importJobId: string }`.
  - Backwards compatible: if `kind` is missing, we treat it as `"parent"`.
- **Chunk job** (parallel worker unit):
  - Payload: `{ kind: "chunk", importJobId: string, chunkIndex: number, chunkCount: number, strategy: string, payload: any }`.
  - `strategy` identifies which chunk handler to run.
  - `payload` holds strategy-specific details (e.g., `csvPath`, `priceListId`, partition keys).

The worker routes jobs based on `kind`:

- `kind === "chunk"` → `processImportChunk(...)`.
- Otherwise → `processImportJob(...)` (parent planner).

### Parent job responsibilities (per import type)

Parent jobs are responsible for **planning** and **scheduling** work, not doing heavy ETL themselves.

For a given `ImportJob`:

1. Look up the `ImportJob` row; if status is already terminal (`SUCCEEDED`/`FAILED`), return.
2. Set `status = RUNNING`, record `startedAt`, and set a low `progress` (e.g. 5–10).
3. Perform any **global one-time preconditions**, such as:
   - Resolving context (`companyId`, `projectId`, active GOLDEN price list).
   - Performing a global delete or deactivation if the domain semantics require it.
4. Decide a **chunking strategy** and `chunkCount` (e.g., 4 or 8):
   - Line ranges (e.g. records 0–N, N–2N, ...).
   - Hash partitioning (e.g. based on `(Cat, Sel, Component Code)`).
   - Domain-specific keys.
5. Materialize chunk inputs:
   - Today: write partitioned CSVs under `uploads/...`.
   - Future: write partitioned blobs/objects in GCS and store URIs.
6. Update the parent `ImportJob`:
   - `totalChunks`, `completedChunks = 0`, `metaJson` describing strategy.
7. Enqueue **chunk jobs** (one per partition) onto the same queue.
8. Return; heavy work is delegated to chunks.

### Chunk job responsibilities

Each chunk job is:

- Independent: it processes a disjoint subset of the input data.
- Idempotent with respect to its partition: re-running the chunk should not corrupt state.

Per chunk:

1. Read the parent `ImportJob` and ensure it is still `RUNNING`.
2. Interpret `strategy` and `payload` and invoke the correct **chunk importer** (in `packages/database` or a dedicated service), which:
   - Reads its portion of data (e.g. one CSV chunk, a range from GCS, etc.).
   - Parses and transforms into domain objects.
   - Performs **only local writes** that cannot conflict with other chunks.
   - Uses bulk writes (e.g. `createMany`) and `skipDuplicates: true` where appropriate.
3. On success:
   - Atomically increment `completedChunks` on the parent `ImportJob`.
   - Recompute `progress` based on `completedChunks / totalChunks`.
   - Optionally merge per-chunk counters into `resultJson`.
4. On failure:
   - Allow the worker’s global `failed` handler to set `status = FAILED` and record `errorJson` for the parent job.

When the **last chunk** completes (`completedChunks === totalChunks` after update), we:

- Optionally run any **finalization** logic (quick aggregate queries, validation).
- Mark the parent `ImportJob` as `SUCCEEDED` and set `finishedAt`.

### Example: Golden Components (PRICE_LIST_COMPONENTS)

Golden Components are the first import pipeline adopting the chunked pattern.

Domain constraints:

- For a given active GOLDEN `PriceList`, we want all `PriceListComponent` rows to exactly match the latest CSV upload.
- Components are uniquely keyed by `(priceListItemId, componentCode)`.

Strategy:

1. Parent job:
   - Resolve active GOLDEN `PriceList` (`priceListId`).
   - Delete existing `PriceListComponent`s for that price list (one-time wipe per import).
   - Choose `chunkCount` (e.g. 4 or 8).
   - Read the original CSV at `csvPath` once and hash-partition rows by `(Cat, Sel, Component Code)` into `chunkCount` bucket CSVs.
   - Update `ImportJob` with `totalChunks`, `completedChunks = 0`, `metaJson`, and baseline `progress`.
   - Enqueue `chunk` jobs with payload `{ csvPath: chunkPath, priceListId, ... }`.
2. Chunk job:
   - Reads a single chunk CSV.
   - Maps records to `PendingComponent` objects.
   - Aggregates by `(priceListItemId, componentCode)` **within the chunk**.
   - Bulk-inserts via `createMany({ data: uniqueComponents, skipDuplicates: true })`.
   - Returns per-chunk counts.
3. Worker increments `completedChunks` and updates `progress` per chunk; on the final chunk, it finalizes `status` and `resultJson`.

Because the hash partitioning guarantees that a given `(priceListItemId, componentCode)` combination exists in only one chunk, chunks can safely run in parallel without violating the uniqueness constraint.

## SOP for Any New Import

When building **any new CSV-based import**, follow this SOP:

### 1. Controller / HTTP contract

- Accept the file upload (usually as a single `file` field in multipart/form-data).
- Validate:
  - File is present.
  - MIME type / extension look reasonable (e.g. `text/csv` or `.csv`).
  - User has appropriate authorization.
- Store the CSV somewhere the worker can access:
  - Today: under `uploads/<domain>/...`.
  - Future: upload to object storage and store a URI.
- Create an `ImportJob` with:
  - Correct `type` enum.
  - `companyId`, `projectId?`, `createdByUserId`.
  - `status = QUEUED`, `progress = 0`.
  - `csvPath` (or URI).
- Enqueue a **parent job** on the import queue:
  - `{ kind: "parent", importJobId }` (or just `{ importJobId }` for backward compatibility).
- Return `{ jobId }` to the client.

### 2. Worker: parent job implementation

In `processImportJob` (or a type-specific helper):

- Implement the planning flow described above for the new `ImportJobType`.
- Choose a sensible `chunkCount` and partitioning scheme:
  - Prefer stable keys that localize conflicts (e.g. project IDs, price list IDs, CAT/SEL buckets).
- Ensure any **global destructive operation** (e.g. delete-and-rebuild) happens **once** in the parent before chunks execute.

### 3. Worker: chunk implementation

- Implement a **chunk handler** in a suitable module (often in `packages/database`):
  - Input: strategy-specific payload describing the chunk’s scope.
  - Output: success/failure and optional counters.
- Ensure the handler is:
  - **Idempotent** for its scope.
  - Using **batched writes** wherever possible.
- Wire it into `processImportChunk` based on `strategy`.

### 4. Front-end behavior

- Never assume imports complete synchronously in the HTTP response.
- Standard pattern:
  - On upload success, expect `{ jobId }`.
  - Store that `jobId` in local component state.
  - Poll `/import-jobs/:jobId` on a timer (e.g. every 5 seconds) until `status` is `SUCCEEDED` or `FAILED`.
  - Use `progress`, `message`, and optionally `totalChunks` / `completedChunks` to show status.
  - On `SUCCEEDED`, refresh the relevant views (tables, graphs, etc.).

## Future Improvements

The current architecture is designed to evolve in the following directions:

- **Object storage integration**: use GCS (or equivalent) for both original uploads and chunk files instead of local disk paths.
- **Re-run / resume semantics**: support re-running only failed chunks, or safely retrying parent jobs without manual cleanup.
- **Versioned data sets**: model versioned component/price list sets and flip an `isActive` flag only when a full import succeeds.
- **Per-type queues**: split imports into specialized queues (e.g. pricing vs. XACT) to allow per-domain concurrency controls.

Until those are implemented, all new work should still follow the **PETL + ImportJob + chunked worker** standard described here.
