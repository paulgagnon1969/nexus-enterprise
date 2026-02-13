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
import { DailyLogFeedScreen } from "../screens/DailyLogFeedScreen";
import { DailyLogDetailScreen } from "../screens/DailyLogDetailScreen";
import { DailyLogEditScreen } from "../screens/DailyLogEditScreen";
import { DailyLogCreateScreen } from "../screens/DailyLogCreateScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { OutboxScreen } from "../screens/OutboxScreen";
import { TimecardScreen } from "../screens/TimecardScreen";
import type { ProjectListItem, DailyLogListItem, DailyLogDetail } from "../types/api";

// Type definitions for navigation
export type RootTabParamList = {
  HomeTab: { triggerSync?: boolean } | undefined;
  TimecardTab: undefined;
  LogsTab: undefined;
  ProjectsTab: undefined;
  InventoryTab: undefined;
  OutboxTab: undefined;
};

export type ProjectsStackParamList = {
  ProjectsList: undefined;
  DailyLogs: { project: ProjectListItem; companyName?: string; petlChanges?: PetlSessionChanges };
  FieldPetl: { project: ProjectListItem; companyName?: string };
};

export type LogsStackParamList = {
  LogsFeed: undefined;
  LogDetail: { log: DailyLogListItem };
  LogEdit: { log: DailyLogDetail };
  LogCreate: undefined;
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

// Screen wrappers that use hooks instead of render props
function LogsFeedWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<LogsStackParamList>>();
  return (
    <DailyLogFeedScreen
      onSelectLog={(log) => navigation.navigate("LogDetail", { log })}
      onCreateLog={() => navigation.navigate("LogCreate")}
    />
  );
}

function LogDetailWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<LogsStackParamList>>();
  const route = useRoute<RouteProp<LogsStackParamList, "LogDetail">>();
  return (
    <DailyLogDetailScreen
      log={route.params.log}
      onBack={() => navigation.goBack()}
      onEdit={(log) => navigation.navigate("LogEdit", { log })}
    />
  );
}

function LogEditWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<LogsStackParamList>>();
  const route = useRoute<RouteProp<LogsStackParamList, "LogEdit">>();
  return (
    <DailyLogEditScreen
      log={route.params.log}
      onBack={() => navigation.goBack()}
      onSaved={() => navigation.goBack()}
    />
  );
}

function LogCreateWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<LogsStackParamList>>();
  return (
    <DailyLogCreateScreen
      onBack={() => navigation.goBack()}
      onCreated={() => navigation.goBack()}
    />
  );
}

// Logs stack with Feed -> Detail -> Edit -> Create
function LogsStackNavigator() {
  return (
    <LogsStack.Navigator screenOptions={{ headerShown: false }}>
      <LogsStack.Screen name="LogsFeed" component={LogsFeedWrapper} />
      <LogsStack.Screen name="LogDetail" component={LogDetailWrapper} />
      <LogsStack.Screen name="LogEdit" component={LogEditWrapper} />
      <LogsStack.Screen name="LogCreate" component={LogCreateWrapper} />
    </LogsStack.Navigator>
  );
}

// Projects stack wrappers
function ProjectsListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const company = useCurrentCompany();
  return (
    <ProjectsScreen
      onOpenProject={(project) => navigation.navigate("DailyLogs", { project, companyName: company.name ?? undefined })}
    />
  );
}

function DailyLogsWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList & RootTabParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "DailyLogs">>();
  const project = route.params.project;
  const companyName = route.params.companyName;
  const petlChanges = route.params.petlChanges;
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
const CompanyContext = React.createContext<{ name: string | null; id: string | null }>({
  name: null,
  id: null,
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
  const triggerSync = route.params?.triggerSync;
  
  return (
    <HomeScreen
      onLogout={onLogout}
      onGoProjects={() => {}}
      onGoInventory={() => {}}
      onGoOutbox={() => {}}
      onCompanyChange={setCompany}
      triggerSyncOnMount={triggerSync}
    />
  );
}

export function AppNavigator({ onLogout }: { onLogout: () => void }) {
  const [company, setCompany] = React.useState<{ id: string | null; name: string | null }>({
    id: null,
    name: null,
  });
  
  return (
    <LogoutContext.Provider value={onLogout}>
    <CompanyContext.Provider value={company}>
    <SetCompanyContext.Provider value={(c) => setCompany({ id: c.id, name: c.name })}>
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
          name="LogsTab"
          options={{ tabBarLabel: "Logs" }}
          component={LogsStackNavigator}
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
