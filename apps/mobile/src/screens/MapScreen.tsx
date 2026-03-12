import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated as RNAnimated,
  Alert,
  Linking,
  Modal,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";

import { openPreferredMap } from "../utils/openPreferredMap";

/** Lightweight type matching @rnmapbox/maps ShapeSource onPress event */
interface MapPressEvent {
  features: Array<GeoJSON.Feature<GeoJSON.Geometry>>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
}
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { colors } from "../theme/colors";
import type { ProjectListItem } from "../types/api";
import {
  fetchLocalSuppliers,
  flagSupplierClosed,
  approveSupplierRemoval,
  denySupplierRemoval,
  navigateToSupplier,
  searchNearbyProducts,
  type LocalSupplier,
  type NearbySupplier,
} from "../api/localSuppliers";
import {
  searchWithAvailability as searchCatalogEnriched,
  availabilityLabel,
  availabilityColor,
  providerColor,
  providerDisplayName,
  type CatalogProduct,
  type CatalogSearchResult,
} from "../api/supplierCatalog";
import { resolveUserZip } from "../utils/resolveZip";
import { DirectionsDialog } from "../components/DirectionsDialog";

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusKey = "active" | "open" | "pending" | "completed" | "closed";

const STATUS_CHIPS: { key: StatusKey; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "#22c55e" },
  { key: "open", label: "Open", color: "#3b82f6" },
  { key: "pending", label: "Pending", color: "#f59e0b" },
  { key: "completed", label: "Completed", color: "#6366f1" },
  { key: "closed", label: "Closed", color: "#9ca3af" },
];

/** Statuses that should be hidden from the project list entirely */
const HIDDEN_STATUSES = new Set(["archived", "deleted"]);

function normalizeStatus(s?: string | null): StatusKey | null {
  const lower = s?.toLowerCase();
  if (!lower || HIDDEN_STATUSES.has(lower)) return null;
  switch (lower) {
    case "active":
    case "in_progress":
      return "active";
    case "open":
      return "open";
    case "pending":
    case "draft":
      return "pending";
    case "completed":
      return "completed";
    case "closed":
      return "closed";
    default:
      return "active";
  }
}

function statusColor(s: StatusKey | null): string {
  if (!s) return "#9ca3af";
  return STATUS_CHIPS.find((c) => c.key === s)?.color ?? "#0ea5e9";
}

// ─── Radius / location helpers ───────────────────────────────────────────────

type RadiusKey = "15" | "50" | "100" | "state" | "nation";

const RADIUS_OPTIONS: { key: RadiusKey; label: string; miles?: number }[] = [
  { key: "15", label: "15 mi", miles: 15 },
  { key: "50", label: "50 mi", miles: 50 },
  { key: "100", label: "100 mi", miles: 100 },
  { key: "state", label: "State", miles: 250 },
  { key: "nation", label: "Nation" },
];

function radiusMilesForKey(key: RadiusKey): number | null {
  return RADIUS_OPTIONS.find((o) => o.key === key)?.miles ?? null;
}

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boundsFromCenterMiles(
  center: { lat: number; lng: number },
  miles: number,
): { ne: [number, number]; sw: [number, number] } {
  // 1° latitude ≈ 69 miles
  const latPad = (miles / 69) * 1.08;
  const cosLat = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.08);
  const lngPad = (miles / (cosLat * 69)) * 1.08;

  return {
    ne: [center.lng + lngPad, center.lat + latPad] as [number, number],
    sw: [center.lng - lngPad, center.lat - latPad] as [number, number],
  };
}

function formatProjectAddress(p: ProjectListItem): string {
  return [p.addressLine1, p.city, p.state].filter(Boolean).join(", ");
}

function openDirections(lat: number, lng: number, address?: string | null) {
  openPreferredMap({ latitude: lat, longitude: lng, address });
}

// ─── GeoJSON builder ──────────────────────────────────────────────────────────

function toGeoJson(
  projects: ProjectListItem[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: projects
      .filter((p) => p.latitude != null && p.longitude != null && normalizeStatus(p.status) !== null)
      .map((p) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [p.longitude!, p.latitude!],
        },
        properties: {
          id: p.id,
          name: p.name,
          status: normalizeStatus(p.status),
          statusColor: statusColor(normalizeStatus(p.status)),
          city: p.city ?? "",
          state: p.state ?? "",
          address: [p.addressLine1, p.city, p.state].filter(Boolean).join(", "),
        },
      })),
  };
}

function calcBounds(geo: GeoJSON.FeatureCollection<GeoJSON.Point>) {
  if (geo.features.length === 0) return undefined;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const f of geo.features) {
    const [lng, lat] = f.geometry.coordinates;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const lngPad = Math.max((maxLng - minLng) * 0.15, 0.01);
  const latPad = Math.max((maxLat - minLat) * 0.15, 0.01);
  return {
    ne: [maxLng + lngPad, maxLat + latPad] as [number, number],
    sw: [minLng - lngPad, minLat - latPad] as [number, number],
  };
}

// ─── Layer styles ─────────────────────────────────────────────────────────────

