"use client";

import { useState, useMemo, useCallback, useEffect } from "react";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

interface OpDef {
  id: string;
  label: string;
  cost: number;
  max: number;
  unit: string;
}

interface ModuleDef {
  id: string;
  name: string;
  collar: number;
  cap: number;
  ops: OpDef[];
}

interface ModuleConfig {
  enabled: boolean;
  collar: number;
  cap: number;
  ops: Record<string, number>;
}

interface CalcConfig {
  targetMargin: number;
  markup: number;
  payMethod: "ach" | "cc";
  userCount: number;
  modules: Record<string, ModuleConfig>;
}

interface ProfileMetrics {
  revenue: number;
  cost: number;
  margin: number;
  profit: number;
}

interface SavedProfile {
  id: string;
  group: string;
  baseName: string;
  displayName: string;
  revision: number;
  timestamp: number;
  modCount: number;
  enabledNames: string[];
  metrics: ProfileMetrics;
  config: CalcConfig;
}

type PresetKey = "solo" | "mid" | "large" | "extreme" | "custom";
type GroupKey = "S" | "M" | "L" | "E";

/* ═══════════════════════════════════════════
   MODULE DEFINITIONS
   ═══════════════════════════════════════════ */

const MODULES: ModuleDef[] = [
  {
    id: "estimating", name: "Estimating", collar: 29, cap: 119, ops: [
      { id: "petl", label: "PETL Extrap.", cost: 0.03, max: 500, unit: "ea" },
      { id: "scan", label: "Room Scans", cost: 0.12, max: 100, unit: "ea" },
      { id: "video", label: "Video Assess.", cost: 0.25, max: 50, unit: "ea" },
      { id: "costbook", label: "Cost Book", cost: 0.02, max: 300, unit: "ea" },
    ],
  },
  {
    id: "scheduling", name: "Scheduling", collar: 15, cap: 49, ops: [
      { id: "voice", label: "Voice Notes", cost: 0.027, max: 500, unit: "ea" },
    ],
  },
  {
    id: "financials", name: "Financials", collar: 25, cap: 129, ops: [
      { id: "ocr", label: "Receipt OCR", cost: 0.04, max: 1000, unit: "ea" },
      { id: "prescreen", label: "Prescreens", cost: 0.02, max: 2000, unit: "ea" },
      { id: "nexprice", label: "NexPRICE", cost: 0.02, max: 500, unit: "ea" },
    ],
  },
  {
    id: "documents", name: "Documents", collar: 15, cap: 69, ops: [
      { id: "docai", label: "Doc AI Import", cost: 0.05, max: 500, unit: "pg" },
      { id: "plansheet", label: "Plan Sheet AI", cost: 0.05, max: 200, unit: "pg" },
      { id: "sopsync", label: "SOP Syncs", cost: 0.01, max: 100, unit: "ea" },
    ],
  },
  {
    id: "timekeeping", name: "Timekeeping", collar: 15, cap: 49, ops: [
      { id: "voice", label: "Voice Notes", cost: 0.027, max: 300, unit: "ea" },
    ],
  },
  {
    id: "messaging", name: "Messaging", collar: 9, cap: 29, ops: [
      { id: "voicemsg", label: "Voice Msgs", cost: 0.027, max: 300, unit: "ea" },
      { id: "email", label: "Emails", cost: 0.001, max: 5000, unit: "ea" },
    ],
  },
  {
    id: "bidding", name: "Bidding", collar: 12, cap: 39, ops: [
      { id: "bidcomp", label: "Bid AI Comp.", cost: 0.03, max: 100, unit: "ea" },
    ],
  },
  { id: "workforce", name: "Workforce", collar: 19, cap: 59, ops: [] },
  { id: "compliance", name: "Compliance", collar: 15, cap: 39, ops: [] },
  {
    id: "nexfind", name: "NexFIND", collar: 15, cap: 49, ops: [
      { id: "search", label: "Searches", cost: 0.005, max: 1000, unit: "ea" },
      { id: "analysis", label: "Analyses", cost: 0.03, max: 200, unit: "ea" },
    ],
  },
];

/* ═══════════════════════════════════════════
   PRESETS
   ═══════════════════════════════════════════ */

type PresetModules = Record<string, { enabled: boolean; ops: Record<string, number> }>;

