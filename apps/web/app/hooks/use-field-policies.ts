"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * Resolved field policy for a single resource key.
 * `minRole` = lowest internal role that can view (null = use hardcoded fallback).
 * `clientCanView` = independent client access flag.
 */
export interface ResolvedFieldPolicy {
  minRole: string | null;
  clientCanView: boolean;
  clientCanEdit: boolean;
  clientCanExport: boolean;
}

interface FieldPoliciesContextValue {
  /** Get the resolved policy for a secKey (returns null if not yet loaded or not found). */
  getPolicy: (secKey: string) => ResolvedFieldPolicy | null;
  /** Register a secKey so it will be fetched in the next batch. */
  register: (secKey: string) => void;
  /** Whether policies are loading. */
  loading: boolean;
}

const FieldPoliciesContext = createContext<FieldPoliciesContextValue | null>(null);

/**
 * Internal role hierarchy (must match backend INTERNAL_ROLE_HIERARCHY).
 */
const INTERNAL_ROLES = [
  "CREW", "FOREMAN", "SUPER", "PM", "EXECUTIVE", "ADMIN", "OWNER", "SUPER_ADMIN",
] as const;

/**
 * Given a list of per-role permissions from the backend, compute:
 * - The lowest internal role that has canView = true → `minRole`
 * - Whether CLIENT has canView → `clientCanView`
 */
function resolvePolicy(permissions: Array<{
  roleCode: string;
  canView: boolean;
  canEdit: boolean;
  canExport: boolean;
}>): ResolvedFieldPolicy {
  const clientPerm = permissions.find((p) => p.roleCode === "CLIENT");

  // Find lowest internal role with canView
  let minRole: string | null = null;
  for (const role of INTERNAL_ROLES) {
    const perm = permissions.find((p) => p.roleCode === role);
    if (perm?.canView) {
      minRole = role;
      break;
    }
  }

  return {
    minRole,
    clientCanView: clientPerm?.canView ?? false,
    clientCanEdit: clientPerm?.canEdit ?? false,
    clientCanExport: clientPerm?.canExport ?? false,
  };
}

export function FieldPoliciesProvider({ children }: { children: ReactNode }) {
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [policies, setPolicies] = useState<Map<string, ResolvedFieldPolicy>>(new Map());
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState<Set<string>>(new Set());

  const register = useCallback((secKey: string) => {
    setRegistered((prev) => {
      if (prev.has(secKey)) return prev;
      const next = new Set(prev);
      next.add(secKey);
      return next;
    });
  }, []);

  // Batch-fetch policies for all registered keys that haven't been fetched yet
  useEffect(() => {
    const unfetched = Array.from(registered).filter((k) => !fetched.has(k));
    if (unfetched.length === 0) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    let cancelled = false;

    const fetchPolicies = async () => {
      setLoading(true);
      try {
        // Fetch each policy individually (the batch endpoint checks a single action,
        // but we need full permission data). Use Promise.allSettled for resilience.
        const results = await Promise.allSettled(
          unfetched.map(async (key) => {
            const res = await fetch(
              `${API_BASE}/field-security/policies/${encodeURIComponent(key)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) return { key, data: null };
            const data = await res.json();
            return { key, data };
          })
        );

        if (cancelled) return;

        const newPolicies = new Map(policies);
        const newFetched = new Set(fetched);

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.data) {
            const { key, data } = result.value;
            newPolicies.set(key, resolvePolicy(data.permissions ?? []));
            newFetched.add(key);
          } else if (result.status === "fulfilled") {
            // No policy found — mark as fetched with null
            newFetched.add(result.value.key);
          }
        }

        setPolicies(newPolicies);
        setFetched(newFetched);
      } catch {
        // Ignore errors — fall back to hardcoded
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Small debounce to batch registrations that happen in the same render cycle
    const timer = setTimeout(fetchPolicies, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [registered, fetched]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPolicy = useCallback(
    (secKey: string) => policies.get(secKey) ?? null,
    [policies]
  );

  return React.createElement(
    FieldPoliciesContext.Provider,
    { value: { getPolicy, register, loading } },
    children
  );
}

/**
 * Hook to access field security policies.
 * Must be inside a FieldPoliciesProvider.
 */
export function useFieldPolicies() {
  const ctx = useContext(FieldPoliciesContext);
  if (!ctx) {
    throw new Error("useFieldPolicies must be used within FieldPoliciesProvider");
  }
  return ctx;
}

/**
 * Safe version — returns null getPolicy if outside provider.
 */
export function useFieldPoliciesSafe() {
  return useContext(FieldPoliciesContext);
}
