import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Text, View } from "react-native";
import { colors } from "../theme/colors";

import { HomeScreen } from "../screens/HomeScreen";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { DailyLogsScreen } from "../screens/DailyLogsScreen";
import { FieldPetlScreen, type PetlSessionChanges } from "../screens/FieldPetlScreen";
import { DirectoryScreen } from "../screens/DirectoryScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { OutboxScreen } from "../screens/OutboxScreen";
import { TimecardScreen } from "../screens/TimecardScreen";
import type { ProjectListItem } from "../types/api";

// Type definitions for navigation
export type RootTabParamList = {
  HomeTab: { triggerSync?: boolean } | undefined;
  TimecardTab: undefined;
  DirectoryTab: undefined;
  ProjectsTab: undefined;
  InventoryTab: undefined;
  OutboxTab: undefined;
};

export type ProjectsStackParamList = {
  ProjectsList: undefined;
  DailyLogs: { project: ProjectListItem; companyName?: string; petlChanges?: PetlSessionChanges; createLogType?: string };
  FieldPetl: { project: ProjectListItem; companyName?: string };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const ProjectsStack = createNativeStackNavigator<ProjectsStackParamList>();

// Simple icon component (can be replaced with expo-vector-icons later)
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "🏠",
    Timecard: "⏱️",
    Directory: "👥",
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

// Projects stack wrappers
function ProjectsListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const company = useCurrentCompany();
  return (
    <ProjectsScreen
      onOpenProject={(project) => navigation.navigate("DailyLogs", { project, companyName: company.name ?? undefined })}
      refreshKey={company.refreshKey}
    />
  );
}

function DailyLogsWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList & RootTabParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "DailyLogs">>();
  const project = route.params.project;
  const companyName = route.params.companyName;
  const petlChanges = route.params.petlChanges;
  const createLogType = route.params.createLogType;
  return (
    <DailyLogsScreen
      project={project}
      companyName={companyName}
      onBack={() => navigation.goBack()}
      onOpenPetl={() => navigation.navigate("FieldPetl", { project, companyName })}
      onNavigateHome={() => {
        // Navigate to Home tab with sync trigger
        navigation.getParent()?.navigate("HomeTab", { triggerSync: true });
      }}
      petlChanges={petlChanges}
      createLogType={createLogType}
    />
  );
}

function FieldPetlWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "FieldPetl">>();
  const project = route.params.project;
  const companyName = route.params.companyName;
  return (
    <FieldPetlScreen
      project={project}
      companyName={companyName}
      onBack={() => navigation.goBack()}
      onSaveWithChanges={(changes) => {
        // Navigate back to DailyLogs with the changes
        navigation.navigate("DailyLogs", { project, companyName, petlChanges: changes });
      }}
    />
  );
}

// Projects stack with drill-down to Daily Logs and Field PETL
function ProjectsStackNavigator() {
  return (
    <ProjectsStack.Navigator screenOptions={{ headerShown: false }}>
      <ProjectsStack.Screen name="ProjectsList" component={ProjectsListWrapper} />
      <ProjectsStack.Screen name="DailyLogs" component={DailyLogsWrapper} />
      <ProjectsStack.Screen name="FieldPetl" component={FieldPetlWrapper} />
    </ProjectsStack.Navigator>
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

// Context for logout callback and company info
const LogoutContext = React.createContext<() => void>(() => {});
const CompanyContext = React.createContext<{ name: string | null; id: string | null; refreshKey: number }>({
  name: null,
  id: null,
  refreshKey: 0,
});

// Hook to get current company from context
export function useCurrentCompany() {
  return React.useContext(CompanyContext);
}

// Callback for HomeScreen to update company context
const SetCompanyContext = React.createContext<(company: { id: string; name: string }) => void>(() => {});

function HomeTabScreen() {
  const onLogout = React.useContext(LogoutContext);
  const setCompany = React.useContext(SetCompanyContext);
  const route = useRoute<RouteProp<RootTabParamList, "HomeTab">>();
  const navigation = useNavigation<any>();
  const triggerSync = route.params?.triggerSync;
  
  return (
    <HomeScreen
      onLogout={onLogout}
      onGoProjects={() => {}}
      onGoInventory={() => {}}
      onGoOutbox={() => {}}
      onCompanyChange={setCompany}
      triggerSyncOnMount={triggerSync}
      onOpenPetl={(project) => {
        // Navigate to Projects tab and then to FieldPetl
        navigation.navigate("ProjectsTab", {
          screen: "FieldPetl",
          params: { project },
        });
      }}
      onOpenDailyLogCreate={(project, logType) => {
        // Navigate to Projects tab and then to DailyLogs (which handles creation)
        navigation.navigate("ProjectsTab", {
          screen: "DailyLogs",
          params: { project, createLogType: logType },
        });
      }}
    />
  );
}

export function AppNavigator({ onLogout }: { onLogout: () => void }) {
  const [company, setCompany] = React.useState<{ id: string | null; name: string | null; refreshKey: number }>({
    id: null,
    name: null,
    refreshKey: 0,
  });
  
  return (
    <LogoutContext.Provider value={onLogout}>
    <CompanyContext.Provider value={company}>
    <SetCompanyContext.Provider value={(c) => setCompany((prev) => ({ id: c.id, name: c.name, refreshKey: prev.refreshKey + 1 }))}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name.replace("Tab", "")} focused={focused} />
          ),
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: {
            backgroundColor: colors.tabBackground,
            borderTopColor: colors.tabBorder,
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
          component={HomeTabScreen}
        />
        <Tab.Screen
          name="TimecardTab"
          options={{ tabBarLabel: "Timecard" }}
          component={TimecardScreen}
        />
        <Tab.Screen
          name="DirectoryTab"
          options={{ tabBarLabel: "Directory" }}
          component={DirectoryScreen}
        />
        <Tab.Screen
          name="ProjectsTab"
          options={{ tabBarLabel: "Projects" }}
          component={ProjectsStackNavigator}
        />
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
    </SetCompanyContext.Provider>
    </CompanyContext.Provider>
    </LogoutContext.Provider>
  );
}
