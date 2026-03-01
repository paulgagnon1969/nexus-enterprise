import React, { useState, useRef, useCallback, useEffect } from "react";
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
  FlatList,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { colors } from "../theme/colors";
import { apiFetch, apiJson } from "../api/client";
import { compressImage } from "../utils/image";
import { printPlacardLabel } from "../utils/placard-print";
import {
  TagReadDraft,
  getDrafts,
  saveDraft,
  deleteDraft,
} from "../storage/tag-drafts";

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

/** Upload original hi-res photos in the background after user verifies. Fire-and-forget. */
function uploadOriginalsInBackground(
  scanId: string,
  originalUris: string[],
) {
  (async () => {
    try {
      const formData = new FormData();
      for (const uri of originalUris) {
        const filename = uri.split("/").pop() || "original.jpg";
        const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
        const mimeType = ext === "png" ? "image/png" : "image/jpeg";
        formData.append("photos", {
          uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
          name: filename,
          type: mimeType,
        } as any);
      }

      await apiFetch(`/assets/scan/${scanId}/originals`, {
        method: "POST",
        body: formData,
        _skipRetry: true,
      });
      console.log(`[TagRead] Original photos uploaded for scan ${scanId}`);
    } catch (err: any) {
      // Non-blocking — originals are nice-to-have, not critical path
      console.warn(`[TagRead] Background original upload failed: ${err?.message}`);
    }
  })();
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
  const [createdAsset, setCreatedAsset] = useState<any>(null);
  const [assigningPlacard, setAssigningPlacard] = useState(false);

  // Draft system
  const [drafts, setDrafts] = useState<TagReadDraft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  // Load drafts on mount
  useEffect(() => {
    getDrafts().then(setDrafts).catch(() => {});
  }, []);

  const refreshDrafts = useCallback(async () => {
    const d = await getDrafts();
    setDrafts(d);
  }, []);

  /** Copy photo to app documents dir so it survives cache cleanup */
  const persistPhotoUri = async (uri: string): Promise<string> => {
    const dir = `${FileSystem.documentDirectory}tag-drafts/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const filename = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
    const dest = `${dir}${filename}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  };

  const handleBack = useCallback(async () => {
    // Nothing to save — just go back
    if (!photos.length && !name && !manufacturer && !model && !serialNumber) {
      onBack();
      return;
    }

    Alert.alert("Save Draft?", "You have unsaved work. Save as draft before leaving?", [
      { text: "Discard", style: "destructive", onPress: onBack },
      {
        text: "Save Draft",
        onPress: async () => {
          try {
            // Persist photos to documents dir
            const persistedUris = await Promise.all(photos.map((p) => persistPhotoUri(p.uri)));
            const label =
              [manufacturer, model].filter(Boolean).join(" ") ||
              name ||
              `${photos.length} photo${photos.length !== 1 ? "s" : ""}`;
            await saveDraft({
              photoUris: persistedUris,
              name,
              manufacturer,
              model,
              serialNumber,
              year,
              isTemplate,
              label,
            });
          } catch (err: any) {
            console.warn("[TagRead] Failed to save draft:", err?.message);
          }
          onBack();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [photos, name, manufacturer, model, serialNumber, year, isTemplate, onBack]);

  const resumeDraft = useCallback(async (draft: TagReadDraft) => {
    // Verify photos still exist on disk
    const validUris: string[] = [];
    for (const uri of draft.photoUris) {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) validUris.push(uri);
    }

    const assets: ImagePicker.ImagePickerAsset[] = validUris.map((uri) => ({
      uri,
      width: 0,
      height: 0,
      type: "image" as const,
    }));

    setPhotos(assets);
    setName(draft.name);
    setManufacturer(draft.manufacturer);
    setModel(draft.model);
    setSerialNumber(draft.serialNumber);
    setYear(draft.year);
    setIsTemplate(draft.isTemplate);
    setScanResult(null);
    setCreatedAsset(null);
    setActiveDraftId(draft.id);
    setShowDrafts(false);
  }, []);

  const handleDeleteDraft = useCallback(async (id: string) => {
    await deleteDraft(id);
    await refreshDrafts();
  }, [refreshDrafts]);

  const takePhoto = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
    });

    if (!result.canceled && result.assets?.length) {
      setPhotos((prev) => [...prev, ...result.assets!].slice(0, 4));
    }
  }, [photos.length]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
    });

    if (!result.canceled && result.assets?.length) {
      setPhotos((prev) => [...prev, ...result.assets!].slice(0, 4));
    }
  }, [photos.length]);

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
      // Compress photos for fast AI analysis (800px, quality 0.6)
      // Originals stay on-device until user verifies the extraction
      const formData = new FormData();
      for (const photo of photos) {
        const compressed = await compressImage(photo.uri, "high");
        const filename = compressed.uri.split("/").pop() || "tag.jpg";

        formData.append("photos", {
          uri: Platform.OS === "ios" ? compressed.uri.replace("file://", "") : compressed.uri,
          name: filename,
          type: "image/jpeg",
        } as any);
      }

      // 120s timeout — compressed images are small but GPT-4o still needs time
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const res = await apiFetch("/assets/scan/tag-read", {
        method: "POST",
        body: formData,
        signal: controller.signal,
        _skipRetry: true,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }

      const scan = (await res.json()) as ScanResult;
      setScanResult(scan);

      // Populate editable fields from extraction
      const ext = scan.extractedData;
      if (ext) {
        setManufacturer(ext.manufacturer ?? "");
        setModel(ext.model ?? "");
        setSerialNumber(ext.serialNumber ?? "");
        setYear(ext.year?.toString() ?? "");
        // Auto-generate a name
        const parts = [ext.manufacturer, ext.model].filter(Boolean);
        setName(parts.join(" ") || "Scanned Equipment");
      }
    } catch (err: any) {
      const msg = err?.name === "AbortError"
        ? "Analysis timed out. Try with fewer photos or better lighting."
        : err?.message || "Could not analyze tag photos.";
      Alert.alert("Scan Failed", msg);
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

      // Fire-and-forget: upload original hi-res photos for daily log / audit
      const originalUris = photos.map((p) => p.uri);
      uploadOriginalsInBackground(scanResult.id, originalUris);

      setCreatedAsset(asset);
      onAssetCreated?.(asset);

      // Clean up draft if we were resuming one
      if (activeDraftId) {
        deleteDraft(activeDraftId).catch(() => {});
        setActiveDraftId(null);
        refreshDrafts();
      }
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
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Read Equipment Tag</Text>
        {drafts.length > 0 && !showDrafts && (
          <Pressable
            style={styles.draftsBtn}
            onPress={() => setShowDrafts(true)}
          >
            <Text style={styles.draftsBtnText}>Drafts ({drafts.length})</Text>
          </Pressable>
        )}
      </View>

      {/* Drafts list */}
      {showDrafts ? (
        <View style={styles.draftsContainer}>
          <View style={styles.draftsHeader}>
            <Text style={styles.draftsTitle}>Saved Drafts</Text>
            <Pressable onPress={() => setShowDrafts(false)}>
              <Text style={styles.draftsClose}>✕ Close</Text>
            </Pressable>
          </View>
          {drafts.map((draft) => (
            <View key={draft.id} style={styles.draftRow}>
              <Pressable style={styles.draftInfo} onPress={() => resumeDraft(draft)}>
                {draft.photoUris.length > 0 && (
                  <Image source={{ uri: draft.photoUris[0] }} style={styles.draftThumb} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftLabel} numberOfLines={1}>
                    {draft.label}
                  </Text>
                  <Text style={styles.draftMeta}>
                    {draft.photoUris.length} photo{draft.photoUris.length !== 1 ? "s" : ""}
                    {" · "}
                    {new Date(draft.updatedAt).toLocaleDateString()}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.draftActions}>
                <Pressable
                  style={styles.draftResumeBtn}
                  onPress={() => resumeDraft(draft)}
                >
                  <Text style={styles.draftResumeBtnText}>Resume</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert("Delete Draft?", "This cannot be undone.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => handleDeleteDraft(draft.id),
                      },
                    ]);
                  }}
                >
                  <Text style={styles.draftDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : !scanResult ? (
        <>
          {/* Photo capture section */}
          <Text style={styles.instructions}>
            Capture or select 1-4 photos of the equipment nameplate, data plate, or serial tag.
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
              <>
                <Pressable style={styles.addPhotoBtn} onPress={takePhoto}>
                  <Text style={styles.addPhotoIcon}>📷</Text>
                  <Text style={styles.addPhotoText}>Camera</Text>
                </Pressable>
                <Pressable style={styles.addPhotoBtn} onPress={pickFromLibrary}>
                  <Text style={styles.addPhotoIcon}>🖼️</Text>
                  <Text style={styles.addPhotoText}>Library</Text>
                </Pressable>
              </>
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

      {/* Placard assignment after asset creation */}
      {createdAsset && (
        <View style={styles.placardOverlay}>
          <View style={styles.placardCard}>
            <Text style={styles.placardCardTitle}>Asset Created</Text>
            <Text style={styles.placardCardName}>{createdAsset.name}</Text>

            <Pressable
              style={[styles.primaryBtn, { marginTop: 16 }]}
              onPress={async () => {
                setAssigningPlacard(true);
                try {
                  const result = await apiJson<any>("/placards/assign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assetId: createdAsset.id }),
                  });
                  await printPlacardLabel({
                    qrDataUrl: result.qrDataUrl,
                    placardCode: result.placard.code,
                    assetName: result.asset.name,
                    manufacturer: result.asset.manufacturer,
                    model: result.asset.model,
                  });
                  Alert.alert("Placard Printed", `${result.placard.code} assigned and printed.`);
                  onBack();
                } catch (err: any) {
                  Alert.alert("Placard Error", err?.message || "Failed to assign placard.");
                } finally {
                  setAssigningPlacard(false);
                }
              }}
              disabled={assigningPlacard}
            >
              {assigningPlacard ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Assign Placard & Print Label</Text>
              )}
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={onBack}>
              <Text style={styles.secondaryBtnText}>Skip — Done</Text>
            </Pressable>
          </View>
        </View>
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
  placardOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  placardCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    alignItems: "center",
  },
  placardCardTitle: { color: "#059669", fontSize: 14, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  placardCardName: { color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  // Drafts button in header
  draftsBtn: {
    marginLeft: "auto",
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  draftsBtnText: { color: "#F59E0B", fontSize: 13, fontWeight: "700" },
  // Drafts list
  draftsContainer: { flex: 1 },
  draftsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  draftsTitle: { color: "#CBD5E1", fontSize: 16, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  draftsClose: { color: "#60A5FA", fontSize: 14 },
  draftRow: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  draftInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  draftThumb: { width: 48, height: 48, borderRadius: 6 },
  draftLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  draftMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  draftActions: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 8 },
  draftResumeBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  draftResumeBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  draftDeleteText: { color: "#DC2626", fontSize: 13 },
});
