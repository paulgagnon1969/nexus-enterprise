"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import DOMPurify from "dompurify";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GateStatus {
  valid: boolean;
  campaignName: string;
  campaignSlug: string;
  inviterName: string;
  inviteeEmail: string | null;
  inviteeName: string | null;
  cndaRequired: boolean;
  cndaAccepted: boolean;
  cndaHtml: string | null;
  questionnaireRequired: boolean;
  questionnaireCompleted: boolean;
  questionnaireConfig: QuestionnaireConfig | null;
  accessGranted: boolean;
  identityVerificationRequired: boolean;
  documentCount: number;
}

interface QuestionnaireConfig {
  questions: QuestionDef[];
}

interface QuestionDef {
  id: string;
  label: string;
  type: "select" | "multi" | "text";
  options?: string[];
  required?: boolean;
}

interface PortalDocument {
  id: string;
  code: string;
  title: string;
  htmlContent: string;
}

interface PortalContent {
  campaignName: string;
  campaignSlug: string;
  documents: PortalDocument[];
  _shareContext: {
    serialNumber: string;
    inviterName: string;
    recipientName: string | null;
    recipientEmail: string | null;
    accessedAt: string;
    visitNumber: number;
  };
}

// ─── Default Questionnaire (fallback when campaign has none) ─────────────────

