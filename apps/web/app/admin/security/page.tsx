"use client";

import { useEffect, useState, useCallback } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Role hierarchy
const ROLE_ORDER = [
  "CLIENT",
  "CREW",
  "FOREMAN",
  "SUPER",
  "PM",
  "EXECUTIVE",
  "ADMIN",
  "OWNER",
  "SUPER_ADMIN",
];

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Client",
  CREW: "Crew",
  FOREMAN: "Foreman",
  SUPER: "Super",
  PM: "PM",
  EXECUTIVE: "Exec",
  ADMIN: "Admin",
  OWNER: "Owner",
  SUPER_ADMIN: "Super Admin",
};

// Protected roles require confirmation before modifying
const PROTECTED_ROLES = new Set(["ADMIN", "OWNER", "SUPER_ADMIN"]);

// Application Map structure - defines the app's modules and their securable fields
interface SecurableField {
  key: string; // The data-sec-key value (e.g., "petl.itemAmount")
  label: string; // Human-readable label
  description?: string;
}

interface AppPage {
  id: string;
  label: string;
  path?: string; // URL path for reference
  fields: SecurableField[];
}

interface AppModule {
  id: string;
  label: string;
  icon: string;
  pages: AppPage[];
}

// Define the application structure with all securable fields
const APPLICATION_MAP: AppModule[] = [
  {
    id: "projects",
    label: "Projects",
    icon: "📁",
    pages: [
      {
        id: "project-overview",
        label: "Project Overview",
        path: "/projects/[id]",
        fields: [
          { key: "project.budget", label: "Project Budget", description: "Total project budget amount" },
          { key: "project.costToDate", label: "Cost to Date", description: "Accumulated project costs" },
          { key: "project.margin", label: "Profit Margin", description: "Project profit margin percentage" },
        ],
      },
      {
        id: "petl",
        label: "PETL (Pay Estimate)",
        path: "/projects/[id]/petl",
        fields: [
          { key: "petl.itemAmount", label: "Line Item Total", description: "Total amount for each PETL line item" },
          { key: "petl.rcvAmount", label: "RCV Amount", description: "Replacement Cost Value amount" },
          { key: "petl.percentComplete", label: "Percent Complete", description: "Completion percentage for line items" },
          { key: "petl.unitPrice", label: "Unit Price", description: "Price per unit for line items" },
          { key: "petl.laborCost", label: "Labor Cost", description: "Labor cost breakdown" },
          { key: "petl.materialCost", label: "Material Cost", description: "Material cost breakdown" },
        ],
      },
      {
        id: "timecards",
        label: "Timecards",
        path: "/projects/[id]/timecards",
        fields: [
          { key: "timecard.payRate", label: "Pay Rate", description: "Worker hourly pay rate" },
          { key: "timecard.totalPay", label: "Total Pay", description: "Total pay for timecard period" },
          { key: "timecard.overtime", label: "Overtime Hours", description: "Overtime hours worked" },
        ],
      },
      {
        id: "change-orders",
        label: "Change Orders",
        path: "/projects/[id]/change-orders",
        fields: [
          { key: "changeOrder.amount", label: "Change Order Amount", description: "Dollar amount of change order" },
          { key: "changeOrder.markup", label: "Markup Percentage", description: "Applied markup percentage" },
        ],
      },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    icon: "💰",
    pages: [
      {
        id: "financial-overview",
        label: "Financial Overview",
        path: "/financial",
        fields: [
          { key: "financial.revenue", label: "Revenue", description: "Total company revenue" },
          { key: "financial.expenses", label: "Expenses", description: "Total company expenses" },
          { key: "financial.profit", label: "Profit", description: "Net profit" },
          { key: "financial.cashFlow", label: "Cash Flow", description: "Cash flow summary" },
        ],
      },
      {
        id: "invoices",
        label: "Invoices",
        path: "/financial/invoices",
        fields: [
          { key: "invoice.amount", label: "Invoice Amount", description: "Total invoice amount" },
          { key: "invoice.paid", label: "Amount Paid", description: "Amount paid on invoice" },
          { key: "invoice.balance", label: "Balance Due", description: "Remaining balance" },
        ],
      },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: "👥",
    pages: [
      {
        id: "worker-profiles",
        label: "Worker Profiles",
        path: "/company/users",
        fields: [
          { key: "worker.payRate", label: "Base Pay Rate", description: "Worker's base hourly rate" },
          { key: "worker.billRate", label: "Bill Rate", description: "Rate charged to clients" },
          { key: "worker.ssn", label: "SSN (Last 4)", description: "Social Security Number" },
          { key: "worker.bankAccount", label: "Bank Account", description: "Direct deposit information" },
          { key: "worker.address", label: "Home Address", description: "Worker's home address" },
        ],
      },
      {
        id: "hr-records",
        label: "HR Records",
        path: "/company/users/[id]#hr",
        fields: [
          { key: "hr.salary", label: "Salary", description: "Annual salary" },
          { key: "hr.performanceRating", label: "Performance Rating", description: "Performance review scores" },
          { key: "hr.disciplinaryNotes", label: "Disciplinary Notes", description: "HR disciplinary records" },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "📊",
    pages: [
      {
        id: "reports-financial",
        label: "Financial Reports",
        path: "/reports/financial",
        fields: [
          { key: "report.profitLoss", label: "P&L Data", description: "Profit and loss report data" },
          { key: "report.payroll", label: "Payroll Data", description: "Payroll summary data" },
          { key: "report.costAnalysis", label: "Cost Analysis", description: "Detailed cost breakdowns" },
        ],
      },
      {
        id: "reports-operational",
        label: "Operational Reports",
        path: "/reports/operational",
        fields: [
          { key: "report.productivity", label: "Productivity Metrics", description: "Worker productivity data" },
          { key: "report.utilization", label: "Resource Utilization", description: "Equipment/resource usage" },
        ],
      },
    ],
  },
];

interface FieldSecurityPermission {
  id: string;
  roleCode: string;
  canView: boolean;
  canEdit: boolean;
  canExport: boolean;
}

interface FieldSecurityPolicy {
  id: string;
  resourceKey: string;
  label: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: FieldSecurityPermission[];
}

interface RoleInfo {
  hierarchy: string[];
  userRole: string;
  effectiveRoleIndex: number;
}

export default function FieldSecurityPage() {
  const [policies, setPolicies] = useState<FieldSecurityPolicy[]>([]);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(["projects"]));
  const [selectedPage, setSelectedPage] = useState<AppPage | null>(null);
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(APPLICATION_MAP[0]);

  // Saving state
  const [savingField, setSavingField] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Bulk selectors visibility
  const [showBulkColumns, setShowBulkColumns] = useState(false);
  const [showBulkRows, setShowBulkRows] = useState(false);

  // Confirmation modal for protected roles
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    action: () => Promise<void>;
    message: string;
  } | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("accessToken");
    return { Authorization: `Bearer ${token}` };
  };

  const loadPolicies = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/field-security/policies`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to load policies: ${res.status}`);
      const data = await res.json();
      setPolicies(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load policies");
    }
  }, []);

  const loadRoleInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/field-security/roles`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setRoleInfo(data);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }

    Promise.all([loadPolicies(), loadRoleInfo()]).finally(() => setLoading(false));

    // Auto-select first page
    if (APPLICATION_MAP[0]?.pages[0]) {
      setSelectedPage(APPLICATION_MAP[0].pages[0]);
    }
  }, [loadPolicies, loadRoleInfo]);

  const getPolicyForField = (fieldKey: string): FieldSecurityPolicy | undefined => {
    return policies.find((p) => p.resourceKey === fieldKey);
  };

  const getPermissionForRole = (fieldKey: string, role: string) => {
    const policy = getPolicyForField(fieldKey);
    return policy?.permissions.find((p) => p.roleCode === role);
  };

  const canEditRole = (role: string) => {
    if (!roleInfo) return false;
    const roleIndex = roleInfo.hierarchy.indexOf(role);
    const userIndex = roleInfo.hierarchy.indexOf(roleInfo.userRole);
    return roleIndex <= userIndex;
  };

  const handleTogglePermission = async (
    fieldKey: string,
    fieldLabel: string,
    role: string,
    permType: "canView" | "canEdit" | "canExport",
    currentValue: boolean
  ) => {
    setSavingField(fieldKey);

    const existingPolicy = getPolicyForField(fieldKey);
    const existingPerm = existingPolicy?.permissions.find((p) => p.roleCode === role);

    // Build new permissions array - API expects roleCode
    const newPermissions = (existingPolicy?.permissions ?? [])
      .filter((p) => p.roleCode !== role)
      .map((p) => ({
        roleCode: p.roleCode,
        canView: p.canView,
        canEdit: p.canEdit,
        canExport: p.canExport,
      }));

    newPermissions.push({
      roleCode: role,
      canView: permType === "canView" ? !currentValue : (existingPerm?.canView ?? true),
      canEdit: permType === "canEdit" ? !currentValue : (existingPerm?.canEdit ?? false),
      canExport: permType === "canExport" ? !currentValue : (existingPerm?.canExport ?? true),
    });

    try {
      const res = await fetch(
        `${API_BASE}/field-security/policies/${encodeURIComponent(fieldKey)}`,
        {
          method: "PUT",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            label: fieldLabel,
            description: null,
            isActive: true,
            permissions: newPermissions,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update policy");
      }

      await loadPolicies();
    } catch (err: any) {
      alert(err?.message ?? "Failed to update policy");
    } finally {
      setSavingField(null);
    }
  };

  // Check if a role is protected (Admin+)
  const isProtectedRole = (role: string) => PROTECTED_ROLES.has(role);

  // Bulk toggle all permissions for a role (column)
  const handleBulkToggleColumn = async (
    role: string,
    permType: "canView" | "canEdit" | "canExport",
    enable: boolean
  ) => {
    if (!selectedPage) return;

    const doUpdate = async () => {
      setBulkSaving(true);
      try {
        for (const field of selectedPage.fields) {
          const existingPolicy = getPolicyForField(field.key);
          const existingPerm = existingPolicy?.permissions.find((p) => p.roleCode === role);

          const newPermissions = (existingPolicy?.permissions ?? [])
            .filter((p) => p.roleCode !== role)
            .map((p) => ({
              roleCode: p.roleCode,
              canView: p.canView,
              canEdit: p.canEdit,
              canExport: p.canExport,
            }));

          newPermissions.push({
            roleCode: role,
            canView: permType === "canView" ? enable : (existingPerm?.canView ?? true),
            canEdit: permType === "canEdit" ? enable : (existingPerm?.canEdit ?? false),
            canExport: permType === "canExport" ? enable : (existingPerm?.canExport ?? true),
          });

          await fetch(
            `${API_BASE}/field-security/policies/${encodeURIComponent(field.key)}`,
            {
              method: "PUT",
              headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({
                label: field.label,
                description: null,
                isActive: true,
                permissions: newPermissions,
              }),
            }
          );
        }
        await loadPolicies();
      } catch (err: any) {
        alert(err?.message ?? "Failed to update policies");
      } finally {
        setBulkSaving(false);
        setConfirmModal(null);
      }
    };

    // If protected role, show confirmation
    if (isProtectedRole(role)) {
      setConfirmModal({
        show: true,
        action: doUpdate,
        message: `You are about to ${enable ? "enable" : "disable"} ${permType.replace("can", "")} access for ${ROLE_LABELS[role]} on all fields in this page. This is a protected administrative role. Are you sure?`,
      });
    } else {
      await doUpdate();
    }
  };

  // Bulk toggle all roles for a field (row)
  const handleBulkToggleRow = async (
    field: SecurableField,
    permType: "canView" | "canEdit" | "canExport",
    enable: boolean,
    excludeProtected: boolean = true
  ) => {
    const doUpdate = async () => {
      setBulkSaving(true);
      try {
        const existingPolicy = getPolicyForField(field.key);
        const newPermissions: Array<{ roleCode: string; canView: boolean; canEdit: boolean; canExport: boolean }> = [];

        for (const role of ROLE_ORDER) {
          // Skip protected roles if excludeProtected is true, unless we're enabling
          const skipRole = excludeProtected && isProtectedRole(role) && !enable;
          const existingPerm = existingPolicy?.permissions.find((p) => p.roleCode === role);

          if (skipRole) {
            // Keep existing permission for protected roles
            newPermissions.push({
              roleCode: role,
              canView: existingPerm?.canView ?? true,
              canEdit: existingPerm?.canEdit ?? true,
              canExport: existingPerm?.canExport ?? true,
            });
          } else {
            newPermissions.push({
              roleCode: role,
              canView: permType === "canView" ? enable : (existingPerm?.canView ?? true),
              canEdit: permType === "canEdit" ? enable : (existingPerm?.canEdit ?? (isProtectedRole(role) ? true : false)),
              canExport: permType === "canExport" ? enable : (existingPerm?.canExport ?? true),
            });
          }
        }

        await fetch(
          `${API_BASE}/field-security/policies/${encodeURIComponent(field.key)}`,
          {
            method: "PUT",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({
              label: field.label,
              description: null,
              isActive: true,
              permissions: newPermissions,
            }),
          }
        );

        await loadPolicies();
      } catch (err: any) {
        alert(err?.message ?? "Failed to update policy");
      } finally {
        setBulkSaving(false);
        setConfirmModal(null);
      }
    };

    await doUpdate();
  };

  // Get column state for a role (all/some/none checked)
  const getColumnState = (role: string, permType: "canView" | "canEdit" | "canExport"): "all" | "some" | "none" => {
    if (!selectedPage) return "none";
    let checked = 0;
    for (const field of selectedPage.fields) {
      const perm = getPermissionForRole(field.key, role);
      const value = permType === "canView" ? (perm?.canView ?? true) :
                    permType === "canEdit" ? (perm?.canEdit ?? false) :
                    (perm?.canExport ?? true);
      if (value) checked++;
    }
    if (checked === 0) return "none";
    if (checked === selectedPage.fields.length) return "all";
    return "some";
  };

  // Get row state for a field (all/some/none checked for non-protected roles)
  const getRowState = (fieldKey: string, permType: "canView" | "canEdit" | "canExport"): "all" | "some" | "none" => {
    const nonProtectedRoles = ROLE_ORDER.filter((r) => !isProtectedRole(r));
    let checked = 0;
    for (const role of nonProtectedRoles) {
      const perm = getPermissionForRole(fieldKey, role);
      const value = permType === "canView" ? (perm?.canView ?? true) :
                    permType === "canEdit" ? (perm?.canEdit ?? false) :
                    (perm?.canExport ?? true);
      if (value) checked++;
    }
    if (checked === 0) return "none";
    if (checked === nonProtectedRoles.length) return "all";
    return "some";
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const selectPage = (module: AppModule, page: AppPage) => {
    setSelectedModule(module);
    setSelectedPage(page);
  };

  if (loading) {
    return (
      <PageCard>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading security configuration...</p>
      </PageCard>
    );
  }

  if (error) {
    return (
      <PageCard>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Field Security</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </PageCard>
    );
  }

  return (
    <PageCard style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Header */}
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>Application Security Map</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Configure field-level access by selecting a page from the application map, then set View/Edit/Export permissions for each role.
          </p>
        </header>

        {/* Role Info Banner */}
        {roleInfo && (
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 6,
              fontSize: 13,
              color: "#0c4a6e",
            }}
          >
            <strong>Your role:</strong> {ROLE_LABELS[roleInfo.userRole] || roleInfo.userRole} — You can modify permissions for roles up to and including your level.
          </div>
        )}

        {/* Main Content: Tree + Detail Panel */}
        <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
          {/* Left Panel: Application Tree */}
          <div
            style={{
              width: 280,
              flexShrink: 0,
              backgroundColor: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "#f3f4f6",
                borderBottom: "1px solid #e5e7eb",
                fontWeight: 600,
                fontSize: 14,
                color: "#374151",
              }}
            >
              📋 Application Map
            </div>
            <div style={{ padding: 8, flex: 1, overflowY: "auto" }}>
              {APPLICATION_MAP.map((module) => (
                <div key={module.id} style={{ marginBottom: 4 }}>
                  {/* Module Header */}
                  <button
                    type="button"
                    onClick={() => toggleModule(module.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      backgroundColor: "transparent",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#374151",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#6b7280", width: 16 }}>
                      {expandedModules.has(module.id) ? "▼" : "▶"}
                    </span>
                    <span>{module.icon}</span>
                    <span>{module.label}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        color: "#9ca3af",
                        backgroundColor: "#e5e7eb",
                        padding: "2px 6px",
                        borderRadius: 10,
                      }}
                    >
                      {module.pages.length}
                    </span>
                  </button>

                  {/* Module Pages */}
                  {expandedModules.has(module.id) && (
                    <div style={{ marginLeft: 24, marginTop: 2 }}>
                      {module.pages.map((page) => {
                        const isSelected = selectedPage?.id === page.id;
                        const configuredCount = page.fields.filter((f) =>
                          getPolicyForField(f.key)
                        ).length;

                        return (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => selectPage(module, page)}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 10px",
                              marginBottom: 2,
                              backgroundColor: isSelected ? "#dbeafe" : "transparent",
                              border: isSelected ? "1px solid #93c5fd" : "1px solid transparent",
                              borderRadius: 5,
                              cursor: "pointer",
                              fontSize: 13,
                              color: isSelected ? "#1e40af" : "#4b5563",
                              textAlign: "left",
                            }}
                          >
                            <span>{page.label}</span>
                            <span
                              style={{
                                fontSize: 10,
                                color: configuredCount > 0 ? "#16a34a" : "#9ca3af",
                              }}
                            >
                              {configuredCount}/{page.fields.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Field Security Matrix */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {selectedPage ? (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {/* Page Header */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{selectedModule?.icon}</span>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                      {selectedModule?.label} → {selectedPage.label}
                    </h2>
                  </div>
                  {selectedPage.path && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
                      {selectedPage.path}
                    </p>
                  )}
                </div>

                {/* Fields Table */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "auto", flex: 1, minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      {/* Role Labels Row */}
                      <tr style={{ backgroundColor: "#f3f4f6" }}>
                        <th
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                            color: "#374151",
                            borderBottom: "1px solid #e5e7eb",
                            width: showBulkRows ? 240 : 200,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => setShowBulkRows(!showBulkRows)}
                              title={showBulkRows ? "Hide row bulk selectors" : "Show row bulk selectors"}
                              style={{
                                padding: "2px 4px",
                                fontSize: 10,
                                backgroundColor: showBulkRows ? "#dbeafe" : "#f3f4f6",
                                color: showBulkRows ? "#1d4ed8" : "#6b7280",
                                border: "1px solid #d1d5db",
                                borderRadius: 4,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              {showBulkRows ? "◀" : "▶"}
                            </button>
                            <span>Field</span>
                          </div>
                        </th>
                        {ROLE_ORDER.map((role) => {
                          const isProtected = isProtectedRole(role);
                          return (
                            <th
                              key={role}
                              style={{
                                padding: "6px 4px",
                                textAlign: "center",
                                fontWeight: 600,
                                fontSize: 11,
                                color: isProtected ? "#dc2626" : "#374151",
                                borderBottom: "1px solid #d1d5db",
                                minWidth: 60,
                                backgroundColor: isProtected ? "#fef2f2" : undefined,
                              }}
                            >
                              {ROLE_LABELS[role]}
                              {isProtected && <span style={{ marginLeft: 2 }}>🔒</span>}
                            </th>
                          );
                        })}
                      </tr>
                      {/* Column Checkboxes Row - Collapsible */}
                      <tr style={{ backgroundColor: "#f9fafb" }}>
                        <th
                          style={{
                            padding: "4px 12px",
                            textAlign: "left",
                            fontSize: 10,
                            color: "#6b7280",
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setShowBulkColumns(!showBulkColumns)}
                            title={showBulkColumns ? "Hide column bulk selectors" : "Show column bulk selectors"}
                            style={{
                              padding: "2px 6px",
                              fontSize: 10,
                              backgroundColor: showBulkColumns ? "#dbeafe" : "#f3f4f6",
                              color: showBulkColumns ? "#1d4ed8" : "#6b7280",
                              border: "1px solid #d1d5db",
                              borderRadius: 4,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {showBulkColumns ? "▲ Hide bulk" : "▼ Bulk select"}
                          </button>
                        </th>
                        {ROLE_ORDER.map((role) => {
                          const isProtected = isProtectedRole(role);
                          const editable = canEditRole(role);
                          const viewState = getColumnState(role, "canView");
                          const editState = getColumnState(role, "canEdit");
                          const exportState = getColumnState(role, "canExport");

                          return (
                            <th
                              key={`col-${role}`}
                              style={{
                                padding: showBulkColumns ? "4px 2px" : "2px",
                                textAlign: "center",
                                borderBottom: "1px solid #e5e7eb",
                                backgroundColor: isProtected ? "#fef2f2" : undefined,
                              }}
                            >
                              {showBulkColumns ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                  {/* View toggle */}
                                  <label
                                    title={`Toggle View for all ${ROLE_LABELS[role]}`}
                                    style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 9, color: "#6b7280", cursor: editable ? "pointer" : "not-allowed" }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={viewState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = viewState === "some"; }}
                                      disabled={!editable || bulkSaving}
                                      onChange={() => handleBulkToggleColumn(role, "canView", viewState !== "all")}
                                      style={{ width: 10, height: 10 }}
                                    />
                                    V
                                  </label>
                                  {/* Edit toggle */}
                                  <label
                                    title={`Toggle Edit for all ${ROLE_LABELS[role]}`}
                                    style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 9, color: "#6b7280", cursor: editable ? "pointer" : "not-allowed" }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = editState === "some"; }}
                                      disabled={!editable || bulkSaving}
                                      onChange={() => handleBulkToggleColumn(role, "canEdit", editState !== "all")}
                                      style={{ width: 10, height: 10 }}
                                    />
                                    E
                                  </label>
                                  {/* Export toggle */}
                                  <label
                                    title={`Toggle Export for all ${ROLE_LABELS[role]}`}
                                    style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 9, color: "#6b7280", cursor: editable ? "pointer" : "not-allowed" }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={exportState === "all"}
                                      ref={(el) => { if (el) el.indeterminate = exportState === "some"; }}
                                      disabled={!editable || bulkSaving}
                                      onChange={() => handleBulkToggleColumn(role, "canExport", exportState !== "all")}
                                      style={{ width: 10, height: 10 }}
                                    />
                                    X
                                  </label>
                                </div>
                              ) : (
                                <span style={{ fontSize: 9, color: "#d1d5db" }}>•</span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPage.fields.map((field, fieldIndex) => {
                        const isSaving = savingField === field.key;

                        return (
                          <tr
                            key={field.key}
                            style={{
                              backgroundColor: fieldIndex % 2 === 0 ? "#ffffff" : "#fafafa",
                              opacity: isSaving ? 0.6 : 1,
                            }}
                          >
                            {/* Field Info with Row Checkboxes */}
                            <td
                              style={{
                                padding: "10px 12px",
                                borderBottom: "1px solid #e5e7eb",
                                verticalAlign: "top",
                              }}
                            >
                              <div style={{ display: "flex", gap: showBulkRows ? 10 : 0 }}>
                                {/* Row bulk toggles - collapsible */}
                                {showBulkRows && (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 2,
                                      paddingRight: 8,
                                      borderRight: "1px solid #e5e7eb",
                                    }}
                                  >
                                    {(["canView", "canEdit", "canExport"] as const).map((permType) => {
                                      const rowState = getRowState(field.key, permType);
                                      const label = permType === "canView" ? "V" : permType === "canEdit" ? "E" : "X";
                                      return (
                                        <label
                                          key={permType}
                                          title={`Toggle ${permType.replace("can", "")} for all non-admin roles`}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 2,
                                            fontSize: 9,
                                            color: "#6b7280",
                                            cursor: bulkSaving ? "not-allowed" : "pointer",
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={rowState === "all"}
                                            ref={(el) => { if (el) el.indeterminate = rowState === "some"; }}
                                            disabled={bulkSaving}
                                            onChange={() => handleBulkToggleRow(field, permType, rowState !== "all")}
                                            style={{ width: 10, height: 10 }}
                                          />
                                          {label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                                {/* Field info */}
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 500, color: "#111827" }}>{field.label}</div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "#6b7280",
                                      fontFamily: "monospace",
                                      marginTop: 2,
                                    }}
                                  >
                                    {field.key}
                                  </div>
                                  {field.description && (
                                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                                      {field.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Permission Cells for Each Role */}
                            {ROLE_ORDER.map((role) => {
                              const perm = getPermissionForRole(field.key, role);
                              const editable = canEditRole(role);
                              const canView = perm?.canView ?? true;
                              const canEdit = perm?.canEdit ?? false;
                              const canExport = perm?.canExport ?? true;

                              return (
                                <td
                                  key={role}
                                  style={{
                                    padding: "6px 4px",
                                    textAlign: "center",
                                    borderBottom: "1px solid #e5e7eb",
                                    verticalAlign: "middle",
                                    backgroundColor: !editable ? "#f3f4f6" : undefined,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      gap: 3,
                                    }}
                                  >
                                    {/* View */}
                                    <label
                                      title="View"
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        fontSize: 10,
                                        color: canView ? "#16a34a" : "#dc2626",
                                        cursor: editable ? "pointer" : "not-allowed",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={canView}
                                        disabled={!editable || isSaving}
                                        onChange={() =>
                                          handleTogglePermission(
                                            field.key,
                                            field.label,
                                            role,
                                            "canView",
                                            canView
                                          )
                                        }
                                        style={{ width: 12, height: 12 }}
                                      />
                                      V
                                    </label>
                                    {/* Edit */}
                                    <label
                                      title="Edit"
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        fontSize: 10,
                                        color: canEdit ? "#16a34a" : "#dc2626",
                                        cursor: editable ? "pointer" : "not-allowed",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={canEdit}
                                        disabled={!editable || isSaving}
                                        onChange={() =>
                                          handleTogglePermission(
                                            field.key,
                                            field.label,
                                            role,
                                            "canEdit",
                                            canEdit
                                          )
                                        }
                                        style={{ width: 12, height: 12 }}
                                      />
                                      E
                                    </label>
                                    {/* Export */}
                                    <label
                                      title="Export"
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        fontSize: 10,
                                        color: canExport ? "#16a34a" : "#dc2626",
                                        cursor: editable ? "pointer" : "not-allowed",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={canExport}
                                        disabled={!editable || isSaving}
                                        onChange={() =>
                                          handleTogglePermission(
                                            field.key,
                                            field.label,
                                            role,
                                            "canExport",
                                            canExport
                                          )
                                        }
                                        style={{ width: 12, height: 12 }}
                                      />
                                      X
                                    </label>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div
                  style={{
                    marginTop: 16,
                    padding: 12,
                    backgroundColor: "#f9fafb",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                >
                  <strong>Legend:</strong> V = View, E = Edit, X = Export &nbsp;|&nbsp;
                  <span style={{ color: "#16a34a" }}>✓ Green = Allowed</span> &nbsp;|&nbsp;
                  <span style={{ color: "#dc2626" }}>✗ Red = Denied</span> &nbsp;|&nbsp;
                  <span style={{ color: "#dc2626" }}>🔒 = Protected role (Admin+)</span> &nbsp;|&nbsp;
                  <span style={{ color: "#9ca3af" }}>Row checkboxes affect non-admin roles only</span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#6b7280",
                  fontSize: 14,
                }}
              >
                Select a page from the Application Map to configure field security.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Protected Roles */}
      {confirmModal?.show && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 450,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: 18, color: "#dc2626" }}>Protected Role Warning</h3>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#374151", lineHeight: 1.5 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmModal.action()}
                disabled={bulkSaving}
                style={{
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: bulkSaving ? "#9ca3af" : "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  cursor: bulkSaving ? "not-allowed" : "pointer",
                }}
              >
                {bulkSaving ? "Updating..." : "Yes, Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageCard>
  );
}
