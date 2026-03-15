import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  listAllCarts,
  listAllCartsIncludeCompleted,
  getCart,
  consolidateCarts,
  type CartSummary,
  type ShoppingCartItem,
  type ConsolidatedPurchase,
} from "../api/procurement";
import { colors } from "../theme/colors";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  READY: colors.primary,
  IN_PROGRESS: "#f59e0b",
  COMPLETED: colors.success,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtCurrency(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function GroupShoppingCartScreen({ onBack }: Props) {
  // ── View mode ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"dashboard" | "consolidated">("dashboard");

  // ── Cart data ─────────────────────────────────────────────────────────
  const [carts, setCarts] = useState<CartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  // ── Expanded carts + lazy-loaded items ────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cartItems, setCartItems] = useState<Map<string, ShoppingCartItem[]>>(new Map());
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

  // ── Selection: cartId → Set<itemId>  ──────────────────────────────────
  const [selectedItems, setSelectedItems] = useState<Map<string, Set<string>>>(new Map());

  // ── Consolidated result ───────────────────────────────────────────────
  const [consolidated, setConsolidated] = useState<ConsolidatedPurchase | null>(null);
  const [consolidating, setConsolidating] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // ═══════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════

  const loadCarts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = filter === "all" ? await listAllCartsIncludeCompleted() : await listAllCarts();
      setCarts(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { void loadCarts(); }, [loadCarts]);

  // Lazy-load items when a cart is expanded
  const loadCartItems = useCallback(async (cartId: string) => {
    if (cartItems.has(cartId)) return;
    setLoadingItems((prev) => new Set(prev).add(cartId));
    try {
      const full = await getCart(cartId);
      setCartItems((prev) => new Map(prev).set(cartId, full.items ?? []));
    } catch {
      // silently fail — the user can try expanding again
    } finally {
      setLoadingItems((prev) => { const n = new Set(prev); n.delete(cartId); return n; });
    }
  }, [cartItems]);

  const toggleExpand = useCallback((cartId: string) => {
    void Haptics.selectionAsync();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cartId)) { next.delete(cartId); } else { next.add(cartId); void loadCartItems(cartId); }
      return next;
    });
  }, [loadCartItems]);

  // ═══════════════════════════════════════════════════════════════════════
  // SELECTION — two-level: cart (all items) + individual items
  // ═══════════════════════════════════════════════════════════════════════

  const toggleCartSelection = useCallback((cartId: string) => {
    void Haptics.selectionAsync();
    const items = cartItems.get(cartId);
    if (!items) return;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(cartId);
      if (current && current.size === items.length) {
        next.delete(cartId);
      } else {
        next.set(cartId, new Set(items.map((i) => i.id)));
      }
      return next;
    });
  }, [cartItems]);

  const toggleItemSelection = useCallback((cartId: string, itemId: string) => {
    void Haptics.selectionAsync();
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(cartId) ?? new Set<string>();
      const updated = new Set(current);
      if (updated.has(itemId)) updated.delete(itemId); else updated.add(itemId);
      if (updated.size === 0) next.delete(cartId); else next.set(cartId, updated);
      return next;
    });
  }, []);

  const selectAllCarts = useCallback(() => {
    const next = new Map<string, Set<string>>();
    for (const cart of carts) {
      const items = cartItems.get(cart.id);
      if (items?.length) next.set(cart.id, new Set(items.map((i) => i.id)));
    }
    setSelectedItems(next);
  }, [carts, cartItems]);

  const clearSelection = useCallback(() => { setSelectedItems(new Map()); }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // DERIVED STATS
  // ═══════════════════════════════════════════════════════════════════════

  const dashStats = useMemo(() => {
    let totalItems = 0;
    let estCost = 0;
    const projectIds = new Set<string>();
    for (const c of carts) {
      totalItems += c.itemCount;
      projectIds.add(c.projectId);
    }
    for (const items of cartItems.values()) {
      for (const i of items) {
        estCost += (i.bestUnitPrice ?? i.unitPrice ?? 0) * i.cartQty;
      }
    }
    return { cartCount: carts.length, projectCount: projectIds.size, totalItems, estCost };
  }, [carts, cartItems]);

  const selectionStats = useMemo(() => {
    let itemCount = 0;
    let totalQty = 0;
    let estCost = 0;
    const projectIds = new Set<string>();
    for (const [cartId, itemIds] of selectedItems) {
      const cart = carts.find((c) => c.id === cartId);
      if (cart) projectIds.add(cart.projectId);
      const items = cartItems.get(cartId);
      if (!items) continue;
      for (const item of items) {
        if (itemIds.has(item.id)) {
          itemCount++;
          totalQty += item.cartQty;
          estCost += (item.bestUnitPrice ?? item.unitPrice ?? 0) * item.cartQty;
        }
      }
    }
    return { itemCount, totalQty, estCost, projectCount: projectIds.size, cartCount: selectedItems.size };
  }, [selectedItems, carts, cartItems]);

  const hasSelection = selectionStats.itemCount > 0;

  // ═══════════════════════════════════════════════════════════════════════
  // CONSOLIDATE
  // ═══════════════════════════════════════════════════════════════════════

  const runConsolidate = useCallback(async () => {
    if (!hasSelection) return;
    setConsolidating(true);
    setError(null);
    try {
      const cartIds = Array.from(selectedItems.keys());
      const result = await consolidateCarts(cartIds);
      // Filter result to only include selected items (item-level granularity)
      const selectedItemIds = new Set<string>();
      for (const ids of selectedItems.values()) for (const id of ids) selectedItemIds.add(id);
      const filteredLines = result.lines.map((line) => ({
        ...line,
        allocations: line.allocations.filter((a) => selectedItemIds.has(a.itemId)),
      })).filter((line) => line.allocations.length > 0).map((line) => ({
        ...line,
        totalQty: line.allocations.reduce((sum, a) => sum + a.qty, 0),
      }));
      const totalEstimatedCost = filteredLines.reduce(
        (sum, l) => sum + (l.bestKnownPrice ?? 0) * l.totalQty, 0,
      );
      setConsolidated({
        ...result,
        lines: filteredLines,
        totalItems: filteredLines.length,
        totalEstimatedCost,
      });
      setMode("consolidated");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConsolidating(false);
    }
  }, [hasSelection, selectedItems]);

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION LIST DATA — carts as sections, items as rows
  // ═══════════════════════════════════════════════════════════════════════

  const sections = useMemo(() => {
    return carts.map((cart) => {
      const isExpanded = expandedIds.has(cart.id);
      const items = isExpanded ? (cartItems.get(cart.id) ?? []) : [];
      return { cart, data: items };
    });
  }, [carts, expandedIds, cartItems]);

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <View style={s.container}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        {mode === "consolidated" ? (
          <Pressable onPress={() => setMode("dashboard")}>
            <Text style={s.headerLink}>← Dashboard</Text>
          </Pressable>
        ) : onBack ? (
          <Pressable onPress={onBack}>
            <Text style={s.headerLink}>← Back</Text>
          </Pressable>
        ) : (
          <View style={{ width: 50 }} />
        )}
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{mode === "consolidated" ? "📦 Consolidated Order" : "📦 NexBUY"}</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)}><Text style={s.errorDismiss}>✕</Text></Pressable>
        </View>
      )}

      {/* ════════════ DASHBOARD MODE ════════════ */}
      {mode === "dashboard" && (
        <>
          {/* Dashboard stats bar */}
          <View style={s.statsBar}>
            <View style={s.statCard}>
              <Text style={s.statNum}>{dashStats.cartCount}</Text>
              <Text style={s.statLabel}>Carts</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNum}>{dashStats.projectCount}</Text>
              <Text style={s.statLabel}>Projects</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNum}>{dashStats.totalItems}</Text>
              <Text style={s.statLabel}>Items</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: colors.success }]}>{fmtCurrency(dashStats.estCost)}</Text>
              <Text style={s.statLabel}>Est. Total</Text>
            </View>
          </View>

          {/* Toolbar: filter + select all / clear */}
          <View style={s.toolbar}>
            <View style={s.filterRow}>
              {(["open", "all"] as const).map((f) => (
                <Pressable key={f} style={[s.chip, filter === f && s.chipActive]} onPress={() => setFilter(f)}>
                  <Text style={[s.chipText, filter === f && s.chipTextActive]}>{f === "open" ? "Open" : "All"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.filterRow}>
              {hasSelection && (
                <Pressable onPress={clearSelection}><Text style={s.toolbarLink}>Clear</Text></Pressable>
              )}
              <Pressable onPress={selectAllCarts}><Text style={s.toolbarLink}>Select All</Text></Pressable>
            </View>
          </View>

          {/* Cart sections with inline items */}
          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={s.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadCarts(true)} />}
              renderSectionHeader={({ section }) => {
                const { cart } = section;
                const isExpanded = expandedIds.has(cart.id);
                const items = cartItems.get(cart.id);
                const selectedForCart = selectedItems.get(cart.id);
                const allSelected = items ? (selectedForCart?.size === items.length && items.length > 0) : false;
                const someSelected = selectedForCart ? selectedForCart.size > 0 : false;
                const itemEstCost = items
                  ? items.reduce((sum, i) => sum + (i.bestUnitPrice ?? i.unitPrice ?? 0) * i.cartQty, 0)
                  : 0;

                return (
                  <View style={[s.cartSection, isExpanded && s.cartSectionExpanded]}>
                    <Pressable style={s.cartRow} onPress={() => toggleExpand(cart.id)}>
                      {/* Selection checkbox — only visible when items are loaded */}
                      {items && (
                        <Pressable onPress={() => toggleCartSelection(cart.id)} hitSlop={8}>
                          <Text style={s.checkbox}>
                            {allSelected ? "☑" : someSelected ? "◧" : "☐"}
                          </Text>
                        </Pressable>
                      )}
                      <View style={{ flex: 1, marginLeft: items ? 8 : 0 }}>
                        <View style={s.cartHeaderRow}>
                          <Text style={s.cartProject} numberOfLines={1}>{cart.projectName}</Text>
                          <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[cart.status] ?? "#94a3b8" }]}>
                            <Text style={s.statusText}>{cart.status}</Text>
                          </View>
                        </View>
                        <Text style={s.cartLabel} numberOfLines={1}>{cart.label ?? "Shopping Cart"}</Text>
                        <View style={s.cartMeta}>
                          <Text style={s.metaText}>{cart.itemCount} item{cart.itemCount !== 1 ? "s" : ""}</Text>
                          {itemEstCost > 0 && (
                            <>
                              <Text style={s.metaDot}>·</Text>
                              <Text style={[s.metaText, { color: colors.success, fontWeight: "700" }]}>
                                ${itemEstCost.toFixed(0)}
                              </Text>
                            </>
                          )}
                          <Text style={s.metaDot}>·</Text>
                          <Text style={s.metaText}>{fmtDate(cart.updatedAt)}</Text>
                          {cart.createdBy && (
                            <>
                              <Text style={s.metaDot}>·</Text>
                              <Text style={s.metaText} numberOfLines={1}>{cart.createdBy}</Text>
                            </>
                          )}
                        </View>
                      </View>
                      {loadingItems.has(cart.id) ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={s.expandChevron}>{isExpanded ? "▲" : "▼"}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              }}
              renderItem={({ item, section }) => {
                const cartId = section.cart.id;
                const isSelected = selectedItems.get(cartId)?.has(item.id) ?? false;
                const lineTotal = (item.bestUnitPrice ?? item.unitPrice ?? 0) * item.cartQty;
                return (
                  <Pressable
                    style={[s.itemRow, isSelected && s.itemRowSelected]}
                    onPress={() => toggleItemSelection(cartId, item.id)}
                  >
                    <Text style={s.itemCheckbox}>{isSelected ? "☑" : "☐"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemDesc} numberOfLines={2}>{item.description}</Text>
                      <View style={s.itemMeta}>
                        <Text style={s.itemQty}>{item.cartQty} {item.unit ?? ""}</Text>
                        {lineTotal > 0 && (
                          <Text style={s.itemPrice}>
                            @ ${(item.bestUnitPrice ?? item.unitPrice ?? 0).toFixed(2)} = ${lineTotal.toFixed(2)}
                          </Text>
                        )}
                      </View>
                      {item.bestSupplierName && (
                        <Text style={s.itemSupplier}>{item.bestSupplierName}</Text>
                      )}
                    </View>
                    <View style={s.itemStatusWrap}>
                      <Text style={[s.itemStatusBadge, {
                        color: item.status === "PURCHASED" ? colors.success
                          : item.status === "SOURCED" ? "#f59e0b"
                          : colors.textMuted,
                      }]}>
                        {item.status === "PURCHASED" ? "✓" : item.status === "SOURCED" ? "◎" : "○"}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              renderSectionFooter={({ section }) => {
                if (!expandedIds.has(section.cart.id)) return null;
                const items = cartItems.get(section.cart.id);
                if (!items || items.length > 0) return null;
                return (
                  <View style={s.emptyCartMsg}>
                    <Text style={s.emptyCartText}>No items in this cart</Text>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>
                    {filter === "open" ? "No open shopping carts." : "No shopping carts found."}
                  </Text>
                </View>
              }
            />
          )}

          {/* ── Bottom bar: selection summary + consolidate ─────────── */}
          {hasSelection && (
            <View style={s.bottomBar}>
              <View style={s.bottomLeft}>
                <Text style={s.bottomCount}>
                  {selectionStats.itemCount} item{selectionStats.itemCount !== 1 ? "s" : ""} · {selectionStats.cartCount} cart{selectionStats.cartCount !== 1 ? "s" : ""} · {selectionStats.projectCount} project{selectionStats.projectCount !== 1 ? "s" : ""}
                </Text>
                <Text style={s.bottomEst}>Est. ${selectionStats.estCost.toFixed(0)}</Text>
              </View>
              <Pressable
                style={[s.consolidateBtn, consolidating && s.btnDisabled]}
                onPress={runConsolidate}
                disabled={consolidating}
              >
                {consolidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.consolidateBtnText}>Consolidate →</Text>
                )}
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* ════════════ CONSOLIDATED MODE ════════════ */}
      {mode === "consolidated" && consolidated && (
        <>
          <View style={s.statsBar}>
            <View style={s.statCard}>
              <Text style={s.statNum}>{consolidated.cartCount}</Text>
              <Text style={s.statLabel}>Carts</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNum}>{consolidated.projectCount}</Text>
              <Text style={s.statLabel}>Projects</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statNum}>{consolidated.totalItems}</Text>
              <Text style={s.statLabel}>Materials</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: colors.success }]}>
                ${consolidated.totalEstimatedCost.toFixed(0)}
              </Text>
              <Text style={s.statLabel}>Est. Total</Text>
            </View>
          </View>

          <SectionList
            sections={[{ title: "consolidated", data: consolidated.lines }]}
            keyExtractor={(item) => item.normalizedKey}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={s.listContent}
            renderSectionHeader={() => null}
            renderItem={({ item }) => {
              const isExpanded = expandedKeys.has(item.normalizedKey);
              const lineTotal = (item.bestKnownPrice ?? 0) * item.totalQty;
              return (
                <Pressable
                  style={s.consolLine}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setExpandedKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.normalizedKey)) next.delete(item.normalizedKey);
                      else next.add(item.normalizedKey);
                      return next;
                    });
                  }}
                >
                  <View style={s.consolHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.consolDesc} numberOfLines={2}>{item.description}</Text>
                      <View style={s.consolMeta}>
                        <Text style={s.consolQty}>{item.totalQty} {item.unit ?? ""}</Text>
                        {item.bestKnownPrice != null && (
                          <Text style={s.consolPrice}>@ ${item.bestKnownPrice.toFixed(2)} = ${lineTotal.toFixed(2)}</Text>
                        )}
                      </View>
                      {item.bestSupplierName && (
                        <Text style={s.consolSupplier}>Best: {item.bestSupplierName}</Text>
                      )}
                    </View>
                    <View style={s.consolRight}>
                      <Text style={s.projectBadge}>
                        {item.allocations.length} project{item.allocations.length !== 1 ? "s" : ""}
                      </Text>
                      <Text style={s.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
                    </View>
                  </View>

                  {isExpanded && (
                    <View style={s.allocations}>
                      {item.allocations.map((a) => (
                        <View key={a.itemId} style={s.allocRow}>
                          <Text style={s.allocProject} numberOfLines={1}>📋 {a.projectName}</Text>
                          <Text style={s.allocQty}>{a.qty} {item.unit ?? ""}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>No items to consolidate.</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 54 : 32, paddingBottom: 12,
    backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.borderMuted,
  },
  headerLink: { color: colors.primary, fontWeight: "600", fontSize: 16 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },

  // ── Error ───────────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fef2f2",
    padding: 12, marginHorizontal: 12, marginTop: 8, borderRadius: 8,
    borderWidth: 1, borderColor: "#fecaca",
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  errorDismiss: { fontSize: 16, color: colors.error, paddingLeft: 8 },

  // ── Dashboard stats ─────────────────────────────────────────────────────
  statsBar: {
    flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.borderMuted,
  },
  statCard: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    backgroundColor: colors.backgroundSecondary, borderRadius: 8,
  },
  statNum: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 9, color: colors.textMuted, marginTop: 2 },

  // ── Toolbar ─────────────────────────────────────────────────────────────
  toolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.borderMuted,
  },
  filterRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.borderMuted,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: "#fff" },
  toolbarLink: { fontSize: 12, fontWeight: "600", color: colors.primary },

  // ── List ─────────────────────────────────────────────────────────────────
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 140 },

  // ── Cart section ────────────────────────────────────────────────────────
  cartSection: {
    backgroundColor: colors.background, borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: colors.borderMuted, overflow: "hidden",
  },
  cartSectionExpanded: { borderColor: colors.primary, borderWidth: 1.5 },
  cartRow: {
    flexDirection: "row", alignItems: "center", padding: 12,
  },
  checkbox: { fontSize: 20, color: colors.primary },
  cartHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2,
  },
  cartProject: { fontSize: 13, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  statusText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  cartLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  cartMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  metaText: { fontSize: 10, color: colors.textMuted },
  metaDot: { fontSize: 10, color: colors.textMuted, marginHorizontal: 4 },
  expandChevron: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },

  // ── Item rows (inside expanded cart) ────────────────────────────────────
  itemRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.borderMuted, backgroundColor: "#fafbfc",
  },
  itemRowSelected: { backgroundColor: "#eff6ff" },
  itemCheckbox: { fontSize: 18, color: colors.primary, marginRight: 10 },
  itemDesc: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  itemQty: { fontSize: 11, fontWeight: "700", color: colors.primary },
  itemPrice: { fontSize: 10, color: colors.textMuted },
  itemSupplier: { fontSize: 9, color: colors.textSecondary, marginTop: 1 },
  itemStatusWrap: { marginLeft: 8 },
  itemStatusBadge: { fontSize: 14 },

  emptyCartMsg: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.borderMuted },
  emptyCartText: { fontSize: 11, color: colors.textMuted, fontStyle: "italic" },

  // ── Bottom bar ──────────────────────────────────────────────────────────
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 12,
    backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.borderMuted,
  },
  bottomLeft: { flex: 1 },
  bottomCount: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  bottomEst: { fontSize: 11, fontWeight: "700", color: colors.success, marginTop: 2 },
  consolidateBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.success },
  consolidateBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  btnDisabled: { opacity: 0.5 },

  // ── Consolidated lines ──────────────────────────────────────────────────
  consolLine: {
    backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: colors.borderMuted,
  },
  consolHeader: { flexDirection: "row", alignItems: "flex-start" },
  consolDesc: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  consolMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  consolQty: { fontSize: 12, fontWeight: "700", color: colors.primary },
  consolPrice: { fontSize: 11, color: colors.textMuted },
  consolSupplier: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  consolRight: { alignItems: "flex-end", marginLeft: 8 },
  projectBadge: {
    fontSize: 10, fontWeight: "600", color: colors.textMuted,
    backgroundColor: colors.backgroundSecondary, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, overflow: "hidden",
  },
  expandIcon: { fontSize: 10, color: colors.textMuted, marginTop: 4 },

  allocations: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderMuted },
  allocRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  allocProject: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  allocQty: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginLeft: 8 },

  emptyWrap: { justifyContent: "center", alignItems: "center", paddingTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
});
