import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { colors } from "../theme/colors";
import { listPlanSets, getPlanSet, getSheetImageUrl } from "../api/planSheets";
import type {
  PlanSetListItem,
  PlanSetDetail,
  PlanSheetItem,
  ProjectListItem,
} from "../types/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const THUMB_COLS = 3;
const THUMB_GAP = 8;
const THUMB_SIZE = Math.floor(
  (SCREEN_WIDTH - 32 - THUMB_GAP * (THUMB_COLS - 1)) / THUMB_COLS,
);

export function PlanSheetsScreen({
  project,
  onBack,
  onOpenViewer,
}: {
  project: ProjectListItem;
  onBack: () => void;
  onOpenViewer: (params: {
    projectId: string;
    uploadId: string;
    sheets: PlanSheetItem[];
    initialIndex: number;
  }) => void;
}) {
  const [planSets, setPlanSets] = useState<PlanSetListItem[]>([]);
  const [selectedSet, setSelectedSet] = useState<PlanSetDetail | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load plan sets ──────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sets = await listPlanSets(project.id);
        setPlanSets(sets);

        // Auto-select if only one set
        if (sets.length === 1) {
          const detail = await getPlanSet(project.id, sets[0].id);
          setSelectedSet(detail);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id]);

  // ── Load thumbnails when a plan set is selected ─────────────────────────

  useEffect(() => {
    if (!selectedSet) return;
    const readySheets = selectedSet.planSheets.filter(
      (s) => s.status === "READY",
    );
    // Batch fetch thumb URLs
    for (const sheet of readySheets) {
      if (thumbUrls[sheet.id]) continue;
      getSheetImageUrl(selectedSet.projectId, selectedSet.id, sheet.id, "thumb")
        .then((res) => {
          setThumbUrls((prev) => ({ ...prev, [sheet.id]: res.url }));
        })
        .catch(() => {
          // Ignore — thumbnail will show fallback
        });
    }
  }, [selectedSet]);

  // ── Select a plan set ───────────────────────────────────────────────────

  const selectSet = useCallback(
    async (setId: string) => {
      setLoading(true);
      setError(null);
      try {
        const detail = await getPlanSet(project.id, setId);
        setSelectedSet(detail);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [project.id],
  );

  // ── Render: plan set list (when multiple sets exist and none selected) ──

  const renderSetList = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Plan Sets</Text>
      {planSets.map((s) => (
        <Pressable
          key={s.id}
          style={styles.setCard}
          onPress={() => selectSet(s.id)}
        >
          <Text style={styles.setFileName} numberOfLines={1}>
            {s.fileName || "Untitled Plan Set"}
          </Text>
          <Text style={styles.setMeta}>
            {s.sheetCount} sheet{s.sheetCount !== 1 ? "s" : ""} ·{" "}
            {s.pageCount ?? "?"} page{(s.pageCount ?? 0) !== 1 ? "s" : ""}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  // ── Render: sheet thumbnail grid ────────────────────────────────────────

  const renderSheetGrid = () => {
    if (!selectedSet) return null;
    const readySheets = selectedSet.planSheets.filter(
      (s) => s.status === "READY",
    );

    if (readySheets.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No sheets ready yet. Processing may still be in progress.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back to set list when multiple sets */}
        {planSets.length > 1 && (
          <Pressable onPress={() => setSelectedSet(null)}>
            <Text style={styles.backToSets}>← All Plan Sets</Text>
          </Pressable>
        )}

        <Text style={styles.sectionTitle} numberOfLines={1}>
          {selectedSet.fileName || "Plan Set"}
        </Text>
        <Text style={styles.sheetCount}>
          {readySheets.length} sheet{readySheets.length !== 1 ? "s" : ""}
        </Text>

        <View style={styles.grid}>
          {readySheets.map((sheet, idx) => (
            <Pressable
              key={sheet.id}
              style={styles.thumbCard}
              onPress={() =>
                onOpenViewer({
                  projectId: selectedSet.projectId,
                  uploadId: selectedSet.id,
                  sheets: readySheets,
                  initialIndex: idx,
                })
              }
            >
              {thumbUrls[sheet.id] ? (
                <Image
                  source={{ uri: thumbUrls[sheet.id] }}
                  style={styles.thumbImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <ActivityIndicator size="small" color={colors.secondary} />
                </View>
              )}
              <Text style={styles.thumbLabel} numberOfLines={1}>
                {sheet.sheetId || sheet.title || `Page ${sheet.pageNo}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Plan Sheets</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Breadcrumb */}
      <View style={styles.breadcrumb}>
        <Text style={styles.breadcrumbProject} numberOfLines={1}>
          {project.name}
        </Text>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading plan sheets…</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && planSets.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📐</Text>
          <Text style={styles.emptyText}>
            No plan sheets found for this project.
          </Text>
          <Text style={styles.emptySubtext}>
            Upload drawings and process them from the web app to view here.
          </Text>
        </View>
      )}

      {!loading &&
        !error &&
        planSets.length > 0 &&
        (selectedSet ? renderSheetGrid() : planSets.length > 1 ? renderSetList() : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  link: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: "600",
  },
  breadcrumb: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
  },
  breadcrumbProject: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sheetCount: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
  backToSets: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },

  // Plan set list
  setCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  setFileName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  setMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Thumbnail grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: THUMB_GAP,
  },
  thumbCard: {
    width: THUMB_SIZE,
    marginBottom: 8,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 0.75,
    borderRadius: 6,
    backgroundColor: colors.backgroundSecondary,
  },
  thumbPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 0.75,
    borderRadius: 6,
    backgroundColor: colors.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },

  // States
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 14,
  },
  errorContainer: {
    padding: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
});
