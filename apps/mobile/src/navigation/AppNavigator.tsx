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
import { DailyLogTabletLayout } from "../screens/DailyLogTabletLayout";
import { FieldPetlScreen, type PetlSessionChanges } from "../screens/FieldPetlScreen";
import { DirectoryScreen } from "../screens/DirectoryScreen";
import { PhoneContactsScreen } from "../screens/PhoneContactsScreen";
import { InviteScreen } from "../screens/InviteScreen";
import { ShareInviteScreen } from "../screens/ShareInviteScreen";
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
import { PrecisionScanDetailScreen } from "../screens/PrecisionScanDetailScreen";
import { NexiEnrollScreen } from "../screens/NexiEnrollScreen";
import { NexiCatalogScreen } from "../screens/NexiCatalogScreen";
import { PlacardScanScreen } from "../screens/PlacardScanScreen";
import { SelectionsScreen } from "../screens/SelectionsScreen";
import { SelectionDetailScreen } from "../screens/SelectionDetailScreen";
import { ProductPickerScreen } from "../screens/ProductPickerScreen";
import { ShoppingListScreen } from "../screens/ShoppingListScreen";
import { GroupShoppingCartScreen } from "../screens/GroupShoppingCartScreen";
import { ShoppingCartHubScreen } from "../screens/ShoppingCartHubScreen";
import { ShoppingCartDetailScreen } from "../screens/ShoppingCartDetailScreen";
import { BankingScreen } from "../screens/BankingScreen";
import { DevSessionsScreen } from "../screens/DevSessionsScreen";
import { DevSessionDetailScreen } from "../screens/DevSessionDetailScreen";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { TabletSidebar } from "../components/TabletSidebar";
import { useDeviceLayout } from "../hooks/useDeviceLayout";
import { fetchAllTasks } from "../api/tasks";
import { apiJson } from "../api/client";
import { getUserMe } from "../api/user";
import { recordTabUsage, getTopTab } from "../storage/usageTracker";
import { getLastProject, setLastProject } from "../storage/settings";
import type { ProjectListItem, TaskItem, PlanSheetItem, DailyLogListItem, DailyLogDetail } from "../types/api";

// Type definitions for navigation
export type RootTabParamList = {
  HomeTab: { triggerSync?: boolean } | undefined;
  ShopTab: undefined;
  TodosTab: undefined;
  TimecardTab: undefined;
  DirectoryTab: undefined;
  ProjectsTab: undefined;
  MapTab: undefined;
  ScannerTab: undefined;
  InventoryTab: undefined;
  OutboxTab: undefined;
  BankingTab: undefined;
  DevSessionsTab: undefined;
};

export type DevSessionsStackParamList = {
  SessionsList: undefined;
  SessionDetail: { session: any };
};

export type DirectoryStackParamList = {
  DirectoryList: undefined;
  PhoneContacts: undefined;
  Invite: { preselectedIds?: string[] } | undefined;
  ShareInvite: undefined;
};

export type ProjectsStackParamList = {
  DailyLogFeed: undefined;
  DailyLogDetail: { log: DailyLogListItem };
  DailyLogEdit: { log: DailyLogDetail };
  ProjectsList: undefined;
  CreateProject: undefined;
  DailyLogs: { project: ProjectListItem; companyName?: string; petlChanges?: PetlSessionChanges; createLogType?: string; receiptOrigin?: "MANUAL" | "SHOPPING_CART"; shoppingCartId?: string };
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
  ShoppingList: { project: ProjectListItem; companyName?: string };
  ShoppingCartHub: undefined;
  ShoppingCartDetail: { cartId: string; cartLabel?: string | null; projectName?: string; projectId: string };
};

