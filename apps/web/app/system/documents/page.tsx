"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";
import { ImportHtmlModal } from "./components/ImportHtmlModal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface DashboardStats {
  // System-level stats
  systemDocs: number;
  systemManuals: number;
  stagedSops: number;
  publications: number;
  tenantCopies: number;
}

interface OshaSyncStatus {
  syncStatus: string;
  lastSyncedAt: string | null;
  lastAmendedDate: string | null;
  sectionCount: number;
  manualId: string | null;
  lastError: string | null;
}

export default function SystemDocumentsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [oshaStatus, setOshaStatus] = useState<OshaSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLoading(false);
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    const fetchAll = async () => {
      try {
        const [statsRes, oshaRes] = await Promise.all([
          fetch(`${API_BASE}/system-documents/dashboard-stats`, { headers }),
          fetch(`${API_BASE}/system/osha/status`, { headers }).catch(() => null),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (oshaRes?.ok) setOshaStatus(await oshaRes.json());
      } catch {
        // Stats are optional
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Header */}
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>📄 NEXUS System Documents</h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: "#6b7280" }}>
            Manage system-wide documents, manuals, SOPs, and publish to tenants.
          </p>
        </header>

        {/* System Documents Library */}
        <section>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#374151", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📚</span>
            Document Library
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {/* System Documents Library */}
              <DashboardCard
                href="/system/documents/library"
                icon="📚"
                title="System Documents Library"
                description="Master library of all system documents, SOPs, and policies."
                stat={stats?.systemDocs}
                statLabel="documents"
                adminCard
              />

              {/* System Manuals */}
              <DashboardCard
                href="/system/documents/manuals"
                icon="📖"
                title="System Manuals"
                description="NccPM and other NEXUS-internal manuals and guides."
                stat={stats?.systemManuals}
                statLabel="manuals"
                adminCard
              />

              {/* Staged SOPs */}
              <DashboardCard
                href="/system/documents/sops-staging"
                icon="📋"
                title="Staged SOPs"
                description="Review and sync SOPs from docs/sops-staging/ into the NccPM manual."
                stat={stats?.stagedSops}
                statLabel="pending"
                adminCard
              />
            </div>
        </section>

        {/* Safety & Compliance Collection */}
        <section>
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: 20,
              marginTop: 8,
            }}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#374151", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🛡️</span>
              Safety & Compliance
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {/* OSHA Manual Card */}
              <OshaManualCard status={oshaStatus} />

              {/* Sync Admin */}
              <DashboardCard
                href="/system/osha-sync"
                icon="🔄"
                title="OSHA eCFR Sync"
                description="Manage auto-sync of 29 CFR 1926 from the Electronic Code of Federal Regulations."
                adminCard
              />
            </div>
          </div>
        </section>

        {/* Publishing & Distribution Tools */}
        <section>
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: 20,
              marginTop: 8,
            }}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#374151", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📤</span>
              Publishing & Distribution
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {/* Publish to Tenants */}
              <DashboardCard
                href="/system/documents/publish"
                icon="🚀"
                title="Publish to Tenants"
                description="Push system documents to tenant organizations."
                stat={stats?.publications}
                statLabel="publications"
                adminCard
              />

              {/* Tenant Document Status */}
              <DashboardCard
                href="/system/documents/tenant-status"
                icon="📊"
                title="Tenant Document Status"
                description="View which tenants have accepted or pending documents."
                stat={stats?.tenantCopies}
                statLabel="tenant copies"
                adminCard
              />
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Quick Actions
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <QuickActionButton href="/system/documents/library/new" label="+ New System Document" />
            <QuickActionButton href="/system/documents/manuals/new" label="+ New Manual" />
            <button
              onClick={() => setImportModalOpen(true)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                backgroundColor: "#dbeafe",
                color: "#1d4ed8",
                border: "1px solid #93c5fd",
                borderRadius: 6,
                cursor: "pointer",
                transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#bfdbfe";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#dbeafe";
              }}
            >
              📥 Structured Manual Import
            </button>
            <QuickActionButton href="/system/documents/sops-staging" label="Review Staged SOPs" />
            <QuickActionButton href="/system/osha-sync" label="🛡️ OSHA Sync" />
            <QuickActionButton href="/system/documents/publish" label="Publish to Tenants" />
          </div>
        </section>
      </div>

      {/* Import HTML Modal */}
      <ImportHtmlModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          // Refresh stats after successful import
          const token = localStorage.getItem("accessToken");
          if (token) {
            fetch(`${API_BASE}/system-documents/dashboard-stats`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((res) => res.json())
              .then(setStats)
              .catch(() => {});
          }
        }}
      />
    </PageCard>
  );
}

// --- Dashboard Card Component ---

interface DashboardCardProps {
  href: string;
  icon: string;
  title: string;
  description: string;
  stat?: number;
  statLabel?: string;
  highlight?: boolean;
  adminCard?: boolean;
}

function DashboardCard({ href, icon, title, description, stat, statLabel, highlight, adminCard }: DashboardCardProps) {
  const bgColor = highlight ? "#fffbeb" : adminCard ? "#f0f9ff" : "#ffffff";
  const borderColor = highlight ? "#fef3c7" : adminCard ? "#bae6fd" : "#e5e7eb";

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        textDecoration: "none",
        color: "#111827",
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.4, flex: 1 }}>
        {description}
      </p>
      {stat !== undefined && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "baseline",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600, color: highlight ? "#b45309" : adminCard ? "#0369a1" : "#111827" }}>
            {stat}
          </span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{statLabel}</span>
        </div>
      )}
    </Link>
  );
}

// --- OSHA Manual Card ---

function OshaManualCard({ status }: { status: OshaSyncStatus | null }) {
  const synced = status?.syncStatus === "SUCCESS";
  const manualHref = status?.manualId
    ? `/system/documents/manuals/${status.manualId}`
    : "/system/osha-sync";
  const lastSync = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Link
      href={manualHref}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16,
        backgroundColor: synced ? "#ecfdf5" : "#fffbeb",
        border: `1px solid ${synced ? "#86efac" : "#fcd34d"}`,
        borderRadius: 10,
        textDecoration: "none",
        color: "#111827",
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            border: "1px solid #e5e7eb",
          }}
        >
          🛡️
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>OSHA Construction Standards</span>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>29 CFR 1926</div>
        </div>
        {synced && (
          <span
            style={{
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 999,
              backgroundColor: "#d1fae5",
              color: "#065f46",
              border: "1px solid #6ee7b7",
            }}
          >
            LIVE
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.4, flex: 1 }}>
        Complete OSHA Safety and Health Regulations for Construction, auto-synced from the eCFR.
      </p>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid rgba(0,0,0,0.05)",
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        {synced ? (
          <>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#065f46" }}>{status?.sectionCount || 0}</span>
            <span>sections</span>
            {status?.lastAmendedDate && (
              <span>• eCFR {status.lastAmendedDate}</span>
            )}
            {lastSync && <span style={{ marginLeft: "auto" }}>synced {lastSync}</span>}
          </>
        ) : (
          <span style={{ color: "#92400e", fontWeight: 500 }}>
            {status?.syncStatus === "ERROR" ? "⚠️ Sync error — click to manage" : "Not yet synced — click to import"}
          </span>
        )}
      </div>
    </Link>
  );
}

// --- Quick Action Button ---

function QuickActionButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: "#ffffff",
        color: "#374151",
        border: "1px solid #d1d5db",
        borderRadius: 6,
        textDecoration: "none",
        transition: "background-color 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#f3f4f6";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#ffffff";
      }}
    >
      {label}
    </Link>
  );
}
