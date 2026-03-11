import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initDatabase } from "./src/db/database";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { colors } from "./src/theme/colors";

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>NexCard</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.primary },
  loadingText: { color: colors.textOnPrimary, fontSize: 24, fontWeight: "800", letterSpacing: 2 },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 14, paddingHorizontal: 20, textAlign: "center" },
});
