"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Project {
  id: string;
  name: string;
}

function ProjectImportPageInner() {
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

  // Async import job tracking (local dev / worker mode)
  const [rawJobId, setRawJobId] = useState<string | null>(null);
  const [rawJob, setRawJob] = useState<any>(null);
  const [componentsJobId, setComponentsJobId] = useState<string | null>(null);
  const [componentsJob, setComponentsJob] = useState<any>(null);

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

    // This progress bar represents *upload + request time*, not the async import job.
    // The job progress is shown separately once we receive a jobId.
    setProgress(5);

    const id = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 85) return prev;
        return Math.min(prev + 4, 85);
      });
    }, 1000);

    return () => {
      window.clearInterval(id);
      setProgress(100);
    };
  }, [isAnyLoading]);

  useEffect(() => {
    if (!rawJobId) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let done = false;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/import-jobs/${rawJobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        setRawJob(json);
        if (json?.status === "SUCCEEDED" || json?.status === "FAILED") {
          done = true;
        }
      } catch {
        // ignore
      }
    }

    void poll();
    const id = window.setInterval(() => {
      if (done) return;
      void poll();
    }, 1500);

    return () => {
      window.clearInterval(id);
      done = true;
    };
  }, [rawJobId]);

  useEffect(() => {
    if (!componentsJobId) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    let done = false;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/import-jobs/${componentsJobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        setComponentsJob(json);
        if (json?.status === "SUCCEEDED" || json?.status === "FAILED") {
          done = true;
        }
      } catch {
        // ignore
      }
    }

    void poll();
    const id = window.setInterval(() => {
      if (done) return;
      void poll();
    }, 1500);

    return () => {
      window.clearInterval(id);
      done = true;
    };
  }, [componentsJobId]);

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

      // If the backend enqueued an async import job, start polling status and
      // allow the user to keep using the app while it runs.
      if (json?.jobId) {
        setRawJobId(String(json.jobId));
        setLoading(false);
        return;
      }

      // Legacy synchronous behavior: redirect to PETL once import finishes.
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

      if (json?.jobId) {
        setComponentsJobId(String(json.jobId));
      }
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

        {rawJobId && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              RAW import job: {rawJobId}
            </div>
            <div style={{ color: "#6b7280", marginBottom: 6 }}>
              Status: {rawJob?.status ?? "…"} · Progress: {rawJob?.progress ?? 0}%
              {rawJob?.message ? ` · ${rawJob.message}` : ""}
            </div>
            <div
              style={{
                width: "100%",
                height: 8,
                borderRadius: 999,
                backgroundColor: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${rawJob?.progress ?? 0}%`,
                  height: "100%",
                  backgroundColor:
                    rawJob?.status === "FAILED" ? "#ef4444" : "#2563eb",
                  transition: "width 0.4s ease-out",
                }}
              />
            </div>
          </div>
        )}

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

          {componentsJobId && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Components import job: {componentsJobId}
              </div>
              <div style={{ color: "#6b7280", marginBottom: 6 }}>
                Status: {componentsJob?.status ?? "…"} · Progress: {componentsJob?.progress ?? 0}%
                {componentsJob?.message ? ` · ${componentsJob.message}` : ""}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${componentsJob?.progress ?? 0}%`,
                    height: "100%",
                    backgroundColor:
                      componentsJob?.status === "FAILED" ? "#ef4444" : "#0f172a",
                    transition: "width 0.4s ease-out",
                  }}
                />
              </div>
            </div>
          )}

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
            <div style={{ color: "#9ca3af", marginTop: 4 }}>{progress}% complete (upload)</div>
            <div style={{ color: "#9ca3af", marginTop: 2 }}>
              You can keep working once the upload finishes; processing runs in the background.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading project import…</div>}>
      <ProjectImportPageInner />
    </Suspense>
  );
}
