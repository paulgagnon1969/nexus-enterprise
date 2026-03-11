"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ─── Types (mirrors API response) ────────────────────────────────────────────

interface NexfitOption {
  value: string;
  label: string;
  icon?: string;
  modules?: string[];
  weight?: number;
}

interface NexfitQuestion {
  id: string;
  step: number;
  title: string;
  subtitle?: string;
  type: "single" | "multi" | "revenue";
  options?: NexfitOption[];
  required: boolean;
}

interface ModuleRecommendation {
  moduleCode: string;
  label: string;
  description: string;
  tier: "essential" | "discovery" | "growth";
  monthlyPrice: number;
  pricingModel: "MONTHLY" | "PER_PROJECT" | "PER_USE";
  projectUnlockPrice?: number;
  nexopPercent: number;
  annualRecovery: number;
  monthlyRecovery: number;
  roiMultiple: number;
  relevanceScore: number;
  reason: string;
  relatedCams: string[];
  isInferred: boolean;
}

interface NexfitReport {
  profile: {
    role: string;
    trade: string;
    companySize: string;
    annualRevenue: number;
  };
  recommendations: ModuleRecommendation[];
  totalMonthlyInvestment: number;
  totalAnnualRecovery: number;
  overallRoiMultiple: number;
  essentialCount: number;
  discoveryCount: number;
  growthCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

const TIER_META: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: string; tagline: string }
> = {
  essential: {
    label: "Essential",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#6ee7b7",
    icon: "★",
    tagline: "You asked for these — they directly solve your stated needs.",
  },
  discovery: {
    label: "Discovery",
    color: "#1e40af",
    bg: "#eff6ff",
    border: "#93c5fd",
    icon: "◆",
    tagline: "You didn't ask for these — but your profile says you need them.",
  },
  growth: {
    label: "Growth",
    color: "#7c2d12",
    bg: "#fff7ed",
    border: "#fdba74",
    icon: "▲",
    tagline: "Aspirational modules that compound value as you scale.",
  },
};

// Revenue slider stops (log scale for better UX)
const REVENUE_STOPS = [
  250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000,
  5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000,
  50_000_000,
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function NexfitPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "#6b7280" }}>Loading...</div>}>
      <NexfitPageInner />
    </Suspense>
  );
}

