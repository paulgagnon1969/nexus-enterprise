import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiJson } from "../api/client";
import { fetchMyKpis, type PersonalKpis } from "../api/analytics";
import { fetchDailyLogFeed } from "../api/dailyLog";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";
import { getCache, setCache } from "../offline/cache";
import { getFavoriteProjectIds, toggleFavoriteProject, getLastSelectedCompanyId, setLastSelectedCompanyId } from "../storage/settings";
import { getProjectScores, recordUsage, type ProjectScore } from "../storage/usageTracker";
import { colors } from "../theme/colors";
import { useDeviceLayout } from "../hooks/useDeviceLayout";
import { ProjectMap, type ProjectMapHandle } from "../components/ProjectMap";
import { MapScreen } from "./MapScreen";
import type { ApiRole, ProjectListItem, DailyLogListItem } from "../types/api";

// ─── Status filter types ──────────────────────────────────────────────────

type StatusFilter = "active" | "closed" | "all";

const STATUS_META: Record<StatusFilter, { icon: string; label: string; color: string }> = {
  active: { icon: "●", label: "Active", color: "#22c55e" },
  closed: { icon: "●", label: "Closed", color: "#ef4444" },
  all:    { icon: "◐", label: "All",    color: "#94a3b8" },
};

/** Display metadata for project-level statuses (used when a project is selected) */
const PROJECT_STATUS_OPTIONS = [
  { value: "active",    label: "Active",    icon: "●", color: "#22c55e" },
  { value: "on-hold",   label: "On Hold",   icon: "⏸", color: "#f59e0b" },
  { value: "completed", label: "Completed", icon: "✓", color: "#3b82f6" },
  { value: "archived",  label: "Archived",  icon: "◉", color: "#94a3b8" },
] as const;

function projectStatusMeta(raw: string | null | undefined) {
  const s = (raw ?? "").toLowerCase().trim();
  return (
    PROJECT_STATUS_OPTIONS.find((o) => o.value === s) ??
    // "open" → active, anything unrecognized → first match
    (s === "open" ? PROJECT_STATUS_OPTIONS[0] : { value: s || "active", label: s || "Active", icon: "●", color: "#22c55e" })
  );
}

/** Roles that can change a project's status */
const STATUS_CHANGE_ROLES = new Set<string>(["OWNER", "ADMIN"]);

// ─── KPI color helper ─────────────────────────────────────────────────────

