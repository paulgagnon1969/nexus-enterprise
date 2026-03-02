import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ConversionResult {
  html: string;
  title: string;
  word_count: number;
  has_images: boolean;
  image_count: number;
  original_format: string;
  error: string | null;
}

interface PreviewPanelProps {
  document: {
    id: string;
    file_path: string;
    file_name: string;
    file_type: string | null;
    status: string;
  };
  onClose: () => void;
  onUpload: (html: string, metadata: { title: string; category: string }) => void;
  onMarkImport: () => void;
  onMarkIgnore: () => void;
  onIgnoreFolder: (folderPath: string) => void;
  onImportFolder: (folderPath: string) => void;
}

export function PreviewPanel({ document, onClose, onUpload, onMarkImport, onMarkIgnore, onIgnoreFolder, onImportFolder }: PreviewPanelProps) {
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [isConverting, setIsConverting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [viewMode, setViewMode] = useState<"html" | "original">("original");

  useEffect(() => {
    convertDocument();
    // Auto-open in native app when preview opens
    openInNativeApp();
  }, [document.file_path]);

  const convertDocument = async () => {
    setIsConverting(true);
    setError(null);

    try {
      const result = await invoke<ConversionResult>("convert_document", {
        filePath: document.file_path,
      });
      setConversion(result);
      setTitle(result.title || document.file_name.replace(/\.[^/.]+$/, ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConverting(false);
    }
  };

  const handleUpload = async () => {
    if (!conversion || !title.trim() || !category) return;

    setIsUploading(true);
    try {
      await onUpload(conversion.html, { title: title.trim(), category });
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (html: string) => {
    const bytes = new Blob([html]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const openInNativeApp = async () => {
    try {
      await invoke("open_file_native", { path: document.file_path });
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  const getAppName = (fileType: string | null) => {
    const apps: Record<string, string> = {
      pdf: "Preview",
      doc: "Word",
      docx: "Word",
      xls: "Excel",
      xlsx: "Excel",
      ppt: "PowerPoint",
      pptx: "PowerPoint",
      txt: "TextEdit",
      md: "TextEdit",
      jpg: "Preview",
      jpeg: "Preview",
      png: "Preview",
      gif: "Preview",
    };
    return apps[fileType?.toLowerCase() || ""] || "Default App";
  };

  const wrapInDocumentTemplate = (htmlContent: string, docTitle: string) => {
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const categoryLabel = category || 'Uncategorized';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      margin: 0.75in;
      size: letter;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1e293b;
      margin: 0;
      padding: 20px;
      background: #fff;
    }
    .document-container {
      max-width: 8.5in;
      margin: 0 auto;
      background: white;
    }
    .document-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      border-bottom: 3px solid #0ea5e9;
      margin-bottom: 24px;
    }
    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 20px;
    }
    .company-name {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .company-tagline {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .doc-meta {
      text-align: right;
      font-size: 9pt;
      color: #64748b;
    }
    .doc-meta .category {
      display: inline-block;
      background: #e0f2fe;
      color: #0369a1;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 500;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .document-title {
      font-size: 22pt;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 24px 0;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .document-content {
      min-height: 400px;
    }
    .document-content h1 { font-size: 18pt; margin: 24px 0 12px; color: #0f172a; }
    .document-content h2 { font-size: 14pt; margin: 20px 0 10px; color: #1e293b; }
    .document-content h3 { font-size: 12pt; margin: 16px 0 8px; color: #334155; }
    .document-content p { margin: 0 0 12px; }
    .document-content ul, .document-content ol { margin: 0 0 12px; padding-left: 24px; }
    .document-content li { margin-bottom: 4px; }
    .document-content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .document-content th, .document-content td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    .document-content th { background: #f8fafc; font-weight: 600; }
    .document-content img { max-width: 100%; height: auto; }
    .document-content blockquote { border-left: 3px solid #0ea5e9; margin: 12px 0; padding-left: 16px; color: #475569; }
    .document-content code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 10pt; }
    .document-content pre { background: #f8fafc; padding: 12px; border-radius: 6px; overflow-x: auto; }
    .document-footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #94a3b8;
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .footer-logo {
      width: 16px;
      height: 16px;
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 8px;
    }
    @media print {
      body { padding: 0; }
      .document-container { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="document-container">
    <header class="document-header">
      <div class="logo-section">
        <div class="logo">N</div>
        <div>
          <div class="company-name">NEXUS</div>
          <div class="company-tagline">Document Management System</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="category">${categoryLabel}</div>
        <div>${today}</div>
      </div>
    </header>
    
    <h1 class="document-title">${docTitle}</h1>
    
    <div class="document-content">
      ${htmlContent}
    </div>
    
    <footer class="document-footer">
      <div class="footer-left">
        <div class="footer-logo">N</div>
        <span>NEXUS Document • Confidential</span>
      </div>
      <div>Generated ${today}</div>
    </footer>
  </div>
</body>
</html>
    `;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Preview: {document.file_name}
            </h2>
            <p className="text-sm text-slate-500">
              Convert to HTML and upload to Nexus
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Preview Pane */}
          <div className="flex-1 flex flex-col border-r border-slate-200">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              {/* View Toggle */}
              <div className="flex items-center gap-1 bg-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("html")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "html"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  HTML Preview
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("original")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "original"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Original
                </button>
              </div>
              {conversion && viewMode === "html" && (
                <span className="text-xs text-slate-400">
                  {formatSize(conversion.html)} • {conversion.word_count} words
                  {conversion.image_count > 0 && ` • ${conversion.image_count} images`}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4 bg-white">
              {viewMode === "html" ? (
                // HTML Preview Mode
                isConverting ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-nexus-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-slate-500">Converting document...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-md">
                      <div className="text-4xl mb-4">⚠️</div>
                      <h3 className="text-lg font-medium text-red-700 mb-2">Conversion Failed</h3>
                      <p className="text-sm text-red-600">{error}</p>
                      <button
                        type="button"
                        onClick={convertDocument}
                        className="mt-4 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
              ) : conversion ? (
                  <iframe
                    srcDoc={wrapInDocumentTemplate(conversion.html, title || document.file_name)}
                    title="Preview"
                    className="w-full h-full border border-slate-200 rounded-lg"
                    sandbox="allow-same-origin"
                  />
                ) : null
              ) : (
                // Original Document Mode
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <div className="text-6xl mb-4">
                      {document.file_type === "pdf" ? "📕" :
                       document.file_type === "docx" || document.file_type === "doc" ? "📘" :
                       document.file_type === "xlsx" || document.file_type === "xls" ? "📗" :
                       document.file_type === "pptx" || document.file_type === "ppt" ? "📙" :
                       "📄"}
                    </div>
                    <h3 className="text-lg font-medium text-slate-700 mb-2">
                      {document.file_name}
                    </h3>
                    <p className="text-sm text-slate-500 mb-1">
                      {document.file_type?.toUpperCase()} Document
                    </p>
                    <p className="text-xs text-nexus-700 font-medium mb-4 break-all">
                      {document.file_path}
                    </p>
                    {/* Folder path for ignore option */}
                    <p className="text-xs text-slate-500 mb-6">
                      Folder: <span className="text-nexus-600 font-medium">{document.file_path.substring(0, document.file_path.lastIndexOf('/'))}</span>
                    </p>
                    <button
                      type="button"
                      onClick={openInNativeApp}
                      className="px-6 py-3 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 inline-flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in {getAppName(document.file_type)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metadata Pane */}
          <div className="w-80 flex flex-col bg-slate-50">
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
              <span className="text-sm font-medium text-slate-600">Document Metadata</span>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Conversion Info */}
              {conversion && (
                <div className="bg-white rounded-lg border border-slate-200 p-3">
                  <h4 className="text-xs font-medium text-slate-500 uppercase mb-2">
                    Conversion Info
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Original Format:</span>
                      <span className="text-slate-700">.{conversion.original_format}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Word Count:</span>
                      <span className="text-slate-700">{conversion.word_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Images:</span>
                      <span className="text-slate-700">{conversion.image_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">HTML Size:</span>
                      <span className="text-slate-700">{formatSize(conversion.html)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
                  placeholder="Enter document title"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
                >
                  <option value="">Select category...</option>
                  <option value="procedures">Procedures</option>
                  <option value="policies">Policies</option>
                  <option value="forms">Forms</option>
                  <option value="training">Training Materials</option>
                  <option value="safety">Safety Documents</option>
                  <option value="reference">Reference Documents</option>
                </select>
              </div>

              {/* Benefits Note */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h4 className="text-xs font-medium text-green-800 uppercase mb-1">
                  ✓ Skinny Document
                </h4>
                <p className="text-xs text-green-700">
                  This document has been converted to HTML. Only the lightweight HTML 
                  will be uploaded, saving bandwidth and storage.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-200 bg-white space-y-2">
              {/* Show Upload button only for IMPORT status */}
              {document.status === "IMPORT" && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!conversion || !title.trim() || !category || isUploading}
                  className="w-full py-2 px-4 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      <span>Upload to Nexus</span>
                    </>
                  )}
                </button>
              )}
              
              {/* Status action buttons */}
              <div className="flex gap-2">
                {document.status !== "IMPORT" && (
                  <button
                    type="button"
                    onClick={onMarkImport}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-1"
                  >
                    <span>✓</span>
                    <span>Import</span>
                  </button>
                )}
                {document.status !== "IGNORE" && (
                  <button
                    type="button"
                    onClick={onMarkIgnore}
                    className="flex-1 py-2 px-4 bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-600 flex items-center justify-center gap-1"
                  >
                    <span>✕</span>
                    <span>Ignore</span>
                  </button>
                )}
              </div>
              
              {/* Folder action buttons */}
              <div className="flex gap-2">
                {document.status !== "IMPORT" && (
                  <button
                    type="button"
                    onClick={() => {
                      const folderPath = document.file_path.substring(0, document.file_path.lastIndexOf('/'));
                      if (confirm(`Import ALL documents in this folder?\n\n${folderPath}`)) {
                        onImportFolder(folderPath);
                      }
                    }}
                    className="flex-1 py-2 px-3 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 flex items-center justify-center gap-1"
                  >
                    <span>📁</span>
                    <span>Import Folder</span>
                  </button>
                )}
                {document.status !== "IGNORE" && (
                  <button
                    type="button"
                    onClick={() => {
                      const folderPath = document.file_path.substring(0, document.file_path.lastIndexOf('/'));
                      if (confirm(`Ignore ALL documents in this folder?\n\n${folderPath}`)) {
                        onIgnoreFolder(folderPath);
                      }
                    }}
                    className="flex-1 py-2 px-3 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center justify-center gap-1"
                  >
                    <span>📁</span>
                    <span>Ignore Folder</span>
                  </button>
                )}
              </div>
              
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
