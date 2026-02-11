import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View } from "react-native";

import { HomeScreen } from "../screens/HomeScreen";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { DailyLogsScreen } from "../screens/DailyLogsScreen";
import { DailyLogFeedScreen } from "../screens/DailyLogFeedScreen";
import { DailyLogDetailScreen } from "../screens/DailyLogDetailScreen";
import { DailyLogEditScreen } from "../screens/DailyLogEditScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { OutboxScreen } from "../screens/OutboxScreen";
import { TimecardScreen } from "../screens/TimecardScreen";
import type { ProjectListItem, DailyLogListItem, DailyLogDetail } from "../types/api";

// Type definitions for navigation
export type RootTabParamList = {
  HomeTab: undefined;
  TimecardTab: undefined;
  LogsTab: undefined;
  ProjectsTab: undefined;
  InventoryTab: undefined;
  OutboxTab: undefined;
};

export type ProjectsStackParamList = {
  ProjectsList: undefined;
  DailyLogs: { project: ProjectListItem };
};

export type LogsStackParamList = {
  LogsFeed: undefined;
  LogDetail: { log: DailyLogListItem };
  LogEdit: { log: DailyLogDetail };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const ProjectsStack = createNativeStackNavigator<ProjectsStackParamList>();
const LogsStack = createNativeStackNavigator<LogsStackParamList>();

// Simple icon component (can be replaced with expo-vector-icons later)
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "🏠",
    Timecard: "⏱️",
    Logs: "📝",
    Projects: "📋",
    Inventory: "📦",
    Outbox: "📤",
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label] ?? "•"}
    </Text>
  );
}

// Logs stack with Feed -> Detail -> Edit
function LogsStackNavigator() {
  return (
    <LogsStack.Navigator screenOptions={{ headerShown: false }}>
      <LogsStack.Screen name="LogsFeed">
        {(props) => (
          <DailyLogFeedScreen
            onSelectLog={(log) =>
              props.navigation.navigate("LogDetail", { log })
            }
          />
        )}
      </LogsStack.Screen>
      <LogsStack.Screen name="LogDetail">
        {(props) => (
          <DailyLogDetailScreen
            log={props.route.params.log}
            onBack={() => props.navigation.goBack()}
            onEdit={(log) => props.navigation.navigate("LogEdit", { log })}
          />
        )}
      </LogsStack.Screen>
      <LogsStack.Screen name="LogEdit">
        {(props) => (
          <DailyLogEditScreen
            log={props.route.params.log}
            onBack={() => props.navigation.goBack()}
            onSaved={(updated) => {
              // Go back to detail screen with updated log
              props.navigation.goBack();
            }}
          />
        )}
      </LogsStack.Screen>
    </LogsStack.Navigator>
  );
}

// Projects stack with drill-down to Daily Logs
function ProjectsStackNavigator({ onLogout }: { onLogout: () => void }) {
  return (
    <ProjectsStack.Navigator screenOptions={{ headerShown: false }}>
      <ProjectsStack.Screen name="ProjectsList">
        {(props) => (
          <ProjectsScreen
            {...props}
            onBack={() => {}} // No back from root
            onOpenProject={(project) =>
              props.navigation.navigate("DailyLogs", { project })
            }
          />
        )}
      </ProjectsStack.Screen>
      <ProjectsStack.Screen name="DailyLogs">
        {(props) => (
          <DailyLogsScreen
            project={props.route.params.project}
            onBack={() => props.navigation.goBack()}
          />
        )}
      </ProjectsStack.Screen>
    </ProjectsStack.Navigator>
  );
}

// Wrapper for HomeScreen to handle navigation
function HomeTabScreen({ onLogout }: { onLogout: () => void }) {
  // Home screen doesn't need navigation props anymore - it uses tabs
  return (
    <HomeScreen
      onLogout={onLogout}
      onGoProjects={() => {}} // Handled by tabs now
      onGoInventory={() => {}} // Handled by tabs now
      onGoOutbox={() => {}} // Handled by tabs now
    />
  );
}

// Wrapper for InventoryScreen
function InventoryTabScreen() {
  return <InventoryScreen onBack={() => {}} />;
}

// Wrapper for OutboxScreen
function OutboxTabScreen() {
  return <OutboxScreen onBack={() => {}} />;
}

export function AppNavigator({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name.replace("Tab", "")} focused={focused} />
        ),
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5e7eb",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        options={{ tabBarLabel: "Home" }}
      >
        {() => <HomeTabScreen onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen
        name="TimecardTab"
        options={{ tabBarLabel: "Timecard" }}
        component={TimecardScreen}
      />
      <Tab.Screen
        name="LogsTab"
        options={{ tabBarLabel: "Logs" }}
        component={LogsStackNavigator}
      />
      <Tab.Screen
        name="ProjectsTab"
        options={{ tabBarLabel: "Projects" }}
      >
        {() => <ProjectsStackNavigator onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen
        name="InventoryTab"
        options={{ tabBarLabel: "Inventory" }}
        component={InventoryTabScreen}
      />
      <Tab.Screen
        name="OutboxTab"
        options={{ tabBarLabel: "Outbox" }}
        component={OutboxTabScreen}
      />
    </Tab.Navigator>
  );
}
