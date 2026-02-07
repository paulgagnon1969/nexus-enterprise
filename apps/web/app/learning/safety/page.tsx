"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SafetyDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  lastUpdated: string;
  path: string;
  status: "published" | "coming-soon" | "imported";
  oshaRef?: string; // OSHA standard reference (e.g., "29 CFR 1910.134")
  isImported?: boolean;
  sourcePath?: string; // Original file path for imported docs
}

const SAFETY_CATEGORIES = [
  {
    id: "general-safety",
    name: "General Safety",
    description: "Core safety policies and emergency procedures",
  },
  {
    id: "ppe",
    name: "Personal Protective Equipment",
    description: "PPE requirements, selection, and proper use",
  },
  {
    id: "hazard-communication",
    name: "Hazard Communication",
    description: "Chemical safety, SDS management, and GHS labeling",
  },
  {
    id: "fall-protection",
    name: "Fall Protection",
    description: "Working at heights, ladder safety, and fall prevention",
  },
  {
    id: "electrical-safety",
    name: "Electrical Safety",
    description: "Electrical hazards, lockout/tagout, and arc flash",
  },
  {
    id: "emergency-response",
    name: "Emergency Response",
    description: "Fire safety, evacuation, and first aid procedures",
  },
];

const SAFETY_DOCUMENTS: SafetyDocument[] = [
  // General Safety
  {
    id: "SAF-GEN-001",
    title: "Safety Policy Statement",
    description:
      "NEXUS commitment to workplace safety, management responsibilities, and employee rights under OSHA.",
    category: "general-safety",
    lastUpdated: "February 2026",
    path: "/learning/safety/safety-policy",
    status: "coming-soon",
    oshaRef: "29 CFR 1903",
  },
  {
    id: "SAF-GEN-002",
    title: "Injury & Illness Reporting",
    description:
      "How to report workplace injuries, near-misses, and unsafe conditions. OSHA recordkeeping requirements.",
    category: "general-safety",
    lastUpdated: "February 2026",
    path: "/learning/safety/injury-reporting",
    status: "coming-soon",
    oshaRef: "29 CFR 1904",
  },
  {
    id: "SAF-GEN-003",
    title: "Job Hazard Analysis (JHA)",
    description:
      "How to identify, assess, and document hazards before starting work. Includes JHA templates and examples.",
    category: "general-safety",
    lastUpdated: "February 2026",
    path: "/learning/safety/job-hazard-analysis",
    status: "coming-soon",
  },

  // Personal Protective Equipment
  {
    id: "SAF-PPE-001",
    title: "PPE Requirements & Selection",
    description:
      "Overview of required PPE by job task, selection criteria, and proper fit. Covers eye, head, hand, and foot protection.",
    category: "ppe",
    lastUpdated: "February 2026",
    path: "/learning/safety/ppe-requirements",
    status: "published",
    oshaRef: "29 CFR 1910.132-138",
  },
  {
    id: "SAF-PPE-002",
    title: "Respiratory Protection Program",
    description:
      "Respirator selection, fit testing, medical evaluations, and maintenance requirements.",
    category: "ppe",
    lastUpdated: "February 2026",
    path: "/learning/safety/respiratory-protection",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.134",
  },
  {
    id: "SAF-PPE-003",
    title: "Hearing Conservation",
    description:
      "Noise exposure limits, hearing protection requirements, and audiometric testing program.",
    category: "ppe",
    lastUpdated: "February 2026",
    path: "/learning/safety/hearing-conservation",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.95",
  },

  // Hazard Communication
  {
    id: "SAF-HAZ-001",
    title: "Hazard Communication (HazCom) Program",
    description:
      "GHS labeling, Safety Data Sheets (SDS), chemical inventory management, and employee training requirements.",
    category: "hazard-communication",
    lastUpdated: "February 2026",
    path: "/learning/safety/hazcom-program",
    status: "published",
    oshaRef: "29 CFR 1910.1200",
  },
  {
    id: "SAF-HAZ-002",
    title: "Reading Safety Data Sheets (SDS)",
    description:
      "How to read and understand the 16 sections of a Safety Data Sheet. Quick reference for emergency information.",
    category: "hazard-communication",
    lastUpdated: "February 2026",
    path: "/learning/safety/reading-sds",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.1200",
  },
  {
    id: "SAF-HAZ-003",
    title: "Chemical Storage & Segregation",
    description:
      "Proper storage of hazardous materials, incompatible chemical segregation, and secondary containment.",
    category: "hazard-communication",
    lastUpdated: "February 2026",
    path: "/learning/safety/chemical-storage",
    status: "coming-soon",
  },

  // Fall Protection
  {
    id: "SAF-FALL-001",
    title: "Fall Protection Requirements",
    description:
      "When fall protection is required, types of fall protection systems, and proper use of harnesses and lanyards.",
    category: "fall-protection",
    lastUpdated: "February 2026",
    path: "/learning/safety/fall-protection",
    status: "coming-soon",
    oshaRef: "29 CFR 1926.501-503",
  },
  {
    id: "SAF-FALL-002",
    title: "Ladder Safety",
    description:
      "Ladder selection, inspection, setup, and safe climbing practices. Covers step ladders and extension ladders.",
    category: "fall-protection",
    lastUpdated: "February 2026",
    path: "/learning/safety/ladder-safety",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.23",
  },
  {
    id: "SAF-FALL-003",
    title: "Scaffolding Safety",
    description:
      "Scaffold erection, inspection, load limits, and fall protection requirements for scaffold work.",
    category: "fall-protection",
    lastUpdated: "February 2026",
    path: "/learning/safety/scaffolding-safety",
    status: "coming-soon",
    oshaRef: "29 CFR 1926.451-454",
  },

  // Electrical Safety
  {
    id: "SAF-ELEC-001",
    title: "Electrical Safety Basics",
    description:
      "Electrical hazard recognition, safe work practices, and when qualified electrical workers are required.",
    category: "electrical-safety",
    lastUpdated: "February 2026",
    path: "/learning/safety/electrical-basics",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.331-335",
  },
  {
    id: "SAF-ELEC-002",
    title: "Lockout/Tagout (LOTO)",
    description:
      "Energy control procedures for servicing equipment. Covers lockout devices, tagout, and verification.",
    category: "electrical-safety",
    lastUpdated: "February 2026",
    path: "/learning/safety/lockout-tagout",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.147",
  },
  {
    id: "SAF-ELEC-003",
    title: "Extension Cord & Power Tool Safety",
    description:
      "Proper use of extension cords, GFCI protection, and power tool inspection requirements.",
    category: "electrical-safety",
    lastUpdated: "February 2026",
    path: "/learning/safety/power-tool-safety",
    status: "coming-soon",
    oshaRef: "29 CFR 1926.404-405",
  },

  // Emergency Response
  {
    id: "SAF-EMER-001",
    title: "Emergency Action Plan",
    description:
      "Emergency procedures, evacuation routes, assembly points, and employee responsibilities during emergencies.",
    category: "emergency-response",
    lastUpdated: "February 2026",
    path: "/learning/safety/emergency-action-plan",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.38",
  },
  {
    id: "SAF-EMER-002",
    title: "Fire Prevention & Extinguisher Use",
    description:
      "Fire prevention practices, fire extinguisher types, and proper use (PASS technique).",
    category: "emergency-response",
    lastUpdated: "February 2026",
    path: "/learning/safety/fire-prevention",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.157",
  },
  {
    id: "SAF-EMER-003",
    title: "First Aid & Bloodborne Pathogens",
    description:
      "First aid kit requirements, basic first aid response, and bloodborne pathogen exposure control.",
    category: "emergency-response",
    lastUpdated: "February 2026",
    path: "/learning/safety/first-aid",
    status: "coming-soon",
    oshaRef: "29 CFR 1910.1030",
  },
];

