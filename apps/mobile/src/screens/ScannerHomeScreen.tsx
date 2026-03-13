import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { colors } from "../theme/colors";
import { apiJson } from "../api/client";

type ScanRecord = {
  id: string;
  scanType: string;
  status: string;
  createdAt: string;
  asset?: { id: string; name: string; manufacturer?: string; model?: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
};

type PrecisionScanRecord = {
  id: string;
  status: string;
  name?: string | null;
  imageCount: number;
  createdAt: string;
  completedAt?: string | null;
  project?: { id: string; name: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  _count?: { images: number };
};

interface Props {
  onStartTagRead: () => void;
  onStartFleetOnboard: () => void;
  onStartObjectCapture: () => void;
  onStartPrecisionScan: () => void;
  onStartNexiEnroll: () => void;
  onOpenNexiCatalog: () => void;
  onStartPlacardScan: () => void;
  onViewPrecisionScan?: (scanId: string) => void;
}

const MODE_CARDS = [
  {
    key: "placard-scan",
    icon: "🔲",
    title: "Scan Placard",
    subtitle: "Scan a Nex-Plac QR code — instant verified asset lookup",
    color: "#0891B2",
  },
  {
    key: "tag-read",
    icon: "📷",
    title: "Read Tag",
    subtitle: "Photograph equipment nameplate — AI extracts identity",
    color: "#2563EB",
  },
  {
    key: "fleet-onboard",
    icon: "📋",
    title: "Fleet Onboard",
    subtitle: "Batch-create assets from a template with serial capture",
    color: "#059669",
  },
  {
    key: "object-capture",
    icon: "📐",
    title: "3D Scan",
    subtitle: "Apple Object Capture — get precise dimensions & 3D model",
    color: "#7C3AED",
  },
  {
    key: "precision-scan",
    icon: "🔬",
    title: "Precision Scan",
    subtitle: "NexCAD — engineering-grade 3D model, export to SketchUp & CAD",
    color: "#F97316",
  },
  {
    key: "nexi-enroll",
    icon: "🔍",
    title: "NEXI Capture",
    subtitle: "Scan once, recognize forever — create object fingerprints",
    color: "#D97706",
  },
  {
    key: "nexi-catalog",
    icon: "📚",
    title: "NEXI Catalog",
    subtitle: "Browse & manage your identified object library",
    color: "#92400E",
  },
] as const;

export function ScannerHomeScreen({ onStartTagRead, onStartFleetOnboard, onStartObjectCapture, onStartPrecisionScan, onStartNexiEnroll, onOpenNexiCatalog, onStartPlacardScan, onViewPrecisionScan }: Props) {
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([]);
  const [precisionScans, setPrecisionScans] = useState<PrecisionScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadScans = useCallback(async () => {
    try {
      const [assetScans, pScans] = await Promise.all([
        apiJson<ScanRecord[]>("/assets/scan?limit=10").catch(() => [] as ScanRecord[]),
        apiJson<PrecisionScanRecord[]>("/precision-scans").catch(() => [] as PrecisionScanRecord[]),
      ]);
      setRecentScans(assetScans);
      setPrecisionScans(pScans);
    } catch (err) {
      console.warn("[ScannerHome] Failed to load scans:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadScans();
  }, [loadScans]);

  const handleCardPress = (key: string) => {
    switch (key) {
      case "placard-scan":
        onStartPlacardScan();
        break;
      case "tag-read":
        onStartTagRead();
        break;
      case "fleet-onboard":
        onStartFleetOnboard();
        break;
      case "object-capture":
        onStartObjectCapture();
        break;
      case "precision-scan":
        onStartPrecisionScan();
        break;
      case "nexi-enroll":
        onStartNexiEnroll();
        break;
      case "nexi-catalog":
        onOpenNexiCatalog();
        break;
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const scanTypeLabel = (type: string) => {
    switch (type) {
      case "TAG_READ": return "Tag Read";
      case "OBJECT_CAPTURE": return "3D Scan";
      case "FLEET_ONBOARD": return "Fleet";
      default: return type;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "COMPLETE":
      case "COMPLETED": return "#059669";
      case "PROCESSING":
      case "DOWNLOADING":
      case "RECONSTRUCTING":
      case "CONVERTING":
      case "ANALYZING":
      case "UPLOADING": return "#D97706";
      case "FAILED": return "#DC2626";
      case "PENDING": return "#6B7280";
      default: return "#6B7280";
    }
  };

  const precisionStatusLabel = (status: string) => {
    switch (status) {
      case "PENDING": return "Queued";
      case "DOWNLOADING": return "Downloading";
      case "RECONSTRUCTING": return "Reconstructing";
      case "CONVERTING": return "Converting";
      case "ANALYZING": return "Analyzing";
      case "UPLOADING": return "Uploading";
      case "COMPLETED": return "Complete";
      case "FAILED": return "Failed";
      default: return status;
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      <Text style={styles.title}>Asset Scanner</Text>
      <Text style={styles.subtitle}>Scan equipment to add assets, capture dimensions, or onboard fleets</Text>

      {/* Mode cards */}
      <View style={styles.cardsContainer}>
        {MODE_CARDS.map((card) => (
          <Pressable
            key={card.key}
            style={[styles.card, { borderLeftColor: card.color }]}
            onPress={() => handleCardPress(card.key)}
          >
            <Text style={styles.cardIcon}>{card.icon}</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </Pressable>
        ))}
      </View>

      {/* Precision Scans */}
      {precisionScans.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Precision Scans</Text>
          {precisionScans.map((ps) => (
            <Pressable
              key={ps.id}
              style={styles.scanRow}
              onPress={() => onViewPrecisionScan?.(ps.id)}
            >
              <View style={styles.scanInfo}>
                <Text style={styles.scanType}>
                  {ps.name || `Precision Scan — ${ps.imageCount} images`}
                </Text>
                {ps.project && (
                  <Text style={styles.scanAsset}>{ps.project.name}</Text>
                )}
                <Text style={styles.scanDate}>
                  {formatDate(ps.createdAt)} · {ps.imageCount} images
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(ps.status) + "22" }]}>
                <Text style={[styles.statusText, { color: statusColor(ps.status) }]}>
                  {precisionStatusLabel(ps.status)}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {/* Recent asset scans */}
      <Text style={styles.sectionTitle}>Recent Scans</Text>
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
      ) : recentScans.length === 0 && precisionScans.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📸</Text>
          <Text style={styles.emptyText}>No scans yet. Use one of the modes above to get started.</Text>
        </View>
      ) : recentScans.length === 0 ? (
        <Text style={styles.emptySmall}>No asset scans yet.</Text>
      ) : (
        recentScans.map((scan) => (
          <View key={scan.id} style={styles.scanRow}>
            <View style={styles.scanInfo}>
              <Text style={styles.scanType}>{scanTypeLabel(scan.scanType)}</Text>
              {scan.asset ? (
                <Text style={styles.scanAsset}>
                  {scan.asset.manufacturer} {scan.asset.model} — {scan.asset.name}
                </Text>
              ) : null}
              <Text style={styles.scanDate}>{formatDate(scan.createdAt)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(scan.status) + "22" }]}>
              <Text style={[styles.statusText, { color: statusColor(scan.status) }]}>{scan.status}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "#94A3B8", fontSize: 14, marginBottom: 20 },
  cardsContainer: { gap: 12, marginBottom: 28 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  cardIcon: { fontSize: 28, marginRight: 14 },
  cardText: { flex: 1 },
  cardTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 2 },
  cardSubtitle: { color: "#94A3B8", fontSize: 13 },
  cardArrow: { color: "#64748B", fontSize: 24, fontWeight: "300" },
  sectionTitle: { color: "#CBD5E1", fontSize: 14, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 },
  emptyState: { alignItems: "center", paddingVertical: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: "#64748B", fontSize: 14, textAlign: "center" },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  scanInfo: { flex: 1 },
  scanType: { color: "#fff", fontSize: 15, fontWeight: "600" },
  scanAsset: { color: "#94A3B8", fontSize: 13, marginTop: 2 },
  scanDate: { color: "#64748B", fontSize: 12, marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  emptySmall: { color: "#64748B", fontSize: 13, textAlign: "center", paddingVertical: 16 },
});