const PRESETS: Record<PresetKey, { userCount: number; modules: PresetModules }> = {
  solo: {
    userCount: 2,
    modules: {
      estimating: { enabled: false, ops: {} }, scheduling: { enabled: true, ops: { voice: 5 } },
      financials: { enabled: true, ops: { ocr: 10, prescreen: 20, nexprice: 5 } },
      documents: { enabled: false, ops: {} }, timekeeping: { enabled: false, ops: {} },
      messaging: { enabled: false, ops: {} }, bidding: { enabled: false, ops: {} },
      workforce: { enabled: false, ops: {} }, compliance: { enabled: false, ops: {} },
      nexfind: { enabled: false, ops: {} },
    },
  },
  mid: {
    userCount: 18,
    modules: {
      estimating: { enabled: true, ops: { petl: 50, scan: 5, video: 2, costbook: 30 } },
      scheduling: { enabled: true, ops: { voice: 40 } },
      financials: { enabled: true, ops: { ocr: 60, prescreen: 100, nexprice: 20 } },
      documents: { enabled: true, ops: { docai: 30, plansheet: 10, sopsync: 5 } },
      timekeeping: { enabled: true, ops: { voice: 20 } },
      messaging: { enabled: true, ops: { voicemsg: 20, email: 200 } },
      bidding: { enabled: false, ops: {} }, workforce: { enabled: false, ops: {} },
      compliance: { enabled: false, ops: {} }, nexfind: { enabled: false, ops: {} },
    },
  },
  large: {
    userCount: 55,
    modules: {
      estimating: { enabled: true, ops: { petl: 200, scan: 20, video: 10, costbook: 80 } },
      scheduling: { enabled: true, ops: { voice: 200 } },
      financials: { enabled: true, ops: { ocr: 300, prescreen: 500, nexprice: 60 } },
      documents: { enabled: true, ops: { docai: 150, plansheet: 30, sopsync: 15 } },
      timekeeping: { enabled: true, ops: { voice: 100 } },
      messaging: { enabled: true, ops: { voicemsg: 100, email: 1000 } },
      bidding: { enabled: true, ops: { bidcomp: 20 } }, workforce: { enabled: true, ops: {} },
      compliance: { enabled: true, ops: {} },
      nexfind: { enabled: true, ops: { search: 300, analysis: 30 } },
    },
  },
  extreme: {
    userCount: 80,
    modules: {
      estimating: { enabled: true, ops: { petl: 500, scan: 60, video: 30, costbook: 200 } },
      scheduling: { enabled: true, ops: { voice: 400 } },
      financials: { enabled: true, ops: { ocr: 800, prescreen: 1500, nexprice: 150 } },
      documents: { enabled: true, ops: { docai: 400, plansheet: 80, sopsync: 40 } },
      timekeeping: { enabled: true, ops: { voice: 200 } },
      messaging: { enabled: true, ops: { voicemsg: 200, email: 3000 } },
      bidding: { enabled: true, ops: { bidcomp: 50 } }, workforce: { enabled: true, ops: {} },
      compliance: { enabled: true, ops: {} },
      nexfind: { enabled: true, ops: { search: 800, analysis: 100 } },
    },
  },
  custom: {
    userCount: 15,
    modules: {
      estimating: { enabled: true, ops: { petl: 0, scan: 0, video: 0, costbook: 0 } },
      scheduling: { enabled: true, ops: { voice: 0 } },
      financials: { enabled: true, ops: { ocr: 0, prescreen: 0, nexprice: 0 } },
      documents: { enabled: true, ops: { docai: 0, plansheet: 0, sopsync: 0 } },
      timekeeping: { enabled: true, ops: { voice: 0 } },
      messaging: { enabled: true, ops: { voicemsg: 0, email: 0 } },
      bidding: { enabled: true, ops: { bidcomp: 0 } }, workforce: { enabled: true, ops: {} },
      compliance: { enabled: true, ops: {} },
      nexfind: { enabled: true, ops: { search: 0, analysis: 0 } },
    },
  },
};

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function buildConfigFromPreset(key: PresetKey): CalcConfig {
  const p = PRESETS[key];
  const modules: Record<string, ModuleConfig> = {};
  MODULES.forEach((mod) => {
    const pm = p.modules[mod.id];
    const ops: Record<string, number> = {};
    mod.ops.forEach((op) => { ops[op.id] = pm?.ops?.[op.id] ?? 0; });
    modules[mod.id] = { enabled: pm?.enabled ?? true, collar: mod.collar, cap: mod.cap, ops };
  });
  return { targetMargin: 80, markup: 5, payMethod: "ach", userCount: p.userCount, modules };
}