/** Cluster bubble — stepped size by point_count */
const clusterCircleStyle: Mapbox.CircleLayerStyle = {
  circleColor: colors.primary,
  circleRadius: [
    "step",
    ["get", "point_count"],
    18, // default (< 10)
    10,
    24, // 10-49
    50,
    32, // 50+
  ] as any,
  circleOpacity: 0.85,
  circleStrokeWidth: 2.5,
  circleStrokeColor: "#ffffff",
};

/** Cluster count label */
const clusterCountStyle: Mapbox.SymbolLayerStyle = {
  textField: ["get", "point_count_abbreviated"] as any,
  textSize: 13,
  textColor: "#ffffff",
  textFont: ["DIN Pro Medium", "Arial Unicode MS Regular"],
  textAllowOverlap: true,
};

/** Individual (unclustered) pin */
const pinCircleStyle: Mapbox.CircleLayerStyle = {
  circleColor: ["get", "statusColor"] as any,
  circleRadius: 10,
  circleStrokeWidth: 2.5,
  circleStrokeColor: "#ffffff",
  circleSortKey: 1,
};

/** Small white dot inside each pin */
const pinInnerStyle: Mapbox.CircleLayerStyle = {
  circleColor: "#ffffff",
  circleRadius: 3.5,
};

// ─── Supplier helpers ─────────────────────────────────────────────────────────

const SUPPLIER_STATUS_COLORS: Record<LocalSupplier["status"], string> = {
  ACTIVE: "#3b82f6",           // blue
  PENDING_REMOVAL: "#f59e0b",  // amber
  PERMANENTLY_CLOSED: "#ef4444", // red
};

function suppliersToGeoJson(
  suppliers: LocalSupplier[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: suppliers.map((s) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [s.lng, s.lat],
      },
      properties: {
        id: s.id,
        name: s.name,
        status: s.status,
        statusColor: SUPPLIER_STATUS_COLORS[s.status],
        category: s.category ?? "",
        address: s.address ?? "",
        phone: s.phone ?? "",
      },
    })),
  };
}

/** Supplier pin — square icon style with status color */
const supplierPinStyle: Mapbox.CircleLayerStyle = {
  circleColor: ["get", "statusColor"] as any,
  circleRadius: 9,
  circleStrokeWidth: 2,
  circleStrokeColor: "#ffffff",
};

/** Small icon inside supplier pin */
const supplierInnerStyle: Mapbox.SymbolLayerStyle = {
  textField: [
    "match",
    ["get", "status"],
    "ACTIVE", "🏪",
    "PENDING_REMOVAL", "⚠️",
    "PERMANENTLY_CLOSED", "❌",
    "🏪",
  ] as any,
  textSize: 11,
  textAllowOverlap: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onSelectProject: (project: ProjectListItem) => void;
}

