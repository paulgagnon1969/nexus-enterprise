import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { compressImage, rotateImage } from "../utils/image";
import type { CompressionLevel } from "../utils/image";

interface DocumentScannerProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (result: { uri: string; name: string; mimeType: string }) => void;
  compressionLevel?: CompressionLevel;
}

export function DocumentScanner({
  visible,
  onClose,
  onCapture,
  compressionLevel = "medium",
}: DocumentScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      if (photo?.uri) {
        setCapturedUri(photo.uri);
      }
    } catch (e) {
      console.error("Capture failed:", e);
    } finally {
      setProcessing(false);
    }
  };

  const handleRotate = async () => {
    if (!capturedUri) return;

    setProcessing(true);
    try {
      const newRotation = ((rotation + 90) % 360) as 90 | 180 | 270;
      const rotated = await rotateImage(capturedUri, 90);
      setCapturedUri(rotated.uri);
      setRotation(newRotation);
    } catch (e) {
      console.error("Rotate failed:", e);
    } finally {
      setProcessing(false);
    }
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setRotation(0);
  };

  const handleConfirm = async () => {
    if (!capturedUri) return;

    setProcessing(true);
    try {
      // Compress the final image
      const compressed = await compressImage(capturedUri, compressionLevel);

      const fileName = `doc_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}.jpg`;

      onCapture({
        uri: compressed.uri,
        name: fileName,
        mimeType: "image/jpeg",
      });

      // Reset state
      setCapturedUri(null);
      setRotation(0);
      onClose();
    } catch (e) {
      console.error("Compress failed:", e);
    } finally {
      setProcessing(false);
    }
  };

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.container}>
          <Text style={styles.permissionText}>
            Camera permission is required to scan documents
          </Text>
          <Pressable style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {capturedUri ? (
          // Preview mode
          <View style={styles.previewContainer}>
            <Image
              source={{ uri: capturedUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />

            {processing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            )}

            <View style={styles.previewControls}>
              <Pressable
                style={styles.controlButton}
                onPress={handleRetake}
                disabled={processing}
              >
                <Text style={styles.controlButtonText}>↺ Retake</Text>
              </Pressable>

              <Pressable
                style={styles.controlButton}
                onPress={handleRotate}
                disabled={processing}
              >
                <Text style={styles.controlButtonText}>⟳ Rotate</Text>
              </Pressable>

              <Pressable
                style={[styles.controlButton, styles.confirmButton]}
                onPress={handleConfirm}
                disabled={processing}
              >
                <Text style={styles.confirmButtonText}>✓ Use Photo</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          // Camera mode
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
            >
              {/* Document frame guide */}
              <View style={styles.frameGuide}>
                <View style={styles.frameCornerTL} />
                <View style={styles.frameCornerTR} />
                <View style={styles.frameCornerBL} />
                <View style={styles.frameCornerBR} />
              </View>

              <Text style={styles.guideText}>
                Position document within frame
              </Text>
            </CameraView>

            <View style={styles.cameraControls}>
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.captureButton}
                onPress={handleCapture}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <View style={styles.captureButtonInner} />
                )}
              </Pressable>

              <View style={{ width: 70 }} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  permissionText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  button: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    color: "#9ca3af",
    fontSize: 16,
    fontWeight: "600",
  },

  // Camera styles
  cameraContainer: {
    flex: 1,
    width: "100%",
  },
  camera: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  frameGuide: {
    width: "85%",
    height: "65%",
    position: "relative",
  },
  frameCornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#ffffff",
  },
  frameCornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#ffffff",
  },
  frameCornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#ffffff",
  },
  frameCornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "#ffffff",
  },
  guideText: {
    position: "absolute",
    bottom: -40,
    color: "#ffffff",
    fontSize: 14,
    textAlign: "center",
  },
  cameraControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 30,
    paddingVertical: 30,
    backgroundColor: "#000000",
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#000000",
  },

  // Preview styles
  previewContainer: {
    flex: 1,
    width: "100%",
  },
  previewImage: {
    flex: 1,
    backgroundColor: "#1f2937",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  processingText: {
    color: "#ffffff",
    marginTop: 12,
    fontSize: 14,
  },
  previewControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: "#000000",
  },
  controlButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#374151",
  },
  controlButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: "#10b981",
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
