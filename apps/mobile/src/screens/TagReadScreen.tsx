import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { apiFetch, apiJson } from "../api/client";

type Extraction = {
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  year: number | null;
  specs: Record<string, string>;
  confidence: number;
};

type ScanResult = {
  id: string;
  status: string;
  extractedData: Extraction | null;
  tagPhotoUrl: string | null;
};

interface Props {
  onBack: () => void;
  onAssetCreated?: (asset: any) => void;
}

export function TagReadScreen({ onBack, onAssetCreated }: Props) {
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Editable fields (populated from AI extraction)
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [year, setYear] = useState("");
  const [isTemplate, setIsTemplate] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickPhotos = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });

    if (!result.canceled && result.assets?.length) {
      setPhotos((prev) => [...prev, ...result.assets!].slice(0, 4));
    }
  }, []);

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAndAnalyze = async () => {
    if (!photos.length) {
      Alert.alert("No Photos", "Take at least one photo of the equipment tag.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      for (const photo of photos) {
        const uri = photo.uri;
        const filename = uri.split("/").pop() || "tag.jpg";
        const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
        const mimeType = ext === "png" ? "image/png" : "image/jpeg";

        formData.append("photos", {
          uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
          name: filename,
          type: mimeType,
        } as any);
      }

      const res = await apiFetch("/assets/scan/tag-read", {
        method: "POST",
        body: formData,
        _skipRetry: true,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }

      const scan = (await res.json()) as ScanResult;
      setScanResult(scan);

      // Populate editable fields from extraction
      const ext2 = scan.extractedData;
      if (ext2) {
        setManufacturer(ext2.manufacturer ?? "");
        setModel(ext2.model ?? "");
        setSerialNumber(ext2.serialNumber ?? "");
        setYear(ext2.year?.toString() ?? "");
        // Auto-generate a name
        const parts = [ext2.manufacturer, ext2.model].filter(Boolean);
        setName(parts.join(" ") || "Scanned Equipment");
      }
    } catch (err: any) {
      Alert.alert("Scan Failed", err?.message || "Could not analyze tag photos.");
    } finally {
      setUploading(false);
    }
  };

  const createAsset = async () => {
    if (!scanResult || !name.trim()) {
      Alert.alert("Name Required", "Enter a name for the asset.");
      return;
    }

    setSaving(true);
    try {
      const asset = await apiJson<any>("/assets/scan/create-from-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: scanResult.id,
          name: name.trim(),
          manufacturer: manufacturer.trim() || undefined,
          model: model.trim() || undefined,
          serialNumberOrVin: serialNumber.trim() || undefined,
          year: year ? parseInt(year, 10) : undefined,
          isTemplate,
        }),
      });

      Alert.alert("Asset Created", `${asset.name} has been added to your inventory.`);
      onAssetCreated?.(asset);
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to create asset.");
    } finally {
      setSaving(false);
    }
  };

  const extraction = scanResult?.extractedData;
  const confidence = extraction?.confidence ?? 0;
  const confidenceColor = confidence >= 0.8 ? "#059669" : confidence >= 0.6 ? "#D97706" : "#DC2626";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Read Equipment Tag</Text>
      </View>

      {!scanResult ? (
        <>
          {/* Photo capture section */}
          <Text style={styles.instructions}>
            Take 1-4 photos of the equipment nameplate, data plate, or serial tag.
            Include close-ups of text for best results.
          </Text>

          <View style={styles.photosGrid}>
            {photos.map((photo, i) => (
              <View key={i} style={styles.photoContainer}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <Pressable style={styles.removeBtn} onPress={() => removePhoto(i)}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              </View>
            ))}
            {photos.length < 4 && (
              <Pressable style={styles.addPhotoBtn} onPress={pickPhotos}>
                <Text style={styles.addPhotoIcon}>📷</Text>
                <Text style={styles.addPhotoText}>
                  {photos.length === 0 ? "Take Photo" : "Add More"}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.primaryBtn, !photos.length && styles.btnDisabled]}
            onPress={uploadAndAnalyze}
            disabled={!photos.length || uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Analyze Tag with AI</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          {/* Extraction results */}
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>AI Confidence:</Text>
            <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor + "22" }]}>
              <Text style={[styles.confidenceValue, { color: confidenceColor }]}>
                {Math.round(confidence * 100)}%
              </Text>
            </View>
          </View>

          {/* Extracted specs */}
          {extraction?.specs && Object.keys(extraction.specs).length > 0 && (
            <View style={styles.specsContainer}>
              <Text style={styles.specsTitle}>Extracted Specs</Text>
              {Object.entries(extraction.specs).map(([key, val]) => (
                <View key={key} style={styles.specRow}>
                  <Text style={styles.specKey}>{key}</Text>
                  <Text style={styles.specVal}>{val}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Editable fields */}
          <Text style={styles.sectionTitle}>Review & Edit</Text>
          <Text style={styles.fieldLabel}>Asset Name *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Dri-Eaz LGR 3500i" placeholderTextColor="#64748B" />

          <Text style={styles.fieldLabel}>Manufacturer</Text>
          <TextInput style={styles.input} value={manufacturer} onChangeText={setManufacturer} placeholder="Brand" placeholderTextColor="#64748B" />

          <Text style={styles.fieldLabel}>Model</Text>
          <TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="Model number" placeholderTextColor="#64748B" />

          <Text style={styles.fieldLabel}>Serial Number</Text>
          <TextInput style={styles.input} value={serialNumber} onChangeText={setSerialNumber} placeholder="S/N" placeholderTextColor="#64748B" />

          <Text style={styles.fieldLabel}>Year</Text>
          <TextInput style={styles.input} value={year} onChangeText={setYear} placeholder="2024" placeholderTextColor="#64748B" keyboardType="number-pad" />

          {/* Template toggle */}
          <Pressable style={styles.toggleRow} onPress={() => setIsTemplate(!isTemplate)}>
            <View style={[styles.checkbox, isTemplate && styles.checkboxChecked]}>
              {isTemplate && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View>
              <Text style={styles.toggleLabel}>Save as Template</Text>
              <Text style={styles.toggleHint}>Use this as a template for fleet onboarding</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={createAsset}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {isTemplate ? "Create Template Asset" : "Create Asset"}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => { setScanResult(null); setPhotos([]); }}
          >
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
  instructions: { color: "#94A3B8", fontSize: 14, marginBottom: 16, lineHeight: 20 },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  photoContainer: { position: "relative" },
  photoThumb: { width: 80, height: 80, borderRadius: 8 },
  removeBtn: {
    position: "absolute", top: -6, right: -6, backgroundColor: "#DC2626",
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
  },
  removeBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  addPhotoBtn: {
    width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderColor: "#334155",
    borderStyle: "dashed", alignItems: "center", justifyContent: "center",
  },
  addPhotoIcon: { fontSize: 24 },
  addPhotoText: { color: "#64748B", fontSize: 10, marginTop: 2 },
  primaryBtn: {
    backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { color: "#60A5FA", fontSize: 15 },
  confidenceRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  confidenceLabel: { color: "#94A3B8", fontSize: 14, marginRight: 8 },
  confidenceBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  confidenceValue: { fontSize: 14, fontWeight: "700" },
  specsContainer: { backgroundColor: "#1E293B", borderRadius: 10, padding: 14, marginBottom: 20 },
  specsTitle: { color: "#CBD5E1", fontSize: 13, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  specRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  specKey: { color: "#94A3B8", fontSize: 13, textTransform: "capitalize" },
  specVal: { color: "#fff", fontSize: 13, fontWeight: "500" },
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
  checkboxChecked: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  toggleLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  toggleHint: { color: "#64748B", fontSize: 12 },
});
