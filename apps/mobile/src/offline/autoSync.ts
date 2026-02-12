import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { AppState, AppStateStatus } from "react-native";
import { syncOnce } from "./sync";
import { getPendingOutbox } from "./outbox";
import { getWifiOnlySync } from "../storage/settings";
import { getTokens } from "../storage/tokens";

let unsubscribeNetInfo: (() => void) | null = null;
let unsubscribeAppState: (() => void) | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// Debounce to avoid rapid-fire syncs
let lastSyncAttempt = 0;
const DEBOUNCE_MS = 5000; // 5 seconds minimum between sync attempts
const POLL_INTERVAL_MS = 60000; // Check every 60 seconds when app is active

async function canSync(netState: NetInfoState): Promise<boolean> {
  // Not connected
  if (!netState.isConnected) return false;

  // Check wifi-only preference
  const wifiOnly = await getWifiOnlySync();
  if (wifiOnly && netState.type !== "wifi") return false;

  // Must be logged in
  const tokens = await getTokens();
  if (!tokens?.accessToken) return false;

  return true;
}

async function trySync(reason: string): Promise<void> {
  // Debounce
  const now = Date.now();
  if (now - lastSyncAttempt < DEBOUNCE_MS) {
    return;
  }
  lastSyncAttempt = now;

  // Check if there's anything to sync
  const pending = await getPendingOutbox(1);
  if (pending.length === 0) {
    return;
  }

  // Check network
  const netState = await NetInfo.fetch();
  if (!(await canSync(netState))) {
    return;
  }

  console.log(`[autoSync] Triggering sync: ${reason} (${pending.length}+ pending)`);

  try {
    const result = await syncOnce();
    console.log(`[autoSync] Result: ${result.processed} processed, ${result.failed} failed${result.skippedReason ? `, skipped: ${result.skippedReason}` : ""}`);
  } catch (err) {
    console.log(`[autoSync] Error:`, err instanceof Error ? err.message : err);
  }
}

function handleNetworkChange(state: NetInfoState): void {
  if (state.isConnected && state.isInternetReachable !== false) {
    // Network restored — try to sync
    trySync("network restored");
  }
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === "active") {
    // App came to foreground — try to sync
    trySync("app foregrounded");
  }
}

/**
 * Start automatic background sync.
 * Call this once when the app initializes (after auth is confirmed).
 */
export function startAutoSync(): void {
  if (isRunning) return;
  isRunning = true;

  console.log("[autoSync] Starting auto-sync service");

  // Listen for network changes
  unsubscribeNetInfo = NetInfo.addEventListener(handleNetworkChange);

  // Listen for app state changes (background → foreground)
  const subscription = AppState.addEventListener("change", handleAppStateChange);
  unsubscribeAppState = () => subscription.remove();

  // Periodic polling as a fallback
  intervalId = setInterval(() => {
    if (AppState.currentState === "active") {
      trySync("periodic poll");
    }
  }, POLL_INTERVAL_MS);

  // Initial sync attempt
  trySync("auto-sync started");
}

/**
 * Stop automatic background sync.
 * Call this on logout.
 */
export function stopAutoSync(): void {
  if (!isRunning) return;
  isRunning = false;

  console.log("[autoSync] Stopping auto-sync service");

  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }

  if (unsubscribeAppState) {
    unsubscribeAppState();
    unsubscribeAppState = null;
  }

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Manually trigger a sync attempt (e.g., after creating a new item).
 * Respects debouncing.
 */
export function triggerSync(reason = "manual"): void {
  trySync(reason);
}
