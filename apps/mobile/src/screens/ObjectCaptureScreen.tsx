import React, { useState, useEffect } from "react";
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
} from "react-native";
import { requireNativeModule } from "expo-modules-core";
import * as FileSystem from "expo-file-system";
import { colors } from "../theme/colors";
import { apiFetch, apiJson } from "../api/client";

// Lazy-load native module (graceful fallback if not available)
let NexusObjectCapture: {
  isSupported: () => Promise<boolean>;
  startCapture: () => Promise<{
    modelPath: string;
    thumbnailPath?: string;
    dimensions?: {
      length: number;
      width: number;
      height: number;
      unit: string;
      lengthMeters: number;
      widthMeters: number;
      heightMeters: number;
    };
    boundingBox?: { min: number[]; max: number[] };
  }>;
  getDeviceCapabilities: () => Promise<{
    hasLiDAR: boolean;
    supportsObjectCapture: boolean;
    iosVersion: string;
  }>;
} | null = null;

try {
  NexusObjectCapture = requireNativeModule("NexusObjectCapture");
} catch {
  // Module not available (Android, or native not built yet)
}

interface Props {
  onBack: () => void;
  onAssetCreated?: (asset: any) => void;
}

type CaptureResult = {
  modelPath: string;
  thumbnailPath?: string;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
    lengthMeters: number;
    widthMeters: number;
    heightMeters: number;
  };
  boundingBox?: { min: number[]; max: number[] };
};

