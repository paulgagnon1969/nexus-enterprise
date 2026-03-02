import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { apiJson } from "../api/client";
import * as Haptics from "expo-haptics";
import { UserMenuButton } from "./UserMenuButton";
import { CallContactPicker, type CallPickerResult } from "./CallContactPicker";

/** Module metadata (everything except Home) */
const MODULES: { key: string; icon: string; label: string }[] = [
  { key: "TodosTab", icon: "✅", label: "ToDo's" },
  { key: "TimecardTab", icon: "⏱️", label: "Timecard" },
  { key: "DirectoryTab", icon: "👥", label: "Directory" },
  { key: "ProjectsTab", icon: "📝", label: "Daily Logs" },
  { key: "MapTab", icon: "🗺️", label: "Map" },
  { key: "ScannerTab", icon: "📐", label: "Scanner" },
  { key: "InventoryTab", icon: "📦", label: "Inventory" },
  { key: "OutboxTab", icon: "📤", label: "Outbox" },
];

const TAB_META: Record<string, { icon: string; label: string }> = {
  HomeTab: { icon: "🏠", label: "Home" },
  TodosTab: { icon: "✅", label: "ToDo's" },
  TimecardTab: { icon: "⏱️", label: "Timecard" },
  DirectoryTab: { icon: "👥", label: "Directory" },
  ProjectsTab: { icon: "📝", label: "Daily Logs" },
  MapTab: { icon: "🗺️", label: "Map" },
  ScannerTab: { icon: "📐", label: "Scanner" },
  InventoryTab: { icon: "📦", label: "Inventory" },
  OutboxTab: { icon: "📤", label: "Outbox" },
};

interface Props extends BottomTabBarProps {
  /** Badge count to show on the ToDo's module (0 = no badge) */
  todoBadgeCount?: number;
  /** Logout handler passed to the UserMenuButton */
  onLogout: () => void;
}

