"use client";

import React, { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────

interface CatalogModule {
  id: string;
  code: string;
  label: string;
  description: string | null;
  monthlyPrice: number | null;
  pricingModel: "MONTHLY" | "PER_PROJECT" | "PER_USE";
  projectUnlockPrice: number | null;
  isCore: boolean;
  sortOrder: number;
  enabled: boolean;
  camDocumentId: string | null;
}

interface CompanyStatus {
  name: string | null;
  isInternal: boolean;
  isTrial: boolean;
  trialEndsAt: string | null;
  trialStatus: string | null;
}

interface Subscription {
  id: string;
  stripeSubId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface MembershipResponse {
  company: CompanyStatus;
  subscription: Subscription | null;
  modules: CatalogModule[];
}

interface InvoiceLine {
  description: string | null;
  amount: number;
  proration: boolean;
}

interface UpcomingInvoice {
  subtotal: number;
  total: number;
  currency: string;
  periodEnd: number | null;
  lines: InvoiceLine[];
}

interface PastInvoice {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  lines: InvoiceLine[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function cents(amount: number | null | undefined): string {
  if (amount == null) return "$0";
  return `$${(amount / 100).toFixed(2)}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Fetch helper ─────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("accessToken")
      : null;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

// ── Main Page ────────────────────────────────────────────────────────

export default function BillingPage() {
  const [membership, setMembership] = useState<MembershipResponse | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingInvoice | null>(null);
  const [invoices, setInvoices] = useState<PastInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [showInvoices, setShowInvoices] = useState(false);
  const [camModal, setCamModal] = useState<{ title: string; html: string } | null>(null);
  const [camLoading, setCamLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const headers = authHeaders();
      const [membershipRes, upcomingRes, invoicesRes] = await Promise.all([
        fetch(`${API_BASE}/membership/current`, { headers }),
        fetch(`${API_BASE}/membership/upcoming-invoice`, { headers }).catch(
          () => null,
        ),
        fetch(`${API_BASE}/membership/invoices`, { headers }).catch(() => null),
      ]);

      if (!membershipRes.ok)
        throw new Error(`Failed to load membership (${membershipRes.status})`);

      const membershipData: MembershipResponse = await membershipRes.json();
      setMembership(membershipData);

      if (upcomingRes?.ok) {
        const upcomingData = await upcomingRes.json();
        setUpcoming(upcomingData);
      }

      if (invoicesRes?.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCam = async (mod: CatalogModule) => {
    if (!mod.camDocumentId) return;
    setCamLoading(true);
    try {
      const res = await fetch(`${API_BASE}/membership/modules/${mod.code}/cam`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load CAM");
      const data = await res.json();
      setCamModal({ title: data.title ?? mod.label, html: data.htmlContent ?? "" });
    } catch {
      setCamModal({ title: mod.label, html: "<p>Unable to load document.</p>" });
    } finally {
      setCamLoading(false);
    }
  };

  const toggleModule = async (mod: CatalogModule) => {
    if (mod.isCore || mod.pricingModel !== "MONTHLY") return;
    setTogglingCode(mod.code);
    setError(null);

    try {
      const endpoint = mod.enabled ? "disable" : "enable";
      const res = await fetch(`${API_BASE}/membership/modules/${endpoint}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ moduleCode: mod.code }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Failed to ${endpoint} module`);
      }

      const updated: MembershipResponse = await res.json();
      setMembership(updated);

      // Refresh upcoming invoice after toggle
      const upRes = await fetch(`${API_BASE}/membership/upcoming-invoice`, {
        headers: authHeaders(),
      }).catch(() => null);
      if (upRes?.ok) setUpcoming(await upRes.json());
    } catch (err: any) {
      setError(err?.message ?? "Module toggle failed");
    } finally {
      setTogglingCode(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: "#6b7280" }}>
        Loading subscription data…
      </div>
    );
  }

  if (error && !membership) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: "#b91c1c" }}>
        {error}
      </div>
    );
  }

  const company = membership?.company;
  const modules = membership?.modules ?? [];
  const monthlyModules = modules.filter((m) => m.pricingModel === "MONTHLY");
  const projectModules = modules.filter((m) => m.pricingModel === "PER_PROJECT");
  const enabledMonthly = monthlyModules.filter(
    (m) => m.enabled && !m.isCore,
  );
  const monthlyTotal = enabledMonthly.reduce(
    (sum, m) => sum + (m.monthlyPrice ?? 0),
    0,
  );
  const trialDays = daysUntil(company?.trialEndsAt ?? null);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {/* ── Internal / Trial Banner ─────────────────────────────── */}
      {company?.isInternal && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>&#128274;</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1e40af" }}>
              NEXUS Internal Account
            </div>
            <div style={{ fontSize: 12, color: "#3b82f6" }}>
              All modules permanently unlocked. No billing charges apply.
            </div>
          </div>
        </div>
      )}

      {company?.isTrial && trialDays !== null && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>&#9200;</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#92400e" }}>
              Free Trial — {trialDays} day{trialDays !== 1 ? "s" : ""} remaining
            </div>
            <div style={{ fontSize: 12, color: "#b45309" }}>
              All modules are available during your trial. After expiration,
              only subscribed modules will remain active.
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Subscription &amp; Billing
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {company?.name ?? "Your organization"} — manage which NCC modules
            are active.
          </p>
        </div>

        <StatusBadge company={company} />
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 16,
            fontSize: 12,
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Module Catalog + Cost Summary ───────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Module cards */}
        <div>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 15,
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Monthly Modules
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {monthlyModules.map((mod) => (
              <ModuleCard
                key={mod.code}
                mod={mod}
                toggling={togglingCode === mod.code}
                onToggle={() => toggleModule(mod)}
                onLearnMore={mod.camDocumentId ? () => openCam(mod) : undefined}
                camLoading={camLoading}
                allUnlocked={
                  company?.isInternal ||
                  (company?.isTrial && trialDays !== null && trialDays > 0)
                }
              />
            ))}
          </div>

          {projectModules.length > 0 && (
            <>
              <h2
                style={{
                  margin: "24px 0 12px",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#374151",
                }}
              >
                Per-Project Add-ons
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {projectModules.map((mod) => (
                  <ProjectModuleCard key={mod.code} mod={mod} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cost Summary */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            position: "sticky",
            top: 24,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
            Cost Summary
          </h3>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <span>Active modules</span>
            <span style={{ fontWeight: 600 }}>{enabledMonthly.length}</span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            <span>Estimated monthly</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {cents(monthlyTotal)}/mo
            </span>
          </div>

          {enabledMonthly.length > 0 && (
            <div
              style={{
                borderTop: "1px solid #e5e7eb",
                paddingTop: 8,
                marginBottom: 12,
              }}
            >
              {enabledMonthly.map((m) => (
                <div
                  key={m.code}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    color: "#6b7280",
                    marginBottom: 2,
                  }}
                >
                  <span>{m.label}</span>
                  <span>{cents(m.monthlyPrice)}</span>
                </div>
              ))}
            </div>
          )}

          {upcoming && (
            <div
              style={{
                borderTop: "1px solid #e5e7eb",
                paddingTop: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Next Invoice Preview
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span>Total</span>
                <span style={{ fontWeight: 600 }}>
                  {cents(upcoming.total)}
                </span>
              </div>
              {upcoming.lines
                .filter((l) => l.proration)
                .map((l, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}
                  >
                    {l.description} — {cents(l.amount)}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Invoice History ──────────────────────────────────────── */}
      <div
        style={{
          marginTop: 32,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <button
          type="button"
          onClick={() => setShowInvoices((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            padding: 0,
            color: "#374151",
          }}
        >
          <span
            style={{
              transform: showInvoices ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              display: "inline-block",
            }}
          >
            &#9654;
          </span>
          Invoice History ({invoices.length})
        </button>

        {showInvoices && (
          <div style={{ marginTop: 12 }}>
            {invoices.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6b7280" }}>
                No invoices yet.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#f9fafb",
                      border: "1px solid #f3f4f6",
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>
                        {formatDate(inv.created)}
                      </span>
                      <span
                        style={{
                          marginLeft: 8,
                          padding: "2px 6px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          background:
                            inv.status === "paid" ? "#d1fae5" : "#fee2e2",
                          color:
                            inv.status === "paid" ? "#065f46" : "#991b1b",
                        }}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>
                        {cents(inv.total)}
                      </span>
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            color: "#2563eb",
                            textDecoration: "none",
                          }}
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* ── CAM Reader Modal ──────────────────────────────────── */}
      {camModal && (
        <div
          onClick={() => setCamModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: 10,
              width: "min(720px, 90vw)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {camModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setCamModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  color: "#6b7280",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            {/* Body */}
            <div
              style={{
                padding: "20px",
                overflowY: "auto",
                fontSize: 13,
                lineHeight: 1.6,
                color: "#374151",
              }}
              dangerouslySetInnerHTML={{ __html: camModal.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function StatusBadge({ company }: { company: CompanyStatus | undefined }) {
  if (!company) return null;

  if (company.isInternal) {
    return (
      <span
        style={{
          padding: "4px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: "#dbeafe",
          color: "#1e40af",
        }}
      >
        Internal
      </span>
    );
  }

  if (company.isTrial && company.trialStatus === "ACTIVE") {
    return (
      <span
        style={{
          padding: "4px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: "#fef3c7",
          color: "#92400e",
        }}
      >
        Trial
      </span>
    );
  }

  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: "#d1fae5",
        color: "#065f46",
      }}
    >
      Active
    </span>
  );
}

function ModuleCard({
  mod,
  toggling,
  onToggle,
  onLearnMore,
  allUnlocked,
  camLoading,
}: {
  mod: CatalogModule;
  toggling: boolean;
  onToggle: () => void;
  onLearnMore?: () => void;
  allUnlocked: boolean | undefined;
  camLoading?: boolean;
}) {
  const isEnabled = mod.enabled;

  return (
    <div
      style={{
        background: "#ffffff",
        border: `1px solid ${isEnabled ? "#a7f3d0" : "#e5e7eb"}`,
        borderRadius: 8,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        opacity: toggling ? 0.6 : 1,
        transition: "border-color 0.2s, opacity 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.label}</span>
          {mod.isCore && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 999,
                background: "#f3f4f6",
                color: "#6b7280",
              }}
            >
              CORE
            </span>
          )}
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
          {mod.isCore ? "Free" : `${cents(mod.monthlyPrice)}/mo`}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "#6b7280",
          lineHeight: 1.4,
          flex: 1,
        }}
      >
        {mod.description}
      </p>

      {mod.camDocumentId && onLearnMore && (
        <button
          type="button"
          onClick={onLearnMore}
          disabled={camLoading}
          style={{
            background: "none",
            border: "none",
            cursor: camLoading ? "wait" : "pointer",
            padding: 0,
            fontSize: 12,
            color: "#2563eb",
            textDecoration: "underline",
            textAlign: "left",
          }}
        >
          {camLoading ? "Loading…" : "Learn more"}
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Toggle switch */}
        <button
          type="button"
          onClick={onToggle}
          disabled={mod.isCore || toggling}
          title={
            mod.isCore
              ? "Core modules are always enabled"
              : allUnlocked
                ? "All modules unlocked (trial/internal)"
                : isEnabled
                  ? "Click to disable"
                  : "Click to enable"
          }
          style={{
            position: "relative",
            width: 40,
            height: 22,
            borderRadius: 11,
            border: "none",
            cursor: mod.isCore || toggling ? "not-allowed" : "pointer",
            background: isEnabled ? "#10b981" : "#d1d5db",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: isEnabled ? 20 : 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              transition: "left 0.2s",
            }}
          />
        </button>
        <span style={{ fontSize: 12, color: isEnabled ? "#059669" : "#9ca3af" }}>
          {isEnabled ? "Active" : "Off"}
        </span>
      </div>
    </div>
  );
}

function ProjectModuleCard({ mod }: { mod: CatalogModule }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.label}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#ede9fe",
            color: "#6d28d9",
          }}
        >
          {cents(mod.projectUnlockPrice)}/project
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "#6b7280",
          lineHeight: 1.4,
        }}
      >
        {mod.description}
      </p>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>
        Unlocked per-project from the project detail page
      </div>
    </div>
  );
}
