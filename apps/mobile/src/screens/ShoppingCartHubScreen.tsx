import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SectionList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  listAllCartsForHub,
  type ShoppingCartWithProject,
  type CartStatus,
} from "../api/procurement";
import { colors } from "../theme/colors";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onSelectCart: (cart: ShoppingCartWithProject) => void;
  onNewCart?: () => void;
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

const ACTIVE_STATUSES: CartStatus[] = ["DRAFT", "READY", "IN_PROGRESS"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function ShoppingCartHubScreen({ onBack, onSelectCart, onNewCart }: Props) {
  const [carts, setCarts] = useState<ShoppingCartWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [collapsedCompleted, setCollapsedCompleted] = useState(false);

  const loadCarts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await listAllCartsForHub();
      setCarts(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCarts();
  }, [loadCarts]);

  // Filter + section
  const sections = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? carts.filter(
          (c) =>
            c.label?.toLowerCase().includes(q) ||
            c.projectName.toLowerCase().includes(q),
        )
      : carts;

    const active = filtered.filter((c) => ACTIVE_STATUSES.includes(c.status));
    const completed = filtered.filter((c) => c.status === "COMPLETED");

    const result: { title: string; data: ShoppingCartWithProject[] }[] = [];
    result.push({ title: `Active Carts (${active.length})`, data: active });
    if (!collapsedCompleted) {
      result.push({ title: `Completed (${completed.length})`, data: completed });
    } else {
      result.push({ title: `Completed (${completed.length})`, data: [] });
    }
    return result;
  }, [carts, search, collapsedCompleted]);

  // ── Render ──────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: ShoppingCartWithProject }) => (
    <Pressable
      style={[s.cartCard, item.status === "COMPLETED" && s.cartCardCompleted]}
      onPress={() => {
        void Haptics.selectionAsync();
        onSelectCart(item);
      }}
    >
      <View style={s.cartTop}>
        <Text style={s.cartLabel} numberOfLines={1}>
          {item.label || "Shopping Cart"}
        </Text>
        <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[item.status] + "20" }]}>
          <Text style={[s.statusText, { color: STATUS_COLOR[item.status] }]}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>
      </View>
      <Text style={s.cartProject} numberOfLines={1}>
        📋 {item.projectName}
      </Text>
      <View style={s.cartBottom}>
        <Text style={s.cartMeta}>
          {item.itemCount} item{item.itemCount !== 1 ? "s" : ""}
        </Text>
        <Text style={s.cartMeta}>{item.horizon.replace("_", " ")}</Text>
        <Text style={s.cartMeta}>{formatDate(item.createdAt)}</Text>
      </View>
    </Pressable>
  );

  const renderSectionHeader = ({ section }: { section: { title: string } }) => {
    const isCompleted = section.title.startsWith("Completed");
    return (
      <Pressable
        style={s.sectionHeader}
        onPress={
          isCompleted
            ? () => {
                void Haptics.selectionAsync();
                setCollapsedCompleted((p) => !p);
              }
            : undefined
        }
      >
        <Text style={[s.sectionTitle, isCompleted && s.sectionTitleMuted]}>
          {section.title}
        </Text>
        {isCompleted && (
          <Text style={s.sectionChevron}>{collapsedCompleted ? "▸" : "▾"}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={onBack}>
          <Text style={s.headerLink}>← Back</Text>
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>🛒 Shopping Carts</Text>
        </View>
        {onNewCart && (
          <Pressable onPress={onNewCart}>
            <Text style={s.headerLink}>+ New</Text>
          </Pressable>
        )}
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search carts or projects..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {error ? (
        <View style={s.errorWrap}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => loadCarts()}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadCarts(true)} />
          }
          ListEmptyComponent={
            <Text style={s.emptyText}>No shopping carts found.</Text>
          }
          stickySectionHeadersEnabled={false}
        />
      )}
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
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },

  searchWrap: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.background },
  searchInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },

  listContent: { paddingHorizontal: 12, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  sectionTitleMuted: { color: colors.textMuted },
  sectionChevron: { fontSize: 14, color: colors.textMuted },

  cartCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  cartCardCompleted: { opacity: 0.6 },
  cartTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cartLabel: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "700" },
  cartProject: { fontSize: 13, color: colors.primary, marginBottom: 6 },
  cartBottom: { flexDirection: "row", gap: 12 },
  cartMeta: { fontSize: 11, color: colors.textMuted },

  errorWrap: { alignItems: "center", marginTop: 40 },
  errorText: { color: colors.error, fontSize: 13, marginBottom: 8 },
  retryText: { color: colors.primary, fontWeight: "600" },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 13 },
});
