import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { requireNativeModule } from "expo-modules-core";
import * as FileSystem from "expo-file-system";
import { colors } from "../theme/colors";
import { apiFetch, apiJson } from "../api/client";

// Lazy-load native module
let NexusObjectCapture: {
  isSupported: () => Promise<boolean>;
  startPrecisionCapture: () => Promise<{
    imagePaths: string[];
    imageCount: number;
    totalSizeBytes: number;
    persistentDir: string;
  }>;
} | null = null;

try {
  NexusObjectCapture = requireNativeModule("NexusObjectCapture");
} catch {
  // Not available
}

interface Props {
  onBack: () => void;
  projectId?: string;
}

type ScanStatus =
  | "idle"
  | "capturing"
  | "uploading"
  | "creating"
  | "processing"
  | "completed"
  | "failed";

type PrecisionScanResult = {
  id: string;
  status: string;
  meshJobId?: string;
  imageCount: number;
  objUrl?: string;
  daeUrl?: string;
  stlUrl?: string;
  gltfUrl?: string;
  glbUrl?: string;
  stepUrl?: string;
  skpUrl?: string;
  usdzUrl?: string;
  analysis?: {
    dimensions?: { length: number; width: number; height: number; unit: string };
    vertexCount?: number;
    faceCount?: number;
    dominantPlanes?: number;
    surfaceArea?: number;
  };
  processingMs?: number;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Queued — waiting for NexBridge...",
  DOWNLOADING: "Downloading images to Mac Studio...",
  RECONSTRUCTING: "Reconstructing 3D model (full detail)...",
  CONVERTING: "Converting to CAD formats...",
  ANALYZING: "Analyzing mesh geometry...",
  UPLOADING: "Uploading results...",
  COMPLETED: "Complete!",
  FAILED: "Processing failed",
};

