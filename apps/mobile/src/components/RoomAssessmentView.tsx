import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Platform,
} from "react-native";
import { colors } from "../theme/colors";
import type { RoomScanResult, RoomAssessmentData } from "../api/roomScan";

const SCREEN_WIDTH = Dimensions.get("window").width;
const PHOTO_SIZE = SCREEN_WIDTH - 40;

/** Map condition score (1-10) to a label + color */
function conditionLabel(score?: number): { text: string; color: string } {
  if (score == null) return { text: "N/A", color: colors.textMuted };
  if (score >= 8) return { text: "Good", color: colors.success };
  if (score >= 5) return { text: "Fair", color: colors.warning };
  return { text: "Poor", color: colors.error };
}

export function RoomAssessmentView({
  scan,
  photos,
  onNewScan,
  onClose,
}: {
  scan: RoomScanResult;
  photos?: Array<{ uri: string; name: string; mimeType: string }>;
  onNewScan: () => void;
  onClose: () => void;
}) {
  const assessment = scan.assessmentJson as RoomAssessmentData | null;
  const [photoIndex, setPhotoIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Photo URLs from the scan result or local captures
  const photoUris: string[] = scan.photoUrls?.length
    ? scan.photoUrls
    : photos?.map((p) => p.uri) ?? [];

  if (!assessment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>
          {scan.status === "FAILED" ? "Scan Failed" : "Processing…"}
        </Text>
        {scan.errorMessage && <Text style={styles.errorBody}>{scan.errorMessage}</Text>}
        <Pressable style={styles.actionBtn} onPress={onNewScan}>
          <Text style={styles.actionBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const dims = assessment.estimatedDimensions;
  const overall = conditionLabel(assessment.overallCondition);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Photo carousel ─────────────────────────────────── */}
      {photoUris.length > 0 && (
        <View style={styles.photoSection}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / PHOTO_SIZE);
              setPhotoIndex(idx);
            }}
          >
            {photoUris.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={styles.photo}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          {photoUris.length > 1 && (
            <View style={styles.dots}>
              {photoUris.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === photoIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Header badges ──────────────────────────────────── */}
      <View style={styles.badgesRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Mode</Text>
          <Text style={styles.badgeValue}>
            {scan.scanMode === "LIDAR" ? "📐 LiDAR" : "📸 AI Vision"}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Confidence</Text>
          <Text style={styles.badgeValue}>
            {Math.round((assessment.confidence ?? 0) * 100)}%
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Condition</Text>
          <Text style={[styles.badgeValue, { color: overall.color }]}>{overall.text}</Text>
        </View>
      </View>

      {/* ── Room type + dimensions ─────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {assessment.roomType || "Room"}
        </Text>
        <View style={styles.dimGrid}>
          <DimCell label="Length" value={dims.lengthFt} unit="ft" />
          <DimCell label="Width" value={dims.widthFt} unit="ft" />
          <DimCell label="Height" value={dims.heightFt} unit="ft" />
          <DimCell label="Area" value={dims.sqFt} unit="sq ft" highlight />
        </View>
      </View>

      {/* ── Features (doors, windows, etc.) ────────────────── */}
      {assessment.features.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Features ({assessment.features.length})
          </Text>
          {assessment.features.map((f, i) => {
            const cond = conditionLabel(f.condition);
            return (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureHeader}>
                  <Text style={styles.featureType}>
                    {featureIcon(f.type)} {f.type}
                    {f.subType ? ` — ${f.subType}` : ""}
                  </Text>
                  <Text style={[styles.featureCondition, { color: cond.color }]}>
                    {cond.text}
                  </Text>
                </View>
                {(f.widthFt || f.heightFt) && (
                  <Text style={styles.featureDims}>
                    {f.widthFt ? `${f.widthFt}′W` : ""}
                    {f.widthFt && f.heightFt ? " × " : ""}
                    {f.heightFt ? `${f.heightFt}′H` : ""}
                  </Text>
                )}
                {f.location && (
                  <Text style={styles.featureLocation}>{f.location}</Text>
                )}
                {f.notes && <Text style={styles.featureNotes}>{f.notes}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Surfaces ───────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Surfaces</Text>
        {assessment.flooring && (
          <SurfaceRow
            label="Flooring"
            type={assessment.flooring.type}
            condition={assessment.flooring.condition}
          />
        )}
        {assessment.walls && (
          <SurfaceRow
            label="Walls"
            type={assessment.walls.material}
            condition={assessment.walls.condition}
          />
        )}
        {assessment.ceiling && (
          <SurfaceRow
            label="Ceiling"
            type={assessment.ceiling.type}
            condition={assessment.ceiling.condition}
          />
        )}
      </View>

      {/* ── Damage notes ───────────────────────────────────── */}
      {assessment.damageNotes && assessment.damageNotes.length > 0 && (
        <View style={[styles.card, styles.damageCard]}>
          <Text style={styles.cardTitle}>⚠️ Damage Notes</Text>
          {assessment.damageNotes.map((note, i) => (
            <Text key={i} style={styles.damageNote}>• {note}</Text>
          ))}
        </View>
      )}

      {/* ── Actions ────────────────────────────────────────── */}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={onNewScan}>
          <Text style={styles.actionBtnText}>Scan Another Room</Text>
        </Pressable>
        <Pressable style={styles.actionBtnSecondary} onPress={onClose}>
          <Text style={styles.actionBtnSecondaryText}>Done</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ── Small helper components ──────────────────────────────────

function DimCell({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value?: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.dimCell, highlight && styles.dimCellHighlight]}>
      <Text style={styles.dimValue}>
        {value != null ? value.toFixed(1) : "—"}
      </Text>
      <Text style={styles.dimUnit}>{unit}</Text>
      <Text style={styles.dimLabel}>{label}</Text>
    </View>
  );
}

function SurfaceRow({
  label,
  type,
  condition,
}: {
  label: string;
  type: string;
  condition?: number;
}) {
  const cond = conditionLabel(condition);
  return (
    <View style={styles.surfaceRow}>
      <Text style={styles.surfaceLabel}>{label}</Text>
      <Text style={styles.surfaceType}>{type}</Text>
      <Text style={[styles.surfaceCondition, { color: cond.color }]}>{cond.text}</Text>
    </View>
  );
}

function featureIcon(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("door")) return "🚪";
  if (t.includes("window")) return "🪟";
  if (t.includes("outlet") || t.includes("electric")) return "🔌";
  if (t.includes("light")) return "💡";
  if (t.includes("vent") || t.includes("hvac")) return "🌀";
  if (t.includes("closet") || t.includes("cabinet")) return "🗄️";
  return "📎";
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
    marginBottom: 20,
  },

  // Photos
  photoSection: { marginBottom: 12 },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE * 0.65,
    marginHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderMuted,
    marginHorizontal: 4,
  },
  dotActive: { backgroundColor: colors.primary },

  // Badges
  badgesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
  },
  badge: { alignItems: "center" },
  badgeLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  badgeValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },

  // Cards
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },

  // Dimensions grid
  dimGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dimCell: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 6,
  },
  dimCellHighlight: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
  },
  dimValue: { fontSize: 20, fontWeight: "700", color: colors.textPrimary },
  dimUnit: { fontSize: 11, color: colors.textMuted },
  dimLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Features
  featureRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  featureHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featureType: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  featureCondition: { fontSize: 13, fontWeight: "600" },
  featureDims: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  featureLocation: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  featureNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },

  // Surfaces
  surfaceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  surfaceLabel: {
    width: 70,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  surfaceType: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  surfaceCondition: { fontSize: 13, fontWeight: "600" },

  // Damage
  damageCard: { borderColor: colors.warningLight, backgroundColor: "#fffbeb" },
  damageNote: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },

  // Actions
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.buttonPrimary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnText: {
    color: colors.buttonPrimaryText,
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: colors.buttonSecondary,
    borderWidth: 1,
    borderColor: colors.buttonSecondaryBorder,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnSecondaryText: {
    color: colors.buttonSecondaryText,
    fontSize: 15,
    fontWeight: "700",
  },
});
