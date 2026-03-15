"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import DOMPurify from "dompurify";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GateStatus {
  valid: boolean;
  revoked?: boolean;
  revokedReason?: string | null;
  inviterName: string;
  inviteeEmail: string | null;
  inviteeName: string | null;
  cndaRequired?: boolean;
  cndaAccepted?: boolean;
  questionnaireRequired?: boolean;
  questionnaireCompleted?: boolean;
  accessGranted?: boolean;
}

interface CamScores {
  uniqueness: number;
  value: number;
  demonstrable: number;
  defensible: number;
  total: number;
}

interface CamEntry {
  camId: string;
  code: string;
  title: string;
  category: string;
  status: string;
  htmlContent: string;
  htmlBody?: string;
  scores: CamScores;
  updatedAt?: string;
}

interface CamReadStatusEntry {
  camId: string;
  lastReadAt: string;
  isFavorite: boolean;
}

interface CamModule {
  mode: string;
  modeLabel: string;
  camCount: number;
  aggregateScore: number;
  cams: CamEntry[];
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

// ─── Constants ───────────────────────────────────────────────────────────────

const MODE_ICONS: Record<string, string> = {
  EST: "💰", FIN: "📊", OPS: "🏗️", HR: "👷", CLT: "🤝", CMP: "✅", TECH: "⚡",
};

const CATEGORY_LABELS: Record<string, string> = {
  AUTO: "Automation", INTL: "Intelligence", INTG: "Integration", VIS: "Visibility",
  SPD: "Speed", ACC: "Accuracy", CMP: "Compliance", COLLAB: "Collaboration",
};

function scoreTier(score: number): string {
  if (score >= 35) return "🏆 Elite";
  if (score >= 30) return "⭐ Strong";
  if (score >= 24) return "✅ Qualified";
  return "—";
}

function scoreColor(score: number): string {
  if (score >= 35) return "#059669";
  if (score >= 30) return "#0284c7";
  if (score >= 24) return "#b45309";
  return "#6b7280";
}

function sanitize(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["div", "pre", "code", "br", "span"],
    ADD_ATTR: ["class", "style", "id"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
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

  // Identity verification
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Auto-verify guard — prevents infinite retry loop when cndaEmail is masked
  const autoVerifyAttempted = useRef(false);

  // Referral
  const [showReferral, setShowReferral] = useState(false);
  const [refName, setRefName] = useState("");
  const [refEmail, setRefEmail] = useState("");
  const [refMessage, setRefMessage] = useState("");
  const [refSubmitting, setRefSubmitting] = useState(false);
  const [refResult, setRefResult] = useState<{ success: boolean; message: string } | null>(null);

  // Self-withdrawal
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawEmail, setWithdrawEmail] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  // Admin overlay
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const accessToken = window.localStorage.getItem("accessToken");
    if (!accessToken) return;
    fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then((me: any) => {
        if (me?.globalRole === "SUPER_ADMIN") {
          setIsAdmin(true);
          if (me.email) setAdminEmail(me.email);
        }
      })
      .catch(() => {});
  }, []);

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

  // ── Restore verified email from sessionStorage on mount ────────────
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(`nexus_cam_verified_${token}`);
      if (saved) setVerifiedEmail(saved);
    } catch {}
  }, [token]);

  // ── Auto-load content when identity is verified ────────────────────
  useEffect(() => {
    if (gate?.accessGranted && verifiedEmail && !handbook && !contentLoading) {
      loadContent(verifiedEmail);
      try {
        window.localStorage.setItem("nexus_cam_token", token);
      } catch {}
    }
  }, [gate?.accessGranted, verifiedEmail]);

  // ── When user just completed CNDA in this session, auto-verify ─────
  // The CNDA step captured their email, so they don't need to re-enter it.
  // Guard: skip masked emails (j***e@company.com) returned for returning visitors,
  // and don't retry after the first attempt to avoid infinite loops.
  useEffect(() => {
    if (gate?.accessGranted && cndaEmail && !verifiedEmail && !autoVerifyAttempted.current) {
      const email = cndaEmail.trim().toLowerCase();
      // Masked emails contain "***" — never auto-verify with those
      if (email && !email.includes("***")) {
        autoVerifyAttempted.current = true;
        setVerifiedEmail(email);
        try { window.sessionStorage.setItem(`nexus_cam_verified_${token}`, email); } catch {}
      }
    }
  }, [gate?.accessGranted, cndaEmail, verifiedEmail, token]);

  // ── Admin auto-verify — skip identity step for SUPER_ADMIN ─────────
  // When the admin opens a preview link from the CAM Dashboard, use their
  // logged-in email to auto-verify identity so they never see the form.
  useEffect(() => {
    if (isAdmin && adminEmail && gate?.accessGranted && !verifiedEmail) {
      const email = adminEmail.trim().toLowerCase();
      setVerifiedEmail(email);
      setVerifyInput(email);
      try { window.sessionStorage.setItem(`nexus_cam_verified_${token}`, email); } catch {}
    }
  }, [isAdmin, adminEmail, gate?.accessGranted, verifiedEmail, token]);

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
  async function loadContent(email: string) {
    setContentLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/cam-access/${token}/content?email=${encodeURIComponent(email)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          // Identity mismatch — clear verified state and show form
          setVerifiedEmail(null);
          setVerifyError(data.message || "Email verification failed.");
          try { window.sessionStorage.removeItem(`nexus_cam_verified_${token}`); } catch {}
          return;
        }
        throw new Error("Failed to load content");
      }
      const data: HandbookData = await res.json();
      setHandbook(data);
    } catch {
      setError("Failed to load document content. Please try again.");
    } finally {
      setContentLoading(false);
    }
  }

  // ── IP protection for content view
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

  // ── Referral submission ────────────────────────────────────────────
  const handleReferral = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!refName.trim() || !refEmail.trim()) return;
      setRefSubmitting(true);
      setRefResult(null);
      try {
        const res = await fetch(`${API_BASE}/cam-access/${token}/refer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientName: refName.trim(),
            recipientEmail: refEmail.trim(),
            message: refMessage.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setRefResult({ success: false, message: data.message || "Failed to send referral." });
        } else {
          setRefResult({ success: true, message: `Invitation sent to ${data.recipientEmail}!` });
          setRefName("");
          setRefEmail("");
          setRefMessage("");
        }
      } catch {
        setRefResult({ success: false, message: "Network error. Please try again." });
      } finally {
        setRefSubmitting(false);
      }
    },
    [token, refName, refEmail, refMessage],
  );

  // ── Identity verification submission ─────────────────────────────
  const handleVerifyIdentity = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const email = verifyInput.trim().toLowerCase();
      if (!email) return;
      setVerifying(true);
      setVerifyError(null);
      // Attempt to load content with this email — the API will reject if wrong
      setVerifiedEmail(email);
      try { window.sessionStorage.setItem(`nexus_cam_verified_${token}`, email); } catch {}
      setVerifying(false);
    },
    [token, verifyInput],
  );

  // ── Self-withdrawal submission ─────────────────────────────────────
  const handleWithdraw = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const email = withdrawEmail.trim().toLowerCase();
      if (!email) return;
      setWithdrawing(true);
      try {
        const res = await fetch(`${API_BASE}/cam-access/${token}/withdraw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || "Failed to withdraw. Please check your email and try again.");
          return;
        }
        setWithdrawn(true);
        setShowWithdraw(false);
        // Clear local storage
        try {
          window.sessionStorage.removeItem(`nexus_cam_verified_${token}`);
          window.localStorage.removeItem("nexus_cam_token");
        } catch {}
      } catch {
        alert("Network error. Please try again.");
      } finally {
        setWithdrawing(false);
      }
    },
    [token, withdrawEmail],
  );

  // ── Determine current step ────────────────────────────────────────
  const needsVerification = gate?.accessGranted && !verifiedEmail;
  const currentStep = !gate
    ? "loading"
    : !gate.cndaAccepted
      ? "cnda"
      : !gate.questionnaireCompleted
        ? "questionnaire"
        : needsVerification
          ? "verify"
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

  // ── Revoked state ─────────────────────────────────────────────────
  if (gate?.revoked || withdrawn) {
    const reason = withdrawn ? "self_withdrawal" : gate?.revokedReason;
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, maxWidth: 580, textAlign: "center" as const }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{reason === "self_withdrawal" ? "👋" : "🔒"}</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#0f172a" }}>
            {reason === "self_withdrawal" ? "Access Withdrawn" : "Access Revoked"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 20px" }}>
            {reason === "self_withdrawal"
              ? "You have successfully withdrawn your access to the Nexus CAM Library. Your data has been retained per the CNDA+ agreement terms."
              : "This access link has been revoked. If you believe this is an error, please contact the person who invited you."}
          </p>
          {gate?.inviterName && (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>Invited by: {gate.inviterName}</p>
          )}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e5e7eb", fontSize: 11, color: "#9ca3af" }}>
            Nexus Group LLC — Confidential
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* ── Admin overlay (SUPER_ADMIN only) ── */}
      {isAdmin && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#0f172a",
            padding: "6px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, color: "#fbbf24" }}>👁 ADMIN PREVIEW</span>
            <span style={{ color: "#94a3b8" }}>You are viewing this page as invitees see it</span>
            <span style={{ color: "#64748b" }}>·</span>
            <span style={{ color: "#64748b" }}>Step: <strong style={{ color: "#e2e8f0" }}>{currentStep}</strong></span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href="/system/cam-dashboard"
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                border: "none",
                background: "#059669",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              🏆 CAM Dashboard
            </a>
            <a
              href="/projects"
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                border: "1px solid #475569",
                background: "transparent",
                color: "#e2e8f0",
                fontSize: 11,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ← Home
            </a>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {["CNDA+", "Questionnaire", "Verify", "Document"].map((label, i) => {
          const stepIndex = i;
          const activeIndex = currentStep === "cnda" ? 0 : currentStep === "questionnaire" ? 1 : currentStep === "verify" ? 2 : 3;
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

      {/* ── Step 3: Identity Verification ────────────────────────── */}
      {currentStep === "verify" && (
        <div style={{ ...cardStyle, maxWidth: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Verify Your Identity</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              For your protection, please confirm the email address you used<br />when you signed the CNDA+ agreement.
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
                placeholder="The email you used for the CNDA+"
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

          <div style={{ marginTop: 20, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
              Can't remember your email?{" "}
              <a href="/cam-access" style={{ color: "#2563eb", textDecoration: "none" }}>Recover your access link</a>
            </p>
          </div>
        </div>
      )}

      {/* ── Step 4: Content ──────────────────────────────────────── */}
      {currentStep === "content" && !handbook && contentLoading && (
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            Loading CAM Library...
          </div>
        </div>
      )}

      {currentStep === "content" && handbook && (
        <ContentView
          handbook={handbook}
          token={token}
          isAdmin={isAdmin}
          onRefer={() => { setRefResult(null); setShowReferral(true); }}
          onWithdraw={() => { setWithdrawEmail(""); setShowWithdraw(true); }}
        />
      )}

      {/* ── Withdrawal Confirmation Modal ───────────────────── */}
      {showWithdraw && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowWithdraw(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#991b1b" }}>👋 Withdraw Access</h2>
              <button onClick={() => setShowWithdraw(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280", padding: 4 }}>✕</button>
            </div>

            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
              This will permanently revoke your access to the Nexus CAM Library.
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
              Your CNDA+ acceptance and questionnaire data will be retained per the agreement terms.
              To confirm, enter the email address you used when accepting the CNDA+.
            </p>

            <form onSubmit={handleWithdraw}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Your Email Address *</label>
                <input
                  type="email"
                  value={withdrawEmail}
                  onChange={(e) => setWithdrawEmail(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="jane@company.com"
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setShowWithdraw(false)} style={{ flex: 1, padding: "10px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button
                  type="submit"
                  disabled={!withdrawEmail.trim() || withdrawing}
                  style={{ flex: 2, padding: "10px 16px", borderRadius: 6, border: "none", background: withdrawing ? "#6b7280" : "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !withdrawEmail.trim() ? 0.5 : 1 }}
                >
                  {withdrawing ? "Withdrawing..." : "Confirm Withdrawal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Referral Modal ─────────────────────────────────────── */}
      {showReferral && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowReferral(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>🤝 Refer Someone</h2>
              <button onClick={() => setShowReferral(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280", padding: 4 }}>✕</button>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              Know someone who'd benefit from seeing the Nexus CAM Library? Send them an invitation.
              They'll go through the same CNDA+ and questionnaire process you completed.
            </p>

            {refResult && (
              <div style={{ padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, background: refResult.success ? "#ecfdf5" : "#fef2f2", color: refResult.success ? "#065f46" : "#991b1b", border: `1px solid ${refResult.success ? "#a7f3d0" : "#fecaca"}` }}>
                {refResult.success ? "✅" : "⚠"} {refResult.message}
              </div>
            )}

            <form onSubmit={handleReferral}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Their Name *</label>
                <input type="text" value={refName} onChange={(e) => setRefName(e.target.value)} required style={inputStyle} placeholder="Jane Smith" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Their Email *</label>
                <input type="email" value={refEmail} onChange={(e) => setRefEmail(e.target.value)} required style={inputStyle} placeholder="jane@company.com" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Personal Message (optional)</label>
                <textarea
                  value={refMessage}
                  onChange={(e) => setRefMessage(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Hey Jane, check out this platform — I think it'd be great for our workflow."
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setShowReferral(false)} style={{ flex: 1, padding: "10px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button
                  type="submit"
                  disabled={!refName.trim() || !refEmail.trim() || refSubmitting}
                  style={{ flex: 2, padding: "10px 16px", borderRadius: 6, border: "none", background: refSubmitting ? "#6b7280" : "#059669", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !refName.trim() || !refEmail.trim() ? 0.5 : 1 }}
                >
                  {refSubmitting ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  CONTENT VIEW — rich handbook layout                               */
/* ═══════════════════════════════════════════════════════════════════ */

function ContentView({ handbook, token, isAdmin, onRefer, onWithdraw }: { handbook: HandbookData; token: string; isAdmin: boolean; onRefer: () => void; onWithdraw: () => void }) {
  const isReturnVisit = handbook._shareContext.visitNumber > 1;
  const [bookmarkDismissed, setBookmarkDismissed] = useState(false);
  const allCams = handbook.modules.flatMap((m) => m.cams);
  const totalScore = handbook.overallAvgScore;

  // Tier distribution
  const eliteCount = allCams.filter((c) => c.scores.total >= 35).length;
  const strongCount = allCams.filter((c) => c.scores.total >= 30 && c.scores.total < 35).length;
  const qualifiedCount = allCams.filter((c) => c.scores.total >= 24 && c.scores.total < 30).length;

  // Average score dimensions
  const avgU = allCams.length ? +(allCams.reduce((s, c) => s + (c.scores.uniqueness || 0), 0) / allCams.length).toFixed(1) : 0;
  const avgV = allCams.length ? +(allCams.reduce((s, c) => s + (c.scores.value || 0), 0) / allCams.length).toFixed(1) : 0;
  const avgD = allCams.length ? +(allCams.reduce((s, c) => s + (c.scores.demonstrable || 0), 0) / allCams.length).toFixed(1) : 0;
  const avgDf = allCams.length ? +(allCams.reduce((s, c) => s + (c.scores.defensible || 0), 0) / allCams.length).toFixed(1) : 0;

  // Category counts
  const categoryCounts: Record<string, number> = {};
  allCams.forEach((c) => { categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1; });
  const maxCatCount = Math.max(...Object.values(categoryCounts), 1);

  // Overall tier
  const overallTierLabel = totalScore >= 35 ? "Elite" : totalScore >= 30 ? "Strong" : totalScore >= 24 ? "Qualified" : "—";
  const overallTierIcon = totalScore >= 35 ? "🏆" : totalScore >= 30 ? "⭐" : totalScore >= 24 ? "✅" : "";
  const overallTierColor = scoreColor(totalScore);

  // Ring
  const RING_C = 2 * Math.PI * 64;
  const ringFilled = (totalScore / 40) * RING_C;

  // Discussion: unread counts, subscriptions, and expanded section
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
  const [expandedDiscussion, setExpandedDiscussion] = useState<string | null>(null);
  const [previewCam, setPreviewCam] = useState<{ code: string; title: string; content: string } | null>(null);

  // CAM read statuses + favorites
  const [camStatuses, setCamStatuses] = useState<Record<string, { lastReadAt: string; isFavorite: boolean }>>({});

  useEffect(() => {
    fetch(`${API_BASE}/cam-access/${token}/discussions/unread-counts`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, number>) => setUnreadCounts(data))
      .catch(() => {});
    fetch(`${API_BASE}/cam-access/${token}/subscriptions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: string[]) => setSubscriptions(new Set(data)))
      .catch(() => {});
    fetch(`${API_BASE}/cam-access/${token}/discussions/cam-statuses`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CamReadStatusEntry[]) => {
        const map: Record<string, { lastReadAt: string; isFavorite: boolean }> = {};
        for (const s of data) map[s.camId] = { lastReadAt: s.lastReadAt, isFavorite: s.isFavorite };
        setCamStatuses(map);
      })
      .catch(() => {});
  }, [token]);

  // Mark a CAM as read (fire-and-forget, update local state immediately)
  const markCamRead = useCallback(
    (camId: string) => {
      const now = new Date().toISOString();
      setCamStatuses((prev) => ({
        ...prev,
        [camId]: { lastReadAt: now, isFavorite: prev[camId]?.isFavorite ?? false },
      }));
      fetch(`${API_BASE}/cam-access/${token}/discussions/cam-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camId }),
      }).catch(() => {});
    },
    [token],
  );

  // Toggle favorite
  const toggleFavorite = useCallback(
    (camId: string) => {
      const was = camStatuses[camId]?.isFavorite ?? false;
      setCamStatuses((prev) => ({
        ...prev,
        [camId]: { lastReadAt: prev[camId]?.lastReadAt ?? new Date().toISOString(), isFavorite: !was },
      }));
      fetch(`${API_BASE}/cam-access/${token}/discussions/cam-favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camId }),
      }).catch(() => {});
    },
    [camStatuses, token],
  );

  /**
   * Compute badge color for a CAM in the TOC.
   * Priority: favorite (gold) > updated (green) > new/unread (yellow) > read (none)
   */
  const camBadgeColor = useCallback(
    (camKey: string, camUpdatedAt?: string): { bg: string; border: string } | null => {
      const status = camStatuses[camKey];
      // Favorite = gold
      if (status?.isFavorite) return { bg: "#fef3c7", border: "#f59e0b" };
      // Never read = new = yellow
      if (!status) return { bg: "#fef9c3", border: "#eab308" };
      // Read but CAM updated since last read = green
      if (camUpdatedAt && status.lastReadAt) {
        const readDate = new Date(status.lastReadAt);
        const updDate = new Date(camUpdatedAt);
        if (updDate > readDate) return { bg: "#dcfce7", border: "#22c55e" };
      }
      // Read, no changes = default
      return null;
    },
    [camStatuses],
  );

  const toggleDiscussion = useCallback(
    (camSection: string) => {
      setExpandedDiscussion((prev) => {
        if (prev === camSection) return null;
        setUnreadCounts((counts) => ({ ...counts, [camSection]: 0 }));
        return camSection;
      });
    },
    [],
  );

  const toggleSubscription = useCallback(
    async (camSection: string) => {
      const wasSubscribed = subscriptions.has(camSection);
      setSubscriptions((prev) => {
        const next = new Set(prev);
        if (wasSubscribed) next.delete(camSection);
        else next.add(camSection);
        return next;
      });
      try {
        await fetch(`${API_BASE}/cam-access/${token}/subscriptions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ camSection, enabled: !wasSubscribed }),
        });
      } catch {
        setSubscriptions((prev) => {
          const next = new Set(prev);
          if (wasSubscribed) next.add(camSection);
          else next.delete(camSection);
          return next;
        });
      }
    },
    [subscriptions, token],
  );

  let sectionCounter = 0;

  return (
    <>
      {/* Print & CAM content styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .handbook-container { padding: 0 !important; max-width: 100% !important; }
          .cam-section { page-break-inside: avoid; }
          .chapter-header { page-break-before: always; }
          .chapter-header:first-of-type { page-break-before: avoid; }
          .toc-section { page-break-after: always; }
          body { font-size: 11pt; line-height: 1.5; }
        }
        .cam-content h1 { font-size: 20px; margin: 16px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .cam-content h2 { font-size: 17px; margin: 14px 0 6px; color: #1e293b; }
        .cam-content h3 { font-size: 14px; margin: 12px 0 4px; color: #334155; }
        .cam-content p { margin: 6px 0; line-height: 1.6; }
        .cam-content ul, .cam-content ol { margin: 6px 0; padding-left: 24px; }
        .cam-content li { margin: 3px 0; line-height: 1.5; }
        .cam-content pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 12px; }
        .cam-content code { font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
        .cam-content pre code { background: none; padding: 0; }
        .cam-content blockquote { border-left: 3px solid #3b82f6; margin: 8px 0; padding: 8px 16px; background: #f0f9ff; color: #1e40af; font-style: italic; }
        .cam-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
        .cam-content table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
        .cam-content th, .cam-content td { padding: 6px 10px; border: 1px solid #e5e7eb; text-align: left; }
        .cam-content th { background: #f9fafb; font-weight: 600; }
        .cam-content tr:nth-child(even) { background: #fafafa; }
      `}</style>

      <div className="handbook-container" style={{ maxWidth: 900, margin: "0 auto", padding: 0 }}>
        {/* ── Welcome back banner (return visits only) ── */}
        {isReturnVisit && (
          <div className="no-print" style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)", border: "1px solid #93c5fd", borderRadius: 8, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>👋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1e40af" }}>Welcome back{handbook._shareContext.recipientName ? `, ${handbook._shareContext.recipientName}` : ""}!</div>
              <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>This is visit #{handbook._shareContext.visitNumber}. Your access link never expires — bookmark this page to return anytime.</div>
            </div>
          </div>
        )}

        {/* ── Bookmark prompt (first content view only) ── */}
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
          <span>🔒 CONFIDENTIAL — Serial: <strong>{handbook._shareContext.serialNumber}</strong> | Shared by: {handbook._shareContext.inviterName} | Visit #{handbook._shareContext.visitNumber}</span>
          <span>{new Date(handbook._shareContext.accessedAt).toLocaleString()}</span>
        </div>

        {/* ── Title Page ── */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>NEXUS SYSTEM NCC</h1>
          <h2 style={{ fontSize: 18, fontWeight: 400, color: "#475569", margin: 0 }}>Competitive Advantage Manual (CAM)</h2>
          <div style={{ marginTop: 16, fontSize: 14, color: "#6b7280" }}>
            <strong>{handbook.totalCams}</strong> documented competitive advantages across <strong>{handbook.modules.length}</strong> module groups
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
            Prepared for: <strong>{handbook._shareContext.recipientName || handbook._shareContext.recipientEmail || "Invited Reviewer"}</strong>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "0 0 32px" }} />

        {/* ── Executive Summary ── */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: "#0f172a", textAlign: "center" }}>Executive Summary</h2>

          {/* Row 1: Score Ring + Module Strength */}
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start", marginBottom: 28 }}>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="64" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                <circle cx="80" cy="80" r="64" fill="none" stroke={overallTierColor} strokeWidth="12" strokeDasharray={`${ringFilled} ${RING_C - ringFilled}`} strokeLinecap="round" transform="rotate(-90 80 80)" />
                <text x="80" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="#0f172a">{totalScore.toFixed(1)}</text>
                <text x="80" y="88" textAnchor="middle" fontSize="12" fill="#6b7280">/40 avg</text>
                <text x="80" y="112" textAnchor="middle" fontSize="13" fontWeight="600" fill={overallTierColor}>{overallTierIcon} {overallTierLabel}</text>
              </svg>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Package Score</div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#0f172a" }}>Module Strength</div>
              {handbook.modules.map((mod) => {
                const pct = (mod.aggregateScore / 40) * 100;
                const barColor = scoreColor(mod.aggregateScore);
                return (
                  <div key={mod.mode} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 24, textAlign: "center", fontSize: 16 }}>{MODE_ICONS[mod.mode] || "📦"}</span>
                    <span style={{ width: 100, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mod.modeLabel}</span>
                    <div style={{ flex: 1, height: 16, background: "#f3f4f6", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 8 }} />
                    </div>
                    <span style={{ width: 48, textAlign: "right", fontSize: 12, fontWeight: 600, color: barColor }}>{mod.aggregateScore}/40</span>
                    <span style={{ width: 28, fontSize: 11, color: "#6b7280", textAlign: "right" }}>({mod.camCount})</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 2: Tier Distribution */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 28 }}>
            {[
              { label: "Elite", icon: "🏆", count: eliteCount, range: "35–40", color: "#059669", bg: "#ecfdf5" },
              { label: "Strong", icon: "⭐", count: strongCount, range: "30–34", color: "#0284c7", bg: "#f0f9ff" },
              { label: "Qualified", icon: "✅", count: qualifiedCount, range: "24–29", color: "#b45309", bg: "#fffbeb" },
            ].map((tier) => (
              <div key={tier.label} style={{ textAlign: "center", padding: "14px 28px", borderRadius: 10, background: tier.bg, border: `1px solid ${tier.color}22`, minWidth: 140 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: tier.color }}>{tier.count}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: tier.color }}>{tier.icon} {tier.label}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>score {tier.range}</div>
              </div>
            ))}
          </div>

          {/* Row 3: Radar + Category Coverage */}
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Score Dimensions</div>
              <svg width="200" height="200" viewBox="0 0 200 200">
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <polygon key={p} points={`100,${100 - 80 * p} ${100 + 80 * p},100 100,${100 + 80 * p} ${100 - 80 * p},100`} fill="none" stroke="#e5e7eb" strokeWidth="0.75" />
                ))}
                <line x1="100" y1="20" x2="100" y2="180" stroke="#e5e7eb" strokeWidth="0.5" />
                <line x1="20" y1="100" x2="180" y2="100" stroke="#e5e7eb" strokeWidth="0.5" />
                <polygon points={`100,${100 - avgU * 8} ${100 + avgV * 8},100 100,${100 + avgD * 8} ${100 - avgDf * 8},100`} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth="2" />
                <circle cx={100} cy={100 - avgU * 8} r="4" fill="#2563eb" />
                <circle cx={100 + avgV * 8} cy={100} r="4" fill="#2563eb" />
                <circle cx={100} cy={100 + avgD * 8} r="4" fill="#2563eb" />
                <circle cx={100 - avgDf * 8} cy={100} r="4" fill="#2563eb" />
                <text x="100" y="12" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">U {avgU}</text>
                <text x="192" y="104" textAnchor="end" fontSize="11" fontWeight="600" fill="#0f172a">V {avgV}</text>
                <text x="100" y="198" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">D {avgD}</text>
                <text x="8" y="104" textAnchor="start" fontSize="11" fontWeight="600" fill="#0f172a">Df {avgDf}</text>
              </svg>
              <div style={{ fontSize: 10, color: "#6b7280" }}>Avg across {allCams.length} CAMs (max 10/axis)</div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#0f172a" }}>Category Coverage</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {Object.entries(CATEGORY_LABELS)
                  .filter(([key]) => (categoryCounts[key] || 0) > 0)
                  .sort((a, b) => (categoryCounts[b[0]] || 0) - (categoryCounts[a[0]] || 0))
                  .map(([key, label]) => {
                    const count = categoryCounts[key] || 0;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: "#f9fafb", border: "1px solid #f3f4f6" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#1e293b" }}>{label}</div>
                          <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginTop: 4 }}>
                            <div style={{ width: `${(count / maxCatCount) * 100}%`, height: "100%", background: "#2563eb", borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", minWidth: 24, textAlign: "right" }}>{count}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Score Guide ── */}
        <div style={{ marginBottom: 32, padding: 20, background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#0c4a6e" }}>📖 Score Guide</h3>
          <div style={{ fontSize: 13, color: "#0369a1", lineHeight: 1.8 }}>
            Each CAM is scored on four criteria (1–10 each, max 40):<br />
            <strong>U</strong> = Uniqueness · <strong>V</strong> = Value · <strong>D</strong> = Demonstrable · <strong>Df</strong> = Defensible
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#0369a1" }}>
            <strong>Tiers:</strong> 🏆 Elite (35–40) · ⭐ Strong (30–34) · ✅ Qualified (24–29)
          </div>
        </div>

        {/* ── General Discussion (manual-level) ── */}
        <DiscussionPanel token={token} camSection={undefined} isAdmin={isAdmin} generalLabel="📖 General Discussion" />

        {/* ── Table of Contents ── */}
        <div className="toc-section">
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#0f172a" }}>Table of Contents</h2>
          {handbook.modules.map((mod) => {
            const icon = MODE_ICONS[mod.mode] || "📦";
            return (
              <div key={mod.mode} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{mod.modeLabel}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>({mod.camCount} CAM{mod.camCount !== 1 ? "s" : ""} · avg {mod.aggregateScore}/40)</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginLeft: 28 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th className="no-print" style={{ width: 32, padding: "4px 4px" }} />
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#6b7280" }}>CAM ID</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#6b7280" }}>Title</th>
                      <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 600, color: "#6b7280", width: 50 }}>Score</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#6b7280", width: 80 }}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mod.cams.map((cam) => {
                      const camKey = cam.camId || cam.code;
                      const camUnread = unreadCounts[camKey] || 0;
                      const isOpen = expandedDiscussion === camKey;
                      const badge = camBadgeColor(camKey, cam.updatedAt);
                      return (
                        <Fragment key={cam.code}>
                          <tr style={{ borderBottom: isOpen ? "none" : "1px solid #f3f4f6", background: isOpen ? "#f0f9ff" : undefined }}>
                            <td className="no-print" style={{ padding: "4px 4px", textAlign: "center", verticalAlign: "middle" }}>
                              <button
                                onClick={() => toggleDiscussion(camKey)}
                                title={isOpen ? "Collapse discussion" : `Discussion${camUnread > 0 ? ` (${camUnread} new)` : ""}`}
                                style={{
                                  position: "relative",
                                  background: isOpen ? "#dbeafe" : badge ? badge.bg : "none",
                                  border: isOpen ? "1px solid #93c5fd" : badge ? `1px solid ${badge.border}` : "1px solid transparent",
                                  borderRadius: 4,
                                  padding: "2px 5px",
                                  cursor: "pointer",
                                  fontSize: 13,
                                  lineHeight: 1,
                                }}
                              >
                                {"\uD83D\uDCAC"}
                                {camUnread > 0 && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      top: -5,
                                      right: -7,
                                      background: "#ef4444",
                                      color: "#fff",
                                      fontSize: 8,
                                      fontWeight: 700,
                                      borderRadius: 999,
                                      minWidth: 14,
                                      height: 14,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: "0 3px",
                                      lineHeight: 1,
                                    }}
                                  >
                                    {camUnread}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11 }}>
                              <a
                                href={`#cam-${cam.code}`}
                                style={{ color: "#2563eb", textDecoration: "none" }}
                                onClick={() => markCamRead(camKey)}
                              >{camKey}</a>
                            </td>
                            <td style={{ padding: "4px 8px" }}>{cam.title}</td>
                            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600, color: scoreColor(cam.scores.total) }}>{cam.scores.total}</td>
                            <td style={{ padding: "4px 8px", fontSize: 11 }}>{CATEGORY_LABELS[cam.category] || cam.category}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={5} style={{ padding: 0 }}>
                                <div style={{ padding: "10px 16px 14px", background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                                  {/* Toolbar */}
                                  <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <button
                                      onClick={() => { setPreviewCam({ code: camKey, title: cam.title, content: cam.htmlContent || cam.htmlBody || "" }); markCamRead(camKey); }}
                                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 11, cursor: "pointer", color: "#374151", fontWeight: 500 }}
                                    >
                                      📱 View CAM
                                    </button>
                                    <button
                                      onClick={() => toggleFavorite(camKey)}
                                      style={{
                                        display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 6,
                                        border: camStatuses[camKey]?.isFavorite ? "1px solid #f59e0b" : "1px solid #d1d5db",
                                        background: camStatuses[camKey]?.isFavorite ? "#fef3c7" : "#fff",
                                        fontSize: 11, cursor: "pointer",
                                        color: camStatuses[camKey]?.isFavorite ? "#92400e" : "#6b7280",
                                        fontWeight: camStatuses[camKey]?.isFavorite ? 600 : 500,
                                      }}
                                    >
                                      {camStatuses[camKey]?.isFavorite ? "⭐ Favorited" : "☆ Favorite"}
                                    </button>
                                    <button
                                      onClick={() => toggleSubscription(camKey)}
                                      style={{
                                        display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 6,
                                        border: "1px solid #d1d5db",
                                        background: subscriptions.has(camKey) ? "#eff6ff" : "#fff",
                                        fontSize: 11, cursor: "pointer",
                                        color: subscriptions.has(camKey) ? "#1d4ed8" : "#6b7280",
                                        fontWeight: subscriptions.has(camKey) ? 600 : 500,
                                      }}
                                    >
                                      {subscriptions.has(camKey) ? "\uD83D\uDD14 Subscribed" : "\uD83D\uDD15 Notify me"}
                                    </button>
                                    <div style={{ flex: 1 }} />
                                    <button
                                      onClick={() => setExpandedDiscussion(null)}
                                      style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#9ca3af", padding: "2px 6px" }}
                                      title="Close discussion"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <DiscussionPanel
                                    token={token}
                                    camSection={camKey}
                                    isAdmin={isAdmin}
                                    externalExpanded={true}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* ── Full CAM Documents ── */}
        {handbook.modules.map((mod, modIdx) => {
          const icon = MODE_ICONS[mod.mode] || "📦";
          return (
            <div key={mod.mode}>
              <div className="chapter-header" style={{ marginTop: modIdx === 0 ? 0 : 32, marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 24 }}>{icon}</span>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{mod.modeLabel}</h2>
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginLeft: 34 }}>
                  {mod.camCount} CAM{mod.camCount !== 1 ? "s" : ""} · avg score {mod.aggregateScore}/40
                </div>
                <hr style={{ border: "none", borderTop: "2px solid #e5e7eb", margin: "12px 0 0" }} />
              </div>

              {mod.cams.map((cam) => {
                sectionCounter++;
                const content = cam.htmlContent || cam.htmlBody || "";
                const camKey = cam.camId || cam.code;
                return (
                  <div key={cam.code} id={`cam-${cam.code}`} className="cam-section" style={{ marginBottom: 40 }}>
                    <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", marginBottom: 2 }}>Section {sectionCounter} · {camKey}</div>
                          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1e293b" }}>{cam.title}</h3>
                        </div>
                        <div style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: scoreColor(cam.scores.total), border: `1px solid ${scoreColor(cam.scores.total)}`, whiteSpace: "nowrap" }}>
                          {cam.scores.total}/40 {scoreTier(cam.scores.total)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        U:{cam.scores.uniqueness || 0} · V:{cam.scores.value || 0} · D:{cam.scores.demonstrable || 0} · Df:{cam.scores.defensible || 0}
                        {" · "}{CATEGORY_LABELS[cam.category] || cam.category}
                      </div>
                    </div>
                    {content && (
                      <div className="cam-content" style={{ fontSize: 14, lineHeight: 1.6, color: "#1e293b" }} dangerouslySetInnerHTML={{ __html: sanitize(content) }} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* ── Refer CTA Banner ── */}
        <div className="no-print" style={{ margin: "48px 0 0", padding: "24px 28px", background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)", borderRadius: 10, border: "1px solid #a7f3d0", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
          <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#065f46" }}>Know someone who should see this?</h3>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#047857", lineHeight: 1.5 }}>
            If you know a contractor, project manager, or business owner who could benefit from Nexus,<br />
            send them a personal invitation. They'll get their own secure access link.
          </p>
          <button
            onClick={onRefer}
            style={{ padding: "12px 32px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(5,150,105,0.3)" }}
          >
            Refer Someone →
          </button>
        </div>

        {/* ── Footer ── */}
        <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "48px 0 16px" }} />
        <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", userSelect: "none", paddingBottom: 16 }}>
          CONFIDENTIAL — Nexus Group LLC — Serial: {handbook._shareContext.serialNumber}<br />
          This document is protected under the CNDA+ agreement. Unauthorized distribution is prohibited.<br />
          {handbook.totalCams} CAMs · {handbook.modules.length} Module Groups · {new Date(handbook._shareContext.accessedAt).toLocaleDateString()}
        </div>
        <div className="no-print" style={{ textAlign: "center", paddingBottom: 40 }}>
          <button
            onClick={onWithdraw}
            style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: "4px 8px" }}
          >
            I’d like to withdraw my access
          </button>
        </div>
      </div>

      {/* ── Floating Refer Button ── */}
      <button
        className="no-print"
        onClick={onRefer}
        style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", borderRadius: 999, border: "none", background: "#059669", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 8, zIndex: 100 }}
        title="Refer someone to the CAM Library"
      >
        🤝 Refer Someone
      </button>
      {previewCam && <CamPhonePreview cam={previewCam} onClose={() => setPreviewCam(null)} />}

      {/* ── Floating Legend ── */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: "50%",
          left: 24,
          transform: "translateY(-50%)",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "10px 14px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          fontSize: 11,
          color: "#374151",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          lineHeight: 1,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Legend</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: "#fef9c3", border: "1px solid #eab308" }} />
          New CAM
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: "#f3f4f6", border: "1px solid #d1d5db" }} />
          Read
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: "#dcfce7", border: "1px solid #22c55e" }} />
          Updated
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: "#fef3c7", border: "1px solid #f59e0b" }} />
          Favorite
        </div>
      </div>
    </>
  );
}

// ─── Discussion Panel Component ─────────────────────────────────────────────────────────

interface DiscThread {
  id: string;
  title: string;
  camSection: string | null;
  isPinned: boolean;
  isFaq: boolean;
  messageCount: number;
  createdBy: { id: string; name: string };
  lastMessage: { preview: string; authorName: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface DiscMessage {
  id: string;
  body: string;
  isSystemMessage: boolean;
  author: { id: string; name: string };
  createdAt: string;
}

function DiscussionPanel({
  token,
  camSection,
  isAdmin,
  generalLabel,
  externalExpanded,
  onClose,
  isSubscribed,
  onToggleSubscription,
}: {
  token: string;
  camSection: string | undefined;
  isAdmin: boolean;
  generalLabel?: string;
  externalExpanded?: boolean;
  onClose?: () => void;
  isSubscribed?: boolean;
  onToggleSubscription?: () => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [threads, setThreads] = useState<DiscThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Determine control mode
  const isExternallyControlled = externalExpanded !== undefined;
  const expanded = isExternallyControlled ? externalExpanded : internalExpanded;

  // Active thread view
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<DiscMessage[]>([]);
  const [threadMuted, setThreadMuted] = useState(false);
  const [msgsLoading, setMsgsLoading] = useState(false);

  // New thread form
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  // Reply
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);

  // Move (admin)
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);

  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const loadThreads = async () => {
    setLoading(true);
    try {
      const qs = camSection ? `?camSection=${encodeURIComponent(camSection)}` : "";
      const res = await fetch(`${base}/cam-access/${token}/discussions${qs}`);
      if (res.ok) {
        setThreads(await res.json());
        setLoaded(true);
      }
    } catch {}
    setLoading(false);
  };

  // Auto-load threads when externally expanded
  useEffect(() => {
    if (isExternallyControlled && externalExpanded && !loaded) {
      loadThreads();
    }
  }, [externalExpanded]);

  const handleExpand = () => {
    if (isExternallyControlled) {
      if (expanded && onClose) onClose();
      return;
    }
    if (!internalExpanded && !loaded) loadThreads();
    setInternalExpanded(!internalExpanded);
  };

  const loadThread = async (threadId: string) => {
    setActiveThread(threadId);
    setMsgsLoading(true);
    try {
      const res = await fetch(`${base}/cam-access/${token}/discussions/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setThreadMuted(data.muted);
      }
    } catch {}
    setMsgsLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBody.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${base}/cam-access/${token}/discussions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim(), camSection }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewBody("");
        setShowNew(false);
        loadThreads();
      }
    } catch {}
    setCreating(false);
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !activeThread) return;
    setReplying(true);
    try {
      const res = await fetch(
        `${base}/cam-access/${token}/discussions/${activeThread}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: replyBody.trim() }),
        },
      );
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setReplyBody("");
      }
    } catch {}
    setReplying(false);
  };

  const handleMute = async () => {
    if (!activeThread) return;
    try {
      const res = await fetch(
        `${base}/cam-access/${token}/discussions/${activeThread}/mute`,
        { method: "POST" },
      );
      if (res.ok) {
        const data = await res.json();
        setThreadMuted(data.muted);
      }
    } catch {}
  };

  const handleMove = async (threadId: string) => {
    if (!moveTarget.trim()) return;
    setMoving(true);
    try {
      const accessToken = window.localStorage.getItem("accessToken");
      const res = await fetch(
        `${base}/cam-access/admin/discussions/${threadId}/move`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ newCamSection: moveTarget.trim() }),
        },
      );
      if (res.ok) {
        setMoveTarget("");
        setActiveThread(null);
        loadThreads();
      }
    } catch {}
    setMoving(false);
  };

  const handleAdminAction = async (threadId: string, action: "pin" | "faq" | "delete") => {
    const accessToken = window.localStorage.getItem("accessToken");
    const method = action === "delete" ? "DELETE" : "POST";
    try {
      await fetch(
        `${base}/cam-access/admin/discussions/${threadId}/${action === "delete" ? "" : action}`.replace(/\/$/, ""),
        {
          method,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        },
      );
      if (action === "delete") setActiveThread(null);
      loadThreads();
    } catch {}
  };

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const label = generalLabel ?? `\uD83D\uDCAC Discussion`;

  // When externally controlled and not expanded, render nothing
  if (isExternallyControlled && !expanded) return null;

  return (
    <div
      className="no-print"
      id={camSection ? `discussion-${camSection}` : "discussion-general"}
      style={{ marginTop: 12, marginBottom: 8, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa" }}
    >
      {/* Header */}
      {isExternallyControlled ? (
        <div
          style={{
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            {"\uD83D\uDCAC"} Discussion {loaded && threads.length > 0 ? `(${threads.length})` : ""}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onToggleSubscription && (
              <button
                onClick={onToggleSubscription}
                title={isSubscribed ? "Unsubscribe from notifications" : "Get notified of new discussions"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  background: isSubscribed ? "#eff6ff" : "#fff",
                  fontSize: 11,
                  cursor: "pointer",
                  color: isSubscribed ? "#1d4ed8" : "#6b7280",
                  fontWeight: isSubscribed ? 600 : 400,
                }}
              >
                {isSubscribed ? "\uD83D\uDD14" : "\uD83D\uDD15"} {isSubscribed ? "Subscribed" : "Notify me"}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#9ca3af", padding: "2px 4px" }}
                title="Close discussion"
              >
                {"\u2715"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={handleExpand}
          style={{
            width: "100%",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "#374151",
          }}
        >
          <span>{label} {loaded && threads.length > 0 ? `(${threads.length})` : ""}</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{expanded ? "▲" : "▼"}</span>
        </button>
      )}

      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          {loading && <div style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Loading...</div>}

          {/* Thread list */}
          {!activeThread && !loading && (
            <>
              {threads.length === 0 && loaded && (
                <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
                  No discussions yet. Be the first to start one!
                </div>
              )}
              {threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => loadThread(t.id)}
                  style={{
                    padding: "10px 12px",
                    marginBottom: 6,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                      {t.isPinned ? "\uD83D\uDCCC " : ""}{t.isFaq ? "\u2753 " : ""}{t.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{t.messageCount} msg{t.messageCount !== 1 ? "s" : ""}</div>
                  </div>
                  {t.lastMessage && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                      {t.lastMessage.authorName}: {t.lastMessage.preview.slice(0, 100)}{t.lastMessage.preview.length > 100 ? "..." : ""}
                      {" \u00B7 "}{timeAgo(t.lastMessage.createdAt)}
                    </div>
                  )}
                </div>
              ))}

              {/* New thread form */}
              {showNew ? (
                <div style={{ marginTop: 8, padding: 12, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6 }}>
                  <input
                    type="text"
                    placeholder="Discussion title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                  />
                  <textarea
                    placeholder="Your message..."
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    rows={3}
                    style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      onClick={handleCreate}
                      disabled={!newTitle.trim() || !newBody.trim() || creating}
                      style={{ padding: "6px 14px", borderRadius: 4, border: "none", background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !newTitle.trim() || !newBody.trim() ? 0.5 : 1 }}
                    >
                      {creating ? "Posting..." : "Post"}
                    </button>
                    <button onClick={() => { setShowNew(false); setNewTitle(""); setNewBody(""); }} style={{ padding: "6px 14px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNew(true)}
                  style={{ marginTop: 8, padding: "6px 14px", borderRadius: 4, border: "1px dashed #9ca3af", background: "none", fontSize: 12, color: "#6b7280", cursor: "pointer" }}
                >
                  + Start a Discussion
                </button>
              )}
            </>
          )}

          {/* Thread detail */}
          {activeThread && (
            <div>
              <button
                onClick={() => { setActiveThread(null); setMessages([]); }}
                style={{ background: "none", border: "none", fontSize: 12, color: "#2563eb", cursor: "pointer", padding: 0, marginBottom: 8 }}
              >
                \u2190 Back to threads
              </button>

              {/* Controls bar */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                <button
                  onClick={handleMute}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: threadMuted ? "#fef3c7" : "#fff", fontSize: 11, cursor: "pointer", color: threadMuted ? "#92400e" : "#374151" }}
                >
                  {threadMuted ? "\uD83D\uDD15 Muted" : "\uD83D\uDD14 Notifications On"}
                </button>
                {isAdmin && (
                  <>
                    <button onClick={() => handleAdminAction(activeThread, "pin")} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", fontSize: 11, cursor: "pointer" }}>\uD83D\uDCCC Pin</button>
                    <button onClick={() => handleAdminAction(activeThread, "faq")} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", fontSize: 11, cursor: "pointer" }}>\u2753 FAQ</button>
                    <button onClick={() => handleAdminAction(activeThread, "delete")} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontSize: 11, cursor: "pointer" }}>\uD83D\uDDD1 Delete</button>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        type="text"
                        placeholder="Move to CAM ID..."
                        value={moveTarget}
                        onChange={(e) => setMoveTarget(e.target.value)}
                        style={{ padding: "3px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11, width: 130 }}
                      />
                      <button
                        onClick={() => handleMove(activeThread)}
                        disabled={!moveTarget.trim() || moving}
                        style={{ padding: "4px 10px", borderRadius: 4, border: "none", background: "#2563eb", color: "#fff", fontSize: 11, cursor: "pointer", opacity: !moveTarget.trim() ? 0.5 : 1 }}
                      >
                        {moving ? "..." : "Move"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Messages */}
              {msgsLoading && <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading messages...</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: "8px 12px",
                      background: m.isSystemMessage ? "#f0f9ff" : "#fff",
                      border: `1px solid ${m.isSystemMessage ? "#bae6fd" : "#e5e7eb"}`,
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    {m.isSystemMessage ? (
                      <div style={{ color: "#0369a1", fontStyle: "italic" }}>{m.body}</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: "#0f172a" }}>{m.author.name}</span>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(m.createdAt)}</span>
                        </div>
                        <div style={{ color: "#374151", whiteSpace: "pre-wrap" }}>{m.body}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Reply box */}
              <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                <textarea
                  placeholder="Write a reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={2}
                  style={{ flex: 1, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, resize: "vertical" }}
                />
                <button
                  onClick={handleReply}
                  disabled={!replyBody.trim() || replying}
                  style={{ alignSelf: "flex-end", padding: "6px 14px", borderRadius: 4, border: "none", background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !replyBody.trim() ? 0.5 : 1 }}
                >
                  {replying ? "..." : "Reply"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── iPhone-Style CAM Preview Window ────────────────────────────────────────────────────

function CamPhonePreview({
  cam,
  onClose,
}: {
  cam: { code: string; title: string; content: string };
  onClose: () => void;
}) {
  const MIN_W = 280;
  const MIN_H = 400;
  const [pos, setPos] = useState(() => ({
    x: typeof window !== "undefined" ? Math.max(window.innerWidth - 420, 20) : 100,
    y: 16,
  }));
  const [size, setSize] = useState(() => ({ w: 375, h: typeof window !== "undefined" ? window.innerHeight - 32 : 680 }));
  const dragRef = useRef<{ active: boolean; ox: number; oy: number }>({ active: false, ox: 0, oy: 0 });
  const resizeRef = useRef<{ active: boolean; edge: string; startX: number; startY: number; startW: number; startH: number; startPosX: number; startPosY: number }>({ active: false, edge: "", startX: 0, startY: 0, startW: 0, startH: 0, startPosX: 0, startPosY: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizeRef.current.active) {
        e.preventDefault();
        const r = resizeRef.current;
        const dx = e.clientX - r.startX;
        const dy = e.clientY - r.startY;
        let newW = r.startW;
        let newH = r.startH;
        let newX = r.startPosX;
        let newY = r.startPosY;
        if (r.edge.includes("r")) newW = Math.max(MIN_W, r.startW + dx);
        if (r.edge.includes("b")) newH = Math.max(MIN_H, r.startH + dy);
        if (r.edge.includes("l")) { newW = Math.max(MIN_W, r.startW - dx); newX = r.startPosX + (r.startW - newW); }
        if (r.edge.includes("t")) { newH = Math.max(MIN_H, r.startH - dy); newY = r.startPosY + (r.startH - newH); }
        setSize({ w: newW, h: newH });
        setPos({ x: newX, y: newY });
        return;
      }
      if (!dragRef.current.active) return;
      e.preventDefault();
      setPos({ x: e.clientX - dragRef.current.ox, y: e.clientY - dragRef.current.oy });
    };
    const onUp = () => { dragRef.current.active = false; resizeRef.current.active = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onGrab = (e: React.MouseEvent) => {
    dragRef.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y };
  };

  const onResizeStart = (edge: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeRef.current = { active: true, edge, startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h, startPosX: pos.x, startPosY: pos.y };
  };

  // Cursor for each edge/corner
  const edgeCursor: Record<string, string> = { t: "ns-resize", b: "ns-resize", l: "ew-resize", r: "ew-resize", tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize" };

  // Scale border-radius proportionally (44px at 375w)
  const radius = Math.round(44 * (size.w / 375));

  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // Resize handle positions
  const HANDLE = 10;
  const handleBase: React.CSSProperties = { position: "absolute", zIndex: 10000 };
  const handles: { edge: string; style: React.CSSProperties }[] = [
    { edge: "t",  style: { ...handleBase, top: 0, left: HANDLE, right: HANDLE, height: HANDLE, cursor: edgeCursor.t } },
    { edge: "b",  style: { ...handleBase, bottom: 0, left: HANDLE, right: HANDLE, height: HANDLE, cursor: edgeCursor.b } },
    { edge: "l",  style: { ...handleBase, left: 0, top: HANDLE, bottom: HANDLE, width: HANDLE, cursor: edgeCursor.l } },
    { edge: "r",  style: { ...handleBase, right: 0, top: HANDLE, bottom: HANDLE, width: HANDLE, cursor: edgeCursor.r } },
    { edge: "tl", style: { ...handleBase, top: 0, left: 0, width: HANDLE * 2, height: HANDLE * 2, cursor: edgeCursor.tl } },
    { edge: "tr", style: { ...handleBase, top: 0, right: 0, width: HANDLE * 2, height: HANDLE * 2, cursor: edgeCursor.tr } },
    { edge: "bl", style: { ...handleBase, bottom: 0, left: 0, width: HANDLE * 2, height: HANDLE * 2, cursor: edgeCursor.bl } },
    { edge: "br", style: { ...handleBase, bottom: 0, right: 0, width: HANDLE * 2, height: HANDLE * 2, cursor: edgeCursor.br } },
  ];

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: size.w,
        height: size.h,
        background: "#000",
        borderRadius: radius,
        boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 0 3px #333",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Resize handles (invisible, on top of everything) */}
      {handles.map((h) => (
        <div key={h.edge} onMouseDown={onResizeStart(h.edge)} style={h.style} />
      ))}
      {/* Top bezel — Dynamic Island */}
      <div
        onMouseDown={onGrab}
        style={{
          height: 54,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          position: "relative",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <div style={{
          width: 126,
          height: 32,
          background: "#1a1a1a",
          borderRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: "#333", border: "1px solid #444" }} />
        </div>
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            right: 14,
            top: 14,
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "#fff",
            fontSize: 13,
            width: 26,
            height: 26,
            borderRadius: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Status bar */}
      <div style={{
        height: 18,
        background: "#fff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 24px",
        fontSize: 11,
        fontWeight: 600,
        color: "#000",
        flexShrink: 0,
      }}>
        <span>{time}</span>
        <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
          {"📶"}{" "}{"🔋"}
        </span>
      </div>

      {/* Title bar */}
      <div style={{
        padding: "8px 16px",
        background: "#f8fafc",
        borderBottom: "1px solid #e5e7eb",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, fontFamily: "monospace", color: "#6b7280" }}>{cam.code}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cam.title}</div>
      </div>

      {/* Scrollable CAM content */}
      <div
        className="cam-content"
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          padding: "12px 16px",
          fontSize: 12,
          lineHeight: 1.5,
          color: "#1e293b",
        }}
        dangerouslySetInnerHTML={{ __html: sanitize(cam.content) }}
      />

      {/* Home indicator */}
      <div style={{
        height: 28,
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{
          width: Math.min(134, size.w * 0.36),
          height: 5,
          background: "#1a1a1a",
          borderRadius: 3,
        }} />
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────────────

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
