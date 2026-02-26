import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { apiJson } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────

export interface VjnData {
  id: string;
  voiceRecordingUrl: string;
  voiceDurationSecs: number;
  language: string;
  deviceTranscript: string | null;
  aiTranscriptRaw: string | null;
  aiText: string | null;
  aiSummary: string | null;
  aiTextTranslated: string | null;
  aiGenerated: boolean;
  status: "DRAFT" | "SHARED" | "ARCHIVED";
  project?: { id: string; name: string } | null;
  shares?: { id: string; targetModule: string; sharedAt: string }[];
  createdAt: string;
}

type ShareTarget = "daily_log" | "journal" | "message";

interface Props {
  visible: boolean;
  vjn: VjnData | null;
  onClose: () => void;
  /** Called after a successful share action */
  onShared?: (vjn: VjnData, target: ShareTarget) => void;
  /** Optional project context for daily_log shares */
  projectId?: string;
}

// ── Component ──────────────────────────────────────────────────────

export function VjnReviewSheet({
  visible,
  vjn,
  onClose,
  onShared,
  projectId,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  // Audio player via expo-audio hooks
  const player = useAudioPlayer(
    vjn?.voiceRecordingUrl ? { uri: vjn.voiceRecordingUrl } : null,
  );
  const playerStatus = useAudioPlayerStatus(player);

  // Reset state when VJN changes
  useEffect(() => {
    if (vjn) {
      setEditText(vjn.aiText ?? vjn.deviceTranscript ?? "");
      setIsEditing(false);
      setShowTranslation(false);
    }
  }, [vjn?.id]);

  // Configure audio mode for playback
  useEffect(() => {
    if (visible) {
      setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
      }).catch(() => {});
    }
  }, [visible]);

  // ── Audio playback ─────────────────────────────────────────

  const togglePlayback = useCallback(() => {
    if (!vjn) return;
    try {
      if (playerStatus.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch (err) {
      console.error("[VjnReview] Playback error:", err);
      Alert.alert("Playback Error", "Could not play audio.");
    }
  }, [vjn, player, playerStatus.playing]);

  // ── Trigger Tier 2 processing ──────────────────────────────────

  const triggerProcessing = useCallback(async () => {
    if (!vjn) return;
    setProcessing(true);
    try {
      await apiJson(`/vjn/${vjn.id}/process`, { method: "POST" });
      Alert.alert("Processing", "AI is processing your recording. Results will appear shortly.");
    } catch (err) {
      Alert.alert("Error", `Processing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [vjn]);

  // ── Save edits ─────────────────────────────────────────────────

  const saveEdits = useCallback(async () => {
    if (!vjn) return;
    setSaving(true);
    try {
      await apiJson(`/vjn/${vjn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiText: editText }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
    } catch (err) {
      Alert.alert("Error", `Could not save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [vjn, editText]);

  // ── Share actions ──────────────────────────────────────────────

  const handleShare = useCallback(
    async (target: ShareTarget) => {
      if (!vjn) return;

      // Validate required fields
      if (target === "daily_log" && !projectId && !vjn.project?.id) {
        Alert.alert("No Project", "Select a project before sharing to the Daily Log.");
        return;
      }

      setSharing(true);
      try {
        const body: Record<string, string> = { target };
        if (target === "daily_log") {
          body.projectId = projectId ?? vjn.project?.id ?? "";
        }

        await apiJson(`/vjn/${vjn.id}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const labels: Record<ShareTarget, string> = {
          daily_log: "Daily Log (PUDL)",
          journal: "Journal",
          message: "Message",
        };
        Alert.alert("Shared!", `VJN shared to ${labels[target]}.`);
        onShared?.(vjn, target);
      } catch (err) {
        Alert.alert("Error", `Share failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSharing(false);
      }
    },
    [vjn, projectId, onShared],
  );

  // ── Keep private ───────────────────────────────────────────────

  const handleKeepPrivate = useCallback(() => {
    Alert.alert("Kept Private", "This VJN will stay in your personal journal.");
    onClose();
  }, [onClose]);

  // ── Helpers ────────────────────────────────────────────────────

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!vjn) return null;

  const hasTranslation = !!vjn.aiTextTranslated && vjn.language !== "en";
  const displayText = showTranslation
    ? vjn.aiTextTranslated ?? vjn.aiText ?? vjn.deviceTranscript ?? ""
    : vjn.aiText ?? vjn.deviceTranscript ?? "";

  const isPlaying = playerStatus.playing;
  const playbackPosition = playerStatus.currentTime;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>🎤️ Voice Journal Note</Text>
              {vjn.project && (
                <Text style={styles.projectLabel}>{vjn.project.name}</Text>
              )}
            </View>
            <Pressable onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Audio player */}
            <View style={styles.playerRow}>
              <Pressable style={styles.playBtn} onPress={togglePlayback}>
                <Text style={styles.playIcon}>
                  {isPlaying ? "⏸" : "▶️"}
                </Text>
              </Pressable>
              <View style={styles.playerInfo}>
                <Text style={styles.playerTime}>
                  {formatTime(playbackPosition)} / {formatTime(vjn.voiceDurationSecs)}
                </Text>
                <Text style={styles.playerLang}>
                  {vjn.language?.toUpperCase() ?? "EN"}
                </Text>
              </View>
              {!vjn.aiGenerated && (
                <Pressable
                  style={styles.processBtn}
                  onPress={triggerProcessing}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.processBtnText}>🔄 Enhance</Text>
                  )}
                </Pressable>
              )}
            </View>

            {/* AI Summary badge */}
            {vjn.aiSummary && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>AI Summary</Text>
                <Text style={styles.summaryText}>{vjn.aiSummary}</Text>
              </View>
            )}

            {/* Translation toggle */}
            {hasTranslation && (
              <Pressable
                style={styles.translationToggle}
                onPress={() => setShowTranslation(!showTranslation)}
              >
                <Text style={styles.translationToggleText}>
                  {showTranslation ? "🇺🇸 Showing English" : `🌐 Show English Translation`}
                </Text>
              </Pressable>
            )}

            {/* Main text */}
            <View style={styles.textSection}>
              <View style={styles.textHeader}>
                <Text style={styles.textLabel}>
                  {vjn.aiGenerated ? "AI Transcription" : "Device Transcript"}
                </Text>
                {!isEditing && (
                  <Pressable onPress={() => { setIsEditing(true); setEditText(displayText); }}>
                    <Text style={styles.editBtn}>✏️ Edit</Text>
                  </Pressable>
                )}
              </View>

              {isEditing ? (
                <View>
                  <TextInput
                    style={styles.editInput}
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                  />
                  <View style={styles.editActions}>
                    <Pressable onPress={() => setIsEditing(false)}>
                      <Text style={styles.editCancel}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.saveBtn} onPress={saveEdits} disabled={saving}>
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.saveBtnText}>Save</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Text style={styles.mainText}>{displayText || "No transcript available."}</Text>
              )}
            </View>
          </ScrollView>

          {/* Share actions */}
          <View style={styles.actions}>
            <Text style={styles.actionsLabel}>Share to:</Text>
            <View style={styles.shareRow}>
              <Pressable
                style={styles.shareBtn}
                onPress={() => handleShare("daily_log")}
                disabled={sharing}
              >
                <Text style={styles.shareBtnIcon}>📋</Text>
                <Text style={styles.shareBtnText}>PUDL</Text>
              </Pressable>
              <Pressable
                style={styles.shareBtn}
                onPress={() => handleShare("journal")}
                disabled={sharing}
              >
                <Text style={styles.shareBtnIcon}>📓</Text>
                <Text style={styles.shareBtnText}>Journal</Text>
              </Pressable>
              <Pressable
                style={styles.shareBtn}
                onPress={() => handleShare("message")}
                disabled={sharing}
              >
                <Text style={styles.shareBtnIcon}>💬</Text>
                <Text style={styles.shareBtnText}>Message</Text>
              </Pressable>
            </View>

            {/* Keep Private button */}
            <Pressable style={styles.privateBtn} onPress={handleKeepPrivate}>
              <Text style={styles.privateBtnText}>🔒 Keep VJN Private</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  projectLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    fontSize: 22,
    color: "#6b7280",
    padding: 4,
  },

  // Body
  body: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },

  // Audio player
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 12,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 18,
    color: "#fff",
  },
  playerInfo: {
    flex: 1,
  },
  playerTime: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
    fontVariant: ["tabular-nums"],
  },
  playerLang: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  processBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  },
  processBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },

  // Summary card
  summaryCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1f2937",
  },

  // Translation toggle
  translationToggle: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    alignSelf: "flex-start",
  },
  translationToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },

  // Text section
  textSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  textHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  textLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editBtn: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  mainText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#1f2937",
  },

  // Edit mode
  editInput: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#1f2937",
    minHeight: 120,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  editCancel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  // Actions
  actions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  actionsLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  shareRow: {
    flexDirection: "row",
    gap: 10,
  },
  shareBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    gap: 4,
  },
  shareBtnIcon: {
    fontSize: 20,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  privateBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  privateBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
