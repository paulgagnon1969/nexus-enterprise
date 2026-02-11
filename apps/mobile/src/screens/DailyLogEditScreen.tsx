import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { updateDailyLog } from "../api/dailyLog";
import { enqueueOutbox } from "../offline/outbox";
import type { DailyLogDetail, DailyLogUpdateRequest } from "../types/api";

interface Props {
  log: DailyLogDetail;
  onBack: () => void;
  onSaved: (updated: DailyLogDetail) => void;
}

export function DailyLogEditScreen({ log, onBack, onSaved }: Props) {
  const [title, setTitle] = useState(log.title || "");
  const [weatherSummary, setWeatherSummary] = useState(log.weatherSummary || "");
  const [crewOnSite, setCrewOnSite] = useState(log.crewOnSite || "");
  const [workPerformed, setWorkPerformed] = useState(log.workPerformed || "");
  const [issues, setIssues] = useState(log.issues || "");
  const [safetyIncidents, setSafetyIncidents] = useState(log.safetyIncidents || "");
  const [manpowerOnsite, setManpowerOnsite] = useState(log.manpowerOnsite || "");
  const [personOnsite, setPersonOnsite] = useState(log.personOnsite || "");
  const [confidentialNotes, setConfidentialNotes] = useState(log.confidentialNotes || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const updates: DailyLogUpdateRequest = {};

    // Only include fields that changed
    if (title !== (log.title || "")) updates.title = title || null;
    if (weatherSummary !== (log.weatherSummary || "")) updates.weatherSummary = weatherSummary || null;
    if (crewOnSite !== (log.crewOnSite || "")) updates.crewOnSite = crewOnSite || null;
    if (workPerformed !== (log.workPerformed || "")) updates.workPerformed = workPerformed || null;
    if (issues !== (log.issues || "")) updates.issues = issues || null;
    if (safetyIncidents !== (log.safetyIncidents || "")) updates.safetyIncidents = safetyIncidents || null;
    if (manpowerOnsite !== (log.manpowerOnsite || "")) updates.manpowerOnsite = manpowerOnsite || null;
    if (personOnsite !== (log.personOnsite || "")) updates.personOnsite = personOnsite || null;
    if (confidentialNotes !== (log.confidentialNotes || "")) updates.confidentialNotes = confidentialNotes || null;

    if (Object.keys(updates).length === 0) {
      // No changes
      onBack();
      return;
    }

    try {
      const updated = await updateDailyLog(log.id, updates);
      onSaved(updated);
    } catch (e) {
      // Queue for offline sync if network error
      if (e instanceof Error && e.message.includes("Network")) {
        try {
          await enqueueOutbox("dailyLog.update", {
            logId: log.id,
            updates,
          });
          Alert.alert(
            "Saved Offline",
            "Your changes will sync when connectivity is restored.",
            [{ text: "OK", onPress: onBack }]
          );
        } catch {
          setError("Failed to save changes offline");
        }
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} disabled={saving}>
          <Text style={[styles.headerLink, saving && { opacity: 0.5 }]}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Log</Text>
        <Pressable onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerLink, styles.saveLink, saving && { opacity: 0.5 }]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Read-only header info */}
        <View style={styles.readOnlySection}>
          <Text style={styles.projectName}>{log.projectName}</Text>
          <Text style={styles.date}>{formatDate(log.logDate)}</Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Editable fields */}
        <View style={styles.formSection}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Log title"
            editable={!saving}
          />

          <Text style={styles.label}>Weather</Text>
          <TextInput
            style={styles.input}
            value={weatherSummary}
            onChangeText={setWeatherSummary}
            placeholder="Weather summary"
            editable={!saving}
          />

          <Text style={styles.label}>Crew on Site</Text>
          <TextInput
            style={styles.input}
            value={crewOnSite}
            onChangeText={setCrewOnSite}
            placeholder="Crew on site"
            editable={!saving}
          />

          <Text style={styles.label}>Manpower Onsite</Text>
          <TextInput
            style={styles.input}
            value={manpowerOnsite}
            onChangeText={setManpowerOnsite}
            placeholder="Manpower count"
            editable={!saving}
          />

          <Text style={styles.label}>Person Onsite</Text>
          <TextInput
            style={styles.input}
            value={personOnsite}
            onChangeText={setPersonOnsite}
            placeholder="Person onsite"
            editable={!saving}
          />

          <Text style={styles.label}>Work Performed</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={workPerformed}
            onChangeText={setWorkPerformed}
            placeholder="Describe work performed..."
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Issues</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={issues}
            onChangeText={setIssues}
            placeholder="Any issues encountered..."
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Safety Incidents</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={safetyIncidents}
            onChangeText={setSafetyIncidents}
            placeholder="Safety incidents (if any)..."
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Confidential Notes</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={confidentialNotes}
            onChangeText={setConfidentialNotes}
            placeholder="Internal notes..."
            multiline
            editable={!saving}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  headerLink: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
  saveLink: {
    color: "#2563eb",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  readOnlySection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  projectName: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  errorBanner: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
  },
  formSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
});
