import React, { useState, useEffect } from "react";
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
import { rotateImage } from "../utils/image";
import {
  compressForNetwork,
  getNetworkTier,
  getVideoQuality,
  generateVideoThumbnail,
  getFileSize,
  formatBytes,
  type NetworkTier,
} from "../utils/mediaCompressor";
import { getMediaQueueStatus } from "../offline/mediaQueue";
import { DocumentScanner } from "./DocumentScanner";

export interface CapturedPhoto {
  uri: string;
  name: string;
  mimeType: string;
  estimatedBytes?: number;
  mediaType?: "image" | "video";
  thumbnailUri?: string;
}

interface PhotoCaptureProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (photos: CapturedPhoto[]) => void;
  maxPhotos?: number;
  allowMultiple?: boolean;
  allowVideo?: boolean;
}

export function PhotoCapture({
  visible,
  onClose,
  onCapture,
  maxPhotos = 10,
  allowMultiple = true,
  allowVideo = false,
}: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [networkTier, setNetworkTier] = useState<NetworkTier>("cellular");
  const [queueInfo, setQueueInfo] = useState({ queued: 0, uploading: 0, total: 0, wifiWaiting: 0 });

  // Detect network tier on mount and periodically
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    const refresh = async () => {
      if (!mounted) return;
      const [tier, queue] = await Promise.all([
        getNetworkTier(),
        getMediaQueueStatus(),
      ]);
      if (mounted) {
        setNetworkTier(tier);
        setQueueInfo(queue);
      }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, [visible]);

  const networkLabel = networkTier === "wifi" ? "📡 WiFi Mode" : "📶 Cellular Mode";
  const networkDesc = networkTier === "wifi"
    ? "Enhanced quality (1600px, ~300-500KB)"
    : "Optimized for speed (1200px, ~100-200KB)";

  const handleTakePhoto = async () => {
    if (photos.length >= maxPhotos) return;

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: allowVideo ? ["images", "videos"] : ["images"],
      quality: 0.9,
      videoQuality: networkTier === "wifi" ? 1 : 0,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setProcessing(true);
    try {
      const asset = result.assets[0];
      const isVideo = asset.type === "video";

      if (isVideo) {
        const bytes = await getFileSize(asset.uri);
        let thumbnailUri: string | undefined;
        try {
          const thumb = await generateVideoThumbnail(asset.uri);
          thumbnailUri = thumb.uri;
        } catch { /* no thumbnail */ }

        const fileName = `video_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}.mp4`;

        setPhotos((prev) => [
          ...prev,
          { uri: asset.uri, name: fileName, mimeType: "video/mp4", estimatedBytes: bytes, mediaType: "video", thumbnailUri },
        ]);
      } else {
        const compressed = await compressForNetwork(asset.uri);
        const fileName = `photo_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}.jpg`;

        setPhotos((prev) => [
          ...prev,
          { uri: compressed.uri, name: fileName, mimeType: "image/jpeg", estimatedBytes: compressed.estimatedBytes, mediaType: "image" },
        ]);
      }
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
      mediaTypes: allowVideo ? ["images", "videos"] : ["images"],
      quality: 0.9,
      videoQuality: networkTier === "wifi" ? 1 : 0,
      allowsMultipleSelection: allowMultiple,
      selectionLimit: remaining,
    });

    if (result.canceled || !result.assets?.length) return;

    setProcessing(true);
    try {
      const newPhotos: CapturedPhoto[] = [];

      for (const asset of result.assets) {
        const isVideo = asset.type === "video";

        if (isVideo) {
          const bytes = await getFileSize(asset.uri);
          let thumbnailUri: string | undefined;
          try {
            const thumb = await generateVideoThumbnail(asset.uri);
            thumbnailUri = thumb.uri;
          } catch { /* no thumbnail */ }

          const fileName = `video_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 6)}.mp4`;

          newPhotos.push({
            uri: asset.uri, name: fileName, mimeType: "video/mp4",
            estimatedBytes: bytes, mediaType: "video", thumbnailUri,
          });
        } else {
          const compressed = await compressForNetwork(asset.uri);
          const fileName = `photo_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 6)}.jpg`;

          newPhotos.push({
            uri: compressed.uri, name: fileName, mimeType: "image/jpeg",
            estimatedBytes: compressed.estimatedBytes, mediaType: "image",
          });
        }
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

        {/* Network-aware compression badge */}
        <View style={styles.compressionSection}>
          <View style={styles.networkBadge}>
            <Text style={styles.networkBadgeText}>{networkLabel}</Text>
          </View>
          <Text style={styles.compressionDesc}>{networkDesc}</Text>
          {queueInfo.total > 0 && (
            <Text style={styles.queueStatus}>
              {queueInfo.uploading > 0 ? `Uploading ${queueInfo.uploading}...` : ""}
              {queueInfo.queued > 0 ? ` ${queueInfo.queued} queued` : ""}
              {queueInfo.wifiWaiting > 0 ? ` (${queueInfo.wifiWaiting} waiting for WiFi)` : ""}
            </Text>
          )}
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
              <Image
                source={{ uri: photo.thumbnailUri || photo.uri }}
                style={styles.photoThumb}
              />
              {photo.mediaType === "video" && (
                <View style={styles.videoOverlay}>
                  <Text style={styles.videoOverlayText}>▶ Video</Text>
                </View>
              )}
              <View style={styles.photoActions}>
                {photo.mediaType !== "video" && (
                  <Pressable
                    style={styles.photoActionBtn}
                    onPress={() => handleRotatePhoto(index)}
                  >
                    <Text style={styles.photoActionText}>⟳</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.photoActionBtn, styles.photoRemoveBtn]}
                  onPress={() => handleRemovePhoto(index)}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </Pressable>
              </View>
              <View style={styles.photoMeta}>
                <Text style={styles.photoName} numberOfLines={1}>
                  {photo.name}
                </Text>
                {photo.estimatedBytes ? (
                  <Text style={styles.photoSize}>
                    {formatBytes(photo.estimatedBytes)}
                  </Text>
                ) : null}
              </View>
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
          compressionLevel="auto"
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
  networkBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 4,
  },
  networkBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#166534",
  },
  compressionDesc: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  queueStatus: {
    fontSize: 12,
    color: "#2563eb",
    marginTop: 6,
    fontWeight: "500",
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
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  videoOverlayText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  photoMeta: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  photoName: {
    fontSize: 11,
    color: "#6b7280",
  },
  photoSize: {
    fontSize: 10,
    color: "#2563eb",
    marginTop: 2,
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
