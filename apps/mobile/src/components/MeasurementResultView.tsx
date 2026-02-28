import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  Dimensions,
} from "react-native";
import { colors } from "../theme/colors";
import type { ARMeasurement } from "../../modules/nexus-ar-measure";

const SCREEN_WIDTH = Dimensions.get("window").width;

export function MeasurementResultView({
  measurements,
  screenshotUri,
  usedLiDAR,
  labels: initialLabels,
  onSave,
  onNewMeasurement,
  onClose,
}: {
  measurements: ARMeasurement[];
  screenshotUri: string | null;
  usedLiDAR: boolean;
  labels?: Record<string, string>;
  onSave: (labels: Record<string, string>) => void;
  onNewMeasurement: () => void;
  onClose: () => void;
}) {
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels ?? {});
  const [saved, setSaved] = useState(false);

  const updateLabel = (id: string, text: string) => {
    setLabels((prev) => ({ ...prev, [id]: text }));
  };

  const handleSave = () => {
    onSave(labels);
    setSaved(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Screenshot */}
      {screenshotUri && (
        <Image
          source={{ uri: screenshotUri }}
          style={styles.screenshot}
          resizeMode="cover"
        />
      )}

      {/* Header badges */}
      <View style={styles.badgesRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Mode</Text>
          <Text style={styles.badgeValue}>
            {usedLiDAR ? "📐 LiDAR" : "📷 AR"}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Measurements</Text>
          <Text style={styles.badgeValue}>{measurements.length}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Accuracy</Text>
          <Text style={styles.badgeValue}>
            {usedLiDAR ? "±1 in" : "±3 in"}
          </Text>
        </View>
      </View>

      {/* Measurement list */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Measurements</Text>
        {measurements.map((m, i) => (
          <View key={m.id} style={styles.measurementRow}>
            <View style={styles.measurementHeader}>
              <Text style={styles.measurementIndex}>#{i + 1}</Text>
              <Text style={styles.measurementValue}>{m.distanceFormatted}</Text>
              <Text style={styles.measurementMetric}>
                ({m.distanceMeters.toFixed(2)}m)
              </Text>
            </View>
            <TextInput
              style={styles.labelInput}
              placeholder="Add label (e.g. North wall, Window W)"
              placeholderTextColor={colors.textMuted}
              value={labels[m.id] ?? ""}
              onChangeText={(text) => updateLabel(m.id, text)}
            />
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, saved && styles.actionBtnSaved]}
          onPress={handleSave}
        >
          <Text style={styles.actionBtnText}>
            {saved ? "✓ Saved to Project" : "Save to Project"}
          </Text>
        </Pressable>
        <View style={styles.secondaryActions}>
          <Pressable style={styles.actionBtnSecondary} onPress={onNewMeasurement}>
            <Text style={styles.actionBtnSecondaryText}>Measure More</Text>
          </Pressable>
          <Pressable style={styles.actionBtnSecondary} onPress={onClose}>
            <Text style={styles.actionBtnSecondaryText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },

  screenshot: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.65,
    backgroundColor: colors.backgroundSecondary,
  },

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

  // Measurements
  measurementRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  measurementHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  measurementIndex: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    width: 28,
  },
  measurementValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  measurementMetric: {
    fontSize: 13,
    color: colors.textMuted,
  },
  labelInput: {
    marginTop: 6,
    marginLeft: 28,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.backgroundSecondary,
  },

  // Actions
  actions: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  actionBtn: {
    backgroundColor: colors.buttonPrimary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnSaved: {
    backgroundColor: colors.success,
  },
  actionBtnText: {
    color: colors.buttonPrimaryText,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
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
