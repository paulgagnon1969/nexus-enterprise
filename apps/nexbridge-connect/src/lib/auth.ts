import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "nexbridge-auth.json";

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  apiUrl: string;
  userEmail: string;
  companyName: string;
}

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_PATH);
  }
  return storeInstance;
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  const store = await getStore();
  await store.set("auth", auth);
  await store.save();
}

export async function loadAuth(): Promise<StoredAuth | null> {
  const store = await getStore();
  const auth = await store.get<StoredAuth>("auth");
  return auth ?? null;
}

export async function clearAuth(): Promise<void> {
  const store = await getStore();
  await store.delete("auth");
  await store.save();
  storeInstance = null;
}
