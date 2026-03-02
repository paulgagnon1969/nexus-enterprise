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

interface ProjectGroup {
  /** Display label for the group (client/owner name). */
  label: string;
  /** Projects in this group. */
  projects: ProjectListItem[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  projects: ProjectListItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

/**
 * Full-screen modal that shows projects grouped by owner/client
 * (primaryContactName). Supports multi-select with checkboxes,
 * "Select All" toggle, and per-group "select group" toggles.
 */
export function ProjectPickerModal({
  visible,
  onClose,
  projects,
  selectedIds,
  onSelectionChange,
}: Props) {
  const [search, setSearch] = useState("");

  // Group projects by primaryContactName (owner/client).
  // Projects without a contact go into "Unassigned".
  const groups: ProjectGroup[] = useMemo(() => {
    const map = new Map<string, ProjectListItem[]>();

    for (const p of projects) {
      const key = (p.primaryContactName || "").trim() || "Unassigned";
      const existing = map.get(key);
      if (existing) {
        existing.push(p);
      } else {
        map.set(key, [p]);
      }
    }

    // Sort groups: "Unassigned" goes last, rest alphabetical
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "Unassigned") return 1;
        if (b === "Unassigned") return -1;
        return a.localeCompare(b);
      })
      .map(([label, groupProjects]) => ({
        label,
        projects: groupProjects.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [projects]);

  // Apply search filter
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        projects: g.projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.primaryContactName || "").toLowerCase().includes(q) ||
            (p.city || "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.projects.length > 0);
  }, [groups, search]);

  const allProjectIds = useMemo(
    () => new Set(projects.map((p) => p.id)),
    [projects],
  );

  const isAllSelected =
    projects.length > 0 && selectedIds.size === 0;

  // "Select All" = clear selection (shows everything)
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

  // Toggle an entire group
  const toggleGroup = (group: ProjectGroup) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const groupIds = group.projects.map((p) => p.id);
    const allInGroup = groupIds.every((id) => selectedIds.has(id));

    const next = new Set(selectedIds);
    if (allInGroup) {
      // Deselect entire group
      for (const id of groupIds) next.delete(id);
    } else {
      // Select entire group
      for (const id of groupIds) next.add(id);
    }
    onSelectionChange(next);
  };

  const isGroupFullySelected = (group: ProjectGroup): boolean =>
    group.projects.length > 0 &&
    group.projects.every((p) => selectedIds.has(p.id));

  const isGroupPartiallySelected = (group: ProjectGroup): boolean =>
    group.projects.some((p) => selectedIds.has(p.id)) &&
    !isGroupFullySelected(group);

  // Build flat list data: interleave group headers with project rows
  type ListItem =
    | { type: "header"; group: ProjectGroup; key: string }
    | { type: "project"; project: ProjectListItem; key: string };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    for (const group of filteredGroups) {
      items.push({ type: "header", group, key: `hdr_${group.label}` });
      for (const p of group.projects) {
        items.push({ type: "project", project: p, key: p.id });
      }
    }
    return items;
  }, [filteredGroups]);

  const selectionLabel = useMemo(() => {
    if (selectedIds.size === 0) return "All Projects";
    if (selectedIds.size === 1) {
      const p = projects.find((x) => selectedIds.has(x.id));
      return p?.name || "1 project";
    }
    return `${selectedIds.size} projects selected`;
  }, [selectedIds, projects]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      const fullySelected = isGroupFullySelected(item.group);
      const partiallySelected = isGroupPartiallySelected(item.group);
      return (
        <Pressable
          style={styles.groupHeader}
          onPress={() => toggleGroup(item.group)}
        >
          <View style={styles.groupHeaderLeft}>
            <Text style={styles.groupIcon}>👤</Text>
            <View>
              <Text style={styles.groupLabel}>{item.group.label}</Text>
              <Text style={styles.groupCount}>
                {item.group.projects.length} project
                {item.group.projects.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.checkbox,
              fullySelected && styles.checkboxSelected,
              partiallySelected && styles.checkboxPartial,
            ]}
          >
            <Text style={styles.checkboxText}>
              {fullySelected ? "✓" : partiallySelected ? "−" : ""}
            </Text>
          </View>
        </Pressable>
      );
    }

    const p = item.project;
    const selected = selectedIds.has(p.id);
    return (
      <Pressable style={styles.projectRow} onPress={() => toggleProject(p.id)}>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName} numberOfLines={1}>
            {p.name}
          </Text>
          {(p.city || p.state) && (
            <Text style={styles.projectLocation} numberOfLines={1}>
              {[p.city, p.state].filter(Boolean).join(", ")}
            </Text>
          )}
        </View>
        <View
          style={[styles.checkbox, selected && styles.checkboxSelected]}
        >
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
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Done</Text>
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

        {/* Grouped list */}
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
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
  listContent: {
    paddingBottom: 40,
  },
  // Group header
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundTertiary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    marginTop: 8,
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  groupIcon: {
    fontSize: 18,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  groupCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  // Project row
  projectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingLeft: 48,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  projectInfo: {
    flex: 1,
    marginRight: 12,
  },
  projectName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  projectLocation: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
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
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxPartial: {
    backgroundColor: colors.backgroundTertiary,
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
