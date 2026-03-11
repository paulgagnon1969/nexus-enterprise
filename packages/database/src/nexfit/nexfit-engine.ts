/**
 * NexFIT — Personalized Module Discovery & ROI Engine
 *
 * Pure function: answers → recommendations.
 * No database dependency. No side effects. Fully testable.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NexfitQuestion {
  id: string;
  step: number;
  title: string;
  subtitle?: string;
  type: "single" | "multi" | "revenue";
  options?: NexfitOption[];
  required: boolean;
}

export interface NexfitOption {
  value: string;
  label: string;
  icon?: string;
  /** Module codes this answer directly maps to */
  modules?: string[];
  /** Weight multiplier for the module relevance (default 1.0) */
  weight?: number;
}

export interface NexfitAnswers {
  role?: string;
  trade?: string;
  companySize?: string;
  annualRevenue?: number;
  currentTools?: string[];
  timeLoss?: string[];
  painPoints?: string[];
  priorities?: string[];
}

export type RecommendationTier = "essential" | "discovery" | "growth";

export interface ModuleRecommendation {
  moduleCode: string;
  label: string;
  description: string;
  tier: RecommendationTier;
  monthlyPrice: number; // cents
  pricingModel: "MONTHLY" | "PER_PROJECT" | "PER_USE";
  projectUnlockPrice?: number;
  nexopPercent: number;
  annualRecovery: number; // dollars
  monthlyRecovery: number; // dollars
  roiMultiple: number; // monthly recovery / monthly price
  relevanceScore: number; // 0-100
  reason: string; // human-readable explanation
  relatedCams: string[];
  isInferred: boolean; // true = "you didn't know you needed this"
}

export interface NexfitReport {
  profile: {
    role: string;
    trade: string;
    companySize: string;
    annualRevenue: number;
  };
  recommendations: ModuleRecommendation[];
  totalMonthlyInvestment: number; // dollars
  totalAnnualRecovery: number; // dollars
  overallRoiMultiple: number;
  essentialCount: number;
  discoveryCount: number;
  growthCount: number;
}

// ─── Module NexOP Mapping ────────────────────────────────────────────────────

export const MODULE_NEXOP: Record<
  string,
  { percent: number; cams: string[]; description: string }