function NexfitPageInner() {
  // Wizard state
  const [questions, setQuestions] = useState<NexfitQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [report, setReport] = useState<NexfitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [, startTransition] = useTransition();

  // Lead capture
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);

  // Share flow (CLT-COLLAB-0003)
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareName, setShareName] = useState("");
  const [shareResult, setShareResult] = useState<{ shareUrl: string } | null>(null);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Lightweight registration
  const [showRegister, setShowRegister] = useState(false);
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regMarketplace, setRegMarketplace] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Bookmark prompt
  const [showBookmarkHint, setShowBookmarkHint] = useState(false);

  // Marketplace opt-in dialog (CLT-COLLAB-0003 Tier 2)
  const [showMarketplaceDialog, setShowMarketplaceDialog] = useState(false);
  const [marketplacePromptCount, setMarketplacePromptCount] = useState(0);
  const isViewer = typeof window !== "undefined" && localStorage.getItem("userType") === "VIEWER";
  const alreadyOptedIn = typeof window !== "undefined" && localStorage.getItem("marketplaceOptedIn") === "1";

  // Show marketplace dialog for returning VIEWER users (max 3 times)
  useEffect(() => {
    if (!isLoggedIn || !isViewer || alreadyOptedIn) return;
    const count = parseInt(localStorage.getItem("nexusMarketplacePromptCount") || "0", 10);
    setMarketplacePromptCount(count);
    if (count < 3) {
      // Short delay so it doesn't flash immediately on page load
      const timer = setTimeout(() => setShowMarketplaceDialog(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn, isViewer, alreadyOptedIn]);

  const dismissMarketplaceDialog = useCallback(() => {
    const newCount = marketplacePromptCount + 1;
    localStorage.setItem("nexusMarketplacePromptCount", String(newCount));
    setMarketplacePromptCount(newCount);
    setShowMarketplaceDialog(false);
  }, [marketplacePromptCount]);

  const handleMarketplaceOptIn = useCallback(() => {
    localStorage.setItem("marketplaceOptedIn", "1");
    setShowMarketplaceDialog(false);
    // TODO: POST to API to set marketplaceOptIn=true on the user record
  }, []);

  // Token validation — log view when arriving via shared link
  useEffect(() => {
    if (!urlToken) return;
    (async () => {
      try {
        await fetch(`${API_BASE}/nexfit/view/${urlToken}`);
      } catch {
        // Non-fatal — shared link still works even if logging fails
      }
    })();
  }, [urlToken]);

  // Check if user is already logged in (JWT in localStorage)
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) setIsLoggedIn(true);
  }, []);

  // Show bookmark hint after 5 seconds on results page
  useEffect(() => {
    if (!report) return;
    const dismissed = localStorage.getItem("nexusBookmarkHintDismissed");
    if (dismissed) return;
    const timer = setTimeout(() => setShowBookmarkHint(true), 5000);
    return () => clearTimeout(timer);
  }, [report]);

  const dismissBookmarkHint = useCallback(() => {
    setShowBookmarkHint(false);
    localStorage.setItem("nexusBookmarkHintDismissed", "1");
  }, []);

  // Share handler — requires login or triggers registration
  const handleShare = useCallback(async () => {
    if (!isLoggedIn) {
      setShowRegister(true);
      return;
    }
    if (!shareEmail.trim()) return;
    setShareSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/nexfit/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: shareEmail.trim(),
          name: shareName.trim() || undefined,
          documentType: "NEXFIT_REPORT",
          parentToken: urlToken || undefined,
        }),
      });
      if (!res.ok) throw new Error("Share failed");
      const data = await res.json();
      setShareResult(data);
    } catch (err) {
      console.error("Share failed", err);
    } finally {
      setShareSubmitting(false);
    }
  }, [shareEmail, shareName, urlToken, isLoggedIn]);

  const copyShareLink = useCallback(() => {
    if (!shareResult) return;
    navigator.clipboard.writeText(shareResult.shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }, [shareResult]);

  // Registration handler
  const handleRegister = useCallback(async () => {
    if (!regEmail.trim() || !regPassword) return;
    setRegSubmitting(true);
    setRegError("");
    try {
      const res = await fetch(`${API_BASE}/nexfit/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regEmail.trim(),
          password: regPassword,
          token: urlToken || undefined,
          marketplaceOptIn: regMarketplace,
        }),
      });
      if (res.status === 409) {
        setRegError("An account with this email already exists. Please log in instead.");
        return;
      }
      if (!res.ok) throw new Error("Registration failed");
      const data = await res.json();
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("userType", data.user.userType);
      localStorage.setItem("userId", data.user.id);
      setIsLoggedIn(true);
      setShowRegister(false);
      // Pre-fill share email if they came from the registration prompt
      setShareOpen(true);
    } catch (err) {
      console.error("Registration failed", err);
      setRegError("Something went wrong. Please try again.");
    } finally {
      setRegSubmitting(false);
    }
  }, [regEmail, regPassword, regMarketplace, urlToken]);

  // Load questions on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/nexfit/questions`);
        if (!res.ok) throw new Error("Failed to load questions");
        const data: NexfitQuestion[] = await res.json();
        setQuestions(data);
      } catch (err) {
        console.error("NexFIT: failed to load questions", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentQuestion = questions[currentStep] ?? null;
  const isLastStep = currentStep === questions.length - 1;
  const progress = questions.length > 0 ? ((currentStep + 1) / questions.length) * 100 : 0;

  // Get current answer for this question
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;

  const canProceed = useMemo(() => {
    if (!currentQuestion) return false;
    if (!currentQuestion.required) return true;
    if (currentQuestion.type === "revenue") return typeof currentAnswer === "number" && currentAnswer > 0;
    if (currentQuestion.type === "multi") return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    return !!currentAnswer;
  }, [currentQuestion, currentAnswer]);

  const handleSelect = useCallback(
    (questionId: string, value: string, type: "single" | "multi" | "revenue") => {
      setAnswers((prev) => {
        if (type === "multi") {
          const arr: string[] = Array.isArray(prev[questionId]) ? [...prev[questionId]] : [];
          const idx = arr.indexOf(value);
          if (idx >= 0) arr.splice(idx, 1);
          else arr.push(value);
          return { ...prev, [questionId]: arr };
        }
        return { ...prev, [questionId]: value };
      });
    },
    [],
  );

  const handleRevenue = useCallback((questionId: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const goNext = useCallback(async () => {
    if (isLastStep) {
      // Submit for analysis
      setAnalyzing(true);
      try {
        const body = {
          role: answers.role,
          trade: answers.trade,
          companySize: answers.companySize,
          annualRevenue: answers.annualRevenue,
          currentTools: answers.currentTools,
          timeLoss: answers.timeLoss,
          painPoints: answers.painPoints,
          priorities: answers.priorities,
        };
        const res = await fetch(`${API_BASE}/nexfit/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Analysis failed");
        const data: NexfitReport = await res.json();
        startTransition(() => setReport(data));
      } catch (err) {
        console.error("NexFIT analysis failed", err);
        alert("Something went wrong. Please try again.");
      } finally {
        setAnalyzing(false);
      }
    } else {
      setDirection("forward");
      startTransition(() => setCurrentStep((s) => s + 1));
    }
  }, [isLastStep, answers, questions]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection("back");
      startTransition(() => setCurrentStep((s) => s - 1));
    }
  }, [currentStep]);

  const startOver = useCallback(() => {
    setReport(null);
    setAnswers({});
    setCurrentStep(0);
    setLeadSubmitted(false);
    setShowLeadCapture(false);
  }, []);

  // Lead capture submit
  const submitLead = useCallback(async () => {
    if (!leadEmail.trim()) return;
    setLeadSubmitting(true);
    try {
      // Fire-and-forget to API (will be saved for follow-up)
      await fetch(`${API_BASE}/nexfit/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail.trim(),
          name: leadName.trim() || undefined,
          company: leadCompany.trim() || undefined,
          answers,
          reportSummary: report
            ? {
                essential: report.essentialCount,
                discovery: report.discoveryCount,
                growth: report.growthCount,
                totalRecovery: report.totalAnnualRecovery,
              }
            : undefined,
        }),
      });
    } catch {
      // Best-effort — even if API isn't ready yet
    }
    setLeadSubmitted(true);
    setLeadSubmitting(false);
  }, [leadEmail, leadName, leadCompany, answers, report]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingWrapper}>
          <div style={styles.spinner} />
          <p style={{ color: "#6b7280", marginTop: 16, fontSize: 14 }}>Loading NexFIT…</p>
        </div>
      </div>
    );
  }

  // ─── Results view ──────────────────────────────────────────────────────────
  if (report) {
    const tiers: ("essential" | "discovery" | "growth")[] = ["essential", "discovery", "growth"];

    return (
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.resultsHeader}>
          <div style={styles.logoRow}>
            <img src="/nexus-deconstruct-hires.gif" alt="Nexus" style={{ height: 36 }} />
            <span style={styles.nexfitBadge}>NexFIT</span>
          </div>
          <h1 style={styles.resultsTitle}>Your Personalized NCC Value Report</h1>
          <p style={styles.resultsSubtitle}>
            Based on your profile as a{" "}
            <strong>{report.profile.role}</strong> in{" "}
            <strong>{report.profile.trade}</strong> with{" "}
            <strong>{fmtDollars(report.profile.annualRevenue)}</strong> annual revenue
          </p>

          {/* Summary cards */}
          <div style={styles.summaryRow}>
            <div style={{ ...styles.summaryCard, borderColor: "#6ee7b7" }}>
              <div style={styles.summaryNumber}>{report.essentialCount}</div>
              <div style={styles.summaryLabel}>Essential</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: "#93c5fd" }}>
              <div style={styles.summaryNumber}>{report.discoveryCount}</div>
              <div style={styles.summaryLabel}>Discovery</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: "#fdba74" }}>
              <div style={styles.summaryNumber}>{report.growthCount}</div>
              <div style={styles.summaryLabel}>Growth</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: "#a78bfa" }}>
              <div style={{ ...styles.summaryNumber, color: "#5b21b6" }}>
                {fmtDollars(report.totalAnnualRecovery)}
              </div>
              <div style={styles.summaryLabel}>Annual Recovery</div>
            </div>
            <div style={{ ...styles.summaryCard, borderColor: "#f472b6" }}>
              <div style={{ ...styles.summaryNumber, color: "#9d174d" }}>
                {report.overallRoiMultiple}×
              </div>
              <div style={styles.summaryLabel}>ROI Multiple</div>
            </div>
          </div>
        </div>

        {/* Tier sections */}
        {tiers.map((tier) => {
          const meta = TIER_META[tier];
          const modules = report.recommendations.filter((r) => r.tier === tier);
          if (modules.length === 0) return null;

          return (
            <div key={tier} style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: meta.bg,
                    color: meta.color,
                    fontWeight: 700,
                    fontSize: 14,
                    border: `1px solid ${meta.border}`,
                  }}
                >
                  {meta.icon}
                </span>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: meta.color }}>
                  {meta.label} Modules
                </h2>
                <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 4 }}>
                  ({modules.length})
                </span>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
                {meta.tagline}
              </p>

              <div style={styles.moduleGrid}>
                {modules.map((mod) => (
                  <div
                    key={mod.moduleCode}
                    style={{
                      ...styles.moduleCard,
                      borderLeftColor: meta.border,
                    }}
                  >
                    <div style={styles.moduleCardHeader}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
                          {mod.label}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {mod.description}
                        </div>
                      </div>
                      {mod.isInferred && (
                        <span style={styles.inferredBadge}>Discovered</span>
                      )}
                    </div>

                    <div style={{ fontSize: 13, color: "#374151", marginTop: 8, lineHeight: 1.5 }}>
                      {mod.reason}
                    </div>

                    <div style={styles.moduleStats}>
                      <div style={styles.stat}>
                        <div style={styles.statValue}>
                          {mod.pricingModel === "PER_PROJECT"
                            ? `${fmtPrice(mod.projectUnlockPrice ?? 0)}/project`
                            : `${fmtPrice(mod.monthlyPrice)}/mo`}
                        </div>
                        <div style={styles.statLabel}>Cost</div>
                      </div>
                      <div style={styles.stat}>
                        <div style={{ ...styles.statValue, color: "#059669" }}>
                          {fmtDollars(mod.monthlyRecovery)}/mo
                        </div>
                        <div style={styles.statLabel}>Recovery</div>
                      </div>
                      <div style={styles.stat}>
                        <div style={{ ...styles.statValue, color: "#7c3aed" }}>
                          {mod.roiMultiple}×
                        </div>
                        <div style={styles.statLabel}>ROI</div>
                      </div>
                      <div style={styles.stat}>
                        <div style={styles.statValue}>{mod.nexopPercent}%</div>
                        <div style={styles.statLabel}>NexOP</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Total investment summary */}
        <div style={styles.totalSummary}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            Total Monthly Investment: ${report.totalMonthlyInvestment.toFixed(0)}/mo
          </div>
          <div style={{ fontSize: 14, color: "#374151" }}>
            Projected Annual Recovery:{" "}
            <strong style={{ color: "#059669" }}>{fmtDollars(report.totalAnnualRecovery)}</strong>{" "}
            — that's a{" "}
            <strong style={{ color: "#7c3aed" }}>{report.overallRoiMultiple}× return</strong>{" "}
            on your NCC investment.
          </div>
        </div>

        {/* Lead capture CTA */}
        {!leadSubmitted ? (
          <div style={styles.leadCapture}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              Stay in the loop
            </div>
            <p style={{ fontSize: 13, color: "#374151", margin: "0 0 12px" }}>
              NCC ships new modules and improvements constantly. Get notified when new
              capabilities land that match your profile.
            </p>
            {!showLeadCapture ? (
              <button
                onClick={() => setShowLeadCapture(true)}
                style={styles.ctaButton}
              >
                Update me on new features →
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
                <input
                  type="email"
                  placeholder="Email *"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  style={styles.input}
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  style={styles.input}
                />
                <input
                  type="text"
                  placeholder="Company (optional)"
                  value={leadCompany}
                  onChange={(e) => setLeadCompany(e.target.value)}
                  style={styles.input}
                />
                <button
                  onClick={submitLead}
                  disabled={!leadEmail.trim() || leadSubmitting}
                  style={{
                    ...styles.ctaButton,
                    opacity: !leadEmail.trim() || leadSubmitting ? 0.5 : 1,
                  }}
                >
                  {leadSubmitting ? "Subscribing…" : "Subscribe to Updates"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...styles.leadCapture, backgroundColor: "#ecfdf5", borderColor: "#6ee7b7" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#065f46" }}>
              You're on the list!
            </div>
            <p style={{ fontSize: 13, color: "#065f46", margin: "4px 0 0" }}>
              We'll notify you when new modules or improvements match your profile.
            </p>
          </div>
        )}

        {/* ─── Share with a colleague (CLT-COLLAB-0003) ──────────────── */}
        <div style={styles.shareSection}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            Share with a colleague
          </div>
          <p style={{ fontSize: 13, color: "#374151", margin: "0 0 12px" }}>
            Know someone who could benefit from NCC? Send them a personalized link
            to take their own NexFIT assessment.
          </p>

          {!shareOpen && !shareResult ? (
            <button
              onClick={() => {
                if (!isLoggedIn) {
                  setShowRegister(true);
                } else {
                  setShareOpen(true);
                }
              }}
              style={styles.shareButton}
            >
              Share with a colleague →
            </button>
          ) : shareResult ? (
            <div style={styles.shareSuccess}>
              <div style={{ fontWeight: 600, color: "#065f46", marginBottom: 6 }}>
                Link created!
              </div>
              <div style={styles.shareLinkRow}>
                <input
                  readOnly
                  value={shareResult.shareUrl}
                  style={{ ...styles.input, flex: 1, fontSize: 13, backgroundColor: "#f9fafb" }}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copyShareLink} style={styles.copyButton}>
                  {shareCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={() => {
                  setShareResult(null);
                  setShareEmail("");
                  setShareName("");
                  setShareOpen(true);
                }}
                style={{ ...styles.linkButton, marginTop: 8 }}
              >
                Share with another person
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
              <input
                type="email"
                placeholder="Colleague's email *"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <input
                type="text"
                placeholder="Their name (optional)"
                value={shareName}
                onChange={(e) => setShareName(e.target.value)}
                style={styles.input}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleShare}
                  disabled={!shareEmail.trim() || shareSubmitting}
                  style={{
                    ...styles.shareButton,
                    opacity: !shareEmail.trim() || shareSubmitting ? 0.5 : 1,
                  }}
                >
                  {shareSubmitting ? "Creating link…" : "Generate Share Link"}
                </button>
                <button
                  onClick={() => setShareOpen(false)}
                  style={styles.secondaryButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Lightweight registration modal ──────────────────────────── */}
        {showRegister && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
                Create a free account
              </h3>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
                Save your results, share with colleagues, and get notified about
                new modules. No commitment — you can always upgrade later.
              </p>
              {regError && (
                <div style={styles.regError}>{regError}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  type="email"
                  placeholder="Email *"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={styles.input}
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Password (min 8 characters) *"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  style={styles.input}
                />
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={regMarketplace}
                    onChange={(e) => setRegMarketplace(e.target.checked)}
                  />
                  <span>Share my portfolio on the Nexus Marketplace</span>
                </label>
                <button
                  onClick={handleRegister}
                  disabled={!regEmail.trim() || regPassword.length < 8 || regSubmitting}
                  style={{
                    ...styles.ctaButton,
                    opacity: !regEmail.trim() || regPassword.length < 8 || regSubmitting ? 0.5 : 1,
                    width: "100%",
                  }}
                >
                  {regSubmitting ? "Creating account…" : "Create Account"}
                </button>
                <button
                  onClick={() => setShowRegister(false)}
                  style={{ ...styles.linkButton, textAlign: "center" }}
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Bookmark prompt ─────────────────────────────────────────── */}
        {showBookmarkHint && (
          <div style={styles.bookmarkBanner}>
            <div style={{ flex: 1 }}>
              <strong>Bookmark this page</strong> so you can return to your NexFIT results anytime.
              <br />
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Press <kbd style={styles.kbd}>⌘D</kbd> (Mac) or <kbd style={styles.kbd}>Ctrl+D</kbd> (Windows)
              </span>
            </div>
            <button onClick={dismissBookmarkHint} style={styles.dismissButton}>
              ✕
            </button>
          </div>
        )}

        {/* ─── Marketplace opt-in dialog (VIEWER users, max 3 shows) ── */}
        {showMarketplaceDialog && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1e3a8a" }}>
                Join the Nexus Marketplace
              </h3>
              <p style={{ fontSize: 13, color: "#374151", margin: "0 0 12px", lineHeight: 1.6 }}>
                The Nexus Marketplace connects restoration professionals with project
                opportunities, vendor networks, and industry intelligence. As a member you get:
              </p>
              <ul style={{ fontSize: 13, color: "#374151", margin: "0 0 16px", paddingLeft: 20, lineHeight: 1.8 }}>
                <li>Your company listed in the contractor directory</li>
                <li>Access to bid requests from property managers and carriers</li>
                <li>Vendor pricing intelligence from aggregated NexOP data</li>
                <li>Ability to share and receive referrals across the network</li>
              </ul>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleMarketplaceOptIn} style={{ ...styles.ctaButton, flex: 1 }}>
                  Add me to the Marketplace
                </button>
                <button onClick={dismissMarketplaceDialog} style={{ ...styles.secondaryButton, flex: 0 }}>
                  Not now
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "12px 0 0", textAlign: "center" }}>
                {3 - marketplacePromptCount - 1 > 0
                  ? `This dialog will appear ${3 - marketplacePromptCount - 1} more time(s).`
                  : "This is the last time we'll show this."}{" "}
                You can always click <strong>"Add me to Marketplace"</strong> in the lower-right corner.
              </p>
            </div>
          </div>
        )}

        {/* ─── Persistent "Add me to Marketplace" button (VIEWER only) ── */}
        {isLoggedIn && isViewer && !alreadyOptedIn && (
          <button
            onClick={handleMarketplaceOptIn}
            style={styles.persistentMarketplaceBtn}
            title="Join the Nexus Marketplace"
          >
            + Add me to Marketplace
          </button>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, marginTop: 24, marginBottom: 48 }}>
          <button onClick={startOver} style={styles.secondaryButton}>
            Start Over
          </button>
          <button
            onClick={() => window.print()}
            style={styles.secondaryButton}
          >
            Print Report
          </button>
        </div>
      </div>
    );
  }

  // ─── Wizard view ────────────────────────────────────────────────────────────

  if (!currentQuestion) {
    return (
      <div style={styles.container}>
        <p style={{ color: "#6b7280" }}>No questions loaded.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.wizardHeader}>
        <div style={styles.logoRow}>
          <img src="/nexus-deconstruct-hires.gif" alt="Nexus" style={{ height: 36 }} />
          <span style={styles.nexfitBadge}>NexFIT</span>
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
          Personalized Module Discovery & ROI Engine
        </p>
      </div>

      {/* Progress bar */}
      <div style={styles.progressOuter}>
        <div
          style={{
            ...styles.progressInner,
            width: `${progress}%`,
          }}
        />
      </div>
      <div style={styles.progressLabel}>
        Step {currentStep + 1} of {questions.length}
      </div>

      {/* Question card */}
      <div
        key={currentQuestion.id}
        style={{
          ...styles.questionCard,
          animation: `${direction === "forward" ? "slideInRight" : "slideInLeft"} 0.25s ease-out`,
        }}
      >
        <h2 style={styles.questionTitle}>{currentQuestion.title}</h2>
        {currentQuestion.subtitle && (
          <p style={styles.questionSubtitle}>{currentQuestion.subtitle}</p>
        )}

        {/* Revenue slider */}
        {currentQuestion.type === "revenue" && (
          <div style={{ marginTop: 16 }}>
            <div style={styles.revenueDisplay}>
              {typeof currentAnswer === "number"
                ? fmtDollars(currentAnswer)
                : "Drag to set your annual revenue"}
            </div>
            <input
              type="range"
              min={0}
              max={REVENUE_STOPS.length - 1}
              step={1}
              value={
                typeof currentAnswer === "number"
                  ? REVENUE_STOPS.findIndex((s) => s >= currentAnswer)
                  : 4
              }
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                handleRevenue(currentQuestion.id, REVENUE_STOPS[idx] ?? 1_000_000);
              }}
              style={styles.slider}
            />
            <div style={styles.sliderLabels}>
              <span>$250K</span>
              <span>$5M</span>
              <span>$50M+</span>
            </div>
          </div>
        )}

        {/* Options grid */}
        {currentQuestion.options && currentQuestion.type !== "revenue" && (
          <div style={styles.optionsGrid}>
            {currentQuestion.options.map((opt) => {
              const isSelected =
                currentQuestion.type === "multi"
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(opt.value)
                  : currentAnswer === opt.value;

              return (
                <button
                  key={opt.value}
                  onClick={() =>
                    handleSelect(currentQuestion.id, opt.value, currentQuestion.type)
                  }
                  style={{
                    ...styles.optionButton,
                    backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                    borderColor: isSelected ? "#3b82f6" : "#e5e7eb",
                    color: isSelected ? "#1e40af" : "#374151",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {opt.icon && <span style={{ fontSize: 18, marginBottom: 2 }}>{opt.icon}</span>}
                  <span>{opt.label}</span>
                  {isSelected && currentQuestion.type === "multi" && (
                    <span style={styles.checkmark}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {currentQuestion.type === "multi" && (
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
            Select all that apply
          </p>
        )}
      </div>

      {/* Navigation */}
      <div style={styles.navRow}>
        <button
          onClick={goBack}
          disabled={currentStep === 0}
          style={{
            ...styles.navButton,
            opacity: currentStep === 0 ? 0.3 : 1,
            cursor: currentStep === 0 ? "not-allowed" : "pointer",
          }}
        >
          ← Back
        </button>
        <button
          onClick={goNext}
          disabled={!canProceed || analyzing}
          style={{
            ...styles.primaryButton,
            opacity: !canProceed || analyzing ? 0.5 : 1,
            cursor: !canProceed || analyzing ? "not-allowed" : "pointer",
          }}
        >
          {analyzing
            ? "Analyzing…"
            : isLastStep
              ? "Get My NCC Value Report →"
              : "Next →"}
        </button>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          background: linear-gradient(90deg, #93c5fd, #3b82f6, #1e3a8a);
          border-radius: 4px;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #3b82f6;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "24px 20px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  loadingWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e5e7eb",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  nexfitBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  wizardHeader: {
    marginBottom: 20,
  },
  progressOuter: {
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressInner: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  progressLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 20,
  },
  questionCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "28px 24px",
    marginBottom: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  questionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.3,
  },
  questionSubtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#6b7280",
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  optionButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    padding: "12px 16px",
    borderRadius: 8,
    border: "2px solid #e5e7eb",
    cursor: "pointer",
    fontSize: 14,
    textAlign: "left",
    position: "relative",
    transition: "all 0.15s ease",
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 10,
    fontSize: 14,
    fontWeight: 700,
    color: "#3b82f6",
  },
  revenueDisplay: {
    fontSize: 28,
    fontWeight: 800,
    color: "#1e3a8a",
    textAlign: "center",
    marginBottom: 12,
  },
  slider: {
    width: "100%",
    cursor: "pointer",
  },
  sliderLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  },
  navButton: {
    padding: "10px 20px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  primaryButton: {
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 20px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  // Results styles
  resultsHeader: {
    marginBottom: 32,
  },
  resultsTitle: {
    margin: "16px 0 8px",
    fontSize: 24,
    fontWeight: 800,
    color: "#111827",
  },
  resultsSubtitle: {
    margin: "0 0 20px",
    fontSize: 14,
    color: "#6b7280",
  },
  summaryRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryCard: {
    flex: "1 1 130px",
    padding: "14px 16px",
    borderRadius: 10,
    border: "2px solid",
    backgroundColor: "#ffffff",
    textAlign: "center",
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  moduleGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  moduleCard: {
    padding: "16px 20px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    borderLeft: "4px solid",
    backgroundColor: "#ffffff",
  },
  moduleCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  inferredBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    color: "#1e40af",
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  moduleStats: {
    display: "flex",
    gap: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #f3f4f6",
  },
  stat: {
    textAlign: "center",
  },
  statValue: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
  },
  statLabel: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 1,
  },
  totalSummary: {
    padding: "20px 24px",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    border: "2px solid #e2e8f0",
    marginBottom: 24,
  },
  leadCapture: {
    padding: "20px 24px",
    borderRadius: 12,
    backgroundColor: "#f0f9ff",
    border: "2px solid #93c5fd",
  },
  ctaButton: {
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  input: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
  },
  // Share section
  shareSection: {
    padding: "20px 24px",
    borderRadius: 12,
    backgroundColor: "#fefce8",
    border: "2px solid #fde68a",
    marginTop: 16,
  },
  shareButton: {
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#92400e",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  shareSuccess: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    border: "1px solid #6ee7b7",
  },
  shareLinkRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  copyButton: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  linkButton: {
    padding: 0,
    border: "none",
    backgroundColor: "transparent",
    color: "#3b82f6",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "underline",
  },
  // Registration modal
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: "28px 24px",
    maxWidth: 420,
    width: "100%",
    boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
  },
  regError: {
    padding: "10px 14px",
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontSize: 13,
    marginBottom: 12,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#374151",
    cursor: "pointer",
  },
  // Bookmark prompt
  bookmarkBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 20px",
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    marginTop: 16,
    fontSize: 13,
    color: "#374151",
  },
  kbd: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 4,
    border: "1px solid #d1d5db",
    backgroundColor: "#f9fafb",
    fontFamily: "monospace",
    fontSize: 12,
  },
  dismissButton: {
    padding: "4px 8px",
    border: "none",
    backgroundColor: "transparent",
    color: "#6b7280",
    fontSize: 16,
    cursor: "pointer",
    flexShrink: 0,
  },
  // Persistent marketplace button (fixed lower-right)
  persistentMarketplaceBtn: {
    position: "fixed",
    bottom: 20,
    right: 20,
    padding: "10px 18px",
    borderRadius: 999,
    border: "none",
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 900,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  },
};
