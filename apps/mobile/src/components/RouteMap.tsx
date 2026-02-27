import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { fetchRoute, formatDuration, formatDistance, type RouteResult } from "../api/mapbox";
import { GeofenceCircle } from "./GeofenceCircle";
import { colors } from "../theme/colors";

interface RouteMapProps {
  visible: boolean;
  onClose: () => void;
  destination: {
    latitude: number;
    longitude: number;
    name: string;
    address?: string | null;
    projectId?: string;
  };
}

/**
 * Full-screen route display modal.
 * Shows a driving route from the user's current location to the destination.
 * Includes a "Navigate" button to open an external map app.
 */
export function RouteMap({ visible, onClose, destination }: RouteMapProps) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      setRoute(null);
      setError(null);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError("Location permission required");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const orig = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setOrigin(orig);

        const result = await fetchRoute(orig, destination);
        setRoute(result);
      } catch (e: any) {
        setError(e.message || "Failed to load route");
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, destination.latitude, destination.longitude]);

  const openExternalNav = () => {
    const { latitude, longitude, address, name } = destination;
    const dest = address || `${latitude},${longitude}`;
    const url =
      Platform.OS === "ios"
        ? `maps://?daddr=${encodeURIComponent(dest)}&dirflg=d`
        : `google.navigation:q=${encodeURIComponent(dest)}`;
    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
      );
    });
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Calculating route…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onClose} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Close</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Mapbox.MapView
              style={styles.map}
              styleURL={Mapbox.StyleURL.Street}
              logoEnabled={false}
              attributionEnabled={false}
            >
              {/* Fit camera to route bounds */}
              {origin && (
                <Mapbox.Camera
                  bounds={{
                    ne: [
                      Math.max(origin.longitude, destination.longitude) + 0.01,
                      Math.max(origin.latitude, destination.latitude) + 0.01,
                    ],
                    sw: [
                      Math.min(origin.longitude, destination.longitude) - 0.01,
                      Math.min(origin.latitude, destination.latitude) - 0.01,
                    ],
                  }}
                  animationDuration={600}
                />
              )}

              <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />

              {/* Geofence at destination */}
              {destination.projectId && (
                <GeofenceCircle
                  id={destination.projectId}
                  longitude={destination.longitude}
                  latitude={destination.latitude}
                />
              )}

              {/* Route line */}
              {route && (
                <Mapbox.ShapeSource id="route-line" shape={route.geoJson}>
                  <Mapbox.LineLayer
                    id="route-line-layer"
                    style={{
                      lineColor: "#2563eb",
                      lineWidth: 5,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </Mapbox.ShapeSource>
              )}

              {/* Destination pin */}
              <Mapbox.PointAnnotation
                id="destination"
                coordinate={[destination.longitude, destination.latitude]}
              >
                <View style={styles.destPin}>
                  <View style={styles.destPinInner} />
                </View>
              </Mapbox.PointAnnotation>
            </Mapbox.MapView>

            {/* Top bar: close + route info */}
            <View style={styles.topBar}>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
              <View style={styles.routeInfo}>
                <Text style={styles.routeInfoName} numberOfLines={1}>
                  {destination.name}
                </Text>
                {route && (
                  <Text style={styles.routeInfoDetail}>
                    {formatDuration(route.durationSec)} · {formatDistance(route.distanceMeters)}
                  </Text>
                )}
              </View>
            </View>

            {/* Bottom: Navigate button */}
            <View style={styles.bottomBar}>
              <Pressable onPress={openExternalNav} style={styles.navButton}>
                <Text style={styles.navButtonText}>🧭 Navigate</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 14,
    color: "#b91c1c",
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  map: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  closeBtn: {
    padding: 6,
    marginRight: 8,
  },
  closeBtnText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  routeInfo: {
    flex: 1,
  },
  routeInfoName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  routeInfoDetail: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 2,
  },
  bottomBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 24,
    left: 16,
    right: 16,
  },
  navButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  navButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  destPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
  },
  destPinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
});
