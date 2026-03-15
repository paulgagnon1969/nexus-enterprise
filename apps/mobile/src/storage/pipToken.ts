import * as SecureStore from "expo-secure-store";

const PIP_TOKEN_KEY = "nexus.pipToken";

export async function getPipToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PIP_TOKEN_KEY);
}

export async function setPipToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PIP_TOKEN_KEY, token);
}

export async function clearPipToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PIP_TOKEN_KEY);
}
