import { Store } from "@tauri-apps/plugin-store";

const DEVICE_STORE_PATH = "nexbridge-device.json";

let deviceStore: Store | null = null;

async function getStore(): Promise<Store> {
  if (!deviceStore) {
    deviceStore = await Store.load(DEVICE_STORE_PATH);
  }
  return deviceStore;
}

/** Stable UUID generated once per installation and persisted to disk. */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await getStore();
  const existing = await store.get<string>("deviceId");
  if (existing) return existing;

  const id = crypto.randomUUID();
  await store.set("deviceId", id);
  await store.save();
  return id;
}

/** Best-effort device name from the browser/Tauri runtime. */
export function getDeviceName(): string {
  try {
    // navigator.userAgent in Tauri WebView includes the OS name
    const ua = navigator.userAgent;
    if (ua.includes("Mac")) return "Mac";
    if (ua.includes("Windows")) return "Windows PC";
    if (ua.includes("Linux")) return "Linux PC";
    return navigator.platform || "Unknown Device";
  } catch {
    return "Unknown Device";
  }
}

/** Platform identifier string for the API. */
export function getDevicePlatform(): string {
  const p = navigator.platform?.toLowerCase() ?? "";
  if (p.includes("mac")) return "MACOS";
  if (p.includes("win")) return "WINDOWS";
  if (p.includes("linux")) return "LINUX";
  return "UNKNOWN";
}
