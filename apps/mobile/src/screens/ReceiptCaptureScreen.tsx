/**
 * ReceiptCaptureScreen.tsx
 *
 * Multi-receipt capture flow:
 *   1. Snap / pick a receipt photo
 *   2. Compress + send to OCR API
 *   3. Store result (+ image) in local SQLite
 *   4. Show scrollable list of captured receipts
 *   5. User approves / edits / rejects each receipt
 *   6. "Create Daily Log" consolidates all approved into one RECEIPT_EXPENSE DL
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiJson } from "../api/client";
import { scanReceiptImage } from "../api/dailyLog";
import { copyToAppStorage } from "../storage/files";
import { compressForNetwork } from "../utils/mediaCompressor";
import { enqueueOutbox } from "../offline/outbox";
import { triggerSync } from "../offline/autoSync";
import { addLocalDailyLog } from "../offline/sync";
import { colors } from "../theme/colors";
import { ReceiptCard } from "../components/ReceiptCard";
import {
  insertReceipt,
  listReceipts,
  approveReceipt,
  rejectReceipt,
  resetReceipt,
  updateReceipt,
  deleteReceipt,
  getConsolidatedSummary,
  markReceiptsConsolidated,
  type LocalReceipt,
} from "../receipts/receiptStore";
import type { ProjectListItem, DailyLogCreateRequest } from "../types/api";

function makeLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface Props {
  project: ProjectListItem;
  onBack: () => void;
  onCreated?: () => void;
}

export function ReceiptCaptureScreen({ project, onBack, onCreated }: Props) {
  const [receipts, setReceipts] = useState<LocalReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Edit modal state
  const [editReceipt, setEditReceipt] = useState<LocalReceipt | null>(null);
  const [editVendor, setEditVendor] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── Load receipts ──────────────────────────────────────────

  const refresh = useCallback(async () => {
    const all = await listReceipts(project.id);
    setReceipts(all);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Consolidated summary ───────────────────────────────────

  const approvedCount = receipts.filter(
    (r) => r.status === "approved" && !r.dailyLogId,
  ).length;
  const pendingCount = receipts.filter((r) => r.status === "pending").length;
  const totalApproved = receipts
    .filter((r) => r.status === "approved" && !r.dailyLogId)
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  // ── Capture receipt photo ──────────────────────────────────

  const captureReceipt = async (source: "camera" | "library") => {
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setStatus("Camera permission denied");
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setStatus("Photo library permission denied");
        return;
      }
    }

    const pickerFn =
      source === "camera"
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

    const res = await pickerFn({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: source === "library",
      selectionLimit: 10,
    });

    if (res.canceled || !res.assets?.length) return;

    // Process each selected image
    for (const asset of res.assets) {
      if (!asset.uri) continue;
      await processReceiptImage(asset.uri, (asset as any).fileName ?? null);
    }
  };

  const processReceiptImage = async (uri: string, fileName: string | null) => {
    setScanning(true);
    setStatus("📸 Processing receipt...");

    try {
      // 1. Compress
      const compressed = await compressForNetwork(uri);

      // 2. Copy to app storage
      const stored = await copyToAppStorage({
        uri: compressed.uri,
        name: fileName,
        mimeType: "image/jpeg",
      });

      // 3. OCR
      setStatus("🔍 Scanning receipt...");
      const ocrResult = await scanReceiptImage(stored.uri, stored.name, stored.mimeType);

      // 4. Save to SQLite
      const receipt = await insertReceipt({
        projectId: project.id,
        imageUri: stored.uri,
        imageName: stored.name,
        vendor: ocrResult.success ? ocrResult.vendor : null,
        amount: ocrResult.success ? ocrResult.amount : null,
        subtotal: ocrResult.success ? (ocrResult.subtotal ?? null) : null,
        taxAmount: ocrResult.success ? (ocrResult.taxAmount ?? null) : null,
        receiptDate: ocrResult.success ? ocrResult.date : null,
        currency: ocrResult.currency ?? "USD",
        paymentMethod: ocrResult.paymentMethod ?? null,
        lineItems: ocrResult.lineItems ?? [],
        ocrConfidence: ocrResult.confidence,
        ocrRaw: ocrResult.success ? JSON.stringify(ocrResult) : null,
      });

      if (ocrResult.success) {
        const confPct = ocrResult.confidence
          ? ` (${Math.round(ocrResult.confidence * 100)}%)`
          : "";
        setStatus(
          `✅ ${ocrResult.vendor || "Unknown"} — $${ocrResult.amount?.toFixed(2) ?? "?"}${confPct}`,
        );
      } else {
        setStatus("⚠️ Could not read receipt — please edit manually");
      }

      await refresh();
    } catch (e) {
      console.error("[ReceiptCapture] Error:", e);
      setStatus(
        `❌ ${e instanceof Error ? e.message : "Failed to process receipt"}`,
      );
    } finally {
      setScanning(false);
    }
  };

  // ── Receipt actions ────────────────────────────────────────

  const handleApprove = async (id: string) => {
    await approveReceipt(id);
    await refresh();
  };

  const handleReject = async (id: string) => {
    await rejectReceipt(id);
    await refresh();
  };

  const handleDelete = (receipt: LocalReceipt) => {
    Alert.alert("Delete Receipt", `Remove "${receipt.vendor || "this receipt"}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteReceipt(receipt.id);
          await refresh();
        },
      },
    ]);
  };

  const openEdit = (r: LocalReceipt) => {
    setEditReceipt(r);
    setEditVendor(r.vendor || "");
    setEditAmount(r.amount != null ? String(r.amount) : "");
    setEditDate(r.receiptDate || today);
    setEditNotes(r.notes || "");
  };

  const saveEdit = async () => {
    if (!editReceipt) return;
    await updateReceipt(editReceipt.id, {
      vendor: editVendor || null,
      amount: editAmount ? parseFloat(editAmount) : null,
      receiptDate: editDate || null,
      notes: editNotes || null,
    });
    setEditReceipt(null);
    await refresh();
  };

  const approveAll = async () => {
    const pending = receipts.filter((r) => r.status === "pending");
    for (const r of pending) {
      await approveReceipt(r.id);
    }
    await refresh();
    setStatus(`✅ Approved ${pending.length} receipt(s)`);
  };

  // ── Create consolidated Daily Log ──────────────────────────

  const createConsolidatedDailyLog = async () => {
    const summary = await getConsolidatedSummary(project.id);

    if (summary.receiptCount === 0) {
      Alert.alert("No Receipts", "Approve at least one receipt before creating a Daily Log.");
      return;
    }

    Alert.alert(
      "Create Daily Log",
      `Consolidate ${summary.receiptCount} receipt(s) totaling $${summary.totalAmount.toFixed(2)} into a Daily Log?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create", onPress: () => doCreateDailyLog(summary) },
      ],
    );
  };

  const doCreateDailyLog = async (summary: Awaited<ReturnType<typeof getConsolidatedSummary>>) => {
    setCreating(true);
    setStatus("Creating Daily Log...");

    const vendorList = summary.vendors.join(", ") || "Various";
    const localLogId = makeLocalId();

    const dto: DailyLogCreateRequest = {
      logDate: today,
      type: "RECEIPT_EXPENSE",
      title: `Receipts — ${vendorList} ($${summary.totalAmount.toFixed(2)})`,
      workPerformed: summary.receipts
        .map((r) => `• ${r.vendor || "Unknown"}: $${(r.amount ?? 0).toFixed(2)}${r.receiptDate ? ` (${r.receiptDate})` : ""}`)
        .join("\n"),
      expenseVendor: vendorList,
      expenseAmount: summary.totalAmount,
      expenseDate: today,
      shareInternal: false,
      shareSubs: false,
      shareClient: false,
      sharePrivate: true,
    };

    try {
      // Try online
      const result = await apiJson<any>(
        `/projects/${encodeURIComponent(project.id)}/daily-logs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dto),
        },
      );

      // Mark receipts as consolidated
      const receiptIds = summary.receipts.map((r) => r.id);
      await markReceiptsConsolidated(receiptIds, result.id);

      setStatus(`✅ Daily Log created with ${summary.receiptCount} receipts`);
      await refresh();
      onCreated?.();
    } catch {
      // Offline fallback — enqueue for sync
      await addLocalDailyLog(project.id, {
        id: localLogId,
        projectId: project.id,
        ...dto,
      });

      await enqueueOutbox("dailyLog.create", {
        projectId: project.id,
        ...dto,
      });

      const receiptIds = summary.receipts.map((r) => r.id);
      await markReceiptsConsolidated(receiptIds, localLogId);

      void triggerSync();
      setStatus("📤 Queued for sync (offline)");
      await refresh();
      onCreated?.();
    } finally {
      setCreating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  // Separate receipts into groups
  const unsubmitted = receipts.filter((r) => !r.dailyLogId);
  const submitted = receipts.filter((r) => !!r.dailyLogId);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Receipt Capture</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Project breadcrumb */}
      <View style={styles.breadcrumb}>
        <Text style={styles.breadcrumbText}>🧾 {project.name}</Text>
      </View>

      {/* Status bar */}
      {status && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {/* Capture buttons */}
      <View style={styles.captureRow}>
        <Pressable
          style={[styles.captureBtn, scanning && styles.captureBtnDisabled]}
          onPress={() => captureReceipt("camera")}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.captureBtnText}>📷 Snap Receipt</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.captureBtn, styles.captureBtnSecondary, scanning && styles.captureBtnDisabled]}
          onPress={() => captureReceipt("library")}
          disabled={scanning}
        >
          <Text style={styles.captureBtnSecondaryText}>🖼 From Library</Text>
        </Pressable>
      </View>

      {/* Summary + Actions */}
      {unsubmitted.length > 0 && (
        <View style={styles.summaryBar}>
          <View>
            <Text style={styles.summaryAmount}>${totalApproved.toFixed(2)}</Text>
            <Text style={styles.summaryDetail}>
              {approvedCount} approved · {pendingCount} pending
            </Text>
          </View>
          <View style={styles.summaryActions}>
            {pendingCount > 0 && (
              <Pressable style={styles.approveAllBtn} onPress={approveAll}>
                <Text style={styles.approveAllText}>Approve All</Text>
              </Pressable>
            )}
            {approvedCount > 0 && (
              <Pressable
                style={[styles.createDlBtn, creating && styles.captureBtnDisabled]}
                onPress={createConsolidatedDailyLog}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createDlText}>Create Daily Log →</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Receipt list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : unsubmitted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No Receipts Yet</Text>
            <Text style={styles.emptySubtitle}>
              Snap or pick receipt photos above.{"\n"}
              OCR auto-extracts vendor, amount, and date.
            </Text>
          </View>
        ) : (
          <>
            {unsubmitted.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                onApprove={() => handleApprove(r.id)}
                onReject={() => handleReject(r.id)}
                onEdit={() => openEdit(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}

            {submitted.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Previously Submitted</Text>
                {submitted.map((r) => (
                  <ReceiptCard key={r.id} receipt={r} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={!!editReceipt} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Receipt</Text>

            <Text style={styles.fieldLabel}>Vendor</Text>
            <TextInput
              style={styles.fieldInput}
              value={editVendor}
              onChangeText={setEditVendor}
              placeholder="Vendor name"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Amount ($)</Text>
            <TextInput
              style={styles.fieldInput}
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              style={styles.fieldInput}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.fieldInput, { height: 60 }]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setEditReceipt(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSave} onPress={saveEdit}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 16,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  link: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: "600",
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  breadcrumb: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
  },
  breadcrumbText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.backgroundTertiary,
  },
  statusText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  captureRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  captureBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  captureBtnSecondary: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  captureBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  captureBtnSecondaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  summaryDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  summaryActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  approveAllBtn: {
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  approveAllText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  createDlBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createDlText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  empty: {
    alignItems: "center",
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 20,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Edit modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  modalCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  modalSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  modalSaveText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
