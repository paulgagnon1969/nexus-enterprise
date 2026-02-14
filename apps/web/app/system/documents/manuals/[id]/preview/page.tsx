"use client";

import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ManualInfo {
  id: string;
  title: string;
  currentVersion: number;
  status: string;
}

export default function ManualPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: manualId } = React.use(params);
  const router = useRouter();

  const [manualInfo, setManualInfo] = useState<ManualInfo | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Options
  const [includeToc, setIncludeToc] = useState(true);
  const [includeCover, setIncludeCover] = useState(true);
  const [includeRevisions, setIncludeRevisions] = useState(true);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
  };

  const loadManualInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load manual");
      const data = await res.json();
      setManualInfo({
        id: data.id,
        title: data.title,
        currentVersion: data.currentVersion,
        status: data.status,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load manual");
    }
  }, [manualId]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (!includeToc) queryParams.set("toc", "false");
      if (!includeCover) queryParams.set("cover", "false");
      if (!includeRevisions) queryParams.set("revisions", "false");

      const res = await fetch(
        `${API_BASE}/system/manuals/${manualId}/render?${queryParams.toString()}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) throw new Error("Failed to render manual");
      const html = await res.text();
      setHtmlContent(html);
    } catch (err: any) {
      setError(err?.message || "Failed to render manual");
    } finally {
      setLoading(false);
    }
  }, [manualId, includeToc, includeCover, includeRevisions]);

  useEffect(() => {
    loadManualInfo();
    loadPreview();
  }, [loadManualInfo, loadPreview]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/system/manuals/${manualId}/pdf`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate PDF");
      }

      // Get filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition");
      let filename = "manual.pdf";
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the PDF
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    // Open rendered HTML in a new window for printing
    const printWindow = window.open("", "_blank");
    if (printWindow && htmlContent) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, color: "#b91c1c" }}>Error</h1>
        <p style={{ color: "#6b7280" }}>{error}</p>
        <a href={`/system/documents/manuals/${manualId}`} style={{ color: "#2563eb" }}>
          ← Back to Editor
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#1f2937" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          backgroundColor: "#111827",
          borderBottom: "1px solid #374151",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a
            href={`/system/documents/manuals/${manualId}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#9ca3af",
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            <span>←</span> Back to Editor
          </a>
          <div style={{ width: 1, height: 24, backgroundColor: "#374151" }} />
          <div style={{ color: "#ffffff", fontSize: 15, fontWeight: 500 }}>
            {manualInfo?.title || "Manual Preview"}
            {manualInfo && (
              <span style={{ color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>
                v{manualInfo.currentVersion}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Options */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginRight: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => setIncludeCover(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              Cover
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeToc}
                onChange={(e) => setIncludeToc(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              TOC
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeRevisions}
                onChange={(e) => setIncludeRevisions(e.target.checked)}
                style={{ accentColor: "#3b82f6" }}
              />
              Revisions
            </label>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: "#374151",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 16 }}>🖨️</span> Print
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading || loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: downloading || loading ? "not-allowed" : "pointer",
              opacity: downloading || loading ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 16 }}>📥</span>
            {downloading ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>

      {/* Preview iframe/content */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", padding: 20 }}>
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                border: "3px solid #374151",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ marginTop: 12, fontSize: 14 }}>Rendering manual...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : htmlContent ? (
          <div
            style={{
              backgroundColor: "#ffffff",
              width: "100%",
              maxWidth: "8.5in",
              minHeight: "11in",
              boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <iframe
              srcDoc={htmlContent}
              style={{
                width: "100%",
                height: "100%",
                minHeight: "11in",
                border: "none",
              }}
              title="Manual Preview"
            />
          </div>
        ) : (
          <div style={{ color: "#9ca3af", textAlign: "center" }}>
            <p>No content to display</p>
          </div>
        )}
      </div>
    </div>
  );
}
