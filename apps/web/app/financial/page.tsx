"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { PageCard } from "../ui-shell";
import {
  GoldenComponentsCoverageCard,
  GoldenPriceListTable,
  GoldenPriceListHistory,
  GoldenComponentsTable,
} from "./financial-components";
import {
  fetchRootLocations as fetchAssetLocationsRoots,
  fetchChildLocations as fetchAssetLocationChildren,
  fetchLocationHoldings as fetchAssetLocationHoldings,
  fetchLocationHistory as fetchAssetLocationHistory,
  type Location as AssetLocation,
  type Holdings as AssetHoldings,
  type LocationMovement as AssetLocationMovement,
} from "../../lib/api/locations";
import { CostBookPickerModal } from "../components/cost-book-picker-modal";
import { RawDetailModal } from "../components/RawDataTable";
import { ColumnCustomizer, useColumnPrefs } from "../components/ColumnCustomizer";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type FinancialSection =
  | "COST_BOOK"
  | "PRICELIST_TREE"
  | "GOLDEN_COMPONENTS"
  | "ESTIMATES"
  | "ASSET_LOGISTICS"
  | "ORIGINAL_CONTRACT"
  | "CHANGES"
  | "CURRENT_CONTRACT_TOTAL"
  | "PAYROLL"
  | "TIME_ACCOUNTING"
  | "FINANCIAL_ALLOCATION"
  | "DIVISION_CODES_LOOKUP"
  | "FORECASTING"
  | "SUPPLIER_CATALOG"
  | "BANKING";

/** Card definitions for the Financial landing page grid. */
type FinancialCardGroup = "Pricing & Estimation" | "Contracts & Changes" | "Financial Operations" | "Resources & Logistics";

type FinancialCardDef = {
  id: FinancialSection | "EXT_SUPPLIER_CATALOG" | "EXT_RECONCILIATION" | "EXT_RECEIPTS" | "EXT_AGREEMENTS" | "EXT_ASSETS" | "COST_BOOK";
  icon: string;
  title: string;
  subtitle: string;
  group: FinancialCardGroup;
  href?: string;
};

const FINANCIAL_CARDS_RAW: FinancialCardDef[] = [
  // Pricing & Estimation
  {
    id: "COST_BOOK",
    icon: "📚",
    title: "Company Cost Book",
    subtitle: "Search & manage your company's cost book items",
    group: "Pricing & Estimation",
  },
  {
    id: "DIVISION_CODES_LOOKUP",
    icon: "🏗️",
    title: "Division Codes Lookup",
    subtitle: "CSI-16 divisions & Xactimate category mapping",
    group: "Pricing & Estimation",
  },
  {
    id: "ESTIMATES",
    icon: "📐",
    title: "Estimates / Quotations",
    subtitle: "Imported estimates, versions & comparison",
    group: "Pricing & Estimation",
  },
  {
    id: "FORECASTING",
    icon: "📈",
    title: "Forecasting",
    subtitle: "PETL-driven material requirements & order timing",
    group: "Pricing & Estimation",
  },
  {
    id: "GOLDEN_COMPONENTS",
    icon: "🧩",
    title: "Golden Components",
    subtitle: "Material, labor & equipment breakdowns per line",
    group: "Pricing & Estimation",
  },
  {
    id: "PRICELIST_TREE",
    icon: "📋",
    title: "Pricelist Tree",
    subtitle: "Golden PETL line items, unit prices & uploads",
    group: "Pricing & Estimation",
  },
  {
    id: "EXT_SUPPLIER_CATALOG",
    icon: "🏪",
    title: "Supplier Catalog",
    subtitle: "Search HD, Lowe's & compare with CostBook",
    href: "/tools/supplier-catalog",
    group: "Pricing & Estimation",
  },
  // Contracts & Changes
  {
    id: "EXT_AGREEMENTS",
    icon: "📑",
    title: "Agreements & Contracts",
    subtitle: "Create, manage & sign contract packages",
    href: "/financial/agreements",
    group: "Contracts & Changes",
  },
  {
    id: "CHANGES",
    icon: "🔀",
    title: "Changes",
    subtitle: "Change orders, approved vs pending",
    group: "Contracts & Changes",
  },
  {
    id: "CURRENT_CONTRACT_TOTAL",
    icon: "💰",
    title: "Current Contract Total",
    subtitle: "Rollup of contract, changes & adjustments",
    group: "Contracts & Changes",
  },
  {
    id: "ORIGINAL_CONTRACT",
    icon: "📄",
    title: "Original Contract",
    subtitle: "Baseline contract value & schedule of values",
    group: "Contracts & Changes",
  },
  // Financial Operations
  {
    id: "BANKING",
    icon: "🏦",
    title: "Banking & Transactions",
    subtitle: "Connect bank accounts, sync & analyze transactions",
    group: "Financial Operations",
  },
  {
    id: "FINANCIAL_ALLOCATION",
    icon: "📊",
    title: "Financial Allocation",
    subtitle: "Revenue & cost allocation rules across projects",
    group: "Financial Operations",
  },
  {
    id: "EXT_RECONCILIATION",
    icon: "🔄",
    title: "Financial Reconciliation",
    subtitle: "Aggregate, reconcile & assign transactions across sources",
    href: "/financial/reconciliation",
    group: "Financial Operations",
  },
  {
    id: "EXT_RECEIPTS",
    icon: "🧾",
    title: "Email Receipts",
    subtitle: "Captured receipts from supplier emails (HD, Lowe's)",
    href: "/financial/receipts",
    group: "Financial Operations",
  },
  {
    id: "PAYROLL",
    icon: "💵",
    title: "Payroll",
    subtitle: "Time, labor costs & payroll allocations",
    group: "Financial Operations",
  },
  // Resources & Logistics
  {
    id: "ASSET_LOGISTICS",
    icon: "🚛",
    title: "Asset Logistics",
    subtitle: "Locations, holdings & inventory movements",
    group: "Resources & Logistics",
  },
  {
    id: "EXT_ASSETS",
    icon: "🔧",
    title: "Asset Management",
    subtitle: "Equipment, tools & rental inventory CRUD",
    href: "/assets",
    group: "Resources & Logistics",
  },
];

// Group cards and sort alphabetically within each group
const FINANCIAL_CARDS_GROUPED = FINANCIAL_CARDS_RAW.reduce(
  (acc, card) => {
    if (!acc[card.group]) acc[card.group] = [];
    acc[card.group].push(card);
    return acc;
  },
  {} as Record<FinancialCardGroup, FinancialCardDef[]>
);

// Sort each group alphabetically by title
for (const group in FINANCIAL_CARDS_GROUPED) {
  FINANCIAL_CARDS_GROUPED[group as FinancialCardGroup].sort((a, b) => a.title.localeCompare(b.title));
}

