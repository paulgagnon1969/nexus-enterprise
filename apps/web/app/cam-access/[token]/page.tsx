"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GateStatus {
  valid: boolean;
  inviterName: string;
  inviteeEmail: string | null;
  inviteeName: string | null;
  cndaRequired: boolean;
  cndaAccepted: boolean;
  questionnaireRequired: boolean;
  questionnaireCompleted: boolean;
  accessGranted: boolean;
}

interface CamModule {
  mode: string;
  modeLabel: string;
  camCount: number;
  aggregateScore: number;
  cams: Array<{
    code: string;
    title: string;
    category: string;
    htmlBody?: string;
    scores: { total: number };
  }>;
}

interface HandbookData {
  modules: CamModule[];
  totalCams: number;
  overallAvgScore: number;
  _shareContext: {
    serialNumber: string;
    inviterName: string;
    recipientName: string | null;
    recipientEmail: string | null;
    accessedAt: string;
    visitNumber: number;
  };
}

// ─── CNDA Summary (key provisions) ──────────────────────────────────────────

const CNDA_SUMMARY = `
<h2 style="margin-top:0">Confidentiality and Non-Disclosure Agreement Plus (CNDA+)</h2>
<p><strong>Between:</strong> Nexus Group LLC ("Disclosing Party") and the undersigned Recipient.</p>

<h3>Key Provisions</h3>
<ul>
  <li><strong>Confidentiality (Art. 1–3):</strong> All information disclosed is presumed confidential. Recipient must protect it with at least the same standard of care as their own most sensitive information.</li>
  <li><strong>Non-Use (Art. 3.2):</strong> Information may only be used for evaluating a potential business relationship with Nexus. No competitive use, product development, or solicitation.</li>
  <li><strong>No Reverse Engineering (Art. 4):</strong> Absolute prohibition on reverse engineering, decompiling, deconstructing, or recreating any Nexus technology, architecture, or module design.</li>
  <li><strong>IP Ownership (Art. 5):</strong> All intellectual property remains the sole property of Nexus. No license is granted by this disclosure.</li>
  <li><strong>Document Protection (Art. 6):</strong> Recipients must not circumvent watermarks, serial numbers, copy prevention, or other technical protections. All access is logged with forensic serial numbers.</li>
  <li><strong>Non-Solicitation (Art. 7):</strong> Recipient shall not solicit or recruit Nexus employees or contractors for 24 months.</li>
  <li><strong>Remedies (Art. 9):</strong> Nexus may seek injunctive relief without bond. Breach may result in liquidated damages of $250,000 per incident plus actual damages.</li>
  <li><strong>Duration (Art. 10):</strong> Obligations survive for 5 years from disclosure; trade secrets are protected indefinitely.</li>
  <li><strong>Governing Law:</strong> State of Texas, venue in Comal County.</li>
</ul>

<p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;font-size:13px">
  <strong>⚠ Important:</strong> By accepting below, you agree to be bound by the full CNDA+ agreement.
  Your acceptance is recorded with your IP address, timestamp, and browser information as
  evidence of electronic consent per Article 13.
</p>
`;

