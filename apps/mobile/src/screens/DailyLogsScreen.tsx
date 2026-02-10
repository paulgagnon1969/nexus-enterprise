import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import { addLocalDailyLog } from "../offline/sync";
import { copyToAppStorage, type StoredFile } from "../storage/files";
import type { DailyLogCreateRequest, FieldPetlItem, ProjectListItem } from "../types/api";

type FieldPetlEditState = {
  item: FieldPetlItem;
  incorrect: boolean;
  fieldQty: string;
  newPercent: string;
  note: string;
  saving: boolean;
  error: string | null;
};

function makeLocalId() {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function DailyLogsScreen({
  project,
  onBack,
}: {
  project: ProjectListItem;
  onBack: () => void;
}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  // Field PETL state
  const [fieldPetlItems, setFieldPetlItems] = useState<FieldPetlItem[]>([]);
  const [fieldPetlStatus, setFieldPetlStatus] = useState<string | null>(null);
  const [fieldPetlOrgGroupFilters, setFieldPetlOrgGroupFilters] = useState<string[]>([]);
  const [fieldPetlEdit, setFieldPetlEdit] = useState<FieldPetlEditState | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [logDate, setLogDate] = useState(today);

  const fieldPetlOrgGroupFilterSet = useMemo(
    () => new Set(fieldPetlOrgGroupFilters),
    [fieldPetlOrgGroupFilters],
  );

  const fieldPetlOrgGroupCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const it of fieldPetlItems) {
      const code = String(it.orgGroupCode ?? "").trim();
      if (code) codes.add(code);
    }
    return Array.from(codes.values()).sort((a, b) => a.localeCompare(b));
  }, [fieldPetlItems]);
  const [title, setTitle] = useState("");

  // “PUDL” fields
  const [weatherSummary, setWeatherSummary] = useState("");
  const [crewOnSite, setCrewOnSite] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [issues, setIssues] = useState("");
  const [safetyIncidents, setSafetyIncidents] = useState("");
  const [manpowerOnsite, setManpowerOnsite] = useState("");
  const [personOnsite, setPersonOnsite] = useState("");
  const [confidentialNotes, setConfidentialNotes] = useState("");

  const [attachments, setAttachments] = useState<StoredFile[]>([]);

  const key = `dailyLogs:${project.id}`;

  const loadCached = async () => {
    const cached = await getCache<any[]>(key);
    if (cached) setLogs(cached);
  };

  const refreshOnline = async () => {
    setStatus("Loading…");
    try {
      const latest = await apiJson<any[]>(
        `/projects/${encodeURIComponent(project.id)}/daily-logs`,
      );
      setLogs(latest);
      await setCache(key, latest);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadCached().then(refreshOnline);
  }, [project.id]);

  // Load Field PETL when project changes
  useEffect(() => {
    (async () => {
      setFieldPetlStatus("Loading PETL scope…");
      try {
        const json = await apiJson<{ items: any[] }>(
          `/projects/${encodeURIComponent(project.id)}/petl-field`,
        );
        const items: any[] = Array.isArray(json?.items) ? json.items : [];
        const mapped: FieldPetlItem[] = items.map((it) => ({
          sowItemId: String(it.id),
          lineNo: Number(it.lineNo ?? 0),
          roomParticleId: it.roomParticleId ?? null,
          roomName: it.roomName ?? null,
          categoryCode: it.categoryCode ?? null,
          selectionCode: it.selectionCode ?? null,
          activity: it.activity ?? null,
          description: it.description ?? null,
          unit: it.unit ?? null,
          originalQty:
            typeof it.originalQty === "number" ? it.originalQty : it.qty ?? null,
          qty: typeof it.qty === "number" ? it.qty : null,
          qtyFlaggedIncorrect: !!it.qtyFlaggedIncorrect,
          qtyFieldReported:
            typeof it.qtyFieldReported === "number" ? it.qtyFieldReported : null,
          qtyReviewStatus: it.qtyReviewStatus ?? null,
          orgGroupCode: it.orgGroupCode ?? null,
          percentComplete:
            typeof it.percentComplete === "number" ? it.percentComplete : undefined,
        }));
        setFieldPetlItems(mapped);
        setFieldPetlStatus(null);
      } catch (e) {
        setFieldPetlStatus(
          e instanceof Error ? e.message : `Failed to load PETL scope: ${String(e)}`,
        );
        setFieldPetlItems([]);
      }
    })();
  }, [project.id]);

  const pickPhotoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setStatus("Media library permission denied");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (res.canceled) return;

    const a = res.assets?.[0];
    if (!a?.uri) return;

    const stored = await copyToAppStorage({
      uri: a.uri,
      name: (a as any).fileName ?? null,
      mimeType: (a as any).mimeType ?? "image/jpeg",
    });

    setAttachments((prev) => [...prev, stored]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setStatus("Camera permission denied");
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (res.canceled) return;

    const a = res.assets?.[0];
    if (!a?.uri) return;

    const stored = await copyToAppStorage({
      uri: a.uri,
      name: (a as any).fileName ?? null,
      mimeType: (a as any).mimeType ?? "image/jpeg",
    });

    setAttachments((prev) => [...prev, stored]);
  };

  const removeAttachment = (uri: string) => {
    setAttachments((prev) => prev.filter((x) => x.uri !== uri));
  };

  const openFieldPetlEdit = (item: FieldPetlItem) => {
    setFieldPetlEdit({
      item,
      incorrect: item.qtyFlaggedIncorrect,
      fieldQty:
        item.qtyFieldReported != null && !Number.isNaN(item.qtyFieldReported)
          ? String(item.qtyFieldReported)
          : "",
      newPercent:
        typeof item.percentComplete === "number" && !Number.isNaN(item.percentComplete)
          ? String(item.percentComplete)
          : "",
      note: "",
      saving: false,
      error: null,
    });
  };

  const closeFieldPetlEdit = () => {
    if (fieldPetlEdit?.saving) return;
    setFieldPetlEdit(null);
  };

  const submitFieldPetlEdit = async () => {
    if (!project || !fieldPetlEdit) return;

    const { item, incorrect, fieldQty, newPercent, note } = fieldPetlEdit;

    let parsedFieldQty: number | null = null;
    if (incorrect) {
      if (!fieldQty.trim()) {
        setFieldPetlEdit((prev) =>
          prev ? { ...prev, error: "Enter a field quantity." } : prev,
        );
        return;
      }
      parsedFieldQty = Number(fieldQty);
      if (!Number.isFinite(parsedFieldQty) || parsedFieldQty < 0) {
        setFieldPetlEdit((prev) =>
          prev ? { ...prev, error: "Field qty must be a non-negative number." } : prev,
        );
        return;
      }
    }

    let parsedPercent: number | null = null;
    const pctRaw = newPercent.trim();
    if (pctRaw !== "") {
      const n = Number(pctRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setFieldPetlEdit((prev) =>
          prev ? { ...prev, error: "Percent must be between 0 and 100." } : prev,
        );
        return;
      }
      parsedPercent = n;
    }

    setFieldPetlEdit((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

    try {
      await enqueueOutbox("fieldPetl.edit", {
        projectId: project.id,
        sowItemId: item.sowItemId,
        incorrect,
        fieldQty: parsedFieldQty,
        percent: parsedPercent,
        note: note || null,
      });

      // Optimistically update local Field PETL state so status reflects the change.
      setFieldPetlItems((prev) =>
        prev.map((it) => {
          if (it.sowItemId !== item.sowItemId) return it;
          return {
            ...it,
            qtyFlaggedIncorrect: incorrect,
            qtyFieldReported: incorrect ? parsedFieldQty : null,
            qtyReviewStatus: incorrect ? "PENDING" : null,
            percentComplete: parsedPercent ?? it.percentComplete,
          };
        }),
      );

      setFieldPetlStatus("Saved offline. Will sync when connectivity allows.");
      setFieldPetlEdit(null);
    } catch (err) {
      setFieldPetlEdit((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error:
                err instanceof Error
                  ? err.message
                  : `Failed to queue edit: ${String(err)}`,
            }
          : prev,
      );
    }
  };

  const createOffline = async () => {
    setStatus(null);

    const localLogId = makeLocalId();

    const dto: DailyLogCreateRequest = {
      logDate,
      title: title || null,
      weatherSummary: weatherSummary || null,
      crewOnSite: crewOnSite || null,
      workPerformed: workPerformed || null,
      issues: issues || null,
      safetyIncidents: safetyIncidents || null,
      manpowerOnsite: manpowerOnsite || null,
      personOnsite: personOnsite || null,
      confidentialNotes: confidentialNotes || null,
      // Default sharing policy for now (can be expanded later)
      shareInternal: true,
      shareSubs: false,
      shareClient: false,
      sharePrivate: false,
    };

    const localLog = {
      id: localLogId,
      projectId: project.id,
      logDate,
      title: dto.title,
      workPerformed: dto.workPerformed,
      issues: dto.issues,
      status: "PENDING_SYNC",
      createdAt: new Date().toISOString(),
      attachments: attachments.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType })),
      __local: true,
    };

    await addLocalDailyLog(project.id, localLog);
    setLogs((prev) => [localLog, ...prev]);

    await enqueueOutbox("dailyLog.create", { projectId: project.id, localLogId, dto });

    for (const a of attachments) {
      // Queue attachments behind the log create.
      // The sync runner will map localLogId -> remoteLogId.
      // eslint-disable-next-line no-await-in-loop
      await enqueueOutbox("dailyLog.uploadAttachment", {
        projectId: project.id,
        localLogId,
        fileUri: a.uri,
        fileName: a.name,
        mimeType: a.mimeType,
      });
    }

    setTitle("");
    setWeatherSummary("");
    setCrewOnSite("");
    setWorkPerformed("");
    setIssues("");
    setSafetyIncidents("");
    setManpowerOnsite("");
    setPersonOnsite("");
    setConfidentialNotes("");
    setAttachments([]);

    setStatus("Saved offline. Will sync later.");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Daily Logs</Text>
        <Pressable onPress={refreshOnline}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      <Text style={styles.projectName}>{project.name}</Text>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.form}>
        <Text style={styles.formLabel}>Create log (offline-capable)</Text>
        <TextInput
          style={styles.input}
          value={logDate}
          onChangeText={setLogDate}
          placeholder="YYYY-MM-DD"
        />
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
        />

        <TextInput
          style={styles.input}
          value={weatherSummary}
          onChangeText={setWeatherSummary}
          placeholder="Weather summary"
        />
        <TextInput
          style={styles.input}
          value={crewOnSite}
          onChangeText={setCrewOnSite}
          placeholder="Crew on site"
        />

        <TextInput
          style={[styles.input, { height: 80 }]}
          value={workPerformed}
          onChangeText={setWorkPerformed}
          placeholder="Work performed"
          multiline
        />
        <TextInput
          style={[styles.input, { height: 70 }]}
          value={issues}
          onChangeText={setIssues}
          placeholder="Issues"
          multiline
        />
        <TextInput
          style={[styles.input, { height: 70 }]}
          value={safetyIncidents}
          onChangeText={setSafetyIncidents}
          placeholder="Safety incidents"
          multiline
        />
        <TextInput
          style={styles.input}
          value={manpowerOnsite}
          onChangeText={setManpowerOnsite}
          placeholder="Manpower onsite"
        />
        <TextInput
          style={styles.input}
          value={personOnsite}
          onChangeText={setPersonOnsite}
          placeholder="Person onsite"
        />
        <TextInput
          style={[styles.input, { height: 70 }]}
          value={confidentialNotes}
          onChangeText={setConfidentialNotes}
          placeholder="Confidential notes"
          multiline
        />

        <Text style={{ fontWeight: "700", marginBottom: 6, marginTop: 6 }}>
          Attachments (offline)
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <Pressable style={styles.smallButton} onPress={takePhoto}>
            <Text style={styles.smallButtonText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.smallButton} onPress={pickPhotoFromLibrary}>
            <Text style={styles.smallButtonText}>Library</Text>
          </Pressable>
        </View>

        {attachments.map((a) => (
          <View key={a.uri} style={styles.attachmentRow}>
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {a.name}
            </Text>
            <Pressable onPress={() => removeAttachment(a.uri)}>
              <Text style={{ color: "#b91c1c", fontWeight: "700" }}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.button} onPress={createOffline}>
          <Text style={styles.buttonText}>Save offline</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {logs.map((l) => (
          <View key={l.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {l.title || "(no title)"} {l.__local ? "(pending)" : ""}
            </Text>
            <Text style={styles.cardSub}>{String(l.logDate)}</Text>
          </View>
        ))}
        {!logs.length ? <Text style={styles.status}>No logs cached yet.</Text> : null}

        <View style={[styles.card, { marginTop: 12 }] }>
          <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Field PETL scope</Text>

          {fieldPetlOrgGroupCodes.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: "#4b5563", marginBottom: 4 }}>
                Org Group
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Pressable
                  style={[
                    styles.chip,
                    fieldPetlOrgGroupFilterSet.size === 0 && styles.chipSelected,
                  ]}
                  onPress={() => setFieldPetlOrgGroupFilters([])}
                >
                  <Text
                    style={
                      fieldPetlOrgGroupFilterSet.size === 0
                        ? styles.chipTextSelected
                        : styles.chipText
                    }
                  >
                    All
                  </Text>
                </Pressable>
                {fieldPetlOrgGroupCodes.map((code) => {
                  const selected = fieldPetlOrgGroupFilterSet.has(code);
                  return (
                    <Pressable
                      key={code}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => {
                        setFieldPetlOrgGroupFilters((prev) => {
                          if (prev.includes(code)) {
                            return prev.filter((c) => c !== code);
                          }
                          return [...prev, code];
                        });
                      }}
                    >
                      <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                        {code}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {fieldPetlStatus && (
            <Text style={{ fontSize: 12, color: "#6b7280" }}>{fieldPetlStatus}</Text>
          )}

          {!fieldPetlStatus && fieldPetlItems.length === 0 && (
            <Text style={{ fontSize: 12, color: "#6b7280" }}>
              No PETL scope rows found for this project.
            </Text>
          )}

          {!fieldPetlStatus && fieldPetlItems.length > 0 && (
            <View>
              {fieldPetlItems
                .filter((it) => {
                  if (fieldPetlOrgGroupFilterSet.size === 0) return true;
                  const code = String(it.orgGroupCode ?? "").trim();
                  return code && fieldPetlOrgGroupFilterSet.has(code);
                })
                .map((it) => {
                  const orig = it.originalQty ?? it.qty ?? null;
                  const curr = it.qty ?? null;
                  const hasField = typeof it.qtyFieldReported === "number";
                  let statusLabel = "OK";
                  if (it.qtyFlaggedIncorrect && it.qtyReviewStatus === "PENDING") {
                    statusLabel = hasField && it.qtyFieldReported != null
                      ? `Pending (${it.qtyFieldReported})`
                      : "Pending";
                  } else if (it.qtyReviewStatus === "ACCEPTED") {
                    statusLabel = "Accepted";
                  } else if (it.qtyReviewStatus === "REJECTED") {
                    statusLabel = "Rejected";
                  }

                  return (
                    <View key={it.sowItemId} style={{ marginBottom: 8 }}>
                      <Text style={{ fontWeight: "600", fontSize: 12 }}>
                        #{it.lineNo} {it.roomName ? `· ${it.roomName}` : ""}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#111827",
                        }}
                        numberOfLines={2}
                      >
                        {it.description || "(no description)"}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#4b5563" }}>
                        Qty: {orig != null ? orig : "—"} → {curr != null ? curr : "—"}
                        {hasField && it.qtyFieldReported != null
                          ? ` (field ${it.qtyFieldReported})`
                          : ""}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#4b5563" }}>
                        Status: {statusLabel}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "flex-start",
                          marginTop: 4,
                        }}
                      >
                        <Pressable
                          style={styles.smallButton}
                          onPress={() => openFieldPetlEdit(it)}
                        >
                          <Text style={styles.smallButtonText}>Verify / Edit</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
            </View>
          )}
        </View>

        {fieldPetlEdit && (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={[styles.cardTitle, { marginBottom: 6 }]}>Verify PETL line</Text>
            <Text style={{ fontSize: 12, color: "#4b5563", marginBottom: 4 }}>
              #{fieldPetlEdit.item.lineNo}
              {fieldPetlEdit.item.roomName ? ` · ${fieldPetlEdit.item.roomName}` : ""}
            </Text>
            <Text style={{ fontSize: 12, color: "#111827", marginBottom: 6 }} numberOfLines={3}>
              {fieldPetlEdit.item.description || "(no description)"}
            </Text>

            <Pressable
              style={{ marginBottom: 8 }}
              onPress={() =>
                setFieldPetlEdit((prev) =>
                  prev ? { ...prev, incorrect: !prev.incorrect } : prev,
                )
              }
            >
              <Text style={{ fontSize: 12 }}>
                <Text style={{ fontWeight: "700" }}>Qty is incorrect:</Text>{" "}
                {fieldPetlEdit.incorrect ? "Yes" : "No"}
              </Text>
            </Pressable>

            {fieldPetlEdit.incorrect && (
              <TextInput
                style={styles.input}
                value={fieldPetlEdit.fieldQty}
                onChangeText={(text) =>
                  setFieldPetlEdit((prev) => (prev ? { ...prev, fieldQty: text } : prev))
                }
                keyboardType="numeric"
                placeholder="Field quantity"
              />
            )}

            <TextInput
              style={styles.input}
              value={fieldPetlEdit.newPercent}
              onChangeText={(text) =>
                setFieldPetlEdit((prev) => (prev ? { ...prev, newPercent: text } : prev))
              }
              keyboardType="numeric"
              placeholder="% complete (optional)"
            />

            <TextInput
              style={[styles.input, { height: 70 }]}
              value={fieldPetlEdit.note}
              onChangeText={(text) =>
                setFieldPetlEdit((prev) => (prev ? { ...prev, note: text } : prev))
              }
              placeholder="Note (optional)"
              multiline
            />

            {fieldPetlEdit.error ? (
              <Text style={{ color: "#b91c1c", fontSize: 12, marginBottom: 4 }}>
                {fieldPetlEdit.error}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Pressable
                style={[styles.smallButton, { borderColor: "#9ca3af" }]}
                onPress={closeFieldPetlEdit}
                disabled={fieldPetlEdit.saving}
              >
                <Text style={styles.smallButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.button}
                onPress={submitFieldPetlEdit}
                disabled={fieldPetlEdit.saving}
              >
                <Text style={styles.buttonText}>
                  {fieldPetlEdit.saving ? "Saving…" : "Save offline"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: "#2563eb", fontWeight: "600" },
  projectName: { fontWeight: "700", marginBottom: 6 },
  status: { color: "#374151", marginBottom: 8 },
  form: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  formLabel: { fontWeight: "700", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  smallButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  smallButtonText: { fontWeight: "700" },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  cardSub: { color: "#6b7280", marginTop: 4, fontSize: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    backgroundColor: "#ffffff",
  },
  chipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: { fontSize: 12, color: "#111827" },
  chipTextSelected: { fontSize: 12, color: "#f9fafb", fontWeight: "600" },
});
