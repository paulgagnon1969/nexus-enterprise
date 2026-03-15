import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  createCart,
  getCart,
  addCartItem,
  deleteCartItem,
  updateCartItem,
  populateFromPetl,
  runCba,
  searchSupplierCatalog,
  browseCatalog,
  fetchPetlItems,
  enrichFingerprints,
  type ShoppingCart,
  type ShoppingCartItem,
  type CbaRunResult,
  type TripPlan,
  type CatalogItem,
  type CatalogProduct,
  type FingerprintEnrichment,
} from "../api/procurement";
import { colors } from "../theme/colors";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { PriceSparkline } from "../components/PriceSparkline";
import { ProductIntelligenceSheet } from "../components/ProductIntelligenceSheet";
import type { FieldPetlItem, ProjectListItem } from "../types/api";

// ── Step Enum ────────────────────────────────────────────────────────────────

type WizardStep = "PETL_PICK" | "COSTBOOK" | "SUPPLIER_SEARCH" | "CART_REVIEW" | "CBA_RESULTS";

const STEP_META: { key: WizardStep; label: string; num: number }[] = [
  { key: "PETL_PICK", label: "Estimate", num: 1 },
  { key: "COSTBOOK", label: "Cost Book", num: 2 },
  { key: "SUPPLIER_SEARCH", label: "Search", num: 3 },
  { key: "CART_REVIEW", label: "Review", num: 4 },
  { key: "CBA_RESULTS", label: "Results", num: 5 },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  project: ProjectListItem;
  companyName?: string;
  onBack: () => void;
  onNavigateHome?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ShoppingListScreen({ project, companyName, onBack, onNavigateHome }: Props) {
  const [step, setStep] = useState<WizardStep>("PETL_PICK");
  const [cart, setCart] = useState<ShoppingCart | null>(null);
  const [cartItems, setCartItems] = useState<ShoppingCartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: PETL pick
  const [petlItems, setPetlItems] = useState<FieldPetlItem[]>([]);
  const [petlLoading, setPetlLoading] = useState(true);
  const [petlSearch, setPetlSearch] = useState("");
  const [selectedSowIds, setSelectedSowIds] = useState<Set<string>>(new Set());

  // Step 2: Costbook
  const [cbSearch, setCbSearch] = useState("");
  const [cbResults, setCbResults] = useState<CatalogItem[]>([]);
  const [cbLoading, setCbLoading] = useState(false);

  // Step 3: Supplier search
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierResults, setSupplierResults] = useState<CatalogProduct[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);

  // Step 5: CBA results
  const [cbaResult, setCbaResult] = useState<CbaRunResult | null>(null);
  const [cbaLoading, setCbaLoading] = useState(false);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState<number | null>(null);

  // NexPRINT: fingerprint enrichment
  const [fingerprints, setFingerprints] = useState<Record<string, FingerprintEnrichment>>({});
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetItem, setSheetItem] = useState<{
    title: string;
    supplier: string;
    fp: FingerprintEnrichment | null;
  } | null>(null);

  // Route / departure
  const [showDeparture, setShowDeparture] = useState(false);
  const [departureChoice, setDepartureChoice] = useState<"now" | "later">("now");

  // ── Load PETL items on mount ─────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchPetlItems(project.id);
        const raw: any[] = Array.isArray(res?.items) ? res.items : [];
        const mapped: FieldPetlItem[] = raw.map((it) => ({
          sowItemId: String(it.id),
          lineNo: Number(it.lineNo ?? 0),
          roomParticleId: it.roomParticleId ?? null,
          roomName: it.roomName ?? null,
          categoryCode: it.categoryCode ?? null,
          selectionCode: it.selectionCode ?? null,
          activity: it.activity ?? null,
          description: it.description ?? null,
          unit: it.unit ?? null,
          originalQty: typeof it.originalQty === "number" ? it.originalQty : it.qty ?? null,
          qty: typeof it.qty === "number" ? it.qty : null,
          qtyFlaggedIncorrect: !!it.qtyFlaggedIncorrect,
          qtyFieldReported: typeof it.qtyFieldReported === "number" ? it.qtyFieldReported : null,
          qtyReviewStatus: it.qtyReviewStatus ?? null,
          orgGroupCode: it.orgGroupCode ?? null,
        }));
        setPetlItems(mapped);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPetlLoading(false);
      }
    })();
  }, [project.id]);

  // Filtered PETL items
  const filteredPetl = useMemo(() => {
    if (!petlSearch.trim()) return petlItems;
    const q = petlSearch.toLowerCase();
    return petlItems.filter(
      (it) =>
        it.description?.toLowerCase().includes(q) ||
        it.roomName?.toLowerCase().includes(q) ||
        it.categoryCode?.toLowerCase().includes(q),
    );
  }, [petlItems, petlSearch]);

  // ── Create or get cart ───────────────────────────────────────────────────

  const ensureCart = useCallback(async (): Promise<ShoppingCart> => {
    if (cart) return cart;
    // Need companyId — derive from project or user context
    // For now we pass an empty string; the backend resolves from auth context
    const newCart = await createCart({
      companyId: "", // resolved server-side from JWT
      projectId: project.id,
      label: `Shopping List — ${new Date().toLocaleDateString()}`,
      horizon: "TODAY",
    });
    setCart(newCart);
    return newCart;
  }, [cart, project.id]);

  // ── PETL → Cart ──────────────────────────────────────────────────────────

  const addSelectedPetlToCart = useCallback(async () => {
    if (selectedSowIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const c = await ensureCart();
      // Add each selected PETL item to the cart
      for (const sowId of selectedSowIds) {
        const petlItem = petlItems.find((it) => it.sowItemId === sowId);
        if (!petlItem) continue;
        await addCartItem(c.id, {
          sowItemId: petlItem.sowItemId,
          description: petlItem.description ?? `Line #${petlItem.lineNo}`,
          unit: petlItem.unit ?? undefined,
          projectNeedQty: petlItem.qty ?? 1,
          cartQty: petlItem.qty ?? 1,
        });
      }
      // Refresh cart
      const updated = await getCart(c.id);
      setCart(updated);
      setCartItems(updated.items ?? []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("COSTBOOK");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSowIds, petlItems, ensureCart]);

  // ── Costbook search ──────────────────────────────────────────────────────

  const doCostbookSearch = useCallback(async () => {
    if (!cbSearch.trim()) return;
    setCbLoading(true);
    try {
      const res = await browseCatalog(cbSearch.trim());
      setCbResults(res.items ?? []);
    } catch {
      setCbResults([]);
    } finally {
      setCbLoading(false);
    }
  }, [cbSearch]);

  const addCostbookItem = useCallback(
    async (item: CatalogItem) => {
      setLoading(true);
      try {
        const c = await ensureCart();
        await addCartItem(c.id, {
          costBookItemId: item.id,
          description: item.description,
          unit: item.unit ?? undefined,
          unitPrice: item.unitPrice ?? undefined,
          projectNeedQty: 1,
          cartQty: 1,
        });
        const updated = await getCart(c.id);
        setCart(updated);
        setCartItems(updated.items ?? []);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [ensureCart],
  );

  // ── Supplier search ──────────────────────────────────────────────────────

  const doSupplierSearch = useCallback(async () => {
    if (!supplierQuery.trim()) return;
    setSupplierLoading(true);
    try {
      const zip = project.postalCode ?? undefined;
      const res = await searchSupplierCatalog(supplierQuery.trim(), { zip });
      setSupplierResults(res.products ?? []);
    } catch {
      setSupplierResults([]);
    } finally {
      setSupplierLoading(false);
    }
  }, [supplierQuery, project.postalCode]);

  const addSupplierProduct = useCallback(
    async (product: CatalogProduct) => {
      setLoading(true);
      try {
        const c = await ensureCart();
        await addCartItem(c.id, {
          description: product.title,
          unit: product.unit ?? "EA",
          unitPrice: product.price ?? undefined,
          projectNeedQty: 1,
          cartQty: 1,
        });
        const updated = await getCart(c.id);
        setCart(updated);
        setCartItems(updated.items ?? []);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [ensureCart],
  );

  // ── Cart item management ─────────────────────────────────────────────────

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!cart) return;
      try {
        await deleteCartItem(cart.id, itemId);
        setCartItems((prev) => prev.filter((i) => i.id !== itemId));
      } catch {}
    },
    [cart],
  );

  const updateQty = useCallback(
    async (itemId: string, qty: number) => {
      if (!cart || qty < 1) return;
      try {
        await updateCartItem(cart.id, itemId, { cartQty: qty });
        setCartItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, cartQty: qty } : i)));
      } catch {}
    },
    [cart],
  );

  // ── Submit CBA ───────────────────────────────────────────────────────────

  const submitCba = useCallback(async () => {
    if (!cart) return;
    setCbaLoading(true);
    setCbaResult(null);
    setError(null);
    try {
      const zip = project.postalCode ?? undefined;
      const result = await runCba(cart.id, zip);
      setCbaResult(result);
      setStep("CBA_RESULTS");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // NexPRINT: batch-enrich CBA items with fingerprint data (fire-and-forget)
      const lookups: Array<{ supplierKey: string; productId: string }> = [];
      for (const plan of result.tripPlans) {
        for (const sup of plan.suppliers) {
          for (const si of sup.items) {
            if (si.productId) {
              lookups.push({ supplierKey: sup.key, productId: si.productId });
            }
          }
        }
      }
      if (lookups.length > 0) {
        enrichFingerprints(lookups)
          .then((fps) => setFingerprints(fps))
          .catch(() => {}); // non-fatal
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCbaLoading(false);
    }
  }, [cart, project.postalCode]);

  // ── Open Maps with waypoints ─────────────────────────────────────────────

  const openInMaps = useCallback((plan: TripPlan) => {
    const localStops = plan.suppliers.filter((s) => s.fulfillmentType !== "SHIP_TO_SITE");
    if (localStops.length === 0) return;

    // Build Apple Maps / Google Maps URL with waypoints
    const addresses = localStops.map((s) => encodeURIComponent(s.address ?? s.name));
    if (Platform.OS === "ios") {
      // Apple Maps: saddr=current&daddr=stop1+to:stop2
      const daddr = addresses.join("+to:");
      Linking.openURL(`http://maps.apple.com/?saddr=Current+Location&daddr=${daddr}&dirflg=d`);
    } else {
      // Google Maps
      const waypoints = addresses.slice(0, -1).join("|");
      const dest = addresses[addresses.length - 1];
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&origin=current+location&destination=${dest}&waypoints=${waypoints}&travelmode=driving`,
      );
    }
  }, []);

  // ── Step index for progress bar ──────────────────────────────────────────

  const stepIdx = STEP_META.findIndex((s) => s.key === step);

  // ── Estimated total ──────────────────────────────────────────────────────

  const estimatedTotal = useMemo(
    () =>
      cartItems.reduce((sum, it) => sum + (it.unitPrice ?? 0) * it.cartQty, 0),
    [cartItems],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={onBack}>
          <Text style={s.headerLink}>← Back</Text>
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>🛒 Shopping List</Text>
          <Text style={s.headerSub}>{project.name}</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      {/* Step progress */}
      <View style={s.stepper}>
        {STEP_META.map((sm, idx) => (
          <View key={sm.key} style={s.stepItem}>
            <View
              style={[
                s.stepDot,
                idx <= stepIdx && s.stepDotActive,
                idx < stepIdx && s.stepDotDone,
              ]}
            >
              <Text style={[s.stepDotText, idx <= stepIdx && s.stepDotTextActive]}>
                {idx < stepIdx ? "✓" : sm.num}
              </Text>
            </View>
            <Text style={[s.stepLabel, idx <= stepIdx && s.stepLabelActive]}>
              {sm.label}
            </Text>
          </View>
        ))}
      </View>

      {error ? (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)}>
            <Text style={s.errorDismiss}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ════════ STEP 1: PETL PICK ════════ */}
      {step === "PETL_PICK" && (
        <View style={s.stepBody}>
          <Text style={s.stepTitle}>Select Items from Estimate</Text>
          <TextInput
            style={s.searchInput}
            value={petlSearch}
            onChangeText={setPetlSearch}
            placeholder="Search by description, room, category..."
            placeholderTextColor={colors.textMuted}
          />
          {petlLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <FlatList
              data={filteredPetl}
              keyExtractor={(it) => it.sowItemId}
              style={s.list}
              renderItem={({ item }) => {
                const isSelected = selectedSowIds.has(item.sowItemId);
                return (
                  <Pressable
                    style={[s.petlRow, isSelected && s.petlRowSelected]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedSowIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.sowItemId)) next.delete(item.sowItemId);
                        else next.add(item.sowItemId);
                        return next;
                      });
                    }}
                  >
                    <Text style={s.petlCheck}>{isSelected ? "☑" : "☐"}</Text>
                    <View style={s.petlInfo}>
                      <Text style={s.petlDesc} numberOfLines={2}>
                        #{item.lineNo} {item.description}
                      </Text>
                      <Text style={s.petlMeta}>
                        {item.roomName ?? ""} · {item.qty ?? "?"} {item.unit ?? ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={s.emptyText}>No PETL items found for this project.</Text>
              }
            />
          )}
          <View style={s.bottomBar}>
            <Text style={s.bottomCount}>{selectedSowIds.size} selected</Text>
            <View style={s.bottomActions}>
              <Pressable
                style={s.skipBtn}
                onPress={() => setStep("COSTBOOK")}
              >
                <Text style={s.skipBtnText}>Skip</Text>
              </Pressable>
              <Pressable
                style={[s.primaryBtn, selectedSowIds.size === 0 && s.btnDisabled]}
                onPress={addSelectedPetlToCart}
                disabled={selectedSowIds.size === 0 || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.primaryBtnText}>Add to Cart →</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ════════ STEP 2: COSTBOOK ════════ */}
      {step === "COSTBOOK" && (
        <View style={s.stepBody}>
          <Text style={s.stepTitle}>Browse Cost Book</Text>
          <View style={s.searchRow}>
            <TextInput
              style={[s.searchInput, { flex: 1 }]}
              value={cbSearch}
              onChangeText={setCbSearch}
              placeholder="Search cost book items..."
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={doCostbookSearch}
              returnKeyType="search"
            />
            <Pressable style={s.searchBtn} onPress={doCostbookSearch}>
              <Text style={s.searchBtnText}>Search</Text>
            </Pressable>
          </View>
          {cbLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <FlatList
              data={cbResults}
              keyExtractor={(it) => it.id}
              style={s.list}
              renderItem={({ item }) => (
                <Pressable
                  style={s.catalogRow}
                  onPress={() => addCostbookItem(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.catalogDesc} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={s.catalogMeta}>
                      {item.category ?? ""} · {item.unit ?? ""} ·{" "}
                      {item.unitPrice != null ? `$${item.unitPrice.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  <Text style={s.addIcon}>＋</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={s.emptyText}>
                  {cbSearch ? "No results. Try a different search." : "Search the cost book to add items."}
                </Text>
              }
            />
          )}
          <View style={s.bottomBar}>
            <Text style={s.bottomCount}>{cartItems.length} in cart</Text>
            <View style={s.bottomActions}>
              <Pressable style={s.skipBtn} onPress={() => setStep("SUPPLIER_SEARCH")}>
                <Text style={s.skipBtnText}>Skip</Text>
              </Pressable>
              <Pressable
                style={s.primaryBtn}
                onPress={() => setStep("SUPPLIER_SEARCH")}
              >
                <Text style={s.primaryBtnText}>Next →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ════════ STEP 3: SUPPLIER SEARCH ════════ */}
      {step === "SUPPLIER_SEARCH" && (
        <View style={s.stepBody}>
          <Text style={s.stepTitle}>Search Suppliers</Text>
          <View style={s.searchRow}>
            <TextInput
              style={[s.searchInput, { flex: 1 }]}
              value={supplierQuery}
              onChangeText={setSupplierQuery}
              placeholder="Search for anything (e.g. '2x4 lumber')..."
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={doSupplierSearch}
              returnKeyType="search"
            />
            <Pressable style={s.searchBtn} onPress={doSupplierSearch}>
              <Text style={s.searchBtnText}>Search</Text>
            </Pressable>
          </View>
          {supplierLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <FlatList
              data={supplierResults}
              keyExtractor={(it) => it.productId}
              style={s.list}
              renderItem={({ item }) => (
                <Pressable
                  style={s.catalogRow}
                  onPress={() => addSupplierProduct(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.catalogDesc} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={s.catalogMeta}>
                      {item.provider} ·{" "}
                      {item.price != null ? `$${item.price.toFixed(2)}` : "—"}
                      {item.inStock === false ? " · Out of stock" : ""}
                    </Text>
                  </View>
                  <Text style={s.addIcon}>＋</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={s.emptyText}>
                  {supplierQuery
                    ? "No results. Try a different search."
                    : "Search suppliers for items not in the cost book."}
                </Text>
              }
            />
          )}
          <View style={s.bottomBar}>
            <Text style={s.bottomCount}>{cartItems.length} in cart</Text>
            <View style={s.bottomActions}>
              <Pressable style={s.skipBtn} onPress={() => setStep("CART_REVIEW")}>
                <Text style={s.skipBtnText}>Skip</Text>
              </Pressable>
              <Pressable
                style={s.primaryBtn}
                onPress={() => setStep("CART_REVIEW")}
              >
                <Text style={s.primaryBtnText}>Review Cart →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ════════ STEP 4: CART REVIEW ════════ */}
      {step === "CART_REVIEW" && (
        <View style={s.stepBody}>
          <Text style={s.stepTitle}>Review Shopping Cart</Text>
          <FlatList
            data={cartItems}
            keyExtractor={(it) => it.id}
            style={s.list}
            renderItem={({ item }) => (
              <View style={s.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cartDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={s.cartMeta}>
                    {item.unit ?? ""} ·{" "}
                    {item.unitPrice != null ? `$${item.unitPrice.toFixed(2)}/ea` : ""}
                  </Text>
                </View>
                <View style={s.qtyControls}>
                  <Pressable
                    style={s.qtyBtn}
                    onPress={() => updateQty(item.id, Math.max(1, item.cartQty - 1))}
                  >
                    <Text style={s.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={s.qtyValue}>{item.cartQty}</Text>
                  <Pressable
                    style={s.qtyBtn}
                    onPress={() => updateQty(item.id, item.cartQty + 1)}
                  >
                    <Text style={s.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => removeItem(item.id)}>
                  <Text style={s.removeIcon}>✕</Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <Text style={s.emptyText}>Cart is empty. Go back to add items.</Text>
            }
          />
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Estimated Total</Text>
            <Text style={s.totalValue}>${estimatedTotal.toFixed(2)}</Text>
          </View>
          <View style={s.bottomBar}>
            <Pressable style={s.skipBtn} onPress={() => setStep("SUPPLIER_SEARCH")}>
              <Text style={s.skipBtnText}>← Back</Text>
            </Pressable>
            <Pressable
              style={[s.submitBtn, (cartItems.length === 0 || cbaLoading) && s.btnDisabled]}
              onPress={submitCba}
              disabled={cartItems.length === 0 || cbaLoading}
            >
              {cbaLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.submitBtnText}>Submit — Find Best Prices</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* ════════ STEP 5: CBA RESULTS + ROUTE ════════ */}
      {step === "CBA_RESULTS" && (
        <ScrollView style={s.stepBody} contentContainerStyle={{ paddingBottom: 100 }}>
          <Text style={s.stepTitle}>Procurement Recommendations</Text>
          {cbaResult ? (
            <>
              <Text style={s.cbaSubtitle}>
                Searched {cbaResult.itemsSearched} items across suppliers
              </Text>
              {cbaResult.tripPlans.map((plan, idx) => {
                const isSelected = selectedPlanIdx === idx;
                return (
                  <Pressable
                    key={idx}
                    style={[s.planCard, isSelected && s.planCardSelected]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedPlanIdx(idx);
                      setShowDeparture(true);
                    }}
                  >
                    <View style={s.planHeader}>
                      <Text style={s.planTitle}>
                        Plan {String.fromCharCode(65 + idx)} — {plan.stops} stop{plan.stops !== 1 ? "s" : ""}
                        {plan.onlineOrders > 0 ? ` + ${plan.onlineOrders} online` : ""}
                      </Text>
                      {plan.savings > 0 && (
                        <Text style={s.planSavings}>Save ${plan.savings.toFixed(2)}</Text>
                      )}
                    </View>
                    <View style={s.planCosts}>
                      <Text style={s.planCostItem}>Items: ${plan.itemCost.toFixed(2)}</Text>
                      <Text style={s.planCostItem}>Travel: ${plan.travelCost.toFixed(2)}</Text>
                      <Text style={s.planCostItem}>Time: ${plan.timeCost.toFixed(2)}</Text>
                      {plan.shippingCost > 0 && (
                        <Text style={s.planCostItem}>Shipping: ${plan.shippingCost.toFixed(2)}</Text>
                      )}
                    </View>
                    <Text style={s.planTotal}>Total: ${plan.totalCost.toFixed(2)}</Text>

                    {/* Per-supplier breakdown */}
                    {plan.suppliers.map((sup) => (
                      <View key={sup.key} style={s.supplierBlock}>
                        <Text style={s.supplierName}>
                          📍 {sup.name} ({sup.distanceMiles.toFixed(1)} mi)
                        </Text>
                        {sup.items.map((si) => {
                          const fpKey = si.productId ? `${sup.key}::${si.productId}` : null;
                          const fp = fpKey ? fingerprints[fpKey] : undefined;
                          return (
                          <View key={si.cartItemId} style={s.supplierItemBlock}>
                            <View style={s.supplierItemHeader}>
                              <Text style={[s.supplierItemTitle, { flex: 1 }]} numberOfLines={2}>
                                {si.productTitle ?? si.description}
                              </Text>
                              {fp && (
                                <ConfidenceBadge
                                  confidence={fp.confidence}
                                  verificationCount={fp.verificationCount}
                                  compact
                                  onPress={() => {
                                    setSheetItem({
                                      title: si.productTitle ?? si.description,
                                      supplier: sup.name,
                                      fp,
                                    });
                                    setSheetVisible(true);
                                  }}
                                />
                              )}
                            </View>
                            {si.modelNumber ? (
                              <Text style={s.supplierItemMeta}>SKU: {si.modelNumber}</Text>
                            ) : si.productId ? (
                              <Text style={s.supplierItemMeta}>ID: {si.productId}</Text>
                            ) : null}
                            {fp && fp.priceHistory.length > 1 && (
                              <PriceSparkline data={fp.priceHistory} width={100} height={20} />
                            )}
                            {si.purchaseUnit && si.pricePerPurchaseUnit != null ? (
                              <Text style={s.supplierItemPricing}>
                                ${si.pricePerPurchaseUnit.toFixed(2)}/{si.purchaseUnit}
                                {si.coveragePerPurchaseUnit ? ` (${si.coveragePerPurchaseUnit} SF/${si.purchaseUnit})` : ""}
                                {si.purchaseQty ? ` × ${si.purchaseQty}` : ""}
                                {" = $"}{si.lineTotal.toFixed(2)}
                                {si.coveragePerPurchaseUnit ? ` · $${si.unitPrice.toFixed(2)}/SF` : ""}
                              </Text>
                            ) : (
                              <Text style={s.supplierItemPricing}>
                                ${si.unitPrice.toFixed(2)} × {si.quantity} = ${si.lineTotal.toFixed(2)}
                              </Text>
                            )}
                            {si.stockQty != null ? (
                              <Text style={[s.supplierItemStock, si.stockQty < (si.purchaseQty ?? si.quantity) ? { color: "#dc2626" } : {}]}>
                                {si.stockQty >= (si.purchaseQty ?? si.quantity)
                                  ? `✓ ${si.stockQty}+ in stock`
                                  : `⚠ Only ${si.stockQty} in stock (need ${si.purchaseQty ?? si.quantity})`}
                              </Text>
                            ) : si.inStock != null ? (
                              <Text style={s.supplierItemStock}>
                                {si.inStock ? "✓ In stock" : "✗ Not in stock"}
                              </Text>
                            ) : null}
                          </View>
                          );
                        })}
                      </View>
                    ))}

                    {isSelected && (
                      <Pressable
                        style={s.selectPlanBtn}
                        onPress={() => setShowDeparture(true)}
                      >
                        <Text style={s.selectPlanBtnText}>Select This Plan</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}

              {cbaResult.tripPlans.length === 0 && (
                <Text style={s.emptyText}>
                  No supplier results found. Try adding different items.
                </Text>
              )}
            </>
          ) : (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          )}

          {/* ── Departure prompt ── */}
          {showDeparture && selectedPlanIdx != null && cbaResult?.tripPlans[selectedPlanIdx] && (
            <View style={s.departureCard}>
              <Text style={s.departureTitle}>When are you leaving?</Text>
              <View style={s.departureOptions}>
                <Pressable
                  style={[s.departureBtn, departureChoice === "now" && s.departureBtnActive]}
                  onPress={() => setDepartureChoice("now")}
                >
                  <Text style={s.departureBtnText}>🚗 Go Now</Text>
                </Pressable>
                <Pressable
                  style={[s.departureBtn, departureChoice === "later" && s.departureBtnActive]}
                  onPress={() => {
                    setDepartureChoice("later");
                    Alert.alert(
                      "Schedule Trip",
                      "Date/time picker coming soon. For now, tap 'Go Now' or 'Open in Maps' to start navigating.",
                    );
                  }}
                >
                  <Text style={s.departureBtnText}>📅 Pick a Time</Text>
                </Pressable>
              </View>
              <Pressable
                style={s.mapsBtn}
                onPress={() => openInMaps(cbaResult!.tripPlans[selectedPlanIdx!])}
              >
                <Text style={s.mapsBtnText}>Open in Maps →</Text>
              </Pressable>

              {/* Route summary */}
              <View style={s.routeSummary}>
                <Text style={s.routeTitle}>Route Summary</Text>
                {cbaResult!.tripPlans[selectedPlanIdx!].suppliers
                  .filter((sup) => sup.fulfillmentType !== "SHIP_TO_SITE")
                  .map((sup, idx) => (
                    <View key={sup.key} style={s.routeStop}>
                      <Text style={s.routeStopNum}>{idx + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.routeStopName}>{sup.name}</Text>
                        {sup.address && (
                          <Text style={s.routeStopAddr}>{sup.address}</Text>
                        )}
                        <Text style={s.routeStopItems}>
                          {sup.items.length} item{sup.items.length !== 1 ? "s" : ""} · $
                          {sup.subtotal.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* NexPRINT: Product Intelligence Sheet */}
      <ProductIntelligenceSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        productTitle={sheetItem?.title ?? ""}
        supplierName={sheetItem?.supplier ?? ""}
        fingerprint={sheetItem?.fp ?? null}
      />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════

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
  headerLink: { color: colors.primary, fontWeight: "600", fontSize: 16 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  // Stepper
  stepper: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  stepItem: { alignItems: "center", flex: 1 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepDotText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  stepDotTextActive: { color: "#fff" },
  stepLabel: { fontSize: 9, color: colors.textMuted, marginTop: 3, fontWeight: "500" },
  stepLabelActive: { color: colors.primary, fontWeight: "600" },

  // Error
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    padding: 12,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  errorDismiss: { fontSize: 16, color: colors.error, paddingLeft: 8 },

  // Step body
  stepBody: { flex: 1, padding: 12 },
  stepTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 10 },

  // Search
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    marginBottom: 8,
  },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Lists
  list: { flex: 1 },
  emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 40, fontSize: 13 },

  // PETL rows
  petlRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  petlRowSelected: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  petlCheck: { fontSize: 18, marginRight: 10, color: colors.primary },
  petlInfo: { flex: 1 },
  petlDesc: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  petlMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  // Catalog / supplier rows
  catalogRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  catalogDesc: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  catalogMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  addIcon: { fontSize: 20, color: colors.primary, fontWeight: "700", paddingLeft: 8 },

  // Cart review rows
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  cartDesc: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  cartMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  qtyControls: { flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  qtyBtnText: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  qtyValue: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginHorizontal: 8 },
  removeIcon: { fontSize: 14, color: colors.error, fontWeight: "700", paddingLeft: 4 },

  // Totals
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    marginTop: 8,
  },
  totalLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  totalValue: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  bottomCount: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  bottomActions: { flexDirection: "row", gap: 8 },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  skipBtnText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  btnDisabled: { opacity: 0.5 },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: "center",
  },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // CBA results
  cbaSubtitle: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  planCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
  },
  planCardSelected: { borderColor: colors.primary },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  planSavings: { fontSize: 12, fontWeight: "700", color: colors.success },
  planCosts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  planCostItem: { fontSize: 11, color: colors.textMuted },
  planTotal: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingTop: 8,
  },
  supplierBlock: { marginTop: 10, paddingLeft: 4 },
  supplierName: { fontSize: 13, fontWeight: "700", color: colors.primary },
  supplierItem: { fontSize: 11, color: colors.textSecondary, marginTop: 2, paddingLeft: 8 },
  supplierItemBlock: {
    marginTop: 6,
    paddingLeft: 8,
    paddingVertical: 6,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderMuted,
  },
  supplierItemHeader: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  supplierItemTitle: { fontSize: 12, fontWeight: "600", color: colors.textPrimary, lineHeight: 16 },
  supplierItemMeta: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  supplierItemPricing: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, marginTop: 3 },
  supplierItemStock: { fontSize: 10, fontWeight: "600", color: colors.success, marginTop: 2 },
  selectPlanBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  selectPlanBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // Departure
  departureCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  departureTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  departureOptions: { flexDirection: "row", gap: 10, marginBottom: 12 },
  departureBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: "center",
  },
  departureBtnActive: { borderColor: colors.primary, backgroundColor: "#eff6ff" },
  departureBtnText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  mapsBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  mapsBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // Route summary
  routeSummary: { marginTop: 16 },
  routeTitle: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  routeStop: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  routeStopNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 24,
    overflow: "hidden",
  },
  routeStopName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  routeStopAddr: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  routeStopItems: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
});
