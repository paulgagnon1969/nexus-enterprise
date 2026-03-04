import { useState, useEffect, useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile, stat } from "@tauri-apps/plugin-fs";
import { listAssets, uploadAssetAttachment, offerRental, withdrawRental } from "../../lib/api";
import type { AssetListItem } from "../../lib/api";
import {
  matchFolder,
  categorizeFile,
  getMimeType,
  formatBytes,
  isExcludedExtension,
  CATEGORY_CONFIG,
} from "../../lib/asset-matcher";
import type { AssetRecord, MatchResult, MatchType, AttachmentCategory } from "../../lib/asset-matcher";

// ── Types ──────────────────────────────────────────────────────────

interface ScannedFile {
  name: string;
  path: string;
  size: number;
  category: AttachmentCategory;
  excluded: boolean; // auto-excluded by size or extension
  excludeReason: string | null;
}

interface ScannedFolder {
  name: string;
  path: string;
  files: ScannedFile[];
  totalSize: number;
  match: MatchResult;
  /** User override: manually assigned asset */
  manualAssetId: string | null;
}

interface SyncProgress {
  phase: "uploading" | "done";
  total: number;
  uploaded: number;
  failed: number;
  currentFile: string;
  errors: string[];
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_SIZE_LIMIT_MB = 50;

const MATCH_BADGE: Record<MatchType, { bg: string; text: string; label: string }> = {
  vin: { bg: "bg-green-100", text: "text-green-700", label: "VIN Match" },
  "name-exact": { bg: "bg-blue-100", text: "text-blue-700", label: "Name Match" },
  "name-fuzzy": { bg: "bg-amber-100", text: "text-amber-700", label: "Fuzzy Match" },
  unmatched: { bg: "bg-slate-100", text: "text-slate-500", label: "Unmatched" },
};

type OwnershipView = "COMPANY" | "PERSONAL";

// ── Personal Assets Sub-view ──────────────────────────────────────

function PersonalAssetsView({
  assets,
  loading,
  onRefresh,
}: {
  assets: AssetListItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [rentalLoading, setRentalLoading] = useState<string | null>(null);

  const handleToggleRental = async (asset: AssetListItem) => {
    setRentalLoading(asset.id);
    try {
      const isOffered = (asset as any).availableForRent;
      if (isOffered) {
        await withdrawRental(asset.id);
      } else {
        await offerRental(asset.id);
      }
      onRefresh();
    } catch (err) {
      console.error("Rental toggle failed:", err);
    } finally {
      setRentalLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-sm text-slate-400">
        <div className="w-4 h-4 border-2 border-nexus-200 border-t-nexus-600 rounded-full animate-spin" />
        Loading personal assets…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {assets.length} personal asset{assets.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Asset cards */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-4xl">📦</div>
          <p className="text-sm text-slate-500">No personal assets yet.</p>
          <p className="text-xs text-slate-400 max-w-sm">
            Use the Company Assets scanner to sync company-owned equipment, or create personal assets from the Nexus web app to track your own tools and equipment.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {assets.map((asset) => {
            const isOffered = (asset as any).availableForRent;
            const isRentalLoading = rentalLoading === asset.id;

            return (
              <div
                key={asset.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">
                  {asset.assetType === "VEHICLE" ? "🚗" : asset.assetType === "EQUIPMENT" ? "🔧" : "📦"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{asset.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[asset.manufacturer, asset.model, asset.year].filter(Boolean).join(" ") || asset.assetType}
                    {asset.serialNumberOrVin && ` · ${asset.serialNumberOrVin}`}
                  </p>
                </div>

                {/* Disposition badge */}
                {asset.disposition && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: asset.disposition.color + "20", color: asset.disposition.color }}
                  >
                    {asset.disposition.label}
                  </span>
                )}

                {/* Rental toggle */}
                <button
                  onClick={() => handleToggleRental(asset)}
                  disabled={isRentalLoading}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isOffered
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } disabled:opacity-50`}
                >
                  {isRentalLoading ? "…" : isOffered ? "🤝 Offered" : "Offer for Rent"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function AssetsTab() {
  // Ownership view toggle
  const [ownershipView, setOwnershipView] = useState<OwnershipView>("COMPANY");

  // Assets from API
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [personalAssets, setPersonalAssets] = useState<AssetListItem[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [personalLoading, setPersonalLoading] = useState(false);

  // Scan state
  const [folders, setFolders] = useState<ScannedFolder[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanRoot, setScanRoot] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set()); // file paths
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [sizeLimitMb, setSizeLimitMb] = useState(DEFAULT_SIZE_LIMIT_MB);
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [search, setSearch] = useState("");

  // Sync state
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // ── Load assets from API ───────────────────────────────────────

  const loadCompanyAssets = useCallback(async () => {
    try {
      const list = await listAssets("COMPANY");
      setAssets(list);
    } catch (err) {
      console.error("Failed to load company assets:", err);
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  const loadPersonalAssets = useCallback(async () => {
    setPersonalLoading(true);
    try {
      const list = await listAssets("PERSONAL");
      setPersonalAssets(list);
    } catch (err) {
      console.error("Failed to load personal assets:", err);
    } finally {
      setPersonalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanyAssets();
  }, [loadCompanyAssets]);

  useEffect(() => {
    if (ownershipView === "PERSONAL") loadPersonalAssets();
  }, [ownershipView, loadPersonalAssets]);

  // ── Recursive directory walk ───────────────────────────────────

  const walkDirectory = useCallback(
    async (rootPath: string): Promise<ScannedFolder[]> => {
      const assetRecords: AssetRecord[] = assets.map((a) => ({
        id: a.id,
        name: a.name,
        serialNumberOrVin: a.serialNumberOrVin,
        code: a.code,
      }));

      const sizeLimitBytes = sizeLimitMb * 1024 * 1024;
      const topEntries = await readDir(rootPath);
      const result: ScannedFolder[] = [];

      for (const entry of topEntries) {
        if (!entry.isDirectory || entry.name.startsWith(".")) continue;
        // Skip ### archive folders
        if (entry.name.startsWith("###")) continue;

        const folderPath = `${rootPath}/${entry.name}`;
        const files: ScannedFile[] = [];

        // Recursive file collector
        const collectFiles = async (dirPath: string) => {
          let entries;
          try {
            entries = await readDir(dirPath);
          } catch {
            return; // skip unreadable dirs
          }
          for (const e of entries) {
            if (e.name.startsWith(".") || e.name === "Icon\r") continue;
            const fullPath = `${dirPath}/${e.name}`;
            if (e.isDirectory) {
              await collectFiles(fullPath);
            } else {
              let size = 0;
              try {
                const s = await stat(fullPath);
                size = s.size;
              } catch {
                /* skip */
              }

              const category = categorizeFile(e.name);
              const extExcluded = isExcludedExtension(e.name);
              const sizeExcluded = size > sizeLimitBytes;
              const excluded = extExcluded || sizeExcluded;
              const excludeReason = extExcluded
                ? "Binary/app file"
                : sizeExcluded
                  ? `Over ${sizeLimitMb} MB limit`
                  : null;

              files.push({
                name: e.name,
                path: fullPath,
                size,
                category,
                excluded,
                excludeReason,
              });
            }
          }
        };

        await collectFiles(folderPath);
        if (files.length === 0) continue;

        const totalSize = files.reduce((s, f) => s + f.size, 0);
        const match = matchFolder(entry.name, assetRecords);

        result.push({
          name: entry.name,
          path: folderPath,
          files,
          totalSize,
          match,
          manualAssetId: null,
        });
      }

      return result;
    },
    [assets, sizeLimitMb],
  );

  // ── Scan handler ───────────────────────────────────────────────

  const handleScan = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select asset folder root to scan",
      });

      if (!selected || typeof selected !== "string") return;

      setIsScanning(true);
      setScanError(null);
      setScanRoot(selected);

      const scanned = await walkDirectory(selected);

      // Sort: matched first, then by name
      scanned.sort((a, b) => {
        const aMatched = a.match.matchType !== "unmatched" ? 0 : 1;
        const bMatched = b.match.matchType !== "unmatched" ? 0 : 1;
        if (aMatched !== bMatched) return aMatched - bMatched;
        return a.name.localeCompare(b.name);
      });

      setFolders(scanned);

      // Pre-select non-excluded files in matched folders
      const preSelected = new Set<string>();
      for (const folder of scanned) {
        if (folder.match.matchType !== "unmatched") {
          for (const file of folder.files) {
            if (!file.excluded) {
              preSelected.add(file.path);
            }
          }
        }
      }
      setSelectedFiles(preSelected);
      setCollapsedFolders(new Set());
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsScanning(false);
    }
  };

  // ── Selection helpers ──────────────────────────────────────────

  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFolder = (folder: ScannedFolder) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      const nonExcluded = folder.files.filter((f) => !f.excluded);
      const allSelected = nonExcluded.every((f) => next.has(f.path));
      for (const f of nonExcluded) {
        if (allSelected) next.delete(f.path);
        else next.add(f.path);
      }
      return next;
    });
  };

  const toggleCollapse = (path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    for (const f of filteredFolders) {
      if (getEffectiveAssetId(f)) {
        for (const file of f.files) {
          if (!file.excluded) all.add(file.path);
        }
      }
    }
    setSelectedFiles(all);
  };

  const deselectAll = () => setSelectedFiles(new Set());

  // ── Manual asset assignment ────────────────────────────────────

  const assignAsset = (folderPath: string, assetId: string | null) => {
    setFolders((prev) =>
      prev.map((f) =>
        f.path === folderPath ? { ...f, manualAssetId: assetId } : f,
      ),
    );
  };

  const getEffectiveAssetId = (folder: ScannedFolder): string | null =>
    folder.manualAssetId || folder.match.assetId;

  // ── Filtering ──────────────────────────────────────────────────

  const filteredFolders = useMemo(() => {
    let list = folders;
    if (showUnmatchedOnly) {
      list = list.filter((f) => f.match.matchType === "unmatched" && !f.manualAssetId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.match.assetName?.toLowerCase().includes(q) ||
          f.match.assetCode?.toLowerCase().includes(q) ||
          f.files.some((file) => file.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [folders, showUnmatchedOnly, search]);

  // ── Summary stats ──────────────────────────────────────────────

  const summary = useMemo(() => {
    let fileCount = 0;
    let totalBytes = 0;
    const assetIds = new Set<string>();
    for (const folder of folders) {
      for (const file of folder.files) {
        if (selectedFiles.has(file.path)) {
          const aid = getEffectiveAssetId(folder);
          if (aid) {
            fileCount++;
            totalBytes += file.size;
            assetIds.add(aid);
          }
        }
      }
    }
    return { fileCount, totalBytes, assetCount: assetIds.size };
  }, [folders, selectedFiles]);

  const matchSummary = useMemo(() => {
    const counts = { vin: 0, "name-exact": 0, "name-fuzzy": 0, unmatched: 0, manual: 0 };
    for (const f of folders) {
      if (f.manualAssetId) counts.manual++;
      else counts[f.match.matchType]++;
    }
    return counts;
  }, [folders]);

  // ── Sync / Upload ──────────────────────────────────────────────

  const handleSync = async () => {
    // Build upload queue: file → assetId
    const queue: { file: ScannedFile; assetId: string; folderName: string }[] = [];
    for (const folder of folders) {
      const aid = getEffectiveAssetId(folder);
      if (!aid) continue;
      for (const file of folder.files) {
        if (selectedFiles.has(file.path)) {
          queue.push({ file, assetId: aid, folderName: folder.name });
        }
      }
    }

    if (queue.length === 0) return;

    setSyncProgress({
      phase: "uploading",
      total: queue.length,
      uploaded: 0,
      failed: 0,
      currentFile: queue[0].file.name,
      errors: [],
    });

    let uploaded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of queue) {
      try {
        setSyncProgress((prev) =>
          prev ? { ...prev, currentFile: item.file.name } : prev,
        );

        const bytes = await readFile(item.file.path);
        const mime = getMimeType(item.file.name);
        const category = categorizeFile(item.file.name);

        await uploadAssetAttachment(item.assetId, bytes, item.file.name, mime, category);

        uploaded++;
        setSyncProgress((prev) =>
          prev ? { ...prev, uploaded: prev.uploaded + 1 } : prev,
        );
      } catch (err: any) {
        failed++;
        const msg = `${item.file.name}: ${err.message || err}`;
        errors.push(msg);
        setSyncProgress((prev) =>
          prev
            ? { ...prev, failed: prev.failed + 1, errors: [...prev.errors, msg] }
            : prev,
        );
      }
    }

    setSyncProgress((prev) =>
      prev ? { ...prev, phase: "done", currentFile: "" } : prev,
    );
  };

  // ── Render helpers ─────────────────────────────────────────────

  const fileIcon = (name: string) => {
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const icons: Record<string, string> = {
      pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗",
      jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", webp: "🖼️", heic: "🖼️",
      mov: "🎬", mp4: "🎬", txt: "📄", csv: "📊", eml: "✉️", zip: "📦",
    };
    return icons[ext] || "📄";
  };

  // ── Ownership toggle (rendered at top of every view) ───────────

  const ownershipToggle = (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 shrink-0">
      {(["COMPANY", "PERSONAL"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setOwnershipView(v)}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
            ownershipView === v
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {v === "COMPANY" ? "🏢 Company Assets" : "👤 My Assets"}
        </button>
      ))}
    </div>
  );

  // ── Personal assets view ──────────────────────────────────────

  if (ownershipView === "PERSONAL") {
    return (
      <div className="h-full flex flex-col space-y-3 overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          {ownershipToggle}
        </div>
        <PersonalAssetsView
          assets={personalAssets}
          loading={personalLoading}
          onRefresh={loadPersonalAssets}
        />
      </div>
    );
  }

  // ── Empty state (company assets / scanner) ────────────────────

  if (folders.length === 0 && !isScanning) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="mb-4">{ownershipToggle}</div>
        <div className="text-5xl">🗂️</div>
        <h2 className="text-lg font-semibold text-slate-900">Asset Folder Scanner</h2>
        <p className="text-sm text-slate-500 text-center max-w-md">
          Scan a local drive folder to discover asset documents, match them to
          your Nexus assets, and sync selected files.
        </p>
        {assetsLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-nexus-200 border-t-nexus-600 rounded-full animate-spin" />
            Loading assets…
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            {assets.length} assets loaded from Nexus
          </div>
        )}
        <button
          type="button"
          onClick={handleScan}
          disabled={assetsLoading}
          className="px-6 py-2.5 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          📁 Scan Folder
        </button>
        {scanError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-md">
            {scanError}
          </div>
        )}
      </div>
    );
  }

  // ── Main layout (company scanner) ─────────────────────────────

  return (
    <div className="h-full flex flex-col space-y-3 overflow-hidden">
      {/* Ownership toggle */}
      <div className="shrink-0">{ownershipToggle}</div>

      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Asset Folder Scanner</h2>
            <p className="text-sm text-slate-500">
              {scanRoot && (
                <span className="font-mono text-xs">{scanRoot}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || !!syncProgress}
              className="px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning…
                </>
              ) : (
                <>📁 Re-scan</>
              )}
            </button>
          </div>
        </div>

        {/* Match summary chips */}
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
            {folders.length} folders
          </span>
          {matchSummary.vin > 0 && (
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">
              {matchSummary.vin} VIN
            </span>
          )}
          {matchSummary["name-exact"] > 0 && (
            <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
              {matchSummary["name-exact"]} exact
            </span>
          )}
          {matchSummary["name-fuzzy"] > 0 && (
            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              {matchSummary["name-fuzzy"]} fuzzy
            </span>
          )}
          {matchSummary.manual > 0 && (
            <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700">
              {matchSummary.manual} manual
            </span>
          )}
          {matchSummary.unmatched > 0 && (
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500">
              {matchSummary.unmatched} unmatched
            </span>
          )}
        </div>
      </div>

      {/* Sync Progress */}
      {syncProgress && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {syncProgress.phase !== "done" && (
                <div className="w-4 h-4 border-2 border-nexus-600 border-t-transparent rounded-full animate-spin" />
              )}
              <span className="font-medium text-slate-900">
                {syncProgress.phase === "done"
                  ? `✓ Sync complete — ${syncProgress.uploaded} uploaded${syncProgress.failed > 0 ? `, ${syncProgress.failed} failed` : ""}`
                  : `Uploading: ${syncProgress.currentFile}`}
              </span>
            </div>
            <span className="text-sm text-slate-500">
              {syncProgress.uploaded + syncProgress.failed} / {syncProgress.total}
            </span>
          </div>
          <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-300"
              style={{ width: `${(syncProgress.uploaded / syncProgress.total) * 100}%` }}
            />
            {syncProgress.failed > 0 && (
              <div
                className="absolute top-0 h-full bg-red-400 transition-all duration-300"
                style={{
                  left: `${(syncProgress.uploaded / syncProgress.total) * 100}%`,
                  width: `${(syncProgress.failed / syncProgress.total) * 100}%`,
                }}
              />
            )}
          </div>
          {syncProgress.errors.length > 0 && (
            <details className="text-xs text-red-600">
              <summary className="cursor-pointer">{syncProgress.errors.length} errors</summary>
              <ul className="mt-1 space-y-0.5 max-h-24 overflow-auto">
                {syncProgress.errors.map((e, i) => (
                  <li key={i} className="font-mono">{e}</li>
                ))}
              </ul>
            </details>
          )}
          {syncProgress.phase === "done" && (
            <button
              type="button"
              onClick={() => setSyncProgress(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Controls bar */}
      <div className="flex gap-2 items-center shrink-0">
        <input
          type="text"
          placeholder="Search folders or files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={showUnmatchedOnly}
            onChange={(e) => setShowUnmatchedOnly(e.target.checked)}
            className="rounded"
          />
          Unmatched only
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
          Max
          <input
            type="number"
            value={sizeLimitMb}
            onChange={(e) => setSizeLimitMb(Number(e.target.value) || 50)}
            className="w-14 px-1.5 py-1 border border-slate-300 rounded text-xs text-center"
            min={1}
          />
          MB
        </label>
      </div>

      {/* Selection actions */}
      {summary.fileCount > 0 && (
        <div className="flex items-center gap-3 p-3 bg-nexus-50 border border-nexus-200 rounded-lg shrink-0">
          <span className="text-sm font-medium text-nexus-800">
            {summary.fileCount} files selected ({formatBytes(summary.totalBytes)}) across {summary.assetCount} assets
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-nexus-600 hover:text-nexus-800"
          >
            Select all matched
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={!!syncProgress && syncProgress.phase !== "done"}
            className="px-4 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
          >
            {syncProgress && syncProgress.phase !== "done" ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Syncing…
              </>
            ) : (
              <>⬆ Sync Selected</>
            )}
          </button>
        </div>
      )}

      {/* Folder tree */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        {filteredFolders.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-slate-400">
            {search || showUnmatchedOnly ? "No folders match filters" : "No folders found"}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredFolders.map((folder) => {
              const collapsed = collapsedFolders.has(folder.path);
              const effectiveAssetId = getEffectiveAssetId(folder);
              const nonExcluded = folder.files.filter((f) => !f.excluded);
              const allSelected = nonExcluded.length > 0 && nonExcluded.every((f) => selectedFiles.has(f.path));
              const someSelected = nonExcluded.some((f) => selectedFiles.has(f.path));
              const selectedCount = folder.files.filter((f) => selectedFiles.has(f.path)).length;
              const badge = MATCH_BADGE[folder.manualAssetId ? "name-exact" : folder.match.matchType];

              return (
                <div key={folder.path}>
                  {/* Folder row */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer ${
                      !effectiveAssetId ? "bg-slate-50/50" : ""
                    }`}
                    onClick={() => toggleCollapse(folder.path)}
                  >
                    {/* Folder checkbox */}
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleFolder(folder);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded shrink-0"
                      disabled={!effectiveAssetId}
                    />

                    {/* Expand/collapse icon */}
                    <span className="text-xs text-slate-400 w-4 text-center shrink-0">
                      {collapsed ? "▶" : "▼"}
                    </span>

                    {/* Folder name */}
                    <span className="text-sm font-medium text-slate-900 truncate min-w-0">
                      📁 {folder.name}
                    </span>

                    {/* Match badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${badge.bg} ${badge.text}`}
                    >
                      {folder.manualAssetId ? "Manual" : badge.label}
                      {folder.match.confidence > 0 && folder.match.confidence < 100 && !folder.manualAssetId
                        ? ` ${Math.round(folder.match.confidence)}%`
                        : ""}
                    </span>

                    {/* Matched asset name */}
                    {effectiveAssetId && (
                      <span className="text-xs text-slate-500 truncate min-w-0">
                        → {folder.manualAssetId
                          ? assets.find((a) => a.id === folder.manualAssetId)?.name
                          : folder.match.assetName}
                        {" "}
                        <span className="text-slate-400">
                          ({folder.manualAssetId
                            ? assets.find((a) => a.id === folder.manualAssetId)?.code
                            : folder.match.assetCode})
                        </span>
                      </span>
                    )}

                    {/* Unmatched: asset dropdown */}
                    {!effectiveAssetId && (
                      <select
                        value=""
                        onChange={(e) => {
                          e.stopPropagation();
                          assignAsset(folder.path, e.target.value || null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white max-w-[200px]"
                      >
                        <option value="">Assign asset…</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.code})
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="flex-1" />

                    {/* Stats */}
                    <span className="text-xs text-slate-400 shrink-0">
                      {selectedCount > 0 && (
                        <span className="text-nexus-600 font-medium mr-2">{selectedCount} sel</span>
                      )}
                      {folder.files.length} files · {formatBytes(folder.totalSize)}
                    </span>
                  </div>

                  {/* File list (collapsed) */}
                  {!collapsed && (
                    <div className="pl-10 pr-3 pb-2 space-y-0.5">
                      {folder.files.map((file) => {
                        const selected = selectedFiles.has(file.path);
                        const catConfig = CATEGORY_CONFIG[file.category];

                        return (
                          <div
                            key={file.path}
                            className={`flex items-center gap-2 py-1 px-2 rounded text-xs ${
                              file.excluded
                                ? "opacity-40"
                                : selected
                                  ? "bg-nexus-50/50"
                                  : "hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleFile(file.path)}
                              className="rounded shrink-0"
                              disabled={!effectiveAssetId}
                            />
                            <span className="shrink-0">{fileIcon(file.name)}</span>
                            <span className="truncate text-slate-700 min-w-0">{file.name}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${catConfig.color}`}
                            >
                              {catConfig.label}
                            </span>
                            {file.excluded && file.excludeReason && (
                              <span className="text-[10px] text-red-400 shrink-0">
                                ⚠ {file.excludeReason}
                              </span>
                            )}
                            <div className="flex-1" />
                            <span className="text-slate-400 shrink-0">{formatBytes(file.size)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
