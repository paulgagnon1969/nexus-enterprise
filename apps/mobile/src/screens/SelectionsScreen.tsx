import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { colors } from "../theme/colors";
import { listPlanningRooms, createPlanningRoom } from "../api/selections";
import type { PlanningRoomListItem } from "../api/selections";
import type { ProjectListItem } from "../types/api";

const SOURCE_LABELS: Record<string, string> = {
  ROOM_SCAN: "From Room Scan",
  PLAN_SHEET: "From Plan Sheet",
  PHOTO: "From Photo",
  MANUAL: "Manual",
};

const PIPELINE_STEPS = ["capture", "dimensionExtraction", "layoutProposal", "aiReview", "sheetGeneration"] as const;

function PipelineDots({ status }: { status: any }) {
  if (!status) return null;
  return (
    <View style={styles.pipelineDots}>
      {PIPELINE_STEPS.map((step) => {
        const s = status[step]?.status ?? "not_started";
        const color = s === "complete" ? "#22c55e" : s === "pending" ? "#f59e0b" : "#d1d5db";
        return <View key={step} style={[styles.dot, { backgroundColor: color }]} />;
      })}
    </View>
  );
}

function ReviewBadge({ review }: { review: any }) {
  if (!review?.score) return null;
  const bg = review.score >= 80 ? "#dcfce7" : review.score >= 60 ? "#fef3c7" : "#fecaca";
  const fg = review.score >= 80 ? "#166534" : review.score >= 60 ? "#92400e" : "#991b1b";
  return (
    <View style={[styles.reviewBadge, { backgroundColor: bg }]}>
      <Text style={[styles.reviewBadgeText, { color: fg }]}>{review.grade}</Text>
    </View>
  );
}

export function SelectionsScreen({
  project,
  onBack,
  onOpenRoom,
}: {
  project: ProjectListItem;
  onBack: () => void;
  onOpenRoom: (roomId: string) => void;
}) {
  const [rooms, setRooms] = useState<PlanningRoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPlanningRooms(project.id);
      setRooms(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const handleCreateRoom = useCallback(async () => {
    Alert.prompt(
      "New Room",
      "Enter a name for the room (e.g., Kitchen, Master Bath)",
      async (name) => {
        if (!name?.trim()) return;
        try {
          const room = await createPlanningRoom(project.id, {
            name: name.trim(),
            deviceOrigin: "MOBILE",
          });
          setRooms((prev) => [room, ...prev]);
          onOpenRoom(room.id);
        } catch (e) {
          Alert.alert("Error", e instanceof Error ? e.message : String(e));
        }
      },
    );
  }, [project.id, onOpenRoom]);

  const totalCost = (room: PlanningRoomListItem) => {
    return room.selections.reduce((sum, s) => sum + ((s.vendorProduct?.price ?? 0)), 0);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Selections</Text>
        <Pressable onPress={handleCreateRoom}>
          <Text style={styles.addBtn}>+ New</Text>
        </Pressable>
      </View>

      <Text style={styles.projectName}>{project.name}</Text>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {!loading && rooms.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📐</Text>
          <Text style={styles.emptyTitle}>No Rooms Yet</Text>
          <Text style={styles.emptyDesc}>
            Create a room manually or start from a Room Scan or Plan Sheet.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={handleCreateRoom}>
            <Text style={styles.primaryBtnText}>Create Room</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {rooms.map((room) => (
          <Pressable
            key={room.id}
            style={styles.roomCard}
            onPress={() => onOpenRoom(room.id)}
          >
            <View style={styles.roomHeader}>
              <Text style={styles.roomName}>{room.name}</Text>
              <ReviewBadge review={room.aiReview} />
            </View>
            <View style={styles.roomMeta}>
              <Text style={styles.sourceBadge}>
                {SOURCE_LABELS[room.sourceType] ?? room.sourceType}
              </Text>
              <Text style={styles.metaText}>
                {room._count.selections} selection{room._count.selections !== 1 ? "s" : ""}
              </Text>
              {totalCost(room) > 0 && (
                <Text style={styles.metaText}>
                  ${totalCost(room).toFixed(0)}
                </Text>
              )}
            </View>
            <PipelineDots status={room.pipelineStatus} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#e2e8f0" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  link: { fontSize: 14, color: colors.primary, fontWeight: "500" },
  addBtn: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  projectName: { fontSize: 13, color: "#64748b", paddingHorizontal: 16, paddingTop: 8 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#dc2626", fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 4 },
  emptyDesc: { fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 16, maxWidth: 280 },
  primaryBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  roomCard: { backgroundColor: "#fff", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  roomHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  roomName: { fontSize: 15, fontWeight: "600", color: "#1e293b", flex: 1 },
  roomMeta: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 6 },
  sourceBadge: { fontSize: 11, color: "#64748b", backgroundColor: "#f1f5f9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  metaText: { fontSize: 12, color: "#64748b" },
  pipelineDots: { flexDirection: "row", gap: 4, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  reviewBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reviewBadgeText: { fontSize: 12, fontWeight: "700" },
});
