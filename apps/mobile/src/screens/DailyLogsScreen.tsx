import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import * as ImagePicker from "expo-image-picker";
import { apiJson } from "../api/client";
import { getApiBaseUrl } from "../api/config";
import { scanReceiptImage, fetchDailyLogDetail, updateDailyLog } from "../api/dailyLog";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import { addLocalDailyLog } from "../offline/sync";
import { triggerSync } from "../offline/autoSync";
import { copyToAppStorage, type StoredFile } from "../storage/files";
import { compressForNetwork, getNetworkTier } from "../utils/mediaCompressor";
import { colors } from "../theme/colors";
import type { DailyLogCreateRequest, DailyLogType, ProjectListItem } from "../types/api";
import type { PetlSessionChanges } from "./FieldPetlScreen";

function makeLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Simple text summarizer - extracts first sentence or key phrase for title
function summarizeToTitle(text: string, maxLength = 60): string {
  if (!text || !text.trim()) return "";
  
  // Clean up the text
  let cleaned = text.trim();
  
  // Try to get first sentence
  const sentenceMatch = cleaned.match(/^[^.!?\n]+[.!?]?/);
  if (sentenceMatch) {
    cleaned = sentenceMatch[0].trim();
  }
  
  // Remove common filler words at start
  cleaned = cleaned.replace(/^(today |we |i |the team |crew |worked on |completed |finished |started )/i, "");
  
  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Truncate if too long
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength - 3).trim() + "...";
  }
  
  // Remove trailing period if present (will be added back if needed)
  cleaned = cleaned.replace(/\.$/, "");
  
  return cleaned;
}

