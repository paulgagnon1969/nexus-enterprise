"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  const [progress, setProgress] = useState(0);

  const [componentsFile, setComponentsFile] = useState<File | null>(null);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentsResult, setComponentsResult] = useState<any>(null);
  const [componentsError, setComponentsError] = useState<string | null>(null);

  const isAnyLoading = loading || componentsLoading;

  const searchParams = useSearchParams();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    async function loadProjects() {
      try {
        const res = await fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data: Project[] = await res.json();
        setProjects(data);

        const fromQuery = searchParams.get("projectId");
        if (fromQuery && data.some(p => p.id === fromQuery)) {
          setProjectId(fromQuery);
        }
      } catch {
        // ignore for now
      }
    }

    loadProjects();
  }, [searchParams]);

  useEffect(() => {
    if (!isAnyLoading) return;

    // Start a gentle, time-based progress that tops out at ~85% until the
    // server finishes the import. This keeps the bar moving without
    // overshooting completion.
    setProgress(5);

    const id = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 85) return prev;
        return Math.min(prev + 4, 85);
      });
    }, 1000);

    return () => {
      window.clearInterval(id);
      // when loading ends, show completion
      setProgress(100);
    };
  }, [isAnyLoading]);

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
      setProgress(0);
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setError("Missing access token. Please login again.");
        return;
      }

      const form = new FormData();
      form.append("file", file);
      form.append("accessToken", token);

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

      // After a successful import, do a short poll of the estimate summary
      // so we can be confident PETL is available before redirecting.
      try {
        const maxAttempts = 10;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const summaryRes = await fetch(
            `${API_BASE}/projects/${projectId}/estimate-summary`,
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          );
          if (summaryRes.ok) {
            const summary: any = await summaryRes.json().catch(() => null);
            if (summary && typeof summary.itemCount === "number" && summary.itemCount > 0) {
              break;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch {
        // If summary polling fails, still continue to redirect; PETL may still be ready.
      }

      // Stop showing the loading overlay and move the user to the PETL list.
      setLoading(false);
      alert("Import complete. Opening PETL list for this project…");
      window.location.href = `/projects/${projectId}?tab=PETL`;
      return;
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleComponentsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setComponentsError(null);
    setComponentsResult(null);

    if (!projectId) {
      setComponentsError("Please choose a project first.");
      return;
    }

    if (!componentsFile) {
      setComponentsError("Please choose a components CSV file to upload.");
      return;
    }

    try {
      setComponentsLoading(true);
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setComponentsError("Missing access token. Please login again.");
        return;
      }

      const form = new FormData();
      form.append("file", componentsFile);
      form.append("accessToken", token);

      const res = await fetch(
        `/api/projects/${projectId}/import-xact-components`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        },
      );

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setComponentsError(
          `Components import failed: ${
            json ? JSON.stringify(json) : `${res.status} ${res.statusText}`
          }`,
        );
        return;
      }

      setComponentsResult(json);
    } catch (err: any) {
      setComponentsError(err.message ?? String(err));
    } finally {
      setComponentsLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 32,
        position: "relative",
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
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Import project CSVs</h1>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
          Upload your Xactimate exports to populate estimate data for an existing
          project.
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
          <span style={{ display: "block", marginBottom: 4 }}>
            Step 1 – Estimate line items CSV (RAW)
          </span>
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

        <hr style={{ marginTop: 20, marginBottom: 12, borderColor: "#e5e7eb" }} />

        <div
          style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}
        >
          <div style={{ fontWeight: 600 }}>Step 2 – Components CSV (optional but recommended)</div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            Import the Xactimate components CSV to break each task into precise
            materials, labor, and equipment components.
          </p>

          <label style={{ fontSize: 13 }}>
            <span style={{ display: "block", marginBottom: 4 }}>Components CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setComponentsFile(e.target.files?.[0] ?? null)}
              style={{ marginTop: 2, fontSize: 12 }}
            />
          </label>

          {componentsError && (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>{componentsError}</div>
          )}

          <button
            type="button"
            disabled={componentsLoading}
            style={{
              marginTop: 4,
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              backgroundColor: componentsLoading ? "#e5e7eb" : "#0f172a",
              color: componentsLoading ? "#4b5563" : "#f9fafb",
              fontSize: 13,
              fontWeight: 500,
              cursor: componentsLoading ? "default" : "pointer",
            }}
            onClick={e => {
              // Reuse the same handler but avoid nested form semantics
              void handleComponentsSubmit(e as any);
            }}
          >
            {componentsLoading ? "Importing components…" : "Upload components CSV"}
          </button>

          {componentsResult && (
            <pre
              style={{
                marginTop: 8,
                backgroundColor: "#111827",
                color: "#e5e7eb",
                padding: 12,
                borderRadius: 6,
                fontSize: 11,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {JSON.stringify(componentsResult, null, 2)}
            </pre>
          )}
        </div>
      </form>

      {isAnyLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <div
            className="app-card"
            style={{
              padding: 16,
              borderRadius: 8,
              maxWidth: 360,
              textAlign: "center",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Importing CSV…</div>
            <div style={{ color: "#6b7280", marginBottom: 4 }}>
              We’re processing your Xactimate file. This can take a little while for
              large projects.
            </div>
            <div
              style={{
                marginTop: 8,
                width: "100%",
                height: 8,
                borderRadius: 999,
                backgroundColor: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  backgroundColor: "#2563eb",
                  transition: "width 0.4s ease-out",
                }}
              />
            </div>
            <div style={{ color: "#9ca3af", marginTop: 4 }}>{progress}% complete (approximate)</div>
            <div style={{ color: "#9ca3af", marginTop: 2 }}>
              Please keep this tab open until the import finishes.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
