"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../../../ui-shell";

export default function UiPerformanceBkmPage() {
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
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>BKM-TEC-001</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>UI Performance Standards</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            How we keep the NEXUS web UI fast and predictable.
          </p>
        </header>

        {/* Goals */}
        <Section title="Goals">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            <li>Keep interactions feeling instantaneous on modern hardware</li>
            <li>Avoid regressions as pages get more complex</li>
            <li>Make performance expectations part of normal development and review</li>
          </ul>
        </Section>

        {/* Baseline Standards */}
        <Section title="Baseline Standards">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <MetricCard
              title="Input Delay"
              target="< 50 ms"
              description="Time from user action (click, keypress) to JS handler running"
            />
            <MetricCard
              title="Normal Interaction"
              target="< 200–300 ms"
              description="Total click + render time for typical screens"
            />
            <MetricCard
              title="Heavy Data Views"
              target="< 400–500 ms"
              description="Large tables, logs—only when the view is opened"
            />
            <MetricCard
              title="Initial Page Render"
              target="< 1 second"
              description="First meaningful paint on a fast desktop"
            />
          </div>
        </Section>

        {/* Default Patterns */}
        <Section title="Default Patterns for Pages">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PatternCard
              number={1}
              title="Split Pages into Subcomponents"
              points={[
                "Top-level page owns routing, high-level state (active tab, filters), and data fetching",
                "Heavy visual sections (tables, logs, big cards) live in child components",
                "Child components use React.memo: const MySection = memo(function MySection(props) { ... })",
              ]}
            />
            <PatternCard
              number={2}
              title="Memoize Derived Values"
              points={[
                "Expensive array computations (reduce, flatMap, large map) go inside useMemo",
                "Only recompute when relevant input data changes",
                "Example: itemsWithComponents and totalComponents from componentsItems should use useMemo keyed on componentsItems",
              ]}
            />
            <PatternCard
              number={3}
              title="Keep State Local and Targeted"
              points={[
                "Page-level state: only things affecting multiple sections (active tab, filters, error banners)",
                "Section-specific state (inputs, toggles) lives in the child component",
                "Avoid one giant state object that forces everything to update",
              ]}
            />
            <PatternCard
              number={4}
              title="Lazy-Load Heavy Data"
              points={[
                "Load summaries at page load (counts, timestamps, small aggregates)",
                "Load full data only when user switches to relevant tab or scrolls into view",
                "Consider separate endpoints: GET /resource/summary (cheap) vs GET /resource/table (heavy)",
              ]}
            />
            <PatternCard
              number={5}
              title="Pagination and Windowing"
              points={[
                "Tables exceeding 1000+ rows: prefer server-side pagination",
                "At minimum, limit initial payload to 100–200 rows with controls for more",
                "Consider row virtualization for truly large lists (react-window)",
              ]}
            />
          </div>
        </Section>

        {/* Code Review Checklist */}
        <Section title="Code Review Checklist">
          <div style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Structure</h4>
            <ChecklistItem text="Complex pages are split into logical subcomponents (no 1,000-line pages)" />
            <ChecklistItem text="Heavy sections (tables, logs) wrapped in React.memo or clearly isolated" />

            <h4 style={{ margin: "16px 0 12px", fontSize: 14, fontWeight: 600 }}>Data & Rendering</h4>
            <ChecklistItem text="Expensive derived values use useMemo or live inside memoized children" />
            <ChecklistItem text="Props to heavy children are stable (no inline object/array literals every render)" />
            <ChecklistItem text="No over-fetching (not pulling huge payloads we don't show)" />

            <h4 style={{ margin: "16px 0 12px", fontSize: 14, fontWeight: 600 }}>Performance Check</h4>
            <ChecklistItem text="Chrome Performance recording taken for at least one critical interaction" />
            <ChecklistItem text="Input delay comfortably under 50 ms" />
            <ChecklistItem text="Interaction time within target range (or justified if not)" />
          </div>
        </Section>

        {/* Quick Performance Check */}
        <Section title="How to Run a Quick Performance Check">
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            <li>Open Chrome DevTools → Performance panel</li>
            <li>Navigate to the page you're testing</li>
            <li>Press the <strong>Record</strong> button</li>
            <li>
              Perform a single important interaction:
              <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                <li>Click a tab</li>
                <li>Apply a filter</li>
                <li>Open a heavy table</li>
              </ul>
            </li>
            <li>Stop recording</li>
            <li>
              Inspect the flame chart:
              <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                <li>Input delay for the click (should be well under 50 ms)</li>
                <li>Total duration until screen settles</li>
                <li>React commits associated with the interaction</li>
              </ul>
            </li>
          </ol>
          <div
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <strong>If slow:</strong> Identify the responsible component in the flame chart, then apply
            patterns above (split, memoize, lazy-load).
          </div>
        </Section>

        {/* Priority Pages */}
        <Section title="Priority Pages">
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#4b5563" }}>
            Apply these standards first to:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            <li><strong>High-traffic pages:</strong> Financial, Daily Logs, Main dashboards</li>
            <li><strong>Configuration surfaces:</strong> Company Settings, System admin screens</li>
            <li><strong>New pages</strong> rendering large tables or long historical logs</li>
          </ul>
        </Section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Document ID: BKM-TEC-001 | Category: Technical Standards | Last Updated: February 2026
          </p>
        </footer>
      </div>
    </PageCard>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, color: "#111827" }}>{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ title, target, description }: { title: string; target: string; description: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 12,
        backgroundColor: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 700, color: "#166534", minWidth: 100 }}>{target}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#4b5563" }}>{description}</div>
      </div>
    </div>
  );
}

function PatternCard({ number, title, points }: { number: number; title: string; points: string[] }) {
  return (
    <div style={{ borderLeft: "3px solid #2563eb", paddingLeft: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
        {number}. {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, fontSize: 13, color: "#374151" }}>
      <span style={{ color: "#9ca3af" }}>☐</span>
      <span>{text}</span>
    </div>
  );
}
