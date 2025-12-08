"use client";

import { FormEvent, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Project {
  id: string;
  name: string;
}

export default function ProjectImportPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    async function loadProjects() {
      try {
        const res = await fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        setProjects(data);
      } catch {
        // ignore for now
      }
    }

    loadProjects();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!projectId) {
      setError("Please choose a project to import into.");
      return;
    }

    if (!file) {
      setError("Please choose a CSV file to upload.");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setError("Missing access token. Please login again.");
        return;
      }

      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`/api/projects/${projectId}/import-xact`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          `Import failed: ${
            json ? JSON.stringify(json) : `${res.status} ${res.statusText}`
          }`
        );
        return;
      }

      setResult(json);
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 32
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="app-card"
        style={{
          width: 560,
          maxWidth: "100%",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          fontSize: 13
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Import project CSV</h1>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
          Upload an Xactimate-style CSV export to populate estimate data for an
          existing project.
        </p>

        <label style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ display: "block", marginBottom: 4 }}>Project</span>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              fontSize: 13
            }}
          >
            <option value="">Select a project…</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          <span style={{ display: "block", marginBottom: 4 }}>CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ marginTop: 2, fontSize: 12 }}
          />
        </label>

        {error && (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            backgroundColor: loading ? "#e5e7eb" : "#2563eb",
            color: loading ? "#4b5563" : "#f9fafb",
            fontSize: 13,
            fontWeight: 500,
            cursor: loading ? "default" : "pointer"
          }}
        >
          {loading ? "Importing…" : "Upload & import"}
        </button>

        {result && (
          <pre
            style={{
              marginTop: 8,
              backgroundColor: "#111827",
              color: "#e5e7eb",
              padding: 12,
              borderRadius: 6,
              fontSize: 11,
              maxHeight: 240,
              overflow: "auto"
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </form>
    </div>
  );
}
