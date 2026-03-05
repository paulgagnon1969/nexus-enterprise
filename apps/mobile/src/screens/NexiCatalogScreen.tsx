import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { colors } from "../theme/colors";
import { listEntries, removeEntry, getCatalogSize, getEntry, updateEntry } from "../nexi/catalog";
import type { NexiCatalogEntry, NexiEntryStatus } from "../nexi/types";
import { NEXI_CATEGORIES, NEXI_MATERIALS } from "../nexi/types";

type CatalogListItem = {
  id: string;
  name: string;
  category: string;
  thumbnailUri: string | null;
  featurePrintCount: number;
  matchCount: number;
  updatedAt: string;
  status?: NexiEntryStatus;
};

interface Props {
  onBack: () => void;
  onEnrollNew: () => void;
}

export function NexiCatalogScreen({ onBack, onEnrollNew }: Props) {
  const [entries, setEntries] = useState<CatalogListItem[]>([]);
  const [filtered, setFiltered] = useState<CatalogListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Detail / edit modal state
  const [detailEntry, setDetailEntry] = useState<NexiCatalogEntry | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editMaterial, setEditMaterial] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showMatPicker, setShowMatPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [items, count] = await Promise.all([listEntries(), getCatalogSize()]);
      setEntries(items);
      setFiltered(items);
      setTotalCount(count);
    } catch (err) {
      console.warn("[NEXI] Failed to load catalog:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter on search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(entries);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q),
      ),
    );
  }, [search, entries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  // Open entry detail/edit
  const openEntry = useCallback(async (item: CatalogListItem) => {
    setDetailLoading(true);
    setShowDetail(true);
    try {
      const full = await getEntry(item.id);
      if (!full) {
        Alert.alert("Error", "Could not load entry.");
        setShowDetail(false);
        return;
      }
      setDetailEntry(full);
      setEditName(full.name);
      setEditCategory(full.category);
      setEditSubcategory(full.subcategory);
      setEditMaterial(full.material);
      setEditTags(full.tags.join(", "));
    } catch {
      Alert.alert("Error", "Failed to load entry details.");
      setShowDetail(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setShowDetail(false);
    setDetailEntry(null);
    setShowCatPicker(false);
    setShowMatPicker(false);
  };

  const saveEdits = useCallback(async () => {
    if (!detailEntry) return;
    if (!editName.trim()) { Alert.alert("Name Required"); return; }
    if (!editCategory.trim()) { Alert.alert("Category Required"); return; }
    setSaving(true);
    try {
      const updated = await updateEntry(detailEntry.id, {
        name: editName.trim(),
        category: editCategory.trim(),
        subcategory: editSubcategory.trim(),
        material: editMaterial.trim(),
        tags: editTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      });
      if (updated) {
        setDetailEntry(updated);
        // Refresh list
        setEntries((prev) =>
          prev.map((e) =>
            e.id === updated.id
              ? { ...e, name: updated.name, category: updated.category, updatedAt: updated.updatedAt, status: updated.status }
              : e,
          ),
        );
      }
      Alert.alert("Saved", "Entry updated.");
    } catch {
      Alert.alert("Error", "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [detailEntry, editName, editCategory, editSubcategory, editMaterial, editTags]);

  const submitForApproval = useCallback(async () => {
    if (!detailEntry) return;
    if (!editName.trim() || !editCategory.trim()) {
      Alert.alert("Incomplete", "Name and category are required before submitting.");
      return;
    }
    Alert.alert(
      "Submit for Approval",
      `Submit "${editName.trim()}" for admin approval?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setSaving(true);
            try {
              const updated = await updateEntry(detailEntry.id, {
                name: editName.trim(),
                category: editCategory.trim(),
                subcategory: editSubcategory.trim(),
                material: editMaterial.trim(),
                tags: editTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
                status: "pending_approval",
              });
              if (updated) {
                setDetailEntry(updated);
                setEntries((prev) =>
                  prev.map((e) =>
                    e.id === updated.id
                      ? { ...e, name: updated.name, category: updated.category, updatedAt: updated.updatedAt, status: updated.status }
                      : e,
                  ),
                );
              }
              Alert.alert("Submitted ✓", "Entry is pending admin approval.");
              closeDetail();
            } catch {
              Alert.alert("Error", "Failed to submit.");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, [detailEntry, editName, editCategory, editSubcategory, editMaterial, editTags]);

  const handleDelete = (entry: CatalogListItem) => {
    Alert.alert(
      "Delete Entry",
      `Remove "${entry.name}" from the NEXI catalog? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeEntry(entry.id);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          },
        },
      ],
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const tierColor = (matchCount: number) => {
    if (matchCount >= 10) return "#4ADE80"; // well-known
    if (matchCount >= 3) return "#D97706"; // recognized a few times
    return "#64748B"; // new
  };

  const statusLabel = (s?: NexiEntryStatus) => {
    switch (s) {
      case "pending_approval": return "Pending";
      case "approved": return "Approved";
      default: return "Draft";
    }
  };
  const statusColor = (s?: NexiEntryStatus) => {
    switch (s) {
      case "pending_approval": return "#D97706";
      case "approved": return "#4ADE80";
      default: return "#64748B";
    }
  };

  const renderItem = ({ item }: { item: CatalogListItem }) => (
    <Pressable style={styles.entryCard} onPress={() => openEntry(item)}>
      {/* Thumbnail */}
      <View style={styles.thumbContainer}>
        {item.thumbnailUri ? (
          <Image source={{ uri: item.thumbnailUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>🔍</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.entryInfo}>
        <View style={styles.entryNameRow}>
          <Text style={styles.entryName} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + "22" }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor(item.status) }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.entryCategory}>{item.category}</Text>
        <View style={styles.entryMeta}>
          <Text style={styles.entryMetaText}>
            {item.featurePrintCount} prints
          </Text>
          <Text style={styles.entryMetaDot}>·</Text>
          <Text style={[styles.entryMetaText, { color: tierColor(item.matchCount) }]}>
            {item.matchCount} matches
          </Text>
          <Text style={styles.entryMetaDot}>·</Text>
          <Text style={styles.entryMetaText}>{formatDate(item.updatedAt)}</Text>
        </View>
      </View>

      {/* Chevron */}
      <Text style={styles.entryChevron}>›</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <View>
          <Text style={styles.title}>NEXI Catalog</Text>
          <Text style={styles.subtitle}>{totalCount} object{totalCount !== 1 ? "s" : ""} enrolled</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or category…"
          placeholderTextColor="#64748B"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color="#D97706" size="large" style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>No Objects Enrolled</Text>
          <Text style={styles.emptyDesc}>
            Use NEXI Capture to scan objects from multiple angles.
            Once enrolled, they'll be automatically recognized in future scans.
          </Text>
          <Pressable style={styles.enrollBtn} onPress={onEnrollNew}>
            <Text style={styles.enrollBtnText}>Enroll First Object</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />
          }
          ListEmptyComponent={
            <Text style={styles.noResults}>No entries match "{search}"</Text>
          }
          ListFooterComponent={
            <Pressable style={styles.enrollFooterBtn} onPress={onEnrollNew}>
              <Text style={styles.enrollFooterBtnText}>+ Enroll New Object</Text>
            </Pressable>
          }
        />
      )}
      {/* Entry Detail / Edit Modal */}
      <Modal visible={showDetail} animationType="slide" onRequestClose={closeDetail}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Pressable onPress={closeDetail} style={styles.modalHeaderBtn}>
              <Text style={styles.modalBackText}>‹ Back</Text>
            </Pressable>
            <Text style={styles.modalTitle} numberOfLines={1}>Edit Entry</Text>
            <Pressable
              onPress={() => detailEntry && handleDelete({ ...detailEntry, featurePrintCount: detailEntry.featurePrintCount, matchCount: detailEntry.matchCount, updatedAt: detailEntry.updatedAt })}
              style={styles.modalHeaderBtn}
            >
              <Text style={styles.modalDeleteText}>Delete</Text>
            </Pressable>
          </View>

          {detailLoading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#D97706" />
            </View>
          ) : detailEntry ? (
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Thumbnail */}
              {detailEntry.thumbnailUri ? (
                <Image source={{ uri: detailEntry.thumbnailUri }} style={styles.modalThumb} />
              ) : (
                <View style={[styles.modalThumb, styles.modalThumbPlaceholder]}>
                  <Text style={{ fontSize: 40 }}>🔍</Text>
                </View>
              )}

              {/* Status badge */}
              <View style={[styles.modalStatusBadge, { backgroundColor: statusColor(detailEntry.status) + "22" }]}>
                <Text style={[styles.modalStatusText, { color: statusColor(detailEntry.status) }]}>
                  {statusLabel(detailEntry.status)}
                </Text>
              </View>

              {/* Editable fields */}
              <Text style={styles.modalFieldLabel}>Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Object name"
                placeholderTextColor="#64748B"
              />

              <Text style={styles.modalFieldLabel}>Category *</Text>
              <Pressable
                style={styles.modalPickerBtn}
                onPress={() => { setShowCatPicker(!showCatPicker); setShowMatPicker(false); }}
              >
                <Text style={editCategory ? styles.modalPickerValue : styles.modalPickerPlaceholder}>
                  {editCategory || "Select category…"}
                </Text>
                <Text style={styles.modalPickerArrow}>{showCatPicker ? "▲" : "▼"}</Text>
              </Pressable>
              {showCatPicker && (
                <View style={styles.modalPickerList}>
                  {NEXI_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.modalPickerItem, editCategory === cat && styles.modalPickerItemActive]}
                      onPress={() => { setEditCategory(cat); setShowCatPicker(false); }}
                    >
                      <Text style={[styles.modalPickerItemText, editCategory === cat && styles.modalPickerItemTextActive]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.modalFieldLabel}>Subcategory</Text>
              <TextInput
                style={styles.modalInput}
                value={editSubcategory}
                onChangeText={setEditSubcategory}
                placeholder="e.g. LGR, Folding, Industrial"
                placeholderTextColor="#64748B"
              />

              <Text style={styles.modalFieldLabel}>Material</Text>
              <Pressable
                style={styles.modalPickerBtn}
                onPress={() => { setShowMatPicker(!showMatPicker); setShowCatPicker(false); }}
              >
                <Text style={editMaterial ? styles.modalPickerValue : styles.modalPickerPlaceholder}>
                  {editMaterial || "Select material…"}
                </Text>
                <Text style={styles.modalPickerArrow}>{showMatPicker ? "▲" : "▼"}</Text>
              </Pressable>
              {showMatPicker && (
                <View style={styles.modalPickerList}>
                  {NEXI_MATERIALS.map((mat) => (
                    <Pressable
                      key={mat}
                      style={[styles.modalPickerItem, editMaterial === mat && styles.modalPickerItemActive]}
                      onPress={() => { setEditMaterial(mat); setShowMatPicker(false); }}
                    >
                      <Text style={[styles.modalPickerItemText, editMaterial === mat && styles.modalPickerItemTextActive]}>{mat}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.modalFieldLabel}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.modalInput}
                value={editTags}
                onChangeText={setEditTags}
                placeholder="e.g. equipment, portable"
                placeholderTextColor="#64748B"
              />

              {/* Metadata (read-only) */}
              <View style={styles.modalMetaRow}>
                <Text style={styles.modalMetaLabel}>Fingerprints</Text>
                <Text style={styles.modalMetaValue}>{detailEntry.featurePrintCount}</Text>
              </View>
              <View style={styles.modalMetaRow}>
                <Text style={styles.modalMetaLabel}>Matches</Text>
                <Text style={styles.modalMetaValue}>{detailEntry.matchCount}</Text>
              </View>
              <View style={styles.modalMetaRow}>
                <Text style={styles.modalMetaLabel}>Created</Text>
                <Text style={styles.modalMetaValue}>{formatDate(detailEntry.createdAt)}</Text>
              </View>

              {/* Action buttons */}
              <Pressable
                style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
                onPress={saveEdits}
                disabled={saving}
              >
                <Text style={styles.modalSaveBtnText}>
                  {saving ? "Saving…" : "Save Changes"}
                </Text>
              </Pressable>

              {(detailEntry.status ?? "draft") === "draft" && (
                <Pressable
                  style={[styles.modalApprovalBtn, saving && { opacity: 0.6 }]}
                  onPress={submitForApproval}
                  disabled={saving}
                >
                  <Text style={styles.modalApprovalBtnText}>Submit for Approval →</Text>
                </Pressable>
              )}

              {detailEntry.status === "pending_approval" && (
                <View style={styles.modalPendingNotice}>
                  <Text style={styles.modalPendingText}>⏳ Pending PM review</Text>
                  {detailEntry.reviewNote ? (
                    <Text style={styles.modalReviewNote}>
                      “{detailEntry.reviewNote}”
                    </Text>
                  ) : null}
                  <Text style={styles.modalPendingHint}>
                    A PM or above will review this item and assign it to the correct category.
                  </Text>
                </View>
              )}

              {detailEntry.status === "approved" && (
                <View style={[styles.modalPendingNotice, { backgroundColor: "#14532D" }]}>
                  <Text style={[styles.modalPendingText, { color: "#4ADE80" }]}>✓ Approved</Text>
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backText: { color: "#60A5FA", fontSize: 17 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#D97706", fontSize: 12, fontWeight: "600" },

  // Search
  searchContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1E293B", borderRadius: 10, marginHorizontal: 16,
    paddingHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#334155",
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 15, paddingVertical: 10 },
  searchClear: { color: "#64748B", fontSize: 16, padding: 4 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  entryCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1E293B", borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  thumbContainer: { marginRight: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: "#334155", alignItems: "center", justifyContent: "center",
  },
  thumbPlaceholderText: { fontSize: 24 },
  entryInfo: { flex: 1 },
  entryNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  entryName: { color: "#fff", fontSize: 15, fontWeight: "700", flexShrink: 1 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  entryChevron: { color: "#475569", fontSize: 22, marginLeft: 8 },
  entryCategory: { color: "#D97706", fontSize: 13, fontWeight: "600", marginBottom: 4 },
  entryMeta: { flexDirection: "row", alignItems: "center" },
  entryMetaText: { color: "#64748B", fontSize: 11 },
  entryMetaDot: { color: "#475569", marginHorizontal: 4 },
  // Empty state
  emptyState: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptyDesc: { color: "#94A3B8", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  enrollBtn: {
    backgroundColor: "#D97706", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
  },
  enrollBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Footer
  enrollFooterBtn: {
    alignItems: "center", paddingVertical: 16, marginTop: 8,
    borderWidth: 1, borderColor: "#334155", borderRadius: 10, borderStyle: "dashed",
  },
  enrollFooterBtnText: { color: "#D97706", fontSize: 15, fontWeight: "600" },

  noResults: { color: "#64748B", fontSize: 14, textAlign: "center", paddingVertical: 32 },

  // Detail/edit modal
  modalContainer: { flex: 1, backgroundColor: colors.primary },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#334155",
  },
  modalHeaderBtn: { minWidth: 60 },
  modalBackText: { color: "#60A5FA", fontSize: 17 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#fff", flex: 1, textAlign: "center" },
  modalDeleteText: { color: "#DC2626", fontSize: 14, fontWeight: "600", textAlign: "right" },
  modalLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  modalBody: { flex: 1 },
  modalBodyContent: { padding: 16, paddingBottom: 40 },
  modalThumb: {
    width: 120, height: 120, borderRadius: 12, alignSelf: "center",
    marginBottom: 12, borderWidth: 2, borderColor: "#D97706",
  },
  modalThumbPlaceholder: {
    backgroundColor: "#334155", alignItems: "center", justifyContent: "center",
  },
  modalStatusBadge: {
    alignSelf: "center", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16,
  },
  modalStatusText: { fontSize: 13, fontWeight: "700" },
  modalFieldLabel: { color: "#94A3B8", fontSize: 13, marginBottom: 4, marginTop: 12 },
  modalInput: {
    backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#334155",
  },
  modalPickerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: "#334155",
  },
  modalPickerValue: { color: "#fff", fontSize: 15 },
  modalPickerPlaceholder: { color: "#64748B", fontSize: 15 },
  modalPickerArrow: { color: "#64748B", fontSize: 12 },
  modalPickerList: {
    backgroundColor: "#1E293B", borderRadius: 8, borderWidth: 1, borderColor: "#334155",
    maxHeight: 200, marginTop: 4,
  },
  modalPickerItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1a2332" },
  modalPickerItemActive: { backgroundColor: "#D97706" + "22" },
  modalPickerItemText: { color: "#CBD5E1", fontSize: 14 },
  modalPickerItemTextActive: { color: "#D97706", fontWeight: "600" },
  modalMetaRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1E293B",
  },
  modalMetaLabel: { color: "#64748B", fontSize: 13 },
  modalMetaValue: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },
  modalSaveBtn: {
    backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 20,
  },
  modalSaveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalApprovalBtn: {
    backgroundColor: "#D97706", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 10,
  },
  modalApprovalBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalPendingNotice: {
    backgroundColor: "#78350F", borderRadius: 8, paddingVertical: 10,
    alignItems: "center", marginTop: 12,
  },
  modalPendingText: { color: "#FCD34D", fontSize: 14, fontWeight: "600" },
  modalReviewNote: { color: "#FDE68A", fontSize: 13, fontStyle: "italic", marginTop: 6, lineHeight: 18 },
  modalPendingHint: { color: "#D97706", fontSize: 11, marginTop: 6, opacity: 0.8 },
});
