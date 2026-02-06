"use client";

import { useRouter } from "next/navigation";
import { PageCard } from "../ui-shell";

export default function LearningPage() {
  const router = useRouter();

  const scrollToId = (id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
}

function TrackCard({ id, title, tagline, bullets, cta, onClick }: TrackCardProps) {
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
            border: "1px solid #2563eb",
            backgroundColor: "#2563eb",
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
