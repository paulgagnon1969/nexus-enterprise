"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface DashboardStats {
  // Tenant-equivalent stats
  inbox: number;
  published: number;
  templates: number;
  pnp: number;
  safety: number;
  manuals: number;
  // System admin stats
  systemDocs: number;
  systemManuals: number;
  stagedSops: number;
  publications: number;
  tenantCopies: number;
}

export default function SystemDocumentsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/system-documents/dashboard-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // Stats are optional
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
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

        {/* Main Document Sections - Same as tenant view */}
        <section>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {/* Document Inbox */}
            <DashboardCard
              href="/documents/inbox"
              icon="📥"
              title="Document Inbox"
              description="Review and accept documents shared from NEXUS System."
              stat={stats?.inbox}
              statLabel="pending"
              highlight
            />

            {/* Published Documents */}
            <DashboardCard
              href="/documents/copies"
              icon="📋"
              title="Published Documents"
              description="Documents published to your organization."
              stat={stats?.published}
              statLabel="documents"
            />

            {/* Templates */}
            <DashboardCard
              href="/documents/templates"
              icon="📝"
              title="Templates"
              description="Reusable document templates for invoices, quotes, and forms."
              stat={stats?.templates}
              statLabel="templates"
            />

            {/* Policies & Procedures */}
            <DashboardCard
              href="/documents/pnp"
              icon="📚"
              title="Policies & Procedures"
              description="Internal SOPs, policies, and knowledge base articles."
              stat={stats?.pnp}
              statLabel="documents"
            />

            {/* Safety Manual */}
            <DashboardCard
              href="/learning/safety"
              icon="🛡️"
              title="Safety Manual"
              description="OSHA compliance, safety protocols, and training materials."
              stat={stats?.safety}
              statLabel="sections"
            />

            {/* Manuals */}
            <DashboardCard
              href="/documents/manuals"
              icon="📘"
              title="Manuals"
              description="Organized document collections - handbooks, guides, and reference manuals."
              stat={stats?.manuals}
              statLabel="manuals"
            />
          </div>
        </section>

        {/* System Administration Tools - NEXUS Admin Only */}
        <section>
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: 20,
              marginTop: 8,
            }}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#374151", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔧</span>
              System Administration
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
            <QuickActionButton href="/documents/templates/new" label="+ New Template" />
            <QuickActionButton href="/system/documents/sops-staging" label="Review Staged SOPs" />
            <QuickActionButton href="/system/documents/publish" label="Publish to Tenants" />
            <QuickActionButton href="/documents/inbox" label="Check Inbox" />
          </div>
        </section>
      </div>
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