export function PrecisionScanScreen({ onBack, projectId }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [statusDetail, setStatusDetail] = useState("");
  const [name, setName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scanResult, setScanResult] = useState<PrecisionScanResult | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !NexusObjectCapture) {
      setSupported(false);
      return;
    }
    NexusObjectCapture.isSupported().then(setSupported).catch(() => setSupported(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll for scan status while processing
  const startPolling = useCallback((scanId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const scan = await apiJson<PrecisionScanResult>(`/precision-scans/${scanId}`);
        setScanResult(scan);
        setStatusDetail(STATUS_LABELS[scan.status] || scan.status);

        if (scan.status === "COMPLETED") {
          setStatus("completed");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (scan.status === "FAILED") {
          setStatus("failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Keep polling
      }
    }, 3000);
  }, []);

  const startCapture = async () => {
    if (!NexusObjectCapture) return;
    setStatus("capturing");
    setStatusDetail("Move slowly around the object...");

    try {
      const result = await NexusObjectCapture.startPrecisionCapture();
      setCapturedImages(result.imagePaths);
      setStatusDetail(
        `Captured ${result.imageCount} images (${Math.round(result.totalSizeBytes / 1024 / 1024)}MB)`,
      );

      // Auto-generate name
      if (!name) setName(`Precision Scan — ${result.imageCount} images`);

      // Upload images to API
      setStatus("uploading");
      setStatusDetail("Uploading images to server...");

      const imageUrls: string[] = [];
      for (let i = 0; i < result.imagePaths.length; i++) {
        const path = result.imagePaths[i];
        const formData = new FormData();
        formData.append("file", {
          uri: path,
          name: `img_${String(i).padStart(4, "0")}.heic`,
          type: "image/heic",
        } as any);

        const res = await apiFetch("/uploads/precision-scan-image", {
          method: "POST",
          body: formData,
          _skipRetry: true,
        });

        if (!res.ok) throw new Error(`Upload failed for image ${i}: ${res.status}`);
        const { url } = (await res.json()) as { url: string };
        imageUrls.push(url);

        setUploadProgress(Math.round(((i + 1) / result.imagePaths.length) * 100));
        setStatusDetail(
          `Uploading ${i + 1}/${result.imagePaths.length} images (${uploadProgress}%)...`,
        );
      }

      // Create precision scan job
      setStatus("creating");
      setStatusDetail("Creating scan job...");

      const scan = await apiJson<PrecisionScanResult>("/precision-scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name.trim() || undefined,
          detailLevel: "full",
          imageUrls,
        }),
      });

      setScanResult(scan);
      setStatus("processing");
      setStatusDetail(STATUS_LABELS[scan.status] || "Processing...");

      // Start polling for updates
      startPolling(scan.id);

      // Clean up local images
      try {
        await FileSystem.deleteAsync(result.persistentDir, { idempotent: true });
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      if (err?.code === "CANCELLED") {
        setStatus("idle");
        setStatusDetail("");
        return;
      }
      setStatus("failed");
      setStatusDetail(err?.message || "Capture failed");
      Alert.alert("Error", err?.message || "Precision capture failed.");
    }
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open file"));
  };

  // Unsupported device
  if (supported === false) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Precision Scan</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🔬</Text>
          <Text style={styles.emptyTitle}>Not Supported</Text>
          <Text style={styles.emptyText}>
            Precision Scan requires an iPhone 12 Pro or later with LiDAR sensor running iOS 17+.
            {Platform.OS === "android" ? "\n\nThis feature is only available on iOS." : ""}
          </Text>
        </View>
      </View>
    );
  }

  // Loading
  if (supported === null) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const dims = scanResult?.analysis?.dimensions;
  const hasFormats =
    scanResult?.objUrl ||
    scanResult?.skpUrl ||
    scanResult?.daeUrl ||
    scanResult?.stlUrl ||
    scanResult?.gltfUrl ||
    scanResult?.stepUrl;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Precision Scan</Text>
        <View style={styles.precisionBadge}>
          <Text style={styles.precisionBadgeText}>NexCAD</Text>
        </View>
      </View>

      {status === "idle" && (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How It Works</Text>
            <Text style={styles.infoText}>
              1. Capture 80-120 photos by orbiting the object{"\n"}
              2. Images upload to your Mac Studio{"\n"}
              3. NexMESH reconstructs a full-detail 3D model{"\n"}
              4. Download in SketchUp, OBJ, STL, STEP, Collada, glTF
            </Text>
          </View>

          <Text style={styles.fieldLabel}>Scan Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Kitchen faucet assembly"
            placeholderTextColor="#64748B"
          />

          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Tips for Precision</Text>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>🔄</Text>
              <Text style={styles.tipText}>
                Complete 2-3 full orbits at different heights
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.tipText}>
                Even diffuse lighting — avoid harsh directional light
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>📏</Text>
              <Text style={styles.tipText}>
                Stay 1-3 feet from the object, capture all sides + top
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>⏱️</Text>
              <Text style={styles.tipText}>
                Processing takes 2-5 min on Mac Studio after upload
              </Text>
            </View>
          </View>

          <Pressable style={styles.startBtn} onPress={startCapture}>
            <Text style={styles.startBtnIcon}>🔬</Text>
            <Text style={styles.startBtnText}>Start Precision Capture</Text>
          </Pressable>
        </>
      )}

      {(status === "capturing" ||
        status === "uploading" ||
        status === "creating" ||
        status === "processing") && (
        <View style={styles.progressCard}>
          <ActivityIndicator color="#F97316" size="large" style={{ marginBottom: 16 }} />
          <Text style={styles.progressTitle}>
            {status === "capturing"
              ? "Capturing..."
              : status === "uploading"
                ? "Uploading Images"
                : status === "creating"
                  ? "Creating Scan Job"
                  : "Processing on Mac Studio"}
          </Text>
          <Text style={styles.progressDetail}>{statusDetail}</Text>

          {status === "uploading" && (
            <View style={styles.progressBarOuter}>
              <View
                style={[styles.progressBarInner, { width: `${uploadProgress}%` }]}
              />
            </View>
          )}

          {status === "processing" && scanResult && (
            <Text style={styles.progressSub}>
              Job ID: {scanResult.meshJobId?.slice(0, 8)}...
            </Text>
          )}
        </View>
      )}

      {status === "completed" && scanResult && (
        <>
          {/* Dimensions */}
          {dims && (
            <View style={styles.dimensionsCard}>
              <Text style={styles.dimensionsTitle}>Measured Dimensions</Text>
              <View style={styles.dimRow}>
                <DimItem value={dims.length} label="Length" />
                <Text style={styles.dimSep}>×</Text>
                <DimItem value={dims.width} label="Width" />
                <Text style={styles.dimSep}>×</Text>
                <DimItem value={dims.height} label="Height" />
              </View>
              <Text style={styles.dimUnit}>{dims.unit}</Text>
            </View>
          )}

          {/* Mesh stats */}
          {scanResult.analysis && (
            <View style={styles.statsRow}>
              {scanResult.analysis.vertexCount != null && (
                <StatBadge
                  label="Vertices"
                  value={scanResult.analysis.vertexCount.toLocaleString()}
                />
              )}
              {scanResult.analysis.faceCount != null && (
                <StatBadge
                  label="Faces"
                  value={scanResult.analysis.faceCount.toLocaleString()}
                />
              )}
              {scanResult.processingMs != null && (
                <StatBadge
                  label="Time"
                  value={`${(scanResult.processingMs / 1000).toFixed(1)}s`}
                />
              )}
            </View>
          )}

          {/* Download links */}
          {hasFormats && (
            <View style={styles.formatsCard}>
              <Text style={styles.formatsTitle}>Download Formats</Text>
              {scanResult.skpUrl && (
                <FormatRow
                  icon="📐"
                  label="SketchUp (.skp)"
                  onPress={() => openUrl(scanResult.skpUrl!)}
                />
              )}
              {scanResult.objUrl && (
                <FormatRow
                  icon="🧊"
                  label="OBJ (.obj)"
                  onPress={() => openUrl(scanResult.objUrl!)}
                />
              )}
              {scanResult.daeUrl && (
                <FormatRow
                  icon="🔧"
                  label="Collada (.dae)"
                  onPress={() => openUrl(scanResult.daeUrl!)}
                />
              )}
              {scanResult.stepUrl && (
                <FormatRow
                  icon="⚙️"
                  label="STEP (.stp)"
                  onPress={() => openUrl(scanResult.stepUrl!)}
                />
              )}
              {scanResult.stlUrl && (
                <FormatRow
                  icon="🖨️"
                  label="STL (.stl)"
                  onPress={() => openUrl(scanResult.stlUrl!)}
                />
              )}
              {scanResult.gltfUrl && (
                <FormatRow
                  icon="🌐"
                  label="glTF (.gltf)"
                  onPress={() => openUrl(scanResult.gltfUrl!)}
                />
              )}
              {scanResult.glbUrl && (
                <FormatRow
                  icon="📦"
                  label="GLB (.glb)"
                  onPress={() => openUrl(scanResult.glbUrl!)}
                />
              )}
            </View>
          )}

          <Pressable style={styles.secondaryBtn} onPress={() => {
            setStatus("idle");
            setScanResult(null);
            setCapturedImages([]);
            setUploadProgress(0);
            setName("");
          }}>
            <Text style={styles.secondaryBtnText}>New Scan</Text>
          </Pressable>
        </>
      )}

      {status === "failed" && (
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Scan Failed</Text>
          <Text style={styles.errorDetail}>{statusDetail}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setStatus("idle");
              setScanResult(null);
              setStatusDetail("");
            }}
          >
            <Text style={styles.retryBtnText}>Try Again</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// Sub-components