> = {
  ESTIMATING: {
    percent: 3.12,
    cams: [
      "EST-INTG-0001",
      "EST-AUTO-0002",
      "EST-SPD-0001",
      "EST-ACC-0001",
      "EST-ACC-0002",
      "EST-INTL-0001",
    ],
    description:
      "BOM pricing pipeline, AI-assisted selections, price caching, duplicate detection",
  },
  FINANCIALS: {
    percent: 12.22,
    cams: [
      "FIN-ACC-0001",
      "FIN-ACC-0002",
      "FIN-ACC-0003",
      "FIN-ACC-0004",
      "FIN-ACC-0005",
      "FIN-AUTO-0001",
      "FIN-AUTO-0002",
      "FIN-INTG-0001",
      "FIN-INTL-0002",
      "FIN-INTL-0003",
      "FIN-SPD-0001",
      "FIN-VIS-0001",
      "FIN-VIS-0002",
    ],
    description:
      "NexVERIFY, Zero-Loss Receipt Capture, reconciliation, invoice transparency",
  },
  SCHEDULING: {
    percent: 0.61,
    cams: ["OPS-VIS-0001a"],
    description: "Field quantity discrepancy pipeline, schedule tracking",
  },
  DOCUMENTS: {
    percent: 0.4,
    cams: ["OPS-VIS-0003"],
    description:
      "Document import, OCR scanning, template library, plan sheets",
  },
  TIMEKEEPING: {
    percent: 1.19,
    cams: ["TECH-INTL-0001b"],
    description:
      "TUCKS telemetry & KPI system, crew time tracking, gaming detection",
  },
  COMPLIANCE: {
    percent: 0.6,
    cams: ["CMP-AUTO-0001", "CMP-INTG-0001"],
    description: "NexCheck site compliance kiosk, OSHA eCFR auto-sync",
  },
  NEXFIND: {
    percent: 0.54,
    cams: ["OPS-INTL-0001", "OPS-INTG-0001"],
    description:
      "Supplier intelligence network, receipt-verified supplier map",
  },
  MESSAGING: {
    percent: 0.27,
    cams: ["OPS-VIS-0002"],
    description: "Urgency-based task dashboard, notifications",
  },
  WORKFORCE: {
    percent: 0.39,
    cams: ["OPS-COLLAB-0001"],
    description: "Phantom fleet personal asset sharing, crew management",
  },
  BIDDING: {
    percent: 0.15,
    cams: ["CLT-COLLAB-0002"],
    description: "Bid packages, supplier invitations, bid comparison",
  },
  NEXBRIDGE: {
    percent: 0.24,
    cams: ["TECH-SPD-0003", "TECH-SPD-0004"],
    description: "Desktop companion — contacts sync, document scanning",
  },
  NEXBRIDGE_ASSESS: {
    percent: 0.18,
    cams: ["EST-INTL-0001", "EST-ACC-0002"],
    description: "AI video assessment, NexCAD enhanced measurement",
  },
  NEXBRIDGE_NEXPLAN: {
    percent: 0.6,
    cams: ["EST-AUTO-0002", "TECH-INTG-0002"],
    description: "AI-assisted material selections, distributed pipeline",
  },
  NEXBRIDGE_AI: {
    percent: 0.08,
    cams: ["TECH-INTL-0001a"],
    description: "Local AI inference, enhanced vision analysis",
  },
  XACT_IMPORT: {
    percent: 2.99,
    cams: ["EST-INTG-0001"],
    description: "Xactimate CSV import with multi-provider BOM pricing",
  },
  DOCUMENT_AI: {
    percent: 0.37,
    cams: ["FIN-AUTO-0001", "FIN-SPD-0001"],
    description: "AI-powered receipt OCR, hybrid extraction pipeline",
  },
  DRAWINGS_BOM: {
    percent: 0.6,
    cams: ["EST-AUTO-0002"],
    description: "Architectural drawings → bill of materials generation",
  },
  SUPPLIER_INDEX: {
    percent: 0.26,
    cams: ["OPS-INTG-0001"],
    description: "Local supplier discovery, geographic scraping, map integration",
  },
};

// ─── Module Labels (fallback if catalog not available) ───────────────────────

