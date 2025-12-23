"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type FinancialSection =
  | "PRICELIST_TREE"
  | "GOLDEN_COMPONENTS"
  | "ESTIMATES"
  | "ORIGINAL_CONTRACT"
  | "CHANGES"
  | "CURRENT_CONTRACT_TOTAL"
  | "PAYROLL"
  | "FINANCIAL_ALLOCATION"
  | "DIVISION_CODES_LOOKUP";

type Division = {
  code: string;
  name: string;
  sortOrder: number;
};

type CatDivisionMapping = {
  cat: string;
  divisionCode: string;
  divisionName: string | null;
};

type GoldenPriceListRow = {
  lineNo: number | null;
  cat: string | null;
  sel: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  lastKnownUnitPrice: number | null;
  coverage: string | null;
  activity: string | null;
  divisionCode: string | null;
  divisionName: string | null;
};

type GoldenPriceUpdateLogEntry = {
  id: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  estimateVersionId: string;
  estimateLabel: string | null;
  updatedCount: number;
  avgDelta: number;
  avgPercentDelta: number;
  userId: string | null;
  userName: string | null;
};

type GoldenComponent = {
  id: string;
  priceListItemId: string;
  componentCode: string;
  description: string | null;
  quantity: number | null;
  material: number | null;
  labor: number | null;
  equipment: number | null;
};

type GoldenItemWithComponents = {
  id: string;
  cat: string | null;
  sel: string | null;
  activity: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  lastKnownUnitPrice: number | null;
  divisionCode: string | null;
  divisionName: string | null;
  components: GoldenComponent[];
};

