import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { PreviewPanel } from "./PreviewPanel";
import { UploadQueue } from "./UploadQueue";
import { getStoredToken, getApiUrl } from "../../lib/auth";

interface IndexedDocument {
  id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number;
  breadcrumb: string[];
  status: string;
  scanned_at: string;
}

interface DocumentStats {
  total: number;
  pending: number;
  import: number;
  ignore: number;
  uploaded: number;
  failed: number;
}

interface ScanResult {
  documents_found: number;
  documents_new: number;
  documents_updated: number;
}

type StatusFilter = "ALL" | "ACTIVE" | "PENDING" | "IMPORT" | "IGNORE" | "UPLOADED";

interface UploadResult {
  success: boolean;
  document_id: string;
  nexus_doc_id: string | null;
  error: string | null;
}

export function DocumentsTab() {
  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [previewDoc, setPreviewDoc] = useState<IndexedDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await invoke<IndexedDocument[]>("get_indexed_documents");
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await invoke<DocumentStats>("get_document_stats");
      setStats(s);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    loadStats();
  }, [loadDocuments, loadStats]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select folder to scan",
      });

      if (selected && typeof selected === "string") {
        setIsScanning(true);
        setError(null);
        setScanResult(null);

        const result = await invoke<ScanResult>("scan_folder", { path: selected });
        setScanResult(result);
        await loadDocuments();
        await loadStats();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleUpdateStatus = async (ids: string[], status: string) => {
    try {
      await invoke("bulk_update_document_status", { ids, status });
      await loadDocuments();
      await loadStats();
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpload = async (
    docId: string,
    html: string,
    metadata: { title: string; category: string }
  ) => {
    const token = getStoredToken();
    const apiUrl = getApiUrl();

    if (!token) {
      setError("Not authenticated. Please log in via Contacts tab first.");
      return;
    }

    try {
      setIsUploading(true);
      await invoke("set_upload_total", { total: 1 });
      await invoke("reset_upload_queue");

      // Get the document to find original format
      const doc = documents.find((d) => d.id === docId);
      const originalFormat = doc?.file_type || "unknown";

      // Count words in HTML (strip tags, count words)
      const textContent = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = textContent ? textContent.split(" ").length : 0;

      const result = await invoke<UploadResult>("upload_document", {
        apiUrl,
        token,
        documentId: docId,
        htmlContent: html,
        title: metadata.title,
        category: metadata.category,
        originalFormat,
        wordCount,
      });

      if (result.success) {
        await invoke("update_document_status", {
          id: docId,
          status: "UPLOADED",
          errorMessage: null,
        });
      } else {
        await invoke("update_document_status", {
          id: docId,
          status: "FAILED",
          errorMessage: result.error || "Upload failed",
        });
        setError(result.error || "Upload failed");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      await invoke("update_document_status", {
        id: docId,
        status: "FAILED",
        errorMessage: errorMsg,
      });
    } finally {
      setIsUploading(false);
      await loadDocuments();
      await loadStats();
      setPreviewDoc(null);
    }
  };

  const handleUploadComplete = useCallback(async () => {
    setIsUploading(false);
    await loadDocuments();
    await loadStats();
  }, [loadDocuments, loadStats]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredDocuments.map((d) => d.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    // ACTIVE = all except IGNORE
    if (statusFilter === "ACTIVE" && doc.status === "IGNORE") return false;
    // Specific status filter
    if (statusFilter !== "ALL" && statusFilter !== "ACTIVE" && doc.status !== statusFilter) return false;
    // Search filter
    if (search && !doc.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      PENDING: { bg: "bg-amber-100", text: "text-amber-700", label: "Pending" },
      IMPORT: { bg: "bg-blue-100", text: "text-blue-700", label: "Import" },
      IGNORE: { bg: "bg-slate-100", text: "text-slate-500", label: "Ignore" },
      UPLOADED: { bg: "bg-green-100", text: "text-green-700", label: "Uploaded" },
      FAILED: { bg: "bg-red-100", text: "text-red-700", label: "Failed" },
    };
    const c = config[status] || config.PENDING;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  const getFileIcon = (type: string | null) => {
    const icons: Record<string, string> = {
      pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗",
      ppt: "📙", pptx: "📙", txt: "📄", md: "📝", csv: "📊",
      jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️",
    };
    return icons[type?.toLowerCase() || ""] || "📄";
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header & Actions */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Document Scanner</h2>
            <p className="text-sm text-slate-500">
              Scan folders, curate documents, and upload to Nexus.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBrowse}
            disabled={isScanning}
            className="px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <span>📁</span>
                <span>Scan Folder</span>
              </>
            )}
          </button>
        </div>

        {/* Scan result banner */}
        {scanResult && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            ✓ Found {scanResult.documents_found} documents, {scanResult.documents_new} added to index
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Upload Queue Progress */}
      <UploadQueue isUploading={isUploading} onComplete={handleUploadComplete} />

      {/* Stats Bar */}
      {stats && stats.total > 0 && (
        <div className="flex gap-3 text-sm">
          <div className="flex-1 bg-white rounded-lg p-3 border border-slate-200 text-center">
            <div className="text-xl font-semibold text-slate-900">{stats.total}</div>
            <div className="text-slate-500">Total</div>
          </div>
          <div className="flex-1 bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
            <div className="text-xl font-semibold text-amber-700">{stats.pending}</div>
            <div className="text-amber-600">Pending</div>
          </div>
          <div className="flex-1 bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
            <div className="text-xl font-semibold text-blue-700">{stats.import}</div>
            <div className="text-blue-600">Import</div>
          </div>
          <div className="flex-1 bg-slate-100 rounded-lg p-3 border border-slate-200 text-center">
            <div className="text-xl font-semibold text-slate-600">{stats.ignore}</div>
            <div className="text-slate-500">Ignore</div>
          </div>
          <div className="flex-1 bg-green-50 rounded-lg p-3 border border-green-200 text-center">
            <div className="text-xl font-semibold text-green-700">{stats.uploaded}</div>
            <div className="text-green-600">Uploaded</div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      {documents.length > 0 && (
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="ACTIVE">Active (excl. Ignored)</option>
            <option value="ALL">All Documents</option>
            <option value="PENDING">Pending</option>
            <option value="IMPORT">Import</option>
            <option value="IGNORE">Ignored</option>
            <option value="UPLOADED">Uploaded</option>
          </select>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-sm font-medium text-amber-800">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() => handleUpdateStatus(Array.from(selectedIds), "IMPORT")}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Mark for Import
          </button>
          <button
            type="button"
            onClick={() => handleUpdateStatus(Array.from(selectedIds), "IGNORE")}
            className="px-3 py-1 text-xs bg-slate-500 text-white rounded-md hover:bg-slate-600"
          >
            Mark Ignore
          </button>
          <button
            type="button"
            onClick={async () => {
              // Get unique folder paths from selected documents
              const selectedDocs = documents.filter(d => selectedIds.has(d.id));
              const folders = [...new Set(selectedDocs.map(d => 
                d.file_path.substring(0, d.file_path.lastIndexOf('/'))
              ))];
              
              if (confirm(`Import ALL documents in ${folders.length} folder(s)?\n\n${folders.join('\n')}`)) {
                for (const folder of folders) {
                  try {
                    await invoke("import_folder", { folderPath: folder });
                  } catch (err) {
                    console.error("Failed to import folder:", folder, err);
                  }
                }
                await loadDocuments();
                await loadStats();
                setSelectedIds(new Set());
              }
            }}
            className="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            📁 Import Folder(s)
          </button>
          <button
            type="button"
            onClick={async () => {
              // Get unique folder paths from selected documents
              const selectedDocs = documents.filter(d => selectedIds.has(d.id));
              const folders = [...new Set(selectedDocs.map(d => 
                d.file_path.substring(0, d.file_path.lastIndexOf('/'))
              ))];
              
              if (confirm(`Ignore ALL documents in ${folders.length} folder(s)?\n\n${folders.join('\n')}`)) {
                for (const folder of folders) {
                  try {
                    await invoke("ignore_folder", { folderPath: folder });
                  } catch (err) {
                    console.error("Failed to ignore folder:", folder, err);
                  }
                }
                await loadDocuments();
                await loadStats();
                setSelectedIds(new Set());
              }
            }}
            className="px-3 py-1 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600"
          >
            📁 Ignore Folder(s)
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="px-3 py-1 text-xs text-amber-700 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-5xl mb-4">📂</div>
            <h3 className="text-lg font-medium text-slate-700 mb-2">No Documents Indexed</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Click "Scan Folder" to index documents from your computer.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          {/* Select All */}
          <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
              onChange={() =>
                selectedIds.size === filteredDocuments.length ? deselectAll() : selectAllFiltered()
              }
              className="w-4 h-4"
            />
            <span className="text-xs text-slate-500">
              {filteredDocuments.length} documents
            </span>
          </div>

          {/* Document List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className={`flex items-center gap-2 px-4 py-3 hover:bg-slate-50 ${
                  selectedIds.has(doc.id) ? "bg-blue-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(doc.id)}
                  onChange={() => toggleSelect(doc.id)}
                  className="w-4 h-4 flex-shrink-0"
                />
                {/* Eye icon for preview - always visible unless uploaded */}
                {doc.status !== "UPLOADED" ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewDoc(doc);
                    }}
                    className="p-1 text-slate-400 hover:text-nexus-600 hover:bg-nexus-50 rounded transition-colors flex-shrink-0"
                    title="Preview document"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                ) : (
                  <div className="w-6 flex-shrink-0" /> /* Spacer for uploaded docs */
                )}
                <span className="text-xl flex-shrink-0">{getFileIcon(doc.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">
                      {doc.file_name}
                    </span>
                    {getStatusBadge(doc.status)}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {doc.breadcrumb.join(" / ")}
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex-shrink-0">{formatSize(doc.file_size)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Panel */}
      {previewDoc && (
        <PreviewPanel
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onUpload={(html, metadata) => handleUpload(previewDoc.id, html, metadata)}
          onMarkImport={async () => {
            console.log("[DEBUG] Marking document for import:", previewDoc.id);
            try {
              await handleUpdateStatus([previewDoc.id], "IMPORT");
              console.log("[DEBUG] Import status update complete");
            } catch (err) {
              console.error("[DEBUG] Import failed:", err);
            }
            setPreviewDoc(null);
          }}
          onMarkIgnore={async () => {
            console.log("[DEBUG] Marking document for ignore:", previewDoc.id);
            try {
              await handleUpdateStatus([previewDoc.id], "IGNORE");
              console.log("[DEBUG] Ignore status update complete");
            } catch (err) {
              console.error("[DEBUG] Ignore failed:", err);
            }
            setPreviewDoc(null);
          }}
          onIgnoreFolder={async (folderPath) => {
            console.log("[DEBUG] Ignoring folder:", folderPath);
            try {
              const count = await invoke<number>("ignore_folder", { folderPath });
              console.log(`[DEBUG] Ignored ${count} documents in folder`);
              await loadDocuments();
              await loadStats();
            } catch (err) {
              console.error("[DEBUG] Ignore folder failed:", err);
              setError(err instanceof Error ? err.message : String(err));
            }
            setPreviewDoc(null);
          }}
          onImportFolder={async (folderPath) => {
            console.log("[DEBUG] Importing folder:", folderPath);
            try {
              const count = await invoke<number>("import_folder", { folderPath });
              console.log(`[DEBUG] Imported ${count} documents in folder`);
              await loadDocuments();
              await loadStats();
            } catch (err) {
              console.error("[DEBUG] Import folder failed:", err);
              setError(err instanceof Error ? err.message : String(err));
            }
            setPreviewDoc(null);
          }}
        />
      )}
    </div>
  );
}
