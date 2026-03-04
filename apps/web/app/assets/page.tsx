"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type AssetType = "EQUIPMENT" | "TOOL" | "RENTAL";
type MeterType = "HOURS" | "MILES" | "RUN_CYCLES" | "GENERATOR_HOURS";
type OwnershipType = "COMPANY" | "PERSONAL";
type SharingVisibility = "PRIVATE" | "COMPANY" | "CUSTOM";
type OwnershipFilter = "ALL" | "COMPANY" | "PERSONAL" | "MY_ASSETS";

interface DispositionRef { id: string; code: string; label: string; color: string; isTerminal: boolean }
interface TagRef { id: string; label: string; color: string }

interface UserRef { id: string; email: string; firstName: string | null; lastName: string | null }
interface PoolRef { id: string; name: string; members?: { user: UserRef }[] }

interface Asset {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  assetType: AssetType;
  baseUnit: string | null;
  baseRate: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumberOrVin: string | null;
  year: number | null;
  isActive: boolean;
  isTrackable: boolean;
  isConsumable: boolean;
  ownershipType: OwnershipType;
  ownerId: string | null;
  owner?: UserRef | null;
  sharingVisibility: SharingVisibility;
  maintenanceAssigneeId: string | null;
  maintenanceAssignee?: UserRef | null;
  maintenancePoolId: string | null;
  maintenancePool?: PoolRef | null;
  shareGrants?: { grantedTo: UserRef }[];
  disposition?: DispositionRef | null;
  dispositionId?: string | null;
  tagAssignments?: { tag: TagRef }[];
  currentLocation?: { id: string; name: string; type: string } | null;
  createdAt: string;
  updatedAt: string;
  // Detail fields (from GET :id)
  usages?: any[];
  transactions?: any[];
  meterReadings?: any[];
  maintenanceTodos?: any[];
  attachments?: Attachment[];
}

type AttachmentCategory = "PHOTO" | "TITLE" | "INSURANCE" | "MANUAL" | "RECEIPT" | "DIAGNOSTIC" | "CONTRACT" | "WARRANTY" | "SCHEMATIC" | "OTHER";
interface Attachment {
  id: string;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  category: AttachmentCategory;
  notes: string | null;
  uploadedBy?: UserRef | null;
  createdAt: string;
}

interface CostSummary {
  assetId: string;
  totalHours: number;
  totalCost: number;
  transactionCount: number;
  projectBreakdown: { projectId: string; projectName: string; hours: number; cost: number }[];
}

