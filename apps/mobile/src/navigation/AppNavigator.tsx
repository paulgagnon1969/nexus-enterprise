import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Text, View, StyleSheet, Platform } from "react-native";
import { colors } from "../theme/colors";
import appJson from "../../app.json";

import { HomeScreen } from "../screens/HomeScreen";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { DailyLogsScreen } from "../screens/DailyLogsScreen";
import { FieldPetlScreen, type PetlSessionChanges } from "../screens/FieldPetlScreen";
import { DirectoryScreen } from "../screens/DirectoryScreen";
import { PhoneContactsScreen } from "../screens/PhoneContactsScreen";
import { InviteScreen } from "../screens/InviteScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { OutboxScreen } from "../screens/OutboxScreen";
import { TimecardScreen } from "../screens/TimecardScreen";
import { TodosScreen } from "../screens/TodosScreen";
import { PlanSheetsScreen } from "../screens/PlanSheetsScreen";
import { PlanSheetViewerScreen } from "../screens/PlanSheetViewerScreen";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { fetchAllTasks } from "../api/tasks";
import { recordTabUsage, getTopTab } from "../storage/usageTracker";
import type { ProjectListItem, TaskItem, PlanSheetItem } from "../types/api";

// Type definitions for navigation
export type RootTabParamList = {
  HomeTab: { triggerSync?: boolean } | undefined;
  TodosTab: undefined;
  TimecardTab: undefined;
  DirectoryTab: undefined;
  ProjectsTab: undefined;
  InventoryTab: undefined;
  OutboxTab: undefined;
};

export type DirectoryStackParamList = {
  DirectoryList: undefined;
  PhoneContacts: undefined;
  Invite: { preselectedIds?: string[] } | undefined;
};

export type ProjectsStackParamList = {
  ProjectsList: undefined;
  DailyLogs: { project: ProjectListItem; companyName?: string; petlChanges?: PetlSessionChanges; createLogType?: string };
  FieldPetl: { project: ProjectListItem; companyName?: string };
  PlanSheets: { project: ProjectListItem };
  PlanSheetViewer: {
    projectId: string;
    uploadId: string;
    sheets: PlanSheetItem[];
    initialIndex: number;
  };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const DirectoryStack = createNativeStackNavigator<DirectoryStackParamList>();
const ProjectsStack = createNativeStackNavigator<ProjectsStackParamList>();

// Projects stack wrappers
function ProjectsListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const company = useCurrentCompany();
  const setCompany = React.useContext(SetCompanyContext);
  return (
    <ProjectsScreen
      onOpenProject={(project) => navigation.navigate("DailyLogs", { project, companyName: company.name ?? undefined })}
      refreshKey={company.refreshKey}
      currentCompanyId={company.id}
      currentCompanyName={company.name}
      onCompanyChange={setCompany}
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
      onOpenPlanSheets={() => navigation.navigate("PlanSheets", { project })}
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

function PlanSheetsWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "PlanSheets">>();
  const project = route.params.project;
  return (
    <PlanSheetsScreen
      project={project}
      onBack={() => navigation.goBack()}
      onOpenViewer={(params) => navigation.navigate("PlanSheetViewer", params)}
    />
  );
}

function PlanSheetViewerWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "PlanSheetViewer">>();
  return (
    <PlanSheetViewerScreen
      projectId={route.params.projectId}
      uploadId={route.params.uploadId}
      sheets={route.params.sheets}
      initialIndex={route.params.initialIndex}
      onBack={() => navigation.goBack()}
    />
  );
}

// Directory stack with drill-down to PhoneContacts and Invite
function DirectoryStackNavigator() {
  return (
    <DirectoryStack.Navigator screenOptions={{ headerShown: false }}>
      <DirectoryStack.Screen name="DirectoryList" component={DirectoryListWrapper} />
      <DirectoryStack.Screen name="PhoneContacts" component={PhoneContactsWrapper} />
      <DirectoryStack.Screen name="Invite" component={InviteWrapper} />
    </DirectoryStack.Navigator>
  );
}

function DirectoryListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DirectoryStackParamList>>();
  return (
    <DirectoryScreen
      onImportFromPhone={() => navigation.navigate("PhoneContacts")}
      onInvite={() => navigation.navigate("Invite")}
    />
  );
}

function PhoneContactsWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DirectoryStackParamList>>();
  return (
    <PhoneContactsScreen
      onBack={() => navigation.goBack()}
      onSynced={() => {}}
    />
  );
}

function InviteWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DirectoryStackParamList>>();
  const route = useRoute<RouteProp<DirectoryStackParamList, "Invite">>();
  return (
    <InviteScreen
      onBack={() => navigation.goBack()}
      preselectedIds={route.params?.preselectedIds}
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
      <ProjectsStack.Screen name="PlanSheets" component={PlanSheetsWrapper} />
      <ProjectsStack.Screen name="PlanSheetViewer" component={PlanSheetViewerWrapper} />
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

  // Load usage-based initial tab (defaults to Home until enough data)
  const [initialTab, setInitialTab] = React.useState<keyof RootTabParamList>("HomeTab");
  const [tabReady, setTabReady] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      try {
        const top = await getTopTab();
        if (top && top in TAB_KEYS) {
          setInitialTab(top as keyof RootTabParamList);
        }
      } catch { /* default to Home */ }
      setTabReady(true);
    })();
  }, []);

  // Track urgent task count for badge
  const [urgentCount, setUrgentCount] = React.useState(0);
  React.useEffect(() => {
    let mounted = true;
    const loadBadge = async () => {
      try {
        const tasks = await fetchAllTasks();
        if (!mounted) return;
        const now = new Date();
        let urgent = 0;
        for (const t of tasks) {
          if (t.status === "DONE" || !t.dueDate) continue;
          const diff = (new Date(t.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (diff <= 1) urgent++; // overdue or due within 24h
        }
        setUrgentCount(urgent);
      } catch { /* ignore */ }
    };
    loadBadge();
    const interval = setInterval(loadBadge, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Don't render navigator until we know the initial tab
  if (!tabReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary }}>
        <View style={navStyles.versionHeader}>
          <Text style={navStyles.versionBrand}>NEXUS</Text>
        </View>
      </View>
    );
  }

  return (
    <LogoutContext.Provider value={onLogout}>
    <CompanyContext.Provider value={company}>
    <SetCompanyContext.Provider value={(c) => setCompany((prev) => ({ id: c.id, name: c.name, refreshKey: prev.refreshKey + 1 }))}>
      {/* Top brand bar */}
      <View style={navStyles.versionHeader}>
        <Text style={navStyles.versionBrand}>NEXUS</Text>
      </View>

      <Tab.Navigator
        initialRouteName={initialTab}
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <ScrollableTabBar {...props} todoBadgeCount={urgentCount} onLogout={onLogout} />
        )}
        screenListeners={{
          tabPress: (e) => {
            // Record tab usage for smart default
            const tabName = e.target?.split("-")[0];
            if (tabName) void recordTabUsage(tabName);
          },
        }}
      >
        <Tab.Screen name="HomeTab" component={HomeTabScreen} />
        <Tab.Screen name="TodosTab" component={TodosScreen} />
        <Tab.Screen name="TimecardTab" component={TimecardScreen} />
        <Tab.Screen name="DirectoryTab" component={DirectoryStackNavigator} />
        <Tab.Screen name="ProjectsTab" component={ProjectsStackNavigator} />
        <Tab.Screen name="InventoryTab" component={InventoryTabScreen} />
        <Tab.Screen name="OutboxTab" component={OutboxTabScreen} />
      </Tab.Navigator>
    </SetCompanyContext.Provider>
    </CompanyContext.Provider>
    </LogoutContext.Provider>
  );
}

/** Valid tab keys for type guard */
const TAB_KEYS: Record<string, boolean> = {
  HomeTab: true,
  TodosTab: true,
  TimecardTab: true,
  DirectoryTab: true,
  ProjectsTab: true,
  InventoryTab: true,
  OutboxTab: true,
};

const navStyles = StyleSheet.create({
  versionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 54 : 32,
    paddingBottom: 8,
  },
  versionBrand: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
