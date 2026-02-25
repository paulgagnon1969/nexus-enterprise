import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList,
  ScrollView,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/colors";
import { apiJson } from "../api/client";
import { fetchContacts } from "../api/contacts";
import type { Contact } from "../types/api";
import * as Haptics from "expo-haptics";
import { UserMenuButton } from "./UserMenuButton";

/** Module metadata (everything except Home) */
const MODULES: { key: string; icon: string; label: string }[] = [
  { key: "TodosTab", icon: "✅", label: "ToDo's" },
  { key: "TimecardTab", icon: "⏱️", label: "Timecard" },
  { key: "DirectoryTab", icon: "👥", label: "Directory" },
  { key: "ProjectsTab", icon: "📋", label: "Projects" },
  { key: "InventoryTab", icon: "📦", label: "Inventory" },
  { key: "OutboxTab", icon: "📤", label: "Outbox" },
];

const TAB_META: Record<string, { icon: string; label: string }> = {
  HomeTab: { icon: "🏠", label: "Home" },
  TodosTab: { icon: "✅", label: "ToDo's" },
  TimecardTab: { icon: "⏱️", label: "Timecard" },
  DirectoryTab: { icon: "👥", label: "Directory" },
  ProjectsTab: { icon: "📋", label: "Projects" },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [calling, setCalling] = useState(false);

  // Pre-call contact picker state
  const [callPickerOpen, setCallPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [callSearch, setCallSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Open the pre-call contact picker
  const openCallPicker = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCallPickerOpen(true);
    setCallSearch("");
    setSelectedIds(new Set());
    setContactsLoading(true);
    try {
      const list = await fetchContacts({ category: "internal" });
      setContacts(list);
    } catch {
      try {
        const list = await fetchContacts();
        setContacts(list);
      } catch {
        setContacts([]);
      }
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const toggleContact = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredContacts = callSearch.trim()
    ? contacts.filter((c) => {
        const name = [c.firstName, c.lastName, c.displayName, c.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return name.includes(callSearch.toLowerCase());
      })
    : contacts;

  // Create room, invite selected contacts, then navigate to the call
  const startCall = async () => {
    if (calling) return;
    setCalling(true);
    try {
      // 1. Create the room
      const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
        "/video/rooms",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );

      // 2. Invite selected contacts (fire-and-forget)
      if (selectedIds.size > 0) {
        apiJson(`/video/rooms/${res.room.id}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: Array.from(selectedIds) }),
        }).catch(() => {});
      }

      // 3. Close picker and navigate
      setCallPickerOpen(false);
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate("VideoCall", {
          roomId: res.room.id,
          token: res.token,
          livekitUrl: res.livekitUrl,
        });
      }
    } catch (err) {
      Alert.alert("Call Failed", "Could not start video call. Please try again.");
      console.warn("[video] Failed to start call:", err);
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      <View style={styles.bar}>
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

      {/* Pre-call contact picker */}
      <Modal
        visible={callPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCallPickerOpen(false)}
      >
        <View style={styles.callPickerOverlay}>
          <View style={styles.callPickerSheet}>
            {/* Header */}
            <View style={styles.callPickerHeader}>
              <Text style={styles.callPickerTitle}>Start a Call</Text>
              <Pressable onPress={() => setCallPickerOpen(false)}>
                <Text style={styles.callPickerClose}>✕</Text>
              </Pressable>
            </View>

            {/* Search */}
            <TextInput
              style={styles.callPickerSearch}
              placeholder="Search contacts…"
              placeholderTextColor="#9ca3af"
              value={callSearch}
              onChangeText={setCallSearch}
              autoCorrect={false}
            />

            {/* Contact list */}
            {contactsLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(c) => c.id}
                style={styles.callPickerList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const name = item.displayName
                    || [item.firstName, item.lastName].filter(Boolean).join(" ")
                    || item.email
                    || "Unknown";
                  const selected = selectedIds.has(item.id);
                  return (
                    <Pressable
                      style={[styles.callPickerRow, selected && styles.callPickerRowSelected]}
                      onPress={() => toggleContact(item.id)}
                    >
                      <View style={[styles.callPickerAvatar, selected && styles.callPickerAvatarSelected]}>
                        <Text style={styles.callPickerAvatarText}>
                          {selected ? "✓" : name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.callPickerName} numberOfLines={1}>{name}</Text>
                        {item.role && (
                          <Text style={styles.callPickerRole} numberOfLines={1}>{item.role}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.callPickerEmpty}>No contacts found</Text>
                }
              />
            )}

            {/* Action buttons */}
            <View style={styles.callPickerActions}>
              <Pressable
                style={[styles.callPickerStartBtn, calling && { opacity: 0.6 }]}
                onPress={startCall}
                disabled={calling}
              >
                {calling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.callPickerStartText}>
                    {selectedIds.size > 0
                      ? `📞 Call ${selectedIds.size} person${selectedIds.size > 1 ? "s" : ""}`
                      : "📞 Start Call"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: Platform.OS === "ios" ? 24 : 40,
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

  // ---- Pre-call contact picker ----
  callPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  callPickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  callPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  callPickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  callPickerClose: {
    fontSize: 22,
    color: "#6b7280",
    padding: 4,
  },
  callPickerSearch: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    color: "#1f2937",
  },
  callPickerList: {
    paddingHorizontal: 20,
  },
  callPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  callPickerRowSelected: {
    backgroundColor: "#eff6ff",
  },
  callPickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  callPickerAvatarSelected: {
    backgroundColor: "#2563eb",
  },
  callPickerAvatarText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "700",
  },
  callPickerName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1f2937",
  },
  callPickerRole: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 1,
  },
  callPickerEmpty: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 14,
    paddingVertical: 32,
  },
  callPickerActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  callPickerStartBtn: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  callPickerStartText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
