import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Linking,
  Platform,
  Switch,
} from "react-native";
import {
  getPreferredMapApp,
  setPreferredMapApp,
  type MapAppType,
} from "../storage/settings";
import { colors } from "../theme/colors";

interface DirectionsDialogProps {
  visible: boolean;
  onClose: () => void;
  destination: {
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    name?: string | null;
  };
}

interface MapApp {
  id: MapAppType;
  name: string;
  icon: string;
  available: boolean;
  getUrl: (lat: number, lng: number, address: string, name: string) => string;
}

export function DirectionsDialog({
  visible,
  onClose,
  destination,
}: DirectionsDialogProps) {
  const [preferredApp, setPreferredAppState] = useState<MapAppType>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [availableApps, setAvailableApps] = useState<MapApp[]>([]);
  const [checking, setChecking] = useState(true);

  const { latitude, longitude, address, name } = destination;

  // Build destination string for URL encoding
  const destAddress = address || `${latitude},${longitude}`;
  const destName = name || "Destination";

  // Define map apps with their URL schemes
  const mapApps: MapApp[] = [
    {
      id: "apple",
      name: "Apple Maps",
      icon: "🗺️",
      available: Platform.OS === "ios", // Always available on iOS
      getUrl: (lat, lng, addr, label) =>
        `maps://?daddr=${encodeURIComponent(addr)}&dirflg=d`,
    },
    {
      id: "google",
      name: "Google Maps",
      icon: "📍",
      available: false, // Will check
      getUrl: (lat, lng, addr, label) =>
        Platform.OS === "ios"
          ? `comgooglemaps://?daddr=${encodeURIComponent(addr)}&directionsmode=driving`
          : `google.navigation:q=${encodeURIComponent(addr)}`,
    },
    {
      id: "waze",
      name: "Waze",
      icon: "🚗",
      available: false, // Will check
      getUrl: (lat, lng, addr, label) =>
        lat && lng
          ? `waze://?ll=${lat},${lng}&navigate=yes`
          : `waze://?q=${encodeURIComponent(addr)}&navigate=yes`,
    },
  ];

  // Check which map apps are available
  useEffect(() => {
    if (!visible) return;

    const checkApps = async () => {
      setChecking(true);

      const checked = await Promise.all(
        mapApps.map(async (app) => {
          if (app.id === "apple" && Platform.OS === "ios") {
            return { ...app, available: true };
          }

          // Check if app can be opened
          const testUrl =
            app.id === "google"
              ? Platform.OS === "ios"
                ? "comgooglemaps://"
                : "google.navigation:q=test"
              : "waze://";

          try {
            const canOpen = await Linking.canOpenURL(testUrl);
            return { ...app, available: canOpen };
          } catch {
            return { ...app, available: false };
          }
        })
      );

      setAvailableApps(checked.filter((app) => app.available));
      setChecking(false);
    };

    checkApps();
  }, [visible]);

  // Load saved preference
  useEffect(() => {
    if (!visible) return;

    const loadPreference = async () => {
      const saved = await getPreferredMapApp();
      setPreferredAppState(saved);
      setRememberChoice(!!saved);
    };

    loadPreference();
  }, [visible]);

  // Auto-launch if we have a saved preference
  useEffect(() => {
    if (!visible || checking || !preferredApp || availableApps.length === 0)
      return;

    const preferred = availableApps.find((app) => app.id === preferredApp);
    if (preferred) {
      openMap(preferred);
    }
  }, [visible, checking, preferredApp, availableApps]);

  const openMap = async (app: MapApp) => {
    const lat = latitude ?? 0;
    const lng = longitude ?? 0;
    const url = app.getUrl(lat, lng, destAddress, destName);

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        onClose();
      }
    } catch (e) {
      console.warn("Failed to open map:", e);
    }
  };

  const handleSelectApp = async (app: MapApp) => {
    if (rememberChoice) {
      await setPreferredMapApp(app.id);
    }
    openMap(app);
  };

  const handleClearPreference = async () => {
    await setPreferredMapApp(null);
    setPreferredAppState(null);
    setRememberChoice(false);
  };

  if (!visible) return null;

  // If we have a saved preference and it's available, we auto-launch (handled in useEffect)
  // Only show dialog if no preference or preference app isn't available
  const hasAutoLaunch =
    preferredApp && availableApps.find((app) => app.id === preferredApp);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>Get Directions</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Destination info */}
          <View style={styles.destinationBox}>
            <Text style={styles.destinationLabel}>To:</Text>
            <Text style={styles.destinationName}>{destName}</Text>
            {address && (
              <Text style={styles.destinationAddress}>{address}</Text>
            )}
          </View>

          {checking ? (
            <Text style={styles.checkingText}>Checking available apps...</Text>
          ) : availableApps.length === 0 ? (
            <Text style={styles.noAppsText}>No map apps available</Text>
          ) : (
            <>
              {/* Map app buttons */}
              <View style={styles.appList}>
                {availableApps.map((app) => (
                  <Pressable
                    key={app.id}
                    style={[
                      styles.appButton,
                      preferredApp === app.id && styles.appButtonPreferred,
                    ]}
                    onPress={() => handleSelectApp(app)}
                  >
                    <Text style={styles.appIcon}>{app.icon}</Text>
                    <Text style={styles.appName}>{app.name}</Text>
                    {preferredApp === app.id && (
                      <Text style={styles.preferredBadge}>★ Preferred</Text>
                    )}
                  </Pressable>
                ))}
              </View>

              {/* Remember choice toggle */}
              <View style={styles.rememberRow}>
                <Text style={styles.rememberLabel}>Remember my choice</Text>
                <Switch
                  value={rememberChoice}
                  onValueChange={setRememberChoice}
                />
              </View>

              {/* Clear preference button */}
              {preferredApp && (
                <Pressable
                  style={styles.clearButton}
                  onPress={handleClearPreference}
                >
                  <Text style={styles.clearButtonText}>
                    Clear saved preference
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  dialog: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "android" ? 72 : 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  destinationBox: {
    backgroundColor: colors.backgroundSecondary,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  destinationLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
  },
  destinationName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  destinationAddress: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  checkingText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    padding: 20,
  },
  noAppsText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    padding: 20,
  },
  appList: {
    gap: 10,
  },
  appButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  appButtonPreferred: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  appIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  appName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  preferredBadge: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  rememberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  rememberLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  clearButton: {
    marginTop: 12,
    padding: 12,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
});
