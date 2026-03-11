import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { colors } from "../theme/colors";
import {
  getAllAccounts,
  getTransactions,
  getSpendingByCategory,
  getMonthlySpending,
} from "../db/database";
import type { Account, Transaction, SpendingByCategory, MonthlySpending } from "../types/models";

export function DashboardScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<SpendingByCategory[]>([]);
  const [monthly, setMonthly] = useState<MonthlySpending[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [accts, txs, cats, mos] = await Promise.all([
      getAllAccounts(),
      getTransactions({ limit: 10 }),
      getSpendingByCategory(30),
      getMonthlySpending(6),
    ]);
    setAccounts(accts);
    setRecentTxs(txs);
    setCategories(cats);
    setMonthly(mos);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);
  const monthlyTotal = monthly.length > 0 ? monthly[monthly.length - 1]?.total ?? 0 : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Total Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceAmount}>
          {formatCurrency(totalBalance)}
        </Text>
        <Text style={styles.balanceSub}>
          {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
        </Text>
      </View>

      {/* Monthly Spending */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Month</Text>
        <Text style={styles.monthlyAmount}>{formatCurrency(monthlyTotal)} spent</Text>
      </View>

      {/* Top Categories */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Categories (30d)</Text>
          {categories.slice(0, 5).map((cat) => (
            <View key={cat.category} style={styles.categoryRow}>
              <Text style={styles.categoryName}>{cat.category}</Text>
              <Text style={styles.categoryAmount}>{formatCurrency(cat.total)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Transactions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {recentTxs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptySubtitle}>Connect an account to get started</Text>
          </View>
        ) : (
          recentTxs.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txInfo}>
                <Text style={styles.txMerchant} numberOfLines={1}>
                  {tx.merchant ?? tx.description}
                </Text>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
              <Text
                style={[styles.txAmount, { color: tx.amount >= 0 ? colors.positive : colors.negative }]}
              >
                {tx.amount >= 0 ? "+" : ""}
                {formatCurrency(Math.abs(tx.amount))}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },

  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
  },
  balanceLabel: { color: colors.textMuted, fontSize: 14, marginBottom: 4 },
  balanceAmount: { color: colors.textOnPrimary, fontSize: 36, fontWeight: "700" },
  balanceSub: { color: "#94a3b8", fontSize: 13, marginTop: 8 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },

  monthlyAmount: { fontSize: 24, fontWeight: "600", color: colors.negative },

  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  categoryName: { fontSize: 14, color: colors.textPrimary },
  categoryAmount: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },

  txRow: {
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
  txInfo: { flex: 1, marginRight: 12 },
  txMerchant: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
  txDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "600" },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted },
});
