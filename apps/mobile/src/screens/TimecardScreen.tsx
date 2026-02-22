import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";
import type { ProjectListItem, UserMeResponse } from "../types/api";
import type {
  ClockStatus,
  RecentTimeEntry,
  CrewTimecardResponse,
  CrewTimecardEntry,
} from "../api/timecard";
import {
  getCrewTimecard,
  editCrewEntry,
  approveTimecard,
  superApproveTimecard,
  payrollApproveTimecard,
} from "../api/timecard";

export function TimecardScreen() {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentTimeEntry[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // Tenant / company selection
  const [companies, setCompanies] = useState<
    { id: string; name: string; kind?: string | null }[]
  >([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string | null>(null);
  const [companySwitchingId, setCompanySwitchingId] = useState<string | null>(null);

  // Crew review state (Foreman+ only)
  const [isForeman, setIsForeman] = useState(false);
  const [crewDate, setCrewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [crewTimecard, setCrewTimecard] = useState<CrewTimecardResponse | null>(null);
  const [crewLoading, setCrewLoading] = useState(false);
  const [crewApproving, setCrewApproving] = useState(false);
  const [showEditEntry, setShowEditEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CrewTimecardEntry | null>(null);
  const [editTimeIn, setEditTimeIn] = useState("");
  const [editTimeOut, setEditTimeOut] = useState("");
  const [editSt, setEditSt] = useState("");
  const [editOt, setEditOt] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  // Timer for elapsed time display
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedTime = useMemo(() => {
    if (!status?.isClockedIn || !status.clockedInAt) return null;
    const start = new Date(status.clockedInAt).getTime();
    const diff = Math.max(0, now - start);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, [status, now]);

  // Profile-level constants matching API PROFILE_LEVELS
  const FOREMAN_PROFILES = new Set(["FOREMAN", "SUPERINTENDENT", "PM", "EXECUTIVE"]);
  const SUPER_PROFILES = new Set(["SUPERINTENDENT", "PM", "EXECUTIVE"]);
  const PAYROLL_PROFILES = new Set(["PM", "EXECUTIVE"]);

  // Load tenant/company context + detect role
  const loadCompanies = useCallback(async () => {
    try {
      const me = await getUserMe();
      const membershipCompanies = Array.isArray(me.memberships)
        ? me.memberships.map((m) => ({
            id: m.companyId,
            name: m.company?.name ?? m.companyId,
            kind: (m.company as any)?.kind ?? null,
            role: m.role,
          }))
        : [];

      const byId = new Map<string, { id: string; name: string; kind?: string | null }>();
      for (const c of membershipCompanies) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
      setCompanies(Array.from(byId.values()));

      // Detect if user is Foreman+ (OWNER/ADMIN always qualifies)
      const currentMembership = membershipCompanies[0];
      const userRole = currentMembership?.role;
      if (userRole === "OWNER" || userRole === "ADMIN") {
        setIsForeman(true);
      }

      try {
        const companyMe = await getUserCompanyMe();
        if (companyMe?.id) {
          setCurrentCompanyId(String(companyMe.id));
          setCurrentCompanyName(String(companyMe.name ?? companyMe.id));
        }
      } catch {
        // Non-fatal
      }
    } catch {
      setCompanies([]);
    }
  }, []);

  const handleSelectCompany = async (companyId: string) => {
    if (!companyId || companyId === currentCompanyId) return;
    setCompanySwitchingId(companyId);
    setMessage(null);
    try {
      const res = await apiSwitchCompany(companyId);
      if (res.company?.id) {
        setCurrentCompanyId(res.company.id);
        setCurrentCompanyName(res.company.name ?? res.company.id);
      }
      // Clear project (belongs to old tenant) and reload
      setSelectedProjectId(null);
      setStatus(null);
      setRecentEntries([]);
      await loadTimecardData();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `Failed to switch: ${String(e)}`);
    } finally {
      setCompanySwitchingId(null);
    }
  };

  const loadTimecardData = useCallback(async () => {
    setLoading(true);
    try {
      // Load cached data first
      const [cachedStatus, cachedRecent, cachedProjects] = await Promise.all([
        getCache<ClockStatus>("timecard.status"),
        getCache<RecentTimeEntry[]>("timecard.recent"),
        getCache<ProjectListItem[]>("projects.list"),
      ]);

      if (cachedStatus) setStatus(cachedStatus);
      if (cachedRecent) setRecentEntries(cachedRecent);
      if (cachedProjects) setProjects(cachedProjects);

      // Fetch fresh data
      const [freshStatus, freshRecent, freshProjects] = await Promise.all([
        apiJson<ClockStatus>("/timecard/me/status").catch(() => cachedStatus),
        apiJson<RecentTimeEntry[]>("/timecard/me/recent").catch(() => cachedRecent ?? []),
        apiJson<ProjectListItem[]>("/projects").catch(() => cachedProjects ?? []),
      ]);

      if (freshStatus) {
        setStatus(freshStatus);
        await setCache("timecard.status", freshStatus);
      }
      if (freshRecent) {
        setRecentEntries(freshRecent);
        await setCache("timecard.recent", freshRecent);
      }
      if (freshProjects) {
        setProjects(freshProjects);
        await setCache("projects.list", freshProjects);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load crew timecard when project + date changes
  const loadCrewTimecard = useCallback(async () => {
    if (!selectedProjectId || !isForeman) return;
    setCrewLoading(true);
    try {
      const data = await getCrewTimecard(selectedProjectId, crewDate);
      setCrewTimecard(data);
    } catch {
      // Not authorized or no data — hide crew section gracefully
      setCrewTimecard(null);
    } finally {
      setCrewLoading(false);
    }
  }, [selectedProjectId, crewDate, isForeman]);

  useEffect(() => {
    void loadCompanies();
    void loadTimecardData();
  }, [loadCompanies, loadTimecardData]);

  // Reload crew when project or date changes
  useEffect(() => {
    void loadCrewTimecard();
  }, [loadCrewTimecard]);

  const handleClockIn = async () => {
    if (!selectedProjectId) {
      setMessage("Please select a project first");
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      // Try online first
      const result = await apiJson<ClockStatus>("/timecard/me/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
        }),
      });

      setStatus(result);
      await setCache("timecard.status", result);
      setMessage("Clocked in successfully!");
    } catch (e) {
      // Queue offline
      const project = projects.find((p) => p.id === selectedProjectId);
      await enqueueOutbox("timecard.clockIn", {
        projectId: selectedProjectId,
        timestamp: new Date().toISOString(),
      });

      // Optimistic update
      setStatus({
        isClockedIn: true,
        currentEntry: null,
        projectId: selectedProjectId,
        projectName: project?.name ?? selectedProjectId,
        clockedInAt: new Date().toISOString(),
      });

      setMessage("Saved offline. Will sync when connected.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!status?.projectId) return;

    setActionLoading(true);
    setMessage(null);

    try {
      // Try online first
      const result = await apiJson<ClockStatus>("/timecard/me/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: status.projectId,
        }),
      });

      setStatus(result);
      await setCache("timecard.status", result);
      setMessage("Clocked out successfully!");
      
      // Refresh recent entries
      void loadTimecardData();
    } catch (e) {
      // Queue offline
      await enqueueOutbox("timecard.clockOut", {
        projectId: status.projectId,
        timestamp: new Date().toISOString(),
        clockedInAt: status.clockedInAt,
      });

      // Optimistic update
      setStatus({
        isClockedIn: false,
        currentEntry: null,
        projectId: null,
        projectName: null,
        clockedInAt: null,
      });

      setMessage("Saved offline. Will sync when connected.");
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  // Crew date navigation
  const shiftCrewDate = (days: number) => {
    const d = new Date(crewDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    setCrewDate(d.toISOString().slice(0, 10));
  };

  // Open edit modal for a crew entry
  const openEditEntry = (entry: CrewTimecardEntry) => {
    setEditingEntry(entry);
    setEditTimeIn(entry.timeIn ? new Date(entry.timeIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
    setEditTimeOut(entry.timeOut ? new Date(entry.timeOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
    setEditSt(String(entry.stHours));
    setEditOt(String(entry.otHours));
    setShowEditEntry(true);
  };

  // Save edited entry
  const handleSaveEntry = async () => {
    if (!editingEntry) return;
    setSavingEntry(true);
    try {
      const data: any = {};
      // Parse time strings to ISO if provided
      if (editTimeIn) {
        const [h, m] = editTimeIn.split(":").map(Number);
        const d = new Date(crewDate + "T00:00:00");
        d.setHours(h, m, 0, 0);
        data.timeIn = d.toISOString();
      }
      if (editTimeOut) {
        const [h, m] = editTimeOut.split(":").map(Number);
        const d = new Date(crewDate + "T00:00:00");
        d.setHours(h, m, 0, 0);
        data.timeOut = d.toISOString();
      }
      if (editSt) data.stHours = parseFloat(editSt);
      if (editOt) data.otHours = parseFloat(editOt);

      await editCrewEntry(editingEntry.id, data);
      setShowEditEntry(false);
      setEditingEntry(null);
      await loadCrewTimecard();
      setMessage("Entry updated.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save entry");
    } finally {
      setSavingEntry(false);
    }
  };

  // Approve timecard (foreman level)
  const handleApprove = async () => {
    if (!crewTimecard?.id) return;
    setCrewApproving(true);
    try {
      await approveTimecard(crewTimecard.id);
      await loadCrewTimecard();
      setMessage("Timecard approved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setCrewApproving(false);
    }
  };

  // Super-approve
  const handleSuperApprove = async () => {
    if (!crewTimecard?.id) return;
    setCrewApproving(true);
    try {
      await superApproveTimecard(crewTimecard.id);
      await loadCrewTimecard();
      setMessage("Superintendent approval recorded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setCrewApproving(false);
    }
  };

  // Payroll approve
  const handlePayrollApprove = async () => {
    if (!crewTimecard?.id) return;
    setCrewApproving(true);
    try {
      await payrollApproveTimecard(crewTimecard.id);
      await loadCrewTimecard();
      setMessage("Payroll approval recorded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setCrewApproving(false);
    }
  };

  // Approval status badge helper
  const statusBadge = (status: string | null) => {
    if (!status) return { label: "Pending", color: "#9ca3af", bg: "#f3f4f6" };
    if (status === "APPROVED") return { label: "Approved", color: "#059669", bg: "#ecfdf5" };
    if (status === "REJECTED") return { label: "Rejected", color: "#dc2626", bg: "#fef2f2" };
    return { label: status, color: "#6b7280", bg: "#f3f4f6" };
  };

  if (loading && !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading timecard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Timecard</Text>
        <Pressable onPress={loadTimecardData} disabled={loading}>
          <Text style={[styles.link, loading && styles.linkDisabled]}>
            {loading ? "Loading..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {message && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      {/* Current Status Card */}
      <View style={[styles.statusCard, status?.isClockedIn && styles.statusCardActive]}>
        {status?.isClockedIn ? (
          <>
            <Text style={styles.statusLabel}>Currently Clocked In</Text>
            <Text style={styles.statusProject}>{status.projectName}</Text>
            <Text style={styles.elapsedTime}>{elapsedTime}</Text>
            <Text style={styles.clockedInAt}>
              Since {formatTime(status.clockedInAt)}
            </Text>

            <Pressable
              style={[styles.clockButton, styles.clockOutButton]}
              onPress={handleClockOut}
              disabled={actionLoading}
            >
              <Text style={styles.clockButtonText}>
                {actionLoading ? "Processing..." : "Clock Out"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.statusLabel}>Not Clocked In</Text>
            <Text style={styles.statusHint}>Select a project to clock in</Text>

            {/* Project Dropdown Selector */}
            <Pressable
              style={styles.projectDropdown}
              onPress={() => setShowProjectPicker(true)}
            >
              <Text
                style={[
                  styles.projectDropdownText,
                  !selectedProjectId && styles.projectDropdownPlaceholder,
                ]}
                numberOfLines={1}
              >
                {selectedProjectId
                  ? projects.find((p) => p.id === selectedProjectId)?.name ?? "Select project"
                  : "Select project..."}
              </Text>
              <Text style={styles.projectDropdownArrow}>▼</Text>
            </Pressable>

            <Pressable
              style={[
                styles.clockButton,
                styles.clockInButton,
                !selectedProjectId && styles.clockButtonDisabled,
              ]}
              onPress={handleClockIn}
              disabled={actionLoading || !selectedProjectId}
            >
              <Text style={styles.clockButtonText}>
                {actionLoading ? "Processing..." : "Clock In"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Crew Timecards (Foreman+ only) */}
      {isForeman && selectedProjectId && (
        <>
          <View style={styles.crewHeader}>
            <Text style={styles.sectionTitle}>Crew Timecards</Text>
            <View style={styles.crewDateNav}>
              <Pressable onPress={() => shiftCrewDate(-1)} style={styles.crewDateBtn}>
                <Text style={styles.crewDateBtnText}>◀</Text>
              </Pressable>
              <Text style={styles.crewDateLabel}>{formatDate(crewDate)}</Text>
              <Pressable onPress={() => shiftCrewDate(1)} style={styles.crewDateBtn}>
                <Text style={styles.crewDateBtnText}>▶</Text>
              </Pressable>
            </View>
          </View>

          {/* Approval Status Badges */}
          {crewTimecard?.id && (
            <View style={styles.approvalRow}>
              {(["foremanStatus", "superStatus", "payrollStatus"] as const).map((key) => {
                const label = key === "foremanStatus" ? "Foreman" : key === "superStatus" ? "Super" : "Payroll";
                const badge = statusBadge((crewTimecard as any)[key]);
                return (
                  <View key={key} style={[styles.approvalBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.approvalBadgeText, { color: badge.color }]}>
                      {label}: {badge.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {crewLoading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color="#111827" />
          ) : crewTimecard && crewTimecard.entries.length > 0 ? (
            <>
              {crewTimecard.entries.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={styles.crewEntryCard}
                  onPress={() => openEditEntry(entry)}
                >
                  <View style={styles.crewEntryHeader}>
                    <Text style={styles.crewEntryName}>{entry.workerName ?? "Unknown"}</Text>
                    <Text style={styles.crewEntryHours}>
                      {entry.totalHours.toFixed(1)} hrs
                    </Text>
                  </View>
                  <Text style={styles.crewEntryTimes}>
                    {formatTime(entry.timeIn)} → {formatTime(entry.timeOut)}
                    {entry.locationCode ? `  •  ${entry.locationCode}` : ""}
                  </Text>
                  <Text style={styles.crewEntryBreakdown}>
                    ST {entry.stHours.toFixed(1)} · OT {entry.otHours.toFixed(1)} · DT {(entry.dtHours ?? 0).toFixed(1)}
                  </Text>
                </Pressable>
              ))}

              {/* Approve Buttons */}
              <View style={styles.approveButtons}>
                {!crewTimecard.foremanStatus || crewTimecard.foremanStatus === "REJECTED" ? (
                  <Pressable
                    style={[styles.approveBtn, styles.approveBtnForeman]}
                    onPress={handleApprove}
                    disabled={crewApproving}
                  >
                    <Text style={styles.approveBtnText}>
                      {crewApproving ? "Approving..." : "Foreman Approve"}
                    </Text>
                  </Pressable>
                ) : crewTimecard.foremanStatus === "APPROVED" && !crewTimecard.superStatus ? (
                  <Pressable
                    style={[styles.approveBtn, styles.approveBtnSuper]}
                    onPress={handleSuperApprove}
                    disabled={crewApproving}
                  >
                    <Text style={styles.approveBtnText}>
                      {crewApproving ? "Approving..." : "Super Approve"}
                    </Text>
                  </Pressable>
                ) : crewTimecard.superStatus === "APPROVED" && !crewTimecard.payrollStatus ? (
                  <Pressable
                    style={[styles.approveBtn, styles.approveBtnPayroll]}
                    onPress={handlePayrollApprove}
                    disabled={crewApproving}
                  >
                    <Text style={styles.approveBtnText}>
                      {crewApproving ? "Approving..." : "Payroll Approve"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>No crew entries for this date</Text>
          )}
        </>
      )}

      {/* Recent Entries */}
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Recent Time Entries</Text>

      <ScrollView style={styles.recentList} contentContainerStyle={styles.recentListContent}>
        {recentEntries.length === 0 ? (
          <Text style={styles.emptyText}>No recent entries</Text>
        ) : (
          recentEntries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryDate}>{formatDate(entry.date)}</Text>
                <Text style={styles.entryHours}>
                  {entry.totalHours.toFixed(1)} hrs
                </Text>
              </View>
              <Text style={styles.entryProject}>{entry.projectName}</Text>
              <Text style={styles.entryTimes}>
                {formatTime(entry.timeIn)} → {formatTime(entry.timeOut)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Project Picker Modal (with Tenant Switcher) */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Project</Text>
              <Pressable onPress={() => setShowProjectPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {/* Current Tenant Banner */}
              {currentCompanyName && (
                <View style={styles.tenantBanner}>
                  <Text style={styles.tenantBannerLabel}>Current Tenant</Text>
                  <Text style={styles.tenantBannerName}>{currentCompanyName}</Text>
                </View>
              )}

              {/* Switch Tenant */}
              {companies.length > 1 && (
                <>
                  <View style={styles.tenantDivider}>
                    <Text style={styles.tenantDividerText}>Switch Tenant</Text>
                  </View>
                  {companies
                    .filter((c) => c.id !== currentCompanyId)
                    .map((c) => (
                      <Pressable
                        key={c.id}
                        style={styles.tenantOption}
                        onPress={() => void handleSelectCompany(c.id)}
                        disabled={!!companySwitchingId}
                      >
                        <Text style={styles.tenantOptionText} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {companySwitchingId === c.id && (
                          <ActivityIndicator size="small" color="#2563eb" />
                        )}
                      </Pressable>
                    ))}
                  <View style={styles.tenantDivider}>
                    <Text style={styles.tenantDividerText}>Projects</Text>
                  </View>
                </>
              )}

              {/* Project List */}
              {projects.map((p) => {
                const isSelected = p.id === selectedProjectId;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.projectOption, isSelected && styles.projectOptionSelected]}
                    onPress={() => {
                      setSelectedProjectId(p.id);
                      setShowProjectPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.projectOptionText,
                        isSelected && styles.projectOptionTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {p.name}
                    </Text>
                    {isSelected && <Text style={styles.projectOptionCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Entry Modal */}
      <Modal
        visible={showEditEntry}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditEntry(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit: {editingEntry?.workerName ?? "Entry"}
              </Text>
              <Pressable onPress={() => setShowEditEntry(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.editLabel}>Time In (HH:MM 24h)</Text>
              <TextInput
                style={styles.editInput}
                value={editTimeIn}
                onChangeText={setEditTimeIn}
                placeholder="07:00"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.editLabel}>Time Out (HH:MM 24h)</Text>
              <TextInput
                style={styles.editInput}
                value={editTimeOut}
                onChangeText={setEditTimeOut}
                placeholder="17:00"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.editLabel}>ST Hours (override)</Text>
              <TextInput
                style={styles.editInput}
                value={editSt}
                onChangeText={setEditSt}
                placeholder="8"
                keyboardType="decimal-pad"
              />
              <Text style={styles.editLabel}>OT Hours (override)</Text>
              <TextInput
                style={styles.editInput}
                value={editOt}
                onChangeText={setEditOt}
                placeholder="0"
                keyboardType="decimal-pad"
              />
              <Pressable
                style={[styles.clockButton, styles.clockInButton, { marginTop: 20 }]}
                onPress={handleSaveEntry}
                disabled={savingEntry}
              >
                <Text style={styles.clockButtonText}>
                  {savingEntry ? "Saving..." : "Save Changes"}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 54 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#6b7280" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "700" },
  link: { color: "#2563eb", fontWeight: "600" },
  linkDisabled: { color: "#9ca3af" },

  messageBox: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageText: { color: "#374151", fontSize: 13 },

  statusCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  statusCardActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statusProject: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  statusHint: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  elapsedTime: {
    fontSize: 48,
    fontWeight: "700",
    color: "#10b981",
    fontVariant: ["tabular-nums"],
    marginTop: 8,
  },
  clockedInAt: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },

  // Project Dropdown
  projectDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
    backgroundColor: "#ffffff",
    width: "100%",
    maxWidth: 300,
  },
  projectDropdownText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  projectDropdownPlaceholder: {
    color: "#9ca3af",
    fontWeight: "400",
  },
  projectDropdownArrow: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 8,
  },

  clockButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
    minWidth: 160,
    alignItems: "center",
  },
  clockInButton: {
    backgroundColor: "#10b981",
  },
  clockOutButton: {
    backgroundColor: "#ef4444",
  },
  clockButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  clockButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
  },

  recentList: { flex: 1 },
  recentListContent: { paddingBottom: 100 },
  emptyText: { color: "#9ca3af", textAlign: "center", marginTop: 20 },

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
  },
  projectOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 10,
    marginVertical: 2,
  },
  projectOptionSelected: {
    backgroundColor: "#eff6ff",
  },
  projectOptionText: {
    fontSize: 16,
    color: "#1f2937",
    flex: 1,
  },
  projectOptionTextSelected: {
    fontWeight: "700",
    color: "#1e3a8a",
  },
  projectOptionCheck: {
    fontSize: 18,
    color: "#1e3a8a",
    fontWeight: "700",
    marginLeft: 12,
  },

  // Tenant styles
  tenantBanner: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    marginHorizontal: 8,
  },
  tenantBannerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tenantBannerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e3a8a",
    marginTop: 2,
  },
  tenantDivider: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  tenantDividerText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tenantOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    marginHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    marginVertical: 2,
  },
  tenantOptionText: {
    fontSize: 15,
    color: "#1f2937",
    flex: 1,
  },

  // Crew timecard styles
  crewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  crewDateNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  crewDateBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  crewDateBtnText: {
    fontSize: 14,
    color: "#374151",
  },
  crewDateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    minWidth: 110,
    textAlign: "center",
  },
  approvalRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  approvalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  approvalBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  crewEntryCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  crewEntryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  crewEntryName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  crewEntryHours: {
    fontSize: 15,
    fontWeight: "700",
    color: "#10b981",
  },
  crewEntryTimes: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  crewEntryBreakdown: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  approveButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  approveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  approveBtnForeman: {
    backgroundColor: "#10b981",
  },
  approveBtnSuper: {
    backgroundColor: "#3b82f6",
  },
  approveBtnPayroll: {
    backgroundColor: "#8b5cf6",
  },
  approveBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  editLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginTop: 12,
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#ffffff",
  },

  entryCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryDate: { fontSize: 14, fontWeight: "600", color: "#111827" },
  entryHours: { fontSize: 14, fontWeight: "700", color: "#10b981" },
  entryProject: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  entryTimes: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
});
