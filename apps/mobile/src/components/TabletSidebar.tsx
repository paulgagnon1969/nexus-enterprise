import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { SIDEBAR_WIDTH } from "../theme/responsive";
import { apiJson } from "../api/client";
import * as Haptics from "expo-haptics";
import { UserMenuButton } from "./UserMenuButton";
import { CallContactPicker, type CallPickerResult } from "./CallContactPicker";

/** Module metadata — same source of truth as ScrollableTabBar */
const MODULES: { key: string; icon: string; label: string }[] = [
  { key: "HomeTab", icon: "🏠", label: "Home" },
  { key: "TodosTab", icon: "✅", label: "ToDo's" },
  { key: "TimecardTab", icon: "⏱️", label: "Timecard" },
  { key: "DirectoryTab", icon: "👥", label: "Directory" },
  { key: "ProjectsTab", icon: "📝", label: "Daily Logs" },
  { key: "MapTab", icon: "🗺️", label: "Map" },
  { key: "ScannerTab", icon: "📐", label: "Scanner" },
  { key: "InventoryTab", icon: "📦", label: "Inventory" },
  { key: "OutboxTab", icon: "📤", label: "Outbox" },
  { key: "BankingTab", icon: "💳", label: "Banking" },
  { key: "ShopTab", icon: "🛒", label: "Shop" },
  { key: "DevSessionsTab", icon: "🛠️", label: "Dev Mirror" },
];

interface Props extends BottomTabBarProps {
  todoBadgeCount?: number;
  onLogout: () => void;
}

export function TabletSidebar({
  state,
  navigation,
  todoBadgeCount = 0,
  onLogout,
}: Props) {
  const insets = useSafeAreaInsets();
  const [calling, setCalling] = useState(false);
  const [callPickerOpen, setCallPickerOpen] = useState(false);
  const [callModePickerOpen, setCallModePickerOpen] = useState(false);
  const [selectedCallMode, setSelectedCallMode] = useState<"video" | "voice" | "radio">("video");

  const currentRoute = state.routes[state.index]?.name ?? "HomeTab";
  const availableRouteNames = new Set(state.routes.map((r) => r.name));
  const visibleModules = MODULES.filter((m) => availableRouteNames.has(m.key));

  const goToModule = (tabKey: string) => {
    void Haptics.selectionAsync();
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

  const handleStartCall = useCallback(
    async (result: CallPickerResult) => {
      if (calling) return;
      setCalling(true);
      try {
        const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
          "/video/rooms",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callMode: selectedCallMode }),
          },
        );

        // Build invitees (same logic as ScrollableTabBar)
        const invitees: { userId?: string; phone?: string; email?: string; name?: string }[] = [];
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
        for (const dc of result.deviceContacts) {
          invitees.push({
            phone: dc.phone ?? undefined,
            email: dc.email ?? undefined,
            name: dc.displayName || undefined,
          });
        }
        if (result.manualEntry) {
          const val = result.manualEntry.trim();
          const isEmail = val.includes("@");
          invitees.push({
            phone: isEmail ? undefined : val,
            email: isEmail ? val : undefined,
            name: val,
          });
        }

        if (invitees.length > 0) {
          apiJson(`/video/rooms/${res.room.id}/smart-invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invitees }),
          }).catch((err: any) => console.warn("[smart-invite] Error:", err));
        }

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
      } catch {
        Alert.alert("Call Failed", "Could not start call. Please try again.");
      } finally {
        setCalling(false);
      }
    },
    [calling, navigation, selectedCallMode],
  );

  return (
    <>
      <View style={[styles.sidebar, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.brandText}>NEXUS</Text>
        </View>

        {/* Module list */}
        <ScrollView style={styles.moduleScroll} showsVerticalScrollIndicator={false}>
          {visibleModules.map((mod) => {
            const isActive = currentRoute === mod.key;
            const showBadge = mod.key === "TodosTab" && todoBadgeCount > 0;

            return (
              <Pressable
                key={mod.key}
                style={[styles.moduleRow, isActive && styles.moduleRowActive]}
                onPress={() => goToModule(mod.key)}
              >
                {isActive && <View style={styles.activeIndicator} />}
                <View style={styles.moduleIconWrap}>
                  <Text style={styles.moduleIcon}>{mod.icon}</Text>
                  {showBadge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
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
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Bottom actions: Call + User */}
        <View style={styles.bottomActions}>
          <Pressable style={styles.callBtn} onPress={openCallPicker} disabled={calling}>
            {calling ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <>
                <Text style={styles.callIcon}>📞</Text>
                <Text style={styles.callLabel}>Call</Text>
              </>
            )}
          </Pressable>
          <UserMenuButton onLogout={onLogout} />
        </View>
      </View>

      {/* Call mode picker modal */}
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
              </Pressable>
              <Pressable style={styles.modePickerBtn} onPress={() => selectCallMode("voice")}>
                <Text style={styles.modePickerIcon}>🎙️</Text>
                <Text style={styles.modePickerLabel}>Voice</Text>
              </Pressable>
              <Pressable style={styles.modePickerBtn} onPress={() => selectCallMode("radio")}>
                <Text style={styles.modePickerIcon}>📻</Text>
                <Text style={styles.modePickerLabel}>Radio</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Call contact picker */}
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
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    justifyContent: "flex-start",
  },

  // Brand
  brand: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  brandText: {
    color: colors.textOnPrimary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
  },

  // Module list
  moduleScroll: {
    flex: 1,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
    position: "relative",
  },
  moduleRowActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.textOnPrimary,
  },
  moduleIconWrap: {
    width: 32,
    alignItems: "center",
    position: "relative",
  },
  moduleIcon: {
    fontSize: 20,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  moduleLabel: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
    flex: 1,
  },
  moduleLabelActive: {
    color: colors.textOnPrimary,
    fontWeight: "700",
  },

  // Bottom actions
  bottomActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 12,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    flex: 1,
  },
  callIcon: {
    fontSize: 18,
  },
  callLabel: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: "600",
  },

  // Modals
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modePickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 24,
    width: 360,
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
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
});
