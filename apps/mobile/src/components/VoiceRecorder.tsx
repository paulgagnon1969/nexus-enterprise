import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Audio } from "expo-av";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { colors } from "../theme/colors";
import { apiFetch } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────

export interface VoiceRecordingResult {
  /** Local file URI of the recorded audio */
  localUri: string;
  /** Duration in seconds */
  durationSecs: number;
  /** On-device speech recognition transcript (may be partial) */
  deviceTranscript: string;
  /** ISO 639-1 language code used for recognition */
  language: string;
}

interface Props {
  /** Called when recording is stopped and audio + transcript are ready */
  onRecordingComplete: (result: VoiceRecordingResult) => void;
  /** Called when user cancels recording */
  onCancel: () => void;
  /** Optional initial language (default "en") */
  initialLanguage?: string;
  /** Optional context label shown at top */
  contextLabel?: string;
}

// ── Supported languages ────────────────────────────────────────────

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇲🇽" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
] as const;

// ── Component ──────────────────────────────────────────────────────

export function VoiceRecorder({
  onRecordingComplete,
  onCancel,
  initialLanguage = "en",
  contextLabel,
}: Props) {
  const [language, setLanguage] = useState(initialLanguage);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partialResult, setPartialResult] = useState("");
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [uploading, setUploading] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // ── Speech recognition events ──────────────────────────────────

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      setTranscript((prev) => (prev ? prev + " " + text : text));
      setPartialResult("");
    } else {
      setPartialResult(text);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.warn("[VoiceRecorder] Speech recognition error:", event.error);
    // Don't stop recording on speech error — audio still captures
  });

  // ── Timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor(
          (now - startTimeRef.current - pausedTimeRef.current) / 1000,
        );
        setElapsedSecs(elapsed);
      }, 500);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // ── Start recording ────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      // Request audio permission
      const audioPerm = await Audio.requestPermissionsAsync();
      if (!audioPerm.granted) {
        Alert.alert("Permission Required", "Microphone access is needed to record voice notes.");
        return;
      }

      // Request speech recognition permission
      const speechPerm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!speechPerm.granted) {
        Alert.alert(
          "Speech Permission",
          "Speech recognition permission is needed for live transcription. Recording will still work.",
        );
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start audio recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recording.startAsync();
      recordingRef.current = recording;

      // Start speech recognition (parallel)
      if (speechPerm.granted) {
        ExpoSpeechRecognitionModule.start({
          lang: language === "en" ? "en-US" : language === "es" ? "es-MX" : language,
          interimResults: true,
          continuous: true,
        });
      }

      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      setTranscript("");
      setPartialResult("");
      setIsRecording(true);
      setIsPaused(false);
      setElapsedSecs(0);
    } catch (err) {
      console.error("[VoiceRecorder] Start failed:", err);
      Alert.alert("Recording Error", `Could not start recording: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [language]);

  // ── Stop recording ─────────────────────────────────────────────

  const stopRecording = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Stop speech recognition
      ExpoSpeechRecognitionModule.stop();

      // Stop audio recording
      const recording = recordingRef.current;
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (!uri) {
        Alert.alert("Error", "Recording file not found.");
        return;
      }

      const finalTranscript = transcript + (partialResult ? " " + partialResult : "");

      setIsRecording(false);
      setIsPaused(false);

      onRecordingComplete({
        localUri: uri,
        durationSecs: elapsedSecs,
        deviceTranscript: finalTranscript.trim(),
        language,
      });
    } catch (err) {
      console.error("[VoiceRecorder] Stop failed:", err);
      Alert.alert("Error", "Failed to stop recording.");
    }
  }, [transcript, partialResult, elapsedSecs, language, onRecordingComplete]);

  // ── Cancel recording ───────────────────────────────────────────

  const cancelRecording = useCallback(async () => {
    try {
      ExpoSpeechRecognitionModule.stop();

      const recording = recordingRef.current;
      if (recording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        recordingRef.current = null;

        // Clean up the file
        if (uri) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      setIsRecording(false);
      setIsPaused(false);
      setTranscript("");
      setPartialResult("");
      setElapsedSecs(0);

      onCancel();
    } catch (err) {
      console.error("[VoiceRecorder] Cancel failed:", err);
      onCancel();
    }
  }, [onCancel]);

  // ── Format elapsed time ────────────────────────────────────────

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Render ─────────────────────────────────────────────────────

  const displayText = transcript + (partialResult ? " " + partialResult : "");

  return (
    <View style={styles.container}>
      {/* Context label */}
      {contextLabel && (
        <Text style={styles.contextLabel}>{contextLabel}</Text>
      )}

      {/* Language selector (only before recording starts) */}
      {!isRecording && (
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              style={[
                styles.langChip,
                language === lang.code && styles.langChipActive,
              ]}
              onPress={() => setLanguage(lang.code)}
            >
              <Text style={styles.langFlag}>{lang.flag}</Text>
              <Text
                style={[
                  styles.langLabel,
                  language === lang.code && styles.langLabelActive,
                ]}
              >
                {lang.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Live transcript area */}
      <ScrollView
        style={styles.transcriptScroll}
        contentContainerStyle={styles.transcriptContent}
      >
        {isRecording && displayText ? (
          <Text style={styles.transcriptText}>
            {transcript}
            {partialResult ? (
              <Text style={styles.partialText}> {partialResult}</Text>
            ) : null}
          </Text>
        ) : isRecording ? (
          <Text style={styles.placeholderText}>Listening…</Text>
        ) : (
          <Text style={styles.placeholderText}>
            Tap the mic to start recording
          </Text>
        )}
      </ScrollView>

      {/* Timer + waveform indicator */}
      {isRecording && (
        <View style={styles.timerRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.timerText}>{formatTime(elapsedSecs)}</Text>
          <Text style={styles.langIndicator}>
            {LANGUAGES.find((l) => l.code === language)?.flag ?? ""}{" "}
            {language.toUpperCase()}
          </Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {!isRecording ? (
          <>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.recordBtn} onPress={startRecording}>
              <Text style={styles.recordBtnIcon}>🎙️</Text>
              <Text style={styles.recordBtnText}>Record</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.cancelBtn} onPress={cancelRecording}>
              <Text style={styles.cancelBtnText}>Discard</Text>
            </Pressable>
            <Pressable style={styles.stopBtn} onPress={stopRecording}>
              <View style={styles.stopSquare} />
              <Text style={styles.stopBtnText}>Done</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  contextLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Language selector
  langRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: "#f9fafb",
    gap: 6,
  },
  langChipActive: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  langFlag: {
    fontSize: 16,
  },
  langLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  langLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },

  // Transcript
  transcriptScroll: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    marginBottom: 16,
  },
  transcriptContent: {
    padding: 16,
    minHeight: 120,
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1f2937",
  },
  partialText: {
    color: "#9ca3af",
    fontStyle: "italic",
  },
  placeholderText: {
    fontSize: 15,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 40,
  },

  // Timer row
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  timerText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    fontVariant: ["tabular-nums"],
  },
  langIndicator: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Controls
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.error,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    gap: 8,
  },
  recordBtnIcon: {
    fontSize: 20,
  },
  recordBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    gap: 8,
  },
  stopSquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  stopBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
