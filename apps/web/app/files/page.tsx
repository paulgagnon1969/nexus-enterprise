"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ProjectFileDto {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string;
  createdAt: string;
}

export default function FilesPage() {
  const [files, setFiles] = useState<ProjectFileDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    const projectId = window.sessionStorage.getItem("nexusActiveProjectId");
    if (!token || !projectId) {
      // No active project context; just show an empty state.
      return;
    }

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
  }, [search]);

  return (
    <PageCard>
      <h2 style={{ marginTop: 0 }}>Project files</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
        Files uploaded from Daily Logs and other uploads for your currently selected project.
      </p>

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search files by name..."
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 13,
          }}
        />
      </div>

      {loading && <p style={{ fontSize: 13, color: "#6b7280" }}>Loading files…</p>}
      {error && <p style={{ fontSize: 13, color: "#b91c1c" }}>Error: {error}</p>}

      {!loading && !error && (!files || files.length === 0) && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          No project files found. Upload attachments from Daily Logs or other tools, and
          they&apos;ll appear here.
        </p>
      )}

      {files && files.length > 0 && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "6px 8px",
              backgroundColor: "#f9fafb",
              fontWeight: 500,
            }}
          >
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Uploaded</span>
          </div>
          {files.map(f => {
            const created = new Date(f.createdAt);
            const sizeLabel =
              typeof f.sizeBytes === "number" && f.sizeBytes >= 0
                ? `${(f.sizeBytes / 1024).toFixed(1)} KB`
                : "—";
            return (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "6px 8px",
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <span>
                  <a
                    href={f.storageUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#2563eb", textDecoration: "none" }}
                  >
                    {f.fileName}
                  </a>
                </span>
                <span>{f.mimeType || "Unknown"}</span>
                <span>{sizeLabel}</span>
                <span>{created.toLocaleDateString()}</span>
              </div>
            );
          })}
        </div>
      )}
    </PageCard>
  );
}