const DEFAULT_QUESTIONS: QuestionDef[] = [
  {
    id: "role",
    label: "What best describes your role?",
    type: "select",
    required: true,
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
    type: "select",
    required: true,
    options: ["1–10", "11–25", "26–50", "51–100", "100+"],
  },
  {
    id: "industry",
    label: "What industry are you in?",
    type: "select",
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
    type: "multi",
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitize(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["div", "pre", "code", "br", "span"],
    ADD_ATTR: ["class", "style", "id"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PortalAccessPage() {
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
  const [content, setContent] = useState<PortalContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Identity verification
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Auto-verify guard
  const autoVerifyAttempted = useRef(false);

  // ── Load gate status ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/portal-access/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "This access link is invalid or has expired.");
          return;
        }
        const data: GateStatus = await res.json();
        setGate(data);
        if (data.inviteeEmail) setCndaEmail(data.inviteeEmail);
        if (data.inviteeName) setCndaName(data.inviteeName);
      } catch {
        setError("Failed to validate access link. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ── Restore verified email from sessionStorage ────────────────────
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(`nexus_portal_verified_${token}`);
      if (saved) setVerifiedEmail(saved);
    } catch {}
  }, [token]);

  // ── Auto-load content when identity is verified ───────────────────
  useEffect(() => {
    if (gate?.accessGranted && verifiedEmail && !content && !contentLoading) {
      loadContent(verifiedEmail);
      try {
        window.localStorage.setItem("nexus_portal_token", token);
      } catch {}
    }
  }, [gate?.accessGranted, verifiedEmail]);

  // ── Auto-verify from CNDA email (same session) ───────────────────
  useEffect(() => {
    if (gate?.accessGranted && cndaEmail && !verifiedEmail && !autoVerifyAttempted.current) {
      const email = cndaEmail.trim().toLowerCase();
      if (email && !email.includes("***")) {
        autoVerifyAttempted.current = true;
        setVerifiedEmail(email);
        try { window.sessionStorage.setItem(`nexus_portal_verified_${token}`, email); } catch {}
      }
    }
  }, [gate?.accessGranted, cndaEmail, verifiedEmail, token]);

  // ── CNDA submission ───────────────────────────────────────────────
  const handleCndaSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!cndaChecked || !cndaName.trim() || !cndaEmail.trim()) return;
      setCndaSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/portal-access/${token}/accept-cnda`, {
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
          prev ? { ...prev, cndaAccepted: data.cndaAccepted, questionnaireCompleted: data.questionnaireCompleted, accessGranted: data.accessGranted, cndaHtml: null } : prev,
        );
      } catch {
        setError("Failed to record agreement acceptance. Please try again.");
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
      const questions = gate?.questionnaireConfig?.questions ?? DEFAULT_QUESTIONS;
      const requiredIds = questions.filter((q) => q.required !== false).map((q) => q.id);
      if (requiredIds.some((id) => !answers[id])) return;
      setQSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/portal-access/${token}/questionnaire`, {
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
    [token, answers, gate?.questionnaireConfig],
  );

  // ── Content loading ───────────────────────────────────────────────
  async function loadContent(email: string) {
    setContentLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/portal-access/${token}/content?email=${encodeURIComponent(email)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setVerifiedEmail(null);
          setVerifyError(data.message || "Email verification failed.");
          try { window.sessionStorage.removeItem(`nexus_portal_verified_${token}`); } catch {}
          return;
        }
        throw new Error("Failed to load content");
      }
      const data: PortalContent = await res.json();
      setContent(data);
    } catch {
      setError("Failed to load document content. Please try again.");
    } finally {
      setContentLoading(false);
    }
  }

  // ── IP protection for content view ────────────────────────────────
  useEffect(() => {
    if (!content) return;
    const handleContextMenu = (e: Event) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "s", "a", "p", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === "PrintScreen") e.preventDefault();
    };
    const handleDragStart = (e: Event) => e.preventDefault();

    const printStyle = document.createElement("style");
    printStyle.id = "nexus-portal-print-block";
    printStyle.textContent = `@media print { body * { display: none !important; } body::after { content: "Printing is disabled for this document."; display: block !important; text-align: center; padding: 40px; font-size: 18px; color: #dc2626; } }`;
    document.head.appendChild(printStyle);

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dragstart", handleDragStart);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dragstart", handleDragStart);
      document.getElementById("nexus-portal-print-block")?.remove();
    };
  }, [content]);

  // ── Identity verification submission ─────────────────────────────
  const handleVerifyIdentity = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const email = verifyInput.trim().toLowerCase();
      if (!email) return;
      setVerifying(true);
      setVerifyError(null);
      setVerifiedEmail(email);
      try { window.sessionStorage.setItem(`nexus_portal_verified_${token}`, email); } catch {}
      setVerifying(false);
    },
    [token, verifyInput],
  );

  // ── Determine current step ────────────────────────────────────────
  const hasQuestionnaire = gate?.questionnaireRequired;
  const needsVerification = gate?.accessGranted && !verifiedEmail;

  const stepLabels = ["Agreement", ...(hasQuestionnaire ? ["Questionnaire"] : []), "Verify", "Document"];
  const currentStep = !gate
    ? "loading"
    : !gate.cndaAccepted
      ? "cnda"
      : hasQuestionnaire && !gate.questionnaireCompleted
        ? "questionnaire"
        : needsVerification
          ? "verify"
          : "content";
  const stepMap: Record<string, number> = { cnda: 0 };
  let idx = 1;
  if (hasQuestionnaire) { stepMap.questionnaire = idx; idx++; }
  stepMap.verify = idx; idx++;
  stepMap.content = idx;
  const activeIndex = stepMap[currentStep] ?? 0;

  // ── Resolve questionnaire questions ───────────────────────────────
  const questions = gate?.questionnaireConfig?.questions ?? DEFAULT_QUESTIONS;
  const requiredQuestionIds = questions.filter((q) => q.required !== false).map((q) => q.id);

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
      {/* Campaign title */}
      {gate && (
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{gate.campaignName}</h1>
        </div>
      )}

      {/* Progress indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {stepLabels.map((label, i) => {
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
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
              {isDone ? "✓" : i + 1}. {label}
            </div>
          );
        })}
      </div>

      {/* Inviter context */}
      {gate && (
        <div style={{ textAlign: "center", marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
          You were invited by <strong style={{ color: "#0f172a" }}>{gate.inviterName}</strong>
          {gate.documentCount > 0 && (
            <span> · {gate.documentCount} document{gate.documentCount !== 1 ? "s" : ""} to review</span>
          )}
        </div>
      )}

      {/* ── Step 1: CNDA ─────────────────────────────────────────── */}
      {currentStep === "cnda" && (
        <div style={{ ...cardStyle, maxWidth: 720 }}>
          {gate?.cndaHtml ? (
            <div
              style={{ maxHeight: 400, overflow: "auto", padding: 16, background: "#f9fafb", borderRadius: 6, marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: sanitize(gate.cndaHtml) }}
            />
          ) : (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, marginBottom: 20, fontSize: 13, color: "#6b7280" }}>
              Loading agreement...
            </div>
          )}

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
                I have read and understand the agreement above.
                I accept all terms and conditions. I understand this acceptance is legally binding
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
            {questions.map((q) => (
              <div key={q.id} style={{ marginBottom: 20 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>
                  {q.label} {q.required !== false ? "*" : ""}
                </label>
                {q.type === "select" && q.options && (
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
                {q.type === "multi" && q.options && (
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
                {q.type === "text" && (
                  <input
                    type="text"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={requiredQuestionIds.some((id) => !answers[id]) || qSubmitting}
              style={{
                ...btnPrimaryStyle,
                opacity: requiredQuestionIds.some((id) => !answers[id]) ? 0.5 : 1,
              }}
            >
              {qSubmitting ? "Submitting..." : "Submit & View Document"}
            </button>
          </form>
        </div>
      )}

      {/* ── Step: Identity Verification ──────────────────────────── */}
      {currentStep === "verify" && (
        <div style={{ ...cardStyle, maxWidth: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Verify Your Identity</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              For your protection, please confirm the email address you used<br />when you signed the agreement.
            </p>
          </div>

          {verifyError && (
            <div style={{ padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
              ⚠ {verifyError}
            </div>
          )}

          <form onSubmit={handleVerifyIdentity}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email Address *</label>
              <input
                type="email"
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                required
                style={inputStyle}
                placeholder="The email you used for the agreement"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!verifyInput.trim() || verifying}
              style={{
                ...btnPrimaryStyle,
                opacity: !verifyInput.trim() ? 0.5 : 1,
              }}
            >
              {verifying ? "Verifying..." : "Verify & Continue"}
            </button>
          </form>
        </div>
      )}

      {/* ── Step: Content ────────────────────────────────────────── */}
      {currentStep === "content" && !content && contentLoading && (
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Loading documents...
          </div>
        </div>
      )}

      {currentStep === "content" && content && (
        <PortalContentView content={content} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  CONTENT VIEW — renders campaign documents                         */
/* ═══════════════════════════════════════════════════════════════════ */

function PortalContentView({ content }: { content: PortalContent }) {
  const isReturnVisit = content._shareContext.visitNumber > 1;
  const [bookmarkDismissed, setBookmarkDismissed] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(
    content.documents.length === 1 ? content.documents[0].id : null,
  );

  return (
    <>
      {/* Document content styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .portal-container { padding: 0 !important; max-width: 100% !important; }
          .doc-section { page-break-inside: avoid; }
          body { font-size: 11pt; line-height: 1.5; }
        }
        .doc-content h1 { font-size: 20px; margin: 16px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .doc-content h2 { font-size: 17px; margin: 14px 0 6px; color: #1e293b; }
        .doc-content h3 { font-size: 14px; margin: 12px 0 4px; color: #334155; }
        .doc-content p { margin: 6px 0; line-height: 1.6; }
        .doc-content ul, .doc-content ol { margin: 6px 0; padding-left: 24px; }
        .doc-content li { margin: 3px 0; line-height: 1.5; }
        .doc-content pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 12px; }
        .doc-content code { font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
        .doc-content pre code { background: none; padding: 0; }
        .doc-content blockquote { border-left: 3px solid #3b82f6; margin: 8px 0; padding: 8px 16px; background: #f0f9ff; color: #1e40af; font-style: italic; }
        .doc-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
        .doc-content table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
        .doc-content th, .doc-content td { padding: 6px 10px; border: 1px solid #e5e7eb; text-align: left; }
        .doc-content th { background: #f9fafb; font-weight: 600; }
        .doc-content tr:nth-child(even) { background: #fafafa; }
      `}</style>

      <div className="portal-container" style={{ maxWidth: 900, margin: "0 auto", padding: 0 }}>
        {/* ── Welcome back banner ── */}
        {isReturnVisit && (
          <div className="no-print" style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)", border: "1px solid #93c5fd", borderRadius: 8, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>👋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1e40af" }}>Welcome back{content._shareContext.recipientName ? `, ${content._shareContext.recipientName}` : ""}!</div>
              <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>This is visit #{content._shareContext.visitNumber}. Your access link never expires — bookmark this page to return anytime.</div>
            </div>
          </div>
        )}

        {/* ── Bookmark prompt (first visit) ── */}
        {!isReturnVisit && !bookmarkDismissed && (
          <div className="no-print" style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>🔖</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#065f46" }}>Bookmark this page</div>
              <div style={{ fontSize: 12, color: "#047857", marginTop: 2 }}>
                Press <strong>{typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) ? "⌘+D" : "Ctrl+D"}</strong> to bookmark this page. Your personal access link lets you return anytime without re-registering.
              </div>
            </div>
            <button onClick={() => setBookmarkDismissed(true)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#6b7280", padding: 4, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* ── Watermark bar ── */}
        <div className="no-print" style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "8px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#92400e" }}>
          <span>🔒 CONFIDENTIAL — Serial: <strong>{content._shareContext.serialNumber}</strong> | Shared by: {content._shareContext.inviterName} | Visit #{content._shareContext.visitNumber}</span>
          <span>{new Date(content._shareContext.accessedAt).toLocaleString()}</span>
        </div>

        {/* ── Title ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>{content.campaignName}</h1>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            <strong>{content.documents.length}</strong> document{content.documents.length !== 1 ? "s" : ""}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Prepared for: <strong>{content._shareContext.recipientName || content._shareContext.recipientEmail || "Invited Reviewer"}</strong>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "0 0 32px" }} />

        {/* ── Table of Contents (multi-doc only) ── */}
        {content.documents.length > 1 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#0f172a" }}>Contents</h2>
            {content.documents.map((doc, i) => (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", width: 20, textAlign: "right" }}>{i + 1}.</span>
                <a
                  href={`#doc-${doc.id}`}
                  onClick={(e) => { e.preventDefault(); setExpandedDoc(doc.id); document.getElementById(`doc-${doc.id}`)?.scrollIntoView({ behavior: "smooth" }); }}
                  style={{ color: "#2563eb", textDecoration: "none", fontSize: 14, fontWeight: 500 }}
                >
                  {doc.title}
                </a>
                {doc.code && <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>{doc.code}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Documents ── */}
        {content.documents.map((doc, i) => {
          const isExpanded = content.documents.length === 1 || expandedDoc === doc.id;
          return (
            <div key={doc.id} id={`doc-${doc.id}`} className="doc-section" style={{ marginBottom: 32 }}>
              <div
                onClick={() => content.documents.length > 1 && setExpandedDoc(isExpanded ? null : doc.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "#f9fafb",
                  borderRadius: isExpanded ? "8px 8px 0 0" : 8,
                  border: "1px solid #e5e7eb",
                  cursor: content.documents.length > 1 ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", marginBottom: 2 }}>
                    Document {i + 1}{doc.code ? ` · ${doc.code}` : ""}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1e293b" }}>{doc.title}</h3>
                </div>
                {content.documents.length > 1 && (
                  <span style={{ fontSize: 18, color: "#6b7280", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                )}
              </div>
              {isExpanded && doc.htmlContent && (
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderTop: "none",
                    borderRadius: "0 0 8px 8px",
                    padding: 24,
                    background: "#fff",
                  }}
                >
                  <div
                    className="doc-content"
                    style={{ fontSize: 14, lineHeight: 1.6, color: "#1e293b" }}
                    dangerouslySetInnerHTML={{ __html: sanitize(doc.htmlContent) }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* ── Footer ── */}
        <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "48px 0 16px" }} />
        <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", userSelect: "none", paddingBottom: 40 }}>
          CONFIDENTIAL — Nexus Group LLC — Serial: {content._shareContext.serialNumber}<br />
          This document is protected under the agreement you accepted. Unauthorized distribution is prohibited.<br />
          {content.documents.length} document{content.documents.length !== 1 ? "s" : ""} · {new Date(content._shareContext.accessedAt).toLocaleDateString()}
        </div>
      </div>
    </>
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
