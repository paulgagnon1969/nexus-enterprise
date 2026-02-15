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