const MODULE_LABELS: Record<string, { label: string; description: string; monthlyPrice: number; pricingModel: string; projectUnlockPrice?: number }> = {
  CORE: { label: "Core Platform", description: "Company settings, user management, dashboard", monthlyPrice: 0, pricingModel: "MONTHLY" },
  ESTIMATING: { label: "Estimating & Cost Books", description: "PETL, cost books, line-item management, BOM pricing", monthlyPrice: 7900, pricingModel: "MONTHLY" },
  SCHEDULING: { label: "Scheduling & Daily Logs", description: "Project scheduling, Gantt views, daily logs", monthlyPrice: 4900, pricingModel: "MONTHLY" },
  FINANCIALS: { label: "Financial Management", description: "Invoicing, payment tracking, billing, NexVERIFY", monthlyPrice: 6900, pricingModel: "MONTHLY" },
  DOCUMENTS: { label: "Document Management", description: "Document import, OCR, templates, plan sheets", monthlyPrice: 3900, pricingModel: "MONTHLY" },
  TIMEKEEPING: { label: "Timekeeping & Payroll", description: "Daily timecards, crew tracking, payroll export", monthlyPrice: 4900, pricingModel: "MONTHLY" },
  MESSAGING: { label: "Messaging & Notifications", description: "Internal messaging, push/email/SMS alerts", monthlyPrice: 2900, pricingModel: "MONTHLY" },
  BIDDING: { label: "Supplier Bidding", description: "Bid packages, supplier invitations, comparison", monthlyPrice: 3900, pricingModel: "MONTHLY" },
  WORKFORCE: { label: "Workforce Management", description: "Skills tracking, reputation scoring, onboarding", monthlyPrice: 5900, pricingModel: "MONTHLY" },
  COMPLIANCE: { label: "Compliance & Safety", description: "OSHA sync, safety certs, NexCheck kiosk", monthlyPrice: 3900, pricingModel: "MONTHLY" },
  SUPPLIER_INDEX: { label: "Supplier Index", description: "Local supplier discovery, map integration", monthlyPrice: 20000, pricingModel: "MONTHLY" },
  NEXFIND: { label: "NexFIND — Supplier Intelligence", description: "Crowdsourced supplier network, product search", monthlyPrice: 4900, pricingModel: "MONTHLY" },
  NEXBRIDGE: { label: "NexBRIDGE Connect", description: "Desktop companion — sync, scanning, assets", monthlyPrice: 2900, pricingModel: "MONTHLY" },
  NEXBRIDGE_ASSESS: { label: "NexBRIDGE — Video Assessment", description: "AI video assessment, frame extraction, analysis", monthlyPrice: 2900, pricingModel: "MONTHLY" },
  NEXBRIDGE_NEXPLAN: { label: "NexBRIDGE — NexPLAN Selections", description: "AI material selections, floor plan analysis", monthlyPrice: 3900, pricingModel: "MONTHLY" },
  NEXBRIDGE_AI: { label: "NexBRIDGE — AI Features Pack", description: "Local AI inference, enhanced vision", monthlyPrice: 1900, pricingModel: "MONTHLY" },
  XACT_IMPORT: { label: "Xactimate CSV Import", description: "Import Xactimate estimates per project", monthlyPrice: 0, pricingModel: "PER_PROJECT", projectUnlockPrice: 4900 },
  DOCUMENT_AI: { label: "Document AI Processing", description: "AI-powered OCR and data extraction per project", monthlyPrice: 0, pricingModel: "PER_PROJECT", projectUnlockPrice: 2900 },
  DRAWINGS_BOM: { label: "Drawings → BOM Pipeline", description: "Generate bill of materials from drawings", monthlyPrice: 0, pricingModel: "PER_PROJECT", projectUnlockPrice: 3900 },
};

// ─── Questions ───────────────────────────────────────────────────────────────

