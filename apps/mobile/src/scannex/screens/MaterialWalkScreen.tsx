import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../../theme/colors";
import type {
  ScanNEXRoomResult,
  ComponentProfile,
  ComponentType,
  EnrichedLineItem,
} from "../types";
import { buildEnrichedBOM } from "../roomResultBuilder";

// ── Component checklist items derived from room scan ─────────

interface ChecklistItem {
  key: ComponentType | "flooring" | "wall-surface" | "ceiling-surface";
  label: string;
  hint: string;
  icon: string;
  /** Whether this component was detected in the scan */
  detected: boolean;
  /** Whether the user has captured a photo for this component */
  captured: boolean;
  /** Local photo URI */
  photoUri?: string;
}

interface Props {
  roomResult: ScanNEXRoomResult;
  onComplete: (
    profiles: ComponentProfile[],
    enrichedBOM: EnrichedLineItem[],
  ) => void;
  onSkip: () => void;
  onBack: () => void;
}

/**
 * MaterialWalkScreen — guided post-scan capture for component identification.
 *
 * After a RoomPlan scan completes, this screen presents a checklist of components
 * detected in the room. The field tech captures close-up photos of each component
 * type (baseboard, crown molding, casing, flooring, wall surface, ceiling).
 *
 * Photos are stored locally and will be sent to the AI material identification
 * pipeline for profile/material/finish classification.
 */
