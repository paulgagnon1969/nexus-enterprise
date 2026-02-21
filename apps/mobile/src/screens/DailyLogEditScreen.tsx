import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { updateDailyLog, uploadAttachment, deleteAttachment } from "../api/dailyLog";
import { enqueueOutbox } from "../offline/outbox";
import { triggerSync } from "../offline/autoSync";
import { copyToAppStorage, type StoredFile } from "../storage/files";
import { colors } from "../theme/colors";
import type { DailyLogDetail, DailyLogUpdateRequest, DailyLogAttachment } from "../types/api";

interface Props {
  log: DailyLogDetail;
  onBack: () => void;
  onSaved: (updated: DailyLogDetail) => void;
}

export function DailyLogEditScreen({ log, onBack, onSaved }: Props) {
  const [title, setTitle] = useState(log.title || "");
  const [weatherSummary, setWeatherSummary] = useState(log.weatherSummary || "");
  const [crewOnSite, setCrewOnSite] = useState(log.crewOnSite || "");
  const [workPerformed, setWorkPerformed] = useState(log.workPerformed || "");
  const [issues, setIssues] = useState(log.issues || "");
  const [safetyIncidents, setSafetyIncidents] = useState(log.safetyIncidents || "");
  const [manpowerOnsite, setManpowerOnsite] = useState(log.manpowerOnsite || "");
  const [personOnsite, setPersonOnsite] = useState(log.personOnsite || "");
  const [confidentialNotes, setConfidentialNotes] = useState(log.confidentialNotes || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Attachment management
  const [existingAttachments, setExistingAttachments] = useState<DailyLogAttachment[]>(log.attachments || []);
  const [newAttachments, setNewAttachments] = useState<StoredFile[]>([]);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const updates: DailyLogUpdateRequest = {};

    // Only include fields that changed
    if (title !== (log.title || "")) updates.title = title || null;
    if (weatherSummary !== (log.weatherSummary || "")) updates.weatherSummary = weatherSummary || null;
    if (crewOnSite !== (log.crewOnSite || "")) updates.crewOnSite = crewOnSite || null;
    if (workPerformed !== (log.workPerformed || "")) updates.workPerformed = workPerformed || null;
    if (issues !== (log.issues || "")) updates.issues = issues || null;
    if (safetyIncidents !== (log.safetyIncidents || "")) updates.safetyIncidents = safetyIncidents || null;
    if (manpowerOnsite !== (log.manpowerOnsite || "")) updates.manpowerOnsite = manpowerOnsite || null;
    if (personOnsite !== (log.personOnsite || "")) updates.personOnsite = personOnsite || null;
    if (confidentialNotes !== (log.confidentialNotes || "")) updates.confidentialNotes = confidentialNotes || null;

    if (Object.keys(updates).length === 0) {
      // No changes
      onBack();
      return;
    }

    try {
      // Delete removed attachments
      for (const attId of deletedAttachmentIds) {
        try {
          await deleteAttachment(log.id, attId);
        } catch {
          // Continue even if delete fails
        }
      }

      // Upload new attachments
      for (const att of newAttachments) {
        try {
          await uploadAttachment(log.id, att.uri, att.name, att.mimeType);
        } catch {
          // Queue for offline sync if upload fails
          await enqueueOutbox("dailyLog.uploadAttachment", {
            logId: log.id,
            fileUri: att.uri,
            fileName: att.name,
            mimeType: att.mimeType,
          });
        }
      }

      const updated = await updateDailyLog(log.id, updates);
      onSaved(updated);
    } catch (e) {
      // Queue for offline sync if network error
      if (e instanceof Error && e.message.includes("Network")) {
        try {
          await enqueueOutbox("dailyLog.update", {
            logId: log.id,
            updates,
          });
          // Trigger sync immediately
          triggerSync("daily log updated offline");
          Alert.alert(
            "Saved Offline",
            "Your changes will sync when connectivity is restored.",
            [{ text: "OK", onPress: onBack }]
          );
        } catch {
          setError("Failed to save changes offline");
        }
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Check if attachment is an image
  const isImageAttachment = (att: { fileName?: string | null; mimeType?: string | null }) => {
    const fileName = att.fileName?.toLowerCase() || "";
    const mimeType = att.mimeType?.toLowerCase() || "";
    return (
      mimeType.startsWith("image/") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".gif") ||
      fileName.endsWith(".webp")
    );
  };

  const openAttachment = (url: string) => {
    void Linking.openURL(url);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Denied", "Camera permission is required to take photos.");
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (res.canceled) return;

    const a = res.assets?.[0];
    if (!a?.uri) return;

    const stored = await copyToAppStorage({
      uri: a.uri,
      name: (a as any).fileName ?? null,
      mimeType: (a as any).mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
    });

    setNewAttachments((prev) => [...prev, stored]);
  };

  const pickPhotoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Denied", "Media library access is required.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (res.canceled || !res.assets?.length) return;

    // Process all selected media
    const newPhotos: StoredFile[] = [];
    for (const asset of res.assets) {
      if (!asset.uri) continue;
      const stored = await copyToAppStorage({
        uri: asset.uri,
        name: (asset as any).fileName ?? null,
        mimeType: (asset as any).mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      });
      newPhotos.push(stored);
    }

    setNewAttachments((prev) => [...prev, ...newPhotos]);
  };

  const removeExistingAttachment = (attId: string) => {
    Alert.alert(
      "Remove Attachment",
      "This attachment will be deleted when you save. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setDeletedAttachmentIds((prev) => [...prev, attId]);
            setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
          },
        },
      ]
    );
  };

  const removeNewAttachment = (uri: string) => {
    setNewAttachments((prev) => prev.filter((a) => a.uri !== uri));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} disabled={saving}>
          <Text style={[styles.headerLink, saving && { opacity: 0.5 }]}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Log</Text>
        <Pressable onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerLink, styles.saveLink, saving && { opacity: 0.5 }]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Read-only header info */}
        <View style={styles.readOnlySection}>
          <Text style={styles.projectName}>{log.projectName}</Text>
          <Text style={styles.date}>{formatDate(log.logDate)}</Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Editable fields */}
        <View style={styles.formSection}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Log title"
            editable={!saving}
          />

          <Text style={styles.label}>Weather</Text>
          <TextInput
            style={styles.input}
            value={weatherSummary}
            onChangeText={setWeatherSummary}
            placeholder="Weather summary"
            editable={!saving}
          />

          <Text style={styles.label}>Crew on Site</Text>
          <TextInput
            style={styles.input}
            value={crewOnSite}
            onChangeText={setCrewOnSite}
            placeholder="Crew on site"
            editable={!saving}
          />

          <Text style={styles.label}>Manpower Onsite</Text>
          <TextInput
            style={styles.input}
            value={manpowerOnsite}
            onChangeText={setManpowerOnsite}
            placeholder="Manpower count"
            editable={!saving}
          />

          <Text style={styles.label}>Person Onsite</Text>
          <TextInput
            style={styles.input}
            value={personOnsite}
            onChangeText={setPersonOnsite}
            placeholder="Person onsite"
            editable={!saving}
          />

          <Text style={styles.label}>Work Performed</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={workPerformed}
            onChangeText={setWorkPerformed}
            placeholder="Describe work performed..."
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Issues</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={issues}
            onChangeText={setIssues}
            placeholder="Any issues encountered..."
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Safety Incidents</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={safetyIncidents}
            onChangeText={setSafetyIncidents}
            placeholder="Safety incidents (if any)..."
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Confidential Notes</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={confidentialNotes}
            onChangeText={setConfidentialNotes}
            placeholder="Internal notes..."
            multiline
            editable={!saving}
          />
        </View>

        {/* Attachments Section */}
        <View style={styles.attachmentsSection}>
          <View style={styles.attachmentsHeader}>
            <Text style={styles.attachmentsTitle}>
              Attachments ({existingAttachments.length + newAttachments.length})
            </Text>
            <View style={styles.attachmentButtons}>
              <Pressable style={styles.attachButton} onPress={takePhoto} disabled={saving}>
                <Text style={styles.attachButtonText}>📷</Text>
              </Pressable>
              <Pressable style={styles.attachButton} onPress={pickPhotoFromLibrary} disabled={saving}>
                <Text style={styles.attachButtonText}>🖼</Text>
              </Pressable>
            </View>
          </View>

          {/* Existing attachments */}
          {existingAttachments.length > 0 && (
            <View style={styles.photoGrid}>
              {existingAttachments.map((att) => {
                const imageUri = att.fileUrl || att.thumbnailUrl;
                return (
                  <View key={att.id} style={styles.photoWrapper}>
                    {isImageAttachment(att) && imageUri ? (
                      <Pressable onPress={() => att.fileUrl && openAttachment(att.fileUrl)}>
                        <Image
                          source={{ uri: imageUri }}
                          style={styles.photoThumbnail}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ) : (
                      <View style={styles.fileAttachment}>
                        <Text style={styles.fileIcon}>📎</Text>
                        <Text style={styles.fileName} numberOfLines={1}>{att.fileName}</Text>
                      </View>
                    )}
                    <Pressable
                      style={styles.removeButton}
                      onPress={() => removeExistingAttachment(att.id)}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* New attachments (pending upload) */}
          {newAttachments.length > 0 && (
            <View style={styles.photoGrid}>
              {newAttachments.map((att) => (
                <View key={att.uri} style={styles.photoWrapper}>
                  <Image
                    source={{ uri: att.uri }}
                    style={[styles.photoThumbnail, styles.pendingPhoto]}
                    resizeMode="cover"
                  />
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>New</Text>
                  </View>
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => removeNewAttachment(att.uri)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {existingAttachments.length === 0 && newAttachments.length === 0 && (
            <Text style={styles.noAttachments}>No attachments yet. Tap 📷 or 🖼 to add photos.</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.primary,
  },
  headerLink: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: "500",
  },
  saveLink: {
    color: colors.primary,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  readOnlySection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  projectName: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  errorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  formSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  // Attachments section
  attachmentsSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  attachmentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  attachmentsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  attachmentButtons: {
    flexDirection: "row",
    gap: 8,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  attachButtonText: {
    fontSize: 18,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoWrapper: {
    position: "relative",
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.borderMuted,
  },
  pendingPhoto: {
    opacity: 0.8,
  },
  pendingBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
  removeButton: {
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
  removeButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  fileAttachment: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  fileIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  fileName: {
    fontSize: 9,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  noAttachments: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
});