export default function SafetyManualPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [importedDocs, setImportedDocs] = useState<SafetyDocument[]>([]);
  const [loadingImported, setLoadingImported] = useState(true);

  // Load imported documents from API
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLoadingImported(false);
      return;
    }

    async function loadImported() {
      try {
        const res = await fetch(`${API_BASE}/document-import/imported?type=safety`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Transform imported docs to SafetyDocument format
          const transformed: SafetyDocument[] = data.map((doc: any) => ({
            id: `IMP-${doc.id.slice(0, 8).toUpperCase()}`,
            title: doc.title || doc.displayTitle || doc.fileName.replace(/\.[^/.]+$/, ""),
            description: doc.description || doc.displayDescription || `Imported from ${doc.breadcrumb.slice(0, -1).join(" / ")}`,
            category: doc.importedToCategory || "general-safety",
            lastUpdated: new Date(doc.importedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
            path: `${API_BASE}/document-import/documents/${doc.id}/preview`,
            status: "imported" as const,
            oshaRef: doc.oshaReference,
            isImported: true,
            sourcePath: doc.breadcrumb.join(" / "),
          }));
          setImportedDocs(transformed);
        }
      } catch {
        // Non-critical - imported docs just won't show
      } finally {
        setLoadingImported(false);
      }
    }

    loadImported();
  }, []);

  // Merge static and imported documents
  const allDocuments = useMemo(() => {
    return [...SAFETY_DOCUMENTS, ...importedDocs];
  }, [importedDocs]);

  const publishedCount = allDocuments.filter((d) => d.status === "published" || d.status === "imported").length;
  const totalCount = allDocuments.length;

  // Filter documents based on search and category
  const filteredDocuments = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return allDocuments.filter((doc) => {
      // Category filter
      if (selectedCategory && doc.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (query) {
        const searchableText = [
          doc.id,
          doc.title,
          doc.description,
          doc.oshaRef || "",
          doc.sourcePath || "",
          SAFETY_CATEGORIES.find((c) => c.id === doc.category)?.name || "",
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      }

      return true;
    });
  }, [searchQuery, selectedCategory, allDocuments]);

  // Group filtered documents by category
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, SafetyDocument[]> = {};
    for (const doc of filteredDocuments) {
      if (!groups[doc.category]) {
        groups[doc.category] = [];
      }
      groups[doc.category].push(doc);
    }
    return groups;
  }, [filteredDocuments]);

  const hasResults = filteredDocuments.length > 0;
  const isFiltering = searchQuery.trim() !== "" || selectedCategory !== null;

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => router.push("/learning")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 14,
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              ← Learning
            </button>
          </div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Safety Manual</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            OSHA compliance, hazard prevention, and workplace safety procedures.
          </p>
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              backgroundColor: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 6,
              fontSize: 13,
              color: "#92400e",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              <strong>Safety First:</strong> These documents supplement—but do not replace—site-specific
              safety plans and client requirements. Always follow the most stringent applicable standard.
            </span>
          </div>
          <div
            style={{
              marginTop: 8,
              padding: "8px 12px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 6,
              fontSize: 13,
              color: "#166534",
            }}
          >
            📚 <strong>{publishedCount}</strong> available{importedDocs.length > 0 && ` (${importedDocs.length} imported)`} | <strong>{totalCount - publishedCount}</strong> in development
          </div>
        </header>

        {/* Search Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search safety documents, OSHA references, topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                fontSize: 14,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                outline: "none",
                backgroundColor: "#ffffff",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#dc2626")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
            />
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 4,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 999,
                border: selectedCategory === null ? "1px solid #dc2626" : "1px solid #d1d5db",
                backgroundColor: selectedCategory === null ? "#fef2f2" : "#ffffff",
                color: selectedCategory === null ? "#dc2626" : "#374151",
                cursor: "pointer",
                fontWeight: selectedCategory === null ? 600 : 400,
              }}
            >
              All Topics
            </button>
            {SAFETY_CATEGORIES.map((cat) => {
              const count = allDocuments.filter((d) => d.category === cat.id).length;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCategory(null);
                    } else {
                      setSelectedCategory(cat.id);
                      if (!searchQuery) {
                        const el = document.getElementById(`cat-${cat.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 999,
                    border: isSelected ? "1px solid #dc2626" : "1px solid #d1d5db",
                    backgroundColor: isSelected ? "#fef2f2" : "#ffffff",
                    color: isSelected ? "#dc2626" : "#374151",
                    cursor: "pointer",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Search Results Info */}
          {isFiltering && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: hasResults ? "#fef2f2" : "#fef3c7",
                border: `1px solid ${hasResults ? "#fecaca" : "#fcd34d"}`,
                borderRadius: 6,
                fontSize: 13,
                color: hasResults ? "#991b1b" : "#92400e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {hasResults
                  ? `Found ${filteredDocuments.length} document${filteredDocuments.length !== 1 ? "s" : ""}`
                  : "No documents match your search"}
                {searchQuery && ` for "${searchQuery}"`}
                {selectedCategory && ` in ${SAFETY_CATEGORIES.find((c) => c.id === selectedCategory)?.name}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: hasResults ? "#dc2626" : "#92400e",
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Categories with filtered documents */}
        {SAFETY_CATEGORIES.map((cat) => {
          const docs = groupedDocuments[cat.id] || [];
          if (docs.length === 0) return null;

          return (
            <section key={cat.id} id={`cat-${cat.id}`}>
              <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 17, color: "#111827" }}>
                {cat.name}
              </h2>
              <p style={{ marginTop: 0, marginBottom: 10, fontSize: 13, color: "#6b7280" }}>
                {cat.description}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {docs.map((doc) => (
                  <SafetyCard
                    key={doc.id}
                    document={doc}
                    searchQuery={searchQuery}
                    onClick={
                      doc.status === "published" ? () => router.push(doc.path) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* No results fallback */}
        {!hasResults && isFiltering && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#6b7280",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
              No safety documents found
            </div>
            <div style={{ fontSize: 14 }}>
              Try adjusting your search or category filter
            </div>
          </div>
        )}

        {/* Quick Reference */}
        <section
          style={{
            marginTop: 8,
            padding: 16,
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16, color: "#111827" }}>
            Quick Reference
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <QuickLink icon="📞" title="Report a Safety Concern" description="Safety hotline & reporting" />
            <QuickLink icon="📋" title="SDS Library" description="Safety Data Sheets" />
            <QuickLink icon="🏥" title="First Aid Locations" description="AED & first aid kit map" />
            <QuickLink icon="🚨" title="Emergency Contacts" description="Site-specific contacts" />
          </div>
        </section>
      </div>
    </PageCard>
  );
}

function QuickLink({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 10,
        backgroundColor: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{description}</div>
      </div>
    </div>
  );
}

interface SafetyCardProps {
  document: SafetyDocument;
  searchQuery?: string;
  onClick?: () => void;
}

function SafetyCard({ document, searchQuery, onClick }: SafetyCardProps) {
  const isComingSoon = document.status === "coming-soon";
  const isImported = document.status === "imported";
  const isClickable = !isComingSoon;

  const handleClick = () => {
    if (isImported) {
      // Open imported documents in new tab with auth token
      const token = localStorage.getItem("accessToken");
      window.open(`${document.path}?token=${token}`, "_blank");
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div
      style={{
        borderRadius: 8,
        border: isComingSoon ? "1px dashed #d1d5db" : isImported ? "1px solid #dbeafe" : "1px solid #e5e7eb",
        backgroundColor: isComingSoon ? "#fafafa" : isImported ? "#f0f9ff" : "#ffffff",
        padding: 14,
        cursor: isClickable ? "pointer" : "default",
        transition: "border-color 0.15s",
        opacity: isComingSoon ? 0.7 : 1,
      }}
      onClick={isClickable ? handleClick : undefined}
      onMouseEnter={(e) => {
        if (isClickable) e.currentTarget.style.borderColor = isImported ? "#3b82f6" : "#dc2626";
      }}
      onMouseLeave={(e) => {
        if (isClickable) e.currentTarget.style.borderColor = isImported ? "#dbeafe" : "#e5e7eb";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isImported ? "#1e40af" : "#991b1b",
                backgroundColor: isImported ? "#dbeafe" : "#fef2f2",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {isImported ? "📄" : ""} {document.id}
            </span>
            {document.oshaRef && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#4b5563",
                  backgroundColor: "#f3f4f6",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {document.oshaRef}
              </span>
            )}
            {isComingSoon ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#9333ea",
                  backgroundColor: "#f3e8ff",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                COMING SOON
              </span>
            ) : isImported ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#1e40af",
                  backgroundColor: "#dbeafe",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                IMPORTED
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                Updated {document.lastUpdated}
              </span>
            )}
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: isComingSoon ? "#6b7280" : "#111827" }}>
            <HighlightText text={document.title} query={searchQuery} />
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
            <HighlightText text={document.description} query={searchQuery} />
          </p>
          {isImported && document.sourcePath && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
              📁 {document.sourcePath}
            </p>
          )}
        </div>
        {isClickable && (
          <span style={{ fontSize: 18, color: isImported ? "#3b82f6" : "#9ca3af", marginLeft: 12 }}>
            {isImported ? "↗" : "→"}
          </span>
        )}
      </div>
    </div>
  );
}

// Highlight matching text in search results
function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query || query.trim() === "") {
    return <>{text}</>;
  }

  const queryLower = query.toLowerCase().trim();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(queryLower);

  if (index === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark
        style={{
          backgroundColor: "#fef08a",
          color: "inherit",
          padding: "0 2px",
          borderRadius: 2,
        }}
      >
        {match}
      </mark>
      <HighlightText text={after} query={query} />
    </>
  );
}
