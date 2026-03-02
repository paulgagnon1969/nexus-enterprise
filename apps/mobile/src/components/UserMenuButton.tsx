import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Switch,
  StyleSheet,
  Platform,
  ScrollView,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import appJson from "../../app.json";
import { colors } from "../theme/colors";
import { getUserMe } from "../api/user";
import {
  getWifiOnlySync,
  setWifiOnlySync,
  getPreferredMapApp,
  setPreferredMapApp,
  type MapAppType,
} from "../storage/settings";
import type { UserMeResponse } from "../types/api";

const MAP_APP_OPTIONS: { id: MapAppType; label: string; icon: string; scheme: string; platformGuard?: "ios" | "android" }[] = [
  { id: "apple", label: "Apple Maps", icon: "🗺️", scheme: "maps://", platformGuard: "ios" },
  { id: "google", label: "Google Maps", icon: "📍", scheme: Platform.OS === "ios" ? "comgooglemaps://" : "google.navigation:q=test" },
  { id: "waze", label: "Waze", icon: "🚗", scheme: "waze://" },
];

function getInitials(me: UserMeResponse | null): string {
  const first = me?.firstName?.trim() ?? "";
  const last = me?.lastName?.trim() ?? "";

  const a = first[0];
  const b = last[0];
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();

  // Fallback: derive from email
  const localPart = (me?.email ?? "").split("@")[0] ?? "";
  const parts = localPart.split(/[._\s-]+/).filter(Boolean);
  const e1 = parts[0]?.[0];
  const e2 = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];

  const out = `${e1 ?? "U"}${e2 ?? ""}`.toUpperCase();
  return out.length >= 2 ? out.slice(0, 2) : out;
}

function getDisplayName(me: UserMeResponse | null): string {
  const first = me?.firstName?.trim();
  const last = me?.lastName?.trim();
  const full = [first, last].filter(Boolean).join(" ");
  return full || me?.email || "Account";
}

interface UserMenuButtonProps {
  onLogout: () => void;
}