export default function FinancialPage() {
  const [activeSection, setActiveSection] = useState<FinancialSection>("PRICELIST_TREE");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentGolden, setCurrentGolden] = useState<
    | {
        id: string;
        label: string;
        revision: number;
        effectiveDate?: string | null;
        itemCount: number;
      }
    | null
  >(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [catMappings, setCatMappings] = useState<CatDivisionMapping[]>([]);
  const [divisionError, setDivisionError] = useState<string | null>(null);
  const [loadingDivisionMapping, setLoadingDivisionMapping] = useState(false);
  const [goldenRows, setGoldenRows] = useState<GoldenPriceListRow[]>([]);
  const [goldenTableError, setGoldenTableError] = useState<string | null>(null);
  const [loadingGoldenTable, setLoadingGoldenTable] = useState(false);
  const [goldenHistory, setGoldenHistory] = useState<GoldenPriceUpdateLogEntry[]>([]);
  const [goldenHistoryError, setGoldenHistoryError] = useState<string | null>(null);
  const [loadingGoldenHistory, setLoadingGoldenHistory] = useState(false);

  const [componentsItems, setComponentsItems] = useState<GoldenItemWithComponents[]>([]);
  const [componentsError, setComponentsError] = useState<string | null>(null);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentsActivityFilter, setComponentsActivityFilter] = useState<string>("");

  useEffect(() => {
    setMessage(null);
    setError(null);
    setDivisionError(null);
    setGoldenTableError(null);
    setGoldenHistoryError(null);
    setComponentsError(null);

    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;

    // Fetch current Golden price list summary, division mapping, and
    // a raw table view of the Golden list (with division codes).
    (async () => {
      try {
        const priceListRes = await fetch(`${API_BASE}/pricing/price-list/current`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!priceListRes.ok) {
          const text = await priceListRes.text().catch(() => "");
          throw new Error(`Failed to load current price list (${priceListRes.status}) ${text}`);
        }

        const json = await priceListRes.json();
        if (!json) {
          setCurrentGolden(null);
        } else {
          setCurrentGolden({
            id: json.id,
            label: json.label,
            revision: json.revision,
            effectiveDate: json.effectiveDate ?? null,
            itemCount: json.itemCount ?? 0,
          });
        }
      } catch (err: any) {
        setSummaryError(err?.message ?? "Failed to load current price list.");
      }

      // Division mapping
      setLoadingDivisionMapping(true);
      try {
        const mappingRes = await fetch(`${API_BASE}/pricing/division-mapping`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!mappingRes.ok) {
          const text = await mappingRes.text().catch(() => "");
          throw new Error(
            `Failed to load division mapping (${mappingRes.status}) ${text}`,
          );
        }

        const json = (await mappingRes.json()) as {
          divisions?: Division[];
          catMappings?: CatDivisionMapping[];
        };

        setDivisions(json.divisions ?? []);
        setCatMappings(json.catMappings ?? []);
      } catch (err: any) {
        setDivisionError(err?.message ?? "Failed to load division mapping.");
      } finally {
        setLoadingDivisionMapping(false);
      }

      // Golden price list table
      setLoadingGoldenTable(true);
      try {
        const tableRes = await fetch(`${API_BASE}/pricing/price-list/table`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!tableRes.ok) {
          const text = await tableRes.text().catch(() => "");
          throw new Error(`Failed to load Golden price list table (${tableRes.status}) ${text}`);
        }

        const json = (await tableRes.json()) as {
          priceList?: {
            id: string;
            label: string;
            revision: number;
            itemCount: number;
          } | null;
          rows?: GoldenPriceListRow[];
        };

        setGoldenRows(json.rows ?? []);
      } catch (err: any) {
        setGoldenTableError(err?.message ?? "Failed to load Golden price list table.");
      } finally {
        setLoadingGoldenTable(false);
      }

      // Golden price update history
      setLoadingGoldenHistory(true);
      try {
        const historyRes = await fetch(`${API_BASE}/pricing/price-list/history`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!historyRes.ok) {
          const text = await historyRes.text().catch(() => "");
          throw new Error(
            `Failed to load Golden price list history (${historyRes.status}) ${text}`,
          );
        }

        const json = (await historyRes.json()) as GoldenPriceUpdateLogEntry[];
        setGoldenHistory(Array.isArray(json) ? json : []);
      } catch (err: any) {
        setGoldenHistoryError(
          err?.message ?? "Failed to load Golden price list history.",
        );
      } finally {
        setLoadingGoldenHistory(false);
      }

      // Golden components (all ACTs by default)
      setLoadingComponents(true);
      try {
        const componentsRes = await fetch(`${API_BASE}/pricing/price-list/components`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        if (!componentsRes.ok) {
          const text = await componentsRes.text().catch(() => "");
          throw new Error(
            `Failed to load Golden components (${componentsRes.status}) ${text}`,
          );
        }

        const json = (await componentsRes.json()) as {
          priceList?: { id: string; label: string; revision: number } | null;
          items?: GoldenItemWithComponents[];
        };

        setComponentsItems(json.items ?? []);
      } catch (err: any) {
        setComponentsError(err?.message ?? "Failed to load Golden components.");
      } finally {
        setLoadingComponents(false);
      }
    })();
  }, []);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setError("Please choose a CSV file to upload.");
      return;
    }

    const file = fileInput.files[0];
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token. Please log in again.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/pricing/price-list/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            "Your session has expired or is not authorized for Golden uploads. Please log out, log back in, and try again.",
          );
        }
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}) ${text}`);
      }

      const json: any = await res.json();

      if (json.jobId) {
        setMessage(
          `Golden price list import started (job ${json.jobId}). You can go about your business; this may take a few minutes. Refresh this page later to see the updated Golden list.`,
        );
      } else {
        setMessage(
          `Imported Golden Price List revision ${json.revision} with ${json.itemCount} items.`,
        );
      }

      form.reset();
    } catch (err: any) {
      setError(err?.message ?? "Price list upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleComponentsUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("componentsFile") as HTMLInputElement | null;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setError("Please choose a components CSV file to upload.");
      return;
    }

    const file = fileInput.files[0];
    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token. Please log in again.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/pricing/price-list/components/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            "Your session has expired or is not authorized for Golden components uploads. Please log out, log back in, and try again.",
          );
        }
        const text = await res.text().catch(() => "");
        throw new Error(`Components upload failed (${res.status}) ${text}`);
      }

      const json: any = await res.json();
      if (json.jobId) {
        setMessage(
          `Queued Golden Components import as job ${json.jobId}. You can continue working while it processes.`,
        );
      } else {
        setMessage(
          `Imported Golden components for ${json.itemCount} items (${json.componentCount} components).`,
        );
      }

      form.reset();
    } catch (err: any) {
      setError(err?.message ?? "Components upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <PageCard>
      <h2 style={{ marginTop: 0 }}>Financial</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Central place for cross-project financial views and configuration. Project-level
        financials are still available per job under the <strong>FINANCIAL</strong> tab.
      </p>

      {/* Sub-menu within Financial */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 4,
          flexWrap: "wrap",
        }}
      >
        {([
          { id: "PRICELIST_TREE", label: "Pricelist Tree" },
          { id: "GOLDEN_COMPONENTS", label: "Golden Components" },
          { id: "ESTIMATES", label: "Estimates / Quotations" },
          { id: "ORIGINAL_CONTRACT", label: "Original Contract" },
          { id: "CHANGES", label: "Changes" },
          { id: "CURRENT_CONTRACT_TOTAL", label: "Current Contract Total" },
          { id: "PAYROLL", label: "Payroll" },
          { id: "FINANCIAL_ALLOCATION", label: "Financial Allocation" },
          { id: "DIVISION_CODES_LOOKUP", label: "Division Codes Lookup" },
        ] as { id: FinancialSection; label: string }[]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveSection(tab.id);
              setMessage(null);
              setError(null);
            }}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border:
                activeSection === tab.id
                  ? "1px solid #0f172a"
                  : "1px solid transparent",
              backgroundColor:
                activeSection === tab.id ? "#0f172a" : "transparent",
              color: activeSection === tab.id ? "#f9fafb" : "#374151",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pricelist Tree section */}
      {activeSection === "PRICELIST_TREE" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Pricelist Tree – Golden Price List
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            Import the master Xactimate price list as the current <strong>Golden Price List</strong>.
            Only <strong>OWNER</strong>/<strong>ADMIN</strong> roles (or Nexus Super Admins)
            can upload a new Golden price list. The latest imported Golden list becomes
            the active default used for new estimates and quotations. Older Golden
            revisions are kept for history but marked inactive.
          </p>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px dashed #d1d5db",
              background: "#f9fafb",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {currentGolden ? (
              <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>
                Current Golden: <strong>{currentGolden.label}</strong> (rev.
                {" "}
                <strong>{currentGolden.revision}</strong>) with
                {" "}
                <strong>{currentGolden.itemCount}</strong> items
                {currentGolden.effectiveDate && (
                  <>
                    {" "}effective{": "}
                    {new Date(currentGolden.effectiveDate).toLocaleDateString()}
                  </>
                )}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                No active Golden price list found yet.
              </p>
            )}
            {summaryError && (
              <p style={{ marginTop: 4, fontSize: 11, color: "#b91c1c" }}>
                {summaryError}
              </p>
            )}
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px dashed #d1d5db",
              background: "#f9fafb",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            <form onSubmit={handleUpload}>
              <label style={{ display: "block", marginBottom: 6 }}>
                <span style={{ display: "block", marginBottom: 4 }}>Upload CSV</span>
                <input type="file" name="file" accept=".csv,text/csv" />
              </label>
              <button
                type="submit"
                disabled={uploading}
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: uploading ? "#e5e7eb" : "#0f172a",
                  color: uploading ? "#4b5563" : "#f9fafb",
                  fontSize: 12,
                  cursor: uploading ? "default" : "pointer",
                }}
              >
                {uploading ? "Uploading…" : "Upload Golden Price List"}
              </button>
            </form>

            {message && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#16a34a" }}>{message}</p>
            )}
            {error && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{error}</p>
            )}
          </div>

          {/* Components upload */}
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px dashed #d1d5db",
              background: "#f9fafb",
              fontSize: 13,
            }}
          >
            <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>
              Upload Golden Components (per ACT)
            </h4>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Upload an ACT-specific components report (e.g. Materials, Labor, R/R). The
              file must include Cat, Sel, Activity, Desc, Component Code, Qty, Material,
              Labor, and Equipment columns. Components are attached to matching Golden
              line items using the (Cat, Sel, Activity, Description) key.
            </p>
            <form onSubmit={handleComponentsUpload}>
              <label style={{ display: "block", marginBottom: 6 }}>
                <span style={{ display: "block", marginBottom: 4 }}>
                  Upload Components CSV
                </span>
                <input type="file" name="componentsFile" accept=".csv,text/csv" />
              </label>
              <button
                type="submit"
                disabled={uploading}
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #0f172a",
                  backgroundColor: uploading ? "#e5e7eb" : "#0f172a",
                  color: uploading ? "#4b5563" : "#f9fafb",
                  fontSize: 12,
                  cursor: uploading ? "default" : "pointer",
                }}
              >
                {uploading ? "Uploading…" : "Upload Golden Components"}
              </button>
            </form>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 1fr)",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            {/* Raw Golden price list table with division codes */}
            <div
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                maxHeight: "70vh",
              }}
            >
            <div
              style={{
                padding: 8,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>Golden Price List – Raw Table</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Showing Cat/Sel rows with mapped construction divisions. This is a
                  read-only view of the master Xactimate file.
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {loadingGoldenTable
                  ? "Loading rows…"
                  : goldenRows.length
                  ? `${goldenRows.length.toLocaleString()} items`
                  : "No rows loaded"}
              </div>
            </div>

            {goldenTableError && (
              <div style={{ padding: 8, fontSize: 11, color: "#b91c1c" }}>
                {goldenTableError}
              </div>
            )}

            {!goldenTableError && (
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                  }}
                >
                  <thead style={{ position: "sticky", top: 0, background: "#f9fafb" }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "4px 6px", width: 60 }}>
                        Line
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 6px", width: 70 }}>
                        Cat
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 6px", width: 70 }}>
                        Sel
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>
                        Description
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 6px", width: 60 }}>
                        Unit
                      </th>
                      <th style={{ textAlign: "right", padding: "4px 6px", width: 90 }}>
                        Last known price
                      </th>
                      <th style={{ textAlign: "right", padding: "4px 6px", width: 90 }}>
                        Unit price
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 6px", width: 80 }}>
                        Division
                      </th>
                      <th style={{ textAlign: "left", padding: "4px 6px", width: 180 }}>
                        Division name
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {goldenRows.map((row) => (
                      <tr key={`${row.lineNo ?? 0}-${row.cat ?? ""}-${row.sel ?? ""}`}>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            whiteSpace: "nowrap",
                            color: "#6b7280",
                          }}
                        >
                          {row.lineNo ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            fontWeight: 600,
                          }}
                        >
                          {row.cat ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {row.sel ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {row.description ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {row.unit ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            textAlign: "right",
                            color: "#6b7280",
                          }}
                        >
                          {row.lastKnownUnitPrice != null
                            ? `$${row.lastKnownUnitPrice.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            textAlign: "right",
                          }}
                        >
                          {row.unitPrice != null
                            ? `$${row.unitPrice.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.divisionCode ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {row.divisionName ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Golden price list revision log */}
          <div
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 12,
                maxHeight: "70vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: 8,
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>Golden Price List – Revision Log</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    History of Golden repricing events from Xact RAW estimate imports.
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {loadingGoldenHistory
                    ? "Loading…"
                    : goldenHistory.length
                    ? `${goldenHistory.length} updates`
                    : "No updates yet"}
                </div>
              </div>

              {goldenHistoryError && (
                <div style={{ padding: 8, fontSize: 11, color: "#b91c1c" }}>
                  {goldenHistoryError}
                </div>
              )}

              {!goldenHistoryError && (
                <div
                  style={{
                    flex: 1,
                    overflow: "auto",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 11,
                    }}
                  >
                    <thead style={{ background: "#f9fafb" }}>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px 6px", width: 120 }}>
                          When
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>
                          Project
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>
                          Estimate
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px", width: 70 }}>
                          Items
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px", width: 80 }}>
                          Avg Δ
                        </th>
                        <th style={{ textAlign: "right", padding: "4px 6px", width: 80 }}>
                          Avg Δ %
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", width: 120 }}>
                          By
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {goldenHistory.map((entry) => {
                        const when = new Date(entry.createdAt);
                        const whenLabel = when.toLocaleString();
                        const avgDeltaLabel = `$${entry.avgDelta.toFixed(2)}`;
                        const avgPctLabel = `${(entry.avgPercentDelta * 100).toFixed(1)}%`;
                        return (
                          <tr key={entry.id}>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                                whiteSpace: "nowrap",
                                color: "#6b7280",
                              }}
                            >
                              {whenLabel}
                            </td>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                              }}
                            >
                              {entry.projectName}
                            </td>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                                color: "#6b7280",
                              }}
                            >
                              {entry.estimateLabel ?? entry.estimateVersionId}
                            </td>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                                textAlign: "right",
                              }}
                            >
                              {entry.updatedCount.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                                textAlign: "right",
                              }}
                            >
                              {avgDeltaLabel}
                            </td>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                                textAlign: "right",
                              }}
                            >
                              {avgPctLabel}
                            </td>
                            <td
                              style={{
                                padding: "4px 6px",
                                borderTop: "1px solid #f3f4f6",
                                color: "#6b7280",
                              }}
                            >
                              {entry.userName ?? "—"}
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
        </section>
      )}

      {/* Golden components report */}
      {activeSection === "GOLDEN_COMPONENTS" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Golden Components by Activity
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            View the Golden price list broken down by Xact components (materials, labor,
            equipment) for each CAT / SEL / ACT combination.
          </p>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, marginRight: 8 }}>
              Filter by ACT code
            </label>
            <input
              value={componentsActivityFilter}
              onChange={(e) => setComponentsActivityFilter(e.target.value.toUpperCase())}
              placeholder="e.g. M, +, -, &"
              style={{ fontSize: 12, padding: 4, width: 80, marginRight: 8 }}
            />
            <button
              type="button"
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                cursor: "pointer",
              }}
              onClick={async () => {
                const token =
                  typeof window !== "undefined"
                    ? window.localStorage.getItem("accessToken")
                    : null;
                if (!token) {
                  setComponentsError("Missing access token. Please log in again.");
                  return;
                }
                setLoadingComponents(true);
                setComponentsError(null);
                try {
                  const res = await fetch(`${API_BASE}/pricing/price-list/components`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(
                      componentsActivityFilter
                        ? { activity: componentsActivityFilter }
                        : {},
                    ),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(
                      `Failed to load Golden components (${res.status}) ${text}`,
                    );
                  }
                  const json = await res.json();
                  setComponentsItems(Array.isArray(json.items) ? json.items : []);
                } catch (err: any) {
                  setComponentsError(
                    err?.message ?? "Failed to load Golden components.",
                  );
                } finally {
                  setLoadingComponents(false);
                }
              }}
            >
              Apply
            </button>
          </div>
          {loadingComponents && (
            <p style={{ fontSize: 12, color: "#6b7280" }}>Loading components…</p>
          )}
          {componentsError && (
            <p style={{ fontSize: 12, color: "#b91c1c" }}>{componentsError}</p>
          )}
          {!loadingComponents && !componentsError && (
            <div
              style={{
                maxHeight: 420,
                overflow: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                }}
              >
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>
                      Cat
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>
                      Sel
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>
                      ACT
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: 80 }}>
                      Division
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "left" }}>
                      Line description
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: 120 }}>
                      Component
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "right", width: 70 }}>
                      Qty
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>
                      Material
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>
                      Labor
                    </th>
                    <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>
                      Equip
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {componentsItems.flatMap((item) =>
                    item.components.map((comp) => (
                      <tr key={`${item.id}-${comp.id}`}>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            fontWeight: 600,
                          }}
                        >
                          {item.cat ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {item.sel ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {item.activity ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {item.divisionCode ?? ""} {item.divisionName
                            ? `– ${item.divisionName}`
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {item.description ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                          }}
                        >
                          {comp.componentCode}
                          {comp.description ? ` – ${comp.description}` : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            textAlign: "right",
                          }}
                        >
                          {comp.quantity ?? ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            textAlign: "right",
                          }}
                        >
                          {comp.material != null
                            ? comp.material.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            textAlign: "right",
                          }}
                        >
                          {comp.labor != null
                            ? comp.labor.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : ""}
                        </td>
                        <td
                          style={{
                            padding: "4px 6px",
                            borderTop: "1px solid #f3f4f6",
                            textAlign: "right",
                          }}
                        >
                          {comp.equipment != null
                            ? comp.equipment.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : ""}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Estimates / Quotations */}
      {activeSection === "ESTIMATES" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Estimates / Quotations
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Placeholder for a consolidated view of estimates and quotations across
            projects. This will eventually integrate with the Golden price list and
            simple CSV imports for non-Xactimate small businesses.
          </p>
        </section>
      )}

      {/* Original Contract */}
      {activeSection === "ORIGINAL_CONTRACT" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Original Contract
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Placeholder for capturing and reviewing the original contract value,
            schedule of values, and supporting documents.
          </p>
        </section>
      )}

      {/* Changes */}
      {activeSection === "CHANGES" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Changes / Change Orders
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Placeholder for tracking change orders, approved vs pending changes, and
            their impact on the contract value.
          </p>
        </section>
      )}

      {/* Current Contract Total */}
      {activeSection === "CURRENT_CONTRACT_TOTAL" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Current Contract Total
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Placeholder for a rollup of original contract, changes, allowances, and
            adjustments to compute the current contract total across projects.
          </p>
        </section>
      )}

      {/* Payroll */}
      {activeSection === "PAYROLL" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Payroll
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Placeholder for integrating time, labor costs, and payroll allocations back
            into project and company-level financials.
          </p>
        </section>
      )}

      {/* Financial Allocation */}
      {activeSection === "FINANCIAL_ALLOCATION" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Financial Allocation
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Placeholder for rules that allocate revenue and costs across projects,
            trades, crews, or business units, powered by the Golden Pricelist and
            component-level data.
          </p>
        </section>
      )}

      {/* Division Codes Lookup */}
      {activeSection === "DIVISION_CODES_LOOKUP" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Division Codes Lookup
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            CSI-16 construction divisions provide a common language for organizing
            revenue, costs, and work by building system. Xactimate <strong>Cat</strong>
            {" "}codes are linked to these divisions so estimate line items can roll
            up to division-level financial views.
          </p>

        {/* 16 CSI divisions */}
        {loadingDivisionMapping && !divisions.length && (
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
            Loading division mapping...
          </p>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {(divisions.length
            ? divisions
            : [
                { code: "01", name: "General Requirements", sortOrder: 1 },
                { code: "02", name: "Existing Conditions/Site Work", sortOrder: 2 },
                { code: "03", name: "Concrete", sortOrder: 3 },
                { code: "04", name: "Masonry", sortOrder: 4 },
                { code: "05", name: "Metals", sortOrder: 5 },
                { code: "06", name: "Wood, Plastics, and Composites", sortOrder: 6 },
                { code: "07", name: "Thermal and Moisture Protection", sortOrder: 7 },
                { code: "08", name: "Openings (Doors and Windows)", sortOrder: 8 },
                { code: "09", name: "Finishes", sortOrder: 9 },
                { code: "10", name: "Specialties", sortOrder: 10 },
                { code: "11", name: "Equipment", sortOrder: 11 },
                { code: "12", name: "Furnishings", sortOrder: 12 },
                { code: "13", name: "Special Construction", sortOrder: 13 },
                { code: "14", name: "Conveying Equipment", sortOrder: 14 },
                { code: "15", name: "Mechanical (HVAC, Plumbing)", sortOrder: 15 },
                { code: "16", name: "Electrical", sortOrder: 16 },
              ]
          ).map((div) => (
            <div
              key={div.code}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 8,
                background: "#f9fafb",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>Division {div.code}</div>
              <div>{div.name}</div>
            </div>
          ))}
        </div>

        {divisionError && (
          <p style={{ fontSize: 11, color: "#b91c1c", marginBottom: 8 }}>
            {divisionError}
          </p>
        )}

        {/* Cat → Division mapping table */}
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
          Xactimate <strong>Cat</strong> codes mapped to divisions. This is the lookup
          used to roll up estimate revenue by construction division.
        </p>
        <div
            style={{
              maxHeight: 260,
              overflowY: "auto",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 8px", width: 80 }}>
                    Cat
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", width: 80 }}>
                    Division
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    Division name
                  </th>
                </tr>
              </thead>
              <tbody>
                {(catMappings.length
                  ? catMappings
                  : [
                      {
                        cat: "DRY",
                        divisionCode: "09",
                        divisionName: "Finishes",
                      },
                      {
                        cat: "FCC",
                        divisionCode: "09",
                        divisionName: "Finishes",
                      },
                      {
                        cat: "PLM",
                        divisionCode: "15",
                        divisionName: "Mechanical (HVAC, Plumbing)",
                      },
                      {
                        cat: "ELE",
                        divisionCode: "16",
                        divisionName: "Electrical",
                      },
                    ]
                ).map((row) => (
                  <tr key={`${row.cat}-${row.divisionCode}`}>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                        fontWeight: 600,
                      }}
                    >
                      {row.cat}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.divisionCode}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      {row.divisionName ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PageCard>
  );
}
