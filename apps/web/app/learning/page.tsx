"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../ui-shell";

// Searchable content index - includes BKMs and other learning resources
interface SearchableItem {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  path: string;
  keywords: string[];
  status: "published" | "coming-soon";
}

const SEARCHABLE_CONTENT: SearchableItem[] = [
  // Safety Manual
  {
    id: "SAF-PPE-001",
    title: "PPE Requirements & Selection",
    description: "Overview of required PPE by job task, selection criteria, and proper fit.",
    category: "safety",
    categoryLabel: "Safety",
    path: "/learning/safety/ppe-requirements",
    keywords: ["ppe", "safety", "osha", "glasses", "hard hat", "gloves", "boots", "hearing", "protection"],
    status: "published",
  },
  {
    id: "SAF-HAZ-001",
    title: "Hazard Communication (HazCom) Program",
    description: "GHS labeling, Safety Data Sheets (SDS), chemical inventory management, and employee training.",
    category: "safety",
    categoryLabel: "Safety",
    path: "/learning/safety/hazcom-program",
    keywords: ["hazcom", "chemical", "sds", "ghs", "label", "safety", "osha", "msds"],
    status: "published",
  },
  {
    id: "REF-SAFETY",
    title: "NEXUS Safety Manual",
    description: "OSHA compliance, hazard prevention, and workplace safety procedures.",
    category: "reference",
    categoryLabel: "Reference",
    path: "/learning/safety",
    keywords: ["safety", "osha", "ppe", "hazard", "emergency", "fall", "electrical", "fire"],
    status: "published",
  },
  // BKMs
  {
    id: "BKM-NCC-001",
    title: "CSV Import and Line Item Reconciliation",
    description: "Standard operating procedure for importing Xactimate estimates and reconciling line items.",
    category: "bkm",
    categoryLabel: "BKM",
    path: "/learning/bkm/csv-import-reconciliation",
    keywords: ["csv", "import", "xactimate", "reconciliation", "petl", "estimate"],
    status: "published",
  },
  {
    id: "BKM-NCC-002",
    title: "Dev Stack & Environment Guide",
    description: "How to start and manage local development environments: Docker, Cloud SQL, and startup scripts.",
    category: "bkm",
    categoryLabel: "BKM",
    path: "/learning/bkm/dev-stack",
    keywords: ["docker", "postgres", "redis", "dev", "environment", "cloud sql", "local"],
    status: "published",
  },
  {
    id: "BKM-INV-001",
    title: "Inventory and Forecasting SOP",
    description: "Complete guide to asset tracking, inventory positions, material forecasting, and PETL-driven consumption.",
    category: "bkm",
    categoryLabel: "BKM",
    path: "/learning/bkm/inventory-forecasting",
    keywords: ["inventory", "forecasting", "materials", "assets", "petl", "consumption", "warehouse"],
    status: "published",
  },
  {
    id: "BKM-TEC-001",
    title: "UI Performance Standards",
    description: "Performance guidelines for React/Next.js development: memoization, lazy loading, and profiling.",
    category: "bkm",
    categoryLabel: "BKM",
    path: "/learning/bkm/ui-performance",
    keywords: ["performance", "react", "nextjs", "memoization", "lazy", "profiling", "ui"],
    status: "published",
  },
  {
    id: "BKM-INT-001",
    title: "CSV Import Architecture",
    description: "Technical standard for building CSV-based imports: PETL pattern, job-based processing, parallel chunking.",
    category: "bkm",
    categoryLabel: "BKM",
    path: "/learning/bkm/csv-import-architecture",
    keywords: ["csv", "import", "petl", "worker", "bullmq", "chunking", "architecture"],
    status: "published",
  },
  {
    id: "BKM-INT-002",
    title: "Xactimate Integration Guide",
    description: "Working with Xactimate exports: RAW vs Components CSVs, field mappings, and troubleshooting.",
    category: "bkm",
    categoryLabel: "BKM",
    path: "/learning/bkm/xactimate-integration",
    keywords: ["xactimate", "xact", "csv", "raw", "components", "import", "estimate"],
    status: "published",
  },
  // Learning Tracks (as navigable items)
  {
    id: "TRACK-101",
    title: "NEXUS 101",
    description: "Start here to understand the NEXUS Connect Group and the Nexus Marketplace.",
    category: "track",
    categoryLabel: "Track",
    path: "/learning#learning-tracks",
    keywords: ["nexus", "101", "onboarding", "start", "introduction", "marketplace"],
    status: "coming-soon",
  },
  {
    id: "TRACK-TOOLS",
    title: "Tools & Systems",
    description: "Get productive in the tools you'll use every day: NEXUS Connect, time tracking, documentation.",
    category: "track",
    categoryLabel: "Track",
    path: "/learning#learning-tracks",
    keywords: ["tools", "systems", "time tracking", "documentation", "access"],
    status: "coming-soon",
  },
  {
    id: "TRACK-CULTURE",
    title: "Culture & Ways of Working",
    description: "Understand how we show up for each other and for clients: communication, collaboration, feedback.",
    category: "track",
    categoryLabel: "Track",
    path: "/learning#learning-tracks",
    keywords: ["culture", "collaboration", "communication", "feedback", "teams"],
    status: "coming-soon",
  },
  // Reference Documents
  {
    id: "REF-MANUAL",
    title: "NEXUS Operating Manual",
    description: "Always-current reference for how we run projects, make decisions, and deliver work.",
    category: "reference",
    categoryLabel: "Reference",
    path: "/operating-manual",
    keywords: ["manual", "operating", "governance", "policies", "lifecycle", "roles"],
    status: "published",
  },
  {
    id: "REF-FAQ",
    title: "Marketplace FAQs",
    description: "Frequently asked questions about the Nexus Marketplace and how it works.",
    category: "reference",
    categoryLabel: "Reference",
    path: "/marketplace-faqs",
    keywords: ["faq", "questions", "marketplace", "help"],
    status: "published",
  },
];

