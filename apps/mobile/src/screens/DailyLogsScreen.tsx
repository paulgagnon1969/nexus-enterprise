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
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import * as ImagePicker from "expo-image-picker";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import { addLocalDailyLog } from "../offline/sync";
import { triggerSync } from "../offline/autoSync";
import { copyToAppStorage, type StoredFile } from "../storage/files";
import { colors } from "../theme/colors";
import type { DailyLogCreateRequest, ProjectListItem } from "../types/api";
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
}: {
  project: ProjectListItem;
  companyName?: string;
  onBack: () => void;
  onOpenPetl?: () => void;
  onNavigateHome?: () => void;
  petlChanges?: PetlSessionChanges;
}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [logDate, setLogDate] = useState(today);
  const [title, setTitle] = useState("");

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
  const processedPetlChangesRef = useRef<string | null>(null);

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

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (res.canceled) return;

    const a = res.assets?.[0];
    if (!a?.uri) return;

    const stored = await copyToAppStorage({
      uri: a.uri,
      name: (a as any).fileName ?? null,
      mimeType: (a as any).mimeType ?? "image/jpeg",
    });

    setAttachments((prev) => [...prev, stored]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setStatus("Camera permission denied");
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (res.canceled) return;

    const a = res.assets?.[0];
    if (!a?.uri) return;

    const stored = await copyToAppStorage({
      uri: a.uri,
      name: (a as any).fileName ?? null,
      mimeType: (a as any).mimeType ?? "image/jpeg",
    });

    setAttachments((prev) => [...prev, stored]);
  };

  const removeAttachment = (uri: string) => {
    setAttachments((prev) => prev.filter((x) => x.uri !== uri));
  };

  const createOffline = async () => {
    // Validate required title
    if (!title.trim()) {
      Alert.alert("Title Required", "Please enter a summary title for this log.");
      return;
    }

    setStatus(null);

    const localLogId = makeLocalId();

    const dto: DailyLogCreateRequest = {
      logDate,
      title: title.trim(),
      weatherSummary: weatherSummary || null,
      crewOnSite: crewOnSite || null,
      workPerformed: workPerformed || null,
      issues: issues || null,
      safetyIncidents: safetyIncidents || null,
      manpowerOnsite: manpowerOnsite || null,
      personOnsite: personOnsite || null,
      confidentialNotes: confidentialNotes || null,
      // Default sharing policy for now (can be expanded later)
      shareInternal: true,
      shareSubs: false,
      shareClient: false,
      sharePrivate: false,
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
      setTitle("");
      setWeatherSummary("");
      setCrewOnSite("");
      setWorkPerformed("");
      setIssues("");
      setSafetyIncidents("");
      setManpowerOnsite("");
      setPersonOnsite("");
      setConfidentialNotes("");
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

        {/* 1. DATE - Always at top */}
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Date</Text>
          <TextInput
            style={styles.dateInput}
            value={logDate}
            onChangeText={setLogDate}
            placeholder="YYYY-MM-DD"
          />
        </View>

        {/* 2. PETL REVIEW - Prominent button */}
        {onOpenPetl && (
          <Pressable style={styles.petlButton} onPress={onOpenPetl}>
            <View>
              <Text style={styles.petlButtonText}>Review PETL Scope</Text>
              <Text style={styles.petlButtonSub}>Update % complete on line items</Text>
            </View>
            <Text style={styles.petlButtonArrow}>→</Text>
          </Pressable>
        )}

        {/* 3. NOTES - Main work area */}
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

        {/* 4. ATTACHMENTS - Always visible with notes */}
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

        {/* 5. SUMMARY TITLE - Mandatory */}
        <View style={styles.section}>
          <View style={styles.titleLabelRow}>
            <Text style={styles.sectionLabel}>Summary Title <Text style={styles.required}>*</Text></Text>
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
            placeholder="Brief description of this log entry"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* 6. COLLAPSIBLE DETAILS DRAWER */}
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

        {/* Previous logs - collapsed at bottom */}
        {logs.length > 0 && (
          <View style={styles.logsSection}>
            <Text style={styles.logsSectionTitle}>Previous Logs</Text>
            {logs.slice(0, 5).map((l) => (
              <View key={l.id} style={styles.logCard}>
                <Text style={styles.logCardTitle}>
                  {l.title || "(no title)"} {l.__local ? "(pending)" : ""}
                </Text>
                <Text style={styles.logCardDate}>{String(l.logDate)}</Text>
              </View>
            ))}
            {logs.length > 5 && (
              <Text style={styles.logsMore}>+ {logs.length - 5} more logs</Text>
            )}
          </View>
        )}

        {/* Bottom padding for scroll */}
        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
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
  logsSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  logCard: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
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
  logsMore: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 8,
  },
});
