import React, { useEffect, useState, useCallback } from "react";
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
import * as ImagePicker from "expo-image-picker";
import { colors } from "../theme/colors";
import { apiFetch, apiJson } from "../api/client";

type TemplateAsset = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  _count: { fleetMembers: number };
};

type SerialEntry = {
  serial: string;
  confidence: number;
  photoUri?: string;
  status: "pending" | "captured" | "manual";
};

interface Props {
  onBack: () => void;
  onFleetCreated?: (result: any) => void;
}

export function FleetOnboardScreen({ onBack, onFleetCreated }: Props) {
  const [templates, setTemplates] = useState<TemplateAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateAsset | null>(null);
  const [serials, setSerials] = useState<SerialEntry[]>([]);
  const [manualSerial, setManualSerial] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiJson<TemplateAsset[]>("/assets/scan/templates")
      .then(setTemplates)
      .catch((err) => console.warn("[FleetOnboard] Failed to load templates:", err))
      .finally(() => setLoading(false));
  }, []);

  const captureSerial = useCallback(async () => {
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
    } catch (err: any) {
      console.warn("[FleetOnboard] Camera error:", err?.message);
      Alert.alert("Camera Error", "Could not open camera. Check permissions and try again.");
      return;
    }

    if (result.canceled || !result.assets?.length) return;
    const photo = result.assets[0]!;

    setCapturing(true);
    try {
      const formData = new FormData();
      const uri = photo.uri;
      const filename = uri.split("/").pop() || "serial.jpg";
      formData.append("photo", {
        uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
        name: filename,
        type: "image/jpeg",
      } as any);

      const res = await apiFetch("/assets/scan/serial-read", {
        method: "POST",
        body: formData,
        _skipRetry: true,
      });

      if (!res.ok) throw new Error(`Serial read failed: ${res.status}`);
      const data = await res.json() as { serialNumber: string | null; confidence: number };

      if (data.serialNumber) {
        setSerials((prev) => [
          ...prev,
          { serial: data.serialNumber!, confidence: data.confidence, photoUri: photo.uri, status: "captured" },
        ]);
      } else {
        Alert.alert("Couldn't Read", "Serial number not readable. Enter manually or try again.", [
          { text: "Try Again", onPress: captureSerial },
          { text: "Enter Manually", style: "cancel" },
        ]);
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to read serial number.");
    } finally {
      setCapturing(false);
    }
  }, []);

  const addManualSerial = () => {
    const s = manualSerial.trim();
    if (!s) return;
    if (serials.some((e) => e.serial === s)) {
      Alert.alert("Duplicate", "This serial number is already in the list.");
      return;
    }
    setSerials((prev) => [...prev, { serial: s, confidence: 1.0, status: "manual" }]);
    setManualSerial("");
  };

  const removeSerial = (index: number) => {
    setSerials((prev) => prev.filter((_, i) => i !== index));
  };

  const submitFleet = async () => {
    if (!selectedTemplate || !serials.length) return;

    setSubmitting(true);
    try {
      const result = await apiJson<any>("/assets/scan/fleet-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateAssetId: selectedTemplate.id,
          serialNumbers: serials.map((s) => s.serial),
        }),
        _skipRetry: true, // Prevent auto-retry — fleet creation is not idempotent
      });

      Alert.alert(
        "Fleet Created",
        `${result.created} assets created from "${result.templateName}".`,
      );
      onFleetCreated?.(result);
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to create fleet.");
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Select template
  if (!selectedTemplate) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Fleet Onboard</Text>
        </View>

        <Text style={styles.instructions}>
          Select a template asset, then capture serial numbers for each unit.
        </Text>

        <Text style={styles.sectionTitle}>Templates</Text>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
        ) : templates.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>
              No templates yet. Use "Read Tag" to scan equipment and save it as a template first.
            </Text>
          </View>
        ) : (
          templates.map((t) => (
            <Pressable
              key={t.id}
              style={styles.templateCard}
              onPress={() => setSelectedTemplate(t)}
            >
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{t.name}</Text>
                <Text style={styles.templateMeta}>
                  {[t.manufacturer, t.model].filter(Boolean).join(" ")}
                  {t._count.fleetMembers > 0 ? ` • ${t._count.fleetMembers} in fleet` : ""}
                </Text>
              </View>
              <Text style={styles.cardArrow}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  // Step 2: Capture serial numbers
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => setSelectedTemplate(null)} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Templates</Text>
        </Pressable>
        <Text style={styles.title}>Capture Serials</Text>
      </View>

      <View style={styles.templateBanner}>
        <Text style={styles.templateBannerLabel}>Template:</Text>
        <Text style={styles.templateBannerName}>{selectedTemplate.name}</Text>
      </View>

      {/* Serial capture buttons */}
      <View style={styles.captureRow}>
        <Pressable
          style={[styles.captureBtn, capturing && styles.btnDisabled]}
          onPress={captureSerial}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.captureBtnIcon}>📷</Text>
              <Text style={styles.captureBtnText}>Scan Serial</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Manual entry */}
      <View style={styles.manualRow}>
        <TextInput
          style={styles.manualInput}
          value={manualSerial}
          onChangeText={setManualSerial}
          placeholder="Enter serial manually"
          placeholderTextColor="#64748B"
          onSubmitEditing={addManualSerial}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addBtn, !manualSerial.trim() && styles.btnDisabled]}
          onPress={addManualSerial}
          disabled={!manualSerial.trim()}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {/* Serial list */}
      <Text style={styles.sectionTitle}>
        {serials.length} Serial{serials.length !== 1 ? "s" : ""} Captured
      </Text>
      {serials.map((entry, i) => (
        <View key={i} style={styles.serialRow}>
          <Text style={styles.serialIcon}>
            {entry.status === "captured" ? "📷" : "✍️"}
          </Text>
          <View style={styles.serialInfo}>
            <Text style={styles.serialNumber}>{entry.serial}</Text>
            {entry.status === "captured" && (
              <Text style={styles.serialConfidence}>
                AI confidence: {Math.round(entry.confidence * 100)}%
              </Text>
            )}
          </View>
          <Pressable onPress={() => removeSerial(i)}>
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
      ))}

      {serials.length > 0 && (
        <Pressable
          style={[styles.primaryBtn, submitting && styles.btnDisabled]}
          onPress={submitFleet}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              Create {serials.length} Asset{serials.length !== 1 ? "s" : ""}
            </Text>
          )}
        </Pressable>
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
  sectionTitle: { color: "#CBD5E1", fontSize: 14, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, marginTop: 16 },
  emptyState: { alignItems: "center", paddingVertical: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: "#64748B", fontSize: 14, textAlign: "center" },
  templateCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#1E293B",
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  templateInfo: { flex: 1 },
  templateName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  templateMeta: { color: "#94A3B8", fontSize: 13, marginTop: 2 },
  cardArrow: { color: "#64748B", fontSize: 24, fontWeight: "300" },
  templateBanner: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#1E293B",
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  templateBannerLabel: { color: "#94A3B8", fontSize: 13, marginRight: 6 },
  templateBannerName: { color: "#fff", fontSize: 15, fontWeight: "700" },
  captureRow: { marginBottom: 12 },
  captureBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#059669", borderRadius: 10, paddingVertical: 14,
  },
  captureBtnIcon: { fontSize: 20, marginRight: 8 },
  captureBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  manualRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  manualInput: {
    flex: 1, backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#334155",
  },
  addBtn: {
    backgroundColor: "#334155", borderRadius: 8, paddingHorizontal: 16,
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  serialRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#1E293B",
    borderRadius: 8, padding: 12, marginBottom: 6,
  },
  serialIcon: { fontSize: 18, marginRight: 10 },
  serialInfo: { flex: 1 },
  serialNumber: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  serialConfidence: { color: "#64748B", fontSize: 11 },
  removeText: { color: "#DC2626", fontSize: 16, padding: 4 },
  primaryBtn: {
    backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 16,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