export function UserMenuButton({ onLogout }: UserMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [mapApp, setMapApp] = useState<MapAppType>(null);
  const [availableMapApps, setAvailableMapApps] = useState<typeof MAP_APP_OPTIONS>([]);
  const [showMapPicker, setShowMapPicker] = useState(false);

  useEffect(() => {
    getUserMe().then(setMe).catch(() => {});
    getWifiOnlySync().then(setWifiOnly);
    getPreferredMapApp().then(setMapApp);

    // Detect installed map apps
    (async () => {
      const available: typeof MAP_APP_OPTIONS = [];
      for (const app of MAP_APP_OPTIONS) {
        if (app.platformGuard && app.platformGuard !== Platform.OS) continue;
        if (app.id === "apple" && Platform.OS === "ios") {
          available.push(app);
          continue;
        }
        try {
          const canOpen = await Linking.canOpenURL(app.scheme);
          if (canOpen) available.push(app);
        } catch {
          // not installed
        }
      }
      setAvailableMapApps(available);
    })();
  }, []);

  const toggleWifi = async (val: boolean) => {
    setWifiOnly(val);
    await setWifiOnlySync(val);
  };

  const selectMapApp = async (id: MapAppType) => {
    setMapApp(id);
    await setPreferredMapApp(id);
    setShowMapPicker(false);
  };

  const initials = getInitials(me);
  const displayName = getDisplayName(me);

  return (
    <>
      <Pressable
        style={styles.avatarBtn}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen(true);
        }}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.menuContainer}>
            {/* Header */}
            <View style={styles.menuHeader}>
              <View style={styles.headerLeft}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarLargeText}>{initials}</Text>
                </View>
                <Text style={styles.displayName}>{displayName}</Text>
              </View>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.menuClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView bounces={false}>
              {/* Profile */}
              <MenuItem
                label="See/Edit Profile"
                icon="👤"
                onPress={() => {
                  setOpen(false);
                  // TODO: navigate to profile screen when available
                }}
              />

              {/* Roles info */}
              <MenuItem
                label="Roles & Permissions"
                icon="🔑"
                onPress={() => {
                  setOpen(false);
                  // TODO: navigate to roles screen when available
                }}
              />

              {/* Divider */}
              <View style={styles.divider} />

              {/* WiFi Only Sync toggle */}
              <View style={styles.toggleRow}>
                <Text style={styles.toggleIcon}>📶</Text>
                <Text style={styles.toggleLabel}>WiFi Only Sync</Text>
                <Switch
                  value={wifiOnly}
                  onValueChange={toggleWifi}
                  style={styles.toggleSwitch}
                />
              </View>

              {/* Default Map App */}
              <Pressable
                style={styles.toggleRow}
                onPress={() => setShowMapPicker(true)}
              >
                <Text style={styles.toggleIcon}>🧭</Text>
                <Text style={styles.toggleLabel}>Default Map App</Text>
                <Text style={styles.mapAppValue}>
                  {mapApp
                    ? MAP_APP_OPTIONS.find((a) => a.id === mapApp)?.label ?? "Set"
                    : "Not Set"}
                </Text>
              </Pressable>

              {/* Divider */}
              <View style={styles.divider} />

              {/* App Info */}
              <View style={styles.appInfo}>
                <Text style={styles.appInfoLabel}>App Version</Text>
                <Text style={styles.appInfoValue}>
                  v{appJson.expo.version} • build {appJson.expo.runtimeVersion}
                </Text>
                <Text style={styles.appInfoValue}>
                  {Platform.OS === "ios" ? "iOS" : "Android"}
                </Text>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Logout */}
              <MenuItem
                label="Logout"
                icon="🚪"
                destructive
                onPress={() => {
                  setOpen(false);
                  onLogout();
                }}
              />
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      {/* Map app picker modal */}
      <Modal
        visible={showMapPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMapPicker(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowMapPicker(false)}>
          <View style={styles.mapPickerContainer}>
            <View style={styles.mapPickerHeader}>
              <Text style={styles.mapPickerTitle}>Default Map App</Text>
              <Pressable onPress={() => setShowMapPicker(false)}>
                <Text style={styles.menuClose}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.mapPickerSubtitle}>
              Choose which app opens when you tap Directions
            </Text>

            {availableMapApps.map((app) => (
              <Pressable
                key={app.id}
                style={[
                  styles.mapPickerOption,
                  mapApp === app.id && styles.mapPickerOptionActive,
                ]}
                onPress={() => selectMapApp(app.id)}
              >
                <Text style={styles.mapPickerOptionIcon}>{app.icon}</Text>
                <Text style={styles.mapPickerOptionLabel}>{app.label}</Text>
                {mapApp === app.id && (
                  <Text style={styles.mapPickerCheck}>✓</Text>
                )}
              </Pressable>
            ))}

            {mapApp && (
              <Pressable
                style={styles.mapPickerClear}
                onPress={() => selectMapApp(null)}
              >
                <Text style={styles.mapPickerClearText}>Clear preference (ask every time)</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({
  label,
  icon,
  destructive,
  onPress,
}: {
  label: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Text style={styles.menuItemIcon}>{icon}</Text>
      <Text
        style={[
          styles.menuItemLabel,
          destructive && styles.menuItemLabelDestructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Avatar circle in the tab bar
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.textOnPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Modal overlay
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    paddingHorizontal: 20,
    maxHeight: "60%",
  },

  // Header
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  displayName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  menuClose: {
    fontSize: 20,
    color: colors.textMuted,
    padding: 4,
  },

  // Menu items
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 12,
  },
  menuItemIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  menuItemLabelDestructive: {
    color: colors.error,
    fontWeight: "600",
  },

  // Toggle row (WiFi)
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
  },
  toggleIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
    flex: 1,
  },
  toggleSwitch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 4,
  },

  // App info
  appInfo: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  appInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  appInfoValue: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Map app preference
  mapAppValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  mapPickerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    paddingHorizontal: 20,
  },
  mapPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  mapPickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  mapPickerSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
  mapPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  mapPickerOptionActive: {
    borderColor: colors.primary,
    backgroundColor: "#eff6ff",
  },
  mapPickerOptionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  mapPickerOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  mapPickerCheck: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
  },
  mapPickerClear: {
    marginTop: 8,
    padding: 12,
    alignItems: "center",
  },
  mapPickerClearText: {
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
});
