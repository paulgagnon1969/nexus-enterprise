import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
} from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import { colors } from "../theme/colors";
import type { FieldPetlItem, ProjectListItem } from "../types/api";

interface Props {
  project: ProjectListItem;
  onBack: () => void;
}

type FieldPetlEditState = {
  item: FieldPetlItem;
  incorrect: boolean;
  fieldQty: string;
  newPercent: string;
  note: string;
  saving: boolean;
  error: string | null;
};

export function FieldPetlScreen({ project, onBack }: Props) {
  const [items, setItems] = useState<FieldPetlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgGroupFilters, setOrgGroupFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editItem, setEditItem] = useState<FieldPetlEditState | null>(null);

  const cacheKey = `fieldPetl:${project.id}`;

  // Load data
  useEffect(() => {
    (async () => {
      // Load cached first
      const cached = await getCache<FieldPetlItem[]>(cacheKey);
      if (cached && cached.length > 0) {
        setItems(cached);
        setLoading(false);
      }

      // Fetch fresh
      try {
        const json = await apiJson<{ items: any[] }>(
          `/projects/${encodeURIComponent(project.id)}/petl-field`
        );
        const rawItems: any[] = Array.isArray(json?.items) ? json.items : [];
        const mapped: FieldPetlItem[] = rawItems.map((it) => ({
          sowItemId: String(it.id),
          lineNo: Number(it.lineNo ?? 0),
          roomParticleId: it.roomParticleId ?? null,
          roomName: it.roomName ?? null,
          categoryCode: it.categoryCode ?? null,
          selectionCode: it.selectionCode ?? null,
          activity: it.activity ?? null,
          description: it.description ?? null,
          unit: it.unit ?? null,
          originalQty:
            typeof it.originalQty === "number" ? it.originalQty : it.qty ?? null,
          qty: typeof it.qty === "number" ? it.qty : null,
          qtyFlaggedIncorrect: !!it.qtyFlaggedIncorrect,
          qtyFieldReported:
            typeof it.qtyFieldReported === "number" ? it.qtyFieldReported : null,
          qtyReviewStatus: it.qtyReviewStatus ?? null,
          orgGroupCode: it.orgGroupCode ?? null,
          percentComplete:
            typeof it.percentComplete === "number" ? it.percentComplete : undefined,
        }));

        setItems(mapped);
        await setCache(cacheKey, mapped);
        setError(null);
      } catch (e) {
        if (!cached || cached.length === 0) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id]);

  // Extract unique org group codes
  const orgGroupCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const it of items) {
      const code = String(it.orgGroupCode ?? "").trim();
      if (code) codes.add(code);
    }
    return Array.from(codes).sort();
  }, [items]);

  const orgGroupFilterSet = useMemo(
    () => new Set(orgGroupFilters),
    [orgGroupFilters]
  );

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // Org group filter
      if (orgGroupFilterSet.size > 0) {
        const code = String(it.orgGroupCode ?? "").trim();
        if (!code || !orgGroupFilterSet.has(code)) return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          it.description,
          it.roomName,
          it.activity,
          String(it.lineNo),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [items, orgGroupFilterSet, searchQuery]);

  const openEdit = (item: FieldPetlItem) => {
    setEditItem({
      item,
      incorrect: item.qtyFlaggedIncorrect,
      fieldQty:
        item.qtyFieldReported != null ? String(item.qtyFieldReported) : "",
      newPercent:
        typeof item.percentComplete === "number"
          ? String(item.percentComplete)
          : "",
      note: "",
      saving: false,
      error: null,
    });
  };

  const closeEdit = () => {
    if (editItem?.saving) return;
    setEditItem(null);
  };

  const submitEdit = async () => {
    if (!editItem) return;

    const { item, incorrect, fieldQty, newPercent, note } = editItem;

    let parsedFieldQty: number | null = null;
    if (incorrect) {
      if (!fieldQty.trim()) {
        setEditItem((prev) =>
          prev ? { ...prev, error: "Enter a field quantity." } : prev
        );
        return;
      }
      parsedFieldQty = Number(fieldQty);
      if (!Number.isFinite(parsedFieldQty) || parsedFieldQty < 0) {
        setEditItem((prev) =>
          prev ? { ...prev, error: "Field qty must be non-negative." } : prev
        );
        return;
      }
    }

    let parsedPercent: number | null = null;
    if (newPercent.trim()) {
      const n = Number(newPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setEditItem((prev) =>
          prev ? { ...prev, error: "Percent must be 0-100." } : prev
        );
        return;
      }
      parsedPercent = n;
    }

    setEditItem((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

    try {
      await enqueueOutbox("fieldPetl.edit", {
        projectId: project.id,
        sowItemId: item.sowItemId,
        incorrect,
        fieldQty: parsedFieldQty,
        percent: parsedPercent,
        note: note || null,
      });

      // Optimistic update
      setItems((prev) =>
        prev.map((it) => {
          if (it.sowItemId !== item.sowItemId) return it;
          return {
            ...it,
            qtyFlaggedIncorrect: incorrect,
            qtyFieldReported: incorrect ? parsedFieldQty : null,
            qtyReviewStatus: incorrect ? "PENDING" : null,
            percentComplete: parsedPercent ?? it.percentComplete,
          };
        })
      );

      setEditItem(null);
    } catch (err) {
      setEditItem((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error: err instanceof Error ? err.message : String(err),
            }
          : prev
      );
    }
  };

  const getStatusLabel = (item: FieldPetlItem) => {
    if (item.qtyFlaggedIncorrect && item.qtyReviewStatus === "PENDING") {
      return item.qtyFieldReported != null
        ? `Pending (${item.qtyFieldReported})`
        : "Pending";
    }
    if (item.qtyReviewStatus === "ACCEPTED") return "Accepted";
    if (item.qtyReviewStatus === "REJECTED") return "Rejected";
    return "OK";
  };

  const getStatusColor = (item: FieldPetlItem) => {
    if (item.qtyReviewStatus === "PENDING") return colors.warning;
    if (item.qtyReviewStatus === "ACCEPTED") return colors.success;
    if (item.qtyReviewStatus === "REJECTED") return colors.error;
    return colors.textMuted;
  };

  const renderItem = ({ item }: { item: FieldPetlItem }) => {
    const orig = item.originalQty ?? item.qty ?? null;
    const curr = item.qty ?? null;
    const pct = item.percentComplete;

    return (
      <Pressable style={styles.itemCard} onPress={() => openEdit(item)}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemLineNo}>#{item.lineNo}</Text>
          {item.roomName && (
            <Text style={styles.itemRoom}>{item.roomName}</Text>
          )}
          {item.orgGroupCode && (
            <View style={styles.orgBadge}>
              <Text style={styles.orgBadgeText}>{item.orgGroupCode}</Text>
            </View>
          )}
        </View>

        <Text style={styles.itemDescription} numberOfLines={2}>
          {item.description || "(no description)"}
        </Text>

        <View style={styles.itemDetails}>
          <Text style={styles.itemQty}>
            Qty: {orig ?? "—"} → {curr ?? "—"}
            {item.unit ? ` ${item.unit}` : ""}
          </Text>
          {typeof pct === "number" && (
            <Text style={styles.itemPercent}>{pct}%</Text>
          )}
        </View>

        <View style={styles.itemFooter}>
          <Text style={[styles.itemStatus, { color: getStatusColor(item) }]}>
            {getStatusLabel(item)}
          </Text>
          <Text style={styles.editHint}>Tap to edit</Text>
        </View>
      </Pressable>
    );
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Field PETL</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading scope...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLink}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Field PETL</Text>
        <Text style={styles.itemCount}>{filteredItems.length} items</Text>
      </View>

      <Text style={styles.projectName}>{project.name}</Text>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by description, room, line#..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Org Group filters */}
      {orgGroupCodes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          <Pressable
            style={[
              styles.chip,
              orgGroupFilterSet.size === 0 && styles.chipSelected,
            ]}
            onPress={() => setOrgGroupFilters([])}
          >
            <Text
              style={
                orgGroupFilterSet.size === 0
                  ? styles.chipTextSelected
                  : styles.chipText
              }
            >
              All
            </Text>
          </Pressable>
          {orgGroupCodes.map((code) => {
            const selected = orgGroupFilterSet.has(code);
            return (
              <Pressable
                key={code}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  setOrgGroupFilters((prev) =>
                    prev.includes(code)
                      ? prev.filter((c) => c !== code)
                      : [...prev, code]
                  );
                }}
              >
                <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Item list */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.sowItemId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery || orgGroupFilterSet.size > 0
                ? "No items match your filters"
                : "No PETL scope items found"}
            </Text>
          </View>
        }
      />

      {/* Edit Modal */}
      <Modal
        visible={!!editItem}
        animationType="slide"
        transparent
        onRequestClose={closeEdit}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {editItem && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit PETL Item</Text>
                  <Pressable onPress={closeEdit}>
                    <Text style={styles.modalClose}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.modalBody}>
                  <Text style={styles.modalItemLine}>
                    #{editItem.item.lineNo}
                    {editItem.item.roomName
                      ? ` · ${editItem.item.roomName}`
                      : ""}
                  </Text>
                  <Text style={styles.modalItemDesc}>
                    {editItem.item.description || "(no description)"}
                  </Text>

                  <Text style={styles.modalLabel}>Current Qty</Text>
                  <Text style={styles.modalValue}>
                    {editItem.item.qty ?? "—"} {editItem.item.unit || ""}
                  </Text>

                  <Pressable
                    style={styles.toggleRow}
                    onPress={() =>
                      setEditItem((prev) =>
                        prev ? { ...prev, incorrect: !prev.incorrect } : prev
                      )
                    }
                  >
                    <Text style={styles.toggleLabel}>Qty is incorrect?</Text>
                    <View
                      style={[
                        styles.toggleBox,
                        editItem.incorrect && styles.toggleBoxActive,
                      ]}
                    >
                      <Text style={styles.toggleBoxText}>
                        {editItem.incorrect ? "Yes" : "No"}
                      </Text>
                    </View>
                  </Pressable>

                  {editItem.incorrect && (
                    <>
                      <Text style={styles.modalLabel}>Field Quantity</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={editItem.fieldQty}
                        onChangeText={(t) =>
                          setEditItem((prev) =>
                            prev ? { ...prev, fieldQty: t } : prev
                          )
                        }
                        keyboardType="numeric"
                        placeholder="Enter correct quantity"
                      />
                    </>
                  )}

                  <Text style={styles.modalLabel}>% Complete (optional)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editItem.newPercent}
                    onChangeText={(t) =>
                      setEditItem((prev) =>
                        prev ? { ...prev, newPercent: t } : prev
                      )
                    }
                    keyboardType="numeric"
                    placeholder="0-100"
                  />

                  <Text style={styles.modalLabel}>Note (optional)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalInputMultiline]}
                    value={editItem.note}
                    onChangeText={(t) =>
                      setEditItem((prev) =>
                        prev ? { ...prev, note: t } : prev
                      )
                    }
                    placeholder="Add a note..."
                    multiline
                  />

                  {editItem.error && (
                    <Text style={styles.modalError}>{editItem.error}</Text>
                  )}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Pressable
                    style={styles.modalCancelButton}
                    onPress={closeEdit}
                    disabled={editItem.saving}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalSaveButton,
                      editItem.saving && styles.modalSaveButtonDisabled,
                    ]}
                    onPress={submitEdit}
                    disabled={editItem.saving}
                  >
                    <Text style={styles.modalSaveText}>
                      {editItem.saving ? "Saving..." : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  backLink: {
    color: colors.primary,
    fontWeight: "600",
  },
  itemCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  projectName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  searchInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterScroll: {
    backgroundColor: colors.background,
    paddingBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.chipBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: colors.chipBackground,
  },
  chipSelected: {
    backgroundColor: colors.chipBackgroundSelected,
    borderColor: colors.chipBackgroundSelected,
  },
  chipText: {
    fontSize: 12,
    color: colors.chipText,
  },
  chipTextSelected: {
    fontSize: 12,
    color: colors.chipTextSelected,
    fontWeight: "600",
  },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: colors.errorLight,
    borderRadius: 8,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    paddingTop: 40,
    alignItems: "center",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  itemCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  itemLineNo: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  itemRoom: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  orgBadge: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  itemDescription: {
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 6,
    lineHeight: 18,
  },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  itemQty: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  itemPercent: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemStatus: {
    fontSize: 11,
    fontWeight: "600",
  },
  editHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: 20,
    color: colors.textMuted,
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  modalItemLine: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 4,
  },
  modalItemDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 12,
  },
  modalValue: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  modalInputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  toggleBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.backgroundSecondary,
  },
  toggleBoxActive: {
    backgroundColor: colors.warning,
  },
  toggleBoxText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  modalError: {
    color: colors.error,
    fontSize: 12,
    marginTop: 8,
  },
  modalFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: "center",
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  modalSaveButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  modalSaveText: {
    color: colors.textOnPrimary,
    fontWeight: "600",
  },
});
