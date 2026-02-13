import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { getTokens } from "./src/storage/tokens";
import { initDb } from "./src/offline/db";
import { recoverStuckProcessing } from "./src/offline/outbox";
import { startAutoSync, stopAutoSync } from "./src/offline/autoSync";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { VersionBadge } from "./src/components/VersionBadge";

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

  // Start/stop auto-sync based on login state
  useEffect(() => {
    if (isLoggedIn) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
  }, [isLoggedIn]);

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
          <VersionBadge />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View style={styles.container}>
          <StatusBar style="auto" />
          <AppNavigator onLogout={() => setIsLoggedIn(false)} />
          <VersionBadge />
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
