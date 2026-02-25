import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  SafeAreaView,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
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
import { fetchContacts } from "../api/contacts";
import type { Contact } from "../types/api";

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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);

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

  // ── Invite helpers ──────────────────────────────────────────────────

  const openInvite = useCallback(async () => {
    setInviteOpen(true);
    setContactsLoading(true);
    try {
      const list = await fetchContacts({ category: "internal" });
      setContacts(list);
    } catch {
      // Fallback: fetch without category filter
      try {
        const list = await fetchContacts();
        setContacts(list);
      } catch {
        setContacts([]);
      }
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const toggleContact = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sendInvites = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setInviting(true);
    try {
      // Contact IDs are prefixed (e.g. "ncc-member-abc123") — strip to raw userId.
      const rawUserIds = Array.from(selectedIds).map((id) =>
        id.replace(/^ncc-member-/, "").replace(/^ncc-sub-/, "").replace(/^ncc-client-/, "").replace(/^personal-/, ""),
      );
      await apiJson(`/video/rooms/${roomId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: rawUserIds }),
      });
      Alert.alert("Invited", `Sent ${selectedIds.size} invite${selectedIds.size > 1 ? "s" : ""}`);
      setInviteOpen(false);
      setSelectedIds(new Set());
      setInviteSearch("");
    } catch {
      Alert.alert("Error", "Failed to send invites");
    } finally {
      setInviting(false);
    }
  }, [roomId, selectedIds]);

  const filteredContacts = inviteSearch.trim()
    ? contacts.filter((c) => {
        const name = [c.firstName, c.lastName, c.displayName, c.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return name.includes(inviteSearch.toLowerCase());
      })
    : contacts;

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

      {/* Invite modal */}
      <Modal visible={inviteOpen} animationType="slide" transparent>
        <View style={styles.inviteOverlay}>
          <View style={styles.inviteSheet}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteTitle}>Invite to Call</Text>
              <Pressable onPress={() => { setInviteOpen(false); setInviteSearch(""); }}>
                <Text style={styles.inviteClose}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.inviteSearchInput}
              placeholder="Search contacts…"
              placeholderTextColor="#888"
              value={inviteSearch}
              onChangeText={setInviteSearch}
              autoCorrect={false}
            />

            {contactsLoading ? (
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 32 }} />
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(c) => c.id}
                style={styles.inviteList}
                renderItem={({ item }) => {
                  const name = item.displayName
                    || [item.firstName, item.lastName].filter(Boolean).join(" ")
                    || item.email
                    || "Unknown";
                  const selected = selectedIds.has(item.id);
                  return (
                    <Pressable
                      style={[styles.inviteRow, selected && styles.inviteRowSelected]}
                      onPress={() => toggleContact(item.id)}
                    >
                      <View style={[styles.inviteAvatar, selected && styles.inviteAvatarSelected]}>
                        <Text style={styles.inviteAvatarText}>
                          {selected ? "✓" : (name.charAt(0).toUpperCase())}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inviteName} numberOfLines={1}>{name}</Text>
                        {item.role && (
                          <Text style={styles.inviteRole} numberOfLines={1}>{item.role}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.inviteEmpty}>No contacts found</Text>
                }
              />
            )}

            {selectedIds.size > 0 && (
              <Pressable
                style={[styles.inviteSendBtn, inviting && { opacity: 0.6 }]}
                onPress={sendInvites}
                disabled={inviting}
              >
                <Text style={styles.inviteSendText}>
                  {inviting ? "Sending…" : `Invite ${selectedIds.size} person${selectedIds.size > 1 ? "s" : ""}`}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
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

  // Invite modal
  inviteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  inviteSheet: {
    backgroundColor: "#1e1e2e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    paddingBottom: 32,
  },
  inviteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  inviteTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  inviteClose: {
    color: "#aaa",
    fontSize: 22,
    padding: 4,
  },
  inviteSearchInput: {
    backgroundColor: "#2a2a3e",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  inviteList: {
    paddingHorizontal: 20,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  inviteRowSelected: {
    backgroundColor: "rgba(59,130,246,0.1)",
  },
  inviteAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  inviteAvatarSelected: {
    backgroundColor: "#2563eb",
  },
  inviteAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  inviteName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
  inviteRole: {
    color: "#888",
    fontSize: 12,
    marginTop: 1,
  },
  inviteEmpty: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
  inviteSendBtn: {
    backgroundColor: "#2563eb",
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  inviteSendText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
