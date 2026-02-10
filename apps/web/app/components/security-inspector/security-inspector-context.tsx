"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

/**
 * Role hierarchy for field-level security.
 * Matches the backend FIELD_SECURITY_ROLE_HIERARCHY.
 */
export const FIELD_SECURITY_ROLE_HIERARCHY = [
  "CLIENT",
  "CREW",
  "FOREMAN",
  "SUPER",
  "PM",
  "EXECUTIVE",
  "ADMIN",
  "OWNER",
  "SUPER_ADMIN",
] as const;

export type FieldSecurityRoleCode = (typeof FIELD_SECURITY_ROLE_HIERARCHY)[number];

export interface FieldPermission {
  roleCode: FieldSecurityRoleCode;
  canView: boolean;
  canEdit: boolean;
  canExport: boolean;
}

export interface FieldPolicy {
  id?: string;
  companyId?: string;
  resourceKey: string;
  description: string | null;
  permissions: FieldPermission[];
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RoleInfo {
  hierarchy: readonly FieldSecurityRoleCode[];
  userRole: FieldSecurityRoleCode;
  canModify: FieldSecurityRoleCode[];
}

export interface InspectorTarget {
  resourceKey: string;
  element: HTMLElement;
  rect: DOMRect;
}

interface SecurityInspectorContextValue {
  /** Whether the inspector is enabled (dev mode or admin in production) */
  isEnabled: boolean;
  /** Whether the inspector overlay is currently open */
  isOpen: boolean;
  /** The current target field being inspected */
  target: InspectorTarget | null;
  /** The policy for the current target */
  policy: FieldPolicy | null;
  /** Loading state for policy fetch */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Role information for the current user */
  roleInfo: RoleInfo | null;
  /** Open the inspector for a specific resource key */
  openInspector: (resourceKey: string, element: HTMLElement) => void;
  /** Close the inspector */
  closeInspector: () => void;
  /** Update a permission for a role */
  updatePermission: (
    roleCode: FieldSecurityRoleCode,
    field: "canView" | "canEdit" | "canExport",
    value: boolean
  ) => void;
  /** Save the current policy changes */
  savePolicy: () => Promise<void>;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Saving state */
  saving: boolean;
}

const SecurityInspectorContext = createContext<SecurityInspectorContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Check if security inspector is enabled (dev mode by default)
const isInspectorEnabled = () => {
  if (typeof window === "undefined") return false;
  // Enable in development or when explicitly enabled via env
  const isDev = process.env.NODE_ENV === "development";
  const explicitlyEnabled = process.env.NEXT_PUBLIC_SECURITY_INSPECTOR_ENABLED === "true";
  return isDev || explicitlyEnabled;
};

export function SecurityInspectorProvider({ children }: { children: ReactNode }) {
  const [isEnabled] = useState(isInspectorEnabled);
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<InspectorTarget | null>(null);
  const [policy, setPolicy] = useState<FieldPolicy | null>(null);
  const [originalPolicy, setOriginalPolicy] = useState<FieldPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [sKeyHeld, setSKeyHeld] = useState(false);

  // Track S key state
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "s" || e.key === "S") {
        setSKeyHeld(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "s" || e.key === "S") {
        setSKeyHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isEnabled]);

  // Handle S+right-click to open inspector
  useEffect(() => {
    if (!isEnabled) return;

    const handleContextMenu = (e: MouseEvent) => {
      if (!sKeyHeld) return;

      // Find nearest element with data-sec-key attribute
      let el = e.target as HTMLElement | null;
      while (el) {
        const secKey = el.getAttribute("data-sec-key");
        if (secKey) {
          e.preventDefault();
          openInspector(secKey, el);
          return;
        }
        el = el.parentElement;
      }
    };

    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isEnabled, sKeyHeld]);

  // Fetch role info on mount
  useEffect(() => {
    if (!isEnabled) return;

    const fetchRoleInfo = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE}/field-security/roles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRoleInfo(data);
        }
      } catch {
        // Ignore errors - role info is optional
      }
    };

    fetchRoleInfo();
  }, [isEnabled]);

  const openInspector = useCallback(async (resourceKey: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTarget({ resourceKey, element, rect });
    setIsOpen(true);
    setLoading(true);
    setError(null);

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/field-security/policies/${encodeURIComponent(resourceKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch policy: ${res.status}`);
      }

      const data = await res.json();
      setPolicy(data);
      setOriginalPolicy(JSON.parse(JSON.stringify(data)));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load policy");
      // Set default policy on error
      setPolicy({
        resourceKey,
        description: null,
        permissions: FIELD_SECURITY_ROLE_HIERARCHY.map((roleCode, index) => ({
          roleCode,
          canView: true,
          canEdit: index >= 4, // PM and above
          canExport: true,
        })),
        isDefault: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const closeInspector = useCallback(() => {
    setIsOpen(false);
    setTarget(null);
    setPolicy(null);
    setOriginalPolicy(null);
    setError(null);
  }, []);

  const updatePermission = useCallback(
    (
      roleCode: FieldSecurityRoleCode,
      field: "canView" | "canEdit" | "canExport",
      value: boolean
    ) => {
      if (!policy) return;

      // Check if user can modify this role
      if (roleInfo && !roleInfo.canModify.includes(roleCode)) {
        return; // Silently ignore - UI should disable these
      }

      setPolicy((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          permissions: prev.permissions.map((p) =>
            p.roleCode === roleCode ? { ...p, [field]: value } : p
          ),
        };
      });
    },
    [policy, roleInfo]
  );

  const savePolicy = useCallback(async () => {
    if (!policy || !target) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/field-security/policies/${encodeURIComponent(target.resourceKey)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            description: policy.description,
            permissions: policy.permissions.map((p) => ({
              roleCode: p.roleCode,
              canView: p.canView,
              canEdit: p.canEdit,
              canExport: p.canExport,
            })),
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to save policy: ${res.status} ${text}`);
      }

      const saved = await res.json();
      setPolicy(saved);
      setOriginalPolicy(JSON.parse(JSON.stringify(saved)));
    } catch (err: any) {
      setError(err?.message ?? "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }, [policy, target]);

  const hasUnsavedChanges =
    policy && originalPolicy
      ? JSON.stringify(policy.permissions) !== JSON.stringify(originalPolicy.permissions)
      : false;

  return (
    <SecurityInspectorContext.Provider
      value={{
        isEnabled,
        isOpen,
        target,
        policy,
        loading,
        error,
        roleInfo,
        openInspector,
        closeInspector,
        updatePermission,
        savePolicy,
        hasUnsavedChanges,
        saving,
      }}
    >
      {children}
    </SecurityInspectorContext.Provider>
  );
}

export function useSecurityInspector() {
  const ctx = useContext(SecurityInspectorContext);
  if (!ctx) {
    throw new Error("useSecurityInspector must be used within SecurityInspectorProvider");
  }
  return ctx;
}

/**
 * Safe version that returns defaults if outside provider.
 */
export function useSecurityInspectorSafe() {
  const ctx = useContext(SecurityInspectorContext);
  return (
    ctx ?? {
      isEnabled: false,
      isOpen: false,
      target: null,
      policy: null,
      loading: false,
      error: null,
      roleInfo: null,
      openInspector: () => {},
      closeInspector: () => {},
      updatePermission: () => {},
      savePolicy: async () => {},
      hasUnsavedChanges: false,
      saving: false,
    }
  );
}