export function ScrollableTabBar({
  state,
  navigation,
  todoBadgeCount = 0,
  onLogout,
}: Props) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callPickerOpen, setCallPickerOpen] = useState(false);
  const [callModePickerOpen, setCallModePickerOpen] = useState(false);
  const [selectedCallMode, setSelectedCallMode] = useState<"video" | "voice" | "radio">("video");

  const currentRoute = state.routes[state.index]?.name ?? "HomeTab";
  const isHome = currentRoute === "HomeTab";
  const activeMeta = TAB_META[currentRoute] ?? { icon: "•", label: currentRoute };

  const goHome = () => {
    void Haptics.selectionAsync();
    const homeRoute = state.routes.find((r) => r.name === "HomeTab");
    if (!homeRoute) return;
    const event = navigation.emit({
      type: "tabPress",
      target: homeRoute.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate("HomeTab");
    }
  };

  const goToModule = (tabKey: string) => {
    void Haptics.selectionAsync();
    setMenuOpen(false);
    const route = state.routes.find((r) => r.name === tabKey);
    if (!route) return;
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(tabKey);
    }
  };

  const openCallPicker = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCallModePickerOpen(true);
  }, []);

  const selectCallMode = useCallback((mode: "video" | "voice" | "radio") => {
    void Haptics.selectionAsync();
    setSelectedCallMode(mode);
    setCallModePickerOpen(false);
    setCallPickerOpen(true);
  }, []);

  // Handle call from the unified picker
  const handleStartCall = useCallback(async (result: CallPickerResult) => {
    if (calling) return;
    setCalling(true);
    try {
      // 1. Create the room with selected call mode
      const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
        "/video/rooms",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callMode: selectedCallMode }) },
      );

      // 2. Build smart-invite invitees from all selected contacts
      const invitees: { userId?: string; phone?: string; email?: string; name?: string }[] = [];

      // API contacts → extract userId from prefixed id
      for (const c of result.apiContacts) {
        const rawUserId = c.id
          .replace(/^ncc-member-/, "")
          .replace(/^ncc-sub-/, "")
          .replace(/^ncc-client-/, "")
          .replace(/^personal-/, "");
        invitees.push({
          userId: rawUserId,
          phone: c.phone ?? undefined,
          email: c.email ?? undefined,
          name: c.displayName || [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
        });
      }

      // Device contacts → phone/email only (no userId)
      for (const dc of result.deviceContacts) {
        invitees.push({
          phone: dc.phone ?? undefined,
          email: dc.email ?? undefined,
          name: dc.displayName || undefined,
        });
      }

      // Manual entry → detect phone vs email
      if (result.manualEntry) {
        const val = result.manualEntry.trim();
        const isEmail = val.includes("@");
        invitees.push({
          phone: isEmail ? undefined : val,
          email: isEmail ? val : undefined,
          name: val,
        });
      }

      // Fire smart-invite (fire-and-forget but log result)
      if (invitees.length > 0) {
        apiJson(`/video/rooms/${res.room.id}/smart-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitees }),
        })
          .then((r: any) => {
            const results = r?.results ?? [];
            const sent = results.filter((x: any) => x.status === "sent");
            const failed = results.filter((x: any) => x.status === "failed");
            if (sent.length > 0) {
              const summary = sent
                .map((x: any) => `${x.channel === "push" ? "📲" : x.channel === "sms" ? "💬" : "📧"} ${x.name}`)
                .join(", ");
              console.log(`[smart-invite] Sent: ${summary}`);
            }
            if (failed.length > 0) {
              console.warn(`[smart-invite] Failed: ${JSON.stringify(failed)}`);
            }
            if (results.length === 0) {
              console.warn("[smart-invite] No results returned from API");
            }
          })
          .catch((err: any) => console.warn("[smart-invite] Error:", err));
      }

      // 3. Close picker and navigate
      setCallPickerOpen(false);
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate("Call", {
          roomId: res.room.id,
          token: res.token,
          livekitUrl: res.livekitUrl,
          callMode: selectedCallMode,
        });
      }
    } catch (err) {
      Alert.alert("Call Failed", "Could not start call. Please try again.");
      console.warn("[video] Failed to start call:", err);
    } finally {
      setCalling(false);
    }
  }, [calling, navigation, selectedCallMode]);

  return (
    <>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
        {/* Home button */}
        <Pressable style={[styles.homeBtn, isHome && styles.homeBtnActive]} onPress={goHome}>
          <Text style={styles.homeIcon}>🏠</Text>
          <Text style={[styles.homeLabel, isHome && styles.homeLabelActive]}>Home</Text>
        </Pressable>

        {/* Modules dropdown trigger */}
        <Pressable style={styles.modulesBtn} onPress={() => { void Haptics.selectionAsync(); setMenuOpen(true); }}>
          <View style={styles.modulesBtnInner}>
            {!isHome && (
              <Text style={styles.activeModuleIcon}>{activeMeta.icon}</Text>
            )}
            <Text style={styles.modulesBtnIcon}>☰</Text>
            <Text style={styles.modulesBtnLabel}>
              {isHome ? "Modules" : activeMeta.label}
            </Text>
          </View>
          {todoBadgeCount > 0 && (
            <View style={styles.barBadge}>
              <Text style={styles.barBadgeText}>
                {todoBadgeCount > 99 ? "99+" : todoBadgeCount}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Call button */}
        <Pressable style={styles.callBtn} onPress={openCallPicker} disabled={calling}>
          {calling ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.callIcon}>📞</Text>
          )}
        </Pressable>

        {/* User menu button (profile, WiFi toggle, logout, version) */}
        <UserMenuButton onLogout={onLogout} />
      </View>

      {/* Module picker popup */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Modules</Text>
              <Pressable onPress={() => setMenuOpen(false)}>
                <Text style={styles.menuClose}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.moduleGrid}>
              {MODULES.map((mod) => {
                const isActive = currentRoute === mod.key;
                const showBadge = mod.key === "TodosTab" && todoBadgeCount > 0;

                return (
                  <Pressable
                    key={mod.key}
                    style={[styles.moduleItem, isActive && styles.moduleItemActive]}
                    onPress={() => goToModule(mod.key)}
                  >
                    <View style={styles.moduleIconWrap}>
                      <Text style={styles.moduleIcon}>{mod.icon}</Text>
                      {showBadge && (
                        <View style={styles.moduleBadge}>
                          <Text style={styles.moduleBadgeText}>
                            {todoBadgeCount > 99 ? "99+" : todoBadgeCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.moduleLabel, isActive && styles.moduleLabelActive]}
                      numberOfLines={1}
                    >
                      {mod.label}
                    </Text>
                    {isActive && <View style={styles.moduleActiveDot} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Call mode picker (Video / Voice / Radio) */}
      <Modal
        visible={callModePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCallModePickerOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setCallModePickerOpen(false)}>
          <View style={styles.modePickerContainer}>
            <Text style={styles.modePickerTitle}>Start a Call</Text>
            <View style={styles.modePickerRow}>
              <Pressable style={styles.modePickerBtn} onPress={() => selectCallMode("video")}>
                <Text style={styles.modePickerIcon}>🎥</Text>
                <Text style={styles.modePickerLabel}>Video</Text>
                <Text style={styles.modePickerDesc}>Camera + mic</Text>
              </Pressable>
              <Pressable style={styles.modePickerBtn} onPress={() => selectCallMode("voice")}>
                <Text style={styles.modePickerIcon}>🎙️</Text>
                <Text style={styles.modePickerLabel}>Voice</Text>
                <Text style={styles.modePickerDesc}>Audio only</Text>
              </Pressable>
              <Pressable style={styles.modePickerBtn} onPress={() => selectCallMode("radio")}>
                <Text style={styles.modePickerIcon}>📻</Text>
                <Text style={styles.modePickerLabel}>Radio</Text>
                <Text style={styles.modePickerDesc}>Push to talk</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Unified call contact picker */}
      <CallContactPicker
        visible={callPickerOpen}
        onClose={() => setCallPickerOpen(false)}
        onStartCall={handleStartCall}
        calling={calling}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // ---- Bottom bar ----
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.tabBackground,
    borderTopWidth: 1,
    borderTopColor: colors.tabBorder,
    paddingTop: 8,
    paddingBottom: 8, // overridden by inline style using safe area insets
    paddingHorizontal: 16,
    gap: 12,
  },
  homeBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  homeBtnActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  homeIcon: {
    fontSize: 22,
  },
  homeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.tabInactive,
    marginTop: 2,
  },
  homeLabelActive: {
    color: colors.tabActive,
    fontWeight: "700",
  },
  modulesBtn: {
    flex: 1,
    position: "relative",
  },
  modulesBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  activeModuleIcon: {
    fontSize: 18,
  },
  modulesBtnIcon: {
    fontSize: 18,
    color: colors.primary,
  },
  modulesBtnLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
  },
  barBadge: {
    position: "absolute",
    top: -4,
    right: 4,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  barBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  callBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  callIcon: {
    fontSize: 18,
  },

  // ---- Modal overlay ----
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
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  menuClose: {
    fontSize: 20,
    color: colors.textMuted,
    padding: 4,
  },

  // ---- Module grid (3 columns) ----
  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  moduleItem: {
    width: "30%",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  moduleItemActive: {
    backgroundColor: colors.backgroundTertiary,
    borderColor: colors.primary,
  },
  moduleIconWrap: {
    position: "relative",
    marginBottom: 6,
  },
  moduleIcon: {
    fontSize: 28,
  },
  moduleBadge: {
    position: "absolute",
    top: -6,
    right: -12,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  moduleBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  moduleLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  moduleLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  moduleActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 4,
  },

  // ---- Call mode picker ----
  modePickerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    paddingHorizontal: 20,
  },
  modePickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 16,
  },
  modePickerRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 12,
  },
  modePickerBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  modePickerIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  modePickerLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modePickerDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
