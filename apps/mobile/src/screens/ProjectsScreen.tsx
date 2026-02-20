import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Modal } from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache, deleteCache } from "../offline/cache";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";
import { DirectionsDialog } from "../components/DirectionsDialog";
import { colors } from "../theme/colors";
import type { ProjectListItem } from "../types/api";

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
        // Deduplicate
        const byId = new Map<string, { id: string; name: string }>();
        for (const c of list) {
          if (!byId.has(c.id)) byId.set(c.id, c);
        }
        setCompanies(Array.from(byId.values()));

        // If we don't have a company name from parent, fetch it
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
        // Non-fatal — we just won't show the switcher
      }
    })();
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

      // Clear cached projects and refetch for new tenant
      await deleteCache("projects.list");
      setProjects([]);
      void refreshOnline();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : `Switch failed: ${String(e)}`);
    } finally {
      setCompanySwitchingId(null);
      setShowCompanyPicker(false);
    }
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

  const hasMultipleCompanies = companies.length > 1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack}>
            <Text style={styles.link}>← Back</Text>
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}

        {/* Tappable company name as title when multiple orgs, plain title otherwise */}
        {hasMultipleCompanies ? (
          <Pressable
            style={styles.orgDropdown}
            onPress={() => setShowCompanyPicker(true)}
          >
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

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <ScrollView style={{ flex: 1 }}>
        {projects.map((p) => {
          const hasLocation = !!(p.latitude && p.longitude) || !!(p.addressLine1 && p.city && p.state);
          const addressDisplay = p.addressLine1
            ? `${p.addressLine1}, ${p.city}, ${p.state}${p.postalCode ? ` ${p.postalCode}` : ""}`
            : null;

          return (
            <View key={p.id} style={styles.card}>
              <Pressable style={styles.cardContent} onPress={() => onOpenProject(p)}>
                <Text style={styles.cardTitle}>{p.name}</Text>
                {addressDisplay && (
                  <Text style={styles.cardAddress} numberOfLines={1}>
                    {addressDisplay}
                  </Text>
                )}
                {p.status && (
                  <Text style={styles.cardStatus}>{p.status}</Text>
                )}
              </Pressable>
              
              {/* Map pin for directions */}
              {hasLocation && (
                <Pressable
                  style={styles.mapPinButton}
                  onPress={() => setDirectionsProject(p)}
                >
                  <Text style={styles.mapPinIcon}>📍</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {!projects.length && !status ? <Text style={styles.status}>No projects cached yet.</Text> : null}
      </ScrollView>

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
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: colors.primary, fontWeight: "600" },
  status: { color: colors.textSecondary, marginBottom: 8 },

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
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
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
