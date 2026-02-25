import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
  Alert,
} from "react-native";
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
import type { TrackReferenceOrPlaceholder } from "@livekit/react-native";
import { apiFetch, apiJson } from "../api/client";
import { CallContactPicker, type CallPickerResult } from "../components/CallContactPicker";

const { width: SCREEN_W } = Dimensions.get("window");

export type VideoCallParams = {
  roomId: string;
  token: string;
  livekitUrl: string;
  projectName?: string;
};

export function VideoCallScreen({
  route,
  navigation,
}: {
  route: { params: VideoCallParams };
  navigation: any;
}) {
  const { roomId, token, livekitUrl, projectName } = route.params;

  useEffect(() => {
    // Start audio session when entering call
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  const handleDisconnect = useCallback(async () => {
    // End the room on the API side
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
      video={true}
    >
      <CallUI
        roomId={roomId}
        projectName={projectName}
        onHangUp={handleDisconnect}
      />
    </LiveKitRoom>
  );
}

// ── Inner component (has access to room context) ────────────────────

function CallUI({
  roomId,
  projectName,
  onHangUp,
}: {
  roomId: string;
  projectName?: string;
  onHangUp: () => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

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

  const toggleAudio = useCallback(async () => {
    const localParticipant = room.localParticipant;
    await localParticipant.setMicrophoneEnabled(audioMuted);
    setAudioMuted(!audioMuted);
  }, [room, audioMuted]);

  const toggleVideo = useCallback(async () => {
    const localParticipant = room.localParticipant;
    await localParticipant.setCameraEnabled(videoMuted);
    setVideoMuted(!videoMuted);
  }, [room, videoMuted]);

  const flipCamera = useCallback(async () => {
    const localParticipant = room.localParticipant;
    const camTrack = localParticipant.getTrackPublication(Track.Source.Camera);
    if (camTrack?.track) {
      await (camTrack.track as any).restartTrack({
        facingMode: (camTrack.track as any).facingMode === "user" ? "environment" : "user",
      });
    }
  }, [room]);

  // ── Invite via shared picker + smart-invite ─────────────────────────

  const openInvite = useCallback(() => {
    setInviteOpen(true);
  }, []);

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

  // Calculate tile size based on participant count
  const count = Math.max(tracks.length, 1);
  const cols = count <= 1 ? 1 : 2;
  const tileW = (SCREEN_W - 24) / cols;
  const tileH = tileW * 1.33;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{projectName ?? "Video Call"}</Text>
        <Text style={styles.timer}>
          {formatTime(elapsed)} · {participants.length} participant{participants.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Video tiles */}
      <FlatList
        data={tracks}
        numColumns={cols}
        key={cols}
        contentContainerStyle={styles.grid}
        keyExtractor={(item, i) => `track-${i}`}
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

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlBtn, audioMuted && styles.controlBtnMuted]}
          onPress={toggleAudio}
        >
          <Text style={styles.controlIcon}>{audioMuted ? "🔇" : "🎙️"}</Text>
          <Text style={styles.controlLabel}>{audioMuted ? "Unmute" : "Mute"}</Text>
        </TouchableOpacity>

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

        <TouchableOpacity style={styles.inviteBtn} onPress={openInvite}>
          <Text style={styles.controlIcon}>➕</Text>
          <Text style={styles.controlLabel}>Invite</Text>
        </TouchableOpacity>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  timer: {
    color: "#aaa",
    fontSize: 13,
    marginTop: 2,
  },
  grid: {
    padding: 8,
  },
  tile: {
    margin: 4,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#222",
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#333",
  },
  placeholderText: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "700",
  },
  nameTag: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nameText: {
    color: "#fff",
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    color: "#888",
    fontSize: 16,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: "#1a1a1a",
  },
  controlBtn: {
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    minWidth: 64,
  },
  controlBtnMuted: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    color: "#ccc",
    fontSize: 11,
    marginTop: 4,
  },
  hangUpBtn: {
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    minWidth: 64,
    backgroundColor: "#dc2626",
  },
  inviteBtn: {
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    minWidth: 64,
    backgroundColor: "#1d4ed8",
  },
});