function computeMetrics(config: CalcConfig) {
  const tm = config.targetMargin / 100;
  const mk = config.markup;
  let revenue = 0, cost = 0, enabled = 0;
  const enabledNames: string[] = [];

  MODULES.forEach((mod) => {
    const mc = config.modules[mod.id];
    if (!mc?.enabled) return;
    enabled++;
    enabledNames.push(mod.name);
    let vc = 0;
    mod.ops.forEach((op) => { vc += (mc.ops[op.id] || 0) * op.cost; });
    const reqRev = tm < 1 ? vc / (1 - tm) : Infinity;
    const base = Math.max(mc.collar, Math.min(mc.cap, vc * mk));
    const overage = reqRev > mc.cap && vc > 0 ? reqRev - mc.cap : 0;
    revenue += base + overage;
    cost += vc;
  });

  const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 100;
  return { revenue, cost, margin, profit: revenue - cost, enabled, enabledNames };
}

interface ModuleCalcResult {
  modId: string;
  name: string;
  enabled: boolean;
  varCost: number;
  baseCharge: number;
  overageAmount: number;
  totalCharge: number;
  margin: number;
  atCap: boolean;
  opDetails: { label: string; qty: number; unitCost: number; lineCost: number }[];
}

function computeModuleDetails(config: CalcConfig): ModuleCalcResult[] {
  const tm = config.targetMargin / 100;
  const mk = config.markup;
  return MODULES.map((mod) => {
    const mc = config.modules[mod.id];
    if (!mc?.enabled) {
      return { modId: mod.id, name: mod.name, enabled: false, varCost: 0, baseCharge: 0, overageAmount: 0, totalCharge: 0, margin: 100, atCap: false, opDetails: [] };
    }
    let varCost = 0;
    const opDetails: ModuleCalcResult["opDetails"] = [];
    mod.ops.forEach((op) => {
      const qty = mc.ops[op.id] || 0;
      const lc = qty * op.cost;
      varCost += lc;
      if (qty > 0) opDetails.push({ label: op.label, qty, unitCost: op.cost, lineCost: lc });
    });
    const reqRev = tm < 1 ? varCost / (1 - tm) : Infinity;
    const baseCharge = Math.max(mc.collar, Math.min(mc.cap, varCost * mk));
    const overageAmount = reqRev > mc.cap && varCost > 0 ? reqRev - mc.cap : 0;
    const totalCharge = baseCharge + overageAmount;
    const margin = totalCharge > 0 ? ((totalCharge - varCost) / totalCharge) * 100 : varCost === 0 ? 100 : 0;
    const atCap = baseCharge >= mc.cap && varCost > 0;
    return { modId: mod.id, name: mod.name, enabled: true, varCost, baseCharge, overageAmount, totalCharge, margin, atCap, opDetails };
  });
}

const STORAGE_KEY = "ncc-pricing-profiles-v2";
const GROUP_KEYS: GroupKey[] = ["S", "M", "L", "E"];
const GROUP_LABELS: Record<GroupKey, string> = { S: "Solo", M: "Mid-Size", L: "Large", E: "Extreme" };
const GROUP_COLORS: Record<GroupKey, string> = { S: "#6366f1", M: "#4f8cff", L: "#34d399", E: "#fb923c" };

/* ═══════════════════════════════════════════
   CSS — keep the dark theme inline
   ═══════════════════════════════════════════ */

const V = {
  bg: "#0f1117", surface: "#1a1d27", surface2: "#242834",
  border: "#2e3344", text: "#e4e6ef", text2: "#8b90a5",
  accent: "#4f8cff", green: "#34d399", yellow: "#fbbf24",
  red: "#f87171", orange: "#fb923c",
};

/* ═══════════════════════════════════════════
   PAGE COMPONENT
   ═══════════════════════════════════════════ */