export const NEXFIT_QUESTIONS: NexfitQuestion[] = [
  {
    id: "role",
    step: 1,
    title: "What best describes your role?",
    subtitle: "This helps us tailor recommendations to your daily workflow.",
    type: "single",
    required: true,
    options: [
      { value: "owner", label: "Owner / Principal", icon: "👔" },
      { value: "pm", label: "Project Manager", icon: "📋" },
      { value: "estimator", label: "Estimator", icon: "📐" },
      { value: "field_supervisor", label: "Field Supervisor / Foreman", icon: "🏗️" },
      { value: "office_admin", label: "Office Administrator", icon: "🖥️" },
      { value: "bookkeeper", label: "Bookkeeper / Accountant", icon: "📊" },
    ],
  },
  {
    id: "trade",
    step: 2,
    title: "What's your primary trade?",
    subtitle: "Different trades have different operational needs.",
    type: "single",
    required: true,
    options: [
      { value: "general", label: "General Contractor", icon: "🔨" },
      { value: "restoration", label: "Restoration / Remediation", icon: "🏚️" },
      { value: "electrical", label: "Electrical", icon: "⚡" },
      { value: "plumbing", label: "Plumbing", icon: "🔧" },
      { value: "hvac", label: "HVAC", icon: "❄️" },
      { value: "roofing", label: "Roofing", icon: "🏠" },
      { value: "painting", label: "Painting / Finishing", icon: "🎨" },
      { value: "concrete", label: "Concrete / Masonry", icon: "🧱" },
      { value: "other", label: "Other Specialty", icon: "🛠️" },
    ],
  },
  {
    id: "companySize",
    step: 3,
    title: "How large is your team?",
    subtitle: "Company size determines which operational tools matter most.",
    type: "single",
    required: true,
    options: [
      { value: "solo", label: "Just me", icon: "1️⃣" },
      { value: "small", label: "2–5 people", icon: "👥" },
      { value: "medium", label: "6–15 people", icon: "👷" },
      { value: "large", label: "16–50 people", icon: "🏢" },
      { value: "enterprise", label: "50+ people", icon: "🏗️" },
    ],
  },
  {
    id: "annualRevenue",
    step: 4,
    title: "What's your approximate annual revenue?",
    subtitle:
      "This lets us show you exactly how much each module can recover in real dollars. Your answer stays private.",
    type: "revenue",
    required: false,
  },
  {
    id: "currentTools",
    step: 5,
    title: "What tools do you use today?",
    subtitle: "Select all that apply. We'll show you where NCC replaces or integrates with them.",
    type: "multi",
    required: false,
    options: [
      { value: "spreadsheets", label: "Spreadsheets (Excel/Sheets)", icon: "📊" },
      { value: "xactimate", label: "Xactimate", icon: "📋", modules: ["XACT_IMPORT", "ESTIMATING"] },
      { value: "quickbooks", label: "QuickBooks / Sage", icon: "💰", modules: ["FINANCIALS"] },
      { value: "procore", label: "Procore", icon: "🏗️" },
      { value: "buildertrend", label: "Buildertrend / CoConstruct", icon: "🔧" },
      { value: "planswift", label: "PlanSwift / STACK", icon: "📐", modules: ["ESTIMATING", "DRAWINGS_BOM"] },
      { value: "paper", label: "Paper / Whiteboards", icon: "📝" },
      { value: "nothing", label: "Nothing formal", icon: "🤷" },
    ],
  },
  {
    id: "timeLoss",
    step: 6,
    title: "Where do you lose the most time?",
    subtitle: "Select your top frustrations. These become your Essential modules.",
    type: "multi",
    required: true,
    options: [
      { value: "estimating", label: "Creating estimates & quotes", icon: "📐", modules: ["ESTIMATING"], weight: 2.0 },
      { value: "scheduling", label: "Scheduling & coordinating crews", icon: "📅", modules: ["SCHEDULING"], weight: 2.0 },
      { value: "receipts", label: "Tracking receipts & expenses", icon: "🧾", modules: ["FINANCIALS", "DOCUMENT_AI"], weight: 2.0 },
      { value: "invoicing", label: "Invoicing & getting paid", icon: "💵", modules: ["FINANCIALS"], weight: 2.0 },
      { value: "suppliers", label: "Finding materials & suppliers", icon: "🏪", modules: ["NEXFIND", "SUPPLIER_INDEX"], weight: 2.0 },
      { value: "compliance", label: "Safety & compliance paperwork", icon: "📋", modules: ["COMPLIANCE"], weight: 2.0 },
      { value: "clients", label: "Communicating with clients", icon: "🤝", modules: ["MESSAGING"], weight: 1.5 },
      { value: "crews", label: "Managing crew time & tasks", icon: "👷", modules: ["TIMEKEEPING", "SCHEDULING"], weight: 2.0 },
    ],
  },
  {
    id: "painPoints",
    step: 7,
    title: "What keeps you up at night?",
    subtitle: "Be honest — these are the problems NCC was built to solve.",
    type: "multi",
    required: true,
    options: [
      { value: "missing_receipts", label: "Missing or lost receipts", icon: "🧾", modules: ["FINANCIALS", "DOCUMENT_AI"], weight: 2.5 },
      { value: "budget_overruns", label: "Projects going over budget", icon: "💸", modules: ["FINANCIALS", "ESTIMATING"], weight: 2.5 },
      { value: "schedule_delays", label: "Schedule delays & missed deadlines", icon: "⏰", modules: ["SCHEDULING"], weight: 2.0 },
      { value: "client_disputes", label: "Client disputes & change orders", icon: "⚖️", modules: ["DOCUMENTS", "FINANCIALS"], weight: 2.0 },
      { value: "compliance_risk", label: "OSHA / compliance exposure", icon: "⚠️", modules: ["COMPLIANCE"], weight: 2.5 },
      { value: "finding_subs", label: "Finding qualified subcontractors", icon: "🔍", modules: ["WORKFORCE", "BIDDING"], weight: 1.5 },
      { value: "cash_flow", label: "Cash flow & payment delays", icon: "💰", modules: ["FINANCIALS"], weight: 2.0 },
      { value: "employee_tracking", label: "Knowing where crews are & what they did", icon: "📍", modules: ["TIMEKEEPING"], weight: 2.0 },
    ],
  },
  {
    id: "priorities",
    step: 8,
    title: "What would make the biggest difference for your business?",
    subtitle: "Pick the outcomes that matter most to you.",
    type: "multi",
    required: true,
    options: [
      { value: "faster_estimates", label: "Faster, more accurate estimates", icon: "⚡", modules: ["ESTIMATING", "NEXBRIDGE_NEXPLAN"], weight: 1.5 },
      { value: "financial_visibility", label: "Better financial visibility", icon: "📊", modules: ["FINANCIALS"], weight: 1.5 },
      { value: "automated_compliance", label: "Automated compliance & safety", icon: "✅", modules: ["COMPLIANCE"], weight: 1.5 },
      { value: "client_transparency", label: "Client transparency & trust", icon: "🤝", modules: ["MESSAGING", "DOCUMENTS"], weight: 1.5 },
      { value: "mobile_field", label: "Mobile-first field tools", icon: "📱", modules: ["NEXBRIDGE", "TIMEKEEPING"], weight: 1.5 },
      { value: "supplier_discovery", label: "Smarter supplier discovery", icon: "🏪", modules: ["NEXFIND"], weight: 1.5 },
      { value: "all_in_one", label: "One platform for everything", icon: "🎯", weight: 1.0 },
    ],
  },
];

