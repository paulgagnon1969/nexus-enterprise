import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import { colors } from "../theme/colors";
import { apiJson } from "../api/client";
import { printPlacardLabel } from "../utils/placard-print";

const NEXPLAC_PREFIX = "nexplac://";

type AssetInfo = {
  id: string;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumberOrVin?: string | null;
  year?: number | null;
  assetType?: string;
  tagPhotoUrl?: string | null;
  isActive?: boolean;
};

type VerifyResult = {
  verified: boolean;
  placard: { id: string; code: string; status: string };
  asset: AssetInfo;
};

interface Props {
  onBack: () => void;
}

export function PlacardScanScreen({ onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [printing, setPrinting] = useState(false);

  const handleBarCodeScanned = useCallback(
    async (scanResult: BarcodeScanningResult) => {
      if (!scanning || verifying) return;

      const payload = scanResult.data;
      if (!payload.startsWith(NEXPLAC_PREFIX)) {
        // Not a Nex-Plac QR — ignore silently
        return;
      }

      setScanning(false);
      setVerifying(true);

      try {
        const data = await apiJson<VerifyResult>("/placards/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrPayload: payload }),
        });
        setResult(data);
      } catch (err: any) {
        Alert.alert(
          "Verification Failed",
          err?.message || "Could not verify this placard.",
          [{ text: "Scan Again", onPress: () => setScanning(true) }],
        );
      } finally {
        setVerifying(false);
      }
    },
    [scanning, verifying],
  );

  const handlePrint = async () => {
    if (!result) return;
    setPrinting(true);
    try {
      // Fetch label data (includes QR data URL)
      const label = await apiJson<{
        qrDataUrl: string;
        placardCode: string;
        assetName: string;
        manufacturer?: string | null;
        model?: string | null;
      }>(`/placards/${result.placard.id}/label`);

      await printPlacardLabel(label);
    } catch (err: any) {
      Alert.alert("Print Error", err?.message || "Could not print label.");
    } finally {
      setPrinting(false);
    }
  };

  const handleScanAgain = () => {
    setResult(null);
    setScanning(true);
  };

  // ── Permission states ───────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permText}>
          Camera permission is required to scan Nex-Plac QR codes.
        </Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </Pressable>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Result view ─────────────────────────────────────────────────────

  if (result) {
    const { asset, placard } = result;
    const subtitle = [asset.manufacturer, asset.model].filter(Boolean).join(" ");

    return (
      <View style={styles.container}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </Pressable>

        <View style={styles.resultCard}>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ VERIFIED</Text>
          </View>

          <Text style={styles.placardCode}>{placard.code}</Text>

          {asset.tagPhotoUrl ? (
            <Image
              source={{ uri: asset.tagPhotoUrl }}
              style={styles.assetPhoto}
              resizeMode="cover"
            />
          ) : null}

          <Text style={styles.assetName}>{asset.name}</Text>
          {subtitle ? <Text style={styles.assetSubtitle}>{subtitle}</Text> : null}
          {asset.serialNumberOrVin ? (
            <Text style={styles.assetSerial}>S/N: {asset.serialNumberOrVin}</Text>
          ) : null}
          {asset.year ? (
            <Text style={styles.assetDetail}>Year: {asset.year}</Text>
          ) : null}
          <Text style={styles.assetDetail}>Type: {asset.assetType}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#2563EB" }]}
            onPress={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>🖨 Reprint Label</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#059669" }]}
            onPress={handleScanAgain}
          >
            <Text style={styles.actionBtnText}>📷 Scan Another</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Scanner view ────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
      >
        {/* QR guide overlay */}
        <View style={styles.overlay}>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>

          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {verifying ? (
            <View style={styles.verifyingBox}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.verifyingText}>Verifying placard…</Text>
            </View>
          ) : (
            <Text style={styles.instructionText}>
              Point camera at a Nex-Plac QR code
            </Text>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 60,
  },
  scanFrame: {
    width: 240,
    height: 240,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#fff",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  instructionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  verifyingBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 10,
  },
  verifyingText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Permission
  permText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  permBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  permBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // Back
  backBtn: { paddingVertical: 12, paddingHorizontal: 16, alignSelf: "flex-start" },
  backBtnText: { color: "#94A3B8", fontSize: 17, fontWeight: "600" },

  // Result card
  resultCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 20,
    alignItems: "center",
    marginTop: 8,
  },
  verifiedBadge: {
    backgroundColor: "#059669",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  verifiedText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  placardCode: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 12,
  },
  assetPhoto: {
    width: 200,
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#0F172A",
  },
  assetName: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
  assetSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  assetSerial: { color: "#CBD5E1", fontSize: 13, marginTop: 8, fontFamily: "monospace" },
  assetDetail: { color: "#64748B", fontSize: 13, marginTop: 2 },

  // Actions
  actions: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
