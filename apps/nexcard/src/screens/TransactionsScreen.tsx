import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
} from "react-native";
import { colors } from "../theme/colors";
import { getTransactions } from "../db/database";
import type { Transaction } from "../types/models";

const PAGE_SIZE = 50;

export function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadTransactions = useCallback(
    async (reset = false) => {
      const offset = reset ? 0 : page * PAGE_SIZE;
      const txs = await getTransactions({
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      if (reset) {
        setTransactions(txs);
        setPage(1);
      } else {
        setTransactions((prev) => [...prev, ...txs]);
        setPage((p) => p + 1);
      }
      setHasMore(txs.length === PAGE_SIZE);
    },
    [search, page],
  );

  useEffect(() => {
    loadTransactions(true);
  }, [search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTransactions(true);
    setRefreshing(false);
  }, [loadTransactions]);

  const onEndReached = () => {
    if (hasMore && !refreshing) {
      loadTransactions(false);
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.txRow}>
      <View style={styles.txLeft}>
        <Text style={styles.txMerchant} numberOfLines={1}>
          {item.merchant ?? item.description}
        </Text>
        <View style={styles.txMeta}>
          <Text style={styles.txDate}>{item.date}</Text>
          {item.category && (
            <Text style={styles.txCategory}>{item.category}</Text>
          )}
          {item.pending && <Text style={styles.txPending}>Pending</Text>}
        </View>
      </View>
      <Text
        style={[
          styles.txAmount,
          { color: item.amount >= 0 ? colors.positive : colors.negative },
        ]}
      >
        {item.amount >= 0 ? "+" : ""}
        {formatCurrency(Math.abs(item.amount))}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(tx) => tx.id}
        renderItem={renderTransaction}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {search ? "No matching transactions" : "No transactions yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? "Try a different search term"
                : "Connect an account and sync to see transactions"}
            </Text>
          </View>
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

  searchBar: { padding: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  txLeft: { flex: 1, marginRight: 12 },
  txMerchant: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
  txMeta: { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 8 },
  txDate: { fontSize: 12, color: colors.textMuted },
  txCategory: { fontSize: 11, color: colors.accent, fontWeight: "600" },
  txPending: { fontSize: 11, color: colors.pending, fontWeight: "600" },
  txAmount: { fontSize: 15, fontWeight: "600" },

  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", maxWidth: 260 },
});
