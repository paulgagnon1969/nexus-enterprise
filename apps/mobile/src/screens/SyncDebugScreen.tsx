import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { listOutboxRecent, countPendingOutbox, resetErrorItems, clearPendingItems, type OutboxRow } from "../offline/outbox";
import { syncOnce } from "../offline/sync";
import { colors } from "../theme/colors";

interface Props {
  onBack: () => void;
}

export function SyncDebugScreen({ onBack }: Props) {
  const [items, setItems] = useState<OutboxRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [rows, count] = await Promise.all([
        listOutboxRecent(50),
        countPendingOutbox(),
      ]);
      setItems(rows);
      setPendingCount(count);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await syncOnce();
      setLastSyncResult(
        `Processed: ${result.processed}, Failed: ${result.failed}${result.skippedReason ? `, Skipped: ${result.skippedReason}` : ""}`
      );
      await refresh();
    } catch (e) {
      setLastSyncResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryErrors = async () => {
    const count = await resetErrorItems();
    Alert.alert("Reset", `${count} error item(s) reset to pending.`);
    await refresh();
  };

  const handleClearPending = async () => {
    Alert.alert(
      "Clear Pending Items",
      "This will delete all pending/error items. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            const count = await clearPendingItems();
            Alert.alert("Cleared", `${count} item(s) removed.`);
            await refresh();
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DONE": return colors.success;
      case "ERROR": return colors.error;
      case "PROCESSING": return colors.warning;
      default: return colors.textMuted;
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backLink}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Sync Debug</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{items.filter(i => i.status === "DONE").length}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{items.filter(i => i.status === "ERROR").length}</Text>
          <Text style={styles.statLabel}>Errors</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, styles.syncButton]}
          onPress={handleSync}
          disabled={syncing}
        >
          <Text style={styles.actionButtonText}>
            {syncing ? "Syncing..." : "Sync Now"}
          </Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={handleRetryErrors}>
          <Text style={styles.actionButtonText}>Retry Errors</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.dangerButton]} onPress={handleClearPending}>
          <Text style={styles.actionButtonTextDanger}>Clear</Text>
        </Pressable>
      </View>

      {lastSyncResult && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>{lastSyncResult}</Text>
        </View>
      )}

      {/* Outbox list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No outbox items</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemType}>{item.type}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.itemTime}>{formatTime(item.createdAt)}</Text>
              {item.lastError && (
                <Text style={styles.itemError} numberOfLines={2}>
                  {item.lastError}
                </Text>
              )}
              <Text style={styles.itemPayload} numberOfLines={3}>
                {item.payload}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  backLink: {
    color: colors.primary,
    fontWeight: "600",
  },
  statsBar: {
    flexDirection: "row",
    backgroundColor: colors.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  syncButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dangerButton: {
    borderColor: colors.error,
  },
  actionButtonText: {
    color: colors.textOnPrimary,
    fontWeight: "600",
    fontSize: 13,
  },
  actionButtonTextDanger: {
    color: colors.error,
    fontWeight: "600",
    fontSize: 13,
  },
  resultBox: {
    marginHorizontal: 12,
    padding: 10,
    backgroundColor: colors.infoLight,
    borderRadius: 8,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 40,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: 40,
  },
  itemCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemType: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  itemTime: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  itemError: {
    fontSize: 12,
    color: colors.error,
    marginBottom: 4,
  },
  itemPayload: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: "monospace",
  },
});