// Flatten back to array for backward compatibility (for now)
const FINANCIAL_CARDS = FINANCIAL_CARDS_RAW.sort((a, b) => a.title.localeCompare(b.title));

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
  projectId: string | null;
  projectName: string;
  estimateVersionId: string | null;
  estimateLabel: string | null;
  updatedCount: number;
  avgDelta: number;
  avgPercentDelta: number;
  userId: string | null;
  userName: string | null;
  source: "XACT_ESTIMATE" | "GOLDEN_PETL";
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
  const [, startUiTransition] = useTransition();

  const [activeSection, setActiveSection] = useState<FinancialSection | null>(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const section = url.searchParams.get("section") as FinancialSection | null;
      if (section) {
        return section;
      }
    }
    return null; // card landing by default
  });
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

  // Golden PETL search and Cost Book comparison
  const [goldenSearchTerm, setGoldenSearchTerm] = useState<string>("");
  type CostBookMatch = {
    cat: string | null;
    sel: string | null;
    activity: string | null;
    unitPrice: number | null;
    lastKnownUnitPrice: number | null;
    description: string | null;
  };
  const [costBookMatches, setCostBookMatches] = useState<CostBookMatch[]>([]);
  const [loadingCostBook, setLoadingCostBook] = useState(false);

  const [componentsItems, setComponentsItems] = useState<GoldenItemWithComponents[]>([]);
  const [componentsError, setComponentsError] = useState<string | null>(null);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentsLoaded, setComponentsLoaded] = useState(false);
  type ComponentsSummary = {
    itemsWithComponents: number;
    totalComponents: number;
  } | null;
  const [componentsSummary, setComponentsSummary] = useState<ComponentsSummary>(null);
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

  const [showInventoryLogisticsInfo, setShowInventoryLogisticsInfo] = useState(false);

  // ── Banking & Transactions state ──
  type BankConnectionDto = {
    id: string;
    institutionName: string | null;
    accountName: string | null;
    accountMask: string | null;
    accountType: string | null;
    accountSubtype: string | null;
    status: string;
    lastSyncedAt: string | null;
    createdAt: string;
    _count: { transactions: number };
  };
  type UnifiedTransactionDto = {
    id: string;
    source: string;
    date: string;
    description: string;
    amount: number;
    merchant: string | null;
    category: string | null;
    pending: boolean;
    projectId: string | null;
    projectName: string | null;
    extra: Record<string, any>;
  };
  type CsvImportBatchDto = {
    id: string;
    source: string;
    fileName: string;
    rowCount: number;
    totalAmount: number;
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
    createdAt: string;
    uploadedBy: { id: string; firstName: string | null; lastName: string | null; email: string | null };
  };
  type BankSummaryDto = {
    totalInflow: number;
    totalOutflow: number;
    net: number;
    transactionCount: number;
    byCategory: Record<string, { inflow: number; outflow: number; count: number }>;
  };
  const [bankConnections, setBankConnections] = useState<BankConnectionDto[]>([]);
  const [bankTransactions, setBankTransactions] = useState<UnifiedTransactionDto[]>([]);
  const [bankSummary, setBankSummary] = useState<BankSummaryDto | null>(null);
  const [bankTxTotal, setBankTxTotal] = useState(0);
  const [bankTxPage, setBankTxPage] = useState(1);
  const [bankTxPageSize, setBankTxPageSize] = useState(50);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankMerchantFilter, setBankMerchantFilter] = useState("");
  const [bankStartDate, setBankStartDate] = useState("");
  const [bankEndDate, setBankEndDate] = useState("");
  const [bankCategoryFilter, setBankCategoryFilter] = useState("");
  const [bankConnecting, setBankConnecting] = useState(false);
  const [bankSourceFilter, setBankSourceFilter] = useState("");
  // Account-level filter: "conn:<id>" for Plaid connections, "batch:<id>" for CSV batches
  const [bankAccountFilter, setBankAccountFilter] = useState("");
  const [csvBatches, setCsvBatches] = useState<CsvImportBatchDto[]>([]);
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvUploadSource, setCsvUploadSource] = useState("HD_PRO_XTRA");
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvExpandedSources, setCsvExpandedSources] = useState<Set<string>>(new Set());

  // Raw detail modal
  const [rawDetailOpen, setRawDetailOpen] = useState(false);
  const [rawDetailTxn, setRawDetailTxn] = useState<Record<string, any> | null>(null);
  const [rawDetailSource, setRawDetailSource] = useState<string>("");

  // Column customizer for unified table
  const { visibleColumns: bankVisibleCols, setVisibleColumns: setBankVisibleCols } = useColumnPrefs("ncc-banking-columns");

  // Sort / column filters
  type BankSortField = "date" | "description" | "merchant" | "category" | "amount" | "status" | "project";
  const [bankSortBy, setBankSortBy] = useState<BankSortField>("date");
  const [bankSortDir, setBankSortDir] = useState<"asc" | "desc">("desc");
  const [bankStatusFilter, setBankStatusFilter] = useState(""); // "" | "true" | "false"
  const [bankProjectFilter, setBankProjectFilter] = useState("");
  const [bankUnassignedFilter, setBankUnassignedFilter] = useState(false);
  const [bankCategories, setBankCategories] = useState<string[]>([]);
  type ProjectPickerItem = { id: string; name: string };
  const [bankProjects, setBankProjects] = useState<ProjectPickerItem[]>([]);

  // Bulk select
  const [bankSelectedIds, setBankSelectedIds] = useState<Set<string>>(new Set());
  const [bankBulkProjectId, setBankBulkProjectId] = useState<string>("");

  // Prescreen rerun
  const [prescreenRunning, setPrescreenRunning] = useState(false);
  const [prescreenResult, setPrescreenResult] = useState<string | null>(null);

  // Disposition change modal
  const [dispositionModalTxn, setDispositionModalTxn] = useState<UnifiedTransactionDto | null>(null);
  const [dispositionValue, setDispositionValue] = useState("");
  const [dispositionNote, setDispositionNote] = useState("");
  const [dispositionSaving, setDispositionSaving] = useState(false);
  const [bankDispositionFilter, setBankDispositionFilter] = useState("");
  const [bankAmountFilter, setBankAmountFilter] = useState("");

  // Duplicate expense scan
  const [dupScanLoading, setDupScanLoading] = useState(false);
  const [dupScanResults, setDupScanResults] = useState<{ scannedBills: number; lookbackDays: number; duplicateGroups: Array<{ id: string; type: string; confidence: number; reason: string; bills: Array<{ billId: string; projectId: string; projectName: string; vendorName: string; amount: number; date: string; status: string }> }>; total: number } | null>(null);

  // Category override modal
  const [categoryModalTxn, setCategoryModalTxn] = useState<UnifiedTransactionDto | null>(null);
  const [categoryValue, setCategoryValue] = useState("");
  const [categoryNote, setCategoryNote] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  // Last Golden-related import jobs
  const [priceListJob, setPriceListJob] = useState<ImportJobDto | null>(null);
  const [componentsJob, setComponentsJob] = useState<ImportJobDto | null>(null);

  // Asset Logistics state (shared tree + holdings view)
  type AssetLogisticsTreeNode = AssetLocation & {
    children?: AssetLogisticsTreeNode[];
    isExpanded?: boolean;
    isLoaded?: boolean;
  };

  const [assetLogisticsRoots, setAssetLogisticsRoots] = useState<AssetLogisticsTreeNode[]>([]);
  const [assetLogisticsSelected, setAssetLogisticsSelected] = useState<AssetLocation | null>(null);
  const [assetLogisticsHoldings, setAssetLogisticsHoldings] = useState<AssetHoldings | null>(null);
  const [assetLogisticsLoadingTree, setAssetLogisticsLoadingTree] = useState(false);
  const [assetLogisticsLoadingHoldings, setAssetLogisticsLoadingHoldings] = useState(false);
  const [assetLogisticsError, setAssetLogisticsError] = useState<string | null>(null);
  const [assetLogisticsHistory, setAssetLogisticsHistory] = useState<AssetLocationMovement[] | null>(null);
  const [assetLogisticsLoadingHistory, setAssetLogisticsLoadingHistory] = useState(false);

  type CompanyMemberSummary = {
    userId: string;
    name: string | null;
    email: string | null;
    role: string | null;
  };

  const [assetPeoplePickerOpen, setAssetPeoplePickerOpen] = useState(false);
  const [assetPeoplePickerLoading, setAssetPeoplePickerLoading] = useState(false);
  const [assetCompanyMembers, setAssetCompanyMembers] = useState<CompanyMemberSummary[] | null>(null);
  const [assetSelectedUserIds, setAssetSelectedUserIds] = useState<string[]>([]);
  const [assetPeopleSearch, setAssetPeopleSearch] = useState<string>('');

  const [assetPendingMoveAssetId, setAssetPendingMoveAssetId] = useState<string | null>(null);

  // Cost Book browser modal
  const [costBookBrowserOpen, setCostBookBrowserOpen] = useState(false);

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
      } | null;

      if (!json) {
        setGoldenRows([]);
      } else {
        setGoldenRows(json.rows ?? []);
      }
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
      const items = json.items ?? [];
      setComponentsItems(items);
      setLastComponentsUpload(
        json.lastComponentsUpload
          ? {
              at: json.lastComponentsUpload.at ?? null,
              byName: json.lastComponentsUpload.byName ?? null,
              byEmail: json.lastComponentsUpload.byEmail ?? null,
            }
          : null,
      );
      // Derive a lightweight coverage summary from the full payload so the
      // coverage card does not need to re-fetch.
      const itemsWithComponents = items.length;
      const totalComponents = items.reduce(
        (sum, item) => sum + (item.components?.length ?? 0),
        0,
      );
      setComponentsSummary({ itemsWithComponents, totalComponents });
      setComponentsLoaded(true);
      setComponentsError(null);
    } catch (err: any) {
      setComponentsError(err?.message ?? "Failed to load Golden components.");
    } finally {
      setLoadingComponents(false);
    }
  }

  // Search tenant Cost Book for matching entries (compare with Golden PETL)
  async function searchCostBook() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    if (!goldenSearchTerm.trim()) {
      setCostBookMatches([]);
      return;
    }

    setLoadingCostBook(true);
    try {
      const res = await fetch(`${API_BASE}/pricing/company-price-list/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: goldenSearchTerm,
          limit: 500,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to search Cost Book (${res.status}) ${text}`,
        );
      }
      const json = (await res.json()) as {
        items?: Array<{
          cat: string | null;
          sel: string | null;
          activity: string | null;
          unitPrice: number | null;
          lastKnownUnitPrice: number | null;
          description: string | null;
        }>;
      };
      setCostBookMatches(json.items ?? []);
    } catch (err: any) {
      console.error("[financial] searchCostBook error:", err);
      setCostBookMatches([]);
    } finally {
      setLoadingCostBook(false);
    }
  }

  // Clear cost book matches when search term changes
  const handleGoldenSearchChange = (term: string) => {
    setGoldenSearchTerm(term);
    if (!term.trim()) {
      setCostBookMatches([]);
    }
  };

  // ── Banking helpers ──
  async function fetchBankConnections() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/banking/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBankConnections(await res.json());
    } catch {}
  }

  async function fetchBankTransactions(page = 1) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setBankLoading(true);
    setBankError(null);
    setBankSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(bankTxPageSize));
      params.set("sortBy", bankSortBy);
      params.set("sortDir", bankSortDir);
      if (bankSearch) params.set("search", bankSearch);
      if (bankMerchantFilter) params.set("merchant", bankMerchantFilter);
      if (bankStartDate) params.set("startDate", bankStartDate);
      if (bankEndDate) params.set("endDate", bankEndDate);
      if (bankSourceFilter) params.set("source", bankSourceFilter);
      if (bankCategoryFilter) params.set("category", bankCategoryFilter);
      if (bankStatusFilter) params.set("pending", bankStatusFilter);
      if (bankProjectFilter) params.set("projectId", bankProjectFilter);
      if (bankUnassignedFilter) params.set("unassigned", "true");
      if (bankDispositionFilter) params.set("disposition", bankDispositionFilter);
      if (bankAmountFilter) {
        const cleaned = bankAmountFilter.replace(/[$,\-\s]/g, "");
        if (cleaned) params.set("amountSearch", cleaned);
      }
      if (bankAccountFilter) {
        if (bankAccountFilter.startsWith("conn:")) params.set("connectionId", bankAccountFilter.slice(5));
        else if (bankAccountFilter.startsWith("source:")) params.set("source", bankAccountFilter.slice(7));
      }
      const res = await fetch(`${API_BASE}/banking/transactions/unified?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      setBankTransactions(json.transactions ?? []);
      setBankTxTotal(json.total ?? 0);
      setBankTxPage(json.page ?? 1);
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to load transactions");
    } finally {
      setBankLoading(false);
    }
  }

  async function fetchBankCategories() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBankCategories(await res.json());
    } catch {}
  }

  async function fetchBankProjectsList() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items = (Array.isArray(data) ? data : data.projects ?? []).map((p: any) => ({ id: p.id, name: p.name }));
        setBankProjects(items);
      }
    } catch {}
  }

  async function scanDuplicateExpenses() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setDupScanLoading(true);
    try {
      const res = await fetch(`${API_BASE}/banking/duplicate-expenses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setDupScanResults(await res.json());
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to scan for duplicates");
    } finally {
      setDupScanLoading(false);
    }
  }

  function toggleBankSort(field: BankSortField) {
    if (bankSortBy === field) {
      setBankSortDir(bankSortDir === "asc" ? "desc" : "asc");
    } else {
      setBankSortBy(field);
      setBankSortDir(field === "date" ? "desc" : "asc");
    }
  }

  async function handleAssignProject(txnId: string, source: string, projectId: string | null) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/${txnId}/assign-project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, source }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const updated = await res.json();
      setBankTransactions(prev => prev.map(t => t.id === txnId ? { ...t, projectId: updated.project?.id ?? null, projectName: updated.project?.name ?? null } : t));
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to assign project");
    }
  }

  async function handleBulkAssignProject() {
    if (bankSelectedIds.size === 0 || !bankBulkProjectId) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    const ids = bankTransactions.filter(t => bankSelectedIds.has(t.id)).map(t => ({ id: t.id, source: t.source }));
    try {
      await fetch(`${API_BASE}/banking/transactions/bulk-assign-project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids, projectId: bankBulkProjectId }),
      });
      setBankSelectedIds(new Set());
      setBankBulkProjectId("");
      await fetchBankTransactions(bankTxPage);
    } catch (err: any) {
      setBankError(err?.message ?? "Bulk assign failed");
    }
  }

  async function fetchCsvBatches() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/banking/csv-imports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCsvBatches(await res.json());
    } catch {}
  }

  async function handleCsvUpload(file: File) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setCsvUploading(true);
    setBankError(null);
    try {
      const formData = new FormData();
      formData.append("source", csvUploadSource);
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/banking/csv-import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Upload failed (${res.status})`);
      }
      const result = await res.json();
      if (result.skippedCount > 0 && result.rowCount === 0) {
        setBankError(`All ${result.skippedCount} rows were duplicates — nothing new to import.`);
      } else if (result.skippedCount > 0) {
        setBankError(`Imported ${result.rowCount} new rows (${result.skippedCount} duplicates skipped).`);
      }
      setCsvUploadOpen(false);
      await fetchCsvBatches();
      await fetchBankTransactions(1);
      await fetchBankSummary();
    } catch (err: any) {
      setBankError(err?.message ?? "CSV upload failed");
    } finally {
      setCsvUploading(false);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      await fetch(`${API_BASE}/banking/csv-imports/${batchId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCsvBatches();
      await fetchBankTransactions(1);
      await fetchBankSummary();
    } catch {}
  }

  // ── Prescreen helpers ──
  async function handlePrescreenAccept(txnId: string) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      await fetch(`${API_BASE}/banking/transactions/${txnId}/prescreen-accept`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchBankTransactions(bankTxPage);
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to accept prescreen");
    }
  }

  async function handlePrescreenReject(txnId: string, reason?: string) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      await fetch(`${API_BASE}/banking/transactions/${txnId}/prescreen-reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason || "Rejected by user" }),
      });
      await fetchBankTransactions(bankTxPage);
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to reject prescreen");
    }
  }

  async function handleBulkPrescreenAccept() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      await fetch(`${API_BASE}/banking/transactions/bulk-prescreen-accept-by-confidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ minConfidence: 0.7 }),
      });
      await fetchBankTransactions(bankTxPage);
    } catch (err: any) {
      setBankError(err?.message ?? "Bulk accept failed");
    }
  }

  async function handlePrescreenRerun() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setPrescreenRunning(true);
    setPrescreenResult(null);
    try {
      const res = await fetch(`${API_BASE}/banking/prescreen-rerun`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      if (json.totalPrescreened > 0) {
        setPrescreenResult(`Prescreened ${json.totalPrescreened} transactions across ${json.batchesProcessed} batch(es). ${json.totalBillsCreated} tentative bills created.`);
      } else {
        setPrescreenResult(`No new matches found across ${json.batchesProcessed} batch(es). All transactions already prescreened or no matching projects.`);
      }
      await fetchBankTransactions(bankTxPage);
    } catch (err: any) {
      setPrescreenResult(err?.message ?? "Prescreening failed");
    } finally {
      setPrescreenRunning(false);
    }
  }

  async function handleDispositionChange() {
    if (!dispositionModalTxn || !dispositionValue || !dispositionNote.trim()) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setDispositionSaving(true);
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/${dispositionModalTxn.id}/disposition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source: dispositionModalTxn.source,
          disposition: dispositionValue,
          note: dispositionNote.trim(),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Failed (${res.status})`);
      }
      // Update local state
      setBankTransactions(prev => prev.map(t => t.id === dispositionModalTxn.id ? { ...t, extra: { ...t.extra, disposition: dispositionValue } } : t));
      setDispositionModalTxn(null);
      setDispositionValue("");
      setDispositionNote("");
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to update disposition");
    } finally {
      setDispositionSaving(false);
    }
  }

  async function handleCategoryOverride() {
    if (!categoryModalTxn || !categoryValue.trim()) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setCategorySaving(true);
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/${categoryModalTxn.id}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          source: categoryModalTxn.source,
          newCategory: categoryValue.trim(),
          note: categoryNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Failed (${res.status})`);
      }
      setBankTransactions(prev => prev.map(t => t.id === categoryModalTxn.id ? {
        ...t,
        category: categoryValue.trim(),
        extra: { ...t.extra, categoryOverride: categoryValue.trim(), categoryStatus: "TENTATIVE" },
      } : t));
      setCategoryModalTxn(null);
      setCategoryValue("");
      setCategoryNote("");
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to override category");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleCategoryVerify(txn: UnifiedTransactionDto) {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/banking/transactions/${txn.id}/category-verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source: txn.source }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `Failed (${res.status})`);
      }
      setBankTransactions(prev => prev.map(t => t.id === txn.id ? {
        ...t,
        extra: { ...t.extra, categoryStatus: "VERIFIED" },
      } : t));
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to verify category");
    }
  }

  function openRawDetail(txn: UnifiedTransactionDto) {
    const flat = txn.extra ? { ...txn, ...txn.extra } : { ...txn };
    setRawDetailTxn(flat);
    setRawDetailSource(txn.source);
    setRawDetailOpen(true);
  }

  async function fetchBankSummary() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    try {
      const params = new URLSearchParams();
      if (bankStartDate) params.set("startDate", bankStartDate);
      if (bankEndDate) params.set("endDate", bankEndDate);
      const res = await fetch(`${API_BASE}/banking/transactions/summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBankSummary(await res.json());
    } catch {}
  }

  async function handleBankSync() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setBankSyncing(true);
    try {
      await fetch(`${API_BASE}/banking/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchBankConnections();
      await fetchBankTransactions(1);
      await fetchBankSummary();
    } catch {} finally {
      setBankSyncing(false);
    }
  }

  const [bankLinkToken, setBankLinkToken] = useState<string | null>(null);

  async function handleBankConnect() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    setBankConnecting(true);
    try {
      const linkRes = await fetch(`${API_BASE}/banking/link-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!linkRes.ok) throw new Error("Failed to create link token");
      const { linkToken } = await linkRes.json();
      setBankLinkToken(linkToken);
    } catch (err: any) {
      setBankError(err?.message ?? "Failed to connect bank");
      setBankConnecting(false);
    }
  }

  const onPlaidBankSuccess = useCallback(async (publicToken: string, metadata: any) => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;
    const account = metadata.accounts?.[0];
    const institution = metadata.institution;
    try {
      await fetch(`${API_BASE}/banking/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          publicToken,
          account: {
            id: account?.id,
            name: account?.name,
            mask: account?.mask,
            type: account?.type,
            subtype: account?.subtype,
          },
          institution: institution
            ? { institution_id: institution.institution_id, name: institution.name }
            : undefined,
        }),
      });
      await fetchBankConnections();
      await fetchBankTransactions(1);
      await fetchBankSummary();
    } catch {} finally {
      setBankConnecting(false);
      setBankLinkToken(null);
    }
  }, []);

  const { open: openBankPlaid, ready: bankPlaidReady } = usePlaidLink({
    token: bankLinkToken,
    onSuccess: onPlaidBankSuccess,
    onExit: () => { setBankConnecting(false); setBankLinkToken(null); },
  });

  // Auto-open Plaid Link when link token is ready
  useEffect(() => {
    if (bankLinkToken && bankPlaidReady) openBankPlaid();
  }, [bankLinkToken, bankPlaidReady, openBankPlaid]);

  // Lazy-load banking data when Banking section is opened.
  useEffect(() => {
    if (activeSection !== "BANKING") return;
    fetchBankConnections();
    fetchBankTransactions(1);
    fetchBankSummary();
    fetchCsvBatches();
    fetchBankCategories();
    fetchBankProjectsList();
  }, [activeSection]);

  // Re-fetch banking transactions when sort or column filters change
  useEffect(() => {
    if (activeSection !== "BANKING") return;
    fetchBankTransactions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankSortBy, bankSortDir, bankStatusFilter, bankCategoryFilter, bankProjectFilter, bankUnassignedFilter, bankDispositionFilter, bankAmountFilter, bankTxPageSize]);

  // Lazy-load Asset Logistics tree when that tab is first opened.
  useEffect(() => {
    if (activeSection !== "ASSET_LOGISTICS") return;
    if (assetLogisticsRoots.length > 0 || assetLogisticsLoadingTree) return;

    (async () => {
      setAssetLogisticsLoadingTree(true);
      setAssetLogisticsError(null);
      try {
        const roots = await fetchAssetLocationsRoots();
        setAssetLogisticsRoots(
          roots.map((loc) => ({
            ...loc,
            children: [],
            isLoaded: false,
            isExpanded: false,
          })),
        );
      } catch (e: any) {
        setAssetLogisticsError(e?.message ?? "Failed to load locations for Asset Logistics.");
      } finally {
        setAssetLogisticsLoadingTree(false);
      }
    })();
  }, [activeSection, assetLogisticsRoots.length, assetLogisticsLoadingTree]);

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

  // Lazy-load Golden components when the user first opens the Golden
  // Components tab. Subsequent refreshes are driven by uploads and explicit
  // filter actions.
  useEffect(() => {
    if (activeSection !== "GOLDEN_COMPONENTS") return;
    if (componentsLoaded || loadingComponents) return;

    void (async () => {
      await refreshGoldenComponentsView();
    })();
  }, [activeSection, componentsLoaded, loadingComponents]);

  // Lightweight summary for Golden components coverage used by the
  // coverage card on first page load (before the user opens the
  // Golden Components tab).
  async function refreshGoldenComponentsSummary() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/pricing/price-list/components/summary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to load Golden components summary (${res.status}) ${text}`,
        );
      }
      const json = (await res.json()) as {
        priceList?: {
          id: string;
          label: string;
          revision: number;
          itemCount: number;
        } | null;
        coverage?: {
          itemsWithComponents: number;
          totalComponents: number;
        } | null;
        lastComponentsUpload?: {
          at?: string | null;
          byName?: string | null;
          byEmail?: string | null;
        } | null;
      };

      if (json.priceList) {
        setCurrentGolden((prev) =>
          prev
            ? prev
            : {
                id: json.priceList!.id,
                label: json.priceList!.label,
                revision: json.priceList!.revision,
                effectiveDate: null,
                uploadedAt: null,
                itemCount: json.priceList!.itemCount,
              },
        );
      }

      if (json.coverage) {
        setComponentsSummary({
          itemsWithComponents: json.coverage.itemsWithComponents,
          totalComponents: json.coverage.totalComponents,
        });
      }

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
      setComponentsError(err?.message ?? "Failed to load Golden components summary.");
    }
  }

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
        } | null;

        console.log('[DEBUG] Golden table API response:', {
          hasJson: !!json,
          rowsLength: json?.rows?.length,
          priceListItemCount: json?.priceList?.itemCount,
        });

        if (!json) {
          setGoldenRows([]);
        } else {
          setGoldenRows(json.rows ?? []);
          console.log('[DEBUG] Set goldenRows state to', json.rows?.length, 'items');
        }
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

      // Golden components (all ACTs by default) are now lazy-loaded when
      // the Golden Components tab is opened or after a successful components
      // upload. We no longer fetch them eagerly on initial page load.

      // However, we do fetch a lightweight coverage summary so the coverage
      // card has data even before the tab is opened.
      await refreshGoldenComponentsSummary();
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

    setUploading(true);
    try {
      const isLocalApi = /localhost|127\.0\.0\.1/.test(API_BASE);

      if (isLocalApi) {
        // Local/dev path: use the legacy multipart upload directly to the API,
        // which writes to a shared filesystem visible to the worker.
        const formData = new FormData();
        formData.append("file", file);

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
          setPriceListEta(null);
          setPriceListJob(null);
          await refreshGoldenPriceListViews();
        }
      } else {
        // Cloud/remote API path: upload the PETL CSV to storage via a signed
        // URL, then ask the API to create a PRICE_LIST ImportJob from the
        // resulting fileUri.
        // 1) Request a signed upload URL from the generic /uploads endpoint.
        const uploadMetaRes = await fetch(`${API_BASE}/uploads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            contentType: file.type || "text/csv",
            fileName: file.name,
            scope: "OTHER",
          }),
        });

        const uploadMeta = await uploadMetaRes.json().catch(() => ({} as any));

        if (!uploadMetaRes.ok) {
          throw new Error(
            `Failed to create Golden PETL upload URL (${uploadMetaRes.status}) ${
              uploadMeta?.error || ""
            }`,
          );
        }

        const { uploadUrl, fileUri } = uploadMeta as {
          uploadUrl?: string;
          fileUri?: string;
        };

        if (!uploadUrl || !fileUri) {
          throw new Error("Golden PETL upload URL response missing uploadUrl or fileUri");
        }

        // 2) Upload the CSV directly from the browser to storage.
        const arrayBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "text/csv",
          },
          body: arrayBuffer,
        });

        if (!uploadRes.ok) {
          const text = await uploadRes.text().catch(() => "");
          throw new Error(
            `Golden PETL upload to storage failed (${uploadRes.status}) ${text || ""}`,
          );
        }

        // 3) Ask the API to create a PRICE_LIST ImportJob from the storage URI.
        const importRes = await fetch(`${API_BASE}/pricing/price-list/import-from-uri`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ fileUri }),
        });

        const importJson: any = await importRes.json().catch(() => ({}));

        if (!importRes.ok) {
          throw new Error(
            `Golden PETL import enqueue failed (${importRes.status}) ${
              importJson?.error || ""
            }`,
          );
        }

        if (importJson.jobId) {
          setPriceListUploadMessage(
            `Golden Price List (PETL) import started as job ${importJson.jobId}. You can go about your business; this may take a few minutes. Refresh this page later to see the updated Golden list.`,
          );
          setPriceListJob({
            id: importJson.jobId,
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
            `Golden Price List (PETL) upload complete. Revision ${
              importJson.revision
            } is now active as of ${todayLabel}.`,
          );
          setPriceListEta(null);
          setPriceListJob(null);
          await refreshGoldenPriceListViews();
        }
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
      {/* ── Card Landing View ── */}
      {activeSection === null && (
        <>
          <a
            href="/projects"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              textDecoration: "none",
            }}
          >
            <span aria-hidden="true">&larr;</span> Projects
          </a>
          <h2 style={{ marginTop: 0 }}>Financial</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
            Central place for cross-project financial views and configuration.
            Project-level financials are still available per job under the{" "}
            <strong>FINANCIAL</strong> tab.
          </p>

          {/* Pending imports summary */}
          {Object.keys(pendingImports).length > 0 && (
            <div
              style={{
                marginBottom: 16,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #fbbf24",
                background: "#fffbeb",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Pending imports</div>
              {pendingError ? (
                <div style={{ color: "#b91c1c" }}>{pendingError}</div>
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
          )}

          {/* Grouped card grid - 3 columns on desktop, stacks on mobile */}
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {Object.entries(FINANCIAL_CARDS_GROUPED).map(([group, cards]) => (
              <div key={group}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#0f172a",
                    marginBottom: 16,
                    paddingBottom: 8,
                    borderBottom: "2px solid #e5e7eb",
                  }}
                >
                  {group}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 16,
                  }}
                >
                  {cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        if (card.href) {
                          window.location.href = card.href;
                        } else {
                          startUiTransition(() => setActiveSection(card.id as FinancialSection));
                        }
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 6,
                        padding: 16,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "box-shadow 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#0f172a";
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(15,23,42,0.10)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{card.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        {card.title}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                        {card.subtitle}
                      </span>
                      {card.href && (
                        <span style={{ fontSize: 10, color: "#2563eb", marginTop: 2 }}>
                          External page &rarr;
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Section Detail View (back button + content) ── */}
      {activeSection !== null && (
        <>
          <button
            type="button"
            onClick={() => startUiTransition(() => setActiveSection(null))}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              marginBottom: 16,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
            }}
          >
            <span aria-hidden="true">&larr;</span> Back to Financial
          </button>
        </>
      )}

      {/* Cost Book section */}
      {activeSection === "COST_BOOK" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Company Cost Book
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            Search and browse your company's cost book items. This includes items shared from the Master Costbook (like BWC Cabinets) and custom items specific to your company.
          </p>

          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  Browse Cost Book
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Search and view all available cost book items
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCostBookBrowserOpen(true)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 6,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Open Cost Book Browser
              </button>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
              <strong>Available items:</strong>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>BWC Cabinets (406 SKUs) - Shared from Master Costbook</li>
                <li>Custom company items</li>
                <li>Golden PETL line items</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Cost Book Browser Modal */}
      {costBookBrowserOpen && (
        <CostBookPickerModal
          title="Company Cost Book Browser"
          subtitle="Browse all available cost book items. This is view-only mode."
          onClose={() => setCostBookBrowserOpen(false)}
        />
      )}

      {/* Pricelist Tree section */}
      {activeSection === "PRICELIST_TREE" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Pricelist Tree – Golden PETL (Project Estimate Task List) & Components Allocation
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
                Upload Golden PETL
              </div>
              <form onSubmit={handleUpload}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>
                    Upload PETL CSV
                  </span>
                  <input type="file" name="file" accept=".csv,text/csv" />
                  <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                    Dont use Xactimate? A simple Golden PETL CSV template will be available for download here.
                  </div>
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
              loadingComponents={loadingComponents || (!componentsLoaded && !componentsSummary)}
              componentsSummary={componentsSummary}
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
              searchTerm={goldenSearchTerm}
              onSearchChange={handleGoldenSearchChange}
              costBookMatches={costBookMatches}
              loadingCostBook={loadingCostBook}
              onSearchCostBook={searchCostBook}
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
          {!loadingComponents && !componentsError && componentsLoaded && (
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

      {/* Asset Logistics (people, equipment, materials as inventory) */}
      {activeSection === "ASSET_LOGISTICS" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Asset Logistics
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            High-level hub for tracking where key assets are across the portfolio:
            people (crews), equipment, and materials. Backed by shared asset and
            inventory models so you can see who and what is at each location
            (hotel rooms, laydown yards, floors, rooms, supplier yards, and more).
          </p>
          <ul style={{ fontSize: 13, color: "#4b5563", paddingLeft: 18 }}>
            <li>
              <strong>People as assets:</strong> use locations like hotel &gt; room to
              keep an up-to-date assignment of which individuals are where.
            </li>
            <li>
              <strong>Equipment as inventory:</strong> treat major tools and rented
              equipment as trackable assets with a current location and movement
              history.
            </li>
            <li>
              <strong>Materials as inventory:</strong> reuse the same inventory positions
              and movements used for job materials so all logistics live in one place.
            </li>
            <li>
              <strong>Inventory Logistics use:</strong> the advanced logistics module
              ties materials and labor to specific project financial allocations down
              to the room.
              {" "}
              <button
                type="button"
                onClick={() => startUiTransition(() => setShowInventoryLogisticsInfo((prev) => !prev))}
                style={{
                  border: "none",
                  background: "none",
                  padding: 0,
                  margin: 0,
                  cursor: "pointer",
                  color: "#2563eb",
                  textDecoration: "underline",
                  font: "inherit",
                }}
              >
                Learn more about Inventory Logistics
              </button>
            </li>
          </ul>
          {showInventoryLogisticsInfo && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: 12,
                maxWidth: 620,
              }}
            >
              <strong>Inventory Logistics overview.</strong>{" "}
              This module lets you connect people, equipment, and materials to
              specific locations inside a project14down to floors and rooms14and
              tie those logistics back to project financials. Use it to see, at any
              moment, which crews and assets are staged where, how inventory is
              moving between pools and jobs, and how that activity rolls up into
              billing and cost allocation.
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            {/* Compact location tree (shared with /locations) */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 8,
                background: "#f9fafb",
                fontSize: 12,
                maxHeight: 360,
                overflowY: "auto",
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
                <div style={{ fontWeight: 600 }}>Locations (tree)</div>
                <a
                  href="/locations"
                  style={{ fontSize: 11, color: "#2563eb", textDecoration: "none" }}
                >
                  Open full view
                </a>
              </div>
              {assetLogisticsLoadingTree && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>Loading locations…</div>
              )}
              {assetLogisticsError && (
                <div style={{ fontSize: 11, color: "#b91c1c" }}>{assetLogisticsError}</div>
              )}
              {!assetLogisticsLoadingTree && !assetLogisticsError && assetLogisticsRoots.length === 0 && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  No locations found yet. Once you define warehouses, yards, hotels,
                  and project locations, they will appear here.
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                {assetLogisticsRoots.map((node) => {
                  const hasChildrenPotential = node.type !== "BIN" && node.type !== "PERSON";
                  const isSelected = assetLogisticsSelected?.id === node.id;
                  return (
                    <div key={node.id} style={{ marginBottom: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {hasChildrenPotential && (
                          <button
                            type="button"
                            onClick={async () => {
                              setAssetLogisticsError(null);
                              if (!node.isLoaded) {
                                try {
                                  setAssetLogisticsLoadingTree(true);
                                  const children = await fetchAssetLocationChildren(node.id);
                                  setAssetLogisticsRoots((prev) =>
                                    prev.map((n) =>
                                      n.id === node.id
                                        ? {
                                            ...n,
                                            isLoaded: true,
                                            isExpanded: true,
                                            children: children.map((c) => ({
                                              ...c,
                                              children: [],
                                              isLoaded: false,
                                              isExpanded: false,
                                            })),
                                          }
                                        : n,
                                    ),
                                  );
                                } catch (e: any) {
                                  setAssetLogisticsError(
                                    e?.message ?? "Failed to load child locations.",
                                  );
                                } finally {
                                  setAssetLogisticsLoadingTree(false);
                                }
                              } else {
                                setAssetLogisticsRoots((prev) =>
                                  prev.map((n) =>
                                    n.id === node.id
                                      ? { ...n, isExpanded: !n.isExpanded }
                                      : n,
                                  ),
                                );
                              }
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              fontSize: 11,
                              cursor: "pointer",
                              width: 16,
                            }}
                          >
                            {node.isExpanded ? "-" : "+"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setAssetLogisticsError(null);
                            if (assetPendingMoveAssetId) {
                              try {
                                setAssetLogisticsLoadingHoldings(true);
                                const res = await fetch(
                                  `/api/inventory/holdings/location/${node.id}/move-asset`,
                                  {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ assetId: assetPendingMoveAssetId }),
                                  },
                                );
                                const json = await res.json();
                                if (!res.ok) {
                                  throw new Error(json?.message || "Failed to move asset");
                                }
                                setAssetLogisticsSelected(node);
                                setAssetLogisticsHoldings(json);
                                setAssetPendingMoveAssetId(null);
                                // Refresh recent movement history for this location
                                try {
                                  setAssetLogisticsLoadingHistory(true);
                                  const hist = await fetchAssetLocationHistory(node.id).catch(
                                    () => [] as AssetLocationMovement[],
                                  );
                                  setAssetLogisticsHistory(hist);
                                } finally {
                                  setAssetLogisticsLoadingHistory(false);
                                }
                              } catch (e: any) {
                                setAssetLogisticsError(
                                  e?.message ?? "Failed to move asset to new location.",
                                );
                              } finally {
                                setAssetLogisticsLoadingHoldings(false);
                              }
                              return;
                            }

                            setAssetLogisticsSelected(node);
                            setAssetLogisticsLoadingHoldings(true);
                            setAssetLogisticsLoadingHistory(true);
                            try {
                              const [h, hist] = await Promise.all([
                                fetchAssetLocationHoldings(node.id),
                                fetchAssetLocationHistory(node.id).catch(
                                  () => [] as AssetLocationMovement[],
                                ),
                              ]);
                              setAssetLogisticsHoldings(h);
                              setAssetLogisticsHistory(hist);
                            } catch (e: any) {
                              setAssetLogisticsError(
                                e?.message ?? "Failed to load holdings for location.",
                              );
                              setAssetLogisticsHoldings(null);
                              setAssetLogisticsHistory(null);
                            } finally {
                              setAssetLogisticsLoadingHoldings(false);
                              setAssetLogisticsLoadingHistory(false);
                            }
                          }}
                          style={{
                            flex: 1,
                            textAlign: "left",
                            fontSize: 11,
                            padding: 2,
                            borderRadius: 4,
                            border: "none",
                            background: isSelected ? "#e0f2fe" : "transparent",
                            color: isSelected ? "#0f172a" : "#374151",
                            cursor: "pointer",
                          }}
                        >
                          {node.name}{" "}
                          <span style={{ fontSize: 10, color: "#6b7280" }}>({node.type})</span>
                        </button>
                      </div>
                      {node.isExpanded && node.children && node.children.length > 0 && (
                        <div style={{ marginLeft: 16, marginTop: 2 }}>
                          {node.children.map((child) => {
                            const childSelected = assetLogisticsSelected?.id === child.id;
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={async () => {
                                  setAssetLogisticsError(null);
                                  if (assetPendingMoveAssetId) {
                                    try {
                                      setAssetLogisticsLoadingHoldings(true);
                                      const res = await fetch(
                                        `/api/inventory/holdings/location/${child.id}/move-asset`,
                                        {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ assetId: assetPendingMoveAssetId }),
                                        },
                                      );
                                      const json = await res.json();
                                      if (!res.ok) {
                                        throw new Error(json?.message || "Failed to move asset");
                                      }
                                      setAssetLogisticsSelected(child);
                                      setAssetLogisticsHoldings(json);
                                      setAssetPendingMoveAssetId(null);
                                      try {
                                        setAssetLogisticsLoadingHistory(true);
                                        const hist = await fetchAssetLocationHistory(child.id).catch(
                                          () => [] as AssetLocationMovement[],
                                        );
                                        setAssetLogisticsHistory(hist);
                                      } finally {
                                        setAssetLogisticsLoadingHistory(false);
                                      }
                                    } catch (e: any) {
                                      setAssetLogisticsError(
                                        e?.message ?? "Failed to move asset to new location.",
                                      );
                                    } finally {
                                      setAssetLogisticsLoadingHoldings(false);
                                    }
                                    return;
                                  }

                                  setAssetLogisticsSelected(child);
                                  setAssetLogisticsLoadingHoldings(true);
                                  setAssetLogisticsLoadingHistory(true);
                                  try {
                                    const [h, hist] = await Promise.all([
                                      fetchAssetLocationHoldings(child.id),
                                      fetchAssetLocationHistory(child.id).catch(
                                        () => [] as AssetLocationMovement[],
                                      ),
                                    ]);
                                    setAssetLogisticsHoldings(h);
                                    setAssetLogisticsHistory(hist);
                                  } catch (e: any) {
                                    setAssetLogisticsError(
                                      e?.message ?? "Failed to load holdings for location.",
                                    );
                                    setAssetLogisticsHoldings(null);
                                    setAssetLogisticsHistory(null);
                                  } finally {
                                    setAssetLogisticsLoadingHoldings(false);
                                    setAssetLogisticsLoadingHistory(false);
                                  }
                                }}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  fontSize: 11,
                                  padding: 2,
                                  borderRadius: 4,
                                  border: "none",
                                  background: childSelected ? "#e0f2fe" : "transparent",
                                  color: childSelected ? "#0f172a" : "#374151",
                                  cursor: "pointer",
                                  marginBottom: 1,
                                }}
                              >
                                {child.name}{" "}
                                <span style={{ fontSize: 10, color: "#6b7280" }}>
                                  ({child.type})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Holdings summary for selected location */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 10,
                background: "#ffffff",
                fontSize: 12,
                minHeight: 120,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {assetLogisticsSelected
                    ? `Holdings at ${assetLogisticsSelected.name}`
                    : "Holdings"}
                </div>
                {assetLogisticsSelected && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        background: "#f9fafb",
                        cursor: "pointer",
                      }}
                      onClick={async () => {
                        if (!assetLogisticsSelected) return;
                        setAssetLogisticsError(null);
                        setAssetPeoplePickerOpen(true);
                        setAssetSelectedUserIds(
                          assetLogisticsHoldings?.people?.map((p) => p.userId) ?? [],
                        );
                        if (!assetCompanyMembers && !assetPeoplePickerLoading) {
                          try {
                            setAssetPeoplePickerLoading(true);
                            const res = await fetch("/api/company/members");
                            const json = await res.json();
                            if (!res.ok) {
                              throw new Error(json?.message || "Failed to load company members");
                            }
                            const rawMembers = Array.isArray(json)
                              ? json
                              : Array.isArray(json?.members)
                              ? json.members
                              : [];
                            const mapped: CompanyMemberSummary[] = rawMembers
                              .map((m: any) => {
                                const userId = m.userId ?? m.id ?? null;
                                if (!userId) return null;
                                const nameFromFields = [m.firstName, m.lastName]
                                  .filter(Boolean)
                                  .join(" ") || null;
                                const name = m.name ?? nameFromFields;
                                return {
                                  userId,
                                  name,
                                  email: m.email ?? null,
                                  role: m.role ?? null,
                                } as CompanyMemberSummary;
                              })
                              .filter((m: CompanyMemberSummary | null): m is CompanyMemberSummary => !!m);
                            setAssetCompanyMembers(mapped);
                          } catch (e: any) {
                            setAssetLogisticsError(
                              e?.message ?? "Failed to load company members for assignment.",
                            );
                          } finally {
                            setAssetPeoplePickerLoading(false);
                          }
                        }
                      }}
                    >
                      Assign people…
                    </button>
                  </div>
                )}
              </div>
              {assetLogisticsLoadingHoldings && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>Loading holdings…</div>
              )}
              {assetLogisticsError && (
                <div style={{ fontSize: 11, color: "#b91c1c" }}>{assetLogisticsError}</div>
              )}
              {assetPendingMoveAssetId && assetLogisticsHoldings && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#064e3b",
                    background: "#d1fae5",
                    border: "1px solid #6ee7b7",
                    borderRadius: 4,
                    padding: 4,
                    marginBottom: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>
                    Move mode: select a destination in the Locations tree for{" "}
                    <strong>
                      {
                        assetLogisticsHoldings.assets.find(
                          (a) => a.id === assetPendingMoveAssetId,
                        )?.name ?? "selected asset"
                      }
                    </strong>
                    .
                  </span>
                  <button
                    type="button"
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 999,
                      border: "1px solid #059669",
                      background: "#ecfdf5",
                      color: "#065f46",
                      cursor: "pointer",
                    }}
                    onClick={() => setAssetPendingMoveAssetId(null)}
                  >
                    Cancel move
                  </button>
                </div>
              )}
              {assetPeoplePickerOpen && assetLogisticsSelected && (
                <div
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                    Assign people to {assetLogisticsSelected.name}
                  </div>
                  {assetPeoplePickerLoading && (
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Loading company members…</div>
                  )}
                  {!assetPeoplePickerLoading && (!assetCompanyMembers || assetCompanyMembers.length === 0) && (
                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                      No members found for this company.
                    </div>
                  )}
                  {!assetPeoplePickerLoading && assetCompanyMembers && assetCompanyMembers.length > 0 && (
                    <>
                      <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <input
                          type="text"
                          placeholder="Search by name or email…"
                          value={assetPeopleSearch}
                          onChange={(e) => setAssetPeopleSearch(e.target.value)}
                          style={{
                            flex: 1,
                            fontSize: 11,
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid #d1d5db",
                          }}
                        />
                        <span style={{ fontSize: 10, color: "#6b7280" }}>
                          {assetCompanyMembers.length} total
                        </span>
                      </div>
                      <div
                        style={{
                          maxHeight: 160,
                          overflowY: "auto",
                          border: "1px solid #e5e7eb",
                          borderRadius: 4,
                          padding: 4,
                          marginBottom: 6,
                        }}
                      >
                        {assetCompanyMembers
                          .filter((m) => {
                            if (!assetPeopleSearch.trim()) return true;
                            const q = assetPeopleSearch.toLowerCase();
                            const name = (m.name || '').toLowerCase();
                            const email = (m.email || '').toLowerCase();
                            return name.includes(q) || email.includes(q);
                          })
                          .map((m) => {
                            const checked = assetSelectedUserIds.includes(m.userId);
                            const label =
                              m.name || m.email || `User ${m.userId.slice(0, 6)}…`;
                            return (
                              <label
                                key={m.userId}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 11,
                                  padding: "2px 0",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setAssetSelectedUserIds((prev) => {
                                      if (e.target.checked) {
                                        return prev.includes(m.userId)
                                          ? prev
                                          : [...prev, m.userId];
                                      }
                                      return prev.filter((id) => id !== m.userId);
                                    });
                                  }}
                                  style={{ margin: 0 }}
                                />
                                <span>
                                  {label}
                                  {m.role && (
                                    <span style={{ color: "#6b7280", marginLeft: 4 }}>
                                      ({m.role})
                                    </span>
                                  )}
                                  {m.email && !m.name && (
                                    <span style={{ color: "#6b7280", marginLeft: 4 }}>
                                      {m.email}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setAssetPeoplePickerOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: "1px solid #0f172a",
                        background: "#0f172a",
                        color: "#f9fafb",
                        cursor: "pointer",
                      }}
                      onClick={async () => {
                        if (!assetLogisticsSelected) return;
                        try {
                          setAssetLogisticsLoadingHoldings(true);
                          setAssetLogisticsError(null);
                          const res = await fetch(
                            `/api/locations/${assetLogisticsSelected.id}/assign-people`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userIds: assetSelectedUserIds }),
                            },
                          );
                          const json = await res.json();
                          if (!res.ok) {
                            throw new Error(json?.message || "Failed to assign people");
                          }
                          setAssetLogisticsHoldings(json);
                          setAssetPeoplePickerOpen(false);
                        } catch (e: any) {
                          setAssetLogisticsError(
                            e?.message ?? "Failed to assign people to this location.",
                          );
                        } finally {
                          setAssetLogisticsLoadingHoldings(false);
                        }
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
              {!assetLogisticsLoadingHoldings && !assetLogisticsError && !assetLogisticsHoldings && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  Select a location in the tree to view people, equipment, and
                  materials assigned there.
                </div>
              )}
              {assetLogisticsHoldings && !assetLogisticsLoadingHoldings && !assetLogisticsError && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#374151",
                    marginTop: 4,
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        People ({assetLogisticsHoldings.people.length})
                      </div>
                      {assetLogisticsHoldings.people.length === 0 ? (
                        <div style={{ color: "#6b7280" }}>None</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {assetLogisticsHoldings.people.map((p) => (
                            <li key={p.userId}>
                              {p.name ?? "Unnamed user"}
                              {p.email && <span style={{ color: "#6b7280" }}> [{p.email}]</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        Equipment & Other Assets ({assetLogisticsHoldings.assets.length})
                      </div>
                      {assetLogisticsHoldings.assets.length === 0 ? (
                        <div style={{ color: "#6b7280" }}>None</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {assetLogisticsHoldings.assets.map((a) => (
                            <li key={a.id}>
                              {a.name} ({a.assetType})
                              {a.code && <span style={{ color: "#6b7280" }}> [{a.code}]</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        Material Lots ({assetLogisticsHoldings.materialLots.length})
                      </div>
                      {assetLogisticsHoldings.materialLots.length === 0 ? (
                        <div style={{ color: "#6b7280" }}>None</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {assetLogisticsHoldings.materialLots.map((m) => (
                            <li key={m.id}>
                              {m.sku} – {m.name} ({m.quantity} {m.uom})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        Particles ({assetLogisticsHoldings.particles.length})
                      </div>
                      {assetLogisticsHoldings.particles.length === 0 ? (
                        <div style={{ color: "#6b7280" }}>None</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {assetLogisticsHoldings.particles.map((p) => (
                            <li key={p.id}>
                              {p.parentEntityType} {p.parentEntityId} – {p.quantity} {p.uom}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      background: "#ffffff",
                      padding: 6,
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
                      <div style={{ fontSize: 11, fontWeight: 600 }}>Recent movements</div>
                      {assetLogisticsLoadingHistory && (
                        <span style={{ fontSize: 9, color: "#9ca3af" }}>Loading…</span>
                      )}
                    </div>
                    {!assetLogisticsHistory || assetLogisticsHistory.length === 0 ? (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        No recent inventory movements for this location.
                      </div>
                    ) : (
                      <>
                        <ul
                          style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                          }}
                        >
                          {assetLogisticsHistory.map((m) => {
                            const when = new Date(m.movedAt).toLocaleString();
                            const locId = assetLogisticsHoldings.location?.id;
                            const dir =
                              m.toLocationId === locId
                                ? "in"
                                : m.fromLocationId === locId
                                ? "out"
                                : "";
                            const dirLabel =
                              dir === "in" ? "In" : dir === "out" ? "Out" : "Move";
                            return (
                              <li key={m.id} style={{ marginBottom: 4 }}>
                                <div>
                                  <span style={{ fontWeight: 600 }}>{dirLabel}</span>{" "}
                                  <span style={{ color: "#4b5563" }}>
                                    {m.quantity} {m.itemType.toLowerCase()} to{" "}
                                    {m.toLocation?.name ?? m.toLocationId ?? "unknown"}
                                  </span>
                                </div>
                                <div style={{ fontSize: 9, color: "#9ca3af" }}>{when}</div>
                              </li>
                            );
                          })}
                        </ul>
                        <div style={{ marginTop: 6 }}>
                          <a
                            href="/locations"
                            style={{
                              fontSize: 10,
                              color: "#2563eb",
                              textDecoration: "none",
                            }}
                          >
                            View full history in Locations
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
            For a deeper dive into logistics history and optimization, use the full
            <a href="/locations" style={{ color: "#2563eb", marginLeft: 4 }}>
              Locations
            </a>
            {" "}
            view, where every movement and assignment becomes a breadcrumb for
            forecasting and control.
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr)",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {/* 16 CSI divisions – compact vertical strip on far left */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: 8,
                background: "#f9fafb",
                fontSize: 12,
                maxHeight: "60vh",
                minWidth: 180,
                overflowY: "auto",
              }}
            >
              {loadingDivisionMapping && !divisions.length && (
                <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                  Loading division mapping...
                </p>
              )}

              <div style={{ fontWeight: 600, marginBottom: 4 }}>Divisions</div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
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
                  <li
                    key={div.code}
                    style={{
                      padding: "4px 0",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <span style={{ fontWeight: 600, marginRight: 6 }}>Div {div.code}</span>
                    <span style={{ color: "#374151" }}>{div.name}</span>
                  </li>
                ))}
              </ul>

              {divisionError && (
                <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
                  {divisionError}
                </p>
              )}
            </div>

            {/* Cat 2u2192 Division mapping table */}
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
        </div>
      </div>
        </section>
      )}
      {/* Forecasting */}
      {activeSection === "FORECASTING" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Forecasting &mdash; Material Requirements &amp; Order Timing
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            PETL-driven forecasting pipeline: turns scope schedule dates + supplier lead
            times into <strong>material requirements</strong> with need-on-site and
            date-to-order calculations. Feeds <strong>purchase order suggestions</strong>{" "}
            validated against real-time SerpApi pricing.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: "PLANNED", color: "#3b82f6", bg: "#eff6ff", icon: "📝" },
              { label: "DUE SOON", color: "#f59e0b", bg: "#fffbeb", icon: "⚠️" },
              { label: "LATE", color: "#ef4444", bg: "#fef2f2", icon: "🛑" },
              { label: "ORDERED", color: "#8b5cf6", bg: "#f5f3ff", icon: "📦" },
              { label: "RECEIVED", color: "#22c55e", bg: "#f0fdf4", icon: "✅" },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  border: `1px solid ${s.color}33`,
                  background: s.bg,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>—</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px dashed #d1d5db",
              background: "#f9fafb",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#374151" }}>
              Pipeline Status: Schema Ready &mdash; Services Coming Soon
            </p>
            <p style={{ margin: 0 }}>
              The procurement models (<code>SupplierItem</code>,{" "}
              <code>MaterialRequirement</code>, <code>PurchaseOrder</code>) are defined in
              the schema and ready for activation. The forecasting service will compute{" "}
              <code>requiredOnSiteDate</code> and <code>dateToOrder</code> from PETL
              schedule data + supplier lead times, then generate purchase order suggestions
              validated against live SerpApi catalog pricing.
            </p>
          </div>
        </section>
      )}

      {/* Banking & Transactions */}
      {activeSection === "BANKING" && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>
            Banking &amp; Transactions
          </h3>

          {/* Connected accounts + CSV batches banner */}
          <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {bankConnections.filter(c => c.status === "ACTIVE").map(conn => (
              <div
                key={conn.id}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1fae5",
                  background: "#f0fdf4",
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>{conn.institutionName ?? "Bank"}</span>
                {conn.accountName && <span> — {conn.accountName}</span>}
                {conn.accountMask && <span> (••••{conn.accountMask})</span>}
                <span style={{ color: "#6b7280", marginLeft: 8 }}>
                  {conn._count.transactions.toLocaleString()} txns
                </span>
                {conn.lastSyncedAt && (
                  <span style={{ color: "#9ca3af", marginLeft: 8, fontSize: 11 }}>
                    Last sync: {new Date(conn.lastSyncedAt).toLocaleString()}
                  </span>
                )}
              </div>
            ))}

            {bankConnections.filter(c => c.status === "REQUIRES_REAUTH").map(conn => (
              <div
                key={conn.id}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #fbbf24", background: "#fffbeb", fontSize: 12 }}
              >
                <span style={{ fontWeight: 600, color: "#b45309" }}>
                  {conn.institutionName ?? "Bank"} — Re-authentication required
                </span>
              </div>
            ))}

            {/* CSV import batch badges — grouped by source */}
            {Object.entries(
              csvBatches.reduce<Record<string, CsvImportBatchDto[]>>((acc, b) => {
                (acc[b.source] ??= []).push(b);
                return acc;
              }, {})
            ).map(([source, batches]) => {
              const sourceLabels: Record<string, { label: string; color: string; bg: string }> = {
                HD_PRO_XTRA: { label: "Home Depot", color: "#ea580c", bg: "#fff7ed" },
                CHASE_BANK: { label: "Chase", color: "#2563eb", bg: "#eff6ff" },
                APPLE_CARD: { label: "Apple Card", color: "#6b7280", bg: "#f9fafb" },
              };
              const s = sourceLabels[source] ?? { label: source, color: "#6b7280", bg: "#f9fafb" };
              const totalRows = batches.reduce((sum, b) => sum + b.rowCount, 0);
              const totalAmount = batches.reduce((sum, b) => sum + Math.abs(b.totalAmount), 0);
              const isExpanded = csvExpandedSources.has(source);
              return (
                <div key={source} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${s.color}44`, background: s.bg, fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                    onClick={() => setCsvExpandedSources(prev => {
                      const next = new Set(prev);
                      if (next.has(source)) next.delete(source); else next.add(source);
                      return next;
                    })}
                  >
                    <span style={{ fontWeight: 700, color: s.color }}>{s.label}</span>
                    <span style={{ color: "#6b7280" }}>
                      {batches.length === 1 ? batches[0].fileName : `${batches.length} files`}
                    </span>
                    <span style={{ color: "#6b7280" }}>{totalRows.toLocaleString()} rows</span>
                    <span style={{ color: "#6b7280" }}>
                      ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 2 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 16 }}>
                      {batches.map(batch => (
                        <div key={batch.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" }}>
                          <span>{batch.fileName}</span>
                          <span>{batch.rowCount.toLocaleString()} rows</span>
                          <span>${Math.abs(batch.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteBatch(batch.id); }}
                            title="Remove this import"
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleBankConnect}
              disabled={bankConnecting}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb",
                color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: bankConnecting ? "not-allowed" : "pointer", opacity: bankConnecting ? 0.6 : 1,
              }}
            >
              {bankConnecting ? "Connecting…" : bankConnections.length ? "+ Connect Another" : "Connect Bank Account"}
            </button>

            {bankConnections.some(c => c.status === "ACTIVE") && (
              <button
                type="button"
                onClick={handleBankSync}
                disabled={bankSyncing}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb",
                  fontSize: 13, fontWeight: 600,
                  cursor: bankSyncing ? "not-allowed" : "pointer", opacity: bankSyncing ? 0.6 : 1,
                }}
              >
                {bankSyncing ? "Syncing…" : "Sync Now"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setCsvUploadOpen(!csvUploadOpen)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid #059669", background: csvUploadOpen ? "#059669" : "#f0fdf4",
                color: csvUploadOpen ? "#fff" : "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {csvUploadOpen ? "Cancel" : "Import CSV"}
            </button>
          </div>

          {/* CSV Upload Panel */}
          {csvUploadOpen && (
            <div style={{
              padding: 16, borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb",
              marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
            }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Source:</label>
              <select
                value={csvUploadSource}
                onChange={e => setCsvUploadSource(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              >
                <option value="HD_PRO_XTRA">Home Depot (Pro Xtra)</option>
                <option value="CHASE_BANK">Chase Bank</option>
                <option value="APPLE_CARD">Apple Card</option>
              </select>
              <input
                type="file"
                accept=".csv"
                multiple={csvUploadSource === "APPLE_CARD"}
                disabled={csvUploading}
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files) return;
                  for (let i = 0; i < files.length; i++) {
                    await handleCsvUpload(files[i]);
                  }
                  e.target.value = "";
                }}
                style={{ fontSize: 12 }}
              />
              {csvUploading && <span style={{ fontSize: 12, color: "#6b7280" }}>Uploading…</span>}
            </div>
          )}

          {/* Summary bar */}
          {bankSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Inflow", value: bankSummary.totalInflow, color: "#22c55e", prefix: "+$" },
                { label: "Outflow", value: bankSummary.totalOutflow, color: "#ef4444", prefix: "-$" },
                { label: "Net", value: bankSummary.net, color: bankSummary.net >= 0 ? "#22c55e" : "#ef4444", prefix: bankSummary.net >= 0 ? "+$" : "-$" },
                { label: "Transactions", value: bankSummary.transactionCount, color: "#3b82f6", prefix: "" },
              ].map(s => (
                <div key={s.label} style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
                    {s.prefix}{typeof s.value === "number" && s.label !== "Transactions" ? Math.abs(s.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : s.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search transactions…"
              value={bankSearch}
              onChange={e => setBankSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { fetchBankTransactions(1); fetchBankSummary(); } }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 180 }}
            />
            <input
              type="text"
              placeholder="Merchant / Job…"
              value={bankMerchantFilter}
              onChange={e => setBankMerchantFilter(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { fetchBankTransactions(1); fetchBankSummary(); } }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 160 }}
            />
            <input
              type="text"
              placeholder="Amount…"
              value={bankAmountFilter}
              onChange={e => setBankAmountFilter(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { fetchBankTransactions(1); fetchBankSummary(); } }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 100 }}
            />
            <select
              value={bankSourceFilter}
              onChange={e => { setBankSourceFilter(e.target.value); setBankAccountFilter(""); }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            >
              <option value="">All Sources</option>
              <option value="PLAID">Plaid (Bank)</option>
              <option value="HD_PRO_XTRA">Home Depot</option>
              <option value="CHASE_BANK">Chase CSV</option>
              <option value="APPLE_CARD">Apple Card</option>
            </select>
            {(bankConnections.length > 0 || csvBatches.length > 0) && (
              <select
                value={bankAccountFilter}
                onChange={e => {
                  setBankAccountFilter(e.target.value);
                  // Auto-set source filter to match the selected account
                  const v = e.target.value;
                  if (v.startsWith("conn:")) setBankSourceFilter("");
                  else if (v.startsWith("source:")) setBankSourceFilter(v.slice(7));
                  else {
                    // Cleared — leave source filter as-is
                  }
                }}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              >
                <option value="">All Accounts</option>
                {bankConnections.filter(c => c.status === "ACTIVE").map(conn => (
                  <option key={conn.id} value={`conn:${conn.id}`}>
                    {conn.institutionName ?? "Bank"}{conn.accountName ? ` — ${conn.accountName}` : ""}{conn.accountMask ? ` (••••${conn.accountMask})` : ""}
                  </option>
                ))}
                {Object.entries(
                  csvBatches.reduce<Record<string, CsvImportBatchDto[]>>((acc, b) => {
                    (acc[b.source] ??= []).push(b);
                    return acc;
                  }, {})
                ).map(([source, batches]) => {
                  const sourceLabels: Record<string, string> = { HD_PRO_XTRA: "Home Depot", CHASE_BANK: "Chase", APPLE_CARD: "Apple Card" };
                  const totalRows = batches.reduce((sum, b) => sum + b.rowCount, 0);
                  return (
                    <option key={source} value={`source:${source}`}>
                      {sourceLabels[source] ?? source} ({totalRows.toLocaleString()} rows)
                    </option>
                  );
                })}
              </select>
            )}
            <input
              type="date"
              value={bankStartDate}
              onChange={e => setBankStartDate(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            />
            <span style={{ fontSize: 12, color: "#6b7280" }}>to</span>
            <input
              type="date"
              value={bankEndDate}
              onChange={e => setBankEndDate(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            />
            <select
              value={bankCategoryFilter}
              onChange={e => setBankCategoryFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            >
              <option value="">All Categories</option>
              {bankCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={bankStatusFilter}
              onChange={e => setBankStatusFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            >
              <option value="">All Statuses</option>
              <option value="true">Pending</option>
              <option value="false">Posted</option>
            </select>
            <select
              value={bankProjectFilter}
              onChange={e => { setBankProjectFilter(e.target.value); setBankUnassignedFilter(false); }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            >
              <option value="">All Projects</option>
              {bankProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={bankDispositionFilter}
              onChange={e => setBankDispositionFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            >
              <option value="">All Dispositions</option>
              <option value="UNREVIEWED">Unreviewed</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IGNORED">Ignored</option>
              <option value="PERSONAL">Personal</option>
              <option value="DUPLICATE">Duplicate</option>
              <option value="RETURNED">Returned</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#374151", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={bankUnassignedFilter}
                onChange={e => { setBankUnassignedFilter(e.target.checked); if (e.target.checked) setBankProjectFilter(""); }}
              />
              Unassigned only
            </label>
            <select
              value={bankTxPageSize}
              onChange={e => { setBankTxPageSize(Number(e.target.value)); setBankTxPage(1); }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={150}>150 / page</option>
              <option value={200}>200 / page</option>
            </select>
            <button
              type="button"
              onClick={() => { fetchBankTransactions(1); fetchBankSummary(); }}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#0f172a",
                color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Apply
            </button>
            <ColumnCustomizer
              storageKey="ncc-banking-columns"
              visibleColumns={bankVisibleCols}
              onChange={setBankVisibleCols}
            />
            {/* Bulk prescreen accept for high-confidence matches */}
            {bankTransactions.some(t => t.extra?.prescreenStatus === "PENDING" && (t.extra?.prescreenConfidence ?? 0) >= 0.7) && (
              <button
                type="button"
                onClick={handleBulkPrescreenAccept}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "1px solid #16a34a", background: "#dcfce7",
                  color: "#166534", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}
              >
                ✓ Confirm All High Confidence
              </button>
            )}
            {/* Re-run prescreening button */}
            <button
              type="button"
              onClick={handlePrescreenRerun}
              disabled={prescreenRunning}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "1px solid #7c3aed", background: prescreenRunning ? "#e5e7eb" : "#f5f3ff",
                color: prescreenRunning ? "#6b7280" : "#7c3aed", fontSize: 11, fontWeight: 600,
                cursor: prescreenRunning ? "not-allowed" : "pointer",
              }}
            >
              {prescreenRunning ? "Prescreening…" : "🔄 Re-run Prescreening"}
            </button>
            <button
              type="button"
              onClick={scanDuplicateExpenses}
              disabled={dupScanLoading}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "1px solid #dc2626", background: dupScanLoading ? "#e5e7eb" : "#fef2f2",
                color: dupScanLoading ? "#6b7280" : "#dc2626", fontSize: 11, fontWeight: 600,
                cursor: dupScanLoading ? "not-allowed" : "pointer",
              }}
            >
              {dupScanLoading ? "Scanning…" : "🔍 Duplicate Expenses"}
            </button>
          </div>
          {prescreenResult && (
            <div style={{ fontSize: 12, marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "#f5f3ff", border: "1px solid #c4b5fd", color: "#5b21b6" }}>
              {prescreenResult}
              <button type="button" onClick={() => setPrescreenResult(null)} style={{ marginLeft: 8, border: "none", background: "none", cursor: "pointer", color: "#7c3aed", fontSize: 11 }}>✕</button>
            </div>
          )}

          {/* Duplicate Expenses Results */}
          {dupScanResults && (
            <div style={{ marginBottom: 12, borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#fee2e2" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#991b1b" }}>
                  🔍 {dupScanResults.total} Potential Duplicate{dupScanResults.total !== 1 ? "s" : ""} Found
                  <span style={{ fontWeight: 400, color: "#b91c1c", marginLeft: 6 }}>({dupScanResults.scannedBills} bills scanned, {dupScanResults.lookbackDays}-day window)</span>
                </span>
                <button type="button" onClick={() => setDupScanResults(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontSize: 13, fontWeight: 700 }}>✕</button>
              </div>
              {dupScanResults.duplicateGroups.length === 0 && (
                <div style={{ padding: "12px 16px", fontSize: 12, color: "#166534", background: "#dcfce7" }}>
                  ✓ No cross-project duplicate expenses detected.
                </div>
              )}
              {dupScanResults.duplicateGroups.map(group => (
                <div key={group.id} style={{ padding: "10px 12px", borderTop: "1px solid #fecaca" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: group.type === "EXACT" ? "#fee2e2" : "#fef3c7",
                      color: group.type === "EXACT" ? "#991b1b" : "#92400e",
                    }}>
                      {group.type}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>
                      {(group.confidence * 100).toFixed(0)}% confidence
                    </span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>{group.reason}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {group.bills.map(bill => (
                      <div key={bill.billId} style={{
                        flex: "1 1 200px", padding: "8px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", fontSize: 11,
                      }}>
                        <div style={{ fontWeight: 700, color: "#1e40af", marginBottom: 2 }}>{bill.projectName}</div>
                        <div>{bill.vendorName} &mdash; ${Math.abs(bill.amount).toFixed(2)}</div>
                        <div style={{ color: "#6b7280" }}>{bill.date} · {bill.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bulk assign bar */}
          {bankSelectedIds.size > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              padding: "8px 12px", borderRadius: 8, background: "#eef2ff", border: "1px solid #c7d2fe",
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#4338ca" }}>
                {bankSelectedIds.size} selected
              </span>
              <select
                value={bankBulkProjectId}
                onChange={e => setBankBulkProjectId(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
              >
                <option value="">Assign to project…</option>
                {bankProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                type="button"
                onClick={handleBulkAssignProject}
                disabled={!bankBulkProjectId}
                style={{
                  padding: "4px 12px", borderRadius: 6, border: "1px solid #4338ca", background: "#4338ca",
                  color: "#fff", fontSize: 12, fontWeight: 600,
                  cursor: bankBulkProjectId ? "pointer" : "not-allowed", opacity: bankBulkProjectId ? 1 : 0.5,
                }}
              >
                Assign
              </button>
              <button
                type="button"
                onClick={() => { setBankSelectedIds(new Set()); setBankBulkProjectId(""); }}
                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: "pointer" }}
              >
                Clear
              </button>
            </div>
          )}

          {bankError && (
            <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 8 }}>{bankError}</div>
          )}

          {/* Unified Transaction table */}
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={{ padding: "8px 6px", textAlign: "center", width: 32 }}>
                    <input
                      type="checkbox"
                      checked={bankTransactions.length > 0 && bankTransactions.every(t => bankSelectedIds.has(t.id))}
                      onChange={() => {
                        if (bankTransactions.length > 0 && bankTransactions.every(t => bankSelectedIds.has(t.id))) {
                          setBankSelectedIds(new Set());
                        } else {
                          setBankSelectedIds(new Set(bankTransactions.map(t => t.id)));
                        }
                      }}
                    />
                  </th>
                  {([
                    { field: "date" as BankSortField, label: "Date", align: "left", nowrap: true },
                    { field: null, label: "Source", align: "left", nowrap: true },
                    { field: null, label: "Acct / Store #", align: "left", nowrap: true },
                    { field: "description" as BankSortField, label: "Description", align: "left", nowrap: false },
                    { field: "merchant" as BankSortField, label: "Merchant / Job", align: "left", nowrap: false },
                    { field: "category" as BankSortField, label: "Category", align: "left", nowrap: false },
                    { field: "amount" as BankSortField, label: "Amount", align: "right", nowrap: true },
                    { field: "status" as BankSortField, label: "Status", align: "center", nowrap: false },
                    { field: null, label: "Disposition", align: "center", nowrap: false },
                    { field: null, label: "Prescreen", align: "center", nowrap: false },
                    { field: "project" as BankSortField, label: "Project", align: "left", nowrap: false },
                    { field: null, label: "", align: "center", nowrap: true },
                  ] as const).map((col) => (
                    <th
                      key={col.label}
                      onClick={col.field ? () => toggleBankSort(col.field!) : undefined}
                      style={{
                        textAlign: col.align as any,
                        padding: "8px 10px",
                        whiteSpace: col.nowrap ? "nowrap" : undefined,
                        cursor: col.field ? "pointer" : "default",
                        userSelect: "none",
                        background: col.field && bankSortBy === col.field ? "#eef2ff" : undefined,
                      }}
                    >
                      {col.label}
                      {col.field && (
                        <span style={{ marginLeft: 4, fontSize: 10, color: bankSortBy === col.field ? "#4338ca" : "#c7d2fe" }}>
                          {bankSortBy === col.field
                            ? (bankSortDir === "asc" ? "▲" : "▼")
                            : "↕"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bankLoading && (
                  <tr><td colSpan={13} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading…</td></tr>
                )}
                {!bankLoading && bankTransactions.length === 0 && (
                  <tr><td colSpan={13} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                    {bankConnections.length === 0 && csvBatches.length === 0
                      ? "Connect a bank account or import a CSV to see transactions."
                      : "No transactions found."}
                  </td></tr>
                )}
                {!bankLoading && bankTransactions.map(txn => {
                  const srcBadge: Record<string, { label: string; bg: string; color: string }> = {
                    PLAID: { label: txn.extra?.institutionName ?? "Bank", bg: "#dbeafe", color: "#1d4ed8" },
                    HD_PRO_XTRA: { label: "HD", bg: "#ffedd5", color: "#c2410c" },
                    CHASE_BANK: { label: "Chase", bg: "#dbeafe", color: "#2563eb" },
                    APPLE_CARD: { label: "Apple", bg: "#f3f4f6", color: "#374151" },
                  };
                  const badge = srcBadge[txn.source] ?? { label: txn.source, bg: "#f3f4f6", color: "#6b7280" };
                  // Acct / Store # value
                  const acctStore = txn.source === "PLAID"
                    ? (txn.extra?.accountMask ? `••••${txn.extra.accountMask}` : null)
                    : (txn.extra?.storeNumber ? `#${txn.extra.storeNumber}` : null);
                  const merchantOrJob = txn.extra?.jobName || txn.merchant || "—";
                  const isSelected = bankSelectedIds.has(txn.id);
                  return (
                    <tr key={txn.id} style={{ borderTop: "1px solid #e5e7eb", background: isSelected ? "#eef2ff" : undefined }}>
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setBankSelectedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(txn.id)) next.delete(txn.id); else next.add(txn.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {new Date(txn.date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontSize: 11, color: acctStore ? "#374151" : "#d1d5db" }}>
                        {acctStore ?? "—"}
                      </td>
                      <td style={{ padding: "8px 10px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={txn.extra?.sku ? `SKU: ${txn.extra.sku}` : undefined}
                      >
                        {txn.description}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={txn.extra?.jobNameRaw || undefined}
                      >
                        {merchantOrJob}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        {(() => {
                          const catStatus = txn.extra?.categoryStatus ?? "ORIGINAL";
                          const displayCat = txn.extra?.categoryOverride ?? txn.category;
                          const chipColors: Record<string, { bg: string; color: string; border: string }> = {
                            ORIGINAL: { bg: "#f3f4f6", color: "#374151", border: "#d1d5db" },
                            TENTATIVE: { bg: "#fef9c3", color: "#854d0e", border: "#fde047" },
                            VERIFIED: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
                          };
                          const cs = chipColors[catStatus] ?? chipColors.ORIGINAL;
                          return displayCat ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCategoryModalTxn(txn);
                                  setCategoryValue(displayCat);
                                  setCategoryNote("");
                                }}
                                title={`Category: ${displayCat} (${catStatus}) — click to change`}
                                style={{
                                  padding: "2px 6px", borderRadius: 4, fontSize: 11,
                                  background: cs.bg, color: cs.color, border: `1px solid ${cs.border}`,
                                  cursor: "pointer", whiteSpace: "nowrap", maxWidth: 120,
                                  overflow: "hidden", textOverflow: "ellipsis",
                                }}
                              >
                                {displayCat}
                              </button>
                              {catStatus === "TENTATIVE" && (
                                <button
                                  type="button"
                                  onClick={() => handleCategoryVerify(txn)}
                                  title="Approve category"
                                  style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, color: "#16a34a" }}
                                >
                                  ✓
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setCategoryModalTxn(txn);
                                setCategoryValue("");
                                setCategoryNote("");
                              }}
                              title="Set category"
                              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "#9ca3af" }}
                            >
                              —
                            </button>
                          );
                        })()}
                      </td>
                      <td style={{
                        padding: "8px 10px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap",
                        color: txn.amount < 0 ? "#22c55e" : "#ef4444",
                      }}>
                        {txn.amount < 0 ? "+" : "-"}${Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: txn.pending ? "#fef3c7" : "#d1fae5",
                          color: txn.pending ? "#b45309" : "#065f46",
                        }}>
                          {txn.pending ? "PENDING" : "POSTED"}
                        </span>
                      </td>
                      {/* Disposition */}
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        {(() => {
                          const disp = txn.extra?.disposition ?? "UNREVIEWED";
                          const dispStyles: Record<string, { label: string; bg: string; color: string }> = {
                            UNREVIEWED: { label: "Unreviewed", bg: "#f3f4f6", color: "#6b7280" },
                            PENDING_APPROVAL: { label: "Pending", bg: "#fef3c7", color: "#b45309" },
                            ASSIGNED: { label: "Assigned", bg: "#dcfce7", color: "#166534" },
                            IGNORED: { label: "Ignored", bg: "#e5e7eb", color: "#4b5563" },
                            PERSONAL: { label: "Personal", bg: "#fce7f3", color: "#9d174d" },
                            DUPLICATE: { label: "Duplicate", bg: "#fee2e2", color: "#991b1b" },
                            RETURNED: { label: "Returned", bg: "#dbeafe", color: "#1d4ed8" },
                          };
                          const ds = dispStyles[disp] ?? dispStyles.UNREVIEWED;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setDispositionModalTxn(txn);
                                setDispositionValue(disp);
                                setDispositionNote("");
                              }}
                              title="Click to change disposition"
                              style={{
                                padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: ds.bg, color: ds.color, border: "none", cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {ds.label}
                            </button>
                          );
                        })()}
                      </td>
                      {/* Prescreen chip */}
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>
                        {txn.extra?.prescreenConfidence != null && txn.extra.prescreenStatus === "PENDING" ? (() => {
                          const conf = txn.extra.prescreenConfidence as number;
                          const pct = Math.round(conf * 100);
                          const chipStyle = conf >= 0.7
                            ? { bg: "#dcfce7", color: "#166534", border: "#86efac" }
                            : conf >= 0.5
                              ? { bg: "#fef9c3", color: "#854d0e", border: "#fde047" }
                              : { bg: "#ffedd5", color: "#9a3412", border: "#fdba74" };
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                              <span
                                style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: chipStyle.bg, color: chipStyle.color, border: `1px solid ${chipStyle.border}`, whiteSpace: "nowrap" }}
                                title={txn.extra.prescreenReason ?? ""}
                              >
                                {pct}%
                              </span>
                              <button type="button" onClick={() => handlePrescreenAccept(txn.id)} title="Accept" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, color: "#16a34a" }}>✓</button>
                              <button type="button" onClick={() => handlePrescreenReject(txn.id)} title="Reject" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, color: "#dc2626" }}>✕</button>
                            </div>
                          );
                        })() : txn.extra?.prescreenStatus === "ACCEPTED" ? (
                          <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>✓</span>
                        ) : txn.extra?.prescreenStatus === "REJECTED" ? (
                          <span style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>✕</span>
                        ) : (
                          <span style={{ color: "#d1d5db" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <select
                          value={txn.projectId ?? ""}
                          onChange={e => handleAssignProject(txn.id, txn.source, e.target.value || null)}
                          style={{
                            padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db",
                            fontSize: 11, maxWidth: 160, background: txn.projectId ? "#f0fdf4" : "#fff",
                          }}
                        >
                          <option value="">— None —</option>
                          {bankProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      {/* View Raw action */}
                      <td style={{ padding: "8px 4px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => openRawDetail(txn)}
                          title="View raw data"
                          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, padding: 0, color: "#6b7280" }}
                        >
                          🔍
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {bankTxTotal > bankTxPageSize && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                disabled={bankTxPage <= 1}
                onClick={() => fetchBankTransactions(bankTxPage - 1)}
                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: bankTxPage <= 1 ? "default" : "pointer", opacity: bankTxPage <= 1 ? 0.5 : 1 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, lineHeight: "28px", color: "#6b7280" }}>
                Page {bankTxPage} of {Math.ceil(bankTxTotal / bankTxPageSize)} ({bankTxTotal.toLocaleString()} total)
              </span>
              <button
                type="button"
                disabled={bankTxPage >= Math.ceil(bankTxTotal / bankTxPageSize)}
                onClick={() => fetchBankTransactions(bankTxPage + 1)}
                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, cursor: bankTxPage >= Math.ceil(bankTxTotal / bankTxPageSize) ? "default" : "pointer", opacity: bankTxPage >= Math.ceil(bankTxTotal / bankTxPageSize) ? 0.5 : 1 }}
              >
                Next →
              </button>
            </div>
          )}

          {/* Disposition Change Modal */}
          {dispositionModalTxn && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                background: "#fff", borderRadius: 12, padding: 24, minWidth: 380, maxWidth: 460,
                boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
              }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Change Disposition</h4>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
                  {dispositionModalTxn.description.slice(0, 60)}{dispositionModalTxn.description.length > 60 ? "…" : ""}
                  {" "}&mdash; ${Math.abs(dispositionModalTxn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Disposition</label>
                <select
                  value={dispositionValue}
                  onChange={e => setDispositionValue(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, marginBottom: 12 }}
                >
                  <option value="UNREVIEWED">Unreviewed</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IGNORED">Ignored</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="DUPLICATE">Duplicate</option>
                  <option value="RETURNED">Returned</option>
                </select>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Note (required)</label>
                <textarea
                  value={dispositionNote}
                  onChange={e => setDispositionNote(e.target.value)}
                  placeholder="Reason for this disposition change…"
                  rows={3}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => { setDispositionModalTxn(null); setDispositionValue(""); setDispositionNote(""); }}
                    style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDispositionChange}
                    disabled={dispositionSaving || !dispositionNote.trim() || dispositionNote.trim().length < 3}
                    style={{
                      padding: "8px 16px", borderRadius: 6, border: "1px solid #0f172a",
                      background: dispositionSaving || !dispositionNote.trim() || dispositionNote.trim().length < 3 ? "#e5e7eb" : "#0f172a",
                      color: dispositionSaving || !dispositionNote.trim() || dispositionNote.trim().length < 3 ? "#6b7280" : "#fff",
                      fontSize: 13, fontWeight: 600,
                      cursor: dispositionSaving || !dispositionNote.trim() || dispositionNote.trim().length < 3 ? "not-allowed" : "pointer",
                    }}
                  >
                    {dispositionSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Category Override Modal */}
          {categoryModalTxn && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                background: "#fff", borderRadius: 12, padding: 24, minWidth: 380, maxWidth: 460,
                boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
              }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Change Category</h4>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
                  {categoryModalTxn.description.slice(0, 60)}{categoryModalTxn.description.length > 60 ? "…" : ""}
                  {" "}&mdash; ${Math.abs(categoryModalTxn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>New Category</label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={categoryValue}
                  onChange={e => setCategoryValue(e.target.value)}
                  placeholder="Enter category…"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
                />
                <datalist id="category-suggestions">
                  {bankCategories.map(c => <option key={c} value={c} />)}
                </datalist>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Note (optional)</label>
                <textarea
                  value={categoryNote}
                  onChange={e => setCategoryNote(e.target.value)}
                  placeholder="Reason for category change…"
                  rows={2}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "8px 0 0" }}>
                  This will set category status to <strong style={{ color: "#854d0e" }}>TENTATIVE</strong> (yellow). A PM can verify it later.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => { setCategoryModalTxn(null); setCategoryValue(""); setCategoryNote(""); }}
                    style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCategoryOverride}
                    disabled={categorySaving || !categoryValue.trim()}
                    style={{
                      padding: "8px 16px", borderRadius: 6, border: "1px solid #0f172a",
                      background: categorySaving || !categoryValue.trim() ? "#e5e7eb" : "#0f172a",
                      color: categorySaving || !categoryValue.trim() ? "#6b7280" : "#fff",
                      fontSize: 13, fontWeight: 600,
                      cursor: categorySaving || !categoryValue.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {categorySaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Raw Detail Modal */}
          <RawDetailModal
            open={rawDetailOpen}
            onClose={() => setRawDetailOpen(false)}
            source={rawDetailSource}
            data={rawDetailTxn}
          />
        </section>
      )}

    </PageCard>
  );
}
