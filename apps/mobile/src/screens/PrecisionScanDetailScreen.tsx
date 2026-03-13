import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
} from "react-native";
import { colors } from "../theme/colors";
import { apiJson, apiFetch } from "../api/client";

interface Props {
  scanId: string;
  onBack: () => void;
}

type PrecisionScanDetail = {
  id: string;
  status: string;
  name?: string | null;
  imageCount: number;
  meshJobId?: string | null;
  detailLevel?: string | null;
  error?: string | null;
  processingMs?: number | null;
  createdAt: string;
  completedAt?: string | null;
  usdzUrl?: string | null;
  objUrl?: string | null;
  daeUrl?: string | null;
  stlUrl?: string | null;
  gltfUrl?: string | null;
  glbUrl?: string | null;
  stepUrl?: string | null;
  skpUrl?: string | null;
  analysis?: {
    dimensions?: { length: number; width: number; height: number; unit: string };
    vertexCount?: number;
    faceCount?: number;
    surfaceArea?: number;
  } | null;
  project?: { id: string; name: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  PENDING: { label: "Queued", color: "#6B7280", icon: "⏳" },
  DOWNLOADING: { label: "Downloading", color: "#3B82F6", icon: "⬇️" },
  RECONSTRUCTING: { label: "Reconstructing", color: "#8B5CF6", icon: "🔧" },
  CONVERTING: { label: "Converting", color: "#8B5CF6", icon: "🔄" },
  ANALYZING: { label: "Analyzing", color: "#8B5CF6", icon: "🔬" },
  UPLOADING: { label: "Uploading", color: "#3B82F6", icon: "⬆️" },
  COMPLETED: { label: "Complete", color: "#059669", icon: "✅" },
  FAILED: { label: "Failed", color: "#DC2626", icon: "❌" },
};

const FORMAT_LABELS: { key: keyof PrecisionScanDetail; label: string; icon: string }[] = [
  { key: "usdzUrl", label: "USDZ (AR/Quick Look)", icon: "📱" },
  { key: "objUrl", label: "OBJ (Universal)", icon: "🧊" },
  { key: "glbUrl", label: "GLB (Web/glTF)", icon: "🌐" },
  { key: "gltfUrl", label: "glTF", icon: "🌐" },
  { key: "stlUrl", label: "STL (3D Print)", icon: "🖨️" },
  { key: "daeUrl", label: "DAE (Collada)", icon: "📐" },
  { key: "stepUrl", label: "STEP (CAD)", icon: "⚙️" },
  { key: "skpUrl", label: "SKP (SketchUp)", icon: "🏠" },
];

export function PrecisionScanDetailScreen({ scanId, onBack }: Props) {
  const [scan, setScan] = useState<PrecisionScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadScan = useCallback(async () => {
    try {
      const data = await apiJson<PrecisionScanDetail>(`/precision-scans/${scanId}`);
      setScan(data);
      return data;
    } catch (err) {
      console.warn("[PrecisionScanDetail] Failed to load:", err);
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scanId]);

  // Start polling for active scans
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const data = await loadScan();
      if (data && (data.status === "COMPLETED" || data.status === "FAILED")) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 4000);
  }, [loadScan]);

  useEffect(() => {
    loadScan().then((data) => {
      if (data && !["COMPLETED", "FAILED"].includes(data.status)) {
        startPolling();
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadScan, startPolling]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const updated = await apiJson<PrecisionScanDetail>(
        `/precision-scans/${scanId}/retrigger`,
        { method: "POST" },
      );
      setScan(updated);
      startPolling();
      Alert.alert("Scan Retriggered", "The scan has been re-queued for processing.");
    } catch (err: any) {
      Alert.alert("Retry Failed", err?.message || "Could not retrigger scan.");
    } finally {
      setRetrying(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadScan().then((data) => {
      if (data && !["COMPLETED", "FAILED"].includes(data.status) && !pollRef.current) {
        startPolling();
      }
    });
  }, [loadScan, startPolling]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!scan) {
    return (
      <View style={styles.container}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <View style={styles.errorState}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>Scan not found</Text>
        </View>
      </View>
    );
  }

  const statusInfo = STATUS_LABELS[scan.status] || { label: scan.status, color: "#6B7280", icon: "❓" };
  const isProcessing = !["COMPLETED", "FAILED"].includes(scan.status);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      {/* Header */}
      <Pressable onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>{scan.name || "Precision Scan"}</Text>

      {/* Status banner */}
      <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + "22", borderColor: statusInfo.color + "44" }]}>
        <Text style={styles.statusIcon}>{statusInfo.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusLabel, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          {isProcessing && (
            <Text style={styles.statusHint}>Processing — pull to refresh or wait for push notification</Text>
          )}
          {scan.error && <Text style={styles.errorDetail}>{scan.error}</Text>}
        </View>
        {isProcessing && <ActivityIndicator color={statusInfo.color} size="small" />}
      </View>

      {/* Metadata */}
      <View style={styles.metaSection}>
        <MetaRow label="Images" value={`${scan.imageCount}`} />
        <MetaRow label="Detail Level" value={scan.detailLevel || "full"} />
        <MetaRow label="Created" value={formatDate(scan.createdAt)} />
        {scan.completedAt && <MetaRow label="Completed" value={formatDate(scan.completedAt)} />}
        {scan.processingMs != null && <MetaRow label="Processing Time" value={formatDuration(scan.processingMs)} />}
        {scan.project && <MetaRow label="Project" value={scan.project.name} />}
        {scan.createdBy && (
          <MetaRow label="Created By" value={`${scan.createdBy.firstName} ${scan.createdBy.lastName}`} />
        )}
      </View>

      {/* Analysis results */}
      {scan.analysis && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Analysis</Text>
          {scan.analysis.dimensions && (
            <MetaRow
              label="Dimensions"
              value={`${scan.analysis.dimensions.length} × ${scan.analysis.dimensions.width} × ${scan.analysis.dimensions.height} ${scan.analysis.dimensions.unit}`}
            />
          )}
          {scan.analysis.vertexCount != null && (
            <MetaRow label="Vertices" value={scan.analysis.vertexCount.toLocaleString()} />
          )}
          {scan.analysis.faceCount != null && (
            <MetaRow label="Faces" value={scan.analysis.faceCount.toLocaleString()} />
          )}
          {scan.analysis.surfaceArea != null && (
            <MetaRow label="Surface Area" value={`${scan.analysis.surfaceArea.toFixed(2)} sq units`} />
          )}
        </View>
      )}

      {/* Download links */}
      {scan.status === "COMPLETED" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Download Formats</Text>
          {FORMAT_LABELS.map(({ key, label, icon }) => {
            const url = scan[key] as string | null | undefined;
            if (!url) return null;
            return (
              <Pressable
                key={key}
                style={styles.downloadRow}
                onPress={() => Linking.openURL(url)}
              >
                <Text style={styles.downloadIcon}>{icon}</Text>
                <Text style={styles.downloadLabel}>{label}</Text>
                <Text style={styles.downloadArrow}>↗</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Retry button for failed scans */}
      {scan.status === "FAILED" && (
        <Pressable
          style={[styles.retryBtn, retrying && styles.retryBtnDisabled]}
          onPress={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.retryText}>🔄 Retry Scan</Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 16, paddingBottom: 60 },
  backBtn: { marginBottom: 12 },
  backText: { color: "#60A5FA", fontSize: 16, fontWeight: "600" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 16 },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    gap: 12,
  },
  statusIcon: { fontSize: 24 },
  statusLabel: { fontSize: 16, fontWeight: "700" },
  statusHint: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  errorDetail: { color: "#FCA5A5", fontSize: 12, marginTop: 4 },

  metaSection: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
  },
  metaLabel: { color: "#94A3B8", fontSize: 13 },
  metaValue: { color: "#fff", fontSize: 13, fontWeight: "600" },

  section: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  downloadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
  },
  downloadIcon: { fontSize: 18, marginRight: 10 },
  downloadLabel: { color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 },
  downloadArrow: { color: "#60A5FA", fontSize: 16, fontWeight: "600" },

  retryBtn: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  retryBtnDisabled: { opacity: 0.6 },
  retryText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  errorState: { alignItems: "center", marginTop: 60 },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: { color: "#94A3B8", fontSize: 16 },
});
