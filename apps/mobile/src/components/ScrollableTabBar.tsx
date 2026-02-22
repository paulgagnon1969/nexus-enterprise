import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/colors";

/** Tab metadata: icon + display label */
const TAB_META: Record<string, { icon: string; label: string }> = {
  HomeTab: { icon: "🏠", label: "Home" },
  TodosTab: { icon: "✅", label: "ToDo's" },
  TimecardTab: { icon: "⏱️", label: "Timecard" },
  DirectoryTab: { icon: "👥", label: "Directory" },
  ProjectsTab: { icon: "📋", label: "Projects" },
  InventoryTab: { icon: "📦", label: "Inventory" },
  OutboxTab: { icon: "📤", label: "Outbox" },
};

const TAB_WIDTH = 76;

interface Props extends BottomTabBarProps {
  /** Badge count to show on the ToDo's tab (0 = no badge) */
  todoBadgeCount?: number;
}

export function ScrollableTabBar({
  state,
  descriptors,
  navigation,
  todoBadgeCount = 0,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to keep the active tab visible
  useEffect(() => {
    const x = state.index * TAB_WIDTH;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - TAB_WIDTH), animated: true });
  }, [state.index]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name] ?? { icon: "•", label: route.name };

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          const showBadge = route.name === "TodosTab" && todoBadgeCount > 0;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={meta.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.tab, focused && styles.tabFocused]}
            >
              <View style={styles.iconContainer}>
                <Text style={[styles.icon, focused && styles.iconFocused]}>
                  {meta.icon}
                </Text>
                {showBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {todoBadgeCount > 99 ? "99+" : todoBadgeCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[styles.label, focused && styles.labelFocused]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
              {focused && <View style={styles.activeIndicator} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.tabBackground,
    borderTopWidth: 1,
    borderTopColor: colors.tabBorder,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: 4,
  },
  tab: {
    width: TAB_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 4,
    position: "relative",
  },
  tabFocused: {
    // active tab gets a subtle background
  },
  iconContainer: {
    position: "relative",
  },
  icon: {
    fontSize: 22,
    opacity: 0.5,
  },
  iconFocused: {
    opacity: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.tabInactive,
    marginTop: 2,
  },
  labelFocused: {
    color: colors.tabActive,
    fontWeight: "700",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: 16,
    right: 16,
    height: 3,
    backgroundColor: colors.tabActive,
    borderRadius: 1.5,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -12,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
