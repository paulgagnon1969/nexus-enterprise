import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import { getAllAccounts, deleteAccount } from "../db/database";
import { isAuthenticated } from "../api/client";
import { openPlaidLink } from "../services/plaid";
import type { Account } from "../types/models";

export function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAccounts = useCallback(async () => {
    const accts = await getAllAccounts();
    setAccounts(accts);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  }, [loadAccounts]);

  const handleDisconnect = (account: Account) => {
    Alert.alert(
      "Disconnect Account",
      `Remove ${account.institutionName} — ${account.accountName}? All imported transactions will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await deleteAccount(account.id);
            await loadAccounts();
          },
        },
      ],
    );
  };

  const [connecting, setConnecting] = useState(false);

  const handleConnectBank = useCallback(async () => {
    // Check auth first — Plaid requires NCC backend
    const authed = await isAuthenticated();
    if (!authed) {
      Alert.alert(
        "Sign In Required",
        "Connect your NCC account to link bank accounts via Plaid.",
        [{ text: "OK" }],
      );
      return;
    }

    setConnecting(true);
    try {
      await openPlaidLink();
      Alert.alert("Connected", "Account connected and transactions are syncing.");
      await loadAccounts();
    } catch (err: any) {
      // "Plaid Link dismissed" is a normal exit — don't alert
      if (err.message !== "Plaid Link dismissed") {
        Alert.alert("Connection Failed", err.message || "Could not connect bank account.");
      }
    } finally {
      setConnecting(false);
    }
  }, [loadAccounts]);

  const renderAccount = ({ item }: { item: Account }) => (
    <TouchableOpacity
      style={styles.card}
      onLongPress={() => handleDisconnect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.sourceBadge, item.source === "financekit" ? styles.fkBadge : styles.plaidBadge]}>
          <Text style={styles.sourceBadgeText}>
            {item.source === "financekit" ? "Apple" : "Plaid"}
          </Text>
        </View>
        <Text style={styles.accountType}>{item.type.toUpperCase()}</Text>
      </View>

      <Text style={styles.institutionName}>{item.institutionName}</Text>
      <Text style={styles.accountName}>
        {item.accountName}
        {item.mask ? ` ••${item.mask}` : ""}
      </Text>

      {item.currentBalance != null && (
        <Text style={styles.balance}>{formatCurrency(item.currentBalance)}</Text>
      )}

      {item.lastSyncedAt && (
        <Text style={styles.syncTime}>
          Last synced {new Date(item.lastSyncedAt).toLocaleDateString()}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(a) => a.id}
        renderItem={renderAccount}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No accounts connected</Text>
            <Text style={styles.emptySubtitle}>
              Tap the button below to connect your first bank or credit card.
            </Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={[styles.addButton, connecting && styles.addButtonDisabled]}
            onPress={handleConnectBank}
            activeOpacity={0.8}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.addButtonText}>+ Connect Account</Text>
            )}
          </TouchableOpacity>
        }
      />
    </View>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  list: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  fkBadge: { backgroundColor: "#1e293b" },
  plaidBadge: { backgroundColor: "#0052ff" },
  sourceBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  accountType: { fontSize: 11, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase" },

  institutionName: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  accountName: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  balance: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, marginTop: 12 },
  syncTime: { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: { color: colors.textOnAccent, fontSize: 16, fontWeight: "700" },
  addButtonDisabled: { opacity: 0.6 },

  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", maxWidth: 260 },
});
