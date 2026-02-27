import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import * as Notifications from "expo-notifications";
import { getTokens } from "./src/storage/tokens";
import { initDb } from "./src/offline/db";
import { recoverStuckProcessing } from "./src/offline/outbox";
import { startAutoSync, stopAutoSync } from "./src/offline/autoSync";
import { registerForPushNotifications, deregisterPushToken, parseNotificationData } from "./src/utils/pushNotifications";
import { apiJson, setOnAuthExhausted } from "./src/api/client";
import { getBackgroundAuth, getGeofenceConfig, setupGeofencing } from "./src/services/geofencing";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { useAutoHideNavBar } from "./src/hooks/useAutoHideNavBar";
import { CallScreen, type CallParams } from "./src/screens/CallScreen";
import { IncomingCallScreen, type IncomingCallData } from "./src/screens/IncomingCallScreen";
import { callRingConfig } from "./src/config/callRingConfig";

type RootStackParamList = {
  Main: undefined;
  Call: CallParams;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

/** Check for OTA updates and apply if available */
async function checkForUpdates() {
  if (__DEV__) return; // Skip in development mode
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (e) {
    // Silently fail - updates are non-critical
    console.log("Update check failed:", e);
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);
  const notificationReceivedListener = useRef<Notifications.EventSubscription | null>(null);
  const incomingCallTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Android: hide system nav bar (sticky immersive). Any touch dismisses it;
  // it re-hides after 3 s so bottom-of-screen buttons stay reachable.
  useAutoHideNavBar(3000);

  // Auto-logout when the API client exhausts all auth (JWT + refresh + DeviceSync)
  useEffect(() => {
    setOnAuthExhausted(() => {
      console.log("[App] Auth exhausted — forcing logout");
      setIsLoggedIn(false);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Check for OTA updates first
        await checkForUpdates();
        await initDb();
        // Recover any outbox items stuck in PROCESSING (e.g., app killed mid-sync)
        await recoverStuckProcessing();
        
        // Restore geofencing if it was previously configured
        // This ensures automatic clock-in/out works even if user hasn't logged in yet
        const bgAuth = await getBackgroundAuth();
        const geoConfig = await getGeofenceConfig();
        if (bgAuth && geoConfig.enabled && geoConfig.projects.length > 0) {
          try {
            await setupGeofencing(
              bgAuth.token,
              bgAuth.userId,
              bgAuth.apiBaseUrl,
              geoConfig.projects,
            );
            console.log('[App] Geofencing restored on startup');
          } catch (err) {
            console.warn('[App] Failed to restore geofencing:', err);
          }
        }
        
        const tokens = await getTokens();
        setIsLoggedIn(!!tokens);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Start/stop auto-sync and push registration based on login state
  useEffect(() => {
    if (isLoggedIn) {
      startAutoSync();
      registerForPushNotifications().catch(console.warn);
    } else {
      stopAutoSync();
    }
  }, [isLoggedIn]);

  // ── Foreground listener: show IncomingCallScreen on video_call push ──
  useEffect(() => {
    notificationReceivedListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        if (data?.type === "video_call" && data?.roomId) {
          const callData: IncomingCallData = {
            roomId: data.roomId as string,
            projectId: data.projectId as string | undefined,
            callerName:
              (notification.request.content.body ?? "Someone is calling you").replace(" is calling you", ""),
            projectName:
              (notification.request.content.title ?? "")
                .replace("📹 Video Call — ", "")
                .replace("📹 ", "") || undefined,
          };
          setIncomingCall(callData);

          // Auto-dismiss if not answered (duration from callRingConfig)
          if (incomingCallTimeout.current) clearTimeout(incomingCallTimeout.current);
          if (callRingConfig.ringTimeoutMs > 0) {
            incomingCallTimeout.current = setTimeout(() => {
              setIncomingCall(null);
            }, callRingConfig.ringTimeoutMs);
          }
        }
      });

    return () => {
      notificationReceivedListener.current?.remove();
      if (incomingCallTimeout.current) clearTimeout(incomingCallTimeout.current);
    };
  }, []);

  // Handle notification tap → deep-link to daily log or video call
  useEffect(() => {
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = parseNotificationData(response);
        if (!data || !navigationRef.current) return;

        if (data.type === "daily_log" && data.dailyLogId) {
          navigationRef.current.navigate("DailyLogDetail" as any, {
            logId: data.dailyLogId,
            projectId: data.projectId,
          });
        } else if (data.type === "video_call" && data.roomId) {
          // Dismiss incoming call UI if showing, then join
          setIncomingCall(null);
          try {
            const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
              `/video/rooms/${data.roomId}/join`,
              { method: "POST" },
            );
            navigationRef.current.navigate("Call" as any, {
              roomId: data.roomId,
              token: res.token,
              livekitUrl: res.livekitUrl,
              projectName: undefined,
              callMode: (data as any).callMode || "video",
            });
          } catch (err) {
            console.warn("[push] Failed to join video call:", err);
          }
        }
      });

    return () => {
      notificationResponseListener.current?.remove();
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#b91c1c", fontWeight: "600" }}>
          Error: {error}
        </Text>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <StatusBar style="auto" />
          <LoginScreen onLoggedIn={() => setIsLoggedIn(true)} />
        </View>
      </SafeAreaProvider>
    );
  }

  const handleLogout = async () => {
    await deregisterPushToken();
    setIsLoggedIn(false);
  };

  // ── Accept incoming call: join room → navigate to CallScreen ──
  const handleAcceptCall = async () => {
    if (!incomingCall || !navigationRef.current) return;
    const roomId = incomingCall.roomId;
    const projName = incomingCall.projectName;
    const callMode = incomingCall.callMode || "video";
    setIncomingCall(null);
    if (incomingCallTimeout.current) clearTimeout(incomingCallTimeout.current);

    try {
      const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
        `/video/rooms/${roomId}/join`,
        { method: "POST" },
      );
      navigationRef.current.navigate("Call" as any, {
        roomId,
        token: res.token,
        livekitUrl: res.livekitUrl,
        projectName: projName,
        callMode,
      });
    } catch (err) {
      console.warn("[IncomingCall] Failed to join:", err);
    }
  };

  const handleDeclineCall = () => {
    setIncomingCall(null);
    if (incomingCallTimeout.current) clearTimeout(incomingCallTimeout.current);
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Main">
            {() => (
              <View style={styles.container}>
                <StatusBar style="auto" />
                <AppNavigator onLogout={handleLogout} />
              </View>
            )}
          </RootStack.Screen>
          <RootStack.Screen
            name="Call"
            component={CallScreen as any}
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
        </RootStack.Navigator>
      </NavigationContainer>

      {/* Incoming call overlay — renders above everything */}
      {incomingCall && (
        <IncomingCallScreen
          call={incomingCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
