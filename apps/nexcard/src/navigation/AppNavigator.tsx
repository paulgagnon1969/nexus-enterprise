import React from "react";
import { Text, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/colors";

import { DashboardScreen } from "../screens/DashboardScreen";
import { AccountsScreen } from "../screens/AccountsScreen";
import { TransactionsScreen } from "../screens/TransactionsScreen";
import { SyncScreen } from "../screens/SyncScreen";
import { VaultScreen } from "../screens/VaultScreen";
import { SettingsScreen } from "../screens/SettingsScreen";

export type RootTabParamList = {
  Dashboard: undefined;
  Accounts: undefined;
  Transactions: undefined;
  Sync: undefined;
  Vault: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, { active: string; inactive: string }> = {
  Dashboard: { active: "◉", inactive: "○" },
  Accounts: { active: "▣", inactive: "▢" },
  Transactions: { active: "≡", inactive: "≡" },
  Sync: { active: "⇄", inactive: "⇄" },
  Vault: { active: "🔒", inactive: "🔓" },
  Settings: { active: "⚙", inactive: "⚙" },
};

// Context so SettingsScreen can trigger logout
export const LogoutContext = React.createContext<() => void>(() => {});

export function AppNavigator({ onLogout }: { onLogout: () => void }) {
  return (
    <LogoutContext.Provider value={onLogout}>
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: colors.primary },
        headerTitleStyle: { color: colors.textOnPrimary, fontWeight: "700" },
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <Text style={[styles.tabIcon, { color: focused ? colors.tabActive : colors.tabInactive }]}>
            {focused ? TAB_ICONS[route.name].active : TAB_ICONS[route.name].inactive}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Accounts" component={AccountsScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Sync" component={SyncScreen} />
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
    </LogoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.tabBackground,
    borderTopColor: colors.tabBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 6,
    height: Platform.OS === "ios" ? 84 : 60,
  },
  tabLabel: { fontSize: 11, fontWeight: "600" },
  tabIcon: { fontSize: 20 },
});
