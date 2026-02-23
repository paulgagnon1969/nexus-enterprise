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
import { apiJson } from "./src/api/client";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { VideoCallScreen, type VideoCallParams } from "./src/screens/VideoCallScreen";

type RootStackParamList = {
  Main: undefined;
  VideoCall: VideoCallParams;
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
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Check for OTA updates first
        await checkForUpdates();
        await initDb();
        // Recover any outbox items stuck in PROCESSING (e.g., app killed mid-sync)
        await recoverStuckProcessing();
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
        } else if (data.type === "video_call" && (data as any).roomId) {
          // Join the call by fetching a token, then navigate to VideoCallScreen
          try {
            const res = await apiJson<{ room: any; token: string; livekitUrl: string }>(
              `/video/rooms/${(data as any).roomId}/join`,
              { method: "POST" },
            );
            navigationRef.current.navigate("VideoCall" as any, {
              roomId: (data as any).roomId,
              token: res.token,
              livekitUrl: res.livekitUrl,
              projectName: undefined,
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
            name="VideoCall"
            component={VideoCallScreen as any}
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
