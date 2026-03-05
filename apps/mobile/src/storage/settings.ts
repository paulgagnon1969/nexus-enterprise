import AsyncStorage from "@react-native-async-storage/async-storage";

const WIFI_ONLY_SYNC_KEY = "nexus.wifiOnlySync";
const PREFERRED_MAP_APP_KEY = "nexus.preferredMapApp";

export type MapAppType = "apple" | "google" | "waze" | null;

export async function getWifiOnlySync(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(WIFI_ONLY_SYNC_KEY);
  return raw === "1";
}

export async function setWifiOnlySync(value: boolean): Promise<void> {
  await AsyncStorage.setItem(WIFI_ONLY_SYNC_KEY, value ? "1" : "0");
}

export async function getPreferredMapApp(): Promise<MapAppType> {
  const raw = await AsyncStorage.getItem(PREFERRED_MAP_APP_KEY);
  if (raw === "apple" || raw === "google" || raw === "waze") {
    return raw;
  }
  return null;
}

export async function setPreferredMapApp(value: MapAppType): Promise<void> {
  if (value) {
    await AsyncStorage.setItem(PREFERRED_MAP_APP_KEY, value);
  } else {
    await AsyncStorage.removeItem(PREFERRED_MAP_APP_KEY);
  }
}

export async function clearPreferredMapApp(): Promise<void> {
  await AsyncStorage.removeItem(PREFERRED_MAP_APP_KEY);
}

// ---- Favorite Projects ----

const FAVORITE_PROJECTS_KEY = "nexus.favoriteProjects";
const LAST_SELECTED_PROJECT_KEY = "nexus.lastSelectedProject";

export async function getFavoriteProjectIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITE_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleFavoriteProject(projectId: string): Promise<boolean> {
  const ids = await getFavoriteProjectIds();
  const idx = ids.indexOf(projectId);
  if (idx >= 0) {
    ids.splice(idx, 1);
    await AsyncStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(ids));
    return false; // removed
  } else {
    ids.push(projectId);
    await AsyncStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(ids));
    return true; // added
  }
}

export async function getLastSelectedProjectId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SELECTED_PROJECT_KEY);
}

export async function setLastSelectedProjectId(projectId: string | null): Promise<void> {
  if (projectId) {
    await AsyncStorage.setItem(LAST_SELECTED_PROJECT_KEY, projectId);
  } else {
    await AsyncStorage.removeItem(LAST_SELECTED_PROJECT_KEY);
  }
}

// ---- Last-selected Company (tenant auto-select) ----

const LAST_SELECTED_COMPANY_KEY = "nexus.lastSelectedCompany";

export async function getLastSelectedCompanyId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SELECTED_COMPANY_KEY);
}

export async function setLastSelectedCompanyId(companyId: string | null): Promise<void> {
  if (companyId) {
    await AsyncStorage.setItem(LAST_SELECTED_COMPANY_KEY, companyId);
  } else {
    await AsyncStorage.removeItem(LAST_SELECTED_COMPANY_KEY);
  }
}
