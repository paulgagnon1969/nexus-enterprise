import AsyncStorage from "@react-native-async-storage/async-storage";

const WIFI_ONLY_SYNC_KEY = "nexus.wifiOnlySync";

export async function getWifiOnlySync(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(WIFI_ONLY_SYNC_KEY);
  return raw === "1";
}

export async function setWifiOnlySync(value: boolean): Promise<void> {
  await AsyncStorage.setItem(WIFI_ONLY_SYNC_KEY, value ? "1" : "0");
}