export default function LearningPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const searchResults = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];

    return SEARCHABLE_CONTENT.filter((item) => {
      const searchableText = [
        item.id,
        item.title,
        item.description,
        item.categoryLabel,
        ...item.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    }).slice(0, 8); // Limit to 8 results
  }, [searchQuery]);

  const scrollToId = (id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleResultClick = (item: SearchableItem) => {
    setSearchQuery("");
    setShowResults(false);
    router.push(item.path);
  };

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>LEARNING</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Training, certifications, and Best Known Methods to help you thrive in the
            Nexus Marketplace and on NEXUS projects.
          </p>
        </header>

        {/* Global Search */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search all learning content, BKMs, guides..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              style={{
                width: "100%",
                padding: "12px 14px 12px 40px",
                fontSize: 15,
                border: "1px solid #d1d5db",
                borderRadius: 10,
                outline: "none",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowResults(false);
                  setSearchQuery("");
                }
                if (e.key === "Enter" && searchResults.length > 0) {
                  handleResultClick(searchResults[0]);
                }
              }}
            />
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                fontSize: 18,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setShowResults(false);
                }}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: 16,
                  padding: 4,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchQuery.trim() !== "" && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                zIndex: 50,
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              {searchResults.length > 0 ? (
                <>
                  <div
                    style={{
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6b7280",
                      backgroundColor: "#f9fafb",
                      borderBottom: "1px solid #e5e7eb",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
                  </div>
                  {searchResults.map((item) => (
                    <SearchResultItem
                      key={item.id}
                      item={item}
                      query={searchQuery}
                      onClick={() => handleResultClick(item)}
                    />
                  ))}
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "#6b7280",
                      backgroundColor: "#f9fafb",
                      borderTop: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Press Enter to open first result</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowResults(false);
                        router.push(`/learning/bkm?q=${encodeURIComponent(searchQuery)}`);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      Search all BKMs →
                    </button>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "#6b7280",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>No results found</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Try different keywords or{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setShowResults(false);
                        router.push("/learning/bkm");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontSize: 13,
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      browse all BKMs
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Click outside to close */}
          {showResults && searchQuery && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 40,
              }}
              onClick={() => setShowResults(false)}
            />
          )}
        </div>

        {/* Hero / welcome panel */}
        <section
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 18 }}>
            Welcome to LEARNING for the Nexus Marketplace
          </h2>
          <p style={{ marginTop: 0, marginBottom: 10, fontSize: 14, color: "#4b5563" }}>
            You&apos;re currently in the Nexus Marketplace, ready to be matched to client work.
            Use LEARNING to build your skills, complete key certifications, and understand
            how NEXUS operates so you&apos;re ready on day one when your project starts.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => scrollToId("marketplace-readiness")}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "#2563eb",
                color: "#f9fafb",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Start my learning journey
            </button>
            <button
              type="button"
              onClick={() => router.push("/operating-manual")}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #2563eb",
                backgroundColor: "#ffffff",
                color: "#2563eb",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              View NEXUS Operating Manual
            </button>
          </div>
        </section>

        {/* Marketplace readiness checklist */}
        <section id="marketplace-readiness">
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>Marketplace readiness</h2>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            Complete these steps to get marketplace‑ready as a Nexus Marketplace member.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <ChecklistItem
              label="Complete NEXUS 101"
              description="Learn how NEXUS Connect works, how projects run, and what&apos;s expected of Nexus Marketplace members."
              cta="Start NEXUS 101"
            />
            <ChecklistItem
              label="Review the NEXUS Operating Manual"
              description="Understand our delivery model, roles, and Best Known Methods across engagements."
              cta="Open Operating Manual"
            />
            <ChecklistItem
              label="Finish Tools & Systems basics"
              description="Get set up with NEXUS Connect, communication tools, and other core systems."
              cta="View Tools & Systems track"
            />
            <ChecklistItem
              label="Explore Culture & Ways of Working"
              description="Learn how we collaborate, communicate, and uphold NEXUS culture across projects."
              cta="View Culture modules"
            />
          </ul>
        </section>

        {/* Learning tracks */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Learning tracks</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <TrackCard
              id="learning-tracks"
              title="NEXUS 101"
              tagline="Start here to understand the NEXUS Connect Group and the Nexus Marketplace."
              bullets={[
                "Overview of NEXUS and how we work",
                "Roles, responsibilities, and the engagement lifecycle",
                "How the Nexus Marketplace fits into client delivery",
              ]}
              cta="Open NEXUS 101"
            />
            <TrackCard
              title="Tools & Systems"
              tagline="Get productive in the tools you&apos;ll use every day."
              bullets={[
                "Navigating NEXUS Connect",
                "Time tracking, communication, and documentation tools",
                "Access and security basics",
              ]}
              cta="Open Tools & Systems"
            />
            <TrackCard
              title="Best Known Methods (BKMs)"
              tagline="Learn the patterns and practices we rely on for consistent delivery."
              bullets={[
                "Proven delivery playbooks",
                "Quality standards and review practices",
                "Templates and examples from real engagements",
              ]}
              cta="Explore BKMs"
              onClick={() => router.push("/learning/bkm")}
            />
            <TrackCard
              title="Safety Manual"
              tagline="OSHA compliance and workplace safety procedures."
              bullets={[
                "PPE requirements and selection",
                "Hazard communication (HazCom)",
                "Emergency response procedures",
              ]}
              cta="Open Safety Manual"
              onClick={() => router.push("/learning/safety")}
              variant="safety"
            />
            <TrackCard
              title="Culture & Ways of Working"
              tagline="Understand how we show up for each other and for clients."
              bullets={[
                "Communication norms and expectations",
                "Collaboration across distributed teams",
                "How we handle feedback, growth, and performance",
              ]}
              cta="View Culture modules"
            />
          </div>
        </section>

        {/* NEXUS Safety Manual */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>NEXUS Safety Manual</h2>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            OSHA compliance, hazard prevention, and workplace safety procedures for all NEXUS projects.
          </p>
          <ul style={{ listStyle: "disc", paddingLeft: 20, marginTop: 0, marginBottom: 8 }}>
            <li>Personal Protective Equipment (PPE)</li>
            <li>Hazard Communication (HazCom)</li>
            <li>Fall Protection & Ladder Safety</li>
            <li>Electrical Safety & Lockout/Tagout</li>
            <li>Emergency Response & First Aid</li>
          </ul>
          <button
            type="button"
            onClick={() => router.push("/learning/safety")}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #dc2626",
              backgroundColor: "#dc2626",
              color: "#f9fafb",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Open Safety Manual
          </button>
        </section>

        {/* NEXUS Operating Manual */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>NEXUS Operating Manual</h2>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            The NEXUS Operating Manual is your always‑current reference for how we run
            projects, make decisions, and deliver work.
          </p>
          <ul style={{ listStyle: "disc", paddingLeft: 20, marginTop: 0, marginBottom: 8 }}>
            <li>Engagement lifecycle</li>
            <li>Roles & responsibilities</li>
            <li>Delivery governance & quality</li>
            <li>Client communication standards</li>
            <li>Marketplace and staffing policies</li>
          </ul>
          <button
            type="button"
            onClick={() => router.push("/operating-manual")}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #111827",
              backgroundColor: "#111827",
              color: "#f9fafb",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Open Operating Manual
          </button>
        </section>

        {/* Footer cross-links */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>Stay informed</h2>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            Stay connected to what&apos;s happening across the Nexus Marketplace and NEXUS.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push("/marketplace-faqs")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Go to Marketplace FAQs
            </button>
            <button
              type="button"
              onClick={() => router.push("/message-board")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              View announcements
            </button>
            <button
              type="button"
              onClick={() => router.push("/messaging")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Contact NEXUS Support
            </button>
          </div>
        </section>
      </div>
    </PageCard>
  );
}

interface ChecklistItemProps {
  label: string;
  description: string;
  cta: string;
}

function ChecklistItem({ label, description, cta }: ChecklistItemProps) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: "1px solid #16a34a",
          backgroundColor: "#ecfdf3",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "#16a34a",
          marginTop: 2,
        }}
      >
        •
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{label}</div>
        <p style={{ marginTop: 2, marginBottom: 4, fontSize: 13, color: "#4b5563" }}>
          {description}
        </p>
        <button
          type="button"
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {cta}
        </button>
      </div>
    </li>
  );
}