function DimItem({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={styles.dimValue}>{value.toFixed(1)}</Text>
      <Text style={styles.dimLabel}>{label}</Text>
    </View>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FormatRow({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.formatRow} onPress={onPress}>
      <Text style={styles.formatIcon}>{icon}</Text>
      <Text style={styles.formatLabel}>{label}</Text>
      <Text style={styles.formatArrow}>↓</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { marginRight: 12 },
  backText: { color: "#60A5FA", fontSize: 17 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", flex: 1 },
  precisionBadge: {
    backgroundColor: "#F9731622",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#F97316",
  },
  precisionBadgeText: { color: "#F97316", fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  // Info card
  infoCard: { backgroundColor: "#1E293B", borderRadius: 12, padding: 16, marginBottom: 16 },
  infoTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  infoText: { color: "#94A3B8", fontSize: 13, lineHeight: 20 },

  // Tips
  tipsContainer: { backgroundColor: "#1E293B", borderRadius: 12, padding: 16, marginBottom: 20 },
  tipsTitle: { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  tipRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  tipIcon: { fontSize: 16, marginRight: 10, width: 22 },
  tipText: { color: "#94A3B8", fontSize: 13, flex: 1 },

  // Inputs
  fieldLabel: { color: "#94A3B8", fontSize: 13, marginBottom: 4, marginTop: 4 },
  input: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },

  // Start button
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 16,
  },
  startBtnIcon: { fontSize: 22, marginRight: 10 },
  startBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  // Progress
  progressCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  progressTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  progressDetail: { color: "#94A3B8", fontSize: 14, textAlign: "center" },
  progressSub: { color: "#475569", fontSize: 12, marginTop: 12 },
  progressBarOuter: {
    width: "100%",
    height: 6,
    backgroundColor: "#334155",
    borderRadius: 3,
    marginTop: 16,
    overflow: "hidden",
  },
  progressBarInner: {
    height: 6,
    backgroundColor: "#F97316",
    borderRadius: 3,
  },

  // Dimensions
  dimensionsCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  dimensionsTitle: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  dimRow: { flexDirection: "row", alignItems: "center" },
  dimValue: { color: "#fff", fontSize: 28, fontWeight: "800" },
  dimLabel: { color: "#64748B", fontSize: 12, marginTop: 2 },
  dimSep: { color: "#475569", fontSize: 20, marginHorizontal: 12 },
  dimUnit: { color: "#94A3B8", fontSize: 14, marginTop: 8 },

  // Stats
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  statBadge: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statLabel: { color: "#64748B", fontSize: 11, marginTop: 2 },

  // Formats
  formatsCard: { backgroundColor: "#1E293B", borderRadius: 12, padding: 16, marginBottom: 16 },
  formatsTitle: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  formatIcon: { fontSize: 18, marginRight: 12, width: 24 },
  formatLabel: { color: "#fff", fontSize: 15, flex: 1 },
  formatArrow: { color: "#60A5FA", fontSize: 18, fontWeight: "600" },

  // Secondary
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { color: "#60A5FA", fontSize: 15 },

  // Error
  errorCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { color: "#EF4444", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  errorDetail: { color: "#94A3B8", fontSize: 14, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Empty / unsupported
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptyText: { color: "#94A3B8", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
