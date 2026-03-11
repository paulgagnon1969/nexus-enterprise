import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Text, View, StyleSheet, Platform, Alert } from "react-native";
import { colors } from "../theme/colors";
import appJson from "../../app.json";

import { HomeScreen } from "../screens/HomeScreen";
import { KpiHomeScreen } from "../screens/KpiHomeScreen";
import { ProjectsScreen } from "../screens/ProjectsScreen";
import { MapScreen } from "../screens/MapScreen";
import { DailyLogsScreen } from "../screens/DailyLogsScreen";
import { DailyLogFeedScreen } from "../screens/DailyLogFeedScreen";
import { DailyLogDetailScreen } from "../screens/DailyLogDetailScreen";
import { DailyLogEditScreen } from "../screens/DailyLogEditScreen";
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
import { CreateProjectScreen } from "../screens/CreateProjectScreen";
import { RoomScanScreen } from "../screens/RoomScanScreen";
import { ReceiptCaptureScreen } from "../screens/ReceiptCaptureScreen";
import { ScannerHomeScreen } from "../screens/ScannerHomeScreen";
import { TagReadScreen } from "../screens/TagReadScreen";
import { FleetOnboardScreen } from "../screens/FleetOnboardScreen";
import { ObjectCaptureScreen } from "../screens/ObjectCaptureScreen";
import { PrecisionScanScreen } from "../screens/PrecisionScanScreen";
import { NexiEnrollScreen } from "../screens/NexiEnrollScreen";
import { NexiCatalogScreen } from "../screens/NexiCatalogScreen";
import { PlacardScanScreen } from "../screens/PlacardScanScreen";
import { SelectionsScreen } from "../screens/SelectionsScreen";
import { SelectionDetailScreen } from "../screens/SelectionDetailScreen";
import { ProductPickerScreen } from "../screens/ProductPickerScreen";
import { BankingScreen } from "../screens/BankingScreen";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { fetchAllTasks } from "../api/tasks";
import { apiJson } from "../api/client";
import { recordTabUsage, getTopTab } from "../storage/usageTracker";
import type { ProjectListItem, TaskItem, PlanSheetItem, DailyLogListItem, DailyLogDetail } from "../types/api";

// Type definitions for navigation
export type RootTabParamList = {
  HomeTab: { triggerSync?: boolean } | undefined;
  TodosTab: undefined;
  TimecardTab: undefined;
  DirectoryTab: undefined;
  ProjectsTab: undefined;
  MapTab: undefined;
  ScannerTab: undefined;
  InventoryTab: undefined;
  OutboxTab: undefined;
  BankingTab: undefined;
};

export type DirectoryStackParamList = {
  DirectoryList: undefined;
  PhoneContacts: undefined;
  Invite: { preselectedIds?: string[] } | undefined;
};

export type ProjectsStackParamList = {
  DailyLogFeed: undefined;
  DailyLogDetail: { log: DailyLogListItem };
  DailyLogEdit: { log: DailyLogDetail };
  ProjectsList: undefined;
  CreateProject: undefined;
  DailyLogs: { project: ProjectListItem; companyName?: string; petlChanges?: PetlSessionChanges; createLogType?: string };
  FieldPetl: { project: ProjectListItem; companyName?: string };
  PlanSheets: { project: ProjectListItem };
  PlanSheetViewer: {
    projectId: string;
    uploadId: string;
    sheets: PlanSheetItem[];
    initialIndex: number;
  };
  RoomScan: { project: ProjectListItem };
  ReceiptCapture: { project: ProjectListItem };
  Selections: { project: ProjectListItem };
  SelectionDetail: { project: ProjectListItem; roomId: string };
  ProductPicker: { project: ProjectListItem; roomId: string };
};

export type ScannerStackParamList = {
  ScannerHome: undefined;
  PlacardScan: undefined;
  TagRead: undefined;
  FleetOnboard: undefined;
  ObjectCapture: undefined;
  PrecisionScan: undefined;
  NexiEnroll: undefined;
  NexiCatalog: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const DirectoryStack = createNativeStackNavigator<DirectoryStackParamList>();
const ProjectsStack = createNativeStackNavigator<ProjectsStackParamList>();
const ScannerStack = createNativeStackNavigator<ScannerStackParamList>();

// Projects / Daily Logs stack wrappers
function DailyLogFeedWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  return (
    <DailyLogFeedScreen
      onSelectLog={(log) => navigation.navigate("DailyLogDetail", { log })}
      onEditLog={(log) => {
        // Navigate to detail first, then edit will be triggered from there
        navigation.navigate("DailyLogDetail", { log });
      }}
      onCreateLog={() => {
        // Navigate to project picker, then create
        navigation.navigate("ProjectsList");
      }}
    />
  );
}

function DailyLogDetailWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "DailyLogDetail">>();
  const log = route.params.log;
  return (
    <DailyLogDetailScreen
      log={log}
      onBack={() => navigation.goBack()}
      onEdit={(detail) => navigation.navigate("DailyLogEdit", { log: detail })}
    />
  );
}

function DailyLogEditWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "DailyLogEdit">>();
  const log = route.params.log;
  return (
    <DailyLogEditScreen
      log={log}
      onBack={() => navigation.goBack()}
      onSaved={(_updated) => {
        // Go back to feed (pop detail + edit)
        navigation.popToTop();
      }}
    />
  );
}

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
      onOpenRoomScan={() => navigation.navigate("RoomScan", { project })}
      onOpenReceiptCapture={() => navigation.navigate("ReceiptCapture", { project })}
      onOpenSelections={() => navigation.navigate("Selections", { project })}
      onStartCall={async () => {
        try {
          const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
            "/video/rooms",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: project.id }),
            },
          );
          const rootNav = navigation.getParent()?.getParent?.() ?? navigation.getParent();
          if (rootNav) {
            rootNav.navigate("Call", {
              roomId: res.room.id,
              token: res.token,
              livekitUrl: res.livekitUrl,
              projectName: project.name,
              callMode: "video",
            });
          }
        } catch {
          Alert.alert("Call Failed", "Could not start video call.");
        }
      }}
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

function RoomScanWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "RoomScan">>();
  return (
    <RoomScanScreen
      project={route.params.project}
      onBack={() => navigation.goBack()}
    />
  );
}

function ReceiptCaptureWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "ReceiptCapture">>();
  return (
    <ReceiptCaptureScreen
      project={route.params.project}
      onBack={() => navigation.goBack()}
    />
  );
}

function SelectionsWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "Selections">>();
  const project = route.params.project;
  return (
    <SelectionsScreen
      project={project}
      onBack={() => navigation.goBack()}
      onOpenRoom={(roomId) => navigation.navigate("SelectionDetail", { project, roomId })}
    />
  );
}

function SelectionDetailWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "SelectionDetail">>();
  const { project, roomId } = route.params;
  return (
    <SelectionDetailScreen
      project={project}
      roomId={roomId}
      onBack={() => navigation.goBack()}
      onOpenProductPicker={() => navigation.navigate("ProductPicker", { project, roomId })}
    />
  );
}

function ProductPickerWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "ProductPicker">>();
  const { project, roomId } = route.params;
  return (
    <ProductPickerScreen
      projectId={project.id}
      roomId={roomId}
      onBack={() => navigation.goBack()}
      onProductAdded={() => navigation.goBack()}
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

function CreateProjectWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList & RootTabParamList>>();
  return (
    <CreateProjectScreen
      onBack={() => navigation.goBack()}
      onCreated={(project) => {
        // Navigate to the new project's DailyLogs view
        navigation.replace("DailyLogs", { project });
      }}
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
      <ProjectsStack.Screen name="DailyLogFeed" component={DailyLogFeedWrapper} />
      <ProjectsStack.Screen name="DailyLogDetail" component={DailyLogDetailWrapper} />
      <ProjectsStack.Screen name="DailyLogEdit" component={DailyLogEditWrapper} />
      <ProjectsStack.Screen name="ProjectsList" component={ProjectsListWrapper} />
      <ProjectsStack.Screen name="CreateProject" component={CreateProjectWrapper} />
      <ProjectsStack.Screen name="DailyLogs" component={DailyLogsWrapper} />
      <ProjectsStack.Screen name="FieldPetl" component={FieldPetlWrapper} />
      <ProjectsStack.Screen name="PlanSheets" component={PlanSheetsWrapper} />
      <ProjectsStack.Screen name="PlanSheetViewer" component={PlanSheetViewerWrapper} />
      <ProjectsStack.Screen name="RoomScan" component={RoomScanWrapper} />
      <ProjectsStack.Screen name="ReceiptCapture" component={ReceiptCaptureWrapper} />
      <ProjectsStack.Screen name="Selections" component={SelectionsWrapper} />
      <ProjectsStack.Screen name="SelectionDetail" component={SelectionDetailWrapper} />
      <ProjectsStack.Screen name="ProductPicker" component={ProductPickerWrapper} />
    </ProjectsStack.Navigator>
  );
}

