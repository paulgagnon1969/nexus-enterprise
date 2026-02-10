import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { compressImage, rotateImage } from "../utils/image";
import type { CompressionLevel } from "../utils/image";
import { DocumentScanner } from "./DocumentScanner";

export interface CapturedPhoto {
  uri: string;
  name: string;
  mimeType: string;
}

interface PhotoCaptureProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (photos: CapturedPhoto[]) => void;
  maxPhotos?: number;
  allowMultiple?: boolean;
  defaultCompression?: CompressionLevel;
}

export function PhotoCapture({
  visible,
  onClose,
  onCapture,
  maxPhotos = 10,
  allowMultiple = true,
  defaultCompression = "medium",
}: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [compression, setCompression] = useState<CompressionLevel>(defaultCompression);
  const [processing, setProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const compressionOptions: { level: CompressionLevel; label: string; desc: string }[] = [
    { level: "high", label: "High", desc: "Smallest file, lower quality" },
    { level: "medium", label: "Medium", desc: "Balanced quality & size" },
    { level: "low", label: "Low", desc: "Better quality, larger file" },
    { level: "original", label: "Original", desc: "Full quality, largest file" },
  ];

  const handleTakePhoto = async () => {
    if (photos.length >= maxPhotos) return;

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setProcessing(true);
    try {
      const asset = result.assets[0];
      const compressed = await compressImage(asset.uri, compression);

      const fileName = `photo_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}.jpg`;

      setPhotos((prev) => [
        ...prev,
        { uri: compressed.uri, name: fileName, mimeType: "image/jpeg" },
      ]);
    } finally {
      setProcessing(false);
    }
  };

  const handlePickFromLibrary = async () => {
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: allowMultiple,
      selectionLimit: remaining,
    });

    if (result.canceled || !result.assets?.length) return;

    setProcessing(true);
    try {
      const newPhotos: CapturedPhoto[] = [];

      for (const asset of result.assets) {
        const compressed = await compressImage(asset.uri, compression);
        const fileName = `photo_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}.jpg`;

        newPhotos.push({
          uri: compressed.uri,
          name: fileName,
          mimeType: "image/jpeg",
        });
      }

      setPhotos((prev) => [...prev, ...newPhotos].slice(0, maxPhotos));
    } finally {
      setProcessing(false);
    }
  };

  const handleScanDocument = () => {
    setShowScanner(true);
  };

  const handleScannedDocument = (doc: CapturedPhoto) => {
    setPhotos((prev) => [...prev, doc].slice(0, maxPhotos));
    setShowScanner(false);
  };

  const handleRotatePhoto = async (index: number) => {
    const photo = photos[index];
    if (!photo) return;

    setProcessing(true);
    try {
      const rotated = await rotateImage(photo.uri, 90);
      setPhotos((prev) =>
        prev.map((p, i) => (i === index ? { ...p, uri: rotated.uri } : p))
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDone = () => {
    onCapture(photos);
    setPhotos([]);
    onClose();
  };

  const handleCancel = () => {
    setPhotos([]);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Add Photos</Text>
          <Pressable onPress={handleDone} disabled={photos.length === 0}>
            <Text
              style={[
                styles.doneText,
                photos.length === 0 && styles.doneTextDisabled,
              ]}
            >
              Done ({photos.length})
            </Text>
          </Pressable>
        </View>

        {/* Compression selector */}
        <View style={styles.compressionSection}>
          <Text style={styles.sectionLabel}>Compression</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {compressionOptions.map((opt) => (
              <Pressable
                key={opt.level}
                style={[
                  styles.compressionChip,
                  compression === opt.level && styles.compressionChipSelected,
                ]}
                onPress={() => setCompression(opt.level)}
              >
                <Text
                  style={
                    compression === opt.level
                      ? styles.compressionChipTextSelected
                      : styles.compressionChipText
                  }
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.compressionDesc}>
            {compressionOptions.find((o) => o.level === compression)?.desc}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={handleTakePhoto}
            disabled={processing || photos.length >= maxPhotos}
          >
            <Text style={styles.actionIcon}>📷</Text>
            <Text style={styles.actionLabel}>Camera</Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={handlePickFromLibrary}
            disabled={processing || photos.length >= maxPhotos}
          >
            <Text style={styles.actionIcon}>🖼️</Text>
            <Text style={styles.actionLabel}>Library</Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={handleScanDocument}
            disabled={processing || photos.length >= maxPhotos}
          >
            <Text style={styles.actionIcon}>📄</Text>
            <Text style={styles.actionLabel}>Scan Doc</Text>
          </Pressable>
        </View>

        {processing && (
          <View style={styles.processingBar}>
            <ActivityIndicator size="small" color="#111827" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}

        {/* Photo grid */}
        <ScrollView style={styles.photoGrid} contentContainerStyle={styles.photoGridContent}>
          {photos.map((photo, index) => (
            <View key={photo.uri} style={styles.photoCard}>
              <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
              <View style={styles.photoActions}>
                <Pressable
                  style={styles.photoActionBtn}
                  onPress={() => handleRotatePhoto(index)}
                >
                  <Text style={styles.photoActionText}>⟳</Text>
                </Pressable>
                <Pressable
                  style={[styles.photoActionBtn, styles.photoRemoveBtn]}
                  onPress={() => handleRemovePhoto(index)}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.photoName} numberOfLines={1}>
                {photo.name}
              </Text>
            </View>
          ))}

          {photos.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📸</Text>
              <Text style={styles.emptyText}>No photos yet</Text>
              <Text style={styles.emptyHint}>
                Use the buttons above to capture or select photos
              </Text>
            </View>
          )}
        </ScrollView>

        <Text style={styles.limitText}>
          {photos.length} / {maxPhotos} photos
        </Text>

        {/* Document Scanner Modal */}
        <DocumentScanner
          visible={showScanner}
          onClose={() => setShowScanner(false)}
          onCapture={handleScannedDocument}
          compressionLevel={compression}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  cancelText: {
    color: "#6b7280",
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  doneText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  doneTextDisabled: {
    color: "#d1d5db",
  },

  compressionSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  compressionChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: "#ffffff",
  },
  compressionChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  compressionChipText: {
    fontSize: 14,
    color: "#374151",
  },
  compressionChipTextSelected: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "600",
  },
  compressionDesc: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  actionButton: {
    alignItems: "center",
    padding: 12,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },

  processingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#f3f4f6",
  },
  processingText: {
    marginLeft: 8,
    color: "#374151",
    fontSize: 13,
  },

  photoGrid: {
    flex: 1,
  },
  photoGridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
  },
  photoCard: {
    width: "48%",
    margin: "1%",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  photoThumb: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#e5e7eb",
  },
  photoActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
    gap: 8,
  },
  photoActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  photoActionText: {
    fontSize: 16,
  },
  photoRemoveBtn: {
    backgroundColor: "#fee2e2",
  },
  photoRemoveText: {
    fontSize: 14,
    color: "#b91c1c",
    fontWeight: "700",
  },
  photoName: {
    fontSize: 11,
    color: "#6b7280",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },

  emptyState: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  emptyHint: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 40,
  },

  limitText: {
    textAlign: "center",
    padding: 12,
    fontSize: 13,
    color: "#6b7280",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
});
