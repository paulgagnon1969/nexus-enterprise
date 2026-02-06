"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function CsvImportArchitectureBkmPage() {
  const router = useRouter();

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => router.push("/learning/bkm")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 14,
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              ← BKMs
            </button>
            <span style={{ color: "#9ca3af" }}>|</span>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>BKM-INT-001</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>CSV Import Architecture</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Technical standard for building CSV-based imports: PETL pattern, job-based processing, and parallel chunking.
          </p>
        </header>

        {/* Goals */}
        <Section title="Goals">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            <li>Handle <strong>large CSV files</strong> (tens or hundreds of thousands of rows) without blocking HTTP requests</li>
            <li>Ensure imports are <strong>observable, resumable, and auditable</strong> via ImportJob records</li>
            <li>Provide a <strong>consistent pattern</strong> for all imports (controller → ImportJob → worker → polling UI)</li>
            <li>Support <strong>horizontal and vertical scaling</strong> via chunked parallel processing</li>
          </ul>
        </Section>

        {/* Core Concepts */}
        <Section title="Core Concepts">
          <SubSection title="ImportJob Model">
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#374151" }}>
              All imports are represented by an <code>ImportJob</code> row in the database:
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              <FieldRow field="id" description="Unique identifier for the job" />
              <FieldRow field="companyId, projectId?" description="Scoping context" />
              <FieldRow field="type" description="Which pipeline: XACT_RAW, XACT_COMPONENTS, PRICE_LIST, etc." />
              <FieldRow field="status" description="QUEUED | RUNNING | SUCCEEDED | FAILED" />
              <FieldRow field="progress" description="Integer 0–100 for coarse progress reporting" />
              <FieldRow field="csvPath" description="Path/URI to the uploaded CSV" />
              <FieldRow field="resultJson?, errorJson?" description="Structured success/failure payloads" />
              <FieldRow field="createdAt, startedAt?, finishedAt?" description="Lifecycle timestamps" />
            </div>
          </SubSection>

          <SubSection title="Import Queue & Worker">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "#374151" }}>
              <div>• Single <strong>BullMQ queue</strong> backed by Redis</div>
              <div>• NestJS worker process (<code>apps/api/src/worker.ts</code>) handles all import execution</div>
              <div>• <strong>Controllers never perform heavy import work</strong>—they validate, store CSV, create ImportJob, enqueue, return</div>
            </div>
          </SubSection>
        </Section>

        {/* PETL Standard */}
        <Section title="PETL Standard">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151" }}>
            We treat imports as <strong>PETL</strong> (Parse, Enrich, Transform, Load):
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PetlStep
              step="P"
              title="Parse"
              description="Read CSV rows into normalized records"
            />
            <PetlStep
              step="E"
              title="Enrich"
              description="Resolve lookups, compute hashes, attach domain context"
            />
            <PetlStep
              step="T"
              title="Transform"
              description="Aggregate and normalize into Nexus-specific models"
            />
            <PetlStep
              step="L"
              title="Load"
              description="Write to Postgres in batches (createMany, transactions) to minimize database chattiness"
            />
          </div>
          <Callout type="info">
            PETL steps live in shared helpers in <code>packages/database</code> and/or dedicated API services, <strong>not in controllers</strong>.
          </Callout>
        </Section>

        {/* Why Job-Based */}
        <Section title="Why Job-Based Processing?">
          <SubSection title="Problems with Synchronous Imports">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Browser upload stays open until entire file is processed</li>
              <li><strong>Long-running requests</strong> exceed front-end or proxy timeouts</li>
              <li>Poor UX: no progress feedback, spinner for minutes</li>
              <li>Harder debugging and no durable record of what happened</li>
            </ul>
          </SubSection>

          <SubSection title="Benefits of Job-Based Pattern">
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <BenefitCard
                title="Reliability"
                description="Work is decoupled from HTTP lifecycle; network issues don't abort imports"
              />
              <BenefitCard
                title="Observability"
                description="Each job has status, progress, timestamps, and result/error JSON"
              />
              <BenefitCard
                title="Scalability"
                description="Increase worker concurrency or run multiple instances; BullMQ distributes jobs"
              />
              <BenefitCard
                title="Parallelism"
                description="Large CSVs can split into chunk jobs that run in parallel"
              />
              <BenefitCard
                title="Consistency"
                description="Front-end handles all imports the same way (poll ImportJobs)"
              />
            </div>
          </SubSection>
        </Section>

        {/* Parallel Chunked Pattern */}
        <Section title="Parallel (Chunked) Import Pattern">
          <Callout type="warning">
            Large imports should NOT be processed as a single monolithic job. Use the <strong>parent + chunks</strong> pattern.
          </Callout>

          <SubSection title="Chunk Metadata on ImportJob">
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <FieldRow field="totalChunks" description="Total number of planned chunk jobs" />
              <FieldRow field="completedChunks" description="How many chunks have completed successfully" />
              <FieldRow field="metaJson" description="Strategy-specific metadata (e.g. priceListId, chunkCount)" />
            </div>
          </SubSection>

          <SubSection title="Status & Progress Semantics">
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <StatusRow status="QUEUED" description="Job created but no work started" />
              <StatusRow status="RUNNING (0–10)" description="Planning/preparation phase" />
              <StatusRow status="RUNNING (10–99)" description="Active chunk execution; progress tracks completedChunks / totalChunks" />
              <StatusRow status="SUCCEEDED" description="All work finished; finishedAt is set" />
              <StatusRow status="FAILED" description="Unrecoverable error; details in errorJson" />
            </div>
          </SubSection>

          <SubSection title="Queue Payloads">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <div style={{ padding: 12, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#166534", marginBottom: 4 }}>Parent Job (Planner)</div>
                <code style={{ fontSize: 12, color: "#4b5563" }}>
                  {"{ kind: \"parent\", importJobId: string }"}
                </code>
              </div>
              <div style={{ padding: 12, backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1e40af", marginBottom: 4 }}>Chunk Job (Worker Unit)</div>
                <code style={{ fontSize: 12, color: "#4b5563" }}>
                  {"{ kind: \"chunk\", importJobId, chunkIndex, chunkCount, strategy, payload }"}
                </code>
              </div>
            </div>
          </SubSection>
        </Section>

        {/* Parent Job Responsibilities */}
        <Section title="Parent Job Responsibilities">
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <li>Look up ImportJob row; if already terminal, return</li>
            <li>Set <code>status = RUNNING</code>, record <code>startedAt</code>, set low progress (5–10)</li>
            <li>Perform <strong>global one-time preconditions</strong>:
              <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                <li>Resolve context (companyId, projectId, active price list)</li>
                <li>Global delete or deactivation if domain requires it</li>
              </ul>
            </li>
            <li>Decide <strong>chunking strategy</strong> and chunkCount:
              <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                <li>Line ranges (records 0–N, N–2N, ...)</li>
                <li>Hash partitioning (e.g. by Cat, Sel, Component Code)</li>
                <li>Domain-specific keys</li>
              </ul>
            </li>
            <li>Materialize chunk inputs (partitioned CSVs or blobs)</li>
            <li>Update ImportJob with <code>totalChunks</code>, <code>completedChunks = 0</code>, <code>metaJson</code></li>
            <li><strong>Enqueue chunk jobs</strong> onto the same queue</li>
            <li>Return—heavy work is delegated to chunks</li>
          </ol>
        </Section>

        {/* Chunk Job Responsibilities */}
        <Section title="Chunk Job Responsibilities">
          <Callout type="info">
            Each chunk is <strong>independent</strong> (disjoint subset) and <strong>idempotent</strong> (re-running won't corrupt state).
          </Callout>
          <ol style={{ margin: "12px 0 0", paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <li>Read parent ImportJob; ensure it's still RUNNING</li>
            <li>Interpret <code>strategy</code> and <code>payload</code>, invoke correct chunk importer:
              <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                <li>Read its portion of data</li>
                <li>Parse and transform into domain objects</li>
                <li>Perform <strong>only local writes</strong> that cannot conflict with other chunks</li>
                <li>Use bulk writes (<code>createMany</code>, <code>skipDuplicates: true</code>)</li>
              </ul>
            </li>
            <li>On success: atomically increment <code>completedChunks</code>, update progress</li>
            <li>On failure: worker's failed handler sets <code>status = FAILED</code> and records <code>errorJson</code></li>
            <li>When <strong>last chunk completes</strong>: run finalization, mark <code>SUCCEEDED</code></li>
          </ol>
        </Section>

        {/* SOP for New Imports */}
        <Section title="SOP for Any New Import">
          <SubSection title="1. Controller / HTTP Contract">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Accept file upload (multipart/form-data)</li>
              <li>Validate: file present, MIME type, authorization</li>
              <li>Store CSV where worker can access (<code>uploads/&lt;domain&gt;/...</code>)</li>
              <li>Create ImportJob with correct type, scoping, <code>status = QUEUED</code></li>
              <li>Enqueue parent job on import queue</li>
              <li>Return <code>{"{ jobId }"}</code> to client</li>
            </ul>
          </SubSection>

          <SubSection title="2. Worker: Parent Job">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Implement planning flow for the new ImportJobType</li>
              <li>Choose sensible chunkCount and partitioning scheme</li>
              <li>Ensure global destructive operations happen <strong>once in parent</strong> before chunks</li>
            </ul>
          </SubSection>

          <SubSection title="3. Worker: Chunk Handler">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Implement in <code>packages/database</code></li>
              <li>Must be <strong>idempotent</strong> for its scope</li>
              <li>Use <strong>batched writes</strong> wherever possible</li>
              <li>Wire into <code>processImportChunk</code> based on strategy</li>
            </ul>
          </SubSection>

          <SubSection title="4. Front-End Behavior">
            <div style={{ padding: 12, backgroundColor: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, marginTop: 8, fontSize: 13 }}>
              <strong>Never assume imports complete synchronously.</strong>
              <ol style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                <li>On upload success, expect <code>{"{ jobId }"}</code></li>
                <li>Store jobId in component state</li>
                <li>Poll <code>/import-jobs/:jobId</code> every ~5 seconds</li>
                <li>Show progress using <code>progress</code>, <code>totalChunks</code>, <code>completedChunks</code></li>
                <li>On SUCCEEDED, refresh relevant views</li>
              </ol>
            </div>
          </SubSection>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: BKM-INT-001 | Category: Integrations & Data | Last Updated: February 2026
          </p>
        </footer>
      </div>
    </PageCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 600, color: "#111827" }}>{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "#374151" }}>{title}</h3>
      {children}
    </div>
  );
}

function Callout({ type, children }: { type: "info" | "warning" | "success"; children: React.ReactNode }) {
  const styles = {
    info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
    warning: { bg: "#fef3c7", border: "#fcd34d", color: "#92400e" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
  };
  const s = styles[type];
  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 6,
        fontSize: 13,
        color: s.color,
      }}
    >
      {children}
    </div>
  );
}

function FieldRow({ field, description }: { field: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <code style={{ fontWeight: 600, color: "#7c3aed", minWidth: 200 }}>{field}</code>
      <span style={{ color: "#4b5563" }}>{description}</span>
    </div>
  );
}

function StatusRow({ status, description }: { status: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <code style={{ fontWeight: 600, color: "#059669", minWidth: 140 }}>{status}</code>
      <span style={{ color: "#4b5563" }}>{description}</span>
    </div>
  );
}

function PetlStep({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6 }}>
      <span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#2563eb", color: "#fff", fontWeight: 700, borderRadius: 6 }}>
        {step}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#4b5563" }}>{description}</div>
      </div>
    </div>
  );
}

function BenefitCard({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ padding: 10, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#166534" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#4b5563" }}>{description}</div>
    </div>
  );
}
