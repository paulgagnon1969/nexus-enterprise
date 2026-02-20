import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, TextInput } from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache, deleteCache } from "../offline/cache";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";
import {
  recordUsage,
  getProjectScores,
  pruneOldUsageEvents,
  FREQUENT_THRESHOLD,
  MAX_FREQUENT,
  type ProjectScore,
} from "../storage/usageTracker";
import { DirectionsDialog } from "../components/DirectionsDialog";
import { colors } from "../theme/colors";
import type { ProjectListItem } from "../types/api";

type BrowseMode = "projects" | "client";

export function ProjectsScreen({
  onBack,
  onOpenProject,
  refreshKey,
  currentCompanyId: parentCompanyId,
  currentCompanyName: parentCompanyName,
  onCompanyChange,
}: {
  onBack?: () => void;
  onOpenProject: (project: ProjectListItem) => void;
  refreshKey?: number;
  currentCompanyId?: string | null;
  currentCompanyName?: string | null;
  onCompanyChange?: (company: { id: string; name: string }) => void;
}) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [directionsProject, setDirectionsProject] = useState<ProjectListItem | null>(null);

  // Browse mode toggle
  const [browseMode, setBrowseMode] = useState<BrowseMode>("projects");
  const [clientSearch, setClientSearch] = useState("");

  // fasTRACK scores
  const [scores, setScores] = useState<ProjectScore[]>([]);

  // Tenant / company switching state
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(parentCompanyId ?? null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string | null>(parentCompanyName ?? null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [companySwitchingId, setCompanySwitchingId] = useState<string | null>(null);

  // Keep local state in sync with parent context
  useEffect(() => {
    if (parentCompanyId) setCurrentCompanyId(parentCompanyId);
    if (parentCompanyName) setCurrentCompanyName(parentCompanyName);
  }, [parentCompanyId, parentCompanyName]);

  // Load companies on mount
  useEffect(() => {
    (async () => {
      try {
        const me = await getUserMe();
        const list = Array.isArray(me.memberships)
          ? me.memberships.map((m) => ({
              id: m.companyId,
              name: m.company?.name ?? m.companyId,
            }))
          : [];
        const byId = new Map<string, { id: string; name: string }>();
        for (const c of list) {
          if (!byId.has(c.id)) byId.set(c.id, c);
        }
        setCompanies(Array.from(byId.values()));

        if (!currentCompanyName) {
          try {
            const companyMe = await getUserCompanyMe();
            if (companyMe?.id) {
              setCurrentCompanyId(String(companyMe.id));
              setCurrentCompanyName(String(companyMe.name ?? companyMe.id));
            }
          } catch {
            // Non-fatal
          }
        }
      } catch {
        // Non-fatal
      }
    })();
  }, []);

  // Load fasTRACK scores + prune old events on mount
  const loadScores = async () => {
    const s = await getProjectScores();
    setScores(s);
  };

  useEffect(() => {
    void pruneOldUsageEvents();
    void loadScores();
  }, []);

  const handleSelectCompany = async (companyId: string) => {
    if (!companyId || companyId === currentCompanyId) {
      setShowCompanyPicker(false);
      return;
    }
    setCompanySwitchingId(companyId);
    try {
      const res = await apiSwitchCompany(companyId);
      const newId = res.company?.id ?? companyId;
      const newName = res.company?.name ?? companyId;
      setCurrentCompanyId(newId);
      setCurrentCompanyName(newName);
      onCompanyChange?.({ id: newId, name: newName });

      await deleteCache("projects.list");
      setProjects([]);
      setScores([]);
      void refreshOnline();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : `Switch failed: ${String(e)}`);
    } finally {
      setCompanySwitchingId(null);
      setShowCompanyPicker(false);
    }
  };

  const handleOpenProject = (project: ProjectListItem) => {
    void recordUsage(project.id, "open_project");
    // Refresh scores in background so it's ready next time
    void loadScores();
    onOpenProject(project);
  };

  const loadCached = async () => {
    const cached = await getCache<ProjectListItem[]>("projects.list");
    if (cached) setProjects(cached);
  };

  const refreshOnline = async () => {
    setStatus("Loading…");
    try {
      const latest = await apiJson<ProjectListItem[]>("/projects");
      setProjects(latest);
      await setCache("projects.list", latest);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadCached().then(refreshOnline);
  }, []);

  // Refresh when tenant changes externally (refreshKey from parent)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      void deleteCache("projects.list").then(() => {
        setProjects([]);
        refreshOnline();
      });
    }
  }, [refreshKey]);

  // ---- Computed project lists ----

  // Score lookup map
  const scoreMap = useMemo(() => {
    const m = new Map<string, ProjectScore>();
    for (const s of scores) m.set(s.projectId, s);
    return m;
  }, [scores]);

  // All projects sorted alphabetically
  const alphabetical = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  // fasTRACK: top scored projects that clear the threshold
  const fastTrackProjects = useMemo(() => {
    return alphabetical
      .filter((p) => (scoreMap.get(p.id)?.score ?? 0) >= FREQUENT_THRESHOLD)
      .sort((a, b) => (scoreMap.get(b.id)?.score ?? 0) - (scoreMap.get(a.id)?.score ?? 0))
      .slice(0, MAX_FREQUENT);
  }, [alphabetical, scoreMap]);

  // Remaining projects (not in fasTRACK), still alphabetical
  const fastTrackIds = useMemo(
    () => new Set(fastTrackProjects.map((p) => p.id)),
    [fastTrackProjects],
  );
  const remainingProjects = useMemo(
    () => alphabetical.filter((p) => !fastTrackIds.has(p.id)),
    [alphabetical, fastTrackIds],
  );

  // ---- Client search ----

  interface ClientGroup {
    clientName: string;
    projects: ProjectListItem[];
  }

  const clientResults = useMemo((): ClientGroup[] => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return [];

    // Match projects where contact name, email, phone, or address contains query
    const matched = alphabetical.filter((p) => {
      const fields = [
        p.primaryContactName,
        p.primaryContactEmail,
        p.primaryContactPhone,
        p.addressLine1,
        p.city,
        p.name,
      ];
      return fields.some((f) => f?.toLowerCase().includes(q));
    });

    // Group by contact name (or "No Contact" if missing)
    const groups = new Map<string, ProjectListItem[]>();
    for (const p of matched) {
      const key = p.primaryContactName?.trim() || "No Contact";
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }

    return Array.from(groups.entries())
      .map(([clientName, projects]) => ({ clientName, projects }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [alphabetical, clientSearch]);

  const hasMultipleCompanies = companies.length > 1;

  // ---- Render helpers ----

  const renderProjectCard = (p: ProjectListItem, opts?: { showContact?: boolean; isFastTrack?: boolean }) => {
    const hasLocation = !!(p.latitude && p.longitude) || !!(p.addressLine1 && p.city && p.state);
    const addressDisplay = p.addressLine1
      ? `${p.addressLine1}, ${p.city}, ${p.state}${p.postalCode ? ` ${p.postalCode}` : ""}`
      : null;
    const score = scoreMap.get(p.id);

    return (
      <View key={p.id} style={[styles.card, opts?.isFastTrack && styles.cardFastTrack]}>
        <Pressable style={styles.cardContent} onPress={() => handleOpenProject(p)}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{p.name}</Text>
            {opts?.isFastTrack && score && (
              <Text style={styles.fastTrackBadge}>⚡</Text>
            )}
          </View>
          {opts?.showContact && p.primaryContactName && (
            <Text style={styles.cardContact} numberOfLines={1}>
              👤 {p.primaryContactName}
            </Text>
          )}
          {addressDisplay && (
            <Text style={styles.cardAddress} numberOfLines={1}>{addressDisplay}</Text>
          )}
          {p.status && (
            <Text style={styles.cardStatus}>{p.status}</Text>
          )}
        </Pressable>

        {hasLocation && (
          <Pressable style={styles.mapPinButton} onPress={() => setDirectionsProject(p)}>
            <Text style={styles.mapPinIcon}>📍</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack}>
            <Text style={styles.link}>← Back</Text>
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}

        {hasMultipleCompanies ? (
          <Pressable style={styles.orgDropdown} onPress={() => setShowCompanyPicker(true)}>
            <Text style={styles.orgDropdownText} numberOfLines={1}>
              🏢 {currentCompanyName || "Select Org"}
            </Text>
            <Text style={styles.orgDropdownArrow}>▼</Text>
          </Pressable>
        ) : (
          <Text style={styles.title}>Projects</Text>
        )}

        <Pressable onPress={refreshOnline}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      {/* Browse mode toggle */}
      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modeButton, browseMode === "projects" && styles.modeButtonActive]}
          onPress={() => { setBrowseMode("projects"); setClientSearch(""); }}
        >
          <Text style={[styles.modeButtonText, browseMode === "projects" && styles.modeButtonTextActive]}>
            📋 Projects
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, browseMode === "client" && styles.modeButtonActive]}
          onPress={() => setBrowseMode("client")}
        >
          <Text style={[styles.modeButtonText, browseMode === "client" && styles.modeButtonTextActive]}>
            👤 Client Search
          </Text>
        </Pressable>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      {/* ======================= PROJECTS MODE ======================= */}
      {browseMode === "projects" && (
        <ScrollView style={{ flex: 1 }}>
          {/* fasTRACK section */}
          {fastTrackProjects.length > 0 && (
            <View style={styles.fastTrackSection}>
              <View style={styles.fastTrackHeader}>
                <Text style={styles.fastTrackTitle}>⚡ fas<Text style={styles.fastTrackTitleBold}>TRACK</Text></Text>
                <Text style={styles.fastTrackSub}>Your most active projects</Text>
              </View>
              {fastTrackProjects.map((p) => renderProjectCard(p, { isFastTrack: true }))}
            </View>
          )}

          {/* All Projects (alphabetical) */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {fastTrackProjects.length > 0 ? "All Projects" : "Projects"}
            </Text>
            <Text style={styles.sectionCount}>{alphabetical.length}</Text>
          </View>

          {(fastTrackProjects.length > 0 ? remainingProjects : alphabetical).map((p) =>
            renderProjectCard(p, { showContact: true }),
          )}

          {!projects.length && !status && (
            <Text style={styles.emptyText}>No projects found.</Text>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ===================== CLIENT SEARCH MODE ===================== */}
      {browseMode === "client" && (
        <View style={{ flex: 1 }}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by client name, email, phone, address…"
            placeholderTextColor="#9ca3af"
            value={clientSearch}
            onChangeText={setClientSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          <ScrollView style={{ flex: 1 }}>
            {clientSearch.trim().length === 0 ? (
              <View style={styles.searchHint}>
                <Text style={styles.searchHintIcon}>🔍</Text>
                <Text style={styles.searchHintText}>
                  Type a client name, email, phone, or address to find their projects.
                </Text>
              </View>
            ) : clientResults.length === 0 ? (
              <Text style={styles.emptyText}>No matching clients or projects.</Text>
            ) : (
              clientResults.map((group) => (
                <View key={group.clientName} style={styles.clientGroup}>
                  <View style={styles.clientGroupHeader}>
                    <Text style={styles.clientGroupName}>👤 {group.clientName}</Text>
                    <Text style={styles.clientGroupCount}>
                      {group.projects.length} project{group.projects.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  {group.projects.map((p) => renderProjectCard(p))}
                </View>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}

      {/* Company picker modal */}
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
                    onPress={() => handleSelectCompany(c.id)}
                    disabled={switching}
                  >
                    <Text style={[styles.tenantOptionText, selected && styles.tenantOptionTextSelected]}>
                      🏢 {c.name}
                    </Text>
                    {selected && <Text style={styles.tenantOptionCheck}>✓</Text>}
                    {switching && <Text style={styles.tenantOptionSwitching}>switching…</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Directions Dialog */}
      <DirectionsDialog
        visible={!!directionsProject}
        onClose={() => setDirectionsProject(null)}
        destination={{
          latitude: directionsProject?.latitude,
          longitude: directionsProject?.longitude,
          address: directionsProject?.addressLine1
            ? `${directionsProject.addressLine1}, ${directionsProject.city}, ${directionsProject.state}${directionsProject.postalCode ? ` ${directionsProject.postalCode}` : ""}`
            : undefined,
          name: directionsProject?.name,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 54 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: colors.primary, fontWeight: "600" },
  status: { color: colors.textSecondary, marginBottom: 8 },

  // Browse mode toggle
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  modeButtonTextActive: {
    color: "#1f2937",
  },

  // Org dropdown in header
  orgDropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexShrink: 1,
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

  // fasTRACK section
  fastTrackSection: {
    marginBottom: 16,
  },
  fastTrackHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
    gap: 8,
  },
  fastTrackTitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#1e3a8a",
  },
  fastTrackTitleBold: {
    fontWeight: "800",
    letterSpacing: 1,
  },
  fastTrackSub: {
    fontSize: 11,
    color: "#6b7280",
  },
  fastTrackBadge: {
    fontSize: 12,
    marginLeft: 4,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  sectionCount: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "600",
  },

  // Project cards
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: colors.background,
  },
  cardFastTrack: {
    borderColor: "#93c5fd",
    backgroundColor: "#f0f7ff",
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cardContact: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  cardAddress: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  cardStatus: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: "capitalize",
  },
  mapPinButton: {
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  mapPinIcon: {
    fontSize: 24,
  },

  // Client search
  searchInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1f2937",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchHint: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
  },
  searchHintIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  searchHintText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
  clientGroup: {
    marginBottom: 16,
  },
  clientGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  clientGroupName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e3a8a",
  },
  clientGroupCount: {
    fontSize: 12,
    color: "#9ca3af",
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 32,
    fontSize: 14,
  },

  // Modal styles (matching HomeScreen)
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
});
