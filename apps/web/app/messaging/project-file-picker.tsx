"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface ProjectFileSummary {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string;
  createdAt: string;
}

export default function ProjectFilePicker({
  projectId,
  mode,
  onClose,
  onSelect,
}: {
  projectId: string;
  mode: "new" | "reply";
  onClose: () => void;
  onSelect: (file: ProjectFileSummary) => void;
}) {
  const [files, setFiles] = useState<ProjectFileSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/files${
            params.toString() ? `?${params.toString()}` : ""
          }`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) {
          throw new Error(`Failed to load project files (${res.status})`);
        }
        const json = await res.json();
        setFiles(Array.isArray(json) ? json : []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load project files");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [projectId, search]);

  return (
    <div
      className="app-card"
      style={{
        width: 360,
        maxWidth: "90vw",
        padding: 12,
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>
            Select file from project
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Attach an existing file to this {mode === "new" ? "new message" : "reply"}.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 14,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div style={{ marginBottom: 6 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search files by name..."
          style={{
            width: "100%",
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 12,
          }}
        />
      </div>

      {loading && <p style={{ fontSize: 11, color: "#6b7280" }}>Loading files…</p>}
      {error && <p style={{ fontSize: 11, color: "#b91c1c" }}>Error: {error}</p>}

      {files && files.length > 0 ? (
        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
          }}
        >
          {files.map(f => {
            const created = new Date(f.createdAt);
            const sizeLabel =
              typeof f.sizeBytes === "number" && f.sizeBytes >= 0
                ? `${(f.sizeBytes / 1024).toFixed(1)} KB`
                : "—";
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500 }}>{f.fileName}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {f.mimeType || "Unknown"} · {sizeLabel} · {created.toLocaleDateString()}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        !loading && !error && (
          <p style={{ fontSize: 11, color: "#6b7280" }}>
            No files found for this project yet.
          </p>
        )
      )}
    </div>
  );
}