export type ScannerStackParamList = {
  ScannerHome: undefined;
  PlacardScan: undefined;
  TagRead: undefined;
  FleetOnboard: undefined;
  ObjectCapture: undefined;
  PrecisionScan: undefined;
  PrecisionScanDetail: { scanId: string };
  NexiEnroll: undefined;
  NexiCatalog: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const DirectoryStack = createNativeStackNavigator<DirectoryStackParamList>();
const ProjectsStack = createNativeStackNavigator<ProjectsStackParamList>();
const ScannerStack = createNativeStackNavigator<ScannerStackParamList>();
const DevSessionsStack = createNativeStackNavigator<DevSessionsStackParamList>();

// Projects / Daily Logs stack wrappers
function DailyLogFeedWrapper() {
  const { isTablet } = useDeviceLayout();
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList & RootTabParamList>>();
  const { project: filteredProject } = React.useContext(ProjectFilterContext);
  const company = React.useContext(CompanyContext);
  const role = React.useContext(UserRoleContext);

  // Load last-used project from persistent storage (survives logout/restart)
  const [lastProject, setLastProjectState] = React.useState<ProjectListItem | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    getLastProject()
      .then((p) => {
        if (p) setLastProjectState(p as ProjectListItem);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // When user changes project in this screen's dropdown — persist only, don't push to home context
  const handleProjectChange = React.useCallback((p: ProjectListItem | null) => {
    setLastProjectState(p);
  }, []);

  if (!ready) return null;

  // ── Tablet: three-pane "Peerless View" ────────────────────────────────
  if (isTablet) {
    return (
      <DailyLogTabletLayout
        filteredProject={filteredProject}
        lastProject={lastProject}
        companyName={company.name ?? undefined}
        onProjectChange={handleProjectChange}
        onOpenPetl={(project) =>
          navigation.navigate("FieldPetl", { project, companyName: company.name ?? undefined })
        }
        onOpenPlanSheets={(project) => navigation.navigate("PlanSheets", { project })}
        onOpenRoomScan={(project) => navigation.navigate("RoomScan", { project })}
        onOpenReceiptCapture={(project) => navigation.navigate("ReceiptCapture", { project })}
        onOpenSelections={(project) => navigation.navigate("Selections", { project })}
        onOpenShoppingList={(project) =>
          navigation.navigate("ShoppingList", { project, companyName: company.name ?? undefined })
        }
        userRole={role ?? undefined}
        onStartCall={async (project) => {
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
        onEditLog={(log) => navigation.navigate("DailyLogDetail", { log })}
      />
    );
  }

  // ── Phone: existing single-screen feed ────────────────────────────────
  return (
    <DailyLogFeedScreen
      filteredProject={filteredProject}
      lastProject={lastProject}
      onProjectChange={handleProjectChange}
      onSelectLog={(log) => navigation.navigate("DailyLogDetail", { log })}
      onEditLog={(log) => navigation.navigate("DailyLogDetail", { log })}
      onCreateLog={(activeProject) => {
        if (activeProject) {
          navigation.navigate("DailyLogs", { project: activeProject, companyName: company.name ?? undefined });
        } else {
          navigation.navigate("ProjectsList");
        }
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
  const role = React.useContext(UserRoleContext);
  const project = route.params.project;
  const companyName = route.params.companyName;
  const petlChanges = route.params.petlChanges;
  const createLogType = route.params.createLogType;
  const receiptOrigin = route.params.receiptOrigin;
  const shoppingCartId = route.params.shoppingCartId;
  return (
    <DailyLogsScreen
      project={project}
      companyName={companyName}
      receiptOrigin={receiptOrigin}
      shoppingCartId={shoppingCartId}
      userRole={role ?? undefined}
      onBack={() => navigation.goBack()}
      onOpenPetl={() => navigation.navigate("FieldPetl", { project, companyName })}
      onOpenPlanSheets={() => navigation.navigate("PlanSheets", { project })}
      onOpenRoomScan={() => navigation.navigate("RoomScan", { project })}
      onOpenReceiptCapture={() => navigation.navigate("ReceiptCapture", { project })}
      onOpenSelections={() => navigation.navigate("Selections", { project })}
      onOpenShoppingList={() => navigation.navigate("ShoppingList", { project, companyName })}
      onStartVideoCall={async () => {
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

function ShoppingListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList & RootTabParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "ShoppingList">>();
  const project = route.params.project;
  const companyName = route.params.companyName;
  return (
    <ShoppingListScreen
      project={project}
      companyName={companyName}
      onBack={() => navigation.goBack()}
      onNavigateHome={() => {
        navigation.getParent()?.navigate("HomeTab", { triggerSync: true });
      }}
    />
  );
}

function ShopTabScreen() {
  return <GroupShoppingCartScreen />;
}

function ShoppingCartHubWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  return (
    <ShoppingCartHubScreen
      onBack={() => navigation.goBack()}
      onSelectCart={(cart) =>
        navigation.navigate("ShoppingCartDetail", {
          cartId: cart.id,
          cartLabel: cart.label,
          projectName: cart.projectName,
          projectId: cart.projectId,
        })
      }
    />
  );
}

function ShoppingCartDetailWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ProjectsStackParamList>>();
  const route = useRoute<RouteProp<ProjectsStackParamList, "ShoppingCartDetail">>();
  const { cartId, cartLabel, projectName, projectId } = route.params;
  return (
    <ShoppingCartDetailScreen
      cartId={cartId}
      cartLabel={cartLabel}
      projectName={projectName}
      projectId={projectId}
      onBack={() => navigation.goBack()}
      onCreateReceipt={({ projectId: pid, receiptOrigin: origin, shoppingCartId: cartId }) => {
        navigation.navigate("DailyLogs", {
          project: { id: pid, name: projectName || "" } as ProjectListItem,
          createLogType: "RECEIPT_EXPENSE",
          receiptOrigin: origin,
          shoppingCartId: cartId,
        });
      }}
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
      <DirectoryStack.Screen name="ShareInvite" component={ShareInviteWrapper} />
    </DirectoryStack.Navigator>
  );
}

function DirectoryListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DirectoryStackParamList>>();
  return (
    <DirectoryScreen
      onImportFromPhone={() => navigation.navigate("PhoneContacts")}
      onInvite={() => navigation.navigate("Invite")}
      onShareInvite={() => navigation.navigate("ShareInvite")}
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

function ShareInviteWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DirectoryStackParamList>>();
  return <ShareInviteScreen onBack={() => navigation.goBack()} />;
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
      <ProjectsStack.Screen name="ShoppingList" component={ShoppingListWrapper} />
      <ProjectsStack.Screen name="ShoppingCartHub" component={ShoppingCartHubWrapper} />
      <ProjectsStack.Screen name="ShoppingCartDetail" component={ShoppingCartDetailWrapper} />
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
      <ScannerStack.Screen name="PrecisionScanDetail" component={PrecisionScanDetailWrapper} />
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
      onViewPrecisionScan={(scanId) => navigation.navigate("PrecisionScanDetail", { scanId })}
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

function PrecisionScanDetailWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<ScannerStackParamList>>();
  const route = useRoute<RouteProp<ScannerStackParamList, "PrecisionScanDetail">>();
  return <PrecisionScanDetailScreen scanId={route.params.scanId} onBack={() => navigation.goBack()} />;
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
  const { setProject } = React.useContext(ProjectFilterContext);
  return (
    <MapScreen
      onSelectProject={(project: ProjectListItem) => {
        setProject(project);
        void setLastProject(project ? { id: project.id, name: project.name } : null);
        navigation.navigate("ProjectsTab", {
          screen: "DailyLogFeed",
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

// Dev Sessions stack (SUPER_ADMIN only)
function DevSessionsStackNavigator() {
  return (
    <DevSessionsStack.Navigator screenOptions={{ headerShown: false }}>
      <DevSessionsStack.Screen name="SessionsList" component={DevSessionsListWrapper} />
      <DevSessionsStack.Screen name="SessionDetail" component={DevSessionDetailWrapper} />
    </DevSessionsStack.Navigator>
  );
}

function DevSessionsListWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DevSessionsStackParamList>>();
  return (
    <DevSessionsScreen
      onSelectSession={(session) => navigation.navigate("SessionDetail", { session })}
    />
  );
}

function DevSessionDetailWrapper() {
  const navigation = useNavigation<NativeStackNavigationProp<DevSessionsStackParamList>>();
  const route = useRoute<RouteProp<DevSessionsStackParamList, "SessionDetail">>();
  return (
    <DevSessionDetailScreen
      session={route.params.session}
      onBack={() => navigation.goBack()}
    />
  );
}

// Context for logout callback and company info
const LogoutContext = React.createContext<() => void>(() => {});
const CompanyContext = React.createContext<{ name: string | null; id: string | null; refreshKey: number }>({
  name: null,
  id: null,
  refreshKey: 0,
});

/** User's company-level role (OWNER, ADMIN, PM, etc.) — used for tile gating */
const UserRoleContext = React.createContext<string | null>(null);

// Hook to get current company from context
export function useCurrentCompany() {
  return React.useContext(CompanyContext);
}

// Callback for HomeScreen to update company context
const SetCompanyContext = React.createContext<(company: { id: string; name: string }) => void>(() => {});

// Project filter context (shared across tabs for module pre-filtering)
export const ProjectFilterContext = React.createContext<{
  project: ProjectListItem | null;
  setProject: (p: ProjectListItem | null) => void;
}>({
  project: null,
  setProject: () => {},
});

export function useProjectFilter() {
  return React.useContext(ProjectFilterContext);
}

function HomeTabScreen() {
  const navigation = useNavigation<any>();
  const company = React.useContext(CompanyContext);
  const setCompany = React.useContext(SetCompanyContext);
  const { project: filterProject, setProject: setFilterProject } = React.useContext(ProjectFilterContext);

  // When home selects a project filter, also persist as last-used project
  const handleProjectFilter = React.useCallback(
    (p: ProjectListItem | null) => {
      setFilterProject(p);
      void setLastProject(p ? { id: p.id, name: p.name } : null);
    },
    [setFilterProject],
  );

  return (
    <KpiHomeScreen
      companyName={company.name}
      onCompanyChange={setCompany}
      onProjectFilterChange={handleProjectFilter}
      externalFilter={filterProject}
      onOpenProject={(project) => {
        handleProjectFilter(project);
        navigation.navigate("ProjectsTab", {
          screen: "DailyLogFeed",
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
  const { isTablet } = useDeviceLayout();

  const [company, setCompany] = React.useState<{ id: string | null; name: string | null; refreshKey: number }>({
    id: null,
    name: null,
    refreshKey: 0,
  });

  // Project filter state (shared across tabs)
  const [filterProject, setFilterProject] = React.useState<ProjectListItem | null>(null);
  const filterCtx = React.useMemo(
    () => ({ project: filterProject, setProject: setFilterProject }),
    [filterProject],
  );

  // Check if user is SUPER_ADMIN (for DevSessions tab visibility) + company role
  const PM_PLUS = new Set(["OWNER", "ADMIN", "PM", "EXECUTIVE"]);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const isPmPlus = PM_PLUS.has(userRole ?? "");
  React.useEffect(() => {
    getUserMe()
      .then((me) => {
        console.log(`[AppNav] getUserMe OK — globalRole=${me.globalRole}, memberships=${me.memberships?.length}`);
        setIsSuperAdmin(me.globalRole === "SUPER_ADMIN");
        // Extract company-level role from first membership
        const role = me.memberships?.[0]?.role ?? null;
        setUserRole(role);
      })
      .catch((err) => {
        console.log(`[AppNav] getUserMe FAILED:`, err?.message || err);
        setIsSuperAdmin(false);
      });
  }, []);

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

  const tabNavigator = (
    <Tab.Navigator
      initialRouteName={initialTab === "DevSessionsTab" && !isSuperAdmin ? "HomeTab" : initialTab}
      screenOptions={{
        headerShown: false,
        ...(isTablet ? { tabBarPosition: "left" as const } : {}),
      }}
      tabBar={(props) =>
        isTablet ? (
          <TabletSidebar {...props} todoBadgeCount={urgentCount} onLogout={onLogout} />
        ) : (
          <ScrollableTabBar {...props} todoBadgeCount={urgentCount} onLogout={onLogout} />
        )
      }
      screenListeners={{
        tabPress: (e) => {
          const tabName = e.target?.split("-")[0];
          if (tabName) void recordTabUsage(tabName);
          // Pressing Home tab clears the project filter → shows all projects
          if (tabName === "HomeTab") {
            setFilterProject(null);
          }
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
      {isPmPlus && (
        <Tab.Screen name="ShopTab" component={ShopTabScreen} />
      )}
      {isSuperAdmin && (
        <Tab.Screen name="DevSessionsTab" component={DevSessionsStackNavigator} />
      )}
    </Tab.Navigator>
  );

  return (
    <LogoutContext.Provider value={onLogout}>
    <CompanyContext.Provider value={company}>
    <SetCompanyContext.Provider value={handleSetCompany}>
    <UserRoleContext.Provider value={userRole}>
    <ProjectFilterContext.Provider value={filterCtx}>
      {isTablet ? (
        /* Tablet: tabBarPosition='left' handles sidebar layout */
        tabNavigator
      ) : (
        /* Phone: top brand bar + bottom tab bar (unchanged) */
        <>
          <View style={navStyles.versionHeader}>
            <Text style={navStyles.versionBrand}>NEXUS</Text>
          </View>
          {tabNavigator}
        </>
      )}
    </ProjectFilterContext.Provider>
    </UserRoleContext.Provider>
    </SetCompanyContext.Provider>
    </CompanyContext.Provider>
    </LogoutContext.Provider>
  );
}

/** Valid tab keys for type guard */
const TAB_KEYS: Record<string, boolean> = {
  HomeTab: true,
  ShopTab: true,
  TodosTab: true,
  TimecardTab: true,
  DirectoryTab: true,
  ProjectsTab: true,
  MapTab: true,
  ScannerTab: true,
  InventoryTab: true,
  OutboxTab: true,
  BankingTab: true,
  DevSessionsTab: true,
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
