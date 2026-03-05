import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import type { ProjectListItem } from "../types/api";

type SortColumn = "popularity" | "name" | "client";
type SortDirection = "asc" | "desc";

interface Props {
  visible: boolean;
  onClose: () => void;
  projects: ProjectListItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  /** Map of projectId → recent usage count (e.g. daily-log count). */
  logCounts?: Map<string, number>;
}

// Statuses considered inactive (shown with visual badge, sorted below active)
const INACTIVE_STATUSES = new Set(["closed", "Closed", "CLOSED", "archived", "Archived", "ARCHIVED", "completed", "Completed", "COMPLETED", "deleted", "Deleted", "DELETED"]);

function isInactive(status?: string | null): boolean {
  return !!status && INACTIVE_STATUSES.has(status);
}

/**
 * Full-screen modal that shows a flat, sortable project list.
 * Three columns: Most Popular (recent usage), Project Name, Client.
 * Default sort is by popularity (descending). Tapping a column header
 * cycles through ascending/descending sort on that column.
 * Search matches across all projects regardless of status;
 * closed/archived projects are visually denoted.
 */
// ── Filter funnel icon ──────────────────────────────────────────────
// Dashed-line funnel when no filter is applied; solid white-on-green
// funnel when one or more projects are checked.
function FilterFunnelIcon({ active }: { active: boolean }) {
  const barColor = active ? "#ffffff" : colors.textMuted;
  // Three descending-width bars = funnel silhouette
  const bars = [
    { w: 20, dash: !active },
    { w: 13, dash: !active },
    { w: 6,  dash: false },  // stem is always solid
  ];
  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 3 }}>
      {bars.map((b, i) =>
        b.dash ? (
          <View
            key={i}
            style={{
              width: b.w,
              height: 0,
              borderBottomWidth: 2,
              borderBottomColor: barColor,
              borderStyle: "dashed",
            }}
          />
        ) : (
          <View
            key={i}
            style={{
              width: b.w,
              height: 2.5,
              borderRadius: 1.5,
              backgroundColor: barColor,
            }}
          />
        ),
      )}
    </View>
  );
}