// ─── Inference Rules ─────────────────────────────────────────────────────────

interface InferenceRule {
  condition: (a: NexfitAnswers) => boolean;
  modules: string[];
  reason: string;
}

const INFERENCE_RULES: InferenceRule[] = [
  // Estimating → needs financials (estimates create purchases)
  {
    condition: (a) =>
      a.timeLoss?.includes("estimating") === true ||
      a.priorities?.includes("faster_estimates") === true,
    modules: ["FINANCIALS"],
    reason:
      "Estimates generate purchases. Without financial tracking, 15-25% of project costs go unrecorded.",
  },
  // Receipt tracking → needs documents (receipts are documents)
  {
    condition: (a) =>
      a.timeLoss?.includes("receipts") === true ||
      a.painPoints?.includes("missing_receipts") === true,
    modules: ["DOCUMENTS"],
    reason:
      "Every receipt is a document. OCR + digital storage eliminates the #1 cause of financial leakage.",
  },
  // Field crews (medium+) → needs timekeeping + compliance
  {
    condition: (a) =>
      ["medium", "large", "enterprise"].includes(a.companySize ?? ""),
    modules: ["TIMEKEEPING", "COMPLIANCE"],
    reason:
      "With 6+ crew members, manual time tracking and safety compliance become liability risks.",
  },
  // Uses Xactimate → needs Xact Import
  {
    condition: (a) => a.currentTools?.includes("xactimate") === true,
    modules: ["XACT_IMPORT"],
    reason:
      "Your Xactimate estimates import directly into NCC — no re-keying, with live BOM pricing from HD & Lowe's.",
  },
  // Restoration trade → needs Xact Import + Video Assessment
  {
    condition: (a) => a.trade === "restoration",
    modules: ["XACT_IMPORT", "NEXBRIDGE_ASSESS", "NEXBRIDGE"],
    reason:
      "Restoration workflows depend on Xactimate estimates and video documentation. NexBRIDGE captures both.",
  },
  // Budget overruns → needs estimating (better estimates = fewer overruns)
  {
    condition: (a) => a.painPoints?.includes("budget_overruns") === true,
    modules: ["ESTIMATING"],
    reason:
      "Budget overruns start with inaccurate estimates. Structured estimating with live pricing prevents them.",
  },
  // Any company > $2M revenue → FINANCIALS is always essential
  {
    condition: (a) => (a.annualRevenue ?? 0) >= 2_000_000,
    modules: ["FINANCIALS"],
    reason:
      "At your revenue level, even a 1% financial leakage is $20K+/year. NexVERIFY alone recovers ~7.5%.",
  },
  // Client disputes → needs Documents + Financials (audit trail)
  {
    condition: (a) => a.painPoints?.includes("client_disputes") === true,
    modules: ["DOCUMENTS", "FINANCIALS"],
    reason:
      "Client disputes are resolved by documentation. An unbreakable audit chain from estimate to invoice eliminates ambiguity.",
  },
  // Bookkeeper role → needs Financials + Estimating (reconciliation)
  {
    condition: (a) => a.role === "bookkeeper",
    modules: ["FINANCIALS", "ESTIMATING"],
    reason:
      "Reconciliation requires seeing both sides: what was estimated and what was spent. Both modules feed the audit chain.",
  },
  // Uses spreadsheets or paper → suggest all-in-one platform modules
  {
    condition: (a) =>
      a.currentTools?.includes("spreadsheets") === true ||
      a.currentTools?.includes("paper") === true ||
      a.currentTools?.includes("nothing") === true,
    modules: ["SCHEDULING", "MESSAGING"],
    reason:
      "Moving from manual tracking to an integrated platform typically saves 5-10 hours per week in administrative overhead.",
  },
  // Owner role → needs WORKFORCE for crew oversight
  {
    condition: (a) =>
      a.role === "owner" &&
      ["medium", "large", "enterprise"].includes(a.companySize ?? ""),
    modules: ["WORKFORCE"],
    reason:
      "As an owner with multiple crews, workforce management gives you visibility into skills, availability, and asset utilization.",
  },
  // Finding subs → needs WORKFORCE + BIDDING
  {
    condition: (a) => a.painPoints?.includes("finding_subs") === true,
    modules: ["WORKFORCE", "BIDDING"],
    reason:
      "The Sovereign Marketplace connects you with verified subcontractors ranked by actual performance data — not just reviews.",
  },
];

