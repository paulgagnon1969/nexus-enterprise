import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  getCart,
  type ShoppingCart,
  type ShoppingCartItem,
  type CartStatus,
  type CartItemStatus,
} from "../api/procurement";
import { colors } from "../theme/colors";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  cartId: string;
  cartLabel?: string | null;
  projectName?: string;
  projectId: string;
  onBack: () => void;
  /** Navigate to receipt capture with origin tracking */
  onCreateReceipt: (opts: {
    projectId: string;
    receiptOrigin: "MANUAL" | "SHOPPING_CART";
    shoppingCartId?: string;
  }) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<CartStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};
const STATUS_COLOR: Record<CartStatus, string> = {
  DRAFT: colors.textMuted,
  READY: colors.primary,
  IN_PROGRESS: "#f59e0b",
  COMPLETED: colors.success,
};

const ITEM_STATUS_LABEL: Record<CartItemStatus, string> = {
  PENDING: "Pending",
  SOURCED: "Sourced",
  PURCHASED: "Purchased",
  RECEIVED: "Received",
};
const ITEM_STATUS_COLOR: Record<CartItemStatus, string> = {
  PENDING: colors.textMuted,
  SOURCED: colors.primary,
  PURCHASED: "#f59e0b",
  RECEIVED: colors.success,
};

// ── Component ────────────────────────────────────────────────────────────────

export function ShoppingCartDetailScreen({
  cartId,
  cartLabel,
  projectName,
  projectId,
  onBack,
  onCreateReceipt,
}: Props) {
  const [cart, setCart] = useState<ShoppingCart | null>(null);
  const [items, setItems] = useState<ShoppingCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCart = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await getCart(cartId);
        setCart(res);
        setItems(res.items ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cartId],
  );

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalEstimate = items.reduce(
    (sum, it) => sum + (it.unitPrice ?? 0) * it.cartQty,
    0,
  );
  const totalPurchased = items.filter((it) => it.status === "PURCHASED" || it.status === "RECEIVED").length;

  // ── Render ─────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: ShoppingCartItem }) => (
    <View style={s.itemCard}>
      <View style={s.itemTop}>
        <Text style={s.itemDesc} numberOfLines={2}>
          {item.description}
        </Text>
        <View
          style={[
            s.itemStatusBadge,
            { backgroundColor: ITEM_STATUS_COLOR[item.status] + "20" },
          ]}
        >
          <Text
            style={[s.itemStatusText, { color: ITEM_STATUS_COLOR[item.status] }]}
          >
            {ITEM_STATUS_LABEL[item.status]}
          </Text>
        </View>
      </View>
      <View style={s.itemBottom}>
        <Text style={s.itemMeta}>
          Qty: {item.cartQty}{item.purchasedQty > 0 ? ` (${item.purchasedQty} purchased)` : ""}
        </Text>
        {item.unit && <Text style={s.itemMeta}>{item.unit}</Text>}
        {item.bestSupplierName && (
          <Text style={s.itemMeta}>🏪 {item.bestSupplierName}</Text>
        )}
        {item.bestUnitPrice != null && (
          <Text style={s.itemPrice}>${item.bestUnitPrice.toFixed(2)}/ea</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={onBack}>
          <Text style={s.headerLink}>← Back</Text>
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {cartLabel || "Shopping Cart"}
          </Text>
          {projectName && (
            <Text style={s.headerSub} numberOfLines={1}>
              📋 {projectName}
            </Text>
          )}
        </View>
        {cart && (
          <View
            style={[
              s.headerBadge,
              { backgroundColor: STATUS_COLOR[cart.status] + "20" },
            ]}
          >
            <Text style={[s.headerBadgeText, { color: STATUS_COLOR[cart.status] }]}>
              {STATUS_LABEL[cart.status]}
            </Text>
          </View>
        )}
      </View>

      {/* Stats bar */}
      {cart && (
        <View style={s.statsBar}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{items.length}</Text>
            <Text style={s.statLabel}>Items</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statValue}>{totalPurchased}</Text>
            <Text style={s.statLabel}>Purchased</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statValue}>${totalEstimate.toFixed(0)}</Text>
            <Text style={s.statLabel}>Est. Total</Text>
          </View>
        </View>
      )}

      {/* Content */}
      {error ? (
        <View style={s.errorWrap}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => loadCart()}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadCart(true)} />
          }
          ListEmptyComponent={
            <Text style={s.emptyText}>No items in this cart.</Text>
          }
        />
      )}

      {/* Action buttons */}
      <View style={s.actionBar}>
        <Pressable
          style={s.receiptBtn}
          onPress={() => {
            void Haptics.impactAsync();
            onCreateReceipt({
              projectId,
              receiptOrigin: "MANUAL",
            });
          }}
        >
          <Text style={s.receiptBtnText}>🧾 Receipt</Text>
        </Pressable>
        <Pressable
          style={[s.receiptBtn, s.receiptCartBtn]}
          onPress={() => {
            void Haptics.impactAsync();
            onCreateReceipt({
              projectId,
              receiptOrigin: "SHOPPING_CART",
              shoppingCartId: cartId,
            });
          }}
        >
          <Text style={[s.receiptBtnText, s.receiptCartBtnText]}>
            🛒 Receipt (Shopping Cart)
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  headerLink: { color: colors.primary, fontWeight: "600", fontSize: 15 },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  headerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  headerBadgeText: { fontSize: 11, fontWeight: "700" },

  statsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, fontWeight: "500" },

  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 100 },

  itemCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  itemDesc: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, flex: 1, marginRight: 8 },
  itemStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  itemStatusText: { fontSize: 10, fontWeight: "700" },
  itemBottom: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  itemMeta: { fontSize: 11, color: colors.textMuted },
  itemPrice: { fontSize: 11, fontWeight: "700", color: colors.success },

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  receiptBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
  },
  receiptCartBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  receiptBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  receiptCartBtnText: { color: "#fff" },

  errorWrap: { alignItems: "center", marginTop: 40 },
  errorText: { color: colors.error, fontSize: 13, marginBottom: 8 },
  retryText: { color: colors.primary, fontWeight: "600" },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 13 },
});
