"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../ui-shell";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  topic: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "meaning",
    question: "What does it mean to be in the Nexus Marketplace?",
    answer:
      "Being in the Nexus Marketplace means your skills and experience are visible to NEXUS engagement leaders who are staffing active and upcoming projects. While you may not yet be assigned, this is an active state—your profile, learning progress, and preferences help determine your fit for new opportunities.",
    topic: "Getting started in the Nexus Marketplace",
  },
  {
    id: "assignment",
    question: "How will I know when I’m assigned to a project?",
    answer:
      "You’ll receive a notification in NEXUS Connect and, where applicable, an email summary with project details, start date, and primary contacts. Once assigned, your home experience in NEXUS Connect will shift from the Marketplace view to your project workspace.",
    topic: "Project assignment",
  },
  {
    id: "focus-while-waiting",
    question: "What should I focus on while I wait for an assignment?",
    answer:
      "We recommend that you complete core LEARNING paths (NEXUS 101, Tools & Systems, and Culture & Ways of Working), review the NEXUS Operating Manual, and keep your profile, skills, and preferences up to date so you’re easier to match to new opportunities.",
    topic: "Getting started in the Nexus Marketplace",
  },
  {
    id: "status-issues",
    question: "Who can I contact if something about my Marketplace status looks incorrect?",
    answer:
      "If anything about your Marketplace status, profile, or assignment history looks incorrect, submit a support request or contact your talent partner. You’ll find contact options at the bottom of this page.",
    topic: "Tools & access",
  },
];

const TOPICS = [
  "All topics",
  "Getting started in the Nexus Marketplace",
  "Project assignment",
  "Tools & access",
  "Performance & expectations",
  "Culture & ways of working",
];

export default function MarketplaceFaqsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<string>("All topics");
  const [questionText, setQuestionText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQ_ITEMS.filter(item => {
      if (topic !== "All topics" && item.topic !== topic) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [search, topic]);

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 22 }}>Marketplace FAQs</h1>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            Answers, announcements, and guidance for Nexus Marketplace candidates and members.
          </p>
        </header>

        {/* Hero / intro */}
        <section
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 18 }}>
            Welcome to the Marketplace FAQs
          </h2>
          <p style={{ marginTop: 0, marginBottom: 0, fontSize: 14, color: "#4b5563" }}>
            This is your hub for the most common questions about the Nexus Marketplace, how
            project assignments work, and what to expect while you&apos;re not yet staffed on a
            project.
          </p>
        </section>

        {/* Pinned announcements */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Pinned announcements</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            <AnnouncementCard
              title="How the Nexus Marketplace works"
              body="You’re part of a curated marketplace of professionals who can be matched to active and upcoming NEXUS projects. Keep your profile current and complete your learning paths to increase your visibility."
            />
            <AnnouncementCard
              title="What to do while you’re not assigned to a project"
              body="Use this time to complete LEARNING modules, review the NEXUS Operating Manual, and stay current on Marketplace announcements here."
            />
          </div>
        </section>

        {/* Search + filters */}
        <section>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280" }}>
                Search
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search Marketplace questions…"
                  style={{
                    width: "100%",
                    marginTop: 2,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                />
              </label>
            </div>
            <div style={{ width: 220, minWidth: 180 }}>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280" }}>
                Filter by topic
                <select
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 2,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                    backgroundColor: "#ffffff",
                  }}
                >
                  {TOPICS.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        {/* FAQ list */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>Browse FAQs</h2>
          {filteredFaqs.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              No FAQs match your search. Try adjusting your filters or asking a new question
              below.
            </p>
          ) : (
            <div
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                overflow: "hidden",
              }}
            >
              {filteredFaqs.map((item, index) => (
                <FaqRow
                  key={item.id}
                  item={item}
                  isLast={index === filteredFaqs.length - 1}
                />
              ))}
            </div>
          )}
        </section>

        {/* Ask a question */}
        <section
          style={{
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            padding: 12,
            backgroundColor: "#ffffff",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>
            Can&apos;t find what you&apos;re looking for?
          </h2>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            Submit your question and someone from the NEXUS Connect team will respond and
            update the FAQs if it&apos;s useful for other Marketplace members.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Your question</span>
              <textarea
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                placeholder="Type your question about the Nexus Marketplace, assignments, or expectations…"
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  resize: "vertical",
                }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Topic (optional)</span>
              <select
                defaultValue=""
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="">Select a topic…</option>
                {TOPICS.filter(t => t !== "All topics").map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (!questionText.trim()) return;
                setSubmitted(true);
                setQuestionText("");
              }}
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "8px 12px",
                borderRadius: 6,
                border: "none",
                backgroundColor: "#2563eb",
                color: "#f9fafb",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Submit question
            </button>
            {submitted && (
              <p style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>
                Thanks for your question. The NEXUS Connect team will review it and respond
                here or add it to the Marketplace FAQs.
              </p>
            )}
          </div>
        </section>

        {/* Support footer */}
        <section>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>Need more help?</h2>
          <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
            If you need help beyond what&apos;s covered in these FAQs, reach out directly.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push("/messaging")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #111827",
                backgroundColor: "#111827",
                color: "#f9fafb",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Contact NEXUS Support
            </button>
            <button
              type="button"
              onClick={() => router.push("/learning")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Go to LEARNING
            </button>
            <button
              type="button"
              onClick={() => router.push("/operating-manual")}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Open the NEXUS Operating Manual
            </button>
          </div>
        </section>
      </div>
    </PageCard>
  );
}

function AnnouncementCard({ title, body }: { title: string; body: string }) {
  return (
    <article
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        padding: 12,
        fontSize: 13,
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>{title}</h3>
      <p style={{ marginTop: 0, marginBottom: 0, color: "#4b5563" }}>{body}</p>
    </article>
  );
}

function FaqRow({ item, isLast }: { item: FaqItem; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        borderBottom: isLast ? "none" : "1px solid #e5e7eb",
        padding: "10px 12px",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
        }}
        aria-expanded={open}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
              {item.question}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{item.topic}</div>
          </div>
          <span
            style={{
              fontSize: 16,
              color: "#6b7280",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            ❯
          </span>
        </div>
      </button>
      {open && (
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "#4b5563" }}>
          {item.answer}
        </p>
      )}
    </div>
  );
}
