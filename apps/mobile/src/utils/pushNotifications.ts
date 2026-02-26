import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "../api/client";

// ── Notification display behaviour (foreground) ─────────────────────
// For video calls, suppress the system banner — our IncomingCallScreen
// handles the UX (loud ring, vibration, accept/decline UI).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    if (data?.type === "video_call") {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
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
 * Parse the deep-link data from a notification response (user tapped a notification).
 */
export function parseNotificationData(
  response: Notifications.NotificationResponse,
): { type: string; dailyLogId?: string; projectId?: string } | null {
  const data = response.notification.request.content.data;
  if (!data?.type) return null;
  return {
    type: data.type as string,
    dailyLogId: data.dailyLogId as string | undefined,
    projectId: data.projectId as string | undefined,
  };
}