export function ObjectCaptureScreen({ onBack, onAssetCreated }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [uploading, setUploading] = useState(false);

  // Asset creation form
  const [name, setName] = useState("");
  const [isTemplate, setIsTemplate] = useState(true); // Default to template for 3D scans
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios" || !NexusObjectCapture) {
      setSupported(false);
      return;
    }
    NexusObjectCapture.isSupported().then(setSupported).catch(() => setSupported(false));
  }, []);

  const startCapture = async () => {
    if (!NexusObjectCapture) return;
    setCapturing(true);
    try {
      const result = await NexusObjectCapture.startCapture();
      setCaptureResult(result);

      // Auto-generate name if dimensions available
      if (result.dimensions) {
        const d = result.dimensions;
        setName(`Scanned Object (${d.length.toFixed(1)}×${d.width.toFixed(1)}×${d.height.toFixed(1)} ${d.unit})`);
      }
    } catch (err: any) {
      if (err?.code !== "CANCELLED") {
        Alert.alert("Capture Failed", err?.message || "Object capture failed.");
      }
    } finally {
      setCapturing(false);
    }
  };

  const uploadAndSave = async () => {
    if (!captureResult || !name.trim()) {
      Alert.alert("Name Required", "Enter a name for the asset.");
      return;
    }

    setUploading(true);
    try {
      // Upload model and thumbnail to API
      const formData = new FormData();

      // Attach USDZ model file
      if (captureResult.modelPath) {
        formData.append("model", {
          uri: captureResult.modelPath,
          name: "model.usdz",
          type: "model/vnd.usdz+zip",
        } as any);
      }

      // Attach thumbnail
      if (captureResult.thumbnailPath) {
        formData.append("thumbnail", {
          uri: captureResult.thumbnailPath,
          name: "thumbnail.jpg",
          type: "image/jpeg",
        } as any);
      }

      // Add dimensions as form field
      if (captureResult.dimensions) {
        formData.append("dimensions", JSON.stringify(captureResult.dimensions));
      }

      if (captureResult.boundingBox) {
        formData.append("boundingBox", JSON.stringify(captureResult.boundingBox));
      }

      const res = await apiFetch("/assets/scan/object-capture", {
        method: "POST",
        body: formData,
        _skipRetry: true,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }

      const scan = await res.json() as { id: string };

      // Now create the asset from the scan
      setSaving(true);
      const asset = await apiJson<any>("/assets/scan/create-from-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: scan.id,
          name: name.trim(),
          isTemplate,
          dimensions: captureResult.dimensions,
        }),
      });

      Alert.alert(
        isTemplate ? "Template Created" : "Asset Created",
        `${asset.name} has been added to your inventory.`,
      );
      onAssetCreated?.(asset);
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to upload scan.");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const dims = captureResult?.dimensions;

  // Unsupported device
  if (supported === false) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>3D Object Capture</Text>
        </View>
        <View style={styles.unsupported}>
          <Text style={styles.unsupportedIcon}>📐</Text>
          <Text style={styles.unsupportedTitle}>Not Supported</Text>
          <Text style={styles.unsupportedText}>
            3D Object Capture requires an iPhone 12 Pro or later with LiDAR sensor running iOS 17+.
            {Platform.OS === "android" ? "\n\nThis feature is only available on iOS." : ""}
          </Text>
          <Pressable style={styles.secondaryBtn} onPress={onBack}>
            <Text style={styles.secondaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Loading support check
  if (supported === null) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>3D Object Capture</Text>
      </View>

      {!captureResult ? (
        <>
          {/* Pre-capture tips */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Tips for Best Results</Text>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>💡</Text>
              <Text style={styles.tipText}>Good lighting — avoid harsh shadows</Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>🔄</Text>
              <Text style={styles.tipText}>Move slowly around the entire object</Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>📏</Text>
              <Text style={styles.tipText}>Keep 1-2 feet away for equipment-sized objects</Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>🎯</Text>
              <Text style={styles.tipText}>Capture all sides including top and bottom if possible</Text>
            </View>
          </View>

          <Pressable
            style={[styles.startBtn, capturing && styles.btnDisabled]}
            onPress={startCapture}
            disabled={capturing}
          >
            {capturing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.startBtnIcon}>📐</Text>
                <Text style={styles.startBtnText}>Start 3D Capture</Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <>
          {/* Capture results */}
          {dims && (
            <View style={styles.dimensionsCard}>
              <Text style={styles.dimensionsTitle}>Measured Dimensions</Text>
              <View style={styles.dimRow}>
                <View style={styles.dimItem}>
                  <Text style={styles.dimValue}>{dims.length.toFixed(1)}</Text>
                  <Text style={styles.dimLabel}>Length</Text>
                </View>
                <Text style={styles.dimSep}>×</Text>
                <View style={styles.dimItem}>
                  <Text style={styles.dimValue}>{dims.width.toFixed(1)}</Text>
                  <Text style={styles.dimLabel}>Width</Text>
                </View>
                <Text style={styles.dimSep}>×</Text>
                <View style={styles.dimItem}>
                  <Text style={styles.dimValue}>{dims.height.toFixed(1)}</Text>
                  <Text style={styles.dimLabel}>Height</Text>
                </View>
              </View>
              <Text style={styles.dimUnit}>{dims.unit}</Text>
            </View>
          )}

          {/* Asset form */}
          <Text style={styles.sectionTitle}>Save As</Text>
          <Text style={styles.fieldLabel}>Asset Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dri-Eaz LGR 3500i"
            placeholderTextColor="#64748B"
          />

          <Pressable style={styles.toggleRow} onPress={() => setIsTemplate(!isTemplate)}>
            <View style={[styles.checkbox, isTemplate && styles.checkboxChecked]}>
              {isTemplate && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View>
              <Text style={styles.toggleLabel}>Save as Template</Text>
              <Text style={styles.toggleHint}>Reference asset for fleet onboarding (dimensions carry over)</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, (uploading || saving) && styles.btnDisabled]}
            onPress={uploadAndSave}
            disabled={uploading || saving}
          >
            {uploading || saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Upload & Create Asset</Text>
            )}
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={() => setCaptureResult(null)}>
            <Text style={styles.secondaryBtnText}>Scan Again</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backBtn: { marginRight: 12 },
  backText: { color: "#60A5FA", fontSize: 17 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  tipsContainer: { backgroundColor: "#1E293B", borderRadius: 12, padding: 16, marginBottom: 20 },
  tipsTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  tipRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  tipIcon: { fontSize: 18, marginRight: 10, width: 24 },
  tipText: { color: "#94A3B8", fontSize: 14, flex: 1 },
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 16,
  },
  startBtnIcon: { fontSize: 22, marginRight: 10 },
  startBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  dimensionsCard: {
    backgroundColor: "#1E293B", borderRadius: 12, padding: 20,
    alignItems: "center", marginBottom: 20,
  },
  dimensionsTitle: { color: "#CBD5E1", fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 },
  dimRow: { flexDirection: "row", alignItems: "center" },
  dimItem: { alignItems: "center" },
  dimValue: { color: "#fff", fontSize: 28, fontWeight: "800" },
  dimLabel: { color: "#64748B", fontSize: 12, marginTop: 2 },
  dimSep: { color: "#475569", fontSize: 20, marginHorizontal: 12 },
  dimUnit: { color: "#94A3B8", fontSize: 14, marginTop: 8 },
  sectionTitle: { color: "#CBD5E1", fontSize: 14, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 },
  fieldLabel: { color: "#94A3B8", fontSize: 13, marginBottom: 4, marginTop: 10 },
  input: {
    backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#334155",
  },
  toggleRow: { flexDirection: "row", alignItems: "center", marginTop: 16, marginBottom: 8 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#475569",
    marginRight: 12, alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  toggleLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  toggleHint: { color: "#64748B", fontSize: 12 },
  primaryBtn: {
    backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 16,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { color: "#60A5FA", fontSize: 15 },
  unsupported: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  unsupportedIcon: { fontSize: 48, marginBottom: 16 },
  unsupportedTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  unsupportedText: { color: "#94A3B8", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
