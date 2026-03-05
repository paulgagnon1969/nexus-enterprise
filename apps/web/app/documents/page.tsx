"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface DashboardStats {
  inbox: number;
  published: number;
  templates: number;
  pnp: number;
  safety: number;
  manuals: number;
  // Admin stats
  unpublished: number;
  systemDocs: number;
  stagedSops: number;
}

// --- Global Search Types ---

interface SearchSnippet {
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchDocMatch {
  id: string;
  code: string;
  title: string;
  source?: "copy" | "published";
  category?: string | null;
  snippets: SearchSnippet[];
  matchCount: number;
}

interface SearchGroup {
  category: string;
  documents: SearchDocMatch[];
  totalInGroup: number;
}

interface SearchResults {
  groups: SearchGroup[];
  totalMatches: number;
}

export default function DocumentsHomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    // Get user role from stored context
    const storedRole = localStorage.getItem("companyRole");
    setUserRole(storedRole);

    // Fetch dashboard stats
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/documents/dashboard-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // Stats are optional - page still works without them
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const isAdmin = userRole === "OWNER" || userRole === "ADMIN";

  // Global search — uses admin endpoint for admins, tenant endpoint otherwise
  const executeSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const token = localStorage.getItem("accessToken");
      const role = localStorage.getItem("companyRole");
      const isAdminUser = role === "OWNER" || role === "ADMIN";
      const endpoint = isAdminUser
        ? `${API_BASE}/admin/sops/documents/search`
        : `${API_BASE}/tenant/documents/search`;
      const res = await fetch(
        `${endpoint}?q=${encodeURIComponent(q.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data: SearchResults = await res.json();
        setSearchResults(data);
      }
    } catch {
      // Non-critical
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (!value.trim()) {
        setSearchResults(null);
        return;
      }
      searchTimer.current = setTimeout(() => executeSearch(value), 400);
    },
    [executeSearch],
  );

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Header */}
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>📄 Documents</h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: "#6b7280" }}>
            Manage, organize, and publish documents across your organization.
          </p>
        </header>

        {/* Global Document Search */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            backgroundColor: "#ffffff",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>🔍</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>Search All Documents</span>
              {searchResults && searchResults.totalMatches > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 10,
                    backgroundColor: "#dbeafe",
                    color: "#1e40af",
                    fontWeight: 500,
                  }}
                >
                  {searchResults.totalMatches} match{searchResults.totalMatches !== 1 ? "es" : ""}
                </span>
              )}
            </div>

            {/* Search Input */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search document content, titles, codes, tags…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px 10px 40px",
                  fontSize: 14,
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  backgroundColor: "#f9fafb",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
              />
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 16,
                  color: "#9ca3af",
                  pointerEvents: "none",
                }}
              >
                🔎
              </span>
              {searchLoading && (
                <div
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 16,
                    height: 16,
                    border: "2px solid #3b82f6",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}
            </div>

            {/* Search Results */}
            {searchQuery.trim().length >= 2 && searchResults && (
              <div style={{ marginTop: 12 }}>
                {searchResults.totalMatches === 0 ? (
                  <p style={{ fontSize: 13, color: "#6b7280", margin: 0, textAlign: "center", padding: "12px 0" }}>
                    No documents match "{searchQuery.trim()}"
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      maxHeight: 420,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    {searchResults.groups.map((group) => (
                      <div key={group.category}>
                        {/* Category Header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                            paddingBottom: 4,
                            borderBottom: "1px solid #e5e7eb",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#6b7280",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {group.category}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "1px 6px",
                              borderRadius: 8,
                              backgroundColor: "#f3f4f6",
                              color: "#6b7280",
                            }}
                          >
                            {group.totalInGroup}
                          </span>
                        </div>

                        {/* Documents */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {group.documents.map((doc) => (
                            <div
                              key={doc.id}
                              style={{
                                padding: "10px 12px",
                                backgroundColor: "#ffffff",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                cursor: "pointer",
                                transition: "border-color 0.15s, box-shadow 0.15s",
                              }}
                              onClick={() => router.push(`/system/documents/${doc.id}`)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "#3b82f6";
                                e.currentTarget.style.boxShadow = "0 1px 4px rgba(59,130,246,0.12)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "#e5e7eb";
                                e.currentTarget.style.boxShadow = "none";
                              }}
                            >
                              {/* Title row */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
                                  {doc.title}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    backgroundColor: doc.source === "copy" ? "#dcfce7" : "#f3f4f6",
                                    color: doc.source === "copy" ? "#166534" : "#6b7280",
                                    fontWeight: 500,
                                  }}
                                >
                                  {doc.source === "copy" ? "My Copy" : doc.code}
                                </span>
                              </div>

                              {/* Snippet briefs */}
                              {doc.snippets.map((snippet, sIdx) => (
                                <div
                                  key={sIdx}
                                  style={{
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                    color: "#6b7280",
                                    padding: "4px 8px",
                                    backgroundColor: "#f9fafb",
                                    borderRadius: 4,
                                    marginTop: 4,
                                    borderLeft: "3px solid #3b82f6",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  <span style={{ color: "#9ca3af" }}>
                                    {snippet.text.slice(0, snippet.matchStart)}
                                  </span>
                                  <mark
                                    style={{
                                      backgroundColor: "#fef08a",
                                      color: "#1e293b",
                                      padding: "1px 2px",
                                      borderRadius: 2,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {snippet.text.slice(snippet.matchStart, snippet.matchEnd)}
                                  </mark>
                                  <span style={{ color: "#9ca3af" }}>
                                    {snippet.text.slice(snippet.matchEnd)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Hint */}
            {searchQuery.trim().length < 2 && !searchResults && (
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0 0", textAlign: "center" }}>
                Type at least 2 characters to search across all documents
              </p>
            )}
          </div>
        </div>

        {/* Main Document Sections */}
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

        {/* Admin Tools Section */}
        {isAdmin && (
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
                Admin Tools
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {/* Unpublished eDocs */}
                <DashboardCard
                  href="/admin/documents"
                  icon="📤"
                  title="Unpublished eDocs"
                  description="Import, stage, and publish documents to your organization."
                  stat={stats?.unpublished}
                  statLabel="staged"
                  adminCard
                />

                {/* System Documents */}
                <DashboardCard
                  href="/admin/documents#system-docs"
                  icon="📚"
                  title="System Documents"
                  description="Manage SOPs synced from staging and control tenant publications."
                  stat={stats?.systemDocs}
                  statLabel="documents"
                  adminCard
                />

                {/* Unpublished SOPs */}
                <DashboardCard
                  href="/documents/templates?filter=unpublished-sops"
                  icon="📑"
                  title="Unpublished SOPs"
                  description="SOPs synced from staging, pending review and activation."
                  stat={stats?.stagedSops}
                  statLabel="SOPs"
                  adminCard
                />
              </div>
            </div>
          </section>
        )}

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
            <QuickActionButton href="/documents/templates/new" label="+ New Template" />
            <QuickActionButton href="/documents/inbox" label="Check Inbox" />
            <QuickActionButton href="/learning/safety" label="View Safety Manual" />
            {isAdmin && <QuickActionButton href="/admin/documents" label="Manage eDocs" />}
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