export function MapScreen({ onSelectProject }: Props) {
  // Data
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [suppliers, setSuppliers] = useState<LocalSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(
    new Set(["active", "open"]),
  );
  const [showSuppliers, setShowSuppliers] = useState(true);

  // Location + radius (default is regional)
  const [locationEnabled, setLocationEnabled] = useState<boolean | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKey, setRadiusKey] = useState<RadiusKey>("50");
  const [radiusPickerOpen, setRadiusPickerOpen] = useState(false);

  // Legend
  const [legendOpen, setLegendOpen] = useState(true);

  // Selected pin callout
  const [selected, setSelected] = useState<ProjectListItem | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<LocalSupplier | null>(null);
  const calloutSlide = useRef(new RNAnimated.Value(200)).current;

  // NexFIND product search
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<NearbySupplier[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [searchMode, setSearchMode] = useState<"projects" | "products">("projects");

  // Supplier catalog product search (HD + Lowe's enriched results)
  const [catalogResults, setCatalogResults] = useState<CatalogProduct[]>([]);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<CatalogProduct | null>(null);
  const [userZip, setUserZip] = useState<string | null>(null);

  // Directions dialog
  const [directionsTarget, setDirectionsTarget] = useState<{
    latitude: number; longitude: number; address: string | null; name: string | null;
  } | null>(null);

  // Map refs
  const shapeRef = useRef<Mapbox.ShapeSource>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  const radiusMiles = useMemo(() => radiusMilesForKey(radiusKey), [radiusKey]);
  const radiusLabel = useMemo(() => {
    return RADIUS_OPTIONS.find((o) => o.key === radiusKey)?.label ?? "Radius";
  }, [radiusKey]);

  // ── Load user location (for radius filter) ───────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationEnabled(false);
          setRadiusKey("nation");
          return;
        }

        setLocationEnabled(true);
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // Location unavailable — fall back to nation so UI matches behavior.
        setLocationEnabled(false);
        setRadiusKey("nation");
      }
    })();
  }, []);

  // ── Load projects & suppliers ──────────────────────────────────────────────

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await fetchLocalSuppliers();
      setSuppliers(data);
    } catch {
      // Supplier Index may not be enabled — silently skip
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await getCache<ProjectListItem[]>("projects.list");
      if (cached) {
        setProjects(cached);
        setLoading(false);
      }
      try {
        const fresh = await apiJson<ProjectListItem[]>("/projects");
        setProjects(fresh);
        await setCache("projects.list", fresh);
      } catch {
        // use cache if available
      } finally {
        setLoading(false);
      }
      loadSuppliers();
    })();
  }, [loadSuppliers]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      // Exclude archived/deleted entirely
      const status = normalizeStatus(p.status);
      if (status === null) return false;
      // Status filter
      if (!statusFilters.has(status)) return false;

      // Radius filter (requires user location)
      if (radiusMiles != null && userLoc) {
        if (p.latitude == null || p.longitude == null) return false;
        const dist = haversineMiles(
          userLoc.lat,
          userLoc.lng,
          p.latitude,
          p.longitude,
        );
        if (dist > radiusMiles) return false;
      }

      // Text search
      if (q && !p.name.toLowerCase().includes(q)) {
        const addr = [p.addressLine1, p.city, p.state]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!addr.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search, statusFilters, radiusMiles, userLoc]);

  const filteredSuppliers = useMemo(() => {
    if (radiusMiles == null || !userLoc) return suppliers;
    return suppliers.filter((s) => {
      const dist = haversineMiles(userLoc.lat, userLoc.lng, s.lat, s.lng);
      return dist <= radiusMiles;
    });
  }, [suppliers, radiusMiles, userLoc]);

  const geoData = useMemo(() => toGeoJson(filtered), [filtered]);
  const supplierGeo = useMemo(
    () => suppliersToGeoJson(filteredSuppliers),
    [filteredSuppliers],
  );
  const cameraBounds = useMemo(() => {
    if (radiusMiles != null && userLoc) {
      return boundsFromCenterMiles(userLoc, radiusMiles);
    }
    return calcBounds(geoData);
  }, [radiusMiles, userLoc, geoData]);

  const isFiltered = search.length > 0 || statusFilters.size < 5 || !showSuppliers || productResults.length > 0 || catalogResults.length > 0;

  // ── Resolve user ZIP once location is known ──────────────────────────────
  useEffect(() => {
    if (userLoc && !userZip) {
      resolveUserZip(userLoc, projects).then((zip) => {
        if (zip) setUserZip(zip);
      });
    }
  }, [userLoc, projects, userZip]);

  // Product search GeoJSON (NexFIND local suppliers)
  const productGeo = useMemo((): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
    type: "FeatureCollection",
    features: productResults.map((s) => ({
      type: "Feature" as const,
      id: `product-${s.id}`,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        distance: `${s.distanceMiles} mi`,
        category: s.category ?? "",
      },
    })),
  }), [productResults]);

  // Catalog product search GeoJSON (HD + Lowe's with store coordinates)
  const catalogGeo = useMemo((): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
    type: "FeatureCollection",
    features: catalogResults
      .filter((p) => p.storeAddress && p.storeCity && p.storeState)
      .map((p, i) => ({
        type: "Feature" as const,
        id: `catalog-${p.provider}-${p.productId}-${i}`,
        geometry: {
          type: "Point" as const,
          // We don't have exact store lat/lng from the API, so we'll
          // use the user's location as approximate center. Products
          // without coordinates show only in the results list.
          coordinates: userLoc ? [userLoc.lng, userLoc.lat] : [0, 0],
        },
        properties: {
          idx: i,
          provider: p.provider,
          providerColor: providerColor(p.provider),
          title: p.title,
          price: p.price ? `$${p.price.toFixed(2)}` : "",
          availabilityStatus: p.availabilityStatus ?? "",
          availabilityColor: availabilityColor(p.availabilityStatus),
        },
      })),
  }), [catalogResults, userLoc]);

  const toggleStatus = (key: StatusKey) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least one active
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setProductSearch("");
    setProductResults([]);
    setCatalogResults([]);
    setSelectedCatalogProduct(null);
    setSearchMode("projects");
    setStatusFilters(new Set(["active", "open", "pending", "completed", "closed"]));
    setShowSuppliers(true);
  };

  // ── Dual product search (NexFIND + Supplier Catalog) ──────────────────

  const handleProductSearch = useCallback(async () => {
    const q = productSearch.trim();
    if (q.length < 2) return;

    // Use user location or first project with coords as reference
    const refLat = userLoc?.lat ?? projects.find((p) => p.latitude != null)?.latitude;
    const refLng = userLoc?.lng ?? projects.find((p) => p.longitude != null)?.longitude;

    setSearchingProducts(true);
    setCatalogResults([]);
    setSelectedCatalogProduct(null);

    try {
      // Run both searches in parallel:
      // 1. Supplier catalog (HD + Lowe's with enriched pricing/availability)
      // 2. NexFIND local supplier search (nearby stores from our DB)
      const [catalogPromise, nexfindPromise] = await Promise.allSettled([
        searchCatalogEnriched(q, userZip ?? undefined, 5),
        refLat != null && refLng != null
          ? searchNearbyProducts(q, refLat, refLng, 25)
          : Promise.resolve([] as NearbySupplier[]),
      ]);

      // Process catalog results
      if (catalogPromise.status === "fulfilled") {
        const allProducts = catalogPromise.value.flatMap((r) => r.products);
        setCatalogResults(allProducts);
      }

      // Process NexFIND results
      if (nexfindPromise.status === "fulfilled") {
        setProductResults(nexfindPromise.value);
      }

      // If both failed, show error
      if (catalogPromise.status === "rejected" && nexfindPromise.status === "rejected") {
        Alert.alert("Search failed", "Could not search for products. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Search failed", err.message ?? "Could not search for products.");
    } finally {
      setSearchingProducts(false);
    }
  }, [productSearch, projects, userLoc, userZip]);

  // ── Supplier directions ───────────────────────────────────────────────

  const handleGetDirections = useCallback(async () => {
    if (!selectedSupplier) return;

    // Record navigation event (NexFIND capture)
    try {
      await navigateToSupplier(selectedSupplier.id);
    } catch {
      // Non-fatal — still open directions
    }

    setDirectionsTarget({
      latitude: selectedSupplier.lat,
      longitude: selectedSupplier.lng,
      address: selectedSupplier.address,
      name: selectedSupplier.name,
    });
  }, [selectedSupplier]);

  const handleCallSupplier = useCallback(() => {
    if (!selectedSupplier?.phone) return;
    const tel = selectedSupplier.phone.replace(/[^\d+]/g, "");
    Linking.openURL(`tel:${tel}`).catch(() =>
      Alert.alert("Cannot call", "Unable to open the phone dialer."),
    );
  }, [selectedSupplier]);

  // ── Pin selection ─────────────────────────────────────────────────────────

  const showCallout = useCallback(
    (project: ProjectListItem) => {
      setSelectedSupplier(null);
      setSelectedCatalogProduct(null);
      setSelected(project);
      // Fly to the project location
      if (project.latitude != null && project.longitude != null) {
        cameraRef.current?.setCamera({
          centerCoordinate: [project.longitude, project.latitude],
          zoomLevel: 14,
          animationDuration: 800,
        });
      }
      RNAnimated.spring(calloutSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [calloutSlide],
  );

  const showSupplierCallout = useCallback(
    (supplier: LocalSupplier) => {
      setSelected(null);
      setSelectedCatalogProduct(null);
      setSelectedSupplier(supplier);
      RNAnimated.spring(calloutSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [calloutSlide],
  );

  const showCatalogCallout = useCallback(
    (product: CatalogProduct) => {
      setSelected(null);
      setSelectedSupplier(null);
      setSelectedCatalogProduct(product);
      RNAnimated.spring(calloutSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [calloutSlide],
  );

  const hideCallout = useCallback(() => {
    RNAnimated.timing(calloutSlide, {
      toValue: 200,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setSelected(null);
      setSelectedSupplier(null);
      setSelectedCatalogProduct(null);
    });
  }, [calloutSlide]);

  // ── Map event handlers ────────────────────────────────────────────────────

  const handleClusterPress = useCallback(
    (e: MapPressEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const isCluster = feature.properties?.cluster === true;

      if (isCluster) {
        // Zoom into the cluster center
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        const count = feature.properties?.point_count ?? 2;
        // More items → zoom in more aggressively
        const zoom = count > 20 ? 10 : count > 5 ? 12 : 14;
        cameraRef.current?.setCamera({
          centerCoordinate: coords as [number, number],
          zoomLevel: zoom,
          animationDuration: 500,
        });
      } else {
        // Individual pin — show callout
        const projectId = feature.properties?.id;
        const project = projects.find((p) => p.id === projectId);
        if (project) showCallout(project);
      }
    },
    [projects, showCallout],
  );

  const handleSupplierPress = useCallback(
    (e: MapPressEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const sid = feature.properties?.id;
      const supplier = suppliers.find((s) => s.id === sid);
      if (supplier) showSupplierCallout(supplier);
    },
    [suppliers, showSupplierCallout],
  );

  const handleMapPress = useCallback(() => {
    if (selected || selectedSupplier || selectedCatalogProduct) hideCallout();
  }, [selected, selectedSupplier, selectedCatalogProduct, hideCallout]);

  // ── Supplier actions ────────────────────────────────────────────────────

  const handleFlagSupplier = useCallback(() => {
    if (!selectedSupplier) return;
    Alert.prompt(
      "Flag Supplier",
      `Why is "${selectedSupplier.name}" no longer in business?`,
      async (reason) => {
        if (!reason?.trim()) return;
        try {
          await flagSupplierClosed(selectedSupplier.id, reason.trim());
          hideCallout();
          loadSuppliers();
        } catch (err: any) {
          Alert.alert("Error", err.message ?? "Failed to flag supplier");
        }
      },
      "plain-text",
    );
  }, [selectedSupplier, hideCallout, loadSuppliers]);

  const handleApproveRemoval = useCallback(async () => {
    if (!selectedSupplier) return;
    try {
      await approveSupplierRemoval(selectedSupplier.id, "Approved via mobile map");
      hideCallout();
      loadSuppliers();
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to approve removal");
    }
  }, [selectedSupplier, hideCallout, loadSuppliers]);

  const handleDenyRemoval = useCallback(async () => {
    if (!selectedSupplier) return;
    try {
      await denySupplierRemoval(selectedSupplier.id, "Denied via mobile map");
      hideCallout();
      loadSuppliers();
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to deny removal");
    }
  }, [selectedSupplier, hideCallout, loadSuppliers]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && projects.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading projects…</Text>
      </View>
    );
  }

  const geoCount = geoData.features.length;

  return (
    <View style={styles.container}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onPress={handleMapPress}
      >
        <Mapbox.Camera
          ref={cameraRef}
          bounds={cameraBounds}
          animationDuration={600}
        />

        <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

        <Mapbox.ShapeSource
          id="projects-source"
          ref={shapeRef}
          shape={geoData}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          onPress={handleClusterPress}
        >
          {/* Cluster circles */}
          <Mapbox.CircleLayer
            id="cluster-circles"
            filter={["has", "point_count"]}
            style={clusterCircleStyle}
          />

          {/* Cluster count text */}
          <Mapbox.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={clusterCountStyle}
          />

          {/* Individual pin — outer circle */}
          <Mapbox.CircleLayer
            id="pin-circle"
            filter={["!", ["has", "point_count"]]}
            style={pinCircleStyle}
          />

          {/* Individual pin — inner white dot */}
          <Mapbox.CircleLayer
            id="pin-inner"
            filter={["!", ["has", "point_count"]]}
            style={pinInnerStyle}
          />
        </Mapbox.ShapeSource>

        {/* ── Supplier pins ─────────────────────────────────────────── */}
        {showSuppliers && filteredSuppliers.length > 0 && (
          <Mapbox.ShapeSource
            id="suppliers-source"
            shape={supplierGeo}
            onPress={handleSupplierPress}
          >
            <Mapbox.CircleLayer
              id="supplier-pin"
              style={supplierPinStyle}
            />
            <Mapbox.SymbolLayer
              id="supplier-icon"
              style={supplierInnerStyle}
            />
          </Mapbox.ShapeSource>
        )}

        {/* ── NexFIND product search result pins (orange) ──────────── */}
        {productResults.length > 0 && (
          <Mapbox.ShapeSource
            id="product-results-source"
            shape={productGeo}
          >
            <Mapbox.CircleLayer
              id="product-pin"
              style={{
                circleColor: "#f97316",
                circleRadius: 11,
                circleStrokeWidth: 2.5,
                circleStrokeColor: "#ffffff",
              }}
            />
            <Mapbox.SymbolLayer
              id="product-label"
              style={{
                textField: ["get", "distance"] as any,
                textSize: 10,
                textColor: "#ffffff",
                textFont: ["DIN Pro Medium", "Arial Unicode MS Regular"],
                textOffset: [0, -2],
                textAllowOverlap: true,
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <View style={styles.filterBar}>
        <View style={styles.searchRow}>
          {/* Mode toggle */}
          <Pressable
            style={[styles.searchModeBtn, searchMode === "products" && styles.searchModeBtnActive]}
            onPress={() => setSearchMode((m) => (m === "projects" ? "products" : "projects"))}
          >
            <Text style={{ fontSize: 14 }}>{searchMode === "products" ? "🔍" : "📋"}</Text>
          </Pressable>

          {searchMode === "projects" ? (
            <TextInput
              style={styles.searchInput}
              placeholder="Search projects…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          ) : (
            <TextInput
              style={[styles.searchInput, { borderColor: "#f97316" }]}
              placeholder="Search products near projects…"
              placeholderTextColor={colors.textMuted}
              value={productSearch}
              onChangeText={setProductSearch}
              returnKeyType="search"
              onSubmitEditing={handleProductSearch}
              clearButtonMode="while-editing"
            />
          )}
          {searchingProducts && (
            <ActivityIndicator size="small" color="#f97316" style={{ marginLeft: 4 }} />
          )}
          {isFiltered && (
            <Pressable style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {/* Radius selector */}
          <Pressable
            style={[
              styles.chip,
              radiusKey !== "nation" && {
                borderColor: colors.primary,
                backgroundColor: colors.primary + "10",
              },
            ]}
            onPress={() => setRadiusPickerOpen(true)}
          >
            <Text style={{ fontSize: 12 }}>📏</Text>
            <Text style={styles.chipLabel}>{radiusLabel}</Text>
          </Pressable>

          {STATUS_CHIPS.map((chip) => {
            const active = statusFilters.has(chip.key);
            return (
              <Pressable
                key={chip.key}
                style={[
                  styles.chip,
                  active && { backgroundColor: chip.color, borderColor: chip.color },
                ]}
                onPress={() => toggleStatus(chip.key)}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: active ? "#fff" : chip.color },
                  ]}
                />
                <Text
                  style={[
                    styles.chipLabel,
                    active && { color: "#fff" },
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}

          {/* Supplier toggle */}
          <Pressable
            style={[
              styles.chip,
              showSuppliers && { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
            ]}
            onPress={() => setShowSuppliers((v) => !v)}
          >
            <Text style={{ fontSize: 12 }}>🏪</Text>
            <Text
              style={[
                styles.chipLabel,
                showSuppliers && { color: "#fff" },
              ]}
            >
              Suppliers{filteredSuppliers.length > 0 ? ` (${filteredSuppliers.length})` : ""}
            </Text>
          </Pressable>

          {/* Summary count */}
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {geoCount} project{geoCount !== 1 ? "s" : ""}
            </Text>
          </View>
        </ScrollView>
      </View>

      {/* ── Radius picker ──────────────────────────────────────────────── */}
      <Modal
        visible={radiusPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRadiusPickerOpen(false)}
      >
        <View style={styles.radiusOverlay}>
          <Pressable
            style={styles.radiusBackdrop}
            onPress={() => setRadiusPickerOpen(false)}
          />
          <View style={styles.radiusSheet}>
            <Text style={styles.radiusTitle}>Map Radius</Text>
            {RADIUS_OPTIONS.map((opt) => {
              const active = opt.key === radiusKey;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.radiusRow, active && styles.radiusRowActive]}
                  onPress={() => {
                    if (opt.key !== "nation" && locationEnabled === false) {
                      Alert.alert(
                        "Location Required",
                        "Enable location permissions to use radius filtering.",
                      );
                      return;
                    }
                    setRadiusKey(opt.key);
                    setRadiusPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.radiusRowText,
                      active && styles.radiusRowTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {active && <Text style={styles.radiusCheck}>✓</Text>}
                </Pressable>
              );
            })}
            <Pressable
              style={styles.radiusCancelBtn}
              onPress={() => setRadiusPickerOpen(false)}
            >
              <Text style={styles.radiusCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <View style={styles.legendCard}>
        <Pressable
          style={styles.legendHeader}
          onPress={() => setLegendOpen((v) => !v)}
        >
          <Text style={styles.legendTitle}>Legend</Text>
          <Text style={styles.legendChevron}>{legendOpen ? "▾" : "▸"}</Text>
        </Pressable>
        {legendOpen && (
          <View style={styles.legendBody}>
            <Text style={styles.legendSection}>Projects</Text>
            {STATUS_CHIPS.map((chip) => (
              <View key={chip.key} style={styles.legendRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: chip.color }]}
                />
                <Text style={styles.legendLabel}>{chip.label}</Text>
              </View>
            ))}

            <Text style={styles.legendSection}>Suppliers</Text>
            <View style={styles.legendRow}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: SUPPLIER_STATUS_COLORS.ACTIVE },
                ]}
              />
              <Text style={styles.legendLabel}>🏪 Active</Text>
            </View>
            <View style={styles.legendRow}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: SUPPLIER_STATUS_COLORS.PENDING_REMOVAL },
                ]}
              />
              <Text style={styles.legendLabel}>⚠️ Pending removal</Text>
            </View>
            <View style={styles.legendRow}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: SUPPLIER_STATUS_COLORS.PERMANENTLY_CLOSED },
                ]}
              />
              <Text style={styles.legendLabel}>❌ Closed</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {geoCount === 0 && !loading && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>
            {filtered.length === 0
              ? radiusMiles != null && userLoc
                ? `No projects within ${radiusLabel}.`
                : "No projects match your filters."
              : "No projects have GPS coordinates yet."}
          </Text>
        </View>
      )}

      {/* ── Project callout ──────────────────────────────────────────────── */}
      {selected && (
        <RNAnimated.View
          style={[
            styles.callout,
            { transform: [{ translateY: calloutSlide }] },
          ]}
        >
          <View style={styles.calloutHandle} />
          <View style={styles.calloutHeader}>
            <View
              style={[
                styles.calloutStatusDot,
                { backgroundColor: statusColor(normalizeStatus(selected.status)) },
              ]}
            />
            <Text style={styles.calloutTitle} numberOfLines={1}>
              {selected.name}
            </Text>
          </View>
          {formatProjectAddress(selected) && (
            selected.latitude != null && selected.longitude != null ? (
              <Pressable
                onPress={() =>
                  openDirections(
                    selected.latitude!,
                    selected.longitude!,
                    formatProjectAddress(selected) || null,
                  )
                }
              >
                <Text
                  style={[styles.calloutAddress, styles.calloutAddressLink]}
                  numberOfLines={1}
                >
                  {formatProjectAddress(selected)}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.calloutAddress} numberOfLines={1}>
                {formatProjectAddress(selected)}
              </Text>
            )
          )}
          {selected.primaryContactName && (
            <Text style={styles.calloutContact} numberOfLines={1}>
              📞 {selected.primaryContactName}
              {selected.primaryContactPhone
                ? ` · ${selected.primaryContactPhone}`
                : ""}
            </Text>
          )}
          <View style={styles.calloutActions}>
            {selected.latitude != null && selected.longitude != null && (
              <Pressable
                style={styles.calloutDirectionsBtn}
                onPress={() =>
                  openDirections(
                    selected.latitude!,
                    selected.longitude!,
                    formatProjectAddress(selected) || null,
                  )
                }
              >
                <Text style={styles.calloutDirectionsText}>🧭 Directions</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.calloutOpenBtn}
              onPress={() => {
                hideCallout();
                onSelectProject(selected);
              }}
            >
              <Text style={styles.calloutOpenText}>Open Project ›</Text>
            </Pressable>
            <Pressable style={styles.calloutCloseBtn} onPress={hideCallout}>
              <Text style={styles.calloutCloseText}>Dismiss</Text>
            </Pressable>
          </View>
        </RNAnimated.View>
      )}

      {/* ── Supplier callout ────────────────────────────────────────────── */}
      {selectedSupplier && (
        <RNAnimated.View
          style={[
            styles.callout,
            { transform: [{ translateY: calloutSlide }] },
          ]}
        >
          <View style={styles.calloutHandle} />
          <View style={styles.calloutHeader}>
            <Text style={{ fontSize: 16, marginRight: 4 }}>
              {selectedSupplier.status === "ACTIVE"
                ? "🏪"
                : selectedSupplier.status === "PENDING_REMOVAL"
                  ? "⚠️"
                  : "❌"}
            </Text>
            <Text style={styles.calloutTitle} numberOfLines={1}>
              {selectedSupplier.name}
            </Text>
          </View>
          {selectedSupplier.category && (
            <Text style={styles.supplierCategory}>{selectedSupplier.category}</Text>
          )}
          {selectedSupplier.address && (
            <Pressable
              onPress={() =>
                openDirections(
                  selectedSupplier.lat,
                  selectedSupplier.lng,
                  selectedSupplier.address,
                )
              }
            >
              <Text
                style={[styles.calloutAddress, styles.calloutAddressLink]}
                numberOfLines={1}
              >
                {selectedSupplier.address}
              </Text>
            </Pressable>
          )}
          {selectedSupplier.phone && (
            <Text style={styles.calloutContact}>📞 {selectedSupplier.phone}</Text>
          )}
          {selectedSupplier.status === "PENDING_REMOVAL" && selectedSupplier.flagReason && (
            <View style={styles.flagReasonBox}>
              <Text style={styles.flagReasonLabel}>Flagged reason:</Text>
              <Text style={styles.flagReasonText}>{selectedSupplier.flagReason}</Text>
            </View>
          )}
          {/* NexFIND action buttons */}
          <View style={styles.calloutActions}>
            <Pressable style={styles.calloutDirectionsBtn} onPress={handleGetDirections}>
              <Text style={styles.calloutDirectionsText}>🧭 Directions</Text>
            </Pressable>
            {selectedSupplier.phone && (
              <Pressable style={styles.calloutCallBtn} onPress={handleCallSupplier}>
                <Text style={styles.calloutCallText}>📞 Call</Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.calloutActions, { marginTop: 6 }]}>
            {selectedSupplier.status === "ACTIVE" && (
              <Pressable style={styles.calloutFlagBtn} onPress={handleFlagSupplier}>
                <Text style={styles.calloutFlagText}>⚠️ Flag Closed</Text>
              </Pressable>
            )}
            {selectedSupplier.status === "PENDING_REMOVAL" && (
              <>
                <Pressable style={styles.calloutApproveBtn} onPress={handleApproveRemoval}>
                  <Text style={styles.calloutOpenText}>✓ Approve</Text>
                </Pressable>
                <Pressable style={styles.calloutDenyBtn} onPress={handleDenyRemoval}>
                  <Text style={styles.calloutDenyText}>✗ Deny</Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.calloutCloseBtn} onPress={hideCallout}>
              <Text style={styles.calloutCloseText}>Dismiss</Text>
            </Pressable>
          </View>
        </RNAnimated.View>
      )}

      {/* ── Catalog product callout ────────────────────────────────────── */}
      {selectedCatalogProduct && (
        <RNAnimated.View
          style={[
            styles.callout,
            { transform: [{ translateY: calloutSlide }] },
          ]}
        >
          <View style={styles.calloutHandle} />
          <View style={styles.calloutHeader}>
            <View
              style={[
                styles.calloutStatusDot,
                { backgroundColor: providerColor(selectedCatalogProduct.provider) },
              ]}
            />
            <Text style={styles.calloutTitle} numberOfLines={2}>
              {selectedCatalogProduct.title}
            </Text>
          </View>

          {/* Provider + brand */}
          <Text style={[styles.supplierCategory, { marginLeft: 18 }]}>
            {providerDisplayName(selectedCatalogProduct.provider)}
            {selectedCatalogProduct.brand ? ` · ${selectedCatalogProduct.brand}` : ""}
          </Text>

          {/* Price row */}
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 18, marginBottom: 4, gap: 8 }}>
            {selectedCatalogProduct.price != null && (
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.textPrimary }}>
                ${selectedCatalogProduct.price.toFixed(2)}
              </Text>
            )}
            {selectedCatalogProduct.wasPrice != null && (
              <Text style={{ fontSize: 14, color: colors.textMuted, textDecorationLine: "line-through" }}>
                ${selectedCatalogProduct.wasPrice.toFixed(2)}
              </Text>
            )}
            {selectedCatalogProduct.unit && (
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                / {selectedCatalogProduct.unit}
              </Text>
            )}
          </View>

          {/* Availability badge */}
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 18, marginBottom: 4, gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: availabilityColor(selectedCatalogProduct.availabilityStatus),
              }}
            />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>
              {availabilityLabel(selectedCatalogProduct)}
            </Text>
          </View>

          {/* Store + aisle */}
          {selectedCatalogProduct.storeAddress && (
            <Text style={styles.calloutAddress} numberOfLines={1}>
              {[selectedCatalogProduct.storeAddress, selectedCatalogProduct.storeCity, selectedCatalogProduct.storeState]
                .filter(Boolean)
                .join(", ")}
            </Text>
          )}
          {selectedCatalogProduct.aisle && (
            <Text style={[styles.calloutContact, { marginLeft: 18 }]}>
              📍 {selectedCatalogProduct.aisle}
            </Text>
          )}

          {/* Action buttons */}
          <View style={styles.calloutActions}>
            {selectedCatalogProduct.storePhone && (
              <Pressable
                style={styles.calloutCallBtn}
                onPress={() => {
                  const tel = selectedCatalogProduct.storePhone!.replace(/[^\d+]/g, "");
                  Linking.openURL(`tel:${tel}`).catch(() =>
                    Alert.alert("Cannot call", "Unable to open the phone dialer."),
                  );
                }}
              >
                <Text style={styles.calloutCallText}>📞 Call Store</Text>
              </Pressable>
            )}
            {selectedCatalogProduct.productUrl && (
              <Pressable
                style={[styles.calloutOpenBtn, { backgroundColor: providerColor(selectedCatalogProduct.provider) }]}
                onPress={() => Linking.openURL(selectedCatalogProduct.productUrl!)}
              >
                <Text style={styles.calloutOpenText}>
                  View on {providerDisplayName(selectedCatalogProduct.provider)} ›
                </Text>
              </Pressable>
            )}
            <Pressable style={styles.calloutCloseBtn} onPress={hideCallout}>
              <Text style={styles.calloutCloseText}>Dismiss</Text>
            </Pressable>
          </View>
        </RNAnimated.View>
      )}

      {/* ── Catalog results list (shown below map when products found) ──── */}
      {catalogResults.length > 0 && !selectedCatalogProduct && !selected && !selectedSupplier && (
        <View style={styles.catalogResultsPanel}>
          <View style={styles.calloutHandle} />
          <Text style={styles.catalogResultsTitle}>
            {catalogResults.length} Product{catalogResults.length !== 1 ? "s" : ""} Found
            {userZip ? ` near ${userZip}` : ""}
          </Text>
          <ScrollView
            horizontal={false}
            style={{ maxHeight: 220 }}
            showsVerticalScrollIndicator
          >
            {catalogResults.map((p, i) => (
              <Pressable
                key={`${p.provider}-${p.productId}-${i}`}
                style={styles.catalogResultCard}
                onPress={() => showCatalogCallout(p)}
              >
                <View style={[styles.catalogProviderBadge, { backgroundColor: providerColor(p.provider) }]}>
                  <Text style={styles.catalogProviderText}>
                    {p.provider === "homedepot" ? "HD" : "L"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catalogResultName} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    {p.price != null && (
                      <Text style={styles.catalogResultPrice}>${p.price.toFixed(2)}</Text>
                    )}
                    {p.wasPrice != null && (
                      <Text style={styles.catalogResultWasPrice}>${p.wasPrice.toFixed(2)}</Text>
                    )}
                    <View
                      style={[
                        styles.catalogAvailBadge,
                        { backgroundColor: availabilityColor(p.availabilityStatus) + "20" },
                      ]}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: availabilityColor(p.availabilityStatus),
                        }}
                      />
                      <Text
                        style={[
                          styles.catalogAvailText,
                          { color: availabilityColor(p.availabilityStatus) },
                        ]}
                      >
                        {availabilityLabel(p)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Directions dialog ──────────────────────────────────────────── */}
      {directionsTarget && (
        <DirectionsDialog
          visible={!!directionsTarget}
          onClose={() => setDirectionsTarget(null)}
          destination={directionsTarget}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundSecondary,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },

  // ── Filter bar ──────────────────────────────────────────────────────────
  filterBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.backgroundTertiary,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    gap: 6,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  // ── Radius picker ────────────────────────────────────────────────────────
  radiusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  radiusBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  radiusSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
  },
  radiusTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  radiusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  radiusRowActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  radiusRowText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  radiusRowTextActive: {
    fontWeight: "700",
    color: colors.primary,
  },
  radiusCheck: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  radiusCancelBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  radiusCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textMuted,
  },

  // ── Legend ───────────────────────────────────────────────────────────────
  legendCard: {
    position: "absolute",
    top: 92,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden",
  },
  legendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  legendChevron: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textMuted,
  },
  legendBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  legendSection: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primary + "18",
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },

  // ── Empty state ─────────────────────────────────────────────────────────
  emptyOverlay: {
    position: "absolute",
    top: "45%",
    left: 24,
    right: 24,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
  },

  // ── Pin callout (bottom sheet) ──────────────────────────────────────────
  callout: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 12,
  },
  calloutHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMuted,
    alignSelf: "center",
    marginBottom: 12,
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  calloutStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  calloutTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  calloutAddress: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
    marginLeft: 18,
  },
  calloutAddressLink: {
    color: colors.primary,
    textDecorationLine: "underline",
  },
  calloutContact: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
    marginLeft: 18,
  },
  calloutActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  calloutDirectionsBtn: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutDirectionsText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutCallBtn: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutCallText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutOpenBtn: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutOpenText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  calloutCloseText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  // ── Supplier callout extras ─────────────────────────────────────────────
  supplierCategory: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: 2,
    marginLeft: 28,
  },
  flagReasonBox: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
  },
  flagReasonLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 2,
  },
  flagReasonText: {
    fontSize: 13,
    color: "#78350f",
  },
  calloutFlagBtn: {
    flex: 1,
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutFlagText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  calloutApproveBtn: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutDenyBtn: {
    flex: 1,
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutDenyText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  // ── NexFIND search-mode toggle ──────────────────────────────────────────
  searchModeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    marginRight: 8,
  },
  searchModeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  searchModeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  searchModeBtnTextActive: {
    color: "#fff",
  },

  // ── Catalog results panel ─────────────────────────────────────────────────
  catalogResultsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 10,
  },
  catalogResultsTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  catalogResultCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  catalogProviderBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  catalogProviderText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  catalogResultName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 18,
  },
  catalogResultPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  catalogResultWasPrice: {
    fontSize: 12,
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  catalogAvailBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catalogAvailText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
