import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { createProject, type CreateProjectRequest } from "../api/projects";
import type { ProjectListItem } from "../types/api";

// US states for the picker (abbreviated)
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export function CreateProjectScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (project: ProjectListItem) => void;
}) {
  // Form fields
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  // GPS-based address pre-fill on mount
  useEffect(() => {
    let cancelled = false;

    const prefillFromGps = async () => {
      try {
        setGeoLoading(true);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) {
          setGeoLoading(false);
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (cancelled) return;

        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);

        const results = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (cancelled || !results.length) {
          setGeoLoading(false);
          return;
        }

        const addr = results[0];
        // Only pre-fill if user hasn't started typing
        if (addr.street) setAddressLine1((prev) => prev || addr.street || "");
        if (addr.city) setCity((prev) => prev || addr.city || "");
        if (addr.region) {
          // Expo returns full state name; find the abbreviation
          const abbr = US_STATES.find(
            (s) => s === addr.region?.toUpperCase(),
          );
          const match = abbr || addr.region;
          setState((prev) => prev || match || "");
        }
        if (addr.postalCode) setPostalCode((prev) => prev || addr.postalCode || "");
      } catch (err) {
        console.warn("[CreateProject] GPS prefill failed (non-fatal):", err);
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    };

    void prefillFromGps();
    return () => { cancelled = true; };
  }, []);

  const canSubmit = name.trim() && addressLine1.trim() && city.trim() && state.trim();

  const handleCreate = async () => {
    if (!canSubmit || saving) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);

    try {
      const payload: CreateProjectRequest = {
        name: name.trim(),
        addressLine1: addressLine1.trim(),
        city: city.trim(),
        state: state.trim(),
        ...(addressLine2.trim() ? { addressLine2: addressLine2.trim() } : {}),
        ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}),
        ...(latitude != null ? { latitude } : {}),
        ...(longitude != null ? { longitude } : {}),
        ...(contactName.trim() ? { primaryContactName: contactName.trim() } : {}),
        ...(contactPhone.trim() ? { primaryContactPhone: contactPhone.trim() } : {}),
        ...(contactEmail.trim() ? { primaryContactEmail: contactEmail.trim() } : {}),
      };

      const project = await createProject(payload);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(project);
    } catch (err: any) {
      console.error("[CreateProject] Failed:", err);
      Alert.alert(
        "Error",
        err?.message || "Failed to create project. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Project</Text>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView
        style={styles.form}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* GPS indicator */}
        {geoLoading && (
          <View style={styles.geoBar}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.geoBarText}>Detecting your location…</Text>
          </View>
        )}

        {/* Project Name */}
        <Text style={styles.label}>Project Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Smith Residence — Water Damage"
          placeholderTextColor="#9ca3af"
          autoFocus
        />

        {/* Address */}
        <Text style={styles.sectionTitle}>📍 Address</Text>

        <Text style={styles.label}>Address Line 1 *</Text>
        <TextInput
          style={styles.input}
          value={addressLine1}
          onChangeText={setAddressLine1}
          placeholder="123 Main St"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.label}>Address Line 2</Text>
        <TextInput
          style={styles.input}
          value={addressLine2}
          onChangeText={setAddressLine2}
          placeholder="Suite, Apt, Unit (optional)"
          placeholderTextColor="#9ca3af"
        />

        <View style={styles.row}>
          <View style={styles.flex2}>
            <Text style={styles.label}>City *</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.label}>State *</Text>
            <Pressable
              style={[styles.input, styles.pickerBtn]}
              onPress={() => setShowStatePicker(!showStatePicker)}
            >
              <Text style={state ? styles.pickerValue : styles.pickerPlaceholder}>
                {state || "State"}
              </Text>
              <Text style={styles.pickerArrow}>▼</Text>
            </Pressable>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.label}>ZIP</Text>
            <TextInput
              style={styles.input}
              value={postalCode}
              onChangeText={setPostalCode}
              placeholder="ZIP"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* State picker dropdown */}
        {showStatePicker && (
          <View style={styles.stateGrid}>
            {US_STATES.map((s) => (
              <Pressable
                key={s}
                style={[styles.stateChip, state === s && styles.stateChipActive]}
                onPress={() => {
                  setState(s);
                  setShowStatePicker(false);
                }}
              >
                <Text style={[styles.stateChipText, state === s && styles.stateChipTextActive]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Contact (optional) */}
        <Text style={styles.sectionTitle}>👤 Primary Contact (optional)</Text>

        <TextInput
          style={styles.input}
          value={contactName}
          onChangeText={setContactName}
          placeholder="Contact name"
          placeholderTextColor="#9ca3af"
        />

        <View style={styles.row}>
          <View style={styles.flex1}>
            <TextInput
              style={styles.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="Phone"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.flex2}>
            <TextInput
              style={styles.input}
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="Email"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Coordinates info */}
        {latitude != null && longitude != null && (
          <Text style={styles.coordsInfo}>
            📍 GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Text>
        )}
      </ScrollView>

      {/* Create button */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.createBtn, !canSubmit && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create Project</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 8,
  },
  backText: {
    fontSize: 15,
    color: "#2563eb",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1f2937",
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 32,
  },
  geoBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  geoBarText: {
    fontSize: 13,
    color: "#2563eb",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
    marginTop: 20,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerValue: {
    fontSize: 15,
    color: "#1f2937",
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: "#9ca3af",
  },
  pickerArrow: {
    fontSize: 10,
    color: "#9ca3af",
  },
  stateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  stateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  stateChipActive: {
    backgroundColor: "#2563eb",
  },
  stateChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  stateChipTextActive: {
    color: "#fff",
  },
  coordsInfo: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 12,
    textAlign: "center",
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  createBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
