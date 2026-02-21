import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { apiFetch, apiJson } from "../api/client";
import { fetchUserProjects, triggerLogOcr, scanReceiptImage } from "../api/dailyLog";
import { enqueueOutbox } from "../offline/outbox";
import { triggerSync } from "../offline/autoSync";
import { copyToAppStorage, type StoredFile } from "../storage/files";
import { compressForNetwork, getNetworkTier } from "../utils/mediaCompressor";
import { recordUsage } from "../storage/usageTracker";
import { colors } from "../theme/colors";
import type { DailyLogCreateRequest, DailyLogType, ProjectListItem } from "../types/api";

interface Props {
  onBack: () => void;
  onCreated: () => void;
  /** Optional pre-selected project */
  projectId?: string;
}

function makeLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function DailyLogCreateScreen({ onBack, onCreated, projectId }: Props) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId ?? null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [logType, setLogType] = useState<DailyLogType>("PUDL");
  const [logDate, setLogDate] = useState(today);
  const [title, setTitle] = useState("");
  const [weatherSummary, setWeatherSummary] = useState("");

  // Receipt/expense fields
  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);
  const [crewOnSite, setCrewOnSite] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [issues, setIssues] = useState("");
  const [safetyIncidents, setSafetyIncidents] = useState("");
  const [manpowerOnsite, setManpowerOnsite] = useState("");
  const [personOnsite, setPersonOnsite] = useState("");
  const [confidentialNotes, setConfidentialNotes] = useState("");
  const [attachments, setAttachments] = useState<StoredFile[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchUserProjects();
        setProjects(list);
        if (!selectedProjectId && list.length > 0) {
          setSelectedProjectId(list[0].id);
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const pickPhotoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setStatus("Media library permission denied");
      return;
    }

    const tier = await getNetworkTier();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      videoQuality: tier === "wifi" ? 1 : 0,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (res.canceled || !res.assets?.length) return;

    // Process all selected media
    const newAttachments: StoredFile[] = [];
    for (const asset of res.assets) {
      if (!asset.uri) continue;
      try {
        const isVideo = asset.type === "video";
        if (isVideo) {
          // Store video directly (no re-encoding)
          const stored = await copyToAppStorage({
            uri: asset.uri,
            name: (asset as any).fileName ?? null,
            mimeType: (asset as any).mimeType ?? "video/mp4",
          });
          newAttachments.push(stored);
        } else {
          // Compress images using network-aware quality
          const compressed = await compressForNetwork(asset.uri);
          const stored = await copyToAppStorage({
            uri: compressed.uri,
            name: (asset as any).fileName ?? null,
            mimeType: "image/jpeg",
          });
          newAttachments.push(stored);
        }
      } catch (err) {
        console.error(`[DailyLogCreate] Failed to save media:`, err);
        setStatus(`Failed to save media: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (newAttachments.length > 1) {
      setStatus(`Added ${newAttachments.length} files`);
    } else if (newAttachments.length === 1) {
      setStatus(null);
    }

    // Auto-scan first photo if receipt type
    if (logType === "RECEIPT_EXPENSE" && newAttachments.length > 0) {
      void runReceiptScan(newAttachments[0]);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setStatus("Camera permission denied");
      return;
    }

    const captureAndAsk = async (): Promise<void> => {
      const tier = await getNetworkTier();
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
        videoQuality: tier === "wifi" ? 1 : 0,
      });
      if (res.canceled) return;

      const a = res.assets?.[0];
      if (!a?.uri) return;

      try {
        const isVideo = a.type === "video";
        let stored: StoredFile;
        if (isVideo) {
          stored = await copyToAppStorage({
            uri: a.uri,
            name: (a as any).fileName ?? null,
            mimeType: (a as any).mimeType ?? "video/mp4",
          });
        } else {
          const compressed = await compressForNetwork(a.uri);
          stored = await copyToAppStorage({
            uri: compressed.uri,
            name: (a as any).fileName ?? null,
            mimeType: "image/jpeg",
          });
        }
        setAttachments((prev) => [...prev, stored]);

        // Auto-scan if receipt type (images only)
        if (!isVideo && logType === "RECEIPT_EXPENSE") {
          void runReceiptScan(stored);
        }
      } catch (err) {
        console.error(`[DailyLogCreate] Failed to save media:`, err);
        setStatus(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      // Ask if they want to capture another
      return new Promise((resolve) => {
        Alert.alert(
          "Media Added",
          "Saved. Capture another?",
          [
            {
              text: "Done",
              style: "cancel",
              onPress: () => resolve(),
            },
            {
              text: "Add Another",
              onPress: async () => {
                await captureAndAsk();
                resolve();
              },
            },
          ],
          { cancelable: false }
        );
      });
    };

    await captureAndAsk();
  };

  // Inline receipt OCR — scan photo and pre-fill vendor/amount/date
  const runReceiptScan = async (file: StoredFile) => {
    setScanning(true);
    setStatus("🔍 Scanning receipt...");
    try {
      const result = await scanReceiptImage(file.uri, file.name, file.mimeType);
      if (result.success) {
        if (result.vendor && !expenseVendor) setExpenseVendor(result.vendor);
        if (result.amount != null && !expenseAmount) setExpenseAmount(String(result.amount));
        if (result.date && expenseDate === today) setExpenseDate(result.date);
        if (result.vendor && !title) setTitle(`Receipt — ${result.vendor}`);
        const confPct = result.confidence ? `${Math.round(result.confidence * 100)}%` : "";
        setStatus(`✅ Found: ${result.vendor || "Unknown"} — $${result.amount?.toFixed(2) ?? "?"}${confPct ? ` (${confPct})` : ""}`);
      } else {
        setStatus(`⚠️ OCR: ${result.error || "Could not read receipt"}`);
      }
    } catch (e) {
      setStatus("⚠️ Receipt scan unavailable (offline?)");
    } finally {
      setScanning(false);
    }
  };

  const removeAttachment = (uri: string) => {
    setAttachments((prev) => prev.filter((x) => x.uri !== uri));
  };

  const handleSave = async () => {
    if (!selectedProjectId) {
      setStatus("Please select a project");
      return;
    }

    setSaving(true);
    setStatus(null);

    const localLogId = makeLocalId();

    const isReceipt = logType === "RECEIPT_EXPENSE";

    const dto: DailyLogCreateRequest = {
      logDate,
      type: logType,
      title: title || null,
      weatherSummary: weatherSummary || null,
      crewOnSite: crewOnSite || null,
      workPerformed: workPerformed || null,
      issues: issues || null,
      safetyIncidents: safetyIncidents || null,
      manpowerOnsite: manpowerOnsite || null,
      personOnsite: personOnsite || null,
      confidentialNotes: confidentialNotes || null,
      // Receipt/expense fields
      ...(isReceipt ? {
        expenseVendor: expenseVendor || null,
        expenseAmount: expenseAmount ? parseFloat(expenseAmount) : null,
        expenseDate: expenseDate || null,
      } : {}),
      // Receipts are private by default
      shareInternal: isReceipt ? false : true,
      shareSubs: false,
      shareClient: false,
      sharePrivate: isReceipt ? true : false,
    };

    try {
      // Try online first
      const result = await apiJson<any>(
        `/projects/${encodeURIComponent(selectedProjectId)}/daily-logs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dto),
        }
      );

      // Upload attachments if we created online
      let attachmentsFailed = 0;
      for (const a of attachments) {
        try {
          console.log(`[DailyLogCreate] Uploading attachment: ${a.name} (${a.uri})`);

          // Verify file exists before attempting upload
          const fileInfo = await FileSystem.getInfoAsync(a.uri);
          if (!fileInfo.exists) {
            console.error(`[DailyLogCreate] File does not exist at URI: ${a.uri}`);
            throw new Error(`File not found: ${a.name}`);
          }
          console.log(`[DailyLogCreate] File verified: ${fileInfo.size ?? "?"} bytes`);

          const formData = new FormData();
          formData.append("file", {
            uri: a.uri,
            name: a.name,
            type: a.mimeType,
          } as any);

          // Use apiFetch for FormData uploads (don't try to parse JSON response)
          const uploadRes = await apiFetch(`/daily-logs/${result.id}/attachments`, {
            method: "POST",
            body: formData,
            // @ts-ignore - signal to apiFetch to skip retry on 401 for multipart
            _skipRetry: true,
          });

          if (!uploadRes.ok) {
            const errText = await uploadRes.text().catch(() => "");
            console.error(`[DailyLogCreate] Upload failed: ${uploadRes.status} ${errText}`);
            throw new Error(`Upload failed: ${uploadRes.status}`);
          }
          console.log(`[DailyLogCreate] Attachment uploaded successfully`);
        } catch (uploadErr) {
          console.error(`[DailyLogCreate] Attachment upload error:`, uploadErr);
          // Attachment upload failed — queue for retry
          attachmentsFailed++;
          await enqueueOutbox("dailyLog.uploadAttachment", {
            logId: result.id,
            fileUri: a.uri,
            fileName: a.name,
            mimeType: a.mimeType,
          });
        }
      }

      // Trigger OCR for receipt/expense logs with successful image uploads
      if (isReceipt && attachments.length > 0 && attachmentsFailed < attachments.length) {
        try {
          setStatus("Running OCR on receipt...");
          const ocrResult = await triggerLogOcr(result.id);
          if (ocrResult.success) {
            const vendorStr = ocrResult.vendor || "Unknown";
            const amountStr = ocrResult.amount != null ? `$${ocrResult.amount.toFixed(2)}` : "$?";
            const confStr = ocrResult.confidence ? ` (${Math.round(ocrResult.confidence * 100)}%)` : "";
            setStatus(`Daily log created! OCR: ${vendorStr} - ${amountStr}${confStr}`);
          } else {
            setStatus(`Daily log created! OCR: ${ocrResult.error || "Could not extract data"}`);
          }
        } catch (ocrErr) {
          console.error(`[DailyLogCreate] OCR error:`, ocrErr);
          setStatus("Daily log created! (OCR unavailable)");
        }
      } else if (attachmentsFailed > 0) {
        setStatus(`Daily log created! ${attachmentsFailed} photo(s) queued for sync.`);
        // Trigger immediate sync for queued attachments
        triggerSync("attachment upload queued");
      } else {
        setStatus("Daily log created!");
      }
      // fasTRACK: record usage for this project
      void recordUsage(selectedProjectId, "create_daily_log");
      setTimeout(() => onCreated(), 800);
    } catch (e) {
      // Queue offline
      await enqueueOutbox("dailyLog.create", {
        projectId: selectedProjectId,
        localLogId,
        dto,
      });

      for (const a of attachments) {
        await enqueueOutbox("dailyLog.uploadAttachment", {
          projectId: selectedProjectId,
          localLogId,
          fileUri: a.uri,
          fileName: a.name,
          mimeType: a.mimeType,
        });
      }

      setStatus("Saved offline. Will sync when connected.");
      // Trigger sync attempt (will succeed if we're actually online)
      triggerSync("daily log queued offline");
      setTimeout(() => onCreated(), 1000);
    } finally {
      setSaving(false);
    }
  };

  if (loadingProjects) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>← Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>New Daily Log</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading projects...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLink}>← Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Daily Log</Text>
        <Pressable onPress={handleSave} disabled={saving || !selectedProjectId}>
          <Text style={[styles.saveLink, (saving || !selectedProjectId) && styles.saveLinkDisabled]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={100}
        extraHeight={120}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        keyboardOpeningTime={0}
      >
        {status && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}

        {/* Project selector */}
        <Text style={styles.label}>Project</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.projectScroll}
        >
          {projects.map((p) => (
            <Pressable
              key={p.id}
              style={[
                styles.chip,
                selectedProjectId === p.id && styles.chipSelected,
              ]}
              onPress={() => setSelectedProjectId(p.id)}
            >
              <Text
                style={
                  selectedProjectId === p.id
                    ? styles.chipTextSelected
                    : styles.chipText
                }
                numberOfLines={1}
              >
                {p.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Log type selector */}
        <Text style={styles.label}>Type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.projectScroll}
        >
          {([
            { key: "PUDL" as const, label: "Daily Log (PUDL)" },
            { key: "RECEIPT_EXPENSE" as const, label: "Receipt / Expense" },
            { key: "JSA" as const, label: "Job Safety Assessment" },
            { key: "INCIDENT" as const, label: "Incident Report" },
            { key: "QUALITY" as const, label: "Quality Inspection" },
          ]).map((t) => (
            <Pressable
              key={t.key}
              style={[
                styles.chip,
                logType === t.key && styles.chipSelected,
              ]}
              onPress={() => setLogType(t.key)}
            >
              <Text
                style={
                  logType === t.key
                    ? styles.chipTextSelected
                    : styles.chipText
                }
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={logDate}
          onChangeText={setLogDate}
          placeholder="YYYY-MM-DD"
        />

        {/* Receipt/Expense fields — shown when type is RECEIPT_EXPENSE */}
        {logType === "RECEIPT_EXPENSE" && (
          <View style={styles.receiptSection}>
            <Text style={styles.receiptSectionTitle}>Receipt Details</Text>
            <Text style={styles.receiptHint}>
              Attach a receipt photo below — OCR will auto-extract vendor and amount.
            </Text>
            <Text style={styles.label}>Vendor</Text>
            <TextInput
              style={styles.input}
              value={expenseVendor}
              onChangeText={setExpenseVendor}
              placeholder="Home Depot, Lowe's, etc."
            />
            <View style={styles.receiptRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.input}
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.label}>Receipt Date</Text>
                <TextInput
                  style={styles.input}
                  value={expenseDate}
                  onChangeText={setExpenseDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>
          </View>
        )}

        {/* Daily Log Title */}
        <Text style={styles.label}>Daily Log Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Brief title for this log"
        />

        {/* Weather */}
        <Text style={styles.label}>Weather</Text>
        <TextInput
          style={styles.input}
          value={weatherSummary}
          onChangeText={setWeatherSummary}
          placeholder="Weather conditions"
        />

        {/* Crew */}
        <Text style={styles.label}>Crew on Site</Text>
        <TextInput
          style={styles.input}
          value={crewOnSite}
          onChangeText={setCrewOnSite}
          placeholder="Crew members present"
        />

        {/* Work Performed */}
        <Text style={styles.label}>Work Performed</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={workPerformed}
          onChangeText={setWorkPerformed}
          placeholder="Describe work completed today"
          multiline
        />

        {/* Issues */}
        <Text style={styles.label}>Issues</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={issues}
          onChangeText={setIssues}
          placeholder="Any issues or delays"
          multiline
        />

        {/* Safety */}
        <Text style={styles.label}>Safety Incidents</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={safetyIncidents}
          onChangeText={setSafetyIncidents}
          placeholder="Safety observations or incidents"
          multiline
        />

        {/* Manpower */}
        <Text style={styles.label}>Manpower Onsite</Text>
        <TextInput
          style={styles.input}
          value={manpowerOnsite}
          onChangeText={setManpowerOnsite}
          placeholder="Number of workers"
          keyboardType="number-pad"
        />

        {/* Person Onsite */}
        <Text style={styles.label}>Person Onsite</Text>
        <TextInput
          style={styles.input}
          value={personOnsite}
          onChangeText={setPersonOnsite}
          placeholder="Key personnel present"
        />

        {/* Confidential Notes */}
        <Text style={styles.label}>Confidential Notes</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={confidentialNotes}
          onChangeText={setConfidentialNotes}
          placeholder="Internal notes (not shared externally)"
          multiline
        />

        {/* Attachments */}
        <Text style={styles.label}>Photos</Text>
        <View style={styles.attachmentButtons}>
          <Pressable style={styles.attachButton} onPress={takePhoto}>
            <Text style={styles.attachButtonText}>
              📷 Camera{attachments.length > 0 ? ` (${attachments.length})` : ""}
            </Text>
          </Pressable>
          <Pressable style={styles.attachButton} onPress={pickPhotoFromLibrary}>
            <Text style={styles.attachButtonText}>🖼️ Library</Text>
          </Pressable>
        </View>

        {attachments.length > 0 && (
          <View style={styles.thumbnailContainer}>
            {attachments.map((a) => (
              <View key={a.uri} style={styles.thumbnailWrapper}>
                <Image source={{ uri: a.uri }} style={styles.thumbnail} />
                <Pressable
                  style={styles.thumbnailRemove}
                  onPress={() => removeAttachment(a.uri)}
                >
                  <Text style={styles.thumbnailRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
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
    fontSize: 15,
  },
  saveLink: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 15,
  },
  saveLinkDisabled: {
    color: colors.textMuted,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statusBox: {
    backgroundColor: colors.infoLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusText: {
    color: colors.textPrimary,
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.background,
  },
  multilineInput: {
    height: 80,
    textAlignVertical: "top",
  },
  projectScroll: {
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.chipBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: colors.chipBackground,
  },
  chipSelected: {
    backgroundColor: colors.chipBackgroundSelected,
    borderColor: colors.chipBackgroundSelected,
  },
  chipText: {
    fontSize: 13,
    color: colors.chipText,
  },
  chipTextSelected: {
    fontSize: 13,
    color: colors.chipTextSelected,
    fontWeight: "600",
  },
  attachmentButtons: {
    flexDirection: "row",
    gap: 12,
  },
  attachButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  attachButtonText: {
    color: colors.primary,
    fontWeight: "600",
  },
  attachmentList: {
    marginTop: 12,
  },
  attachmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  attachmentName: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
  },
  removeText: {
    color: colors.error,
    fontWeight: "600",
    fontSize: 13,
  },
  thumbnailContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  thumbnailWrapper: {
    position: "relative",
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.borderMuted,
  },
  thumbnailRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailRemoveText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  receiptSection: {
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  receiptSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 4,
  },
  receiptHint: {
    fontSize: 12,
    color: "#92400e",
    marginBottom: 8,
  },
  receiptRow: {
    flexDirection: "row",
  },
});
