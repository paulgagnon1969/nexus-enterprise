import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import { apiFetch } from "../api/client";
import { callRingConfig } from "../config/callRingConfig";

// ── Notification categories (iOS + Apple Watch action buttons) ──────
// These categories define quick-action buttons that appear on notifications,
// including on Apple Watch (mirrored automatically by iOS).
async function registerNotificationCategories() {
  await Notifications.setNotificationCategoryAsync("video_call", [
    {
      identifier: "accept",
      buttonTitle: "Accept",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "decline",
      buttonTitle: "Decline",
      options: { isDestructive: true, opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("daily_log", [
    {
      identifier: "view",
      buttonTitle: "View Log",
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("daily_brief", [
    {
      identifier: "view",
      buttonTitle: "View Brief",
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("overdue_reminder", [
    {
      identifier: "view",
      buttonTitle: "View Tasks",
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("task_escalation", [
    {
      identifier: "view",
      buttonTitle: "View Task",
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("task_update", [
    {
      identifier: "view",
      buttonTitle: "View Task",
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("precision_scan", [
    {
      identifier: "view",
      buttonTitle: "View Scan",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "retry",
      buttonTitle: "Retry",
      options: { opensAppToForeground: true },
    },
  ]);

  // Session Mirror — dev oversight notifications (SUPER_ADMIN only)
  await Notifications.setNotificationCategoryAsync("dev_approval", [
    {
      identifier: "approve",
      buttonTitle: "Approve",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "reject",
      buttonTitle: "Reject",
      options: { isDestructive: true, opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("dev_session", [
    {
      identifier: "view",
      buttonTitle: "View Session",
      options: { opensAppToForeground: true },
    },
  ]);

  // PIP Announcements — global broadcasts to PIP viewers
  await Notifications.setNotificationCategoryAsync("pip_announcement", [
    {
      identifier: "view",
      buttonTitle: "View PIP",
      options: { opensAppToForeground: true },
    },
  ]);

  // Warp attention — agent needs user input (bidirectional bridge)
  await Notifications.setNotificationCategoryAsync("warp_attention", [
    {
      identifier: "view",
      buttonTitle: "View Session",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "reply",
      buttonTitle: "Reply",
      options: { opensAppToForeground: true },
      textInput: {
        submitButtonTitle: "Send",
        placeholder: "Reply to Warp…",
      },
    },
  ]);
}

// Register categories immediately on module load
registerNotificationCategories().catch((err) =>
  console.warn("[push] Failed to register notification categories:", err),
);

// ── Notification display behaviour ──────────────────────────────────
// Ring behaviour for video calls is driven by callRingConfig.
// See src/config/callRingConfig.ts and the SOP for the full flag reference.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    if (data?.type === "video_call") {
      const isForeground = AppState.currentState === "active";
      const playSound = isForeground
        ? callRingConfig.systemSound.foreground
        : callRingConfig.systemSound.background;
      const showBanner = isForeground
        ? callRingConfig.showForegroundBanner
        : true;
      return {
        shouldShowAlert: showBanner,
        shouldPlaySound: playSound,
        shouldSetBadge: true,
        shouldShowBanner: showBanner,
        shouldShowList: true,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * Register for push notifications and send the Expo push token to the API.
 * Returns the token string or null if registration failed.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push only works on physical devices
  if (!Device.isDevice) {
    console.log("[push] Not a physical device — skipping push registration");
    return null;
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.log("[push] Permission not granted");
    return null;
  }

  // Android notification channels
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("daily-logs", {
      name: "Daily Logs",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0284c7",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("video-calls", {
      name: "Video Calls",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: "#16a34a",
      sound: "nexus_ring.wav",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync("dev-session", {
      name: "Dev Session Mirror",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("pip-updates", {
      name: "PIP Updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0284c7",
      sound: "default",
    });
  }

  // Get the Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  const token = tokenData.data;
  console.log("[push] Expo push token:", token);

  // Send to API
  const platform = Platform.OS === "ios" ? "IOS" : "ANDROID";
  try {
    await apiFetch("/notifications/devices/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform }),
    });
    console.log("[push] Token registered with API");
  } catch (err) {
    console.warn("[push] Failed to register token with API:", err);
  }

  return token;
}

/**
 * Deregister the push token on logout.
 */
export async function deregisterPushToken(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    await apiFetch("/notifications/devices/token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    console.log("[push] Token deregistered");
  } catch (err) {
    console.warn("[push] Failed to deregister token:", err);
  }
}

/**
 * Parse the deep-link data from a notification response (user tapped a notification
 * or pressed a category action button, including on Apple Watch).
 */
export function parseNotificationData(
  response: Notifications.NotificationResponse,
): {
  type: string;
  dailyLogId?: string;
  projectId?: string;
  roomId?: string;
  taskId?: string;
  scanId?: string;
  sessionId?: string;
  approvalId?: string;
  /** The action button identifier the user pressed (e.g. "accept", "decline", "view", "approve", "reject", "reply") */
  actionIdentifier?: string;
  /** Text typed in an inline reply action (e.g. warp_attention → Reply) */
  userText?: string;
} | null {
  const data = response.notification.request.content.data;
  if (!data?.type) return null;

  // Extract inline text input from category actions (e.g. "Reply to Warp…")
  const userText = (response as any).userText as string | undefined;

  return {
    type: data.type as string,
    dailyLogId: data.dailyLogId as string | undefined,
    projectId: data.projectId as string | undefined,
    roomId: data.roomId as string | undefined,
    taskId: data.taskId as string | undefined,
    scanId: data.scanId as string | undefined,
    sessionId: data.sessionId as string | undefined,
    approvalId: data.approvalId as string | undefined,
    actionIdentifier: response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      ? response.actionIdentifier
      : undefined,
    userText,
  };
}

/**
 * Handle inline reply from a warp_attention notification.
 * Posts the user's reply text as a comment on the dev session.
 */
export async function handleWarpAttentionReply(
  sessionId: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  try {
    await apiFetch(`/dev-session/${sessionId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    console.log("[push] Warp attention reply sent:", text.trim().slice(0, 50));
  } catch (err) {
    console.warn("[push] Failed to send warp attention reply:", err);
  }
}