// ─── Scoring Engine ──────────────────────────────────────────────────────────

interface ModuleScore {
  code: string;
  directScore: number; // from direct answer mappings
  inferredScore: number; // from inference rules
  inferenceReasons: string[];
}

function scoreModules(answers: NexfitAnswers): ModuleScore[] {
  const scores = new Map<
    string,
    { direct: number; inferred: number; reasons: string[] }
  >();

  const ensure = (code: string) => {
    if (!scores.has(code))
      scores.set(code, { direct: 0, inferred: 0, reasons: [] });
  };

  // 1. Score from direct answer → module mappings
  for (const question of NEXFIT_QUESTIONS) {
    const answerKey = question.id as keyof NexfitAnswers;
    const answer = answers[answerKey];
    if (!answer) continue;

    const selectedValues = Array.isArray(answer)
      ? answer
      : [answer as string];

    for (const val of selectedValues) {
      const option = question.options?.find((o) => o.value === val);
      if (!option?.modules) continue;

      const weight = option.weight ?? 1.0;
      for (const modCode of option.modules) {
        ensure(modCode);
        scores.get(modCode)!.direct += 10 * weight;
      }
    }
  }

  // 2. Score from inference rules
  for (const rule of INFERENCE_RULES) {
    if (rule.condition(answers)) {
      for (const modCode of rule.modules) {
        ensure(modCode);
        const entry = scores.get(modCode)!;
        entry.inferred += 8; // slightly lower than direct
        if (!entry.reasons.includes(rule.reason)) {
          entry.reasons.push(rule.reason);
        }
      }
    }
  }

  // 3. "All-in-one" boost: if they picked this priority, give a small boost to everything
  if (answers.priorities?.includes("all_in_one")) {
    for (const [, entry] of scores) {
      entry.direct += 3;
    }
  }

  return Array.from(scores.entries()).map(([code, s]) => ({
    code,
    directScore: s.direct,
    inferredScore: s.inferred,
    inferenceReasons: s.reasons,
  }));
}

