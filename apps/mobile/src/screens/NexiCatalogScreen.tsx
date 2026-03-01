import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { colors } from "../theme/colors";
import { listEntries, removeEntry, getCatalogSize } from "../nexi/catalog";

type CatalogListItem = {
  id: string;
  name: string;
  category: string;
  thumbnailUri: string | null;
  featurePrintCount: number;
  matchCount: number;
  updatedAt: string;
};

interface Props {
  onBack: () => void;
  onEnrollNew: () => void;
}

export function NexiCatalogScreen({ onBack, onEnrollNew }: Props) {
  const [entries, setEntries] = useState<CatalogListItem[]>([]);
  const [filtered, setFiltered] = useState<CatalogListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [items, count] = await Promise.all([listEntries(), getCatalogSize()]);
      setEntries(items);
      setFiltered(items);
      setTotalCount(count);
    } catch (err) {
      console.warn("[NEXI] Failed to load catalog:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter on search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(entries);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q),
      ),
    );
  }, [search, entries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const handleDelete = (entry: CatalogListItem) => {
    Alert.alert(
      "Delete Entry",
      `Remove "${entry.name}" from the NEXI catalog? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeEntry(entry.id);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
          },
        },
      ],
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const tierColor = (matchCount: number) => {
    if (matchCount >= 10) return "#4ADE80"; // well-known
    if (matchCount >= 3) return "#D97706"; // recognized a few times
    return "#64748B"; // new
  };

  const renderItem = ({ item }: { item: CatalogListItem }) => (
    <View style={styles.entryCard}>
      {/* Thumbnail */}
      <View style={styles.thumbContainer}>
        {item.thumbnailUri ? (
          <Image source={{ uri: item.thumbnailUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>🔍</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.entryInfo}>
        <Text style={styles.entryName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.entryCategory}>{item.category}</Text>
        <View style={styles.entryMeta}>
          <Text style={styles.entryMetaText}>
            {item.featurePrintCount} prints
          </Text>
          <Text style={styles.entryMetaDot}>·</Text>
          <Text style={[styles.entryMetaText, { color: tierColor(item.matchCount) }]}>
            {item.matchCount} matches
          </Text>
          <Text style={styles.entryMetaDot}>·</Text>
          <Text style={styles.entryMetaText}>{formatDate(item.updatedAt)}</Text>
        </View>
      </View>

      {/* Delete */}
      <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item)}>
        <Text style={styles.deleteBtnText}>✕</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <View>
          <Text style={styles.title}>NEXI Catalog</Text>
          <Text style={styles.subtitle}>{totalCount} object{totalCount !== 1 ? "s" : ""} enrolled</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or category…"
          placeholderTextColor="#64748B"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color="#D97706" size="large" style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>No Objects Enrolled</Text>
          <Text style={styles.emptyDesc}>
            Use NEXI Capture to scan objects from multiple angles.
            Once enrolled, they'll be automatically recognized in future scans.
          </Text>
          <Pressable style={styles.enrollBtn} onPress={onEnrollNew}>
            <Text style={styles.enrollBtnText}>Enroll First Object</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />
          }
          ListEmptyComponent={
            <Text style={styles.noResults}>No entries match "{search}"</Text>
          }
          ListFooterComponent={
            <Pressable style={styles.enrollFooterBtn} onPress={onEnrollNew}>
              <Text style={styles.enrollFooterBtnText}>+ Enroll New Object</Text>
            </Pressable>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backText: { color: "#60A5FA", fontSize: 17 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#D97706", fontSize: 12, fontWeight: "600" },

  // Search
  searchContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1E293B", borderRadius: 10, marginHorizontal: 16,
    paddingHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#334155",
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 15, paddingVertical: 10 },
  searchClear: { color: "#64748B", fontSize: 16, padding: 4 },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  entryCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1E293B", borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  thumbContainer: { marginRight: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: "#334155", alignItems: "center", justifyContent: "center",
  },
  thumbPlaceholderText: { fontSize: 24 },
  entryInfo: { flex: 1 },
  entryName: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  entryCategory: { color: "#D97706", fontSize: 13, fontWeight: "600", marginBottom: 4 },
  entryMeta: { flexDirection: "row", alignItems: "center" },
  entryMetaText: { color: "#64748B", fontSize: 11 },
  entryMetaDot: { color: "#475569", marginHorizontal: 4 },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(220,38,38,0.15)",
    alignItems: "center", justifyContent: "center", marginLeft: 8,
  },
  deleteBtnText: { color: "#DC2626", fontSize: 14, fontWeight: "700" },

  // Empty state
  emptyState: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptyDesc: { color: "#94A3B8", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  enrollBtn: {
    backgroundColor: "#D97706", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
  },
  enrollBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Footer
  enrollFooterBtn: {
    alignItems: "center", paddingVertical: 16, marginTop: 8,
    borderWidth: 1, borderColor: "#334155", borderRadius: 10, borderStyle: "dashed",
  },
  enrollFooterBtnText: { color: "#D97706", fontSize: 15, fontWeight: "600" },

  noResults: { color: "#64748B", fontSize: 14, textAlign: "center", paddingVertical: 32 },
});
