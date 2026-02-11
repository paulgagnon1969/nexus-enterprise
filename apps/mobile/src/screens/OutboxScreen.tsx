import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { listOutboxRecent, resetErrorItems, clearPendingItems } from "../offline/outbox";

export function OutboxScreen({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [resetting, setResetting] = useState(false);

  const load = async () => {
    const r = await listOutboxRecent(200);
    // DEBUG: Log outbox contents to console
    console.log('=== OUTBOX DEBUG ===');
    r.forEach((item) => {
      console.log(JSON.stringify({
        id: item.id,
        type: item.type,
        status: item.status,
        lastError: item.lastError,
        payload: item.payload?.substring(0, 300),
      }, null, 2));
    });
    setRows(r);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Outbox</Text>
        <Pressable onPress={load}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      {rows.some((r) => r.status === "ERROR") && (
        <Pressable
          style={styles.retryButton}
          onPress={async () => {
            setResetting(true);
            const count = await resetErrorItems();
            console.log(`[Outbox] Reset ${count} error items to PENDING`);
            await load();
            setResetting(false);
          }}
          disabled={resetting}
        >
          <Text style={styles.retryButtonText}>
            {resetting ? "Resetting…" : "Retry All Failed Items"}
          </Text>
        </Pressable>
      )}

      {rows.some((r) => r.status === "PENDING" || r.status === "ERROR") && (
        <Pressable
          style={styles.clearButton}
          onPress={async () => {
            setResetting(true);
            const count = await clearPendingItems();
            console.log(`[Outbox] Cleared ${count} pending/error items`);
            await load();
            setResetting(false);
          }}
          disabled={resetting}
        >
          <Text style={styles.clearButtonText}>
            {resetting ? "Clearing…" : "Clear All Pending"}
          </Text>
        </Pressable>
      )}

      <ScrollView style={{ flex: 1 }}>
        {rows.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {r.type} — {r.status}
            </Text>
            <Text style={styles.cardSub}>{new Date(r.createdAt).toLocaleString()}</Text>
            {r.lastError ? <Text style={styles.error}>{r.lastError}</Text> : null}
          </View>
        ))}
        {!rows.length ? <Text style={styles.cardSub}>No outbox items yet.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 38 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: "#2563eb", fontWeight: "600" },
  retryButton: {
    backgroundColor: "#f59e0b",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  retryButtonText: { color: "#ffffff", fontWeight: "700" },
  clearButton: {
    backgroundColor: "#dc2626",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  clearButtonText: { color: "#ffffff", fontWeight: "700" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontWeight: "700" },
  cardSub: { color: "#6b7280", marginTop: 4, fontSize: 12 },
  error: { color: "#b91c1c", marginTop: 6 },
});