export function DailyLogsScreen({
  project,
  companyName,
  onBack,
  onOpenPetl,
  onNavigateHome,
  petlChanges,
  createLogType,
}: {
  project: ProjectListItem;
  companyName?: string;
  onBack: () => void;
  onOpenPetl?: () => void;
  onNavigateHome?: () => void;
  petlChanges?: PetlSessionChanges;
  createLogType?: string;
}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [logType, setLogType] = useState<DailyLogType>((createLogType as DailyLogType) || "PUDL");
  const [logDate, setLogDate] = useState(today);
  const [title, setTitle] = useState("");

  // Receipt/expense fields
  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);

  // Main note field
  const [workPerformed, setWorkPerformed] = useState("");

  // Collapsible detail fields
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [weatherSummary, setWeatherSummary] = useState("");
  const [crewOnSite, setCrewOnSite] = useState("");
  const [issues, setIssues] = useState("");
  const [safetyIncidents, setSafetyIncidents] = useState("");
  const [manpowerOnsite, setManpowerOnsite] = useState("");
  const [personOnsite, setPersonOnsite] = useState("");
  const [confidentialNotes, setConfidentialNotes] = useState("");

  const [attachments, setAttachments] = useState<StoredFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const processedPetlChangesRef = useRef<string | null>(null);

  // Log detail / edit state
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [detailLog, setDetailLog] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editingDetail, setEditingDetail] = useState(false);
  const [editWork, setEditWork] = useState("");
  const [editIssues, setEditIssues] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);

  const key = `dailyLogs:${project.id}`;

  const loadCached = async () => {
    const cached = await getCache<any[]>(key);
    if (cached) setLogs(cached);
  };

  const refreshOnline = async () => {
    setStatus("Loading…");
    try {
      const latest = await apiJson<any[]>(
        `/projects/${encodeURIComponent(project.id)}/daily-logs`,
      );
      setLogs(latest);
      await setCache(key, latest);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadCached().then(refreshOnline);
  }, [project.id]);

  // Open log detail modal
  const openLogDetail = async (logId: string) => {
    if (logId.startsWith("local_")) return; // Can't fetch detail for pending local logs
    setDetailLoading(true);
    setShowDetail(true);
    try {
      const detail = await fetchDailyLogDetail(logId);
      setDetailLog(detail);
      setEditWork(detail.workPerformed || "");
      setEditIssues(detail.issues || "");
    } catch {
      setShowDetail(false);
      Alert.alert("Error", "Failed to load log details");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setShowDetail(false);
    setDetailLog(null);
    setEditingDetail(false);
  };

  const saveDetailEdits = async () => {
    if (!detailLog) return;
    setSavingDetail(true);
    try {
      const updated = await updateDailyLog(detailLog.id, {
        workPerformed: editWork,
        issues: editIssues,
      });
      setDetailLog(updated);
      setEditingDetail(false);
      void refreshOnline(); // Refresh the list
    } catch {
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSavingDetail(false);
    }
  };

  const formatLogDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Sync createLogType prop → logType state when navigated with a pre-selected type
  useEffect(() => {
    if (createLogType) {
      setLogType(createLogType as DailyLogType);
    }
  }, [createLogType]);

  // Apply PETL changes when returning from Field PETL
  useEffect(() => {
    if (petlChanges && petlChanges.changes.length > 0) {
      // Create a unique key for these changes to prevent reprocessing
      const changesKey = JSON.stringify(petlChanges.changes);
      if (processedPetlChangesRef.current === changesKey) {
        return; // Already processed these exact changes
      }
      processedPetlChangesRef.current = changesKey;

      // Append to existing notes (don't overwrite)
      setWorkPerformed((prev) => {
        if (prev.trim()) {
          return prev + "\n\n" + petlChanges.suggestedNotes;
        }
        return petlChanges.suggestedNotes;
      });
      
      // Only set title if empty
      setTitle((prev) => {
        if (!prev.trim()) {
          return petlChanges.suggestedTitle;
        }
        return prev;
      });
    }
  }, [petlChanges]);

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

    // Process all selected media with network-aware compression
    const newPhotos: StoredFile[] = [];
    for (const asset of res.assets) {
      if (!asset.uri) continue;
      try {
        const isVideo = asset.type === "video";
        if (isVideo) {
          const stored = await copyToAppStorage({
            uri: asset.uri,
            name: (asset as any).fileName ?? null,
            mimeType: (asset as any).mimeType ?? "video/mp4",
          });
          newPhotos.push(stored);
        } else {
          const compressed = await compressForNetwork(asset.uri);
          const stored = await copyToAppStorage({
            uri: compressed.uri,
            name: (asset as any).fileName ?? null,
            mimeType: "image/jpeg",
          });
          newPhotos.push(stored);
        }
      } catch (err) {
        console.error(`[DailyLogs] Failed to save media:`, err);
        setStatus(`Failed to save media: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setAttachments((prev) => [...prev, ...newPhotos]);
    if (newPhotos.length > 1) {
      setStatus(`Added ${newPhotos.length} files`);
    }

    // Auto-scan first photo if receipt type
    if (logType === "RECEIPT_EXPENSE" && newPhotos.length > 0) {
      void runReceiptScan(newPhotos[0]);
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
        console.error(`[DailyLogs] Failed to save media:`, err);
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

  const createOffline = async () => {
    // Auto-fill title from notes if empty
    let finalTitle = title.trim();
    if (!finalTitle && workPerformed.trim()) {
      finalTitle = summarizeToTitle(workPerformed);
      setTitle(finalTitle);
    }
    
    // Validate we have a title (either entered or derived)
    if (!finalTitle) {
      Alert.alert("Title Required", "Please enter a subject/title or add some notes.");
      return;
    }

    setStatus(null);

    const localLogId = makeLocalId();

    const isReceipt = logType === "RECEIPT_EXPENSE";

    const dto: DailyLogCreateRequest = {
      logDate,
      type: logType,
      title: title.trim(),
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

    const localLog = {
      id: localLogId,
      projectId: project.id,
      logDate,
      title: dto.title,
      workPerformed: dto.workPerformed,
      issues: dto.issues,
      status: "PENDING_SYNC",
      createdAt: new Date().toISOString(),
      attachments: attachments.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType })),
      __local: true,
    };

    await addLocalDailyLog(project.id, localLog);
    setLogs((prev) => [localLog, ...prev]);

    await enqueueOutbox("dailyLog.create", { projectId: project.id, localLogId, dto });

    for (const a of attachments) {
      // Queue attachments behind the log create.
      // The sync runner will map localLogId -> remoteLogId.
      // eslint-disable-next-line no-await-in-loop
      await enqueueOutbox("dailyLog.uploadAttachment", {
        projectId: project.id,
        localLogId,
        fileUri: a.uri,
        fileName: a.name,
        mimeType: a.mimeType,
      });
    }

    // Trigger sync immediately (will work if online)
    triggerSync("daily log created");

    // Navigate to Home with sync feedback instead of staying on blank form
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      // Fallback: clear form if no navigation callback
      setLogType("PUDL");
      setTitle("");
      setWeatherSummary("");
      setCrewOnSite("");
      setWorkPerformed("");
      setIssues("");
      setSafetyIncidents("");
      setManpowerOnsite("");
      setPersonOnsite("");
      setConfidentialNotes("");
      setExpenseVendor("");
      setExpenseAmount("");
      setExpenseDate(today);
      setAttachments([]);
      setStatus("Saved. Syncing...");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New Daily Log</Text>
        </View>
        <Pressable onPress={refreshOnline}>
          <Text style={styles.link}>⟳</Text>
        </Pressable>
      </View>

      {/* Breadcrumb: Tenant Org / Project Name */}
      <View style={styles.breadcrumb}>
        {companyName && (
          <>
            <Text style={styles.breadcrumbOrg}>{companyName}</Text>
            <Text style={styles.breadcrumbSep}> / </Text>
          </>
        )}
        <Text style={styles.breadcrumbProject}>{project.name}</Text>
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        extraScrollHeight={100}
        extraHeight={120}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        keyboardOpeningTime={0}
      >
        {status ? <Text style={styles.status}>{status}</Text> : null}

        {/* 1. LOG TYPE SELECTOR */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Log Type</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.typeScroll}
          >
            {([
              { key: "PUDL" as const, label: "📝 Daily Log" },
              { key: "RECEIPT_EXPENSE" as const, label: "🧾 Receipt" },
              { key: "JSA" as const, label: "⚠️ Job Safety" },
              { key: "INCIDENT" as const, label: "🚨 Incident" },
              { key: "QUALITY" as const, label: "🔍 Quality" },
            ]).map((t) => (
              <Pressable
                key={t.key}
                style={[
                  styles.typeChip,
                  logType === t.key && styles.typeChipSelected,
                ]}
                onPress={() => setLogType(t.key)}
              >
                <Text
                  style={logType === t.key ? styles.typeChipTextSelected : styles.typeChipText}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* 2. DATE */}
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Date</Text>
          <TextInput
            style={styles.dateInput}
            value={logDate}
            onChangeText={setLogDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* Receipt/Expense fields — shown when type is RECEIPT_EXPENSE */}
        {logType === "RECEIPT_EXPENSE" && (
          <View style={styles.receiptSection}>
            <Text style={styles.receiptTitle}>🧾 Receipt Details</Text>
            <Text style={styles.receiptHint}>Attach a receipt photo — OCR will auto-extract vendor &amp; amount.</Text>
            <TextInput
              style={styles.receiptInput}
              value={expenseVendor}
              onChangeText={setExpenseVendor}
              placeholder="Vendor (Home Depot, Lowe's, etc.)"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.receiptRow}>
              <TextInput
                style={[styles.receiptInput, { flex: 1 }]}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                placeholder="Amount ($)"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.receiptInput, { flex: 1, marginLeft: 8 }]}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="Receipt date"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        )}

        {/* 3. PETL REVIEW - Only for standard daily logs */}
        {onOpenPetl && logType === "PUDL" && (
          <Pressable style={styles.petlButton} onPress={onOpenPetl}>
            <View>
              <Text style={styles.petlButtonText}>Review PETL Scope</Text>
              <Text style={styles.petlButtonSub}>Update % complete on line items</Text>
            </View>
            <Text style={styles.petlButtonArrow}>→</Text>
          </Pressable>
        )}

        {/* 4. NOTES - Main work area */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={workPerformed}
            onChangeText={setWorkPerformed}
            placeholder="What was done today? Any observations or updates..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* 5. ATTACHMENTS - Always visible with notes */}
        <View style={styles.attachmentsSection}>
          <View style={styles.attachmentsHeader}>
            <Text style={styles.sectionLabel}>Attachments</Text>
            <View style={styles.attachmentButtons}>
              <Pressable style={styles.attachButton} onPress={takePhoto}>
                <Text style={styles.attachButtonText}>📷 Camera</Text>
              </Pressable>
              <Pressable style={styles.attachButton} onPress={pickPhotoFromLibrary}>
                <Text style={styles.attachButtonText}>🖼 Library</Text>
              </Pressable>
            </View>
          </View>
          {attachments.length > 0 && (
            <View style={styles.attachmentsList}>
              {attachments.map((a) => (
                <View key={a.uri} style={styles.attachmentRow}>
                  <Text style={styles.attachmentName} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Pressable onPress={() => removeAttachment(a.uri)}>
                    <Text style={styles.attachmentRemove}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 6. SUBJECT/TITLE - Auto-fills from notes if left empty */}
        <View style={styles.section}>
          <View style={styles.titleLabelRow}>
            <Text style={styles.sectionLabel}>Subject / Title</Text>
            {workPerformed.trim().length > 10 && !title.trim() && (
              <Pressable
                style={styles.autoTitleButton}
                onPress={() => setTitle(summarizeToTitle(workPerformed))}
              >
                <Text style={styles.autoTitleButtonText}>✨ Auto-generate</Text>
              </Pressable>
            )}
          </View>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Auto-fills from notes if left empty"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* 7. COLLAPSIBLE DETAILS DRAWER */}
        <Pressable
          style={styles.detailsToggle}
          onPress={() => setDetailsExpanded(!detailsExpanded)}
        >
          <Text style={styles.detailsToggleText}>Additional Details</Text>
          <Text style={styles.detailsToggleIcon}>
            {detailsExpanded ? "▲" : "▼"}
          </Text>
        </Pressable>

        {detailsExpanded && (
          <View style={styles.detailsDrawer}>
            <TextInput
              style={styles.detailInput}
              value={weatherSummary}
              onChangeText={setWeatherSummary}
              placeholder="Weather summary"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.detailInput}
              value={crewOnSite}
              onChangeText={setCrewOnSite}
              placeholder="Crew on site"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.detailInput}
              value={manpowerOnsite}
              onChangeText={setManpowerOnsite}
              placeholder="Manpower count"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.detailInput}
              value={personOnsite}
              onChangeText={setPersonOnsite}
              placeholder="Person onsite (point of contact)"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[styles.detailInput, styles.detailInputMultiline]}
              value={issues}
              onChangeText={setIssues}
              placeholder="Issues encountered"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TextInput
              style={[styles.detailInput, styles.detailInputMultiline]}
              value={safetyIncidents}
              onChangeText={setSafetyIncidents}
              placeholder="Safety incidents (if any)"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TextInput
              style={[styles.detailInput, styles.detailInputMultiline]}
              value={confidentialNotes}
              onChangeText={setConfidentialNotes}
              placeholder="Confidential notes (internal only)"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>
        )}

        {/* SAVE BUTTON */}
        <Pressable style={styles.saveButton} onPress={createOffline}>
          <Text style={styles.saveButtonText}>Save Daily Log</Text>
        </Pressable>

        {/* Previous logs — full list, tappable */}
        {logs.length > 0 && (
          <View style={styles.logsSection}>
            <View style={styles.logsSectionHeader}>
              <Text style={styles.logsSectionTitle}>Previous Logs ({logs.length})</Text>
              {logs.length > 5 && (
                <Pressable onPress={() => setShowAllLogs((v) => !v)}>
                  <Text style={styles.logsToggle}>
                    {showAllLogs ? "Show Less" : `Show All ${logs.length}`}
                  </Text>
                </Pressable>
              )}
            </View>
            {(showAllLogs ? logs : logs.slice(0, 5)).map((l) => (
              <Pressable
                key={l.id}
                style={styles.logCard}
                onPress={() => openLogDetail(l.id)}
                disabled={!!l.__local}
              >
                <View style={styles.logCardContent}>
                  <Text style={styles.logCardTitle} numberOfLines={2}>
                    {l.title || l.workPerformed || "(no title)"}
                    {l.__local ? " (pending)" : ""}
                  </Text>
                  <Text style={styles.logCardDate}>
                    {formatLogDate(l.logDate)}
                    {l.createdByUser ? ` • ${l.createdByUser.firstName || l.createdByUser.email}` : ""}
                  </Text>
                </View>
                {!l.__local && <Text style={styles.logCardChevron}>›</Text>}
              </Pressable>
            ))}
          </View>
        )}

        {/* Bottom padding for scroll */}
        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>

      {/* Log Detail Modal */}
      <Modal visible={showDetail} animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <Pressable onPress={closeDetail} style={styles.detailBackBtn}>
              <Text style={styles.detailBackText}>← Back</Text>
            </Pressable>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {detailLog?.projectName || project.name}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          {detailLoading ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : detailLog ? (
            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.detailMeta}>
                <Text style={styles.detailDate}>{formatLogDate(detailLog.logDate)}</Text>
                <Text style={styles.detailAuthor}>
                  by {detailLog.createdByUser?.firstName || detailLog.createdByUser?.email || "Unknown"}
                </Text>
                {detailLog.type && detailLog.type !== "PUDL" && (
                  <Text style={styles.detailType}>{detailLog.type}</Text>
                )}
              </View>

              {editingDetail ? (
                <>
                  <Text style={styles.detailFieldLabel}>Work Performed</Text>
                  <TextInput
                    style={styles.detailTextInput}
                    value={editWork}
                    onChangeText={setEditWork}
                    multiline
                    placeholder="Describe work performed..."
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.detailFieldLabel}>Issues</Text>
                  <TextInput
                    style={styles.detailTextInput}
                    value={editIssues}
                    onChangeText={setEditIssues}
                    multiline
                    placeholder="Any issues encountered..."
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={styles.detailEditActions}>
                    <Pressable
                      style={styles.detailCancelBtn}
                      onPress={() => {
                        setEditingDetail(false);
                        setEditWork(detailLog.workPerformed || "");
                        setEditIssues(detailLog.issues || "");
                      }}
                    >
                      <Text style={styles.detailCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.detailSaveBtn, savingDetail && { opacity: 0.6 }]}
                      onPress={saveDetailEdits}
                      disabled={savingDetail}
                    >
                      <Text style={styles.detailSaveText}>
                        {savingDetail ? "Saving..." : "Save"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  {detailLog.workPerformed ? (
                    <>
                      <Text style={styles.detailFieldLabel}>Work Performed</Text>
                      <Text style={styles.detailFieldValue}>{detailLog.workPerformed}</Text>
                    </>
                  ) : null}
                  {detailLog.issues ? (
                    <>
                      <Text style={styles.detailFieldLabel}>Issues</Text>
                      <Text style={styles.detailFieldValue}>{detailLog.issues}</Text>
                    </>
                  ) : null}
                  {detailLog.weatherSummary ? (
                    <>
                      <Text style={styles.detailFieldLabel}>Weather</Text>
                      <Text style={styles.detailFieldValue}>{detailLog.weatherSummary}</Text>
                    </>
                  ) : null}
                  {detailLog.crewOnSite ? (
                    <>
                      <Text style={styles.detailFieldLabel}>Crew On Site</Text>
                      <Text style={styles.detailFieldValue}>{detailLog.crewOnSite}</Text>
                    </>
                  ) : null}
                  {detailLog.safetyIncidents ? (
                    <>
                      <Text style={styles.detailFieldLabel}>Safety Incidents</Text>
                      <Text style={styles.detailFieldValue}>{detailLog.safetyIncidents}</Text>
                    </>
                  ) : null}

                  {/* Attachments */}
                  {detailLog.attachments?.length > 0 && (
                    <>
                      <Text style={styles.detailFieldLabel}>
                        Attachments ({detailLog.attachments.length})
                      </Text>
                      <View style={styles.detailAttGrid}>
                        {detailLog.attachments.map((att: any) => {
                          const isImage = att.mimeType?.startsWith("image/") ||
                            att.fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
                          const fullUrl = att.fileUrl?.startsWith("http")
                            ? att.fileUrl
                            : `${getApiBaseUrl()}${att.fileUrl}`;
                          if (isImage) {
                            return (
                              <Pressable
                                key={att.id}
                                style={styles.detailAttThumb}
                                onPress={() => fullUrl && Linking.openURL(fullUrl)}
                              >
                                <Image
                                  source={{ uri: fullUrl }}
                                  style={styles.detailAttImg}
                                  resizeMode="cover"
                                />
                              </Pressable>
                            );
                          }
                          return (
                            <Pressable
                              key={att.id}
                              style={styles.detailAttFile}
                              onPress={() => fullUrl && Linking.openURL(fullUrl)}
                            >
                              <Text style={{ fontSize: 20, marginRight: 6 }}>📎</Text>
                              <Text style={styles.detailAttFileName} numberOfLines={1}>
                                {att.fileName || "File"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <Pressable style={styles.detailEditBtn} onPress={() => setEditingDetail(true)}>
                    <Text style={styles.detailEditBtnText}>Edit Log</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    paddingTop: 54,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: "700",
    color: colors.textPrimary,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundTertiary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  breadcrumbOrg: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
  },
  breadcrumbSep: {
    fontSize: 13,
    color: colors.textMuted,
  },
  breadcrumbProject: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  link: { 
    color: colors.primary, 
    fontWeight: "600",
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  projectName: { 
    fontWeight: "700", 
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  status: { 
    color: colors.textSecondary, 
    marginBottom: 8,
    fontSize: 13,
  },

  // Type selector
  typeScroll: {
    marginTop: 6,
    marginBottom: 4,
  },
  typeChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  typeChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  typeChipTextSelected: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textOnPrimary,
  },

  // Receipt section
  receiptSection: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f5deb3",
    borderLeftWidth: 4,
    borderLeftColor: "#FF9500",
  },
  receiptTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  receiptHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 10,
  },
  receiptInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  receiptRow: {
    flexDirection: "row" as const,
  },

  // Date row
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginRight: 12,
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    padding: 0,
  },

  // PETL button
  petlButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  petlButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  petlButtonSub: {
    color: colors.textOnPrimary,
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  petlButtonArrow: {
    color: colors.textOnPrimary,
    fontSize: 20,
    fontWeight: "700",
  },

  // Section styles
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
  },

  // Notes input
  notesInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },

  // Title input
  titleLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  autoTitleButton: {
    backgroundColor: colors.primaryLight ?? "#e0e7ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  autoTitleButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  titleInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },

  // Attachments section
  attachmentsSection: {
    marginBottom: 12,
  },
  attachmentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  attachmentButtons: {
    flexDirection: "row",
    gap: 8,
  },
  attachButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  attachButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  attachmentsList: {
    backgroundColor: colors.background,
    borderRadius: 10,
    overflow: "hidden",
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  attachmentName: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  attachmentRemove: {
    color: colors.error,
    fontSize: 16,
    fontWeight: "700",
    paddingLeft: 12,
  },

  // Collapsible details
  detailsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  detailsToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  detailsToggleIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  detailsDrawer: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  detailInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  detailInputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },

  // Save button
  saveButton: {
    backgroundColor: colors.success,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 24,
  },
  saveButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "700",
  },

  // Previous logs section
  logsSection: {
    marginTop: 8,
  },
  logsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logsSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  logsToggle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  logCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  logCardContent: {
    flex: 1,
  },
  logCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  logCardDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  logCardChevron: {
    fontSize: 20,
    color: colors.textMuted,
    marginLeft: 8,
  },

  // Detail modal
  detailContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  detailBackBtn: {
    width: 50,
  },
  detailBackText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 16,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  detailLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  detailBody: {
    flex: 1,
    padding: 16,
  },
  detailMeta: {
    marginBottom: 16,
  },
  detailDate: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detailAuthor: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  detailType: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 4,
  },
  detailFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  detailFieldValue: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  detailTextInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  detailEditActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  detailCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
  },
  detailCancelText: {
    fontWeight: "600",
    color: colors.textSecondary,
  },
  detailSaveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.success,
  },
  detailSaveText: {
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
  detailEditBtn: {
    marginTop: 24,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  detailEditBtnText: {
    fontWeight: "700",
    color: colors.textOnPrimary,
    fontSize: 16,
  },
  detailAttGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  detailAttThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: "hidden",
  },
  detailAttImg: {
    width: 80,
    height: 80,
  },
  detailAttFile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 10,
  },
  detailAttFileName: {
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
});
