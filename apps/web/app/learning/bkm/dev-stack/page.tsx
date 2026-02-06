"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function DevStackBkmPage() {
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
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>BKM-NCC-002</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Dev Stack & Environment Guide</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            How to start and manage local development environments for NEXUS Connect.
          </p>
        </header>

        {/* Quick Reference */}
        <QuickDecisionTable />

        {/* Overview */}
        <Section title="Overview of Development Scripts">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151" }}>
            NEXUS has three main startup scripts. Each connects to a different database and serves different use cases.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ScriptCard
              name="start-dev-clear_ALL.sh"
              location="Repository root ./"
              database="Local Docker Postgres"
              purpose="Hard reset + full local dev restart (most aggressive)"
              resetBehavior="Yes – kills everything"
            />
            <ScriptCard
              name="scripts/dev-start.sh"
              location="./scripts/"
              database="Local Docker Postgres"
              purpose="Standard / recommended local development"
              resetBehavior="No – gentle restart"
            />
            <ScriptCard
              name="scripts/dev-start-cloud.sh"
              location="./scripts/"
              database="Cloud SQL dev (nexusdev-v2)"
              purpose="Prod-like testing, shared dev data, migration validation"
              resetBehavior="No – gentle restart"
            />
          </div>
        </Section>

        {/* Script 1: Hard Reset */}
        <Section title="1. start-dev-clear_ALL.sh — Hard Reset & Local Dev">
          <div style={{ padding: 12, backgroundColor: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, marginBottom: 12 }}>
            <strong>Location:</strong> <code>./start-dev-clear_ALL.sh</code>
          </div>
          
          <SubSection title="What it does">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Kills processes on ports: <code>3000</code>, <code>8000</code>, <code>5432</code>, <code>6380</code></li>
              <li>Stops any running <code>next dev</code>, <code>ts-node-dev</code>, etc.</li>
              <li>Stops Docker containers (<code>docker compose down</code>)</li>
              <li>Then calls <code>scripts/dev-start.sh</code> → starts clean local Docker stack</li>
            </ul>
          </SubSection>

          <SubSection title="Use when">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Dev environment feels stuck / ports are blocked</li>
              <li>You want a completely fresh local start</li>
              <li>You explicitly want <strong>local Docker database</strong> (not Cloud SQL)</li>
            </ul>
          </SubSection>

          <SubSection title="Resulting database">
            <CodeBlock>postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db</CodeBlock>
          </SubSection>
        </Section>

        {/* Script 2: Local Docker (Golden Path) */}
        <Section title="2. scripts/dev-start.sh — Local Docker Development (Golden Path)">
          <div style={{ padding: 12, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, marginBottom: 12 }}>
            <strong>Location:</strong> <code>./scripts/dev-start.sh</code> &nbsp;|&nbsp; <strong>Database:</strong> Local Postgres + Redis in Docker
          </div>

          <SubSection title="Key characteristics">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Completely isolated from team/shared environments</li>
              <li>Easy to destroy/recreate database</li>
              <li>Fast & reliable for local heavy workloads (CSV imports, file processing, experiments)</li>
              <li>No internet/GCP dependency</li>
            </ul>
          </SubSection>

          <SubSection title="Components started">
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <ComponentRow service="Postgres container" port="5433" />
              <ComponentRow service="Redis container" port="6380" />
              <ComponentRow service="API dev server" port="8000" note="npm run dev in apps/api" />
              <ComponentRow service="API worker / BullMQ" port="—" note="npm run worker:dev" />
              <ComponentRow service="Next.js web app" port="3001" note="npm run dev in apps/web" />
            </div>
          </SubSection>

          <SubSection title="Recommended daily command">
            <CodeBlock>./scripts/dev-start.sh{"\n"}# or full reset version:{"\n"}./start-dev-clear_ALL.sh</CodeBlock>
          </SubSection>
        </Section>

        {/* Script 3: Cloud SQL */}
        <Section title="3. scripts/dev-start-cloud.sh — Cloud SQL Development (Prod-Like)">
          <div style={{ padding: 12, backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, marginBottom: 12 }}>
            <strong>Location:</strong> <code>./scripts/dev-start-cloud.sh</code> &nbsp;|&nbsp; <strong>Database:</strong> Cloud SQL dev instance <code>nexusdev-v2</code>
          </div>

          <SubSection title="Key characteristics">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Behaves most like production (Postgres version, Cloud SQL behavior)</li>
              <li>Uses real shared dev dataset → great for reproducing team issues</li>
              <li>Ideal for testing migrations, multi-user flows, real data scenarios</li>
            </ul>
          </SubSection>

          <SubSection title="Requirements">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li><code>DEV_DB_PASSWORD</code> environment variable set</li>
              <li><code>cloud-sql-proxy</code> installed and in PATH</li>
              <li>Correct GCP project context (usually auto-detected)</li>
            </ul>
          </SubSection>

          <SubSection title="Safety guardrail">
            <Callout type="warning">
              Script refuses to run if it detects production instance name (<code>nexusprod-v2</code>)
            </Callout>
          </SubSection>

          <SubSection title="Use cases">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>Pre-release validation</li>
              <li>Debugging issues only visible on shared dev data</li>
              <li>Testing schema changes / migrations safely before prod</li>
            </ul>
          </SubSection>
        </Section>

        {/* Docker Compose */}
        <Section title="Docker Compose Infrastructure">
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#374151" }}>
            The local stack uses <code>infra/docker/docker-compose.yml</code>:
          </p>

          <SubSection title="Services">
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <ServiceCard
                name="postgres"
                image="postgres:16"
                port="5433:5432"
                env="POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB"
              />
              <ServiceCard
                name="redis"
                image="redis:7"
                port="6380:6379"
                env="—"
              />
            </div>
          </SubSection>

          <SubSection title="Common commands">
            <CodeBlock>
              {`# Start local Postgres and Redis
docker compose -f infra/docker/docker-compose.yml up -d

# Stop local infra
docker compose -f infra/docker/docker-compose.yml down

# View logs
docker compose -f infra/docker/docker-compose.yml logs -f`}
            </CodeBlock>
          </SubSection>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: BKM-NCC-002 | Category: NEXUS 101 — Core Operations | Last Updated: February 2026
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