type Tab = "LIST" | "DETAIL" | "CREATE";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export default function AssetsPage() {
  const [tab, setTab] = useState<Tab>("LIST");
  const [, startTransition] = useTransition();

  // ── List state ────────────────────────────────────────────────────────
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<AssetType | "">("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");
  const [search, setSearch] = useState("");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [dispositions, setDispositions] = useState<DispositionRef[]>([]);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [filterDisposition, setFilterDisposition] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // Company users & maintenance pools (for dropdowns)
  const [companyUsers, setCompanyUsers] = useState<UserRef[]>([]);
  const [pools, setPools] = useState<PoolRef[]>([]);

  // ── Detail state ──────────────────────────────────────────────────────
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Create/Edit state ─────────────────────────────────────────────────
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<AssetType>("EQUIPMENT");
  const [formBaseUnit, setFormBaseUnit] = useState("HR");
  const [formBaseRate, setFormBaseRate] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formYear, setFormYear] = useState("");
  const [formTrackable, setFormTrackable] = useState(true);
  const [formOwnership, setFormOwnership] = useState<OwnershipType>("COMPANY");
  const [formSharingVisibility, setFormSharingVisibility] = useState<SharingVisibility>("COMPANY");
  const [formMaintenanceAssigneeId, setFormMaintenanceAssigneeId] = useState("");
  const [formMaintenancePoolId, setFormMaintenancePoolId] = useState("");
  const [formDispositionId, setFormDispositionId] = useState("");
  const [formTagIds, setFormTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Attachment upload state ──────────────────────────────────────────
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachCategory, setAttachCategory] = useState<AttachmentCategory>("OTHER");

  // ── CSV Upload state ───────────────────────────────────────────────
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  // ── Load assets ───────────────────────────────────────────────────────
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("assetType", filterType);
      if (filterActive) params.set("isActive", filterActive);
      if (search.trim()) params.set("search", search.trim());
      if (ownershipFilter !== "ALL") params.set("ownershipFilter", ownershipFilter);
      const q = params.toString();
      const data = await apiFetch<Asset[]>(`/assets${q ? `?${q}` : ""}`);
      setAssets(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterActive, search, ownershipFilter]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  // Load company users & pools for dropdowns
  useEffect(() => {
    apiFetch<any[]>("/company/members").then((m) => {
      setCompanyUsers(m.map((x: any) => x.user ?? x).filter(Boolean));
    }).catch(() => {});
    apiFetch<PoolRef[]>("/maintenance-pools").then(setPools).catch(() => {});
  }, []);

  // Load dispositions & tags
  useEffect(() => {
    apiFetch<DispositionRef[]>("/asset-dispositions").then(setDispositions).catch(() => {});
    apiFetch<TagRef[]>("/asset-tags").then(setAllTags).catch(() => {});
  }, []);

  // Client-side filter for disposition & tags
  const filteredAssets = useMemo(() => {
    let result = assets;
    if (filterDisposition) result = result.filter((a) => a.disposition?.id === filterDisposition);
    if (filterTags.length > 0) result = result.filter((a) => filterTags.every((tid) => a.tagAssignments?.some((ta) => ta.tag.id === tid)));
    return result;
  }, [assets, filterDisposition, filterTags]);

  // ── Open detail ───────────────────────────────────────────────────────
  const openDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setCostSummary(null);
    try {
      const [asset, cost] = await Promise.all([
        apiFetch<Asset>(`/assets/${id}`),
        apiFetch<CostSummary>(`/assets/${id}/cost-summary`),
      ]);
      setSelectedAsset(asset);
      setCostSummary(cost);
      startTransition(() => setTab("DETAIL"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load asset");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ── Create / Update ───────────────────────────────────────────────────
  const resetForm = () => {
    setFormName(""); setFormCode(""); setFormDescription("");
    setFormType("EQUIPMENT"); setFormBaseUnit("HR"); setFormBaseRate("");
    setFormManufacturer(""); setFormModel(""); setFormSerial("");
    setFormYear(""); setFormTrackable(true); setEditingId(null);
    setFormOwnership("COMPANY"); setFormSharingVisibility("COMPANY");
    setFormMaintenanceAssigneeId(""); setFormMaintenancePoolId("");
    setFormDispositionId(""); setFormTagIds([]);
  };

  const populateForm = (a: Asset) => {
    setFormName(a.name); setFormCode(a.code ?? ""); setFormDescription(a.description ?? "");
    setFormType(a.assetType); setFormBaseUnit(a.baseUnit ?? "HR"); setFormBaseRate(a.baseRate ?? "");
    setFormManufacturer(a.manufacturer ?? ""); setFormModel(a.model ?? "");
    setFormSerial(a.serialNumberOrVin ?? ""); setFormYear(a.year ? String(a.year) : "");
    setFormTrackable(a.isTrackable); setEditingId(a.id);
    setFormOwnership(a.ownershipType ?? "COMPANY");
    setFormSharingVisibility(a.sharingVisibility ?? "COMPANY");
    setFormMaintenanceAssigneeId(a.maintenanceAssigneeId ?? "");
    setFormMaintenancePoolId(a.maintenancePoolId ?? "");
    setFormDispositionId(a.dispositionId ?? "");
    setFormTagIds(a.tagAssignments?.map((ta) => ta.tag.id) ?? []);
  };

  const handleSave = async () => {
    if (!formName.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    try {
      const body: any = {
        name: formName.trim(),
        code: formCode.trim() || null,
        description: formDescription.trim() || null,
        assetType: formType,
        baseUnit: formBaseUnit || null,
        baseRate: formBaseRate || null,
        manufacturer: formManufacturer.trim() || null,
        model: formModel.trim() || null,
        serialNumberOrVin: formSerial.trim() || null,
        year: formYear ? parseInt(formYear, 10) : null,
        isTrackable: formTrackable,
        ownershipType: formOwnership,
        sharingVisibility: formOwnership === "PERSONAL" ? formSharingVisibility : "COMPANY",
        maintenanceAssigneeId: formMaintenanceAssigneeId || null,
        maintenancePoolId: formMaintenancePoolId || null,
        dispositionId: formDispositionId || null,
      };

      let targetId = editingId;
      if (editingId) {
        await apiFetch(`/assets/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<{ id: string }>("/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        targetId = created.id;
      }

      // Assign tags
      if (targetId) {
        await apiFetch(`/assets/${targetId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagIds: formTagIds }),
        });
      }

      resetForm();
      startTransition(() => setTab("LIST"));
      void loadAssets();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Deactivate this asset?")) return;
    try {
      await apiFetch(`/assets/${id}`, { method: "DELETE" });
      void loadAssets();
      if (tab === "DETAIL") startTransition(() => setTab("LIST"));
    } catch (e: any) {
      setError(e?.message ?? "Deactivate failed");
    }
  };

  // ── CSV Upload ──────────────────────────────────────────────────────
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/assets/import-csv`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${body}`);
      }
      const result = await res.json();
      setCsvResult(result);
      void loadAssets();
    } catch (err: any) {
      setError(err?.message ?? "CSV upload failed");
    } finally {
      setCsvUploading(false);
      e.target.value = ""; // reset file input
    }
  };

  // ── CSV Template Download ──────────────────────────────────────────
  const downloadCsvTemplate = () => {
    const headers = [
      "name","code","description","assetType","baseUnit","baseRate",
      "manufacturer","model","serialNumberOrVin","year","isTrackable","isConsumable","isActive",
      "ownershipType","ownerEmail","maintenanceAssigneeEmail","maintenancePoolName","sharingVisibility",
    ];
    const sampleRows = [
      ["2019 Ford F350 Limited","VEH-F350-19","Crew cab pickup truck","EQUIPMENT","MI","0.65","Ford","F-350 Limited","1FT8W3BT7KEG32154","2019","true","false","true","COMPANY","","","Fleet Maintenance","COMPANY"],
      ["2018 Iron Bull 40ft Trailer","TRL-IB40-18","40-foot gooseneck flatbed trailer","EQUIPMENT","HR","35","Iron Bull","40ft Gooseneck","50HFL4025J1021012","2018","true","false","true","COMPANY","","fleetmgr@company.com","","COMPANY"],
      ["Jimmy Scaffold Set A","SCAFFOLD-JM-A","6-section scaffold set","EQUIPMENT","DAY","50","","Scaffold Set","","","true","false","true","PERSONAL","jimmy@company.com","","","COMPANY"],
      ["Personal Truck - 2022 Ram 2500","VEH-RAM-22","Personal truck used on job sites","EQUIPMENT","MI","0.67","Ram","2500","","2022","true","false","true","PERSONAL","worker@company.com","","","PRIVATE"],
      ["Hypertherm Powermax 45 SYNC","TOOL-HYPER45","Plasma cutter 45A","TOOL","HR","12","Hypertherm","Powermax 45 SYNC","","","true","false","true","COMPANY","","","Welding Crew","COMPANY"],
    ];
    const csvContent = [headers.join(","), ...sampleRows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "asset-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Asset Management</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {tab !== "LIST" && (
            <button
              onClick={() => { resetForm(); startTransition(() => setTab("LIST")); }}
              style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}
            >
              ← Back to List
            </button>
          )}
          {tab === "LIST" && (
            <>
              <button
                onClick={downloadCsvTemplate}
                style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}
              >
                ↓ CSV Template
              </button>
              <label
                style={{ padding: "6px 14px", border: "1px solid #059669", borderRadius: 6, background: "#ecfdf5", cursor: csvUploading ? "wait" : "pointer", fontSize: 13, fontWeight: 600, color: "#065f46", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {csvUploading ? "Uploading…" : "↑ Import CSV"}
                <input type="file" accept=".csv" onChange={handleCsvUpload} disabled={csvUploading} style={{ display: "none" }} />
              </label>
              <button
                onClick={() => { resetForm(); startTransition(() => setTab("CREATE")); }}
                style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "#1e3a8a", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                + New Asset
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {csvResult && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#14532d" }}>
          <strong>CSV Import complete:</strong> {csvResult.created} created, {csvResult.updated} updated, {csvResult.skipped} skipped.
          {csvResult.errors.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{csvResult.errors.length} warning(s)</summary>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
                {csvResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
          <button onClick={() => setCsvResult(null)} style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "#14532d", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* ══════ LIST TAB ══════ */}
      {tab === "LIST" && (
        <>
          {/* Ownership filter tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
            {(["ALL", "COMPANY", "PERSONAL", "MY_ASSETS"] as OwnershipFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setOwnershipFilter(f)}
                style={{
                  padding: "8px 16px", border: "none", borderBottom: ownershipFilter === f ? "2px solid #1e3a8a" : "2px solid transparent",
                  background: "none", cursor: "pointer", fontSize: 13, fontWeight: ownershipFilter === f ? 700 : 400,
                  color: ownershipFilter === f ? "#1e3a8a" : "#6b7280",
                }}
              >
                {f === "ALL" ? "All Assets" : f === "COMPANY" ? "Company" : f === "PERSONAL" ? "Personal" : "My Assets"}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, or serial..."
              style={{ flex: 1, minWidth: 200, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as AssetType | "")}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            >
              <option value="">All Types</option>
              <option value="EQUIPMENT">Equipment</option>
              <option value="TOOL">Tool</option>
              <option value="RENTAL">Rental</option>
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as "" | "true" | "false")}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            >
              <option value="">Active & Inactive</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
            <select
              value={filterDisposition}
              onChange={(e) => setFilterDisposition(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            >
              <option value="">All Dispositions</option>
              {dispositions.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6b7280", lineHeight: "24px" }}>Tags:</span>
              {allTags.map((t) => {
                const on = filterTags.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => setFilterTags((prev) => on ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                    style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${t.color || "#d1d5db"}`,
                      background: on ? (t.color || "#e5e7eb") : "#fff",
                      color: on ? "#fff" : (t.color || "#374151"),
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
              {filterTags.length > 0 && (
                <button
                  onClick={() => setFilterTags([])}
                  style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Loading assets...</div>
          ) : filteredAssets.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
              {assets.length === 0 ? (
                <>No assets found.{" "}
                  <button onClick={() => { resetForm(); startTransition(() => setTab("CREATE")); }} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    Create your first asset
                  </button>
                </>
              ) : "No assets match the current filters."}
            </div>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Owner</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Code</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Type</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Rate</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>OEM</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Location</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Disposition</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Tags</th>
                    <th style={{ padding: "8px 12px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((a) => (
                    <tr
                      key={a.id}
                      style={{ borderBottom: "1px solid #e5e7eb", cursor: "pointer" }}
                      onClick={() => openDetail(a.id)}
                    >
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                        {a.name}
                        {a.ownershipType === "PERSONAL" && a.sharingVisibility === "PRIVATE" && (
                          <span title="Private" style={{ marginLeft: 6, fontSize: 10, color: "#9ca3af" }}>🔒</span>
                        )}
                        {a.ownershipType === "PERSONAL" && a.sharingVisibility === "COMPANY" && (
                          <span title="Shared with company" style={{ marginLeft: 6, fontSize: 10, color: "#059669" }}>🔗</span>
                        )}
                        {a.ownershipType === "PERSONAL" && a.sharingVisibility === "CUSTOM" && (
                          <span title="Shared with select people" style={{ marginLeft: 6, fontSize: 10, color: "#d97706" }}>👥</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12 }}>
                        {a.ownershipType === "PERSONAL" ? (
                          <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "#faf5ff", color: "#7c3aed" }}>
                            {a.owner ? `${a.owner.firstName ?? ""} ${a.owner.lastName ?? ""}`.trim() || a.owner.email : "Personal"}
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "#f0f9ff", color: "#0369a1" }}>Company</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#6b7280" }}>{a.code || "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: a.assetType === "EQUIPMENT" ? "#dbeafe" : a.assetType === "TOOL" ? "#d1fae5" : "#fef3c7",
                          color: a.assetType === "EQUIPMENT" ? "#1e40af" : a.assetType === "TOOL" ? "#065f46" : "#92400e",
                        }}>
                          {a.assetType}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {a.baseRate ? `$${a.baseRate}/${a.baseUnit ?? "hr"}` : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#6b7280", fontSize: 12 }}>
                        {[a.manufacturer, a.model, a.year].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#6b7280", fontSize: 12 }}>
                        {a.currentLocation?.name ?? "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {a.disposition ? (
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                            background: a.disposition.color ? `${a.disposition.color}20` : "#f3f4f6",
                            color: a.disposition.color || "#374151",
                            border: `1px solid ${a.disposition.color || "#d1d5db"}`,
                          }}>
                            {a.disposition.label}
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: a.isActive ? "#059669" : "#9ca3af" }} title={a.isActive ? "Active" : "Inactive"} />
                        )}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {(a.tagAssignments ?? []).map((ta) => (
                            <span key={ta.tag.id} style={{
                              display: "inline-block", padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                              background: ta.tag.color ? `${ta.tag.color}20` : "#f3f4f6",
                              color: ta.tag.color || "#6b7280",
                            }}>
                              {ta.tag.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); populateForm(a); startTransition(() => setTab("CREATE")); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: 12, fontWeight: 600 }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
            {filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""}{filteredAssets.length !== assets.length ? ` (${assets.length} total)` : ""}
          </div>
        </>
      )}

      {/* ══════ DETAIL TAB ══════ */}
      {tab === "DETAIL" && selectedAsset && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{selectedAsset.name}</h2>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {[selectedAsset.manufacturer, selectedAsset.model, selectedAsset.year].filter(Boolean).join(" · ")}
                {selectedAsset.serialNumberOrVin && ` · S/N: ${selectedAsset.serialNumberOrVin}`}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: selectedAsset.ownershipType === "PERSONAL" ? "#faf5ff" : "#f0f9ff",
                  color: selectedAsset.ownershipType === "PERSONAL" ? "#7c3aed" : "#0369a1",
                }}>
                  {selectedAsset.ownershipType === "PERSONAL"
                    ? `Personal · ${selectedAsset.owner ? `${selectedAsset.owner.firstName ?? ""} ${selectedAsset.owner.lastName ?? ""}`.trim() || selectedAsset.owner.email : ""}`
                    : "Company Asset"}
                </span>
                {selectedAsset.maintenanceAssignee && (
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>
                    Maint: {`${selectedAsset.maintenanceAssignee.firstName ?? ""} ${selectedAsset.maintenanceAssignee.lastName ?? ""}`.trim() || selectedAsset.maintenanceAssignee.email}
                  </span>
                )}
                {selectedAsset.maintenancePool && (
                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>
                    Pool: {selectedAsset.maintenancePool.name}
                  </span>
                )}
                {selectedAsset.ownershipType === "PERSONAL" && (
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: selectedAsset.sharingVisibility === "PRIVATE" ? "#f3f4f6" : selectedAsset.sharingVisibility === "COMPANY" ? "#d1fae5" : "#fef3c7",
                    color: selectedAsset.sharingVisibility === "PRIVATE" ? "#6b7280" : selectedAsset.sharingVisibility === "COMPANY" ? "#065f46" : "#92400e",
                  }}>
                    {selectedAsset.sharingVisibility === "PRIVATE" ? "Private" : selectedAsset.sharingVisibility === "COMPANY" ? "Shared w/ Company" : "Custom Sharing"}
                  </span>
                )}
                {selectedAsset.disposition && (
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: selectedAsset.disposition.color ? `${selectedAsset.disposition.color}20` : "#f3f4f6",
                    color: selectedAsset.disposition.color || "#374151",
                    border: `1px solid ${selectedAsset.disposition.color || "#d1d5db"}`,
                  }}>
                    {selectedAsset.disposition.label}
                  </span>
                )}
                {(selectedAsset.tagAssignments ?? []).map((ta) => (
                  <span key={ta.tag.id} style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: ta.tag.color ? `${ta.tag.color}20` : "#f3f4f6",
                    color: ta.tag.color || "#6b7280",
                  }}>
                    {ta.tag.label}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { populateForm(selectedAsset); startTransition(() => setTab("CREATE")); }}
                style={{ padding: "6px 14px", border: "1px solid #2563eb", borderRadius: 6, background: "#fff", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                Edit
              </button>
              {selectedAsset.isActive && (
                <button
                  onClick={() => handleDeactivate(selectedAsset.id)}
                  style={{ padding: "6px 14px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Type</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedAsset.assetType}</div>
            </div>
            <div style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Rate</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {selectedAsset.baseRate ? `$${selectedAsset.baseRate}/${selectedAsset.baseUnit ?? "hr"}` : "N/A"}
              </div>
            </div>
            <div style={{ borderRadius: 8, border: "1px solid #a7f3d0", background: "#ecfdf5", padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "#065f46", marginBottom: 2 }}>Total Hours</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#059669" }}>{costSummary?.totalHours ?? 0}h</div>
            </div>
            <div style={{ borderRadius: 8, border: "1px solid #e5e7eb", padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Total Cost</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                ${(costSummary?.totalCost ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Cost by project */}
          {costSummary && costSummary.projectBreakdown.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Cost by Project</h3>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Project</th>
                      <th style={{ textAlign: "right", padding: "6px 12px" }}>Hours</th>
                      <th style={{ textAlign: "right", padding: "6px 12px" }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costSummary.projectBreakdown.map((p) => (
                      <tr key={p.projectId} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "6px 12px" }}>{p.projectName}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right" }}>{p.hours}h</td>
                        <td style={{ padding: "6px 12px", textAlign: "right" }}>${p.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent usages */}
          {selectedAsset.usages && selectedAsset.usages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Deployment History</h3>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Project</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Start</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>End</th>
                      <th style={{ textAlign: "right", padding: "6px 12px" }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAsset.usages.map((u: any) => (
                      <tr key={u.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "6px 12px" }}>{u.project?.name ?? u.projectId}</td>
                        <td style={{ padding: "6px 12px" }}>
                          <span style={{
                            padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: u.status === "ACTIVE" ? "#d1fae5" : "#e5e7eb",
                            color: u.status === "ACTIVE" ? "#065f46" : "#374151",
                          }}>
                            {u.status}
                          </span>
                        </td>
                        <td style={{ padding: "6px 12px", color: "#6b7280" }}>{u.startDate ? new Date(u.startDate).toLocaleDateString() : "—"}</td>
                        <td style={{ padding: "6px 12px", color: "#6b7280" }}>{u.endDate ? new Date(u.endDate).toLocaleDateString() : "—"}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right" }}>
                          {u.actualCost != null ? `$${Number(u.actualCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Maintenance todos */}
          {selectedAsset.maintenanceTodos && selectedAsset.maintenanceTodos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Pending Maintenance</h3>
              {selectedAsset.maintenanceTodos.map((t: any) => (
                <div key={t.id} style={{ padding: "8px 12px", border: "1px solid #fcd34d", background: "#fffbeb", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: "#92400e" }}>{t.title}</div>
                  {t.dueDate && (
                    <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>
                      Due: {new Date(t.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Meter readings */}
          {selectedAsset.meterReadings && selectedAsset.meterReadings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recent Meter Readings</h3>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Type</th>
                      <th style={{ textAlign: "right", padding: "6px 12px" }}>Value</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Source</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAsset.meterReadings.map((m: any) => (
                      <tr key={m.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "6px 12px" }}>{m.meterType}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600 }}>{m.value}</td>
                        <td style={{ padding: "6px 12px", color: "#6b7280" }}>{m.source ?? "—"}</td>
                        <td style={{ padding: "6px 12px", color: "#6b7280" }}>{new Date(m.recordedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Files / Attachments ─────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Files ({selectedAsset.attachments?.length ?? 0})</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={attachCategory}
                  onChange={(e) => setAttachCategory(e.target.value as AttachmentCategory)}
                  style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }}
                >
                  {(["PHOTO","TITLE","INSURANCE","MANUAL","RECEIPT","DIAGNOSTIC","CONTRACT","WARRANTY","SCHEMATIC","OTHER"] as AttachmentCategory[]).map((c) => (
                    <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                <label
                  style={{
                    padding: "4px 12px", border: "1px solid #2563eb", borderRadius: 6, background: "#eff6ff",
                    cursor: attachUploading ? "wait" : "pointer", fontSize: 12, fontWeight: 600, color: "#1e40af",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  {attachUploading ? "Uploading…" : "+ Upload Files"}
                  <input
                    type="file"
                    multiple
                    disabled={attachUploading}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const fileList = e.target.files;
                      if (!fileList || fileList.length === 0) return;
                      setAttachUploading(true);
                      setError(null);
                      try {
                        const formData = new FormData();
                        for (let i = 0; i < fileList.length; i++) formData.append("file", fileList[i]);
                        formData.append("category", attachCategory);
                        const res = await fetch(`${API_BASE}/assets/${selectedAsset.id}/attachments`, {
                          method: "POST",
                          headers: { ...authHeaders() },
                          body: formData,
                        });
                        if (!res.ok) throw new Error(await res.text());
                        // Refresh detail to get updated attachment list
                        const refreshed = await apiFetch<Asset>(`/assets/${selectedAsset.id}`);
                        setSelectedAsset(refreshed);
                      } catch (err: any) {
                        setError(err?.message ?? "Upload failed");
                      } finally {
                        setAttachUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {(selectedAsset.attachments ?? []).length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", border: "1px dashed #d1d5db", borderRadius: 8, fontSize: 13 }}>
                No files attached yet. Use the upload button to add documents, photos, or other files.
              </div>
            ) : (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>File</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Category</th>
                      <th style={{ textAlign: "right", padding: "6px 12px" }}>Size</th>
                      <th style={{ textAlign: "left", padding: "6px 12px" }}>Uploaded</th>
                      <th style={{ padding: "6px 12px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedAsset.attachments ?? []).map((att) => {
                      const isImage = att.fileType?.startsWith("image/");
                      const icon = isImage ? "🖼️" : att.fileType?.includes("pdf") ? "📕" : "📄";
                      const sizeStr = att.fileSize < 1024 ? `${att.fileSize} B`
                        : att.fileSize < 1024 * 1024 ? `${(att.fileSize / 1024).toFixed(1)} KB`
                        : `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`;
                      return (
                        <tr key={att.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <td style={{ padding: "6px 12px" }}>
                            <span style={{ marginRight: 6 }}>{icon}</span>
                            <span style={{ fontWeight: 500 }}>{att.fileName}</span>
                          </td>
                          <td style={{ padding: "6px 12px" }}>
                            <span style={{
                              display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600,
                              background: "#f0f9ff", color: "#0369a1",
                            }}>
                              {att.category}
                            </span>
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "right", color: "#6b7280" }}>{sizeStr}</td>
                          <td style={{ padding: "6px 12px", color: "#6b7280", fontSize: 12 }}>
                            {new Date(att.createdAt).toLocaleDateString()}
                            {att.uploadedBy && ` · ${att.uploadedBy.firstName ?? att.uploadedBy.email}`}
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "right" }}>
                            <a
                              href={`${API_BASE}/assets/${selectedAsset.id}/attachments/${att.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                // Use fetch with auth headers for the download redirect
                                window.open(`${API_BASE}/assets/${selectedAsset.id}/attachments/${att.id}/download?token=${localStorage.getItem("accessToken") ?? ""}`, "_blank");
                              }}
                              style={{ color: "#2563eb", fontSize: 12, fontWeight: 600, marginRight: 8, cursor: "pointer" }}
                            >
                              ↓
                            </a>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete ${att.fileName}?`)) return;
                                try {
                                  await apiFetch(`/assets/${selectedAsset.id}/attachments/${att.id}`, { method: "DELETE" });
                                  const refreshed = await apiFetch<Asset>(`/assets/${selectedAsset.id}`);
                                  setSelectedAsset(refreshed);
                                } catch (err: any) {
                                  setError(err?.message ?? "Delete failed");
                                }
                              }}
                              style={{ color: "#dc2626", fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ CREATE / EDIT TAB ══════ */}
      {tab === "CREATE" && (
        <div style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
            {editingId ? "Edit Asset" : "New Asset"}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} style={inputStyle} placeholder="e.g. CAT 320 Excavator" />
            </div>
            <div>
              <label style={labelStyle}>Code</label>
              <input value={formCode} onChange={(e) => setFormCode(e.target.value)} style={inputStyle} placeholder="e.g. EQ-001" />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} style={{ ...inputStyle, height: 60, resize: "vertical" }} placeholder="Optional description" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as AssetType)} style={inputStyle}>
                <option value="EQUIPMENT">Equipment</option>
                <option value="TOOL">Tool</option>
                <option value="RENTAL">Rental</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Rate</label>
              <input value={formBaseRate} onChange={(e) => setFormBaseRate(e.target.value)} style={inputStyle} placeholder="0.00" type="number" step="0.01" />
            </div>
            <div>
              <label style={labelStyle}>Unit</label>
              <select value={formBaseUnit} onChange={(e) => setFormBaseUnit(e.target.value)} style={inputStyle}>
                <option value="HR">Per Hour</option>
                <option value="DAY">Per Day</option>
                <option value="MI">Per Mile</option>
                <option value="WK">Per Week</option>
                <option value="MO">Per Month</option>
                <option value="EA">Each</option>
              </select>
            </div>
          </div>

          {/* Disposition */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Disposition</label>
              <select value={formDispositionId} onChange={(e) => setFormDispositionId(e.target.value)} style={inputStyle}>
                <option value="">— None —</option>
                {dispositions.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Tags</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allTags.map((t) => {
                const sel = formTagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFormTagIds((prev) => sel ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                    style={{
                      padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${t.color || "#d1d5db"}`,
                      background: sel ? (t.color || "#e5e7eb") : "#fff",
                      color: sel ? "#fff" : (t.color || "#374151"),
                      cursor: "pointer",
                    }}
                  >
                    {sel ? "✓ " : ""}{t.label}
                  </button>
                );
              })}
              {allTags.length === 0 && <span style={{ fontSize: 12, color: "#9ca3af" }}>No tags defined yet</span>}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>OEM Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Manufacturer</label>
                <input value={formManufacturer} onChange={(e) => setFormManufacturer(e.target.value)} style={inputStyle} placeholder="e.g. Caterpillar" />
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <input value={formModel} onChange={(e) => setFormModel(e.target.value)} style={inputStyle} placeholder="e.g. 320F" />
              </div>
              <div>
                <label style={labelStyle}>Serial / VIN</label>
                <input value={formSerial} onChange={(e) => setFormSerial(e.target.value)} style={inputStyle} placeholder="Serial number or VIN" />
              </div>
              <div>
                <label style={labelStyle}>Year</label>
                <input value={formYear} onChange={(e) => setFormYear(e.target.value)} style={inputStyle} placeholder="e.g. 2024" type="number" />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={formTrackable} onChange={(e) => setFormTrackable(e.target.checked)} />
              Trackable (GPS / location-aware)
            </label>
          </div>

          {/* Ownership */}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ownership</div>
            <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={formOwnership === "COMPANY"} onChange={() => { setFormOwnership("COMPANY"); setFormSharingVisibility("COMPANY"); }} />
                Company Asset
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={formOwnership === "PERSONAL"} onChange={() => { setFormOwnership("PERSONAL"); setFormSharingVisibility("PRIVATE"); }} />
                Personal Asset
              </label>
            </div>
            {formOwnership === "PERSONAL" && (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Sharing</label>
                <div style={{ display: "flex", gap: 12 }}>
                  {(["PRIVATE", "COMPANY", "CUSTOM"] as SharingVisibility[]).map((v) => (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                      <input type="radio" checked={formSharingVisibility === v} onChange={() => setFormSharingVisibility(v)} />
                      {v === "PRIVATE" ? "Private" : v === "COMPANY" ? "Share with Company" : "Specific People"}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Maintenance Assignment */}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Maintenance Assignment</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Assign to Person</label>
                <select
                  value={formMaintenanceAssigneeId}
                  onChange={(e) => { setFormMaintenanceAssigneeId(e.target.value); if (e.target.value) setFormMaintenancePoolId(""); }}
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {companyUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Assign to Pool</label>
                <select
                  value={formMaintenancePoolId}
                  onChange={(e) => { setFormMaintenancePoolId(e.target.value); if (e.target.value) setFormMaintenanceAssigneeId(""); }}
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "8px 20px", border: "none", borderRadius: 6, background: "#1e3a8a", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving..." : editingId ? "Update Asset" : "Create Asset"}
            </button>
            <button
              onClick={() => { resetForm(); startTransition(() => setTab("LIST")); }}
              style={{ padding: "8px 20px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 };
