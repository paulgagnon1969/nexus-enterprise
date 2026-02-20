import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  Modal,
  ScrollView,
  RefreshControl,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { logout } from "../auth/auth";
import { countPendingOutbox } from "../offline/outbox";
import { syncOnce } from "../offline/sync";
import { getWifiOnlySync, setWifiOnlySync } from "../storage/settings";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";
import {
  fetchDailyLogFeed,
  fetchDailyLogDetail,
  fetchUserProjects,
  updateDailyLog,
  reassignDailyLog,
} from "../api/dailyLog";
import { DirectionsDialog } from "../components/DirectionsDialog";
import type {
  DailyLogListItem,
  DailyLogDetail,
  ProjectListItem,
} from "../types/api";

// Group daily logs by project, keeping only the most recent log per project
interface ProjectWithLatestLog {
  project: ProjectListItem;
  latestLog: DailyLogListItem | null;
  latestLogDate: Date | null;
}

export function HomeScreen({
  onLogout,
  onGoProjects,
  onGoInventory,
  onGoOutbox,
  onCompanyChange,
  triggerSyncOnMount,
  onOpenPetl,
  onOpenDailyLogCreate,
}: {
  onLogout: () => void;
  onGoProjects: () => void;
  onGoInventory: () => void;
  onGoOutbox: () => void;
  onCompanyChange?: (company: { id: string; name: string }) => void;
  triggerSyncOnMount?: boolean;
  onOpenPetl?: (project: ProjectListItem) => void;
  onOpenDailyLogCreate?: (project: ProjectListItem, logType?: string) => void;
}) {
  const { width } = useWindowDimensions();
  const isLandscape = width > 600;

  const [wifiOnly, setWifiOnly] = useState(false);
  const [pending, setPending] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);

  // Tenant / company selection
  const [companies, setCompanies] = useState<
    { id: string; name: string; kind?: string | null }[]
  >([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<string | null>(null);
  const [companySwitchingId, setCompanySwitchingId] = useState<string | null>(null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  // Project feed with daily logs
  const [projectsWithLogs, setProjectsWithLogs] = useState<ProjectWithLatestLog[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Expanded daily log detail
  const [expandedLog, setExpandedLog] = useState<DailyLogDetail | null>(null);
  const [expandedLogLoading, setExpandedLogLoading] = useState(false);
  const [showLogDetail, setShowLogDetail] = useState(false);

  // Editing state for expanded log
  const [editingLog, setEditingLog] = useState(false);
  const [editWorkPerformed, setEditWorkPerformed] = useState("");
  const [editIssues, setEditIssues] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  // Reassignment modal
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [allProjects, setAllProjects] = useState<ProjectListItem[]>([]);
  const [reassigning, setReassigning] = useState(false);

  // Selected project for "Project Home" view
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showDirections, setShowDirections] = useState(false);

  // Clock in/out state
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<Date | null>(null);

  // Daily Log type selector
  const [showDailyLogPicker, setShowDailyLogPicker] = useState(false);

  // Daily log type options — must match DailyLogType enum + production web
  const dailyLogTypes = [
    { id: "PUDL", label: "Daily Log (PUDL)", icon: "📝", description: "Standard daily log entry" },
    { id: "RECEIPT_EXPENSE", label: "Receipt / Expense", icon: "🧾", description: "Attach receipt, auto-OCR vendor & amount" },
    { id: "JSA", label: "Job Safety Assessment", icon: "⚠️", description: "Job safety assessment report" },
    { id: "INCIDENT", label: "Incident Report", icon: "🚨", description: "Report a safety or site incident" },
    { id: "QUALITY", label: "Quality Inspection", icon: "🔍", description: "Quality inspection report" },
  ];

  const refresh = async () => {
    const [w, p] = await Promise.all([getWifiOnlySync(), countPendingOutbox()]);
    setWifiOnly(w);
    setPending(p);
  };

  // Load tenant/company context for the current user.
  const loadCompanies = async () => {
    try {
      setCompanyLoading(true);
      setCompanyMessage(null);

      const me = await getUserMe();
      const membershipCompanies = Array.isArray(me.memberships)
        ? me.memberships.map((m) => ({
            id: m.companyId,
            name: m.company?.name ?? m.companyId,
            kind: (m.company as any)?.kind ?? null,
          }))
        : [];

      // Deduplicate by id in case of overlapping memberships.
      const byId = new Map<string, { id: string; name: string; kind?: string | null }>();
      for (const c of membershipCompanies) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }

      const list = Array.from(byId.values());
      setCompanies(list);

      // Best-effort: fetch the current company context so we know which one is active.
      try {
        const companyMe = await getUserCompanyMe();
        if (companyMe?.id) {
          setCurrentCompanyId(String(companyMe.id));
          setCurrentCompanyName(String(companyMe.name ?? companyMe.id));
        }
      } catch {
        // Non-fatal; we can still render the list without labeling the active org.
      }

      if (!list.length) {
        setCompanyMessage("No organizations found for this user.");
      }
    } catch (e) {
      setCompanyMessage(
        e instanceof Error ? e.message : `Failed to load organizations: ${String(e)}`,
      );
      setCompanies([]);
    } finally {
      setCompanyLoading(false);
    }
  };

  // Load project feed with daily logs
  const loadProjectFeed = useCallback(async () => {
    try {
      setFeedLoading(true);
      const [projects, logsResponse] = await Promise.all([
        fetchUserProjects(),
        fetchDailyLogFeed({ limit: 200 }),
      ]);

      setAllProjects(projects);

      // Group logs by project and find the most recent
      const logsByProject = new Map<string, DailyLogListItem>();
      for (const log of logsResponse.items) {
        const existing = logsByProject.get(log.projectId);
        if (!existing || new Date(log.logDate) > new Date(existing.logDate)) {
          logsByProject.set(log.projectId, log);
        }
      }

      // Create project list with latest log, sorted by most recent log date
      const projectsWithLatest: ProjectWithLatestLog[] = projects.map((project) => {
        const latestLog = logsByProject.get(project.id) || null;
        return {
          project,
          latestLog,
          latestLogDate: latestLog ? new Date(latestLog.logDate) : null,
        };
      });

      // Sort: projects with logs first (newest to oldest), then projects without logs
      projectsWithLatest.sort((a, b) => {
        if (a.latestLogDate && b.latestLogDate) {
          return b.latestLogDate.getTime() - a.latestLogDate.getTime();
        }
        if (a.latestLogDate) return -1;
        if (b.latestLogDate) return 1;
        return a.project.name.localeCompare(b.project.name);
      });

      setProjectsWithLogs(projectsWithLatest);
    } catch (e) {
      console.error("Failed to load project feed:", e);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadCompanies();
    void loadProjectFeed();
  }, [loadProjectFeed]);

  // Auto-sync when navigating here with triggerSyncOnMount
  useEffect(() => {
    if (triggerSyncOnMount) {
      void runSync();
    }
  }, [triggerSyncOnMount]);

  // Notify parent of company changes and reload feed
  useEffect(() => {
    if (currentCompanyId && currentCompanyName && onCompanyChange) {
      onCompanyChange({ id: currentCompanyId, name: currentCompanyName });
      void loadProjectFeed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompanyId, currentCompanyName]);

  const toggleWifiOnly = async (next: boolean) => {
    setWifiOnly(next);
    await setWifiOnlySync(next);
  };

  const runSync = async () => {
    setSyncing(true);
    setLastSyncMsg(null);
    try {
      const res = await syncOnce();
      if (res.skippedReason) {
        setLastSyncMsg(`Skipped: ${res.skippedReason}`);
      } else {
        const msg = res.failed > 0 ? `${res.processed}↑ ${res.failed}!` : `${res.processed}↑`;
        setLastSyncMsg(msg);
      }
    } catch (e) {
      setLastSyncMsg("Error");
    } finally {
      setSyncing(false);
      await refresh();
    }
  };

  const handleSelectCompany = async (companyId: string) => {
    if (!companyId || companyId === currentCompanyId) return;
    setCompanySwitchingId(companyId);
    setCompanyMessage(null);
    try {
      const res = await apiSwitchCompany(companyId);
      if (res.company?.id) {
        setCurrentCompanyId(res.company.id);
        setCurrentCompanyName(res.company.name ?? res.company.id);
      }
    } catch (e) {
      setCompanyMessage(
        e instanceof Error ? e.message : `Failed to switch: ${String(e)}`,
      );
    } finally {
      setCompanySwitchingId(null);
    }
  };

  const doLogout = async () => {
    await logout();
    onLogout();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadProjectFeed()]);
    setRefreshing(false);
  }, [loadProjectFeed]);

  // Open daily log detail
  const openLogDetail = async (logId: string) => {
    setExpandedLogLoading(true);
    setShowLogDetail(true);
    try {
      const detail = await fetchDailyLogDetail(logId);
      setExpandedLog(detail);
      setEditWorkPerformed(detail.workPerformed || "");
      setEditIssues(detail.issues || "");
    } catch (e) {
      console.error("Failed to load log detail:", e);
      setShowLogDetail(false);
    } finally {
      setExpandedLogLoading(false);
    }
  };

  // Save edited log
  const saveLogEdits = async () => {
    if (!expandedLog) return;
    setSavingLog(true);
    try {
      const updated = await updateDailyLog(expandedLog.id, {
        workPerformed: editWorkPerformed,
        issues: editIssues,
      });
      setExpandedLog(updated);
      setEditingLog(false);
      void loadProjectFeed();
    } catch (e) {
      console.error("Failed to save log:", e);
    } finally {
      setSavingLog(false);
    }
  };

  // Reassign log to different project
  const handleReassign = async (targetProjectId: string) => {
    if (!expandedLog) return;
    setReassigning(true);
    try {
      const updated = await reassignDailyLog(expandedLog.id, targetProjectId);
      setExpandedLog(updated);
      setShowReassignModal(false);
      void loadProjectFeed();
    } catch (e) {
      console.error("Failed to reassign log:", e);
    } finally {
      setReassigning(false);
    }
  };

  const closeLogDetail = () => {
    setShowLogDetail(false);
    setExpandedLog(null);
    setEditingLog(false);
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Clock in/out handler
  const handleClockToggle = () => {
    if (clockedIn) {
      setClockedIn(false);
      setClockInTime(null);
      // TODO: Send clock out to API
    } else {
      setClockedIn(true);
      setClockInTime(new Date());
      // TODO: Send clock in to API
    }
  };

  // Format elapsed time
  const getElapsedTime = () => {
    if (!clockInTime) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Build project address string
  const getProjectAddress = (project: ProjectListItem) => {
    const parts = [
      project.addressLine1,
      project.city,
      project.state,
      project.postalCode,
    ].filter(Boolean);
    return parts.join(", ");
  };

  return (
    <View style={styles.container}>
      {/* Header row: org/project dropdown left, sync center, wifi/pending right */}
      <View style={[styles.headerRow, isLandscape && styles.headerRowLandscape]}>
        {/* Left: Combined Org + Project dropdown */}
        <Pressable
          style={styles.orgDropdown}
          onPress={() => setShowProjectPicker(true)}
          disabled={companyLoading || feedLoading}
        >
          <Text style={styles.orgDropdownText} numberOfLines={1}>
            {selectedProject
              ? selectedProject.name
              : currentCompanyName || "Select..."}
          </Text>
          <Text style={styles.orgDropdownArrow}>▼</Text>
        </Pressable>

        {/* Center: Sync bar (flex) */}
        <Pressable
          style={[styles.syncBar, syncing && styles.syncBarActive]}
          onPress={runSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#1e3a8a" />
          ) : (
            <Text style={styles.syncBarText}>
              {lastSyncMsg || "Sync"}
            </Text>
          )}
        </Pressable>

        {/* Right: WiFi toggle + pending count */}
        <View style={styles.rightControls}>
          <View style={styles.wifiRow}>
            <Text style={styles.wifiLabel}>WiFi</Text>
            <Switch
              value={wifiOnly}
              onValueChange={toggleWifiOnly}
              style={styles.wifiSwitch}
            />
          </View>
          {pending > 0 && (
            <Pressable onPress={onGoOutbox}>
              <Text style={styles.pendingBadge}>{pending} pending</Text>
            </Pressable>
          )}
        </View>
      </View>

      {companyMessage && <Text style={styles.companyMessage}>{companyMessage}</Text>}

      {/* CONDITIONAL: Project Home View OR Project Feed */}
      {selectedProject ? (
        // === PROJECT HOME VIEW ===
        <ScrollView
          style={styles.feedContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Project Header */}
          <View style={styles.projectHeader}>
            <Text style={styles.projectHeaderName}>{selectedProject.name}</Text>
            {getProjectAddress(selectedProject) && (
              <Text style={styles.projectHeaderAddress}>
                {getProjectAddress(selectedProject)}
              </Text>
            )}
          </View>

          {/* Daily Log Button */}
          <View style={styles.dailyLogSection}>
            <Pressable
              style={styles.dailyLogButton}
              onPress={() => setShowDailyLogPicker(true)}
            >
              <Text style={styles.dailyLogButtonIcon}>📋</Text>
              <View style={styles.dailyLogButtonContent}>
                <Text style={styles.dailyLogButtonText}>Add Daily Log</Text>
                <Text style={styles.dailyLogButtonSubtext}>Select log type</Text>
              </View>
              <Text style={styles.dailyLogButtonArrow}>▼</Text>
            </Pressable>
          </View>

          {/* Clock In/Out */}
          <View style={styles.clockSection}>
            <Pressable
              style={[
                styles.clockButton,
                clockedIn ? styles.clockButtonOut : styles.clockButtonIn,
              ]}
              onPress={handleClockToggle}
            >
              <Text style={styles.clockButtonIcon}>
                {clockedIn ? "⏹️" : "▶️"}
              </Text>
              <View>
                <Text style={styles.clockButtonText}>
                  {clockedIn ? "Clock Out" : "Clock In"}
                </Text>
                {clockedIn && clockInTime && (
                  <Text style={styles.clockElapsed}>{getElapsedTime()}</Text>
                )}
              </View>
            </Pressable>
          </View>

          {/* Directions */}
          {(selectedProject.latitude || selectedProject.addressLine1) && (
            <Pressable
              style={styles.actionCard}
              onPress={() => setShowDirections(true)}
            >
              <Text style={styles.actionCardIcon}>🗺️</Text>
              <View style={styles.actionCardContent}>
                <Text style={styles.actionCardTitle}>Get Directions</Text>
                <Text style={styles.actionCardSubtitle}>
                  Open in your preferred maps app
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}

          {/* TODOs Section */}
          <View style={styles.todosSection}>
            <Text style={styles.todosSectionTitle}>Today's Tasks</Text>
            <View style={styles.todoPlaceholder}>
              <Text style={styles.todoPlaceholderIcon}>📋</Text>
              <Text style={styles.todoPlaceholderText}>
                No tasks assigned for today
              </Text>
            </View>
          </View>

          {/* Recent Activity */}
          <View style={styles.recentSection}>
            <Text style={styles.recentSectionTitle}>Recent Logs</Text>
            {projectsWithLogs
              .filter((p) => p.project.id === selectedProject.id && p.latestLog)
              .map((item) => (
                <Pressable
                  key={item.latestLog!.id}
                  style={styles.recentLogRow}
                  onPress={() => openLogDetail(item.latestLog!.id)}
                >
                  <Text style={styles.recentLogDate}>
                    {formatDate(item.latestLog!.logDate)}
                  </Text>
                  <Text style={styles.recentLogSummary} numberOfLines={1}>
                    {item.latestLog!.workPerformed || item.latestLog!.title || "Daily log"}
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* Back to all projects */}
          <Pressable
            style={styles.backToAllBtn}
            onPress={() => setSelectedProject(null)}
          >
            <Text style={styles.backToAllText}>← View All Projects</Text>
          </Pressable>

          {/* Logout */}
          <Pressable style={styles.logout} onPress={doLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </ScrollView>
      ) : (
        // === PROJECT FEED VIEW ===
        <ScrollView
          style={styles.feedContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {feedLoading && !refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1e3a8a" />
              <Text style={styles.loadingText}>Loading projects...</Text>
            </View>
          ) : projectsWithLogs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No projects found</Text>
            </View>
          ) : (
            projectsWithLogs.map((item) => (
              <Pressable
                key={item.project.id}
                style={styles.projectRow}
                onPress={() => setSelectedProject(item.project)}
              >
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName} numberOfLines={1}>
                    {item.project.name}
                  </Text>
                  {item.latestLog ? (
                    <Text style={styles.logSummary} numberOfLines={1}>
                      {formatDate(item.latestLog.logDate)}
                      {item.latestLog.workPerformed
                        ? ` — ${item.latestLog.workPerformed}`
                        : item.latestLog.title
                        ? ` — ${item.latestLog.title}`
                        : ""}
                    </Text>
                  ) : (
                    <Text style={styles.noLogText}>No daily logs yet</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))
          )}

          {/* Logout at bottom */}
          <Pressable style={styles.logout} onPress={doLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Organization picker modal */}
      <Modal
        visible={showCompanyPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCompanyPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Organization</Text>
              <Pressable onPress={() => setShowCompanyPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {companies.map((c) => {
                const selected = c.id === currentCompanyId;
                const switching = companySwitchingId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.tenantOption, selected && styles.tenantOptionSelected]}
                    onPress={async () => {
                      await handleSelectCompany(c.id);
                      setShowCompanyPicker(false);
                    }}
                    disabled={switching}
                  >
                    <Text style={[styles.tenantOptionText, selected && styles.tenantOptionTextSelected]}>
                      {c.name}
                    </Text>
                    {selected && <Text style={styles.tenantOptionCheck}>✓</Text>}
                    {switching && <Text style={styles.tenantOptionSwitching}>...</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Daily log detail modal (full screen) */}
      <Modal
        visible={showLogDetail}
        animationType="slide"
        onRequestClose={closeLogDetail}
      >
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <Pressable onPress={closeLogDetail} style={styles.detailBackBtn}>
              <Text style={styles.detailBackText}>← Back</Text>
            </Pressable>
            <Text style={styles.detailTitle} numberOfLines={1}>
              {expandedLog?.projectName || "Daily Log"}
            </Text>
            <Pressable
              onPress={() => setShowReassignModal(true)}
              style={styles.reassignBtn}
              disabled={!expandedLog}
            >
              <Text style={styles.reassignBtnText}>Move</Text>
            </Pressable>
          </View>

          {expandedLogLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1e3a8a" />
            </View>
          ) : expandedLog ? (
            <ScrollView style={styles.detailBody}>
              <View style={styles.detailMeta}>
                <Text style={styles.detailDate}>
                  {formatDate(expandedLog.logDate)}
                </Text>
                <Text style={styles.detailAuthor}>
                  by {expandedLog.createdByUser?.firstName || expandedLog.createdByUser?.email || "Unknown"}
                </Text>
              </View>

              {editingLog ? (
                <>
                  <Text style={styles.fieldLabel}>Work Performed</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editWorkPerformed}
                    onChangeText={setEditWorkPerformed}
                    multiline
                    placeholder="Describe work performed..."
                  />

                  <Text style={styles.fieldLabel}>Issues</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editIssues}
                    onChangeText={setEditIssues}
                    multiline
                    placeholder="Any issues encountered..."
                  />

                  <View style={styles.editActions}>
                    <Pressable
                      style={styles.cancelBtn}
                      onPress={() => {
                        setEditingLog(false);
                        setEditWorkPerformed(expandedLog.workPerformed || "");
                        setEditIssues(expandedLog.issues || "");
                      }}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.saveBtn, savingLog && styles.saveBtnDisabled]}
                      onPress={saveLogEdits}
                      disabled={savingLog}
                    >
                      <Text style={styles.saveBtnText}>
                        {savingLog ? "Saving..." : "Save"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  {expandedLog.workPerformed && (
                    <>
                      <Text style={styles.fieldLabel}>Work Performed</Text>
                      <Text style={styles.fieldValue}>{expandedLog.workPerformed}</Text>
                    </>
                  )}

                  {expandedLog.issues && (
                    <>
                      <Text style={styles.fieldLabel}>Issues</Text>
                      <Text style={styles.fieldValue}>{expandedLog.issues}</Text>
                    </>
                  )}

                  {expandedLog.weatherSummary && (
                    <>
                      <Text style={styles.fieldLabel}>Weather</Text>
                      <Text style={styles.fieldValue}>{expandedLog.weatherSummary}</Text>
                    </>
                  )}

                  {expandedLog.crewOnSite && (
                    <>
                      <Text style={styles.fieldLabel}>Crew On Site</Text>
                      <Text style={styles.fieldValue}>{expandedLog.crewOnSite}</Text>
                    </>
                  )}

                  {expandedLog.safetyIncidents && (
                    <>
                      <Text style={styles.fieldLabel}>Safety Incidents</Text>
                      <Text style={styles.fieldValue}>{expandedLog.safetyIncidents}</Text>
                    </>
                  )}

                  <Pressable style={styles.editBtn} onPress={() => setEditingLog(true)}>
                    <Text style={styles.editBtnText}>Edit Log</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {/* Reassign project modal */}
      <Modal
        visible={showReassignModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReassignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Move to Project</Text>
              <Pressable onPress={() => setShowReassignModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.reassignWarning}>
              Moving will clear location context (building, unit, room, SOW item)
            </Text>
            <ScrollView style={styles.modalBody}>
              {allProjects
                .filter((p) => p.id !== expandedLog?.projectId)
                .map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.tenantOption}
                    onPress={() => handleReassign(p.id)}
                    disabled={reassigning}
                  >
                    <Text style={styles.tenantOptionText}>{p.name}</Text>
                    {reassigning && <ActivityIndicator size="small" />}
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Combined Org + Project picker modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select</Text>
              <Pressable onPress={() => setShowProjectPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {/* Organizations Section */}
              <Text style={styles.pickerSectionTitle}>Organizations</Text>
              {companies.map((c) => {
                const selected = c.id === currentCompanyId && !selectedProject;
                const switching = companySwitchingId === c.id;
                return (
                  <Pressable
                    key={`org-${c.id}`}
                    style={[styles.tenantOption, selected && styles.tenantOptionSelected]}
                    onPress={async () => {
                      await handleSelectCompany(c.id);
                      setSelectedProject(null);
                      setShowProjectPicker(false);
                    }}
                    disabled={switching}
                  >
                    <Text style={[styles.tenantOptionText, selected && styles.tenantOptionTextSelected]}>
                      🏢 {c.name}
                    </Text>
                    {selected && <Text style={styles.tenantOptionCheck}>✓</Text>}
                    {switching && <Text style={styles.tenantOptionSwitching}>...</Text>}
                  </Pressable>
                );
              })}

              {/* Projects Section */}
              {allProjects.length > 0 && (
                <>
                  <Text style={styles.pickerSectionTitle}>Projects</Text>
                  {allProjects.map((p) => {
                    const selected = selectedProject?.id === p.id;
                    return (
                      <Pressable
                        key={`proj-${p.id}`}
                        style={[styles.tenantOption, selected && styles.tenantOptionSelected]}
                        onPress={() => {
                          setSelectedProject(p);
                          setShowProjectPicker(false);
                        }}
                      >
                        <Text style={[styles.tenantOptionText, selected && styles.tenantOptionTextSelected]}>
                          📋 {p.name}
                        </Text>
                        {selected && <Text style={styles.tenantOptionCheck}>✓</Text>}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Daily Log Type Picker Modal */}
      <Modal
        visible={showDailyLogPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDailyLogPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Daily Log</Text>
              <Pressable onPress={() => setShowDailyLogPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {dailyLogTypes.map((type) => (
                <Pressable
                  key={type.id}
                  style={styles.dailyLogTypeOption}
                  onPress={() => {
                    setShowDailyLogPicker(false);
                    if (!selectedProject) return;
                    onOpenDailyLogCreate?.(selectedProject, type.id);
                  }}
                >
                  <Text style={styles.dailyLogTypeIcon}>{type.icon}</Text>
                  <View style={styles.dailyLogTypeContent}>
                    <Text style={styles.dailyLogTypeLabel}>{type.label}</Text>
                    <Text style={styles.dailyLogTypeDesc}>{type.description}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Directions dialog */}
      {selectedProject && (
        <DirectionsDialog
          visible={showDirections}
          onClose={() => setShowDirections(false)}
          destination={{
            latitude: selectedProject.latitude,
            longitude: selectedProject.longitude,
            address: getProjectAddress(selectedProject),
            name: selectedProject.name,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff", paddingTop: 50 },

  // Header row styles
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  headerRowLandscape: {
    paddingHorizontal: 24,
    gap: 16,
  },

  // Organization/Project dropdown (left) - dynamic width based on content
  orgDropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexShrink: 0,
    maxWidth: "60%",
  },
  orgDropdownText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
    marginRight: 4,
    flexShrink: 1,
  },
  orgDropdownArrow: {
    fontSize: 10,
    color: "#6b7280",
    marginLeft: 2,
  },

  // Sync bar (center, flexible - shrinks to fit)
  syncBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 36,
    minWidth: 50,
  },
  syncBarActive: {
    backgroundColor: "#dbeafe",
  },
  syncBarText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e3a8a",
  },

  // Right controls (WiFi + pending)
  rightControls: {
    alignItems: "flex-end",
  },
  wifiRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wifiLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginRight: 4,
  },
  wifiSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  pendingBadge: {
    fontSize: 10,
    color: "#d97706",
    fontWeight: "600",
    marginTop: 2,
  },

  companyMessage: {
    fontSize: 11,
    color: "#059669",
    paddingHorizontal: 12,
    marginBottom: 4,
  },

  // Feed container - add bottom padding for tab bar
  feedContainer: {
    flex: 1,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: "#6b7280",
  },

  // Project row
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  logSummary: {
    fontSize: 13,
    color: "#6b7280",
  },
  noLogText: {
    fontSize: 13,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  chevron: {
    fontSize: 22,
    color: "#9ca3af",
    marginLeft: 8,
  },

  // Logout
  logout: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 80,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
  },
  logoutText: { color: "#991b1b", fontWeight: "700" },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  modalClose: {
    fontSize: 20,
    color: "#6b7280",
    padding: 4,
  },
  modalBody: {
    padding: 8,
    paddingBottom: 24,
    maxHeight: 400,
  },
  tenantOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 10,
    marginVertical: 4,
  },
  tenantOptionSelected: {
    backgroundColor: "#eff6ff",
  },
  tenantOptionText: {
    fontSize: 16,
    color: "#1f2937",
  },
  tenantOptionTextSelected: {
    fontWeight: "700",
    color: "#1e3a8a",
  },
  tenantOptionCheck: {
    fontSize: 18,
    color: "#1e3a8a",
    fontWeight: "700",
  },
  tenantOptionSwitching: {
    fontSize: 14,
    color: "#6b7280",
  },

  // Detail modal (full screen)
  detailContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingTop: 50,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  detailBackBtn: {
    paddingRight: 12,
  },
  detailBackText: {
    fontSize: 16,
    color: "#1e3a8a",
    fontWeight: "600",
  },
  detailTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center",
  },
  reassignBtn: {
    paddingLeft: 12,
  },
  reassignBtnText: {
    fontSize: 14,
    color: "#1e3a8a",
    fontWeight: "600",
  },
  detailBody: {
    flex: 1,
    padding: 16,
  },
  detailMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  detailDate: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
    marginRight: 12,
  },
  detailAuthor: {
    fontSize: 14,
    color: "#6b7280",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 6,
  },
  fieldValue: {
    fontSize: 15,
    color: "#1f2937",
    lineHeight: 22,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#1f2937",
    minHeight: 100,
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  cancelBtnText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "600",
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1e3a8a",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "600",
  },
  editBtn: {
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#1e3a8a",
    alignItems: "center",
  },
  editBtnText: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "600",
  },
  reassignWarning: {
    fontSize: 13,
    color: "#d97706",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fef3c7",
  },

  // Picker section titles
  pickerSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Project Home styles
  projectHeader: {
    padding: 16,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  projectHeaderName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 4,
  },
  projectHeaderAddress: {
    fontSize: 14,
    color: "#6b7280",
  },

  // Daily Log section
  dailyLogSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dailyLogButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#1e3a8a",
    gap: 12,
  },
  dailyLogButtonIcon: {
    fontSize: 28,
  },
  dailyLogButtonContent: {
    flex: 1,
  },
  dailyLogButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  dailyLogButtonSubtext: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  dailyLogButtonArrow: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
  },

  // Daily Log Type picker options
  dailyLogTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 10,
    marginVertical: 4,
    backgroundColor: "#f9fafb",
  },
  dailyLogTypeIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  dailyLogTypeContent: {
    flex: 1,
  },
  dailyLogTypeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  dailyLogTypeDesc: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },

  // Clock section
  clockSection: {
    padding: 16,
  },
  clockButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  clockButtonIn: {
    backgroundColor: "#dcfce7",
  },
  clockButtonOut: {
    backgroundColor: "#fee2e2",
  },
  clockButtonIcon: {
    fontSize: 28,
  },
  clockButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  clockElapsed: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },

  // Action card (directions)
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
  },
  actionCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  actionCardContent: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
  },
  actionCardSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },

  // TODOs section
  todosSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  todosSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  todoPlaceholder: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  todoPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  todoPlaceholderText: {
    fontSize: 14,
    color: "#9ca3af",
  },

  // Recent logs section
  recentSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  recentSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  recentLogRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 8,
  },
  recentLogDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e3a8a",
    marginRight: 12,
    minWidth: 60,
  },
  recentLogSummary: {
    flex: 1,
    fontSize: 13,
    color: "#6b7280",
  },

  // Back to all projects
  backToAllBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    alignItems: "center",
  },
  backToAllText: {
    fontSize: 14,
    color: "#1e3a8a",
    fontWeight: "600",
  },
});