interface TrackCardProps {
  id?: string;
  title: string;
  tagline: string;
  bullets: string[];
  cta: string;
  onClick?: () => void;
  variant?: "default" | "safety";
}

function TrackCard({ id, title, tagline, bullets, cta, onClick, variant = "default" }: TrackCardProps) {
  const isSafety = variant === "safety";
  return (
    <div
      id={id}
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        height: "100%",
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>{tagline}</p>
      <ul style={{ margin: 4, paddingLeft: 18, fontSize: 13, color: "#4b5563" }}>
        {bullets.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div style={{ marginTop: "auto" }}>
        <button
          type="button"
          onClick={onClick}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: isSafety ? "1px solid #dc2626" : "1px solid #2563eb",
            backgroundColor: isSafety ? "#dc2626" : "#2563eb",
            color: "#f9fafb",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

// Search result item component
interface SearchResultItemProps {
  item: SearchableItem;
  query: string;
  onClick: () => void;
}

function SearchResultItem({ item, query, onClick }: SearchResultItemProps) {
  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    bkm: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
    track: { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
    reference: { bg: "#faf5ff", text: "#7c3aed", border: "#e9d5ff" },
    safety: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
  };
  const colors = categoryColors[item.category] || categoryColors.reference;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        borderBottom: "1px solid #f3f4f6",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colors.text,
          backgroundColor: colors.bg,
          border: `1px solid ${colors.border}`,
          padding: "2px 6px",
          borderRadius: 4,
          whiteSpace: "nowrap",
        }}
      >
        {item.categoryLabel}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
          <HighlightText text={item.title} query={query} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#6b7280",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <HighlightText text={item.description} query={query} />
        </div>
        {item.status === "coming-soon" && (
          <span
            style={{
              fontSize: 10,
              color: "#9333ea",
              backgroundColor: "#f3e8ff",
              padding: "1px 4px",
              borderRadius: 3,
              marginTop: 4,
              display: "inline-block",
            }}
          >
            Coming Soon
          </span>
        )}
      </div>
      <span style={{ color: "#9ca3af", fontSize: 14 }}>→</span>
    </button>
  );
}

// Highlight matching text
function HighlightText({ text, query }: { text: string; query: string }) {
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
          padding: "0 1px",
          borderRadius: 2,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  );
}