function QuickDecisionTable() {
  const rows = [
    { situation: "Normal daily coding & feature development", script: "scripts/dev-start.sh", db: "Local Docker" },
    { situation: "Environment is broken / ports blocked", script: "./start-dev-clear_ALL.sh", db: "Local Docker" },
    { situation: "Need real shared dev data", script: "scripts/dev-start-cloud.sh", db: "Cloud SQL dev" },
    { situation: "Testing migrations or prod-like behavior", script: "scripts/dev-start-cloud.sh", db: "Cloud SQL dev" },
    { situation: "Doing dangerous experiments / bulk imports", script: "scripts/dev-start.sh", db: "Local Docker" },
    { situation: "Offline / on airplane", script: "scripts/dev-start.sh", db: "Local Docker" },
  ];

  return (
    <div style={{ padding: 14, backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "#166534" }}>Quick Reference — Which Script Should I Use?</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
            <span style={{ flex: 2, color: "#374151" }}>{row.situation}</span>
            <code style={{ flex: 1, color: "#059669", fontSize: 12 }}>{row.script}</code>
            <span style={{ flex: 1, color: "#6b7280", fontSize: 12 }}>{row.db}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScriptCard({ name, location, database, purpose, resetBehavior }: {
  name: string; location: string; database: string; purpose: string; resetBehavior: string;
}) {
  return (
    <div style={{ padding: 12, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 6 }}>{name}</div>
      <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <div><span style={{ color: "#6b7280" }}>Location:</span> <code>{location}</code></div>
        <div><span style={{ color: "#6b7280" }}>Database:</span> {database}</div>
        <div><span style={{ color: "#6b7280" }}>Purpose:</span> {purpose}</div>
        <div><span style={{ color: "#6b7280" }}>Reset:</span> {resetBehavior}</div>
      </div>
    </div>
  );
}

function ComponentRow({ service, port, note }: { service: string; port: string; note?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}>
      <span style={{ flex: 1, fontWeight: 500, color: "#111827" }}>{service}</span>
      <code style={{ minWidth: 60, color: "#059669" }}>{port}</code>
      {note && <span style={{ color: "#6b7280", fontSize: 12 }}>{note}</span>}
    </div>
  );
}

function ServiceCard({ name, image, port, env }: { name: string; image: string; port: string; env: string }) {
  return (
    <div style={{ padding: 10, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{name}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
        Image: <code>{image}</code> | Port: <code>{port}</code> | Env: {env}
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      margin: "8px 0 0",
      padding: 12,
      backgroundColor: "#1f2937",
      color: "#e5e7eb",
      borderRadius: 6,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      overflowX: "auto",
      whiteSpace: "pre-wrap",
    }}>
      {children}
    </pre>
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
    <div style={{
      marginTop: 8,
      padding: 10,
      backgroundColor: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 6,
      fontSize: 13,
      color: s.color,
    }}>
      {children}
    </div>
  );
}
