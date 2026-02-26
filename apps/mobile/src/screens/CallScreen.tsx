import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  VideoTrack,
  isTrackReference,
  useRoomContext,
  useParticipants,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { apiFetch, apiJson } from "../api/client";
import { CallContactPicker, type CallPickerResult } from "../components/CallContactPicker";

const { width: SCREEN_W } = Dimensions.get("window");

export type CallMode = "video" | "voice" | "radio";

export type CallParams = {
  roomId: string;
  token: string;
  livekitUrl: string;
  projectName?: string;
  callMode?: CallMode;
};

export function CallScreen({
  route,
  navigation,
}: {
  route: { params: CallParams };
  navigation: any;
}) {
  const { roomId, token, livekitUrl, projectName, callMode = "video" } = route.params;

  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      await apiFetch(`/video/rooms/${roomId}`, { method: "DELETE" });
    } catch {
      // Room may already be ended
    }
    navigation.goBack();
  }, [roomId, navigation]);

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={token}
      connect={true}
      options={{
        adaptiveStream: { pixelDensity: "screen" },
      }}
      audio={true}
      video={callMode === "video"}
    >
      <CallUI
        roomId={roomId}
        projectName={projectName}
        initialMode={callMode}
        onHangUp={handleDisconnect}
      />
    </LiveKitRoom>
  );
}

// ── Mode labels ─────────────────────────────────────────────────────
const MODE_META: Record<CallMode, { icon: string; label: string }> = {
  video: { icon: "🎥", label: "Video" },
  voice: { icon: "🎙️", label: "Voice" },
  radio: { icon: "📻", label: "Radio" },
};

// ── Inner component (has access to room context) ────────────────────

