"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type AssetType = "EQUIPMENT" | "TOOL" | "RENTAL";
type MeterType = "HOURS" | "MILES" | "RUN_CYCLES" | "GENERATOR_HOURS";

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
  currentLocation?: { id: string; name: string; type: string } | null;
  createdAt: string;
  updatedAt: string;
  // Detail fields (from GET :id)
  usages?: any[];
  transactions?: any[];
  meterReadings?: any[];
  maintenanceTodos?: any[];
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
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Load assets ───────────────────────────────────────────────────────
  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("assetType", filterType);
      if (filterActive) params.set("isActive", filterActive);
      if (search.trim()) params.set("search", search.trim());
      const q = params.toString();
      const data = await apiFetch<Asset[]>(`/assets${q ? `?${q}` : ""}`);
      setAssets(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterActive, search]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

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
  };

  const populateForm = (a: Asset) => {
    setFormName(a.name); setFormCode(a.code ?? ""); setFormDescription(a.description ?? "");
    setFormType(a.assetType); setFormBaseUnit(a.baseUnit ?? "HR"); setFormBaseRate(a.baseRate ?? "");
    setFormManufacturer(a.manufacturer ?? ""); setFormModel(a.model ?? "");
    setFormSerial(a.serialNumberOrVin ?? ""); setFormYear(a.year ? String(a.year) : "");
    setFormTrackable(a.isTrackable); setEditingId(a.id);
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
      };

      if (editingId) {
        await apiFetch(`/assets/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
            <button
              onClick={() => { resetForm(); startTransition(() => setTab("CREATE")); }}
              style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "#1e3a8a", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              + New Asset
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* ══════ LIST TAB ══════ */}
      {tab === "LIST" && (
        <>
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
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Loading assets...</div>
          ) : assets.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
              No assets found.{" "}
              <button onClick={() => { resetForm(); startTransition(() => setTab("CREATE")); }} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Create your first asset
              </button>
            </div>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Code</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Type</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Rate</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>OEM</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Location</th>
                    <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Status</th>
                    <th style={{ padding: "8px 12px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr
                      key={a.id}
                      style={{ borderBottom: "1px solid #e5e7eb", cursor: "pointer" }}
                      onClick={() => openDetail(a.id)}
                    >
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{a.name}</td>
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
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                          background: a.isActive ? "#059669" : "#9ca3af",
                        }} title={a.isActive ? "Active" : "Inactive"} />
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
            {assets.length} asset{assets.length !== 1 ? "s" : ""}
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
            <div>
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
                <option value="WK">Per Week</option>
                <option value="MO">Per Month</option>
                <option value="EA">Each</option>
              </select>
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

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={formTrackable} onChange={(e) => setFormTrackable(e.target.checked)} />
              Trackable (GPS / location-aware)
            </label>
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
