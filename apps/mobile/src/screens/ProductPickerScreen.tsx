import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from "react-native";
import { colors } from "../theme/colors";
import { listVendorCatalogs, listProducts, createSelection } from "../api/selections";
import type { VendorCatalogItem, VendorProductItem } from "../api/selections";

const CATEGORIES = ["ALL", "BASE", "WALL", "CORNER", "VANITY", "ACCESSORY", "COUNTERTOP"] as const;

export function ProductPickerScreen({
  projectId,
  roomId,
  onBack,
  onProductAdded,
}: {
  projectId: string;
  roomId: string;
  onBack: () => void;
  onProductAdded: () => void;
}) {
  const [catalogs, setCatalogs] = useState<VendorCatalogItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [products, setProducts] = useState<VendorProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [adding, setAdding] = useState<string | null>(null);

  // Load catalogs on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await listVendorCatalogs();
        setCatalogs(data);
        if (data.length > 0) setSelectedCatalogId(data[0].id);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load products when catalog changes
  useEffect(() => {
    if (!selectedCatalogId) return;
    setLoadingProducts(true);
    (async () => {
      try {
        const data = await listProducts(selectedCatalogId);
        setProducts(data);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, [selectedCatalogId]);

  const filtered = useMemo(() => {
    let list = products;
    if (category !== "ALL") {
      list = list.filter((p) => p.category?.toUpperCase() === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, category, search]);

  const handleAdd = useCallback(
    async (product: VendorProductItem) => {
      setAdding(product.id);
      try {
        await createSelection(projectId, {
          roomId,
          vendorProductId: product.id,
          position: "A",
          quantity: 1,
        });
        Alert.alert("Added", `${product.name} added to room.`);
        onProductAdded();
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : String(e));
      } finally {
        setAdding(null);
      }
    },
    [projectId, roomId, onProductAdded],
  );

  const renderProduct = useCallback(
    ({ item }: { item: VendorProductItem }) => {
      const dims = [item.width, item.height, item.depth]
        .filter(Boolean)
        .map((d) => `${d}"`)
        .join(" × ");

      return (
        <View style={styles.productCard}>
          <View style={styles.productRow}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={styles.thumbIcon}>📦</Text>
              </View>
            )}
            <View style={styles.productInfo}>
              <Text style={styles.productName} numberOfLines={2}>
                {item.name}
              </Text>
              {item.sku && <Text style={styles.sku}>{item.sku}</Text>}
              {dims ? <Text style={styles.dims}>{dims}</Text> : null}
              {item.description ? (
                <Text style={styles.desc} numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <View style={styles.priceAddCol}>
              {item.price != null && <Text style={styles.price}>${item.price.toFixed(0)}</Text>}
              <Pressable
                style={[styles.addButton, adding === item.id && styles.addButtonDisabled]}
                onPress={() => handleAdd(item)}
                disabled={adding === item.id}
              >
                {adding === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addButtonText}>+ Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      );
    },
    [adding, handleAdd],
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Product Catalog</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Catalog picker (if multiple) */}
      {catalogs.length > 1 && (
        <View style={styles.catalogRow}>
          {catalogs.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.catalogChip, selectedCatalogId === c.id && styles.catalogChipActive]}
              onPress={() => setSelectedCatalogId(c.id)}
            >
              <Text
                style={[
                  styles.catalogChipText,
                  selectedCatalogId === c.id && styles.catalogChipTextActive,
                ]}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Category filter */}
      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.catChip, category === cat && styles.catChipActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Product list */}
      {loadingProducts ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {search || category !== "ALL" ? "No products match your filters." : "No products in this catalog."}
              </Text>
            </View>
          }
        />
      )}

      {/* Result count */}
      {!loadingProducts && filtered.length > 0 && (
        <View style={styles.countBar}>
          <Text style={styles.countText}>
            {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            {category !== "ALL" ? ` in ${category}` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  link: { fontSize: 14, color: colors.primary, fontWeight: "500" },
  catalogRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
  },
  catalogChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
  },
  catalogChipActive: { backgroundColor: colors.primary },
  catalogChipText: { fontSize: 13, fontWeight: "500", color: "#475569" },
  catalogChipTextActive: { color: "#fff" },
  searchRow: { paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#1e293b",
  },
  categoryRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: "wrap",
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  catChipActive: { backgroundColor: "#dbeafe" },
  catChipText: { fontSize: 12, fontWeight: "500", color: "#64748b" },
  catChipTextActive: { color: "#1e40af", fontWeight: "600" },
  listContent: { padding: 16, gap: 10, paddingBottom: 80 },
  productCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  productRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 6 },
  thumbPlaceholder: { backgroundColor: "#f1f5f9", justifyContent: "center", alignItems: "center" },
  thumbIcon: { fontSize: 24 },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  sku: { fontSize: 11, color: "#94a3b8", marginTop: 1 },
  dims: { fontSize: 11, color: "#94a3b8" },
  desc: { fontSize: 11, color: "#64748b", marginTop: 2 },
  priceAddCol: { alignItems: "flex-end", gap: 6 },
  price: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 14, color: "#64748b", textAlign: "center" },
  countBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 8,
    alignItems: "center",
  },
  countText: { fontSize: 12, color: "#64748b" },
});