export function ProjectPickerModal({
  visible,
  onClose,
  projects,
  selectedIds,
  onSelectionChange,
  logCounts,
}: Props) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortColumn>("popularity");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  // Compute popularity from logCounts
  const getPopularity = (id: string) => logCounts?.get(id) ?? 0;

  // Apply search filter (matches name, client, city — ignores status)
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.primaryContactName || "").toLowerCase().includes(q) ||
        (p.city || "").toLowerCase().includes(q) ||
        (p.state || "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  // Sort projects
  const sortedProjects = useMemo(() => {
    const list = [...filteredProjects];
    const dir = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      // Inactive projects always sort below active ones
      const aInactive = isInactive(a.status) ? 1 : 0;
      const bInactive = isInactive(b.status) ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;

      switch (sortCol) {
        case "popularity": {
          const diff = getPopularity(a.id) - getPopularity(b.id);
          if (diff !== 0) return diff * dir;
          return a.name.localeCompare(b.name); // tiebreak by name asc
        }
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "client": {
          const ac = (a.primaryContactName || "zzz").toLowerCase();
          const bc = (b.primaryContactName || "zzz").toLowerCase();
          const diff = ac.localeCompare(bc) * dir;
          if (diff !== 0) return diff;
          return a.name.localeCompare(b.name); // tiebreak by name asc
        }
        default:
          return 0;
      }
    });
    return list;
  }, [filteredProjects, sortCol, sortDir, logCounts]);

  const isAllSelected = projects.length > 0 && selectedIds.size === 0;

  const handleSelectAll = () => {
    void Haptics.selectionAsync();
    onSelectionChange(new Set());
  };

  const toggleProject = (id: string) => {
    void Haptics.selectionAsync();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const handleColumnPress = (col: SortColumn) => {
    void Haptics.selectionAsync();
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "popularity" ? "desc" : "asc");
    }
  };

  const selectionLabel = useMemo(() => {
    if (selectedIds.size === 0) return "All Projects";
    if (selectedIds.size === 1) {
      const p = projects.find((x) => selectedIds.has(x.id));
      return p?.name || "1 project";
    }
    return `${selectedIds.size} projects selected`;
  }, [selectedIds, projects]);

  const sortArrow = (col: SortColumn) => {
    if (sortCol !== col) return " ";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const renderItem = ({ item: p }: { item: ProjectListItem }) => {
    const selected = selectedIds.has(p.id);
    const inactive = isInactive(p.status);
    const pop = getPopularity(p.id);
    const client = (p.primaryContactName || "").trim() || "—";

    return (
      <Pressable
        style={[styles.projectRow, inactive && styles.projectRowInactive]}
        onPress={() => toggleProject(p.id)}
      >
        {/* Popularity */}
        <View style={styles.colPopularity}>
          {pop > 0 ? (
            <View style={styles.popBadge}>
              <Text style={styles.popBadgeText}>{pop}</Text>
            </View>
          ) : (
            <Text style={styles.popEmpty}>·</Text>
          )}
        </View>

        {/* Project name */}
        <View style={styles.colName}>
          <Text
            style={[styles.projectName, inactive && styles.textInactive]}
            numberOfLines={1}
          >
            {p.name}
          </Text>
          {inactive && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {(p.status || "closed").toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Client */}
        <Text
          style={[styles.colClient, inactive && styles.textInactive]}
          numberOfLines={1}
        >
          {client}
        </Text>

        {/* Checkbox */}
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          <Text style={styles.checkboxText}>{selected ? "✓" : ""}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {/* Filter / Done button */}
          <Pressable
            onPress={onClose}
            style={[
              styles.filterBtn,
              selectedIds.size > 0 && styles.filterBtnActive,
            ]}
          >
            <FilterFunnelIcon active={selectedIds.size > 0} />
            {selectedIds.size > 0 && (
              <Text style={styles.filterBtnCount}>{selectedIds.size}</Text>
            )}
          </Pressable>
          <Text style={styles.headerTitle}>Filter Projects</Text>
          <Pressable onPress={handleSelectAll} style={styles.headerBtn}>
            <Text
              style={[
                styles.headerBtnText,
                isAllSelected && styles.headerBtnTextMuted,
              ]}
            >
              {isAllSelected ? "All ✓" : "Select All"}
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects or clients…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
        </View>

        {/* Selection summary */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>{selectionLabel}</Text>
          {selectedIds.size > 0 && (
            <Pressable onPress={handleSelectAll}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
        </View>

        {/* Column headers (sortable) */}
        <View style={styles.columnHeaders}>
          <Pressable
            style={styles.colPopularity}
            onPress={() => handleColumnPress("popularity")}
          >
            <Text style={[
              styles.colHeaderText,
              sortCol === "popularity" && styles.colHeaderActive,
            ]}>
              Use{sortArrow("popularity")}
            </Text>
          </Pressable>
          <Pressable
            style={styles.colName}
            onPress={() => handleColumnPress("name")}
          >
            <Text style={[
              styles.colHeaderText,
              sortCol === "name" && styles.colHeaderActive,
            ]}>
              Project{sortArrow("name")}
            </Text>
          </Pressable>
          <Pressable
            style={styles.colClientHeader}
            onPress={() => handleColumnPress("client")}
          >
            <Text style={[
              styles.colHeaderText,
              sortCol === "client" && styles.colHeaderActive,
            ]}>
              Client{sortArrow("client")}
            </Text>
          </Pressable>
          {/* Spacer for checkbox column */}
          <View style={{ width: 32 }} />
        </View>

        {/* Flat project list */}
        <FlatList
          data={sortedProjects}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No projects found</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerBtn: {
    minWidth: 70,
  },
  headerBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  headerBtnTextMuted: {
    color: colors.textMuted,
  },
  // Filter funnel button (replaces "Done")
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 44,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "transparent",
  },
  filterBtnActive: {
    backgroundColor: "#16a34a",
  },
  filterBtnCount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  searchInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.backgroundTertiary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.error,
  },

  // Column headers
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colHeaderActive: {
    color: colors.primary,
    fontWeight: "700",
  },

  // Column widths
  colPopularity: {
    width: 44,
    alignItems: "center",
  },
  colName: {
    flex: 1,
    paddingRight: 8,
  },
  colClient: {
    width: 100,
    fontSize: 12,
    color: colors.textMuted,
    paddingRight: 8,
  },
  colClientHeader: {
    width: 100,
    paddingRight: 8,
  },

  listContent: {
    paddingBottom: 40,
  },

  // Project row
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  projectRowInactive: {
    backgroundColor: "#f9fafb",
  },
  projectName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  textInactive: {
    color: colors.textMuted,
  },

  // Status badge for closed/archived
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "#e5e7eb",
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.3,
  },

  // Popularity badge
  popBadge: {
    backgroundColor: "#dbeafe",
    borderRadius: 10,
    minWidth: 24,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  popBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  popEmpty: {
    fontSize: 14,
    color: colors.borderMuted,
  },

  // Checkbox
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderMuted,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    marginLeft: 8,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
  emptyWrap: {
    paddingTop: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