export function MaterialWalkScreen({
  roomResult,
  onComplete,
  onSkip,
  onBack,
}: Props) {
  const [captures, setCaptures] = useState<
    Map<string, { uri: string; timestamp: number }>
  >(new Map());
  const [submitting, setSubmitting] = useState(false);

  // Build checklist from scan results
  const checklist = useMemo((): ChecklistItem[] => {
    const trimBands = roomResult.visionDetections.trimBands ?? [];
    const hasBaseboard = trimBands.some((b) => b.trimType === "baseboard") ||
      roomResult.totalBaseboardLF > 0;
    const hasCrown = trimBands.some((b) => b.trimType === "crown-molding");
    const hasChairRail = trimBands.some((b) => b.trimType === "chair-rail");
    const hasDoors = roomResult.doors.length > 0;
    const hasWindows = roomResult.windows.length > 0;
    const hasCasing = hasDoors || hasWindows;

    const items: ChecklistItem[] = [];

    if (hasBaseboard) {
      items.push({
        key: "baseboard",
        label: "Baseboard",
        hint: "Get within 6-12\" of the baseboard. Capture the full profile height.",
        icon: "🔲",
        detected: true,
        captured: captures.has("baseboard"),
        photoUri: captures.get("baseboard")?.uri,
      });
    }

    if (hasCrown) {
      items.push({
        key: "crown-molding",
        label: "Crown Molding",
        hint: "Angle the camera up to capture the crown molding profile.",
        icon: "👑",
        detected: true,
        captured: captures.has("crown-molding"),
        photoUri: captures.get("crown-molding")?.uri,
      });
    }

    if (hasChairRail) {
      items.push({
        key: "chair-rail",
        label: "Chair Rail",
        hint: "Capture the chair rail at mid-wall height. Frame the full profile.",
        icon: "➖",
        detected: true,
        captured: captures.has("chair-rail"),
        photoUri: captures.get("chair-rail")?.uri,
      });
    }

    if (hasCasing) {
      items.push({
        key: "casing",
        label: "Door/Window Casing",
        hint: "Capture a close-up of door or window casing trim. Show the full width of the profile.",
        icon: "🚪",
        detected: true,
        captured: captures.has("casing"),
        photoUri: captures.get("casing")?.uri,
      });
    }

    // Always offer surface captures
    items.push({
      key: "flooring" as any,
      label: "Flooring",
      hint: "Capture flooring material — show plank width, tile pattern, or carpet texture.",
      icon: "🟫",
      detected: true,
      captured: captures.has("flooring"),
      photoUri: captures.get("flooring")?.uri,
    });

    items.push({
      key: "wall-surface" as any,
      label: "Wall Surface",
      hint: "Capture wall surface texture — orange-peel, smooth, knockdown, wallpaper.",
      icon: "🧱",
      detected: true,
      captured: captures.has("wall-surface"),
      photoUri: captures.get("wall-surface")?.uri,
    });

    items.push({
      key: "ceiling-surface" as any,
      label: "Ceiling Surface",
      hint: "Capture ceiling texture — smooth, popcorn, knockdown, coffered.",
      icon: "⬜",
      detected: true,
      captured: captures.has("ceiling-surface"),
      photoUri: captures.get("ceiling-surface")?.uri,
    });

    return items;
  }, [roomResult, captures]);

  const capturedCount = checklist.filter((i) => i.captured).length;
  const totalCount = checklist.length;

  // ── Capture photo for a checklist item ──────────────────────

  const capturePhoto = useCallback(
    async (item: ChecklistItem) => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera Permission",
          "Camera access is required to capture material close-ups.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.95, // High quality for AI analysis
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setCaptures((prev) => {
        const next = new Map(prev);
        next.set(item.key, {
          uri: result.assets[0].uri,
          timestamp: Date.now(),
        });
        return next;
      });
    },
    [],
  );

  // ── Submit: build preliminary profiles and enriched BOM ─────

  const handleComplete = useCallback(async () => {
    setSubmitting(true);

    // Build preliminary ComponentProfiles from captures
    // These will be enriched by server-side AI later
    const profiles: ComponentProfile[] = [];
    const trimTypes: ComponentType[] = [
      "baseboard",
      "crown-molding",
      "casing",
      "chair-rail",
      "shoe-molding",
      "quarter-round",
    ];

    for (const [key, capture] of captures) {
      if (!trimTypes.includes(key as ComponentType)) continue;

      // Use trim band height estimate if available
      const trimBand = roomResult.visionDetections.trimBands?.find(
        (b) => b.trimType === key,
      );
      const estimatedHeight = trimBand
        ? trimBand.estimatedHeightFraction * roomResult.ceilingHeight * 12
        : 0;

      profiles.push({
        componentType: key as ComponentType,
        heightInches: estimatedHeight > 1.5 && estimatedHeight < 8 ? Math.round(estimatedHeight * 2) / 2 : 0,
        profileStyle: "unknown",
        material: "", // populated by AI
        finish: "", // populated by AI
        color: "", // populated by AI
        measurementSource: estimatedHeight > 0 ? "ai-inferred" : "manual",
        confidence: trimBand ? trimBand.confidence * 0.5 : 0, // low until AI confirms
        capturePhotoUrl: capture.uri,
      });
    }

    // Attach profiles to room result and build BOM
    const updatedResult: ScanNEXRoomResult = {
      ...roomResult,
      roomProfiles: profiles,
    };
    const enrichedBOM = buildEnrichedBOM(updatedResult);

    setSubmitting(false);
    onComplete(profiles, enrichedBOM);
  }, [captures, roomResult, onComplete]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Material Walk</Text>
        <Pressable onPress={onSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* Progress */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${(capturedCount / totalCount) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.progressText}>
        {capturedCount} of {totalCount} components captured
      </Text>

      {/* Room context */}
      <View style={styles.roomContext}>
        <Text style={styles.roomName}>{roomResult.roomName}</Text>
        <Text style={styles.roomStats}>
          {roomResult.walls.length} walls • {roomResult.doors.length} doors •{" "}
          {roomResult.windows.length} windows •{" "}
          {Math.round(roomResult.perimeterLF)} LF perimeter
        </Text>
      </View>

      {/* Checklist */}
      <ScrollView
        style={styles.checklist}
        contentContainerStyle={styles.checklistContent}
      >
        <Text style={styles.sectionTitle}>
          Capture close-up photos of each component
        </Text>
        <Text style={styles.sectionHint}>
          Photos will be analyzed by AI to identify profiles, materials, and
          finishes. Get within 6-12 inches for best results.
        </Text>

        {checklist.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.checkItem, item.captured && styles.checkItemDone]}
            onPress={() => capturePhoto(item)}
          >
            <Text style={styles.checkIcon}>
              {item.captured ? "✅" : item.icon}
            </Text>
            <View style={styles.checkInfo}>
              <Text
                style={[
                  styles.checkLabel,
                  item.captured && styles.checkLabelDone,
                ]}
              >
                {item.label}
              </Text>
              <Text style={styles.checkHint}>
                {item.captured ? "Tap to retake" : item.hint}
              </Text>
            </View>
            {item.photoUri && (
              <Image
                source={{ uri: item.photoUri }}
                style={styles.thumbnail}
              />
            )}
          </Pressable>
        ))}

        {/* Not all components present? Let user add more */}
        <Pressable
          style={styles.addButton}
          onPress={() => {
            Alert.alert(
              "Add Component",
              "Additional component types (shoe molding, quarter round) can be added after the initial Material Walk in the review screen.",
            );
          }}
        >
          <Text style={styles.addButtonText}>+ Add Other Component</Text>
        </Pressable>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        <Pressable
          style={[
            styles.completeButton,
            capturedCount === 0 && styles.completeButtonDisabled,
          ]}
          onPress={handleComplete}
          disabled={capturedCount === 0 || submitting}
        >
          <Text style={styles.completeButtonText}>
            {submitting
              ? "Processing…"
              : capturedCount === totalCount
                ? `Analyze ${capturedCount} Components`
                : `Analyze ${capturedCount} of ${totalCount} (partial)`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  link: {
    color: colors.primaryLight,
    fontSize: 16,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.borderMuted,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.success,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  roomContext: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
  },
  roomName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  roomStats: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checklist: {
    flex: 1,
  },
  checklistContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    marginBottom: 8,
  },
  checkItemDone: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  checkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  checkInfo: {
    flex: 1,
  },
  checkLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  checkLabelDone: {
    color: colors.success,
  },
  checkHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginLeft: 10,
  },
  addButton: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 14,
    color: colors.primaryLight,
    fontWeight: "500",
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    backgroundColor: colors.background,
  },
  completeButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  completeButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  completeButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
});
