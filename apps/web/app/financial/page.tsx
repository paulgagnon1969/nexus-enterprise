"use client";

import { memo, useEffect, useMemo, useState } from "react";
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

// Recent Golden price list uploads (PriceList revisions).
type GoldenUploadSummary = {
  id: string;
  label: string;
  revision: number;
  effectiveDate?: string | null;
  uploadedAt?: string | null;
  itemCount: number;
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
  createdAt?: string | null;
  updatedAt?: string | null;
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

type ImportJobDto = {
  id: string;
  companyId: string;
  projectId: string | null;
  createdByUserId: string;
  type: string;
  status: string;
  progress: number;
  message: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export default function FinancialPage() {
  const [activeSection, setActiveSection] = useState<FinancialSection>("PRICELIST_TREE");
  const [uploading, setUploading] = useState(false);
  const [priceListUploadMessage, setPriceListUploadMessage] = useState<string | null>(null);
  const [priceListUploadError, setPriceListUploadError] = useState<string | null>(null);
  const [componentsUploadMessage, setComponentsUploadMessage] = useState<string | null>(null);
  const [componentsUploadError, setComponentsUploadError] = useState<string | null>(null);

  const [priceListFileName, setPriceListFileName] = useState<string | null>(null);
  const [componentsFileName, setComponentsFileName] = useState<string | null>(null);
  type CurrentGolden = {
    id: string;
    label: string;
    revision: number;
    effectiveDate?: string | null;
    uploadedAt?: string | null;
    itemCount: number;
  } | null;

  const [currentGolden, setCurrentGolden] = useState<CurrentGolden>(null);
  const [lastPriceListUpload, setLastPriceListUpload] = useState<
    | {
        at: string | null;
        byName: string | null;
        byEmail: string | null;
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

  const [goldenUploads, setGoldenUploads] = useState<GoldenUploadSummary[]>([]);
  const [goldenUploadsError, setGoldenUploadsError] = useState<string | null>(null);
  const [loadingGoldenUploads, setLoadingGoldenUploads] = useState(false);

  const [pendingImports, setPendingImports] = useState<Record<string, number>>({});
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [goldenHistoryError, setGoldenHistoryError] = useState<string | null>(null);
  const [loadingGoldenHistory, setLoadingGoldenHistory] = useState(false);

  const [componentsItems, setComponentsItems] = useState<GoldenItemWithComponents[]>([]);
  const [componentsError, setComponentsError] = useState<string | null>(null);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentsActivityFilter, setComponentsActivityFilter] = useState<string>("");
  const [lastComponentsUpload, setLastComponentsUpload] = useState<
    | {
        at: string | null;
        byName: string | null;
        byEmail: string | null;
      }
    | null
  >(null);

  // Estimated seconds remaining for Golden uploads (client-side heuristic).
  const [priceListEta, setPriceListEta] = useState<number | null>(null);
  const [componentsEta, setComponentsEta] = useState<number | null>(null);

  // Last Golden-related import jobs (so we can poll status after enqueue).
  const [priceListJob, setPriceListJob] = useState<ImportJobDto | null>(null);
  const [componentsJob, setComponentsJob] = useState<ImportJobDto | null>(null);

  // Helper: refresh Golden price list-related views after a job completes.
  async function refreshGoldenPriceListViews() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    // Current Golden summary
    try {
      const priceListRes = await fetch(`${API_BASE}/pricing/price-list/current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (priceListRes.ok) {
        const json = await priceListRes.json();
        if (!json) {
          setCurrentGolden(null);
          setLastPriceListUpload(null);
        } else {
          setCurrentGolden({
            id: json.id,
            label: json.label,
            revision: json.revision,
            effectiveDate: json.effectiveDate ?? null,
            uploadedAt: json.createdAt ?? null,
            itemCount: json.itemCount ?? 0,
          });
          if (json.lastPriceListUpload) {
            setLastPriceListUpload({
              at: json.lastPriceListUpload.at ?? null,
              byName: json.lastPriceListUpload.byName ?? null,
              byEmail: json.lastPriceListUpload.byEmail ?? null,
            });
          } else {
            setLastPriceListUpload(null);
          }
        }
        setSummaryError(null);
      } else {
        const text = await priceListRes.text().catch(() => "");
        setSummaryError(
          `Failed to load current price list (${priceListRes.status}) ${text}`,
        );
      }
    } catch (err: any) {
      setSummaryError(err?.message ?? "Failed to load current price list.");
    }

    // Golden price list table
    setLoadingGoldenTable(true);
    try {
      const tableRes = await fetch(`${API_BASE}/pricing/price-list/table`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!tableRes.ok) {
        const text = await tableRes.text().catch(() => "");
        throw new Error(
          `Failed to load Golden price list table (${tableRes.status}) ${text}`,
        );
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
      setGoldenTableError(null);
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
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!historyRes.ok) {
        const text = await historyRes.text().catch(() => "");
        throw new Error(
          `Failed to load Golden price list history (${historyRes.status}) ${text}`,
        );
      }
      const json = (await historyRes.json()) as GoldenPriceUpdateLogEntry[];
      setGoldenHistory(Array.isArray(json) ? json : []);
      setGoldenHistoryError(null);
    } catch (err: any) {
      setGoldenHistoryError(
        err?.message ?? "Failed to load Golden price list history.",
      );
    } finally {
      setLoadingGoldenHistory(false);
    }

    // Recent Golden uploads summary
    setLoadingGoldenUploads(true);
    try {
      const uploadsRes = await fetch(`${API_BASE}/pricing/price-list/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!uploadsRes.ok) {
        const text = await uploadsRes.text().catch(() => "");
        throw new Error(
          `Failed to load Golden uploads (${uploadsRes.status}) ${text}`,
        );
      }
      const json = (await uploadsRes.json()) as GoldenUploadSummary[];
      setGoldenUploads(Array.isArray(json) ? json : []);
      setGoldenUploadsError(null);
    } catch (err: any) {
      setGoldenUploadsError(
        err?.message ?? "Failed to load Golden uploads.",
      );
    } finally {
      setLoadingGoldenUploads(false);
    }

    // Pending imports summary
    try {
      const pendingRes = await fetch(`${API_BASE}/import-jobs/pending`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pendingRes.ok) {
        const json = (await pendingRes.json()) as Record<string, number>;
        setPendingImports(json || {});
        setPendingError(null);
      } else if (pendingRes.status !== 404) {
        const text = await pendingRes.text().catch(() => "");
        setPendingError(
          `Unable to load pending imports (${pendingRes.status}) ${text}`,
        );
      }
    } catch (err: any) {
      setPendingError(err?.message ?? "Unable to load pending imports.");
    }
  }

  // Helper: refresh Golden components view after a components job completes.
  async function refreshGoldenComponentsView() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    // Pending imports summary
    try {
      const pendingRes = await fetch(`${API_BASE}/import-jobs/pending`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pendingRes.ok) {
        const json = (await pendingRes.json()) as Record<string, number>;
        setPendingImports(json || {});
        setPendingError(null);
      } else if (pendingRes.status !== 404) {
        const text = await pendingRes.text().catch(() => "");
        setPendingError(
          `Unable to load pending imports (${pendingRes.status}) ${text}`,
        );
      }
    } catch (err: any) {
      setPendingError(err?.message ?? "Unable to load pending imports.");
    }

    // Golden components
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
        lastComponentsUpload?: {
          at?: string | null;
          byName?: string | null;
          byEmail?: string | null;
        } | null;
      };
      setComponentsItems(json.items ?? []);
      setLastComponentsUpload(
        json.lastComponentsUpload
          ? {
              at: json.lastComponentsUpload.at ?? null,
              byName: json.lastComponentsUpload.byName ?? null,
              byEmail: json.lastComponentsUpload.byEmail ?? null,
            }
          : null,
      );
      setComponentsError(null);
    } catch (err: any) {
      setComponentsError(err?.message ?? "Failed to load Golden components.");
    } finally {
      setLoadingComponents(false);
    }
  }

  // Global 1-second tick that decrements any active ETAs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      setPriceListEta(prev => (prev != null && prev > 0 ? prev - 1 : prev));
      setComponentsEta(prev => (prev != null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Poll Golden price list job while it is QUEUED/RUNNING.
  useEffect(() => {
    if (!priceListJob || !priceListJob.id) return;
    if (priceListJob.status === "SUCCEEDED" || priceListJob.status === "FAILED") return;

    const intervalId = window.setInterval(() => {
      void pollImportJob(priceListJob.id, async job => {
        setPriceListJob(job);
        if (job.status === "SUCCEEDED") {
          setPriceListEta(null);
          setUploading(false);
          await refreshGoldenPriceListViews();
        }
        if (job.status === "FAILED") {
          setPriceListEta(null);
          setUploading(false);
        }
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [priceListJob?.id, priceListJob?.status]);

  // Poll Golden components job while it is QUEUED/RUNNING.
  useEffect(() => {
    if (!componentsJob || !componentsJob.id) return;
    if (componentsJob.status === "SUCCEEDED" || componentsJob.status === "FAILED") return;

    const intervalId = window.setInterval(() => {
      void pollImportJob(componentsJob.id, async job => {
        setComponentsJob(job);
        if (job.status === "SUCCEEDED") {
          setComponentsEta(null);
          setUploading(false);
          await refreshGoldenComponentsView();
        }
        if (job.status === "FAILED") {
          setComponentsEta(null);
          setUploading(false);
        }
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [componentsJob?.id, componentsJob?.status]);

  useEffect(() => {
    setPriceListUploadMessage(null);
    setPriceListUploadError(null);
    setComponentsUploadMessage(null);
    setComponentsUploadError(null);
    setDivisionError(null);
    setGoldenTableError(null);
    setGoldenHistoryError(null);
    setComponentsError(null);
    setPendingError(null);

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
          setLastPriceListUpload(null);
        } else {
          setCurrentGolden({
            id: json.id,
            label: json.label,
            revision: json.revision,
            effectiveDate: json.effectiveDate ?? null,
            uploadedAt: json.createdAt ?? null,
            itemCount: json.itemCount ?? 0,
          });
          if (json.lastPriceListUpload) {
            setLastPriceListUpload({
              at: json.lastPriceListUpload.at ?? null,
              byName: json.lastPriceListUpload.byName ?? null,
              byEmail: json.lastPriceListUpload.byEmail ?? null,
            });
          } else {
            setLastPriceListUpload(null);
          }
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

      // Pending import jobs summary (company-wide)
      try {
        const pendingRes = await fetch(`${API_BASE}/import-jobs/pending`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (pendingRes.ok) {
          const json = (await pendingRes.json()) as Record<string, number>;
          setPendingImports(json || {});
        } else if (pendingRes.status !== 404) {
          const text = await pendingRes.text().catch(() => "");
          setPendingError(
            `Unable to load pending imports (${pendingRes.status}) ${text}`,
          );
        }
      } catch (err: any) {
        setPendingError(err?.message ?? "Unable to load pending imports.");
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

      // Golden uploads summary
      setLoadingGoldenUploads(true);
      try {
        const uploadsRes = await fetch(`${API_BASE}/pricing/price-list/uploads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!uploadsRes.ok) {
          const text = await uploadsRes.text().catch(() => "");
          throw new Error(
            `Failed to load Golden uploads (${uploadsRes.status}) ${text}`,
          );
        }

        const json = (await uploadsRes.json()) as GoldenUploadSummary[];
        setGoldenUploads(Array.isArray(json) ? json : []);
      } catch (err: any) {
        setGoldenUploadsError(
          err?.message ?? "Failed to load Golden uploads.",
        );
      } finally {
        setLoadingGoldenUploads(false);
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
          lastComponentsUpload?: {
            at?: string | null;
            byName?: string | null;
            byEmail?: string | null;
          } | null;
        };

        setComponentsItems(json.items ?? []);
        setLastComponentsUpload(
          json.lastComponentsUpload
            ? {
                at: json.lastComponentsUpload.at ?? null,
                byName: json.lastComponentsUpload.byName ?? null,
                byEmail: json.lastComponentsUpload.byEmail ?? null,
              }
            : null,
        );
      } catch (err: any) {
        setComponentsError(err?.message ?? "Failed to load Golden components.");
      } finally {
        setLoadingComponents(false);
      }
    })();
  }, []);

  function estimateSecondsFromFileSize(bytes: number): number {
    const mb = bytes / (1024 * 1024);
    if (mb <= 1) return 60; // under 1 minute
    if (mb <= 5) return 3 * 60; // about 1–3 minutes
    if (mb <= 20) return 6 * 60; // about 3–6 minutes
    return 10 * 60; // large file, up to ~10 minutes
  }

  function formatEta(seconds: number): string {
    if (seconds <= 0) return "~0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  }

  // Poll a single import job until it reaches a terminal state.
  async function pollImportJob(jobId: string, onUpdate: (job: ImportJobDto) => void) {
    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/import-jobs/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;
      const job = (await res.json()) as ImportJobDto;
      onUpdate(job);
    } catch {
      // ignore transient polling errors
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPriceListUploadMessage(null);
    setPriceListUploadError(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setPriceListUploadError("Please choose a CSV file to upload.");
      return;
    }

    const file = fileInput.files[0];
    if (file) {
      setPriceListFileName(file.name);
      setPriceListUploadMessage("Uploading GOLDEN Price List (PETL)…");
      if (file.size) {
        setPriceListEta(estimateSecondsFromFileSize(file.size));
      } else {
        setPriceListEta(null);
      }
    } else {
      setPriceListFileName(null);
      setPriceListEta(null);
    }
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setPriceListUploadError("Missing access token. Please log in again.");
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
        setPriceListUploadMessage(
          `Golden Price List (PETL) import started as job ${json.jobId}. You can go about your business; this may take a few minutes. Refresh this page later to see the updated Golden list.`,
        );
        // Start tracking this job so we can show status.
        setPriceListJob({
          id: json.jobId,
          companyId: "",
          projectId: null,
          createdByUserId: "",
          type: "PRICE_LIST",
          status: "QUEUED",
          progress: 0,
          message: null,
          createdAt: new Date().toISOString(),
        });
      } else {
        const todayLabel = new Date().toLocaleDateString();
        setPriceListUploadMessage(
          `Golden Price List (PETL) upload complete. Revision ${json.revision} is now active as of ${todayLabel}.`,
        );
        // Clear any previous ETA/job tracking and immediately refresh the
        // Golden views so the new revision/row counts appear without a
        // full page reload.
        setPriceListEta(null);
        setPriceListJob(null);
        await refreshGoldenPriceListViews();
      }

      form.reset();
      setPriceListFileName(null);
    } catch (err: any) {
      setPriceListUploadError(err?.message ?? "Golden Price List (PETL) upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleComponentsUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setComponentsUploadMessage(null);
    setComponentsUploadError(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("componentsFile") as HTMLInputElement | null;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setComponentsUploadError("Please choose a components CSV file to upload.");
      return;
    }

    const file = fileInput.files[0];
    if (file) {
      setComponentsFileName(file.name);
      setComponentsUploadMessage("Uploading GOLDEN Components list…");
      if (file.size) {
        setComponentsEta(estimateSecondsFromFileSize(file.size));
      } else {
        setComponentsEta(null);
      }
    } else {
      setComponentsFileName(null);
      setComponentsEta(null);
    }
    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setComponentsUploadError("Missing access token. Please log in again.");
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
        setComponentsUploadMessage(
          `GOLDEN Components list import started as job ${json.jobId}. You can continue working while it processes.`,
        );
        setComponentsJob({
          id: json.jobId,
          companyId: "",
          projectId: null,
          createdByUserId: "",
          type: "PRICE_LIST_COMPONENTS",
          status: "QUEUED",
          progress: 0,
          message: null,
          createdAt: new Date().toISOString(),
        });
      } else {
        setComponentsUploadMessage(
          `GOLDEN Components list upload complete for ${json.itemCount} items (${json.componentCount} components).`,
        );
        // Clear ETA/job tracking and refresh the components view so the
        // new components are visible without a manual reload.
        setComponentsEta(null);
        setComponentsJob(null);
        await refreshGoldenComponentsView();
      }

      form.reset();
      setComponentsFileName(null);
    } catch (err: any) {
      setComponentsUploadError(err?.message ?? "GOLDEN Components list upload failed.");
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

      {/* Pending imports summary */}
      <div
        style={{
          marginBottom: 12,
          padding: 8,
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Pending imports</div>
        {pendingError ? (
          <div style={{ color: "#b91c1c" }}>{pendingError}</div>
        ) : Object.keys(pendingImports).length === 0 ? (
          <div style={{ color: "#6b7280" }}>No queued or running imports for this company.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {Object.entries(pendingImports).map(([type, count]) => (
              <li key={type}>
                {type}: <strong>{count}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

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
              setPriceListUploadMessage(null);
              setPriceListUploadError(null);
              setComponentsUploadMessage(null);
              setComponentsUploadError(null);
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
            Pricelist Tree – Golden PETL (Price List) & Components
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            Import the master Xactimate price list as the current
            <strong> Golden PETL (Price List)</strong>, then layer
            <strong> Golden Components</strong> on top. The PETL upload controls the
            <em>line items</em> (CAT/SEL rows and unit prices). The Components upload
            controls the <em>breakdown</em> for those PETL rows (materials, labor,
            equipment) and can be revised independently.
            Only <strong>OWNER</strong>/<strong>ADMIN</strong> roles (or Nexus Super Admins)
            can upload a new Golden price list or components.
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
              <>
                <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>
                  Current Golden PETL (Price List): <strong>{currentGolden.label}</strong> (rev.
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
                  {currentGolden.uploadedAt && (
                    <>
                      {" "}(uploaded
                      {" "}
                      {new Date(currentGolden.uploadedAt).toLocaleDateString()}
                      )
                    </>
                  )}
                </p>
                {lastPriceListUpload?.at && (
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>
                    Last PETL upload: {new Date(lastPriceListUpload.at).toLocaleString()}
                    {lastPriceListUpload.byName || lastPriceListUpload.byEmail ? (
                      <>
                        {" "}by
                        {" "}
                        <strong>
                          {lastPriceListUpload.byName || lastPriceListUpload.byEmail}
                        </strong>
                      </>
                    ) : null}
                  </p>
                )}
              </>
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

          {/* Upload + recent Golden uploads (side by side) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
              gap: 12,
              marginBottom: 12,
            }}
          >
            {/* Golden PETL upload */}
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px dashed #d1d5db",
                background: "#f9fafb",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Upload Golden PETL (master Xactimate price list)
              </div>
              <form onSubmit={handleUpload}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>
                    Upload PETL CSV (Xactimate master price list)
                  </span>
                  <input type="file" name="file" accept=".csv,text/csv" />
                  {priceListFileName && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: "#4b5563",
                        padding: "2px 4px",
                        borderRadius: 4,
                        background: "#eef2ff",
                        overflowX: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      Selected file: {priceListFileName}
                    </div>
                  )}
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
                  {uploading ? "Uploading…" : "Upload Golden PETL"}
                </button>
              </form>

              {priceListEta != null && (
                <p style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                  {priceListEta > 0 && uploading
                    ? `Est. time remaining (approx): ${formatEta(priceListEta)}`
                    : uploading
                    ? "Taking longer than expected… still uploading to server."
                    : "Upload complete; background processing will finish shortly."}
                </p>
              )}
              {priceListJob && (
                <p style={{ marginTop: 2, fontSize: 11, color: "#4b5563" }}>
                  Golden price list job {priceListJob.id}: {priceListJob.status}
                  {typeof priceListJob.progress === "number"
                    ? ` (${priceListJob.progress}% )`
                    : ""}
                  {priceListJob.message ? ` – ${priceListJob.message}` : ""}
                </p>
              )}

              {priceListUploadMessage && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#16a34a" }}>
                  {priceListUploadMessage}
                </p>
              )}
              {priceListUploadError && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
                  {priceListUploadError}
                </p>
              )}
            </div>

            {/* Recent Golden uploads (last 10) */}
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px dashed #d1d5db",
                background: "#f9fafb",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Recent Golden PETL uploads (last 10)
              </div>
              {goldenUploadsError ? (
                <div style={{ fontSize: 11, color: "#b91c1c" }}>{goldenUploadsError}</div>
              ) : goldenUploads.length === 0 ? (
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  No prior Golden uploads recorded yet.
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: 120,
                    overflowY: "auto",
                    borderRadius: 4,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 4,
                    marginTop: 2,
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 11,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "2px 4px",
                            width: 90,
                          }}
                        >
                          Uploaded
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "2px 4px",
                            width: 90,
                          }}
                        >
                          Effective
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "2px 4px",
                            width: 40,
                          }}
                        >
                          Rev
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "2px 4px",
                            width: 70,
                          }}
                        >
                          Items
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "2px 4px",
                          }}
                        >
                          Label
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {goldenUploads.map((u) => {
                        const isCurrent = u.id === currentGolden?.id;
                        return (
                          <tr key={u.id}>
                            <td
                              style={{
                                padding: "2px 4px",
                                borderTop: "1px solid #f3f4f6",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {u.uploadedAt
                                ? new Date(u.uploadedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "2px 4px",
                                borderTop: "1px solid #f3f4f6",
                                whiteSpace: "nowrap",
                                color: "#6b7280",
                              }}
                            >
                              {u.effectiveDate
                                ? new Date(u.effectiveDate).toLocaleDateString()
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "2px 4px",
                                borderTop: "1px solid #f3f4f6",
                                textAlign: "left",
                                fontWeight: isCurrent ? 600 : 400,
                              }}
                            >
                              {u.revision}
                            </td>
                            <td
                              style={{
                                padding: "2px 4px",
                                borderTop: "1px solid #f3f4f6",
                                textAlign: "right",
                              }}
                            >
                              {u.itemCount.toLocaleString()}
                            </td>
                            <td
                              style={{
                                padding: "2px 4px",
                                borderTop: "1px solid #f3f4f6",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {u.label}
                              {isCurrent && (
                                <span style={{ color: "#16a34a" }}>
                                  {" "}(current)
                                </span>
                              )}
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

          {/* Components upload + status */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
              gap: 12,
              marginBottom: 12,
            }}
          >
            {/* Golden Components upload */}
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
                Upload Golden Components (per CODE / CATSEL)
              </h4>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                Upload an ACT-specific components report (e.g. Materials, Labor, R/R). The
                file must include Cat, Sel, Activity, Desc, Component Code, Qty, Material,
                Labor, and Equipment columns. Components are attached to matching Golden
                PETL line items using the (Cat, Sel, Activity, Description) key.
              </p>
              <form onSubmit={handleComponentsUpload}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>
                    Upload Components CSV (ACT-specific Xactimate report)
                  </span>
                  <input type="file" name="componentsFile" accept=".csv,text/csv" />
                  {componentsFileName && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: "#4b5563",
                        padding: "2px 4px",
                        borderRadius: 4,
                        background: "#eef2ff",
                        overflowX: "auto",
                        whiteSpace: "pre",
                      }}
                    >
                      Selected file: {componentsFileName}
                    </div>
                  )}
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

              {componentsEta != null && (
                <p style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                  {componentsEta > 0 && uploading
                    ? `Est. time remaining (approx): ${formatEta(componentsEta)}`
                    : uploading
                    ? "Taking longer than expected… still uploading to server."
                    : "Upload complete; background processing will finish shortly."}
                </p>
              )}
              {componentsJob && (
                <p style={{ marginTop: 2, fontSize: 11, color: "#4b5563" }}>
                  Golden components job {componentsJob.id}: {componentsJob.status}
                  {typeof componentsJob.progress === "number"
                    ? ` (${componentsJob.progress}% )`
                    : ""}
                  {componentsJob.message ? ` – ${componentsJob.message}` : ""}
                </p>
              )}

              {componentsUploadMessage && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#16a34a" }}>
                  {componentsUploadMessage}
                </p>
              )}
              {componentsUploadError && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
                  {componentsUploadError}
                </p>
              )}
            </div>

            {/* Components status card */}
            <GoldenComponentsCoverageCard
              loadingComponents={loadingComponents}
              componentsItems={componentsItems}
              currentItemCount={currentGolden?.itemCount ?? null}
              lastComponentsUpload={lastComponentsUpload}
              onViewDetails={() => setActiveSection("GOLDEN_COMPONENTS")}
            />
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
            <GoldenPriceListTable
              goldenRows={goldenRows}
              loadingGoldenTable={loadingGoldenTable}
              goldenTableError={goldenTableError}
            />
          {/* Golden price list revision log */}
          <GoldenPriceListHistory
            goldenHistory={goldenHistory}
            goldenHistoryError={goldenHistoryError}
            loadingGoldenHistory={loadingGoldenHistory}
          />
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
            <GoldenComponentsTable componentsItems={componentsItems} />
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
}

type GoldenComponentsCoverageProps = {
  loadingComponents: boolean;
  componentsItems: GoldenItemWithComponents[];
  currentItemCount: number | null;
  lastComponentsUpload: {
    at: string | null;
    byName: string | null;
    byEmail: string | null;
  } | null;
  onViewDetails: () => void;
};

const GoldenComponentsCoverageCard = memo(function GoldenComponentsCoverageCard({
  loadingComponents,
  componentsItems,
  currentItemCount,
  lastComponentsUpload,
  onViewDetails,
}: GoldenComponentsCoverageProps) {
  const { itemsWithComponents, totalComponents } = useMemo(() => {
    const itemsWithComponents = componentsItems.length;
    const totalComponents = componentsItems.reduce(
      (sum, item) => sum + (item.components?.length ?? 0),
      0,
    );
    return { itemsWithComponents, totalComponents };
  }, [componentsItems]);

  let lastUploadLabel: string | null = null;
  let lastUploadBy: string | null = null;
  if (lastComponentsUpload?.at) {
    lastUploadLabel = new Date(lastComponentsUpload.at).toLocaleString();
    lastUploadBy = lastComponentsUpload.byName || lastComponentsUpload.byEmail || null;
  }

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px dashed #d1d5db",
        background: "#f9fafb",
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          Golden Components coverage (per current PETL)
        </div>
        <button
          type="button"
          onClick={onViewDetails}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#374151",
            cursor: "pointer",
          }}
        >
          View details
        </button>
      </div>
      {loadingComponents ? (
        <div style={{ fontSize: 11, color: "#6b7280" }}>Loading components…</div>
      ) : componentsItems.length === 0 ? (
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          No Golden components have been imported yet for the current Golden PETL.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#374151" }}>
          <p style={{ margin: 0 }}>
            Items with components: <strong>{itemsWithComponents}</strong>
            {currentItemCount != null && (
              <>
                {" "}of <strong>{currentItemCount}</strong> Golden PETL line items
              </>
            )}
          </p>
          <p style={{ margin: "4px 0 0" }}>
            Total Golden Components: <strong>{totalComponents.toLocaleString()}</strong>
            {totalComponents === 0 && (
              <span style={{ color: "#6b7280" }}>
                {" "}- Components = 0 when there is no inventory in stock
              </span>
            )}
          </p>
          {lastUploadLabel && (
            <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
              Last components upload: {lastUploadLabel}
              {lastUploadBy && (
                <>
                  {" "}by <strong>{lastUploadBy}</strong>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

type GoldenPriceListTableProps = {
  goldenRows: GoldenPriceListRow[];
  loadingGoldenTable: boolean;
  goldenTableError: string | null;
};

const GoldenPriceListTable = memo(function GoldenPriceListTable({
  goldenRows,
  loadingGoldenTable,
  goldenTableError,
}: GoldenPriceListTableProps) {
  return (
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
            Showing Cat/Sel rows with mapped construction divisions. This is a read-only
            view of the master Xactimate file.
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
        <div style={{ padding: 8, fontSize: 11, color: "#b91c1c" }}>{goldenTableError}</div>
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
                <th style={{ textAlign: "left", padding: "4px 6px", width: 60 }}>Line</th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 70 }}>Cat</th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 70 }}>Sel</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Description</th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 60 }}>Unit</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 90 }}>
                  Last known price
                </th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 90 }}>
                  Unit price
                </th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 80 }}>Division</th>
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
  );
});

type GoldenPriceListHistoryProps = {
  goldenHistory: GoldenPriceUpdateLogEntry[];
  goldenHistoryError: string | null;
  loadingGoldenHistory: boolean;
};

const GoldenPriceListHistory = memo(function GoldenPriceListHistory({
  goldenHistory,
  goldenHistoryError,
  loadingGoldenHistory,
}: GoldenPriceListHistoryProps) {
  return (
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
        <div style={{ padding: 8, fontSize: 11, color: "#b91c1c" }}>{goldenHistoryError}</div>
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
                <th style={{ textAlign: "left", padding: "4px 6px", width: 120 }}>When</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Project</th>
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Estimate</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 70 }}>Items</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 80 }}>Avg Δ</th>
                <th style={{ textAlign: "right", padding: "4px 6px", width: 80 }}>Avg Δ %</th>
                <th style={{ textAlign: "left", padding: "4px 6px", width: 120 }}>By</th>
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
  );
});

type GoldenComponentsTableProps = {
  componentsItems: GoldenItemWithComponents[];
};

const GoldenComponentsTable = memo(function GoldenComponentsTable({
  componentsItems,
}: GoldenComponentsTableProps) {
  return (
    <div
      style={{
        maxHeight: "70vh",
        minHeight: "40vh",
        overflow: "auto",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        background: "#ffffff",
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
            <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>Cat</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>Sel</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 60 }}>ACT</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 80 }}>Division</th>
            <th style={{ padding: "4px 6px", textAlign: "left" }}>Line description</th>
            <th style={{ padding: "4px 6px", textAlign: "left", width: 120 }}>Component</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 70 }}>Qty</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>Material</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>Labor</th>
            <th style={{ padding: "4px 6px", textAlign: "right", width: 80 }}>Equip</th>
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
                  {item.divisionCode ?? ""} {item.divisionName ? `– ${item.divisionName}` : ""}
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
  );
});
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
              gap: 16,
              alignItems: "stretch",
            }}
          >
            {/* 16 CSI divisions */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 8,
                background: "#f9fafb",
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                maxHeight: "60vh",
              }}
            >
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
                  marginBottom: 8,
                  overflowY: "auto",
                  paddingRight: 4,
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
                      background: "#ffffff",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>Division {div.code}</div>
                    <div>{div.name}</div>
                  </div>
                ))}
              </div>

              {divisionError && (
                <p style={{ fontSize: 11, color: "#b91c1c", marginBottom: 4 }}>
                  {divisionError}
                </p>
              )}
            </div>

            {/* Cat → Division mapping table */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 8,
                background: "#ffffff",
                fontSize: 12,
                maxHeight: "60vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                Xactimate <strong>Cat</strong> codes mapped to divisions. This is the lookup
                used to roll up estimate revenue by construction division.
              </p>
              <div
                style={{
                  flex: 1,
                  maxHeight: "100%",
                  overflowY: "auto",
                  borderRadius: 4,
                  border: "1px solid #e5e7eb",
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