function CallUI({
  roomId,
  projectName,
  initialMode,
  onHangUp,
}: {
  roomId: string;
  projectName?: string;
  initialMode: CallMode;
  onHangUp: () => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [mode, setMode] = useState<CallMode>(initialMode);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(initialMode !== "video");
  const [elapsed, setElapsed] = useState(0);
  const [pttActive, setPttActive] = useState(false);

  // Invite state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Get all video tracks
  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: false },
  );

  // ── Mode switching ────────────────────────────────────────────────

  const switchMode = useCallback(async (newMode: CallMode) => {
    if (newMode === mode) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const lp = room.localParticipant;

    if (newMode === "video") {
      await lp.setCameraEnabled(true);
      await lp.setMicrophoneEnabled(true);
      setVideoMuted(false);
      setAudioMuted(false);
    } else if (newMode === "voice") {
      await lp.setCameraEnabled(false);
      await lp.setMicrophoneEnabled(true);
      setVideoMuted(true);
      setAudioMuted(false);
    } else {
      // radio — mic off until PTT held
      await lp.setCameraEnabled(false);
      await lp.setMicrophoneEnabled(false);
      setVideoMuted(true);
      setAudioMuted(true);
      setPttActive(false);
    }

    setMode(newMode);
  }, [mode, room]);

  // ── Standard controls ─────────────────────────────────────────────

  const toggleAudio = useCallback(async () => {
    if (mode === "radio") return; // PTT controls mic in radio mode
    const lp = room.localParticipant;
    await lp.setMicrophoneEnabled(audioMuted);
    setAudioMuted(!audioMuted);
  }, [room, audioMuted, mode]);

  const toggleVideo = useCallback(async () => {
    const lp = room.localParticipant;
    await lp.setCameraEnabled(videoMuted);
    setVideoMuted(!videoMuted);
    // If turning video on from voice/radio, switch to video mode
    if (videoMuted && mode !== "video") {
      setMode("video");
      await lp.setMicrophoneEnabled(true);
      setAudioMuted(false);
    }
  }, [room, videoMuted, mode]);

  const flipCamera = useCallback(async () => {
    const lp = room.localParticipant;
    const camTrack = lp.getTrackPublication(Track.Source.Camera);
    if (camTrack?.track) {
      await (camTrack.track as any).restartTrack({
        facingMode: (camTrack.track as any).facingMode === "user" ? "environment" : "user",
      });
    }
  }, [room]);

  // ── PTT (push-to-talk) ────────────────────────────────────────────

  const pttPressIn = useCallback(async () => {
    setPttActive(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await room.localParticipant.setMicrophoneEnabled(true);
    setAudioMuted(false);
  }, [room]);

  const pttPressOut = useCallback(async () => {
    setPttActive(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await room.localParticipant.setMicrophoneEnabled(false);
    setAudioMuted(true);
  }, [room]);

  // ── Invite (shared across all modes) ──────────────────────────────

  const handleInvite = useCallback(async (result: CallPickerResult) => {
    setInviting(true);
    try {
      const invitees: { userId?: string; phone?: string; email?: string; name?: string }[] = [];

      for (const c of result.apiContacts) {
        const rawUserId = c.id
          .replace(/^ncc-member-/, "")
          .replace(/^ncc-sub-/, "")
          .replace(/^ncc-client-/, "")
          .replace(/^personal-/, "");
        invitees.push({
          userId: rawUserId,
          phone: c.phone ?? undefined,
          email: c.email ?? undefined,
          name: c.displayName || [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
        });
      }

      for (const dc of result.deviceContacts) {
        invitees.push({
          phone: dc.phone ?? undefined,
          email: dc.email ?? undefined,
          name: dc.displayName || undefined,
        });
      }

      if (result.manualEntry) {
        const val = result.manualEntry.trim();
        const isEmail = val.includes("@");
        invitees.push({
          phone: isEmail ? undefined : val,
          email: isEmail ? val : undefined,
          name: val,
        });
      }

      if (invitees.length > 0) {
        const res = await apiJson<{ results: { name: string; channel: string; status: string }[] }>(
          `/video/rooms/${roomId}/smart-invite`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invitees }),
          },
        );
        const sent = (res.results || []).filter((r) => r.status === "sent").length;
        Alert.alert("Invited", `Sent ${sent} invite${sent !== 1 ? "s" : ""}`);
      }

      setInviteOpen(false);
    } catch {
      Alert.alert("Error", "Failed to send invites");
    } finally {
      setInviting(false);
    }
  }, [roomId]);

  // ── Tile sizing for video mode ────────────────────────────────────
  const count = Math.max(tracks.length, 1);
  const cols = count <= 1 ? 1 : 2;
  const tileW = (SCREEN_W - 24) / cols;
  const tileH = tileW * 1.33;

  // Determine header label
  const modeLabel = MODE_META[mode].label;
  const headerTitle = projectName
    ? `${modeLabel} — ${projectName}`
    : `${modeLabel} Call`;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Text style={styles.timer}>
          {formatTime(elapsed)} · {participants.length} participant{participants.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Mode switcher */}
      <View style={styles.modeSwitcher}>
        {(["video", "voice", "radio"] as CallMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => switchMode(m)}
            activeOpacity={0.7}
          >
            <Text style={styles.modeBtnIcon}>{MODE_META[m].icon}</Text>
            <Text style={[styles.modeBtnLabel, mode === m && styles.modeBtnLabelActive]}>
              {MODE_META[m].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── VIDEO MODE ─────────────────────────────────────────────── */}
      {mode === "video" && (
        <FlatList
          data={tracks}
          numColumns={cols}
          key={cols}
          contentContainerStyle={styles.grid}
          keyExtractor={(_item, i) => `track-${i}`}
          renderItem={({ item }) => (
            <View style={[styles.tile, { width: tileW, height: tileH }]}>
              {isTrackReference(item) ? (
                <VideoTrack
                  trackRef={item}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
                  <Text style={styles.placeholderText}>
                    {(item as any).participant?.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
              <View style={styles.nameTag}>
                <Text style={styles.nameText} numberOfLines={1}>
                  {(item as any).participant?.name ?? "Unknown"}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Waiting for others to join…</Text>
            </View>
          }
        />
      )}

      {/* ── VOICE MODE ─────────────────────────────────────────────── */}
      {mode === "voice" && (
        <FlatList
          data={participants}
          contentContainerStyle={styles.voiceList}
          keyExtractor={(p) => p.identity}
          renderItem={({ item: p }) => {
            const speaking = p.isSpeaking;
            return (
              <View style={[styles.voiceRow, speaking && styles.voiceRowSpeaking]}>
                <View style={[styles.voiceAvatar, speaking && styles.voiceAvatarSpeaking]}>
                  <Text style={styles.voiceAvatarText}>
                    {p.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </Text>
                </View>
                <View style={styles.voiceInfo}>
                  <Text style={styles.voiceName} numberOfLines={1}>
                    {p.name ?? p.identity}
                  </Text>
                  <Text style={styles.voiceStatus}>
                    {speaking ? "🔊 Speaking" : p.isMicrophoneEnabled ? "Listening" : "🔇 Muted"}
                  </Text>
                </View>
                {speaking && <View style={styles.speakingDot} />}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Waiting for others to join…</Text>
            </View>
          }
        />
      )}

      {/* ── RADIO (PTT) MODE ───────────────────────────────────────── */}
      {mode === "radio" && (
        <View style={styles.radioContainer}>
          {/* Who's talking */}
          <View style={styles.radioStatus}>
            {participants.some((p) => p.isSpeaking) ? (
              <Text style={styles.radioStatusText}>
                🔊 {participants.find((p) => p.isSpeaking)?.name ?? "Someone"} is talking
              </Text>
            ) : (
              <Text style={styles.radioStatusIdle}>Channel open</Text>
            )}
          </View>

          {/* PTT Button */}
          <Pressable
            onPressIn={pttPressIn}
            onPressOut={pttPressOut}
            style={({ pressed }) => [
              styles.pttButton,
              (pressed || pttActive) && styles.pttButtonActive,
            ]}
          >
            <Text style={styles.pttIcon}>{pttActive ? "🔊" : "🎙️"}</Text>
            <Text style={[styles.pttLabel, pttActive && styles.pttLabelActive]}>
              {pttActive ? "TRANSMITTING" : "HOLD TO TALK"}
            </Text>
          </Pressable>

          {/* Compact participant list */}
          <FlatList
            data={participants}
            horizontal
            contentContainerStyle={styles.radioParticipants}
            keyExtractor={(p) => p.identity}
            renderItem={({ item: p }) => (
              <View style={[styles.radioAvatar, p.isSpeaking && styles.radioAvatarSpeaking]}>
                <Text style={styles.radioAvatarText}>
                  {p.name?.charAt(0)?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
          />
        </View>
      )}

      {/* ── Controls ───────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Mute — shown in video and voice modes */}
        {mode !== "radio" && (
          <TouchableOpacity
            style={[styles.controlBtn, audioMuted && styles.controlBtnMuted]}
            onPress={toggleAudio}
          >
            <Text style={styles.controlIcon}>{audioMuted ? "🔇" : "🎙️"}</Text>
            <Text style={styles.controlLabel}>{audioMuted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>
        )}

        {/* Camera toggle — shown in video mode */}
        {mode === "video" && (
          <>
            <TouchableOpacity
              style={[styles.controlBtn, videoMuted && styles.controlBtnMuted]}
              onPress={toggleVideo}
            >
              <Text style={styles.controlIcon}>{videoMuted ? "📷" : "🎥"}</Text>
              <Text style={styles.controlLabel}>{videoMuted ? "Start Video" : "Stop Video"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={flipCamera}>
              <Text style={styles.controlIcon}>🔄</Text>
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>
          </>
        )}

        {/* "Add Video" shortcut in voice mode */}
        {mode === "voice" && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => switchMode("video")}
          >
            <Text style={styles.controlIcon}>🎥</Text>
            <Text style={styles.controlLabel}>Add Video</Text>
          </TouchableOpacity>
        )}

        {/* Invite — all modes */}
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setInviteOpen(true)}>
          <Text style={styles.controlIcon}>➕</Text>
          <Text style={styles.controlLabel}>Invite</Text>
        </TouchableOpacity>

        {/* Hang up — all modes */}
        <TouchableOpacity style={styles.hangUpBtn} onPress={onHangUp}>
          <Text style={styles.controlIcon}>📞</Text>
          <Text style={[styles.controlLabel, { color: "#fff" }]}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Invite picker (shared component) */}
      <CallContactPicker
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onStartCall={handleInvite}
        calling={inviting}
        existingRoomId={roomId}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },

  // Header
  header: { paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  timer: { color: "#aaa", fontSize: 13, marginTop: 2 },

  // Mode switcher
  modeSwitcher: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#222",
  },
  modeBtnActive: {
    backgroundColor: "#1d4ed8",
  },
  modeBtnIcon: { fontSize: 16, marginRight: 4 },
  modeBtnLabel: { color: "#888", fontSize: 13, fontWeight: "600" },
  modeBtnLabelActive: { color: "#fff" },

  // Video mode
  grid: { padding: 8 },
  tile: { margin: 4, borderRadius: 12, overflow: "hidden", backgroundColor: "#222" },
  placeholder: { justifyContent: "center", alignItems: "center", backgroundColor: "#333" },
  placeholderText: { color: "#fff", fontSize: 36, fontWeight: "700" },
  nameTag: {
    position: "absolute", bottom: 6, left: 6, right: 6,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  nameText: { color: "#fff", fontSize: 12 },

  // Voice mode
  voiceList: { padding: 12 },
  voiceRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1a1a1a", borderRadius: 12,
    padding: 14, marginBottom: 8,
  },
  voiceRowSpeaking: { backgroundColor: "#1a2e1a", borderWidth: 1, borderColor: "#22c55e40" },
  voiceAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#334155", justifyContent: "center", alignItems: "center",
  },
  voiceAvatarSpeaking: { backgroundColor: "#16a34a" },
  voiceAvatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  voiceInfo: { flex: 1, marginLeft: 12 },
  voiceName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  voiceStatus: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  speakingDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "#22c55e", marginLeft: 8,
  },

  // Radio mode
  radioContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  radioStatus: { marginBottom: 24 },
  radioStatusText: { color: "#22c55e", fontSize: 16, fontWeight: "600" },
  radioStatusIdle: { color: "#64748b", fontSize: 16, fontWeight: "500" },
  pttButton: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: "#1e293b", borderWidth: 4, borderColor: "#334155",
    justifyContent: "center", alignItems: "center",
    marginBottom: 32,
  },
  pttButtonActive: {
    backgroundColor: "#dc2626", borderColor: "#ef4444",
    shadowColor: "#dc2626", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 10,
  },
  pttIcon: { fontSize: 48 },
  pttLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "700", marginTop: 8, letterSpacing: 1 },
  pttLabelActive: { color: "#fff" },
  radioParticipants: { gap: 8 },
  radioAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#334155", justifyContent: "center", alignItems: "center",
  },
  radioAvatarSpeaking: { backgroundColor: "#16a34a", borderWidth: 2, borderColor: "#22c55e" },
  radioAvatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  // Shared
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 100 },
  emptyText: { color: "#888", fontSize: 16 },

  // Controls
  controls: {
    flexDirection: "row", justifyContent: "space-evenly", alignItems: "center",
    paddingVertical: 16, paddingBottom: 32, backgroundColor: "#1a1a1a",
  },
  controlBtn: { alignItems: "center", padding: 12, borderRadius: 16, minWidth: 64 },
  controlBtnMuted: { backgroundColor: "rgba(255,255,255,0.1)" },
  controlIcon: { fontSize: 24 },
  controlLabel: { color: "#ccc", fontSize: 11, marginTop: 4 },
  hangUpBtn: {
    alignItems: "center", padding: 12, borderRadius: 16,
    minWidth: 64, backgroundColor: "#dc2626",
  },
  inviteBtn: {
    alignItems: "center", padding: 12, borderRadius: 16,
    minWidth: 64, backgroundColor: "#1d4ed8",
  },
});