// ─── Questionnaire questions ────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: "role",
    label: "What best describes your role?",
    type: "select" as const,
    options: [
      "Owner / CEO",
      "General Manager / COO",
      "Project Manager",
      "Estimator",
      "Operations Manager",
      "IT / Technology",
      "Consultant / Advisor",
      "Other",
    ],
  },
  {
    id: "companySize",
    label: "How many employees does your company have?",
    type: "select" as const,
    options: ["1–10", "11–25", "26–50", "51–100", "100+"],
  },
  {
    id: "industry",
    label: "What industry are you in?",
    type: "select" as const,
    options: [
      "Restoration / Remediation",
      "General Construction",
      "Roofing",
      "Plumbing / HVAC / Electrical",
      "Property Management",
      "Insurance",
      "Technology / SaaS",
      "Other",
    ],
  },
  {
    id: "interest",
    label: "What are you most interested in learning about?",
    type: "multi" as const,
    options: [
      "Estimating & pricing automation",
      "Project management & scheduling",
      "Financial operations",
      "Workforce & time management",
      "Client collaboration tools",
      "Compliance & documentation",
      "General platform overview",
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function CamAccessPage() {
  const params = useParams();
  const token = params?.token as string;

  // Gate state
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CNDA form
  const [cndaName, setCndaName] = useState("");
  const [cndaEmail, setCndaEmail] = useState("");
  const [cndaCompany, setCndaCompany] = useState("");
  const [cndaChecked, setCndaChecked] = useState(false);
  const [cndaSubmitting, setCndaSubmitting] = useState(false);

  // Questionnaire
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [qSubmitting, setQSubmitting] = useState(false);

  // Content
  const [handbook, setHandbook] = useState<HandbookData | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // ── Load gate status ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/cam-access/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "This access link is invalid or has expired.");
          return;
        }
        const data: GateStatus = await res.json();
        setGate(data);
        // Pre-fill email if we already have it
        if (data.inviteeEmail) setCndaEmail(data.inviteeEmail);
        if (data.inviteeName) setCndaName(data.inviteeName);
      } catch {
        setError("Failed to validate access link. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ── Auto-load content if both gates already passed ────────────────
  useEffect(() => {
    if (gate?.accessGranted && !handbook && !contentLoading) {
      loadContent();
    }
  }, [gate?.accessGranted]);

  // ── CNDA submission ───────────────────────────────────────────────
  const handleCndaSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!cndaChecked || !cndaName.trim() || !cndaEmail.trim()) return;
      setCndaSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/cam-access/${token}/accept-cnda`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: cndaName.trim(),
            email: cndaEmail.trim(),
            company: cndaCompany.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to record acceptance");
        const data = await res.json();
        setGate((prev) =>
          prev ? { ...prev, cndaAccepted: data.cndaAccepted, questionnaireCompleted: data.questionnaireCompleted, accessGranted: data.accessGranted } : prev,
        );
      } catch {
        setError("Failed to record CNDA acceptance. Please try again.");
      } finally {
        setCndaSubmitting(false);
      }
    },
    [token, cndaName, cndaEmail, cndaCompany, cndaChecked],
  );

  // ── Questionnaire submission ──────────────────────────────────────
  const handleQuestionnaireSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // Validate at least role + companySize answered
      if (!answers.role || !answers.companySize) return;
      setQSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/cam-access/${token}/questionnaire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
        if (!res.ok) throw new Error("Failed to submit questionnaire");
        const data = await res.json();
        setGate((prev) =>
          prev ? { ...prev, questionnaireCompleted: data.questionnaireCompleted, accessGranted: data.accessGranted } : prev,
        );
      } catch {
        setError("Failed to submit questionnaire. Please try again.");
      } finally {
        setQSubmitting(false);
      }
    },
    [token, answers],
  );

  // ── Content loading ───────────────────────────────────────────────
  async function loadContent() {
    setContentLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cam-access/${token}/content`);
      if (!res.ok) throw new Error("Failed to load content");
      const data: HandbookData = await res.json();
      setHandbook(data);
    } catch {
      setError("Failed to load document content. Please try again.");
    } finally {
      setContentLoading(false);
    }
  }

  // ── IP protection for content view ────────────────────────────────
  useEffect(() => {
    if (!handbook) return;
    const handleContextMenu = (e: Event) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "s", "a", "p", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === "PrintScreen") e.preventDefault();
    };
    const handleDragStart = (e: Event) => e.preventDefault();

    const printStyle = document.createElement("style");
    printStyle.id = "nexus-cam-print-block";
    printStyle.textContent = `@media print { body * { display: none !important; } body::after { content: "Printing is disabled for this document."; display: block !important; text-align: center; padding: 40px; font-size: 18px; color: #dc2626; } }`;
    document.head.appendChild(printStyle);

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dragstart", handleDragStart);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dragstart", handleDragStart);
      document.getElementById("nexus-cam-print-block")?.remove();
    };
  }, [handbook]);

  // ── Determine current step ────────────────────────────────────────
  const currentStep = !gate
    ? "loading"
    : gate.accessGranted
      ? "content"
      : !gate.cndaAccepted
        ? "cnda"
        : !gate.questionnaireCompleted
          ? "questionnaire"
          : "content";

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Validating access link...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h2 style={{ margin: 0, color: "#991b1b" }}>Access Denied</h2>
            <p style={{ color: "#6b7280", marginTop: 8 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Progress indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {["CNDA+", "Questionnaire", "Document"].map((label, i) => {
          const stepIndex = i;
          const activeIndex = currentStep === "cnda" ? 0 : currentStep === "questionnaire" ? 1 : 2;
          const isActive = stepIndex === activeIndex;
          const isDone = stepIndex < activeIndex;
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                background: isActive ? "#0f172a" : isDone ? "#059669" : "#e5e7eb",
                color: isActive || isDone ? "#fff" : "#6b7280",
              }}
            >
              {isDone ? "✓" : stepIndex + 1}. {label}
            </div>
          );
        })}
      </div>

      {/* Inviter context */}
      {gate && (
        <div style={{ textAlign: "center", marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
          You were invited by <strong style={{ color: "#0f172a" }}>{gate.inviterName}</strong>
        </div>
      )}

      {/* ── Step 1: CNDA ─────────────────────────────────────────── */}
      {currentStep === "cnda" && (
        <div style={{ ...cardStyle, maxWidth: 720 }}>
          <div
            style={{ maxHeight: 400, overflow: "auto", padding: 16, background: "#f9fafb", borderRadius: 6, marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: CNDA_SUMMARY }}
          />

          <form onSubmit={handleCndaSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Full Legal Name *</label>
                <input
                  type="text"
                  value={cndaName}
                  onChange={(e) => setCndaName(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label style={labelStyle}>Email Address *</label>
                <input
                  type="email"
                  value={cndaEmail}
                  onChange={(e) => setCndaEmail(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="jane@company.com"
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Company / Organization</label>
              <input
                type="text"
                value={cndaCompany}
                onChange={(e) => setCndaCompany(e.target.value)}
                style={inputStyle}
                placeholder="Acme Restoration Inc."
              />
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={cndaChecked}
                onChange={(e) => setCndaChecked(e.target.checked)}
                style={{ marginTop: 3, width: 18, height: 18 }}
              />
              <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                I have read and understand the Confidentiality and Non-Disclosure Agreement Plus (CNDA+).
                I accept all terms and conditions, including the prohibitions on reverse engineering,
                non-solicitation, and the remedies for breach. I understand this acceptance is legally binding
                and is recorded with my IP address and timestamp.
              </span>
            </label>

            <button
              type="submit"
              disabled={!cndaChecked || !cndaName.trim() || !cndaEmail.trim() || cndaSubmitting}
              style={{
                ...btnPrimaryStyle,
                opacity: !cndaChecked || !cndaName.trim() || !cndaEmail.trim() ? 0.5 : 1,
              }}
            >
              {cndaSubmitting ? "Recording Acceptance..." : "I Accept — Continue"}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 2: Questionnaire ────────────────────────────────── */}
      {currentStep === "questionnaire" && (
        <div style={{ ...cardStyle, maxWidth: 640 }}>
          <h2 style={{ margin: 0, fontSize: 18, marginBottom: 4 }}>Quick Assessment</h2>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 0, marginBottom: 20 }}>
            Help us understand your needs so we can tailor the experience. Takes about 30 seconds.
          </p>

          <form onSubmit={handleQuestionnaireSubmit}>
            {QUESTIONS.map((q) => (
              <div key={q.id} style={{ marginBottom: 20 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>{q.label} {q.id === "role" || q.id === "companySize" ? "*" : ""}</label>
                {q.type === "select" && (
                  <select
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="">Select...</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {q.type === "multi" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {q.options.map((opt) => {
                      const selected = (answers[q.id] as string[] || []).includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setAnswers((prev) => {
                              const current = (prev[q.id] as string[]) || [];
                              return {
                                ...prev,
                                [q.id]: selected
                                  ? current.filter((v: string) => v !== opt)
                                  : [...current, opt],
                              };
                            });
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 16,
                            border: `1px solid ${selected ? "#2563eb" : "#d1d5db"}`,
                            background: selected ? "#eff6ff" : "#fff",
                            color: selected ? "#1d4ed8" : "#374151",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          {selected ? "✓ " : ""}{opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={!answers.role || !answers.companySize || qSubmitting}
              style={{
                ...btnPrimaryStyle,
                opacity: !answers.role || !answers.companySize ? 0.5 : 1,
              }}
            >
              {qSubmitting ? "Submitting..." : "Submit & View Document"}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 3: Content ──────────────────────────────────────── */}
      {currentStep === "content" && !handbook && contentLoading && (
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Loading CAM Manual...
          </div>
        </div>
      )}

      {currentStep === "content" && handbook && (
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Watermark bar */}
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 6,
              padding: "8px 16px",
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
              color: "#92400e",
            }}
          >
            <span>
              🔒 CONFIDENTIAL — Serial: <strong>{handbook._shareContext.serialNumber}</strong>
              {" "}| Shared by: {handbook._shareContext.inviterName}
              {" "}| Visit #{handbook._shareContext.visitNumber}
            </span>
            <span>{new Date(handbook._shareContext.accessedAt).toLocaleString()}</span>
          </div>

          {/* Header */}
          <div style={{ ...cardStyle, marginBottom: 16, padding: 20 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>🏆 Nexus CAM Manual</h1>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4, marginBottom: 0 }}>
              Competitive Advantage Modules — {handbook.totalCams} CAMs across {handbook.modules.length} functional areas
            </p>
          </div>

          {/* Module list */}
          {handbook.modules.map((mod) => (
            <div key={mod.mode} style={{ ...cardStyle, marginBottom: 12, padding: 0, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(expandedModules);
                  next.has(mod.mode) ? next.delete(mod.mode) : next.add(mod.mode);
                  setExpandedModules(next);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  border: "none",
                  background: "#f9fafb",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.modeLabel}</span>
                  <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>
                    {mod.camCount} CAM{mod.camCount !== 1 ? "s" : ""} · Avg {mod.aggregateScore}/40
                  </span>
                </div>
                <span style={{ fontSize: 18, color: "#9ca3af" }}>
                  {expandedModules.has(mod.mode) ? "▾" : "▸"}
                </span>
              </button>

              {expandedModules.has(mod.mode) && (
                <div style={{ padding: "0 20px 16px" }}>
                  {mod.cams.map((cam) => (
                    <div
                      key={cam.code}
                      style={{
                        borderTop: "1px solid #f3f4f6",
                        padding: "16px 0",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{cam.title}</span>
                          <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 8 }}>{cam.code}</span>
                        </div>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: cam.scores.total >= 30 ? "#ecfdf5" : cam.scores.total >= 25 ? "#eff6ff" : "#f9fafb",
                            color: cam.scores.total >= 30 ? "#059669" : cam.scores.total >= 25 ? "#2563eb" : "#6b7280",
                          }}
                        >
                          {cam.scores.total}/40
                        </span>
                      </div>
                      {cam.htmlBody && (
                        <div
                          style={{ fontSize: 13, lineHeight: 1.7, color: "#374151" }}
                          dangerouslySetInnerHTML={{ __html: cam.htmlBody }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Footer watermark */}
          <div
            style={{
              textAlign: "center",
              padding: "24px 0",
              fontSize: 11,
              color: "#9ca3af",
              userSelect: "none",
            }}
          >
            CONFIDENTIAL — Nexus Group LLC — Serial: {handbook._shareContext.serialNumber}
            <br />
            This document is protected under the CNDA+ agreement. Unauthorized distribution is prohibited.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f1f5f9",
  padding: "40px 16px",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 800,
  margin: "0 auto",
  background: "#ffffff",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  padding: 24,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 20px",
  borderRadius: 6,
  border: "none",
  background: "#0f172a",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
