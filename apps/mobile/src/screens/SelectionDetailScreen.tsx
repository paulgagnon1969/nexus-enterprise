import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { colors } from "../theme/colors";
import { getRoomSelections, updateSelectionStatus, generateSheet } from "../api/selections";
import type { SelectionItem } from "../api/selections";
import type { ProjectListItem } from "../types/api";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PROPOSED: { bg: "#f1f5f9", fg: "#475569" },
  APPROVED: { bg: "#dcfce7", fg: "#166534" },
  ORDERED: { bg: "#dbeafe", fg: "#1e40af" },
  DELIVERED: { bg: "#fef3c7", fg: "#92400e" },
  INSTALLED: { bg: "#d1fae5", fg: "#065f46" },
  REJECTED: { bg: "#fecaca", fg: "#991b1b" },
};

const NEXT_STATUS: Record<string, SelectionItem["status"]> = {
  PROPOSED: "APPROVED",
  APPROVED: "ORDERED",
  ORDERED: "DELIVERED",
  DELIVERED: "INSTALLED",
};

export function SelectionDetailScreen({
  project,
  roomId,
  onBack,
  onOpenProductPicker,
}: {
  project: ProjectListItem;
  roomId: string;
  onBack: () => void;
  onOpenProductPicker: () => void;
}) {
  const [selections, setSelections] = useState<SelectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadSelections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRoomSelections(project.id, roomId);
      setSelections(data);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project.id, roomId]);

  useEffect(() => { loadSelections(); }, [loadSelections]);

  const handleStatusChange = useCallback(async (sel: SelectionItem) => {
    const next = NEXT_STATUS[sel.status];
    if (!next) return;

    try {
      const updated = await updateSelectionStatus(project.id, sel.id, next);
      setSelections((prev) =>
        prev.map((s) => (s.id === sel.id ? { ...s, status: updated.status } : s)),
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    }
  }, [project.id]);

  const handleReject = useCallback(async (sel: SelectionItem) => {
    Alert.alert("Reject Selection", `Reject ${sel.vendorProduct?.name ?? "this selection"}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await updateSelectionStatus(project.id, sel.id, "REJECTED");
            setSelections((prev) =>
              prev.map((s) => (s.id === sel.id ? { ...s, status: updated.status } : s)),
            );
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }, [project.id]);

  const handleGenerateSheet = useCallback(async () => {
    setGenerating(true);
    try {
      await generateSheet(project.id, roomId);
      Alert.alert("Selection Sheet Generated", "The eDoc has been created and is ready for viewing.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [project.id, roomId]);

  const totalCost = selections.reduce((sum, s) => {
    return sum + ((s.vendorProduct?.price ?? 0) * (s.quantity ?? 1));
  }, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Room Selections</Text>
        <Pressable onPress={onOpenProductPicker}>
          <Text style={styles.addBtn}>+ Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {selections.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No selections yet. Tap "+ Add" to pick products.</Text>
            </View>
          ) : (
            selections.map((sel) => {
              const p = sel.vendorProduct;
              const sc = STATUS_COLORS[sel.status] ?? STATUS_COLORS.PROPOSED;
              const dims = p ? [p.width, p.height, p.depth].filter(Boolean).map((d) => `${d}"`).join(" × ") : "";
              const next = NEXT_STATUS[sel.status];

              return (
                <View key={sel.id} style={styles.selCard}>
                  <View style={styles.selRow}>
                    <View style={styles.positionBadge}>
                      <Text style={styles.positionText}>{sel.position}</Text>
                    </View>
                    {p?.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={styles.productImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.productImage, styles.imagePlaceholder]}>
                        <Text style={styles.imagePlaceholderText}>📦</Text>
                      </View>
                    )}
                    <View style={styles.selInfo}>
                      <Text style={styles.productName} numberOfLines={2}>{p?.name ?? "Unassigned"}</Text>
                      {p?.sku && <Text style={styles.sku}>{p.sku}</Text>}
                      {dims ? <Text style={styles.dims}>{dims}</Text> : null}
                    </View>
                    <View style={styles.priceCol}>
                      {p?.price != null && <Text style={styles.price}>${p.price.toFixed(0)}</Text>}
                      {sel.quantity > 1 && <Text style={styles.qty}>×{sel.quantity}</Text>}
                    </View>
                  </View>

                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.fg }]}>{sel.status}</Text>
                    </View>
                    <View style={styles.actions}>
                      {next && (
                        <Pressable style={styles.actionBtn} onPress={() => handleStatusChange(sel)}>
                          <Text style={styles.actionText}>→ {next}</Text>
                        </Pressable>
                      )}
                      {sel.status !== "REJECTED" && sel.status !== "INSTALLED" && (
                        <Pressable onPress={() => handleReject(sel)}>
                          <Text style={styles.rejectText}>Reject</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {selections.length > 0 && (
            <View style={styles.footer}>
              <Text style={styles.totalLabel}>Total: ${totalCost.toFixed(2)}</Text>
              <Pressable
                style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
                onPress={handleGenerateSheet}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.generateBtnText}>Generate Sheet</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#e2e8f0" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  link: { fontSize: 14, color: colors.primary, fontWeight: "500" },
  addBtn: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 14, color: "#64748b", textAlign: "center" },
  selCard: { backgroundColor: "#fff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  selRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  positionBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  positionText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  productImage: { width: 48, height: 48, borderRadius: 6 },
  imagePlaceholder: { backgroundColor: "#f1f5f9", justifyContent: "center", alignItems: "center" },
  imagePlaceholderText: { fontSize: 20 },
  selInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  sku: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
  dims: { fontSize: 11, color: "#94a3b8" },
  priceCol: { alignItems: "flex-end" },
  price: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  qty: { fontSize: 11, color: "#94a3b8" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: "#f1f5f9" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 12, alignItems: "center" },
  actionBtn: { backgroundColor: "#eff6ff", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  actionText: { fontSize: 12, fontWeight: "600", color: colors.primary },
  rejectText: { fontSize: 12, color: "#dc2626" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderColor: "#e2e8f0" },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  generateBtn: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
