import React from "react";

interface JobConsoleProps {
  status?: string | null;
  finishedAt?: string | null;
  updatedAt?: string | null;
  logs: string[];
  succeededLabel: string;
  failedLabel: string;
}

export function JobConsole({
  status,
  finishedAt,
  updatedAt,
  logs,
  succeededLabel,
  failedLabel,
}: JobConsoleProps) {
  return (
    <div style={{ marginTop: 8 }}>
      {status === "SUCCEEDED" && (
        <div
          style={{
            marginBottom: 6,
            padding: 8,
            borderRadius: 6,
            backgroundColor: "#ecfdf3",
            border: "1px solid #16a34a",
            color: "#166534",
          }}
        >
          {succeededLabel} Completed at {new Date((finishedAt ?? updatedAt) || Date.now()).toLocaleString()}.
        </div>
      )}
      {status === "FAILED" && (
        <div
          style={{
            marginBottom: 6,
            padding: 8,
            borderRadius: 6,
            backgroundColor: "#fef2f2",
            border: "1px solid #b91c1c",
            color: "#b91c1c",
          }}
        >
          {failedLabel} Completed at {new Date((finishedAt ?? updatedAt) || Date.now()).toLocaleString()}.
        </div>
      )}
      <div
        style={{
          marginTop: 4,
          padding: 8,
          borderRadius: 6,
          backgroundColor: " #020617",
          border: "1px solid #1f2937",
          color: "#e5e7eb",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: 11,
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {logs.length === 0 ? (
          <div>[{new Date().toString()}] Waiting for worker…</div>
        ) : (
          logs.map((line, idx) => <div key={idx}>{line}</div>)
        )}
      </div>
    </div>
  );
}