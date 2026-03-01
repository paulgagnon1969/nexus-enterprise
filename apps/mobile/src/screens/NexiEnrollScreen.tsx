import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { compressForNetwork } from "../utils/mediaCompressor";
import {
  isNexiSupported,
  extractMultipleFeaturePrints,
} from "../../modules/nexus-nexi";
import type { NexiFeaturePrint } from "../../modules/nexus-nexi";
import { addEntry, generateEntryId } from "../nexi/catalog";
import type { NexiCatalogEntry, NexiStoredPrint } from "../nexi/types";
import { NEXI_CATEGORIES, NEXI_MATERIALS } from "../nexi/types";

interface Props {
  onBack: () => void;
  onEnrolled?: (entry: NexiCatalogEntry) => void;
}

type Step = "CAPTURE" | "EXTRACTING" | "LABEL" | "SAVING";

const MAX_PHOTOS = 10;
const MIN_PHOTOS = 3;

export function NexiEnrollScreen({ onBack, onEnrolled }: Props) {
  const [step, setStep] = useState<Step>("CAPTURE");
  const [photos, setPhotos] = useState<Array<{ uri: string; name: string }>>([]);
  const [prints, setPrints] = useState<NexiFeaturePrint[]>([]);
  const [extractProgress, setExtractProgress] = useState("");

  // Labeling form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [material, setMaterial] = useState("");
  const [tags, setTags] = useState("");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  const supported = isNexiSupported();

  // ── Photo Capture ──────────────────────────────────────────

  const capturePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Needed", "Camera permission is required for NEXI enrollment.");
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (res.canceled || !res.assets?.[0]?.uri) return;

    const compressed = await compressForNetwork(res.assets[0].uri);
    setPhotos((prev) => [
      ...prev,
      { uri: compressed.uri, name: `nexi_${Date.now()}.jpg` },
    ]);
  }, []);

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Feature Print Extraction ───────────────────────────────

  const startExtraction = useCallback(async () => {
    if (photos.length < MIN_PHOTOS) {
      Alert.alert(
        "More Photos Needed",
        `Capture at least ${MIN_PHOTOS} photos from different angles for a reliable fingerprint.`,
      );
      return;
    }

    setStep("EXTRACTING");
    setExtractProgress(`Extracting fingerprints from ${photos.length} photos…`);

    try {
      const uris = photos.map((p) => p.uri);
      const result = await extractMultipleFeaturePrints(uris);

      if (result.totalExtracted === 0) {
        Alert.alert("Extraction Failed", "Could not extract fingerprints from any photos. Try with better lighting.");
        setStep("CAPTURE");
        return;
      }

      if (result.errors.length > 0) {
        console.warn("[NEXI] Some extractions failed:", result.errors);
      }

      setPrints(result.prints);
      setExtractProgress(
        `✓ ${result.totalExtracted}/${result.totalRequested} fingerprints extracted`,
      );
      setStep("LABEL");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
      setStep("CAPTURE");
    }
  }, [photos]);

  // ── Save to Catalog ────────────────────────────────────────

  const saveToCatalog = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Enter a name for this object.");
      return;
    }
    if (!category.trim()) {
      Alert.alert("Category Required", "Select or enter a category.");
      return;
    }

    setStep("SAVING");

    try {
      const entryId = generateEntryId();
      const now = new Date().toISOString();

      const entry: NexiCatalogEntry = {
        id: entryId,
        name: name.trim(),
        category: category.trim(),
        subcategory: subcategory.trim(),
        material: material.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        featurePrintCount: prints.length,
        thumbnailUri: null, // will be set by addEntry
        modelUri: null,
        dimensions: null,
        matchCount: 0,
        createdAt: now,
        updatedAt: now,
        synced: false,
      };

      const storedPrints: NexiStoredPrint[] = prints.map((p, i) => ({
        data: p.data,
        sourceImage: photos[i]?.name ?? `photo_${i}`,
        extractedAt: now,
      }));

      const saved = await addEntry(entry, storedPrints, photos[0]?.uri);

      Alert.alert(
        "NEXI Enrolled ✓",
        `"${saved.name}" saved with ${saved.featurePrintCount} fingerprints. It will now be recognized in future scans.`,
      );

      onEnrolled?.(saved);
      onBack();
    } catch (err) {
      Alert.alert("Save Failed", err instanceof Error ? err.message : String(err));
      setStep("LABEL");
    }
  }, [name, category, subcategory, material, tags, prints, photos, onBack, onEnrolled]);

  // ── Unsupported ────────────────────────────────────────────

  if (!supported) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack}><Text style={styles.backText}>‹ Back</Text></Pressable>
          <Text style={styles.title}>NEXI Capture</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.unsupportedIcon}>🔍</Text>
          <Text style={styles.unsupportedTitle}>Not Available</Text>
          <Text style={styles.unsupportedDesc}>
            NEXI requires iOS with Apple Vision framework.
            {Platform.OS === "android" ? "\n\nThis feature is only available on iOS." : ""}
          </Text>
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.title}>NEXI Capture</Text>
      </View>

      <Text style={styles.tagline}>Scan once, recognize forever</Text>

      {/* ── Step 1: Photo Capture ──────────────────────────── */}
      {step === "CAPTURE" && (
        <>
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>How to Enroll</Text>
            <Text style={styles.tipItem}>📸 Take {MIN_PHOTOS}–{MAX_PHOTOS} photos from different angles</Text>
            <Text style={styles.tipItem}>💡 Good, even lighting — avoid harsh shadows</Text>
            <Text style={styles.tipItem}>🎯 Fill the frame with the object</Text>
            <Text style={styles.tipItem}>🔄 Include front, back, sides, and top views</Text>
          </View>

          {/* Photo grid */}
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((photo, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImg} />
                  <Pressable style={styles.photoRemove} onPress={() => removePhoto(i)}>
                    <Text style={styles.photoRemoveText}>✕</Text>
                  </Pressable>
                  <Text style={styles.photoIndex}>{i + 1}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.photoCount}>
            {photos.length} / {MAX_PHOTOS} photos{" "}
            {photos.length < MIN_PHOTOS
              ? `(need ${MIN_PHOTOS - photos.length} more)`
              : "✓"}
          </Text>

          {photos.length < MAX_PHOTOS && (
            <Pressable style={styles.captureBtn} onPress={capturePhoto}>
              <Text style={styles.captureBtnIcon}>📷</Text>
              <Text style={styles.captureBtnText}>
                {photos.length === 0 ? "Take First Photo" : "Add Another Angle"}
              </Text>
            </Pressable>
          )}

          {photos.length >= MIN_PHOTOS && (
            <Pressable style={styles.primaryBtn} onPress={startExtraction}>
              <Text style={styles.primaryBtnText}>Extract Fingerprints →</Text>
            </Pressable>
          )}
        </>
      )}

      {/* ── Step 2: Extracting ─────────────────────────────── */}
      {step === "EXTRACTING" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.extractText}>{extractProgress}</Text>
          <Text style={styles.extractSub}>Processing on-device with Apple Vision…</Text>
        </View>
      )}

      {/* ── Step 3: Labeling ───────────────────────────────── */}
      {step === "LABEL" && (
        <>
          {/* Success badge */}
          <View style={styles.successBadge}>
            <Text style={styles.successText}>{extractProgress}</Text>
          </View>

          {/* Thumbnail preview */}
          {photos[0] && (
            <Image source={{ uri: photos[0].uri }} style={styles.labelThumb} />
          )}

          <Text style={styles.sectionTitle}>Identify This Object</Text>

          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dri-Eaz LGR 3500i"
            placeholderTextColor="#64748B"
          />

          <Text style={styles.fieldLabel}>Category *</Text>
          <Pressable
            style={styles.pickerBtn}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
          >
            <Text style={category ? styles.pickerValue : styles.pickerPlaceholder}>
              {category || "Select category…"}
            </Text>
            <Text style={styles.pickerArrow}>{showCategoryPicker ? "▲" : "▼"}</Text>
          </Pressable>
          {showCategoryPicker && (
            <View style={styles.pickerList}>
              {NEXI_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.pickerItem, category === cat && styles.pickerItemActive]}
                  onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, category === cat && styles.pickerItemTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.fieldLabel}>Subcategory</Text>
          <TextInput
            style={styles.input}
            value={subcategory}
            onChangeText={setSubcategory}
            placeholder="e.g. LGR, Folding, Industrial"
            placeholderTextColor="#64748B"
          />

          <Text style={styles.fieldLabel}>Material</Text>
          <Pressable
            style={styles.pickerBtn}
            onPress={() => setShowMaterialPicker(!showMaterialPicker)}
          >
            <Text style={material ? styles.pickerValue : styles.pickerPlaceholder}>
              {material || "Select material…"}
            </Text>
            <Text style={styles.pickerArrow}>{showMaterialPicker ? "▲" : "▼"}</Text>
          </Pressable>
          {showMaterialPicker && (
            <View style={styles.pickerList}>
              {NEXI_MATERIALS.map((mat) => (
                <Pressable
                  key={mat}
                  style={[styles.pickerItem, material === mat && styles.pickerItemActive]}
                  onPress={() => { setMaterial(mat); setShowMaterialPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, material === mat && styles.pickerItemTextActive]}>
                    {mat}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.fieldLabel}>Tags (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="e.g. equipment, restoration, portable"
            placeholderTextColor="#64748B"
          />

          <Pressable
            style={[styles.primaryBtn, (!name.trim() || !category.trim()) && styles.btnDisabled]}
            onPress={saveToCatalog}
            disabled={!name.trim() || !category.trim()}
          >
            <Text style={styles.primaryBtnText}>Save to NEXI Catalog</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={() => setStep("CAPTURE")}>
            <Text style={styles.secondaryBtnText}>← Retake Photos</Text>
          </Pressable>
        </>
      )}

      {/* ── Step 4: Saving ─────────────────────────────────── */}
      {step === "SAVING" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.extractText}>Saving to NEXI catalog…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  backText: { color: "#60A5FA", fontSize: 17, marginRight: 12 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  tagline: { color: "#D97706", fontSize: 13, fontWeight: "600", marginBottom: 16, letterSpacing: 0.5 },

  // Tips
  tipsCard: { backgroundColor: "#1E293B", borderRadius: 12, padding: 16, marginBottom: 16 },
  tipsTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 10 },
  tipItem: { color: "#94A3B8", fontSize: 13, lineHeight: 22 },

  // Photo grid
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  photoThumb: { width: 72, height: 72, borderRadius: 8, overflow: "hidden", position: "relative" },
  photoImg: { width: "100%", height: "100%", borderRadius: 8 },
  photoRemove: {
    position: "absolute", top: 2, right: 2,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10,
    width: 20, height: 20, alignItems: "center", justifyContent: "center",
  },
  photoRemoveText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  photoIndex: {
    position: "absolute", bottom: 2, left: 4,
    color: "#fff", fontSize: 10, fontWeight: "700",
    textShadowColor: "#000", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  photoCount: { color: "#94A3B8", fontSize: 13, textAlign: "center", marginBottom: 16 },

  // Buttons
  captureBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#1E293B", borderRadius: 10, paddingVertical: 14,
    borderWidth: 1, borderColor: "#334155", borderStyle: "dashed", marginBottom: 12,
  },
  captureBtnIcon: { fontSize: 20, marginRight: 8 },
  captureBtnText: { color: "#94A3B8", fontSize: 15, fontWeight: "600" },
  primaryBtn: {
    backgroundColor: "#D97706", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  secondaryBtnText: { color: "#60A5FA", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  // Extracting
  centered: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  extractText: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 16, textAlign: "center" },
  extractSub: { color: "#64748B", fontSize: 13, marginTop: 6 },

  // Success
  successBadge: {
    backgroundColor: "#14532D", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: "center", marginBottom: 16,
  },
  successText: { color: "#4ADE80", fontSize: 14, fontWeight: "600" },

  // Label form
  labelThumb: {
    width: 120, height: 120, borderRadius: 12, alignSelf: "center",
    marginBottom: 16, borderWidth: 2, borderColor: "#D97706",
  },
  sectionTitle: {
    color: "#CBD5E1", fontSize: 14, fontWeight: "600",
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 12,
  },
  fieldLabel: { color: "#94A3B8", fontSize: 13, marginBottom: 4, marginTop: 10 },
  input: {
    backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#334155",
  },

  // Picker
  pickerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: "#334155",
  },
  pickerValue: { color: "#fff", fontSize: 15 },
  pickerPlaceholder: { color: "#64748B", fontSize: 15 },
  pickerArrow: { color: "#64748B", fontSize: 12 },
  pickerList: {
    backgroundColor: "#1E293B", borderRadius: 8, borderWidth: 1, borderColor: "#334155",
    maxHeight: 200, marginTop: 4,
  },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1a2332" },
  pickerItemActive: { backgroundColor: "#D97706" + "22" },
  pickerItemText: { color: "#CBD5E1", fontSize: 14 },
  pickerItemTextActive: { color: "#D97706", fontWeight: "600" },

  // Unsupported
  unsupportedIcon: { fontSize: 48, marginBottom: 16 },
  unsupportedTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  unsupportedDesc: { color: "#94A3B8", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