function kpiColor(you: number, avg: number): string {
  if (avg === 0) return "#22c55e"; // no baseline → green
  const ratio = you / avg;
  if (ratio >= 1) return "#22c55e"; // green
  if (ratio >= 0.7) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

// ─── Uniform row height for visual symmetry (all cards, banners, ranking) ──

const ROW_HEIGHT = 40;

// ─── Component ────────────────────────────────────────────────────────────

interface Props {
  onOpenProject: (project: ProjectListItem) => void;
  onCreateProject?: () => void;
  onOpenMap?: () => void;
  onCompanyChange?: (company: { id: string; name: string }) => void;
  onProjectFilterChange?: (project: ProjectListItem | null) => void;
  /** External filter (from shared context) — when cleared externally, local state syncs */
  externalFilter?: ProjectListItem | null;
  companyName?: string | null;
}

export function KpiHomeScreen({
  onOpenProject,
  onCreateProject,
  onOpenMap,
  onCompanyChange,
  onProjectFilterChange,
  externalFilter,
  companyName,
}: Props) {
  // Data
  const [kpis, setKpis] = useState<PersonalKpis | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<DailyLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Multi-tenant
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [localCompanyName, setLocalCompanyName] = useState<string | null>(companyName ?? null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const [isAllCompaniesMode, setIsAllCompaniesMode] = useState(false);

  // Project filter
  const [filteredProject, setFilteredProject] = useState<ProjectListItem | null>(null);

  // Sync with external filter (e.g. cleared when Home tab pressed)
  useEffect(() => {
    if (externalFilter === null && filteredProject !== null) {
      setFilteredProject(null);
    }
  }, [externalFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showProjectFilter, setShowProjectFilter] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  // Favorites & usage scores
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [projectScoreMap, setProjectScoreMap] = useState<Map<string, number>>(new Map());

  // Map focus (tablet)
  const [mapFocusProject, setMapFocusProject] = useState<ProjectListItem | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const mapRef = useRef<ProjectMapHandle>(null);

  // User role (for status-change gating)
  const [userRole, setUserRole] = useState<ApiRole | string | null>(null);

  // Project status change
  const [showStatusChangePicker, setShowStatusChangePicker] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // Device layout for tablet adaptations
  const { isTablet } = useDeviceLayout();
  const insets = useSafeAreaInsets();

  // ── Tenant initials (logo placeholder) ──────────────────────────────────

  const tenantInitials = useMemo(() => {
    const name = localCompanyName ?? companyName ?? "N";
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [localCompanyName, companyName]);

  // ── Project filter handler (propagates to shared context) ───────────────

  const handleProjectSelect = useCallback(
    (project: ProjectListItem | null) => {
      setFilteredProject(project);
      if (project) setProjectLogsLoading(true); // show spinner immediately (before useEffect)
      onProjectFilterChange?.(project);
      // Track usage so frequency sorting works
      if (project) void recordUsage(project.id, "open_project");
    },
    [onProjectFilterChange],
  );

  // ── Load tenant context ─────────────────────────────────────────────────

  const loadCompanies = useCallback(async (skipActivation = false) => {
    try {
      const me = await getUserMe();
      const list = (me.memberships ?? []).map((m) => ({
        id: m.companyId,
        name: m.company?.name ?? m.companyId,
      }));
      // Deduplicate
      const seen = new Set<string>();
      const unique = list.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setCompanies(unique);

      // Determine current company + user role (skip in All mode)
      const companyMe = await getUserCompanyMe();
      if (companyMe?.id && !skipActivation) {
        setCurrentCompanyId(companyMe.id);
        setLocalCompanyName(companyMe.name ?? null);
        onCompanyChange?.({ id: companyMe.id, name: companyMe.name ?? companyMe.id });

        // Extract role for the active company
        const activeMembership = (me.memberships ?? []).find((m) => m.companyId === companyMe.id);
        if (activeMembership?.role) setUserRole(activeMembership.role);
      } else if (companyMe?.id && skipActivation) {
        // Still store the server's active company ID (for API context) but don't update display
        setCurrentCompanyId(companyMe.id);
        const activeMembership = (me.memberships ?? []).find((m) => m.companyId === companyMe.id);
        if (activeMembership?.role) setUserRole(activeMembership.role);
      }
    } catch {
      // Non-fatal — single-tenant users won't need the picker
    }
  }, [onCompanyChange]);

  // ── Data loading ────────────────────────────────────────────────────────

  const loadDataInner = useCallback(async (allCompanies = false) => {
    const [kpiResult, projectsResult, logsResult] = await Promise.allSettled([
      fetchMyKpis("30d").catch(() => null),
      allCompanies
        ? apiJson<Array<{ companyId: string; companyName: string; projects: Array<{ id: string; name: string; status: string }> }>>(
            "/projects/all-affiliated",
          )
            .then((groups) =>
              groups.flatMap((g) =>
                (g.projects ?? []).map(
                  (p) => ({ id: p.id, name: p.name, status: p.status ?? null } as ProjectListItem),
                ),
              ),
            )
            .catch(async () => {
              const cached = await getCache<ProjectListItem[]>("projects.list");
              return cached ?? [];
            })
        : (async () => {
            const cached = await getCache<ProjectListItem[]>("projects.list");
            try {
              const fresh = await apiJson<ProjectListItem[]>("/projects");
              await setCache("projects.list", fresh);
              return fresh;
            } catch {
              return cached ?? [];
            }
          })(),
      fetchDailyLogFeed({ limit: 50, allCompanies }).catch(() => ({
        items: [] as DailyLogListItem[],
        total: 0,
        limit: 50,
        offset: 0,
      })),
    ]);

    if (kpiResult.status === "fulfilled" && kpiResult.value) setKpis(kpiResult.value);
    if (projectsResult.status === "fulfilled") setProjects(projectsResult.value);
    if (logsResult.status === "fulfilled") setRecentLogs(logsResult.value.items);

    // Load favorites + usage scores (non-blocking, best-effort)
    const [favIds, scores] = await Promise.all([
      getFavoriteProjectIds().catch(() => [] as string[]),
      getProjectScores().catch(() => [] as ProjectScore[]),
    ]);
    setFavoriteIds(new Set(favIds));
    const scoreMap = new Map<string, number>();
    for (const s of scores) scoreMap.set(s.projectId, s.score);
    setProjectScoreMap(scoreMap);
  }, []);

  const handleSwitchCompany = useCallback(
    async (companyId: string) => {
      if (companyId === currentCompanyId && !isAllCompaniesMode) {
        setShowCompanyPicker(false);
        return;
      }
      setSwitchingCompanyId(companyId);
      try {
        const res = await apiSwitchCompany(companyId);
        if (res.company) {
          setCurrentCompanyId(res.company.id);
          setLocalCompanyName(res.company.name);
          onCompanyChange?.(res.company);
          void setLastSelectedCompanyId(res.company.id);
        }
        setIsAllCompaniesMode(false);
        setShowCompanyPicker(false);
        // Reload everything for the new tenant (single-company mode)
        setLoading(true);
        await loadDataInner(false);
        setLoading(false);
      } catch {
        // stay on current company
      } finally {
        setSwitchingCompanyId(null);
      }
    },
    [currentCompanyId, isAllCompaniesMode, onCompanyChange, loadDataInner],
  );

  const handleSwitchToAll = useCallback(async () => {
    setIsAllCompaniesMode(true);
    setLocalCompanyName("All Organizations");
    void setLastSelectedCompanyId(null);
    setShowCompanyPicker(false);
    setLoading(true);
    await loadDataInner(true);
    setLoading(false);
  }, [loadDataInner]);

  // Track whether we've already attempted an auto-switch so we don't loop.
  const autoSwitchAttempted = useRef(false);

  useEffect(() => {
    (async () => {
      const lastId = await getLastSelectedCompanyId();

      if (!lastId) {
        // No previous selection — default to "All Organizations" mode
        setIsAllCompaniesMode(true);
        setLocalCompanyName("All Organizations");
        await Promise.all([loadDataInner(true), loadCompanies(true)]);
      } else {
        // Restore last-selected company
        await Promise.all([loadDataInner(false), loadCompanies(false)]);
      }
      setLoading(false);
    })();
  }, [loadDataInner, loadCompanies]);

  // Auto-switch: if a persisted company exists but differs from server default, switch to it.
  useEffect(() => {
    if (autoSwitchAttempted.current) return;
    if (loading) return;
    if (isAllCompaniesMode) return; // Already in All mode — no switch needed
    if (companies.length <= 1) return;

    (async () => {
      const lastId = await getLastSelectedCompanyId();
      if (lastId && lastId !== currentCompanyId && companies.some((c) => c.id === lastId)) {
        autoSwitchAttempted.current = true;
        void handleSwitchCompany(lastId);
      }
    })();
  }, [loading, isAllCompaniesMode, companies, currentCompanyId, handleSwitchCompany]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDataInner(isAllCompaniesMode);
    setRefreshing(false);
  }, [loadDataInner, isAllCompaniesMode]);

  // ── Favorite toggle ──────────────────────────────────────────────────────

  const handleToggleFavorite = useCallback(async (projectId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const added = await toggleFavoriteProject(projectId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (added) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  }, []);

  // ── Status cycling (only used when no project is selected) ────────────

  const cycleStatus = useCallback(() => {
    void Haptics.selectionAsync();
    setStatusFilter((prev) => {
      if (prev === "active") return "closed";
      if (prev === "closed") return "all";
      return "active";
    });
  }, []);

  // ── Project status change (OWNER/ADMIN only) ────────────────────────────

  const canChangeStatus = STATUS_CHANGE_ROLES.has(userRole ?? "");

  const handleChangeProjectStatus = useCallback(
    async (newStatus: string) => {
      if (!filteredProject) return;
      setSavingStatus(true);
      try {
        await apiJson(`/projects/${filteredProject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        // Update local state so UI reflects the change immediately
        const updated = { ...filteredProject, status: newStatus };
        setFilteredProject(updated);
        setProjects((prev) =>
          prev.map((p) => (p.id === filteredProject.id ? { ...p, status: newStatus } : p)),
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSavingStatus(false);
        setShowStatusChangePicker(false);
      }
    },
    [filteredProject],
  );

  // ── Sorted + filtered project list for picker ───────────────────────────

  const sortedPickerProjects = useMemo(() => {
    // 1. Filter by status
    //    "active" includes: active, open, null/empty (default)
    //    "closed" includes: completed, archived, deleted, and anything else non-active
    const ACTIVE_STATUSES = new Set(["active", "open", ""]);
    let filtered = projects;
    if (statusFilter === "active") {
      filtered = projects.filter((p) => ACTIVE_STATUSES.has((p.status ?? "").toLowerCase().trim()));
    } else if (statusFilter === "closed") {
      filtered = projects.filter((p) => !ACTIVE_STATUSES.has((p.status ?? "").toLowerCase().trim()));
    }
    // 2. Filter by search query
    const q = projectSearch.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }
    // 3. Build top 3: favorites first (by frequency), then fill with most-used non-favorites
    const favs = filtered
      .filter((p) => favoriteIds.has(p.id))
      .sort((a, b) => (projectScoreMap.get(b.id) ?? 0) - (projectScoreMap.get(a.id) ?? 0));
    const nonFavs = filtered.filter((p) => !favoriteIds.has(p.id));

    // Take up to 3 favorites
    const top: ProjectListItem[] = favs.slice(0, 3);
    const topIds = new Set(top.map((p) => p.id));

    // Fill remaining top slots (up to 3 total) with highest-frequency non-favorites
    if (top.length < 3) {
      const ranked = nonFavs
        .filter((p) => (projectScoreMap.get(p.id) ?? 0) > 0)
        .sort((a, b) => (projectScoreMap.get(b.id) ?? 0) - (projectScoreMap.get(a.id) ?? 0));
      for (const p of ranked) {
        if (top.length >= 3) break;
        top.push(p);
        topIds.add(p.id);
      }
    }

    // 4. Everything not in top → alphabetical
    const overflowFavs = favs.filter((p) => !topIds.has(p.id));
    const alpha = [...nonFavs.filter((p) => !topIds.has(p.id)), ...overflowFavs]
      .sort((a, b) => a.name.localeCompare(b.name));
    return { topFavs: top, alpha };
  }, [projects, favoriteIds, projectScoreMap, projectSearch, statusFilter]);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // ── Project-specific logs (fetched when a project is selected) ──────────

  const [projectLogs, setProjectLogs] = useState<DailyLogListItem[]>([]);
  const [projectLogsLoading, setProjectLogsLoading] = useState(false);

  useEffect(() => {
    if (!filteredProject) {
      setProjectLogs([]);
      return;
    }
    let cancelled = false;
    setProjectLogsLoading(true);
    fetchDailyLogFeed({ projectIds: [filteredProject.id], limit: 100, allCompanies: isAllCompaniesMode })
      .then((res) => {
        if (!cancelled) setProjectLogs(res.items);
      })
      .catch(() => {
        // Fall back to client-side filter if fetch fails
        if (!cancelled) setProjectLogs(recentLogs.filter((l) => l.projectId === filteredProject.id));
      })
      .finally(() => {
        if (!cancelled) setProjectLogsLoading(false);
      });
    return () => { cancelled = true; };
  }, [filteredProject, isAllCompaniesMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered logs for display ───────────────────────────────────────────

  const displayLogs = useMemo(() => {
    if (filteredProject) return projectLogs;
    // Unfiltered: cap at 20 to keep the feed manageable
    return recentLogs.slice(0, 20);
  }, [recentLogs, filteredProject, projectLogs]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  const kpiCards = kpis
    ? [
        { label: "Daily Logs", icon: "📝", ...kpis.modules.dailyLogs },
        { label: "Tasks", icon: "✅", ...kpis.modules.tasks },
        { label: "Messages", icon: "💬", ...kpis.modules.messages },
        { label: "Timecards", icon: "⏱️", ...kpis.modules.timecards },
      ]
    : [];

  // ── Shared header + picker modals (used in both phone and tablet) ─────────

  const headerBlock = (
    <View style={[styles.header, isTablet && { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow1}>
        <Pressable
          style={styles.tenantBadge}
          onPress={companies.length > 1 ? () => setShowCompanyPicker(true) : undefined}
        >
          <Text style={styles.tenantInitialsText}>{tenantInitials}</Text>
        </Pressable>
        <Pressable
          style={styles.tenantNameBtn}
          onPress={companies.length > 1 ? () => setShowCompanyPicker(true) : undefined}
        >
          <Text style={styles.tenantNameText} numberOfLines={1}>
            {localCompanyName ?? companyName ?? "Dashboard"}
          </Text>
          {companies.length > 1 && <Text style={styles.tenantChevron}>▾</Text>}
        </Pressable>
        {!isTablet && onOpenMap && (
          <Pressable
            style={styles.mapBtnCompact}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onOpenMap();
            }}
          >
            <Text style={styles.mapBtnCompactText}>🗺️</Text>
          </Pressable>
        )}
        {onCreateProject && (
          <Pressable
            style={styles.addBtnCompact}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCreateProject();
            }}
          >
            <Text style={styles.addBtnCompactText}>＋</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.headerRow2}>
        <Pressable
          style={[styles.projectDropdown, filteredProject && styles.projectDropdownActive]}
          onPress={() => {
            void Haptics.selectionAsync();
            setShowProjectFilter(true);
          }}
        >
          <Text
            style={[styles.projectDropdownText, filteredProject && styles.projectDropdownTextActive]}
            numberOfLines={1}
          >
            {filteredProject ? filteredProject.name : "All Projects"}
          </Text>
          <Text style={styles.dropdownChevron}>▾</Text>
        </Pressable>
        {filteredProject ? (
          // Project selected → show that project's actual status
          <Pressable
            style={[styles.statusBtn, { borderColor: projectStatusMeta(filteredProject.status).color }]}
            onPress={
              canChangeStatus
                ? () => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowStatusChangePicker(true);
                  }
                : undefined
            }
          >
            <Text
              style={[styles.statusIcon, { color: projectStatusMeta(filteredProject.status).color }]}
            >
              {projectStatusMeta(filteredProject.status).icon}
            </Text>
          </Pressable>
        ) : (
          // No project selected → cycle through status filter
          <Pressable
            style={[styles.statusBtn, { borderColor: STATUS_META[statusFilter].color }]}
            onPress={cycleStatus}
            onLongPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStatusFilter("active");
            }}
          >
            <Text style={[styles.statusIcon, { color: STATUS_META[statusFilter].color }]}>
              {STATUS_META[statusFilter].icon}
            </Text>
          </Pressable>
        )}
        {filteredProject && (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              handleProjectSelect(null);
            }}
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const pickerModals = (
    <>
      {showCompanyPicker && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowCompanyPicker(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Switch Organization</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {/* All Organizations option */}
              <Pressable
                style={[styles.pickerRow, isAllCompaniesMode && styles.pickerRowActive]}
                onPress={() => void handleSwitchToAll()}
              >
                <Text
                  style={[styles.pickerRowText, isAllCompaniesMode && styles.pickerRowTextActive]}
                  numberOfLines={1}
                >
                  🏢 All Organizations
                </Text>
                {isAllCompaniesMode && <Text style={styles.pickerCheck}>✓</Text>}
              </Pressable>
              <View style={styles.pickerDivider} />
              {companies.map((c) => {
                const isActive = !isAllCompaniesMode && c.id === currentCompanyId;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.pickerRow, isActive && styles.pickerRowActive]}
                    onPress={() => void handleSwitchCompany(c.id)}
                  >
                    <Text
                      style={[styles.pickerRowText, isActive && styles.pickerRowTextActive]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    {switchingCompanyId === c.id && <ActivityIndicator size="small" color={colors.primary} />}
                    {isActive && switchingCompanyId !== c.id && (
                      <Text style={styles.pickerCheck}>✓</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.pickerCloseBtn} onPress={() => setShowCompanyPicker(false)}>
              <Text style={styles.pickerCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {showProjectFilter && (
        <View style={styles.pickerOverlay}>
          <Pressable
            style={styles.pickerBackdrop}
            onPress={() => { setShowProjectFilter(false); setProjectSearch(""); }}
          />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select Project</Text>
            {/* Search input */}
            <TextInput
              style={styles.searchInput}
              placeholder="Search projects..."
              placeholderTextColor={colors.textMuted}
              value={projectSearch}
              onChangeText={setProjectSearch}
              autoFocus
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {/* Status badge row */}
            <View style={styles.statusRow}>
              {(["active", "closed", "all"] as StatusFilter[]).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.statusChip, statusFilter === s && styles.statusChipActive]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setStatusFilter(s);
                  }}
                >
                  <Text style={[styles.statusChipDot, { color: STATUS_META[s].color }]}>
                    {STATUS_META[s].icon}
                  </Text>
                  <Text style={[styles.statusChipText, statusFilter === s && styles.statusChipTextActive]}>
                    {STATUS_META[s].label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {/* All Projects option */}
              <Pressable
                style={[styles.pickerRow, !filteredProject && styles.pickerRowActive]}
                onPress={() => {
                  handleProjectSelect(null);
                  setShowProjectFilter(false);
                  setProjectSearch("");
                }}
              >
                <Text style={[styles.pickerRowText, !filteredProject && styles.pickerRowTextActive]}>
                  📂 All Projects
                </Text>
                {!filteredProject && <Text style={styles.pickerCheck}>✓</Text>}
              </Pressable>

              {/* Top section: favorites by frequency, then most-used */}
              {sortedPickerProjects.topFavs.length > 0 && (
                <Text style={styles.pickerSectionLabel}>
                  {favoriteIds.size > 0 ? "⭐ Favorites" : "🔥 Most Used"}
                </Text>
              )}
              {sortedPickerProjects.topFavs.map((p) => {
                const isSelected = filteredProject?.id === p.id;
                const isFav = favoriteIds.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.pickerRow, isSelected && styles.pickerRowActive]}
                    onPress={() => {
                      handleProjectSelect(p);
                      setShowProjectFilter(false);
                      setProjectSearch("");
                    }}
                  >
                    <Pressable
                      onPress={() => void handleToggleFavorite(p.id)}
                      hitSlop={8}
                      style={styles.favBtn}
                    >
                      <Text style={styles.favIcon}>{isFav ? "❤️" : "🤍"}</Text>
                    </Pressable>
                    <Text
                      style={[styles.pickerRowText, isSelected && styles.pickerRowTextActive, { marginLeft: 6 }]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    {isSelected && <Text style={styles.pickerCheck}>✓</Text>}
                  </Pressable>
                );
              })}

              {/* Divider + alphabetical rest */}
              {sortedPickerProjects.alpha.length > 0 && sortedPickerProjects.topFavs.length > 0 && (
                <View style={styles.pickerDivider} />
              )}
              {sortedPickerProjects.alpha.map((p) => {
                const isSelected = filteredProject?.id === p.id;
                const isFav = favoriteIds.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.pickerRow, isSelected && styles.pickerRowActive]}
                    onPress={() => {
                      handleProjectSelect(p);
                      setShowProjectFilter(false);
                      setProjectSearch("");
                    }}
                  >
                    <Pressable
                      onPress={() => void handleToggleFavorite(p.id)}
                      hitSlop={8}
                      style={styles.favBtn}
                    >
                      <Text style={styles.favIcon}>{isFav ? "❤️" : "🤍"}</Text>
                    </Pressable>
                    <Text
                      style={[styles.pickerRowText, isSelected && styles.pickerRowTextActive, { marginLeft: 6 }]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    {isSelected && <Text style={styles.pickerCheck}>✓</Text>}
                  </Pressable>
                );
              })}

              {sortedPickerProjects.topFavs.length === 0 && sortedPickerProjects.alpha.length === 0 && (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>
                    No {statusFilter === "all" ? "" : statusFilter} projects match "{projectSearch}"
                  </Text>
                </View>
              )}
            </ScrollView>
            <Pressable
              style={styles.pickerCloseBtn}
              onPress={() => { setShowProjectFilter(false); setProjectSearch(""); }}
            >
              <Text style={styles.pickerCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
      {/* Status change picker (OWNER/ADMIN only, project selected) */}
      {showStatusChangePicker && filteredProject && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowStatusChangePicker(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Change Status</Text>
            <Text style={styles.statusChangeSubtitle} numberOfLines={1}>
              {filteredProject.name}
            </Text>
            {PROJECT_STATUS_OPTIONS.map((opt) => {
              const isCurrent =
                opt.value === (filteredProject.status ?? "active").toLowerCase().trim() ||
                (opt.value === "active" && (filteredProject.status ?? "").toLowerCase().trim() === "open");
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.pickerRow, isCurrent && styles.pickerRowActive]}
                  onPress={() => {
                    if (!isCurrent) void handleChangeProjectStatus(opt.value);
                    else setShowStatusChangePicker(false);
                  }}
                  disabled={savingStatus}
                >
                  <Text style={[styles.statusOptionIcon, { color: opt.color }]}>
                    {opt.icon}
                  </Text>
                  <Text
                    style={[
                      styles.pickerRowText,
                      isCurrent && styles.pickerRowTextActive,
                      { marginLeft: 8 },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isCurrent && <Text style={styles.pickerCheck}>✓</Text>}
                  {savingStatus && !isCurrent && (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
            <Pressable
              style={styles.pickerCloseBtn}
              onPress={() => setShowStatusChangePicker(false)}
            >
              <Text style={styles.pickerCloseBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );

  // ── KPI block (shared between phone and tablet) ──────────────────────────

  const kpiBlock = kpis ? (
    <View style={[styles.kpiSection, isTablet && styles.kpiSectionTablet]}>
      {isTablet ? (
        /* Tablet: 2-column × 3-row wrapped grid */
        <View style={styles.kpiGridTablet}>
          {kpiCards.map((card) => (
            <View key={card.label} style={styles.kpiCardTablet}>
              <View style={styles.kpiCardLeft}>
                <Text style={styles.kpiIcon}>{card.icon}</Text>
                <Text style={styles.kpiLabel}>{card.label}</Text>
              </View>
              <View style={styles.kpiCardRight}>
                <Text style={[styles.kpiYou, { color: kpiColor(card.you, card.companyAvg) }]}>
                  {card.you}
                </Text>
                <Text style={styles.kpiAvg}>avg {card.companyAvg}</Text>
              </View>
            </View>
          ))}
          <View
            style={[
              styles.kpiCardTablet,
              {
                backgroundColor:
                  kpis.ranking.dailyLogPercentile >= 70
                    ? "#dcfce7"
                    : kpis.ranking.dailyLogPercentile >= 40
                      ? "#fef9c3"
                      : "#fee2e2",
              },
            ]}
          >
            <Text style={styles.rankingIcon}>🏆</Text>
            <Text
              style={[
                styles.rankingText,
                {
                  color:
                    kpis.ranking.dailyLogPercentile >= 70
                      ? "#166534"
                      : kpis.ranking.dailyLogPercentile >= 40
                        ? "#854d0e"
                        : "#991b1b",
                },
              ]}
              numberOfLines={1}
            >
              {kpis.ranking.label}
            </Text>
          </View>
          <View style={[styles.kpiCardTablet, { justifyContent: "center" }]}>
            <Text style={styles.completionLabel}>Task Completion</Text>
            <Text style={styles.completionValues}>
              <Text
                style={{
                  fontWeight: "800",
                  color: kpiColor(kpis.completionRate.you, kpis.completionRate.companyAvg),
                }}
              >
                {kpis.completionRate.you}%
              </Text>
              {" vs "}
              <Text style={{ color: colors.textMuted }}>{kpis.completionRate.companyAvg}% avg</Text>
            </Text>
          </View>
        </View>
      ) : (
        /* Phone: 2 rows of 3 (unchanged) */
        <>
          <View style={styles.kpiRow}>
            {[kpiCards[0], kpiCards[1]].filter(Boolean).map((card) => (
              <View key={card.label} style={styles.kpiCard}>
                <View style={styles.kpiCardLeft}>
                  <Text style={styles.kpiIcon}>{card.icon}</Text>
                  <Text style={styles.kpiLabel}>{card.label}</Text>
                </View>
                <View style={styles.kpiCardRight}>
                  <Text style={[styles.kpiYou, { color: kpiColor(card.you, card.companyAvg) }]}>
                    {card.you}
                  </Text>
                  <Text style={styles.kpiAvg}>avg {card.companyAvg}</Text>
                </View>
              </View>
            ))}
            <View
              style={[
                styles.rankingPill,
                {
                  backgroundColor:
                    kpis.ranking.dailyLogPercentile >= 70
                      ? "#dcfce7"
                      : kpis.ranking.dailyLogPercentile >= 40
                        ? "#fef9c3"
                        : "#fee2e2",
                },
              ]}
            >
              <Text style={styles.rankingIcon}>🏆</Text>
              <Text
                style={[
                  styles.rankingText,
                  {
                    color:
                      kpis.ranking.dailyLogPercentile >= 70
                        ? "#166534"
                        : kpis.ranking.dailyLogPercentile >= 40
                          ? "#854d0e"
                          : "#991b1b",
                  },
                ]}
                numberOfLines={1}
              >
                {kpis.ranking.label}
              </Text>
            </View>
          </View>
          <View style={styles.kpiRow}>
            {[kpiCards[2], kpiCards[3]].filter(Boolean).map((card) => (
              <View key={card.label} style={styles.kpiCard}>
                <View style={styles.kpiCardLeft}>
                  <Text style={styles.kpiIcon}>{card.icon}</Text>
                  <Text style={styles.kpiLabel}>{card.label}</Text>
                </View>
                <View style={styles.kpiCardRight}>
                  <Text style={[styles.kpiYou, { color: kpiColor(card.you, card.companyAvg) }]}>
                    {card.you}
                  </Text>
                  <Text style={styles.kpiAvg}>avg {card.companyAvg}</Text>
                </View>
              </View>
            ))}
            <View style={styles.completionBox}>
              <Text style={styles.completionLabel}>Task Completion</Text>
              <Text style={styles.completionValues}>
                <Text
                  style={{
                    fontWeight: "800",
                    color: kpiColor(kpis.completionRate.you, kpis.completionRate.companyAvg),
                  }}
                >
                  {kpis.completionRate.you}%
                </Text>
                {" vs "}
                <Text style={{ color: colors.textMuted }}>{kpis.completionRate.companyAvg}% avg</Text>
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  ) : null;

  // ── Activity list (shared) ───────────────────────────────────────────────

  const activityBlock = (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          📋 Recent Activity{filteredProject ? ` (${displayLogs.length})` : ""}
        </Text>
        {filteredProject && (
          <Text style={styles.sectionFilter} numberOfLines={1}>
            {filteredProject.name}
          </Text>
        )}
      </View>
      {projectLogsLoading ? (
        <View style={styles.emptyActivity}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : displayLogs.length === 0 ? (
        <View style={styles.emptyActivity}>
          <Text style={styles.emptyActivityText}>
            {filteredProject ? `No recent logs for ${filteredProject.name}` : "No recent daily logs"}
          </Text>
        </View>
      ) : (
        displayLogs.map((log) => (
          <Pressable
            key={log.id}
            style={styles.activityRow}
            onPress={() => {
              const proj = projects.find((p) => p.id === log.projectId);
              if (proj) {
                void Haptics.selectionAsync();
                void recordUsage(proj.id, "open_project");
                onOpenProject(proj);
              }
            }}
          >
            <View style={styles.activityLeft}>
              <Text style={styles.activityDate}>{formatDate(log.logDate)}</Text>
              {log.type && log.type !== "PUDL" && (
                <Text style={styles.activityType}>
                  {log.type === "RECEIPT_EXPENSE"
                    ? "🧾"
                    : log.type === "JSA"
                      ? "⚠️"
                      : log.type === "INCIDENT"
                        ? "🚨"
                        : "🔍"}
                </Text>
              )}
            </View>
            <View style={styles.activityCenter}>
              <Text style={styles.activityProject} numberOfLines={1}>
                {log.projectName}
              </Text>
              <Text style={styles.activitySummary} numberOfLines={1}>
                {log.workPerformed || log.title || "Daily log"}
              </Text>
            </View>
            <Text style={styles.activityChevron}>›</Text>
          </Pressable>
        ))
      )}
    </>
  );

  // ── TABLET layout: left 1/3 (list) + right 2/3 (map) ────────────────────

  if (isTablet) {
    return (
      <View style={styles.container}>
        {pickerModals}
        <View style={styles.tabletSplit}>
          {/* Left pane: header + KPIs + compact activity list */}
          <View style={styles.tabletLeftPane}>
            {headerBlock}
            <ScrollView
              style={styles.scroll}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {kpiBlock}
              {activityBlock}
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>

          {/* Right pane: full interactive map */}
          <View style={[styles.tabletRightPane, { paddingTop: insets.top }]}>
            <MapScreen onSelectProject={onOpenProject} />
          </View>
        </View>
      </View>
    );
  }

  // ── PHONE layout (unchanged) ─────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {headerBlock}
      {pickerModals}
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {kpiBlock}
        {activityBlock}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundSecondary,
  },
  loadingText: { marginTop: 12, fontSize: 10, color: colors.textMuted },
  scroll: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerRow1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tenantBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tenantInitialsText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  tenantNameBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tenantNameText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textPrimary,
    flexShrink: 1,
  },
  tenantChevron: {
    fontSize: 11,
    color: colors.textMuted,
  },
  addBtnCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnCompactText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  headerRow2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  projectDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    gap: 4,
  },
  projectDropdownActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  projectDropdownText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    flex: 1,
  },
  projectDropdownTextActive: {
    fontWeight: "700",
  },
  dropdownChevron: {
    fontSize: 10,
    color: colors.textMuted,
  },
  statusBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
  },
  statusIcon: {
    fontSize: 12,
    fontWeight: "800",
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  clearBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  // ── Status change picker ────────────────────────────────────────────────
  statusChangeSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 12,
  },
  statusOptionIcon: {
    fontSize: 14,
    fontWeight: "700",
    width: 22,
    textAlign: "center",
  },

  // ── Map icon in header ──────────────────────────────────────────────────
  mapBtnCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  mapBtnCompactText: {
    fontSize: 14,
  },

  // ── KPI Cards (1/3 height — horizontal layout) ─────────────────────────
  kpiSection: {
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 2,
  },
  kpiSectionTablet: {
    paddingHorizontal: 8,
    paddingTop: 12,
    gap: 0,
  },
  kpiGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  kpiCardTablet: {
    width: "48.5%",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 2,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: ROW_HEIGHT,
  },
  kpiCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
    overflow: "hidden",
  },
  kpiIcon: { fontSize: 11 },
  kpiLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  kpiCardRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  kpiYou: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 16,
  },
  kpiAvg: {
    fontSize: 7,
    color: colors.textMuted,
  },

  // ── Ranking (inline with KPI row) ──────────────────────────────────────
  rankingPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    height: ROW_HEIGHT,
    borderRadius: 8,
    gap: 3,
  },
  rankingIcon: { fontSize: 14 },
  rankingText: { fontSize: 10, fontWeight: "700" },
  completionBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: ROW_HEIGHT,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  completionLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  completionValues: { fontSize: 11 },

  // ── Section headers ─────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },
  sectionFilter: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: "600",
    maxWidth: "50%",
  },

  // ── Recent Activity
  emptyActivity: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  emptyActivityText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginBottom: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  activityLeft: {
    width: 40,
    alignItems: "center",
  },
  activityDate: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  activityType: { fontSize: 10, marginTop: 1 },
  activityCenter: { flex: 1, marginLeft: 8 },
  activityProject: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  activitySummary: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 1,
  },
  activityChevron: {
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 6,
  },

  // ── Tablet split layout ─────────────────────────────────────────────────
  tabletSplit: {
    flex: 1,
    flexDirection: "row",
  },
  tabletLeftPane: {
    width: "34%",
    borderRightWidth: 1,
    borderRightColor: colors.borderMuted,
  },
  tabletRightPane: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  tabletMapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  tabletMapTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabletMapTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  tabletMapCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
  },
  tabletMapHeaderBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  tabletMapHeaderBtnText: {
    fontSize: 14,
  },
  tabletMapDropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    gap: 4,
    maxWidth: 200,
  },
  tabletMapDropdownActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  tabletMapDropdownText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    flex: 1,
  },
  tabletMapDropdownTextActive: {
    fontWeight: "700",
  },
  dropdownChev: {
    fontSize: 10,
    color: colors.textMuted,
  },
  tabletMapContainer: {
    flex: 1,
    margin: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  mapPickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  mapPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  mapPickerSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    width: "75%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  // ── Picker (company & project) ──────────────────────────────────────────
  pickerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: "flex-end",
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  searchInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  statusRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  statusChipActive: {
    backgroundColor: "#dbeafe",
    borderColor: colors.primary,
  },
  statusChipDot: {
    fontSize: 8,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  statusChipTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  pickerSectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pickerDivider: {
    height: 1,
    backgroundColor: colors.primary,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    opacity: 0.3,
  },
  favBtn: {
    width: 24,
    alignItems: "center",
  },
  favIcon: {
    fontSize: 14,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerRowActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  pickerRowText: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  pickerRowTextActive: {
    fontWeight: "700",
    color: colors.primary,
  },
  pickerCheck: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "700",
    marginLeft: 8,
  },
  pickerCloseBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
  },
  pickerCloseBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
