"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export function BiaImportWidget() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setJobId(null);

    if (!files || files.length === 0) {
      setError("Please choose one or more LCP CSV files to upload.");
      return;
    }

    try {
      setUploading(true);

      const token =
        typeof window !== "undefined"
          ? window.localStorage.getItem("accessToken")
          : null;
      if (!token) {
        setError("Missing access token. Please log in again.");
        return;
      }

      const form = new FormData();
      Array.from(files).forEach((file) => form.append("files", file));

      const res = await fetch(`${API_BASE}/import-jobs/bia-lcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          `BIA import failed: ${
            json ? JSON.stringify(json) : `${res.status} ${res.statusText}`
          }`,
        );
        return;
      }

      if (json?.jobId) {
        setJobId(String(json.jobId));
        setMessage(
          `BIA LCP import started as job ${json.jobId}. You can continue working while it processes.`,
        );
      } else {
        setMessage("BIA LCP import request submitted.");
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-wrap items-center gap-3 text-xs"
    >
      <label className="flex items-center gap-2">
        <span className="font-medium">Import BIA CSVs:</span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="text-xs"
        />
      </label>
      <button
        type="submit"
        disabled={uploading}
        className={
          "px-2 py-1 rounded border text-xs " +
          (uploading
            ? "bg-gray-200 text-gray-600 border-gray-300 cursor-default"
            : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800")
        }
      >
        {uploading ? "Uploading…" : "Upload & import"}
      </button>
      <span className="text-[11px] text-slate-500">
        API: <span className="font-mono">{API_BASE}</span>
      </span>
      {jobId && (
        <span className="text-[11px] text-slate-600">
          Job: <span className="font-mono">{jobId}</span>
        </span>
      )}
      {message && !jobId && (
        <span className="text-[11px] text-green-700">{message}</span>
      )}
      {error && (
        <span className="text-[11px] text-red-600 whitespace-pre-line">
          {error}
        </span>
      )}
    </form>
  );
}
