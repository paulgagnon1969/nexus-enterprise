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

interface TocEntry {
  id: string;
  type: "chapter" | "document";
  title: string;
  level: number;
  anchor: string;
  revisionNo?: number;
  includeInPrint?: boolean;
  children?: TocEntry[];
}

export default function TenantManualPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: manualId } = React.use(params);
  const router = useRouter();

  const [manualInfo, setManualInfo] = useState<ManualInfo | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [showTocPanel, setShowTocPanel] = useState(false);

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
      const res = await fetch(`${API_BASE}/manuals/${manualId}`, {
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

  const loadToc = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/toc`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setToc(data);
      }
    } catch {
      // Ignore TOC load errors
    }
  }, [manualId]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (!includeToc) queryParams.set("toc", "false");
      if (!includeCover) queryParams.set("cover", "false");
      if (!includeRevisions) queryParams.set("revisions", "false");
      queryParams.set("baseUrl", window.location.origin);

      const res = await fetch(
        `${API_BASE}/manuals/${manualId}/render?${queryParams.toString()}`,
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
    loadToc();
    loadPreview();
  }, [loadManualInfo, loadToc, loadPreview]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/manuals/${manualId}/pdf`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate PDF");
      }

      const disposition = res.headers.get("Content-Disposition");
      let filename = "manual.pdf";
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

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
        <button
          onClick={() => router.push("/documents/manuals")}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Back to Manuals
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1f2937" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          background: "#111827",
          borderBottom: "1px solid #374151",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => router.push(`/documents/manuals`)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              background: "#374151",
              color: "#d1d5db",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, color: "#ffffff" }}>
              {manualInfo?.title || "Loading..."}
            </h1>
            {manualInfo && (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                Version {manualInfo.currentVersion} • {manualInfo.status}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Options */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginRight: 8 }}>
            <button
              type="button"
              onClick={() => setShowTocPanel(!showTocPanel)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 13,
                backgroundColor: showTocPanel ? "#4b5563" : "#374151",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 14 }}>📑</span> Sections
            </button>
            <div style={{ width: 1, height: 20, backgroundColor: "#4b5563" }} />
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
            onClick={handlePrint}
            disabled={loading || !htmlContent}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "#374151",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            🖨️ Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={loading || downloading}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: loading || downloading ? "not-allowed" : "pointer",
              opacity: loading || downloading ? 0.7 : 1,
            }}
          >
            {downloading ? "Generating..." : "📥 Download PDF"}
          </button>
        </div>
      </div>

      {/* Main content area with optional TOC panel */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* TOC Section Panel */}
        {showTocPanel && (
          <div
            style={{
              width: 320,
              backgroundColor: "#1f2937",
              borderRight: "1px solid #374151",
              overflow: "auto",
              padding: 16,
              flexShrink: 0,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ffffff" }}>Sections</h3>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
                Document sections in this manual
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {toc.map((entry) => (
                <TocEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* Preview iframe/content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", justifyContent: "center", padding: "8px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
              Loading preview...
            </div>
          ) : htmlContent ? (
            <div
              style={{
                width: "100%",
                maxWidth: 850,
                height: "100%",
                background: "#ffffff",
                borderRadius: 4,
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              <iframe
                srcDoc={htmlContent}
                style={{
                  width: "100%",
                  height: "100%",
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
    </div>
  );
}

// --- TOC Entry Row Component (read-only for tenants) ---

function TocEntryRow({ entry }: { entry: TocEntry }) {
  const isDocument = entry.type === "document";

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          backgroundColor: entry.level === 1 ? "#374151" : "#2d3748",
          borderRadius: 4,
          marginLeft: entry.level === 2 ? 16 : 0,
        }}
      >
        <span style={{ width: 16, fontSize: 12 }}>{isDocument ? "📄" : "📁"}</span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            color: "#e5e7eb",
            fontWeight: entry.level === 1 ? 500 : 400,
          }}
        >
          {entry.title}
        </span>
      </div>
      {entry.children?.map((child) => (
        <TocEntryRow key={child.id} entry={child} />
      ))}
    </>
  );
}
