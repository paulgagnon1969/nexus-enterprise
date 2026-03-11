import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Alert,
} from "react-native";
import { colors } from "../theme/colors";
import { getAllExportTargets, upsertExportTarget } from "../db/database";
import { syncAllAccounts } from "../services/sync";
import { isAuthenticated } from "../api/client";
import type { ExportTarget, ExportTargetType } from "../types/models";

const TARGET_LABELS: Record<ExportTargetType, { name: string; description: string }> = {
  ncc: { name: "NCC Financials", description: "Push transactions to Nexus Contractor Connect" },
  quickbooks: { name: "QuickBooks Online", description: "Sync expenses to QuickBooks" },
  xero: { name: "Xero", description: "Sync transactions to Xero accounting" },
  csv: { name: "CSV Export", description: "Export to CSV file in Files app" },
  ofx: { name: "OFX / QFX Export", description: "Export in Open Financial Exchange format" },
  sheets: { name: "Google Sheets", description: "Push to a Google Sheets spreadsheet" },
};

export function SyncScreen() {
  const [targets, setTargets] = useState<ExportTarget[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadTargets = useCallback(async () => {
    const t = await getAllExportTargets();
    setTargets(t);
  }, []);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTargets();
    setRefreshing(false);
  }, [loadTargets]);

  const toggleTarget = async (target: ExportTarget) => {
    const updated = { ...target, enabled: !target.enabled };
    await upsertExportTarget(updated);
    await loadTargets();
  };

  const handleAddTarget = (type: ExportTargetType) => {
    // TODO: Open OAuth flow or config dialog depending on type
    Alert.alert("Coming Soon", `${TARGET_LABELS[type].name} integration is under development.`);
  };

  const [syncing, setSyncing] = useState(false);

  const handleSyncNow = async () => {
    const authed = await isAuthenticated();
    if (!authed) {
      Alert.alert("Sign In Required", "Connect your NCC account to sync Plaid accounts.");
      return;
    }

    setSyncing(true);
    try {
      const result = await syncAllAccounts();
      const msg = result.errors.length > 0
        ? `Synced ${result.synced} account(s), ${result.totalTransactions} transactions.\n\nErrors:\n${result.errors.join("\n")}`
        : `Synced ${result.synced} account(s), ${result.totalTransactions} transactions.`;
      Alert.alert("Sync Complete", msg);
    } catch (err: any) {
      Alert.alert("Sync Failed", err.message || "Could not sync transactions.");
    } finally {
      setSyncing(false);
    }
  };

  // Available targets not yet configured
  const configuredTypes = new Set(targets.map((t) => t.type));
  const availableTypes = (Object.keys(TARGET_LABELS) as ExportTargetType[]).filter(
    (t) => !configuredTypes.has(t),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Sync Now Button */}
      <TouchableOpacity
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={handleSyncNow}
        activeOpacity={0.8}
        disabled={syncing}
      >
        <Text style={styles.syncButtonText}>{syncing ? "Syncing..." : "Sync All Now"}</Text>
      </TouchableOpacity>

      {/* Configured Targets */}
      {targets.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Targets</Text>
          {targets.map((target) => (
            <View key={target.id} style={styles.targetCard}>
              <View style={styles.targetInfo}>
                <Text style={styles.targetName}>
                  {TARGET_LABELS[target.type as ExportTargetType]?.name ?? target.type}
                </Text>
                <Text style={styles.targetDesc}>
                  {target.lastExportAt
                    ? `Last export: ${new Date(target.lastExportAt).toLocaleDateString()}`
                    : "Never exported"}
                </Text>
              </View>
              <Switch
                value={target.enabled}
                onValueChange={() => toggleTarget(target)}
                trackColor={{ false: colors.borderMuted, true: colors.accentLight }}
                thumbColor={target.enabled ? colors.accent : "#f4f3f4"}
              />
            </View>
          ))}
        </View>
      )}

      {/* Available Targets */}
      {availableTypes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Export Target</Text>
          {availableTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={styles.addTargetCard}
              onPress={() => handleAddTarget(type)}
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.targetName}>{TARGET_LABELS[type].name}</Text>
                <Text style={styles.targetDesc}>{TARGET_LABELS[type].description}</Text>
              </View>
              <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },

  syncButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  syncButtonText: { color: colors.textOnAccent, fontSize: 17, fontWeight: "700" },
  syncButtonDisabled: { opacity: 0.6 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },

  targetCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  targetInfo: { flex: 1, marginRight: 12 },
  targetName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  targetDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  addTargetCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  addIcon: { fontSize: 22, fontWeight: "600", color: colors.accent },
});