export default function PricingCalculatorPage() {
  // ── State ──
  const [config, setConfig] = useState<CalcConfig>(() => buildConfigFromPreset("mid"));
  const [activePreset, setActivePreset] = useState<PresetKey | null>("mid");
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Load profiles from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Validate each profile has required fields
          const valid = parsed.filter(
            (p: any) => p && p.id && p.group && p.config && p.metrics && Array.isArray(p.enabledNames)
          );
          setProfiles(valid);
        }
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // Persist profiles
  const persistProfiles = useCallback((next: SavedProfile[]) => {
    setProfiles(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  // ── Derived calculations ──
  const moduleDetails = useMemo(() => computeModuleDetails(config), [config]);
  const totals = useMemo(() => {
    let revenue = 0, cost = 0, baseTotal = 0, overageTotal = 0, enabledCount = 0;
    moduleDetails.forEach((m) => {
      if (!m.enabled) return;
      enabledCount++;
      revenue += m.totalCharge;
      cost += m.varCost;
      baseTotal += m.baseCharge;
      overageTotal += m.overageAmount;
    });
    const payFeeRate = config.payMethod === "ach" ? 0.01 : 0.035;
    const payFee = revenue * payFeeRate;
    const grandTotal = revenue + payFee;
    const grossMargin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
    const ourPayCost = config.payMethod === "ach" ? revenue * 0.008 : revenue * 0.029 + 0.3;
    const paySpread = payFee - ourPayCost;
    const payFeeLabel = config.payMethod === "ach" ? "ACH Fee (1%)" : "CC Surcharge (3.5%)";
    return { revenue, cost, baseTotal, overageTotal, enabledCount, payFee, grandTotal, grossMargin, paySpread, payFeeLabel };
  }, [moduleDetails, config.payMethod]);

  // ── Config setters ──
  const setGlobal = useCallback((key: keyof CalcConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
    setActiveProfileId(null);
  }, []);

  const setModuleField = useCallback((modId: string, field: keyof ModuleConfig, value: any) => {
    setConfig((prev) => ({
      ...prev,
      modules: { ...prev.modules, [modId]: { ...prev.modules[modId], [field]: value } },
    }));
    setActivePreset(null);
    setActiveProfileId(null);
  }, []);

  const setOpValue = useCallback((modId: string, opId: string, value: number) => {
    setConfig((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        [modId]: {
          ...prev.modules[modId],
          ops: { ...prev.modules[modId].ops, [opId]: value },
        },
      },
    }));
    setActivePreset(null);
    setActiveProfileId(null);
  }, []);

  const loadPreset = useCallback((key: PresetKey) => {
    setConfig(buildConfigFromPreset(key));
    setActivePreset(key);
    setActiveProfileId(null);
  }, []);

  // ── Profile actions ──
  const saveProfile = useCallback((group: GroupKey) => {
    const snapshot = JSON.parse(JSON.stringify(config)) as CalcConfig;
    const metrics = computeMetrics(snapshot);
    const modCount = metrics.enabled;
    const baseName = `${group}${modCount}`;
    const sameBase = profiles.filter((p) => p.group === group && p.baseName === baseName);
    let displayName: string, revision: number;
    if (sameBase.length === 0) { displayName = baseName; revision = 0; }
    else { revision = Math.max(...sameBase.map((p) => p.revision)) + 1; displayName = `${baseName}.r${revision}`; }

    const newProfile: SavedProfile = {
      id: `${baseName}-r${revision}-${Date.now()}`,
      group, baseName, displayName, revision,
      timestamp: Date.now(), modCount, enabledNames: metrics.enabledNames,
      metrics: { revenue: metrics.revenue, cost: metrics.cost, margin: metrics.margin, profit: metrics.profit },
      config: snapshot,
    };
    const next = [...profiles, newProfile];
    persistProfiles(next);
    setActiveProfileId(newProfile.id);
    // Auto-expand
    setCollapsed((prev) => ({ ...prev, [group]: false }));
  }, [config, profiles, persistProfiles]);

  const loadProfile = useCallback((profileId: string) => {
    const p = profiles.find((x) => x.id === profileId);
    if (!p) return;
    setConfig(JSON.parse(JSON.stringify(p.config)));
    setActiveProfileId(profileId);
    setActivePreset(null);
  }, [profiles]);

  const deleteProfile = useCallback((profileId: string) => {
    const next = profiles.filter((p) => p.id !== profileId);
    persistProfiles(next);
    if (activeProfileId === profileId) setActiveProfileId(null);
  }, [profiles, activeProfileId, persistProfiles]);

  const clearAllProfiles = useCallback(() => {
    if (!confirm("Delete all saved profiles?")) return;
    persistProfiles([]);
    setActiveProfileId(null);
  }, [persistProfiles]);

  const adjustProfile = useCallback((profileId: string, pct: number) => {
    const p = profiles.find((x) => x.id === profileId);
    if (!p || pct === 0) return;
    const factor = Math.max(0, 1 + pct / 100);
    const newConfig = JSON.parse(JSON.stringify(p.config)) as CalcConfig;
    MODULES.forEach((mod) => {
      const mc = newConfig.modules[mod.id];
      if (!mc?.enabled) return;
      mod.ops.forEach((op) => {
        mc.ops[op.id] = Math.max(0, Math.round((mc.ops[op.id] || 0) * factor));
      });
    });
    setConfig(newConfig);
    setActivePreset(null);
    setActiveProfileId(null);
    // Now save automatically under the same group
    const metrics = computeMetrics(newConfig);
    const modCount = metrics.enabled;
    const baseName = `${p.group}${modCount}`;
    const sameBase = profiles.filter((x) => x.group === p.group && x.baseName === baseName);
    const revision = sameBase.length === 0 ? 0 : Math.max(...sameBase.map((x) => x.revision)) + 1;
    const displayName = revision === 0 ? baseName : `${baseName}.r${revision}`;
    const newProfile: SavedProfile = {
      id: `${baseName}-r${revision}-${Date.now()}`,
      group: p.group, baseName, displayName, revision,
      timestamp: Date.now(), modCount, enabledNames: metrics.enabledNames,
      metrics: { revenue: metrics.revenue, cost: metrics.cost, margin: metrics.margin, profit: metrics.profit },
      config: JSON.parse(JSON.stringify(newConfig)),
    };
    const next = [...profiles, newProfile];
    persistProfiles(next);
    setActiveProfileId(newProfile.id);
    setCollapsed((prev) => ({ ...prev, [p.group]: false }));
  }, [profiles, persistProfiles]);

  const toggleGroup = useCallback((g: string) => {
    setCollapsed((prev) => ({ ...prev, [g]: !prev[g] }));
  }, []);

  // ── Margin color helper ──
  const mColor = (margin: number, target = config.targetMargin) =>
    margin >= target ? V.green : margin >= target - 10 ? V.yellow : V.red;

  /* ═══════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════ */

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 120px)", background: V.bg, color: V.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif", lineHeight: 1.5, borderRadius: 8, overflow: "hidden" }}>
      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, padding: 20, overflowY: "auto", minWidth: 0 }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: V.text }}>NCC Pricing Calculator</h1>
          <div style={{ color: V.text2, fontSize: 13 }}>Usage-based pricing · dynamic margin protection · save &amp; compare profiles</div>
        </div>

        {/* Global controls bar */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, padding: 14, background: V.surface, border: `1px solid ${V.border}`, borderRadius: 10 }}>
          <GlobalInput label="Target Margin %" value={config.targetMargin} min={50} max={95} step={1} onChange={(v) => setGlobal("targetMargin", v)} />
          <GlobalInput label="Markup ×" value={config.markup} min={1} max={10} step={0.5} onChange={(v) => setGlobal("markup", v)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: V.text2, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment</label>
            <select
              value={config.payMethod}
              onChange={(e) => setGlobal("payMethod", e.target.value)}
              style={{ background: V.surface2, border: `1px solid ${V.border}`, color: V.text, padding: "6px 10px", borderRadius: 6, fontSize: 14, width: 130 }}
            >
              <option value="ach">ACH (1%)</option>
              <option value="cc">CC (3.5%)</option>
            </select>
          </div>
          <GlobalInput label="Users" value={config.userCount} min={1} max={500} step={1} onChange={(v) => setGlobal("userCount", v)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: V.text2, textTransform: "uppercase", letterSpacing: 0.5 }}>Presets</label>
            <div style={{ display: "flex", gap: 4 }}>
              {(["solo", "mid", "large", "extreme", "custom"] as PresetKey[]).map((k) => {
                const lbl = k === "solo" ? "S" : k === "mid" ? "M" : k === "large" ? "L" : k === "extreme" ? "E" : "∅";
                const isActive = activePreset === k;
                return (
                  <button
                    key={k}
                    onClick={() => loadPreset(k)}
                    style={{
                      background: isActive ? V.accent : V.surface2,
                      border: `1px solid ${isActive ? V.accent : V.border}`,
                      color: isActive ? "#fff" : k === "custom" ? V.yellow : V.text,
                      padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                      ...(k === "custom" && !isActive ? { borderColor: V.yellow } : {}),
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Module grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10, marginBottom: 16 }}>
          {moduleDetails.map((md) => {
            const mod = MODULES.find((m) => m.id === md.modId)!;
            const mc = config.modules[mod.id];
            const borderColor = !md.enabled ? V.border : md.overageAmount > 0 ? V.orange : md.margin >= config.targetMargin ? V.green : V.border;
            return (
              <div key={mod.id} style={{ background: V.surface, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 14, opacity: md.enabled ? 1 : 0.4, transition: "border-color 0.2s, opacity 0.2s" }}>
                {/* Header + toggle */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.name}</span>
                  <ToggleSwitch checked={mc.enabled} onChange={(v) => setModuleField(mod.id, "enabled", v)} />
                </div>
                {/* Collar / Cap */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <ConfigField label="Collar" value={mc.collar} onChange={(v) => setModuleField(mod.id, "collar", v)} />
                  <ConfigField label="Cap" value={mc.cap} onChange={(v) => setModuleField(mod.id, "cap", v)} />
                </div>
                {/* Ops */}
                {mod.ops.length === 0 && (
                  <div style={{ fontSize: 11, color: V.text2, padding: "6px 0" }}>Pure value — no variable cost ops</div>
                )}
                {mod.ops.map((op) => (
                  <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <label style={{ fontSize: 11, color: V.text2, minWidth: 120 }}>{op.label}</label>
                    <input
                      type="range" min={0} max={op.max} value={mc.ops[op.id] || 0}
                      onChange={(e) => setOpValue(mod.id, op.id, parseInt(e.target.value) || 0)}
                      style={{ flex: 1, accentColor: V.accent, height: 4 }}
                    />
                    <input
                      type="number" min={0} max={op.max * 2} value={mc.ops[op.id] || 0}
                      onChange={(e) => setOpValue(mod.id, op.id, parseInt(e.target.value) || 0)}
                      style={{ width: 56, background: V.surface2, border: `1px solid ${V.border}`, color: V.text, padding: "3px 5px", borderRadius: 4, fontSize: 11, textAlign: "right" }}
                    />
                    <span style={{ fontSize: 9, color: V.text2, minWidth: 50, textAlign: "right" }}>${op.cost.toFixed(3)}/{op.unit}</span>
                  </div>
                ))}
                {/* Module results */}
                {md.enabled && (
                  <>
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${V.border}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                      <ResultCell label="Cost" value={`$${md.varCost.toFixed(2)}`} />
                      <ResultCell label="Charge" value={`$${md.totalCharge.toFixed(2)}`} color={V.accent} />
                      <ResultCell label="Margin" value={`${md.margin.toFixed(1)}%`} color={mColor(md.margin)} />
                    </div>
                    {md.overageAmount > 0 && (
                      <div style={{ fontSize: 10, color: V.orange, marginTop: 4, padding: "4px 6px", background: "rgba(251,146,60,0.08)", borderRadius: 4 }}>
                        ⚠ +${md.overageAmount.toFixed(2)} overage → {config.targetMargin}% margin
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
            <SummaryCell label="Revenue" value={`$${totals.revenue.toFixed(2)}`} detail={`${totals.enabledCount} modules`} color={V.accent} />
            <SummaryCell label="Var. Cost" value={`$${totals.cost.toFixed(2)}`} detail="API spend" />
            <SummaryCell label="Margin" value={`${totals.grossMargin.toFixed(1)}%`} color={mColor(totals.grossMargin)} detail={
              <div style={{ height: 5, background: V.surface2, borderRadius: 3, marginTop: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(totals.grossMargin, 100)}%`, borderRadius: 3, background: mColor(totals.grossMargin), transition: "width 0.3s, background 0.3s" }} />
              </div>
            } />
            <SummaryCell label="Profit" value={`$${totals.revenue > 0 ? (totals.revenue - totals.cost).toFixed(2) : "0.00"}`} detail="Rev − cost" color={V.green} />
            <SummaryCell label={totals.payFeeLabel} value={`$${totals.payFee.toFixed(2)}`} detail={`+$${totals.paySpread.toFixed(2)} spread`} />
            <SummaryCell label="Billed" value={`$${totals.grandTotal.toFixed(2)}`} detail={`Base $${totals.baseTotal.toFixed(0)} + ovg $${totals.overageTotal.toFixed(0)}`} color={V.accent} />
            <SummaryCell label="Overage" value={`$${totals.overageTotal.toFixed(2)}`} detail={totals.overageTotal > 0 ? "Margin protection" : "Within cap"} color={totals.overageTotal > 0 ? V.orange : V.text2} />
            <SummaryCell label="Annual" value={`$${(totals.grandTotal * 12).toFixed(0)}`} detail="Per year" />
          </div>
        </div>

        {/* Invoice preview */}
        <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: V.accent }}>Invoice Preview</h2>
          {moduleDetails.filter((m) => m.enabled).map((item) => {
            const pct = item.baseCharge > 0 && MODULES.find((m) => m.id === item.modId)!.cap > 0
              ? Math.round((item.baseCharge / config.modules[item.modId].cap) * 100) : 0;
            return (
              <div key={item.modId}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: `1px solid ${V.border}` }}>
                  <span>
                    {item.name}
                    {config.modules[item.modId].cap > 0 && (
                      item.atCap || pct >= 100
                        ? <span style={{ color: V.orange, fontWeight: 600 }}> (max)</span>
                        : <span style={{ color: V.text2 }}> (prorated usage = {pct}%)</span>
                    )}
                  </span>
                  <span>${item.baseCharge.toFixed(2)}</span>
                </div>
                {item.overageAmount > 0 && item.opDetails.map((op) => {
                  const f = item.varCost > 0 ? op.lineCost / item.varCost : 0;
                  const ov = item.overageAmount * f;
                  if (ov <= 0.005) return null;
                  return (
                    <div key={op.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: `1px solid ${V.border}`, color: V.orange, fontStyle: "italic" }}>
                      <span style={{ color: V.text2 }}>&nbsp;&nbsp;↳ {op.label} ({op.qty}×${op.unitCost.toFixed(3)})</span>
                      <span>${ov.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: `1px solid ${V.border}` }}>
            <span style={{ color: V.text2 }}>{totals.payFeeLabel}</span>
            <span>${totals.payFee.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontSize: 14, fontWeight: 700, borderTop: `2px solid ${V.accent}`, marginTop: 4 }}>
            <span>Total Due</span>
            <span>${totals.grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 320, minWidth: 320, background: V.surface, borderLeft: `1px solid ${V.border}`, padding: 16, overflowY: "auto", position: "sticky" as const, top: 0, height: "calc(100vh - 120px)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: V.accent }}>Saved Profiles</h2>

        {/* Save buttons */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
          {GROUP_KEYS.map((g) => (
            <button
              key={g}
              onClick={() => saveProfile(g)}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 6,
                border: `1px solid ${GROUP_COLORS[g]}`, background: V.surface2,
                color: GROUP_COLORS[g], fontSize: 13, fontWeight: 600,
                cursor: "pointer", textAlign: "center",
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Profile groups */}
        {GROUP_KEYS.map((g) => {
          const items = profiles.filter((p) => p.group === g).sort((a, b) => a.modCount !== b.modCount ? a.modCount - b.modCount : a.revision - b.revision);
          const isCollapsed = !!collapsed[g];
          return (
            <div key={g} style={{ marginBottom: 12 }}>
              <div
                onClick={() => toggleGroup(g)}
                style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: GROUP_COLORS[g], padding: "6px 0 4px", borderBottom: `1px solid ${V.border}`, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
              >
                <span>
                  <span style={{ fontSize: 10, marginRight: 4, display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "none" }}>▼</span>
                  {GROUP_LABELS[g]} ({g})
                </span>
                <span style={{ fontWeight: 400, fontSize: 10 }}>{items.length} saved</span>
              </div>
              <div style={{ overflow: "hidden", transition: "max-height 0.25s ease", maxHeight: isCollapsed ? 0 : items.length > 0 ? items.length * 220 + 20 : 60 }}>
                {items.length === 0 && <div style={{ fontSize: 12, color: V.text2, textAlign: "center", padding: "12px 0" }}>No profiles</div>}
                {items.map((p) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    isActive={p.id === activeProfileId}
                    groupColor={GROUP_COLORS[p.group as GroupKey]}
                    onLoad={() => loadProfile(p.id)}
                    onDelete={() => deleteProfile(p.id)}
                    onAdjust={(pct) => adjustProfile(p.id, pct)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <button onClick={clearAllProfiles} style={{ fontSize: 11, color: V.text2, background: "none", border: `1px solid ${V.border}`, padding: "4px 10px", borderRadius: 4, cursor: "pointer", marginTop: 8, display: "block", width: "100%" }}>
          Clear All Saved
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */

function GlobalInput({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: V.text2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ background: V.surface2, border: `1px solid ${V.border}`, color: V.text, padding: "6px 10px", borderRadius: 6, fontSize: 14, width: 110 }}
      />
    </div>
  );
}

function ConfigField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 10, color: V.text2, textTransform: "uppercase", display: "block", marginBottom: 2 }}>{label}</label>
      <input
        type="number" value={value} min={0} step={1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: "100%", background: V.surface2, border: `1px solid ${V.border}`, color: V.text, padding: "4px 8px", borderRadius: 4, fontSize: 13 }}
      />
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: "relative", width: 36, height: 20, display: "inline-block", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
      <span style={{
        position: "absolute", inset: 0, background: checked ? V.accent : V.surface2,
        borderRadius: 20, transition: "0.2s",
      }}>
        <span style={{
          position: "absolute", height: 14, width: 14, left: checked ? 19 : 3, bottom: 3,
          background: checked ? "#fff" : V.text2, borderRadius: "50%", transition: "0.2s",
        }} />
      </span>
    </label>
  );
}

function ResultCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: V.text2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: color ?? V.text }}>{value}</div>
    </div>
  );
}

function SummaryCell({ label, value, detail, color }: { label: string; value: string; detail?: React.ReactNode; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: V.text2, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? V.text }}>{value}</div>
      {typeof detail === "string" ? <div style={{ fontSize: 10, color: V.text2 }}>{detail}</div> : detail}
    </div>
  );
}

function ProfileCard({ profile: p, isActive, groupColor, onLoad, onDelete, onAdjust }: {
  profile: SavedProfile; isActive: boolean; groupColor: string;
  onLoad: () => void; onDelete: () => void; onAdjust: (pct: number) => void;
}) {
  const [pct, setPct] = useState(10);
  const mColor = p.metrics.margin >= 80 ? V.green : p.metrics.margin >= 70 ? V.yellow : V.red;
  const modList = p.enabledNames.length <= 4 ? p.enabledNames.join(", ") : p.enabledNames.slice(0, 3).join(", ") + ` +${p.enabledNames.length - 3}`;

  return (
    <div
      onClick={onLoad}
      style={{
        background: isActive ? "rgba(79,140,255,0.08)" : V.surface2,
        border: `1px solid ${isActive ? V.accent : V.border}`,
        borderRadius: 8, padding: 10, marginBottom: 6, cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: groupColor }}>
          {p.displayName} <span style={{ color: V.text2, fontWeight: 400, fontSize: 11 }}>{p.modCount} mod{p.modCount !== 1 ? "s" : ""}</span>
        </span>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", color: V.text2, cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 4 }}>×</button>
      </div>
      <div style={{ fontSize: 10, color: V.text2, marginBottom: 6, lineHeight: 1.4 }}>{modList}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: V.text2, textTransform: "uppercase" }}>Revenue</div><div style={{ fontSize: 13, fontWeight: 600 }}>${p.metrics.revenue.toFixed(0)}</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: V.text2, textTransform: "uppercase" }}>Margin</div><div style={{ fontSize: 13, fontWeight: 600, color: mColor }}>{p.metrics.margin.toFixed(1)}%</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: V.text2, textTransform: "uppercase" }}>Profit</div><div style={{ fontSize: 13, fontWeight: 600, color: V.green }}>${p.metrics.profit.toFixed(0)}</div></div>
      </div>
      {/* Scale adjuster */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 7, paddingTop: 7, borderTop: `1px dashed ${V.border}` }}>
        <span style={{ fontSize: 10, color: V.text2 }}>Scale</span>
        <select
          value={pct}
          onChange={(e) => setPct(parseInt(e.target.value))}
          style={{ flex: 1, minWidth: 92, background: V.surface, border: `1px solid ${V.border}`, color: V.text, padding: "3px 6px", borderRadius: 4, fontSize: 11 }}
        >
          {[-50, -25, -10, -5, 5, 10, 15, 25, 50].map((v) => (
            <option key={v} value={v}>{v > 0 ? `+${v}` : v}%</option>
          ))}
        </select>
        <button
          onClick={() => onAdjust(pct)}
          style={{ background: V.surface, border: `1px solid ${V.border}`, color: V.accent, padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer" }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