// Scanner stack navigator
function ScannerStackNavigator() {
  return (
    <ScannerStack.Navigator screenOptions={{ headerShown: false }}>
      <ScannerStack.Screen name="ScannerHome" component={ScannerHomeWrapper} />
      <ScannerStack.Screen name="PlacardScan" component={PlacardScanWrapper} />
      <ScannerStack.Screen name="TagRead" component={TagReadWrapper} />
      <ScannerStack.Screen name="FleetOnboard" component={FleetOnboardWrapper} />
      <ScannerStack.Screen name="ObjectCapture" component={ObjectCaptureWrapper} />
      <ScannerStack.Screen name="PrecisionScan" component={PrecisionScanWrapper} />
      <ScannerStack.Screen name="NexiEnroll" component={NexiEnrollWrapper} />
      <ScannerStack.Screen name="NexiCatalog" component={NexiCatalogWrapper} />
    </ScannerStack.Navigator>
  );
}

function ScannerHomeWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return (
    <ScannerHomeScreen
      onStartPlacardScan={() => navigation.navigate("PlacardScan")}
      onStartTagRead={() => navigation.navigate("TagRead")}
      onStartFleetOnboard={() => navigation.navigate("FleetOnboard")}
      onStartObjectCapture={() => navigation.navigate("ObjectCapture")}
      onStartPrecisionScan={() => navigation.navigate("PrecisionScan")}
      onStartNexiEnroll={() => navigation.navigate("NexiEnroll")}
      onOpenNexiCatalog={() => navigation.navigate("NexiCatalog")}
    />
  );
}

function PlacardScanWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return <PlacardScanScreen onBack={() => navigation.goBack()} />;
}

function TagReadWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return <TagReadScreen onBack={() => navigation.goBack()} />;
}

function FleetOnboardWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return <FleetOnboardScreen onBack={() => navigation.goBack()} />;
}

function ObjectCaptureWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return <ObjectCaptureScreen onBack={() => navigation.goBack()} />;
}

function PrecisionScanWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return <PrecisionScanScreen onBack={() => navigation.goBack()} />;
}

function NexiEnrollWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return <NexiEnrollScreen onBack={() => navigation.goBack()} />;
}

function NexiCatalogWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  return (
    <NexiCatalogScreen
      onBack={() => navigation.goBack()}
      onEnrollNew={() => navigation.navigate("NexiEnroll")}
    />
  );
}

// Wrapper for MapScreen
function MapTabScreen() {
  const navigation = useNavigation<any>();
  return (
    <MapScreen
      onSelectProject={(project) => {
        navigation.navigate("ProjectsTab", {
          screen: "DailyLogs",
          params: { project },
        });
      }}
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

// Wrapper for BankingScreen
function BankingTabScreen() {
  return <BankingScreen onBack={() => {}} />;
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
  const navigation = useNavigation<any>();
  const company = React.useContext(CompanyContext);
  const setCompany = React.useContext(SetCompanyContext);

  return (
    <KpiHomeScreen
      companyName={company.name}
      onCompanyChange={setCompany}
      onOpenProject={(project) => {
        navigation.navigate("ProjectsTab", {
          screen: "DailyLogs",
          params: { project, companyName: company.name ?? undefined },
        });
      }}
      onCreateProject={() => {
        navigation.navigate("ProjectsTab", {
          screen: "CreateProject",
        });
      }}
      onOpenMap={() => {
        navigation.navigate("MapTab");
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

  // Stable callback — avoids infinite re-render loop between AppNavigator ↔ KpiHomeScreen
  const handleSetCompany = React.useCallback((c: { id: string; name: string }) => {
    setCompany((prev) => ({ id: c.id, name: c.name, refreshKey: prev.refreshKey + 1 }));
  }, []);

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
    <SetCompanyContext.Provider value={handleSetCompany}>
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
        <Tab.Screen name="MapTab" component={MapTabScreen} />
        <Tab.Screen name="ScannerTab" component={ScannerStackNavigator} />
        <Tab.Screen name="InventoryTab" component={InventoryTabScreen} />
        <Tab.Screen name="OutboxTab" component={OutboxTabScreen} />
        <Tab.Screen name="BankingTab" component={BankingTabScreen} />
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
  MapTab: true,
  ScannerTab: true,
  InventoryTab: true,
  OutboxTab: true,
  BankingTab: true,
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
