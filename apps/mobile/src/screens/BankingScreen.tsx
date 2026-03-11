import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { open, create, type LinkSuccess, type LinkExit } from "react-native-plaid-link-sdk";
import { colors } from "../theme/colors";
import {
  createLinkToken,
  exchangeAndConnect,
  syncAllConnections,
  getConnections,
  getTransactions,
  disconnectBank,
  type BankConnection,
  type BankTransaction,
  type PlaidLinkSuccessMetadata,
} from "../api/banking";

// ── Helpers ────────────────────────────────────────────

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Plaid: positive = money out, negative = money in
  return amount > 0 ? `-$${formatted}` : `+$${formatted}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusColor(status: BankConnection["status"]): string {
  switch (status) {
    case "ACTIVE": return colors.success;
    case "REQUIRES_REAUTH": return colors.warning;
    case "DISCONNECTED": return colors.textMuted;
    default: return colors.textMuted;
  }
}

// ── Main Component ─────────────────────────────────────

export function BankingScreen({ onBack }: { onBack: () => void }) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [totalTxns, setTotalTxns] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [tab, setTab] = useState<"transactions" | "accounts">("transactions");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Load data
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [conns, txnPage] = await Promise.all([
        getConnections(),
        getTransactions({ page: 1, pageSize: 50, search: searchDebounced || undefined }),
      ]);
      setConnections(conns);
      setTransactions(txnPage.transactions);
      setTotalTxns(txnPage.total);
      setPage(1);
    } catch (err: any) {
      console.error("[Banking] Load failed:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchDebounced]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load more transactions (pagination)
  const loadMore = useCallback(async () => {
    if (transactions.length >= totalTxns) return;
    try {
      const next = page + 1;
      const txnPage = await getTransactions({
        page: next,
        pageSize: 50,
        search: searchDebounced || undefined,
      });
      setTransactions((prev) => [...prev, ...txnPage.transactions]);
      setPage(next);
    } catch (err: any) {
      console.error("[Banking] Load more failed:", err.message);
    }
  }, [page, totalTxns, transactions.length, searchDebounced]);

  // ── Plaid Link ───────────────────────────────────────

  const handleConnectBank = useCallback(async () => {
    setConnecting(true);
    try {
      const { linkToken } = await createLinkToken();

      create({ token: linkToken });

      open({
        onSuccess: async (success: LinkSuccess) => {
          try {
            const account = success.metadata.accounts[0];
            const institution = success.metadata.institution;
            if (!account) {
              Alert.alert("Error", "No account was selected.");
              return;
            }
            await exchangeAndConnect({
              publicToken: success.publicToken,
              account: {
                id: account.id,
                name: account.name ?? undefined,
                mask: account.mask ?? undefined,
                type: String(account.type ?? "") || undefined,
                subtype: String(account.subtype ?? "") || undefined,
              },
              institution: institution
                ? {
                    institution_id: institution.id ?? undefined,
                    name: institution.name ?? undefined,
                  }
                : undefined,
            });
            Alert.alert("Connected", "Bank account connected and transactions are syncing.");
            loadData(true);
          } catch (err: any) {
            Alert.alert("Connection Failed", err.message || "Could not connect bank account.");
          }
        },
        onExit: (exit: LinkExit) => {
          if (exit.error) {
            console.error("[Plaid] Link exit error:", exit.error);
          }
        },
      });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not start bank connection.");
    } finally {
      setConnecting(false);
    }
  }, [loadData]);

  // ── Sync ─────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const results = await syncAllConnections();
      const totalAdded = results.reduce((s, r) => s + r.added, 0);
      const totalModified = results.reduce((s, r) => s + r.modified, 0);
      Alert.alert("Sync Complete", `${totalAdded} new, ${totalModified} updated transactions.`);
      loadData(true);
    } catch (err: any) {
      Alert.alert("Sync Failed", err.message || "Could not sync transactions.");
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  // ── Disconnect ───────────────────────────────────────

  const handleDisconnect = useCallback(async (conn: BankConnection) => {
    Alert.alert(
      "Disconnect Account",
      `Remove ${conn.institutionName ?? "this account"} (••${conn.accountMask ?? ""})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await disconnectBank(conn.id);
              loadData(true);
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not disconnect.");
            }
          },
        },
      ],
    );
  }, [loadData]);

  // ── Render helpers ───────────────────────────────────

  const renderTransaction = ({ item }: { item: BankTransaction }) => {
    const isInflow = item.amount < 0;
    return (
      <View style={s.txnRow}>
        <View style={s.txnLeft}>
          <Text style={s.txnName} numberOfLines={1}>
            {item.merchantName || item.name}
          </Text>
          <Text style={s.txnMeta}>
            {formatDate(item.date)}
            {item.primaryCategory ? ` · ${item.primaryCategory.replace(/_/g, " ")}` : ""}
            {item.pending ? " · Pending" : ""}
          </Text>
        </View>
        <Text style={[s.txnAmount, isInflow ? s.txnInflow : s.txnOutflow]}>
          {formatCurrency(item.amount)}
        </Text>
      </View>
    );
  };

  const renderConnection = ({ item }: { item: BankConnection }) => (
    <View style={s.connCard}>
      <View style={s.connLeft}>
        <View style={s.connHeader}>
          <View style={[s.statusDot, { backgroundColor: statusColor(item.status) }]} />
          <Text style={s.connInstitution}>{item.institutionName ?? "Bank Account"}</Text>
        </View>
        <Text style={s.connDetail}>
          {item.accountName ?? item.accountType ?? "Account"}
          {item.accountMask ? ` ••${item.accountMask}` : ""}
        </Text>
        <Text style={s.connMeta}>
          {item._count.transactions} transactions
          {item.lastSyncedAt ? ` · Synced ${formatDate(item.lastSyncedAt)}` : ""}
        </Text>
      </View>
      <Pressable
        style={s.disconnectBtn}
        onPress={() => handleDisconnect(item)}
      >
        <Text style={s.disconnectText}>×</Text>
      </Pressable>
    </View>
  );

  // ── Main render ──────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingText}>Loading accounts...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={onBack} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </Pressable>
        <Text style={s.title}>Banking</Text>
        <View style={s.headerActions}>
          <Pressable
            style={[s.headerBtn, syncing && s.headerBtnDisabled]}
            onPress={handleSync}
            disabled={syncing}
          >
            <Text style={s.headerBtnText}>{syncing ? "Syncing..." : "Sync"}</Text>
          </Pressable>
          <Pressable
            style={[s.connectBtn, connecting && s.headerBtnDisabled]}
            onPress={handleConnectBank}
            disabled={connecting}
          >
            <Text style={s.connectBtnText}>{connecting ? "..." : "+ Connect"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Summary bar */}
      {connections.length > 0 && (
        <View style={s.summaryBar}>
          <Text style={s.summaryText}>
            {connections.filter((c) => c.status === "ACTIVE").length} account{connections.length !== 1 ? "s" : ""} connected
            {" · "}
            {totalTxns.toLocaleString()} transactions
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabBar}>
        <Pressable
          style={[s.tab, tab === "transactions" && s.tabActive]}
          onPress={() => setTab("transactions")}
        >
          <Text style={[s.tabText, tab === "transactions" && s.tabTextActive]}>Transactions</Text>
        </Pressable>
        <Pressable
          style={[s.tab, tab === "accounts" && s.tabActive]}
          onPress={() => setTab("accounts")}
        >
          <Text style={[s.tabText, tab === "accounts" && s.tabTextActive]}>Accounts</Text>
        </Pressable>
      </View>

      {tab === "transactions" ? (
        <>
          {/* Search */}
          <View style={s.searchBar}>
            <TextInput
              style={s.searchInput}
              placeholder="Search transactions..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {transactions.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>
                {connections.length === 0 ? "No accounts connected" : "No transactions yet"}
              </Text>
              <Text style={s.emptySubtitle}>
                {connections.length === 0
                  ? "Tap \"+ Connect\" to link your bank or Apple Card"
                  : "Tap \"Sync\" to pull the latest transactions"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={(t) => t.id}
              renderItem={renderTransaction}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => { setRefreshing(true); loadData(); }}
                  tintColor={colors.primary}
                />
              }
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              contentContainerStyle={s.listContent}
            />
          )}
        </>
      ) : (
        <>
          {connections.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>No accounts connected</Text>
              <Text style={s.emptySubtitle}>
                Tap "+ Connect" to link a bank account.{"\n"}
                On iOS, select Apple to connect your Apple Card via FinanceKit.
              </Text>
            </View>
          ) : (
            <FlatList
              data={connections}
              keyExtractor={(c) => c.id}
              renderItem={renderConnection}
              contentContainerStyle={s.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => { setRefreshing(true); loadData(); }}
                  tintColor={colors.primary}
                />
              }
            />
          )}
        </>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  loadingText: { marginTop: 12, color: colors.textMuted, fontSize: 14 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    backgroundColor: colors.background,
  },
  backBtn: { paddingRight: 12 },
  backText: { color: colors.primaryLight, fontSize: 16, fontWeight: "600" },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  headerBtnDisabled: { opacity: 0.5 },
  headerBtnText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  connectBtnText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: "700" },

  // Summary bar
  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  summaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },

  // Tabs
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // Search
  searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  // Transaction rows
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  txnLeft: { flex: 1 },
  txnName: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  txnMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  txnAmount: { fontSize: 15, fontWeight: "700", textAlign: "right", minWidth: 80 },
  txnInflow: { color: colors.success },
  txnOutflow: { color: colors.textPrimary },

  // Connection cards
  connCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  connLeft: { flex: 1 },
  connHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  connInstitution: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  connDetail: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  connMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  disconnectBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.errorLight,
    alignItems: "center",
    justifyContent: "center",
  },
  disconnectText: { color: colors.error, fontSize: 18, fontWeight: "700" },

  // Empty state
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  listContent: { paddingBottom: 80 },
});
