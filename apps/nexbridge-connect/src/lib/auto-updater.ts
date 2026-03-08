/**
 * Background auto-updater for NexBRIDGE Connect.
 *
 * - Checks the staging API for a newer version on launch + every 30 minutes.
 * - Downloads the update in the background (silent).
 * - Once downloaded, shows a non-blocking notification and waits for the
 *   user to restart (the update installs on next launch).
 *
 * The Tauri updater plugin handles signature verification automatically
 * using the pubkey in tauri.conf.json.
 */
import { check, type Update } from "@tauri-apps/plugin-updater";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "downloading"; progress: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

type StatusCallback = (status: UpdateStatus) => void;

let _listener: StatusCallback | null = null;
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _pendingUpdate: Update | null = null;

function emit(status: UpdateStatus) {
  _listener?.(status);
}

/**
 * Check for updates once. If an update is available, download it silently.
 */
async function checkOnce(): Promise<void> {
  // Don't re-check if we already have a downloaded update pending restart
  if (_pendingUpdate) return;

  try {
    emit({ state: "checking" });
    const update = await check();

    if (!update?.available) {
      emit({ state: "idle" });
      return;
    }

    // Download the update (signature is verified by the plugin automatically)
    let lastProgress = 0;
    await update.download((event) => {
      if (event.event === "Started" && event.data.contentLength) {
        lastProgress = 0;
        emit({ state: "downloading", progress: 0 });
      } else if (event.event === "Progress") {
        lastProgress += event.data.chunkLength;
        const total = (event as any).data?.contentLength ?? 1;
        const pct = total > 0 ? Math.min(100, Math.round((lastProgress / total) * 100)) : 0;
        emit({ state: "downloading", progress: pct });
      } else if (event.event === "Finished") {
        emit({ state: "ready", version: update.version });
      }
    });

    _pendingUpdate = update;
    emit({ state: "ready", version: update.version });

    // Show a system notification so the user knows
    try {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      sendNotification({
        title: "NexBRIDGE Update Ready",
        body: `Version ${update.version} has been downloaded. Restart to apply.`,
      });
    } catch {
      // Notification plugin not available or permission not granted — non-fatal
    }
  } catch (err: any) {
    console.error("[auto-updater] check failed:", err);
    emit({ state: "error", message: err?.message ?? String(err) });
    // Don't stay in error state — go back to idle so interval keeps checking
    setTimeout(() => emit({ state: "idle" }), 5000);
  }
}

/**
 * Start the background updater. Call once on app mount.
 */
export function startAutoUpdater(onStatus: StatusCallback): () => void {
  _listener = onStatus;

  // Initial check after a short delay (let the app finish loading)
  const initialTimeout = setTimeout(() => checkOnce(), 5_000);

  // Periodic checks
  _intervalId = setInterval(() => checkOnce(), CHECK_INTERVAL_MS);

  // Return cleanup function
  return () => {
    clearTimeout(initialTimeout);
    if (_intervalId) clearInterval(_intervalId);
    _intervalId = null;
    _listener = null;
  };
}

/**
 * Install the pending update and relaunch the app.
 * Call this when the user clicks "Restart Now".
 */
export async function installAndRelaunch(): Promise<void> {
  if (!_pendingUpdate) return;
  try {
    await _pendingUpdate.install();
    // install() triggers a relaunch automatically in Tauri v2
  } catch (err) {
    console.error("[auto-updater] install failed:", err);
  }
}