function assignTier(
  score: ModuleScore,
  isAlreadyDirect: boolean,
): RecommendationTier {
  const total = score.directScore + score.inferredScore;

  if (score.directScore >= 15 || (isAlreadyDirect && total >= 10)) {
    return "essential";
  }
  if (score.inferredScore > 0 && score.directScore < 15) {
    return "discovery";
  }
  return "growth";
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function analyzeNeeds(answers: NexfitAnswers): NexfitReport {
  const revenue = answers.annualRevenue ?? 5_000_000; // default $5M if not provided
  const moduleScores = scoreModules(answers);

  // Build recommendations
  const recommendations: ModuleRecommendation[] = [];

  for (const ms of moduleScores) {
    // Skip CORE — it's always included
    if (ms.code === "CORE") continue;

    const nexop = MODULE_NEXOP[ms.code];
    const meta = MODULE_LABELS[ms.code];
    if (!meta) continue; // unknown module

    const totalScore = ms.directScore + ms.inferredScore;
    if (totalScore < 5) continue; // too low to recommend

    const isDirectlyRequested = ms.directScore >= 15;
    const tier = assignTier(ms, isDirectlyRequested);

    const nexopPercent = nexop?.percent ?? 0;
    const annualRecovery = revenue * (nexopPercent / 100);
    const monthlyRecovery = annualRecovery / 12;
    const effectiveMonthly =
      meta.pricingModel === "PER_PROJECT"
        ? (meta.projectUnlockPrice ?? 0) / 100
        : meta.monthlyPrice / 100;
    const roiMultiple =
      effectiveMonthly > 0
        ? Math.round((monthlyRecovery / effectiveMonthly) * 10) / 10
        : 0;

    const reason =
      ms.inferenceReasons.length > 0
        ? ms.inferenceReasons[0]
        : tier === "essential"
          ? "You identified this as a core need for your business."
          : "This module compounds value across your other tools.";

    recommendations.push({
      moduleCode: ms.code,
      label: meta.label,
      description: meta.description,
      tier,
      monthlyPrice: meta.monthlyPrice,
      pricingModel: meta.pricingModel as "MONTHLY" | "PER_PROJECT" | "PER_USE",
      projectUnlockPrice: meta.projectUnlockPrice,
      nexopPercent,
      annualRecovery: Math.round(annualRecovery),
      monthlyRecovery: Math.round(monthlyRecovery),
      roiMultiple,
      relevanceScore: Math.min(100, totalScore),
      reason,
      relatedCams: nexop?.cams ?? [],
      isInferred: !isDirectlyRequested && ms.inferredScore > 0,
    });
  }

  // Sort: essential first (by relevance), then discovery, then growth
  const tierOrder = { essential: 0, discovery: 1, growth: 2 };
  recommendations.sort((a, b) => {
    if (tierOrder[a.tier] !== tierOrder[b.tier])
      return tierOrder[a.tier] - tierOrder[b.tier];
    return b.relevanceScore - a.relevanceScore;
  });

  // Calculate totals (monthly subscription modules only)
  const monthlyModules = recommendations.filter(
    (r) => r.pricingModel === "MONTHLY" && r.monthlyPrice > 0,
  );
  const totalMonthly = monthlyModules.reduce(
    (sum, r) => sum + r.monthlyPrice / 100,
    0,
  );
  const totalRecovery = recommendations.reduce(
    (sum, r) => sum + r.annualRecovery,
    0,
  );
  const overallRoi =
    totalMonthly > 0
      ? Math.round((totalRecovery / 12 / totalMonthly) * 10) / 10
      : 0;

  return {
    profile: {
      role: answers.role ?? "unknown",
      trade: answers.trade ?? "unknown",
      companySize: answers.companySize ?? "unknown",
      annualRevenue: revenue,
    },
    recommendations,
    totalMonthlyInvestment: totalMonthly,
    totalAnnualRecovery: totalRecovery,
    overallRoiMultiple: overallRoi,
    essentialCount: recommendations.filter((r) => r.tier === "essential")
      .length,
    discoveryCount: recommendations.filter((r) => r.tier === "discovery")
      .length,
    growthCount: recommendations.filter((r) => r.tier === "growth").length,
  };
}

export function getQuestions(): NexfitQuestion[] {
  return NEXFIT_QUESTIONS;
}
