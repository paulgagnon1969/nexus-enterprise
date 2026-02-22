import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/colors";

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
}

export function ScrollableTabBar({
  state,
  navigation,
  todoBadgeCount = 0,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const currentRoute = state.routes[state.index]?.name ?? "HomeTab";
  const isHome = currentRoute === "HomeTab";
  const activeMeta = TAB_META[currentRoute] ?? { icon: "•", label: currentRoute };

  const goHome = () => {
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

  return (
    <>
      <View style={styles.bar}>
        {/* Home button */}
        <Pressable style={[styles.homeBtn, isHome && styles.homeBtnActive]} onPress={goHome}>
          <Text style={styles.homeIcon}>🏠</Text>
          <Text style={[styles.homeLabel, isHome && styles.homeLabelActive]}>Home</Text>
        </Pressable>

        {/* Modules dropdown trigger */}
        <Pressable style={styles.modulesBtn} onPress={() => setMenuOpen(true)}>
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
    paddingBottom: Platform.OS === "ios" ? 24 : 10,
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
});
