import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { compressForNetwork } from "../utils/mediaCompressor";
import { isRoomPlanSupported, startRoomCapture } from "../../modules/nexus-room-plan";
import { createVisionScan, createLidarScan } from "../api/roomScan";
import type { RoomScanResult } from "../api/roomScan";
import type { ProjectListItem } from "../types/api";
import { RoomAssessmentView } from "../components/RoomAssessmentView";

type ScanMode = "SELECT" | "CAPTURING" | "UPLOADING" | "RESULT";

export function RoomScanScreen({
  project,
  onBack,
}: {
  project: ProjectListItem;
  onBack: () => void;
}) {
  const [lidarAvailable, setLidarAvailable] = useState(false);
  const [mode, setMode] = useState<ScanMode>("SELECT");
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<RoomScanResult | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<
    Array<{ uri: string; name: string; mimeType: string }>
  >([]);

  // Check LiDAR on mount
  useEffect(() => {
    isRoomPlanSupported().then(setLidarAvailable);
  }, []);

  // ── AI Vision: multi-photo capture ──────────────────────────
  const capturePhotos = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Needed", "Camera permission is required for room scanning.");
      return;
    }

    setMode("CAPTURING");
    const photos: Array<{ uri: string; name: string; mimeType: string }> = [];

    const captureOne = async (): Promise<boolean> => {
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return false;

      const compressed = await compressForNetwork(res.assets[0].uri);
      photos.push({
        uri: compressed.uri,
        name: `room_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
      });
      return true;
    };

    // Capture first photo
    const got = await captureOne();
    if (!got) {
      setMode("SELECT");
      return;
    }

    // Prompt for additional photos (up to 4)
    const askMore = (): Promise<void> =>
      new Promise((resolve) => {
        if (photos.length >= 4) {
          resolve();
          return;
        }
        Alert.alert(
          `Photo ${photos.length} captured`,
          `${4 - photos.length} more allowed. More angles = better assessment.`,
          [
            { text: "Analyze Now", style: "cancel", onPress: () => resolve() },
            {
              text: "Add Another",
              onPress: async () => {
                await captureOne();
                await askMore();
                resolve();
              },
            },
          ],
          { cancelable: false },
        );
      });

    await askMore();
    setCapturedPhotos(photos);
    await submitVision(photos);
  }, [project.id]);

  const submitVision = async (
    photos: Array<{ uri: string; name: string; mimeType: string }>,
  ) => {
    setMode("UPLOADING");
    setStatus("Uploading photos & analyzing room…");
    try {
      const scan = await createVisionScan(project.id, photos);
      setResult(scan);
      setMode("RESULT");
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      setMode("SELECT");
    }
  };

  // ── LiDAR: native RoomPlan ─────────────────────────────────
  const startLidar = useCallback(async () => {
    setMode("CAPTURING");
    setStatus("Starting LiDAR room scan…");

    const result = await startRoomCapture();

    if (!result.supported) {
      Alert.alert("Not Supported", result.error || "LiDAR is not available on this device.");
      setMode("SELECT");
      setStatus(null);
      return;
    }

    if (result.cancelled) {
      setMode("SELECT");
      setStatus(null);
      return;
    }

    if (result.error) {
      setStatus(`Scan error: ${result.error}`);
      setMode("SELECT");
      return;
    }

    if (!result.roomData) {
      setStatus("No room data captured");
      setMode("SELECT");
      return;
    }

    // Submit LiDAR data to API for normalization
    setMode("UPLOADING");
    setStatus("Processing LiDAR room data…");
    try {
      const scan = await createLidarScan(project.id, result.roomData);
      setResult(scan);
      setMode("RESULT");
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      setMode("SELECT");
    }
  }, [project.id]);

  const resetScan = () => {
    setResult(null);
    setCapturedPhotos([]);
    setMode("SELECT");
    setStatus(null);
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Room Scanner</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.projectName}>{project.name}</Text>

      {/* Loading / uploading state */}
      {(mode === "CAPTURING" || mode === "UPLOADING") && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {mode === "CAPTURING" ? "Capturing room…" : status || "Processing…"}
          </Text>
        </View>
      )}

      {/* Mode selection */}
      {mode === "SELECT" && (
        <ScrollView contentContainerStyle={styles.selectContainer}>
          {status && <Text style={styles.errorText}>{status}</Text>}

          <Text style={styles.sectionTitle}>Choose Scan Method</Text>

          {/* AI Vision — always available */}
          <Pressable style={styles.modeCard} onPress={capturePhotos}>
            <Text style={styles.modeIcon}>📸</Text>
            <View style={styles.modeInfo}>
              <Text style={styles.modeTitle}>AI Photo Analysis</Text>
              <Text style={styles.modeDesc}>
                Take 1-4 photos of the room. GPT-4o Vision identifies doors, windows,
                flooring, and estimates dimensions.
              </Text>
              <Text style={styles.modeBadge}>Works on all devices</Text>
            </View>
          </Pressable>

          {/* LiDAR — only on supported devices */}
          <Pressable
            style={[styles.modeCard, !lidarAvailable && styles.modeCardDisabled]}
            onPress={lidarAvailable ? startLidar : undefined}
            disabled={!lidarAvailable}
          >
            <Text style={styles.modeIcon}>📐</Text>
            <View style={styles.modeInfo}>
              <Text style={[styles.modeTitle, !lidarAvailable && styles.textDisabled]}>
                LiDAR Room Scan
              </Text>
              <Text style={[styles.modeDesc, !lidarAvailable && styles.textDisabled]}>
                Walk around the room for precise 3D measurements.
                Accurate wall lengths, door/window placement.
              </Text>
              {lidarAvailable ? (
                <Text style={[styles.modeBadge, styles.lidarBadge]}>
                  LiDAR Available ✓
                </Text>
              ) : (
                <Text style={styles.modeBadgeDisabled}>
                  {Platform.OS === "android"
                    ? "iOS with LiDAR only"
                    : "Requires iPhone Pro / iPad Pro"}
                </Text>
              )}
            </View>
          </Pressable>
        </ScrollView>
      )}

      {/* Results */}
      {mode === "RESULT" && result && (
        <RoomAssessmentView
          scan={result}
          photos={capturedPhotos}
          onNewScan={resetScan}
          onClose={onBack}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  link: { color: colors.primaryLight, fontSize: 16 },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  projectName: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: 6,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
  },

  // Mode selection
  selectContainer: { padding: 20 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 12,
    padding: 10,
    backgroundColor: colors.errorLight,
    borderRadius: 8,
    overflow: "hidden",
  },

  // Mode cards
  modeCard: {
    flexDirection: "row",
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modeCardDisabled: { opacity: 0.5 },
  modeIcon: { fontSize: 36, marginRight: 14, marginTop: 2 },
  modeInfo: { flex: 1 },
  modeTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  modeDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  modeBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "600",
    color: colors.success,
    backgroundColor: colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  lidarBadge: {
    color: colors.info,
    backgroundColor: colors.infoLight,
  },
  modeBadgeDisabled: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  textDisabled: { color: colors.textMuted },
});
