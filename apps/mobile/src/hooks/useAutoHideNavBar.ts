import { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";

/**
 * Android-only: Hides the system navigation bar on startup.
 *
 * The expo-navigation-bar plugin in app.json already configures:
 *   position: absolute, visibility: hidden, behavior: overlay-swipe
 *
 * This hook just reinforces that at runtime. The system handles
 * re-hiding automatically after a swipe — no polling or subscriptions
 * needed (those cause the App root to re-render → flickering).
 *
 * On iOS this hook is a no-op.
 */
export function useAutoHideNavBar(_rehideDelayMs = 3000) {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    (async () => {
      try {
        await NavigationBar.setPositionAsync("absolute");
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setBackgroundColorAsync("#00000001");
        await NavigationBar.setVisibilityAsync("hidden");
      } catch (err) {
        console.warn("[useAutoHideNavBar] setup failed:", err);
      }
    })();
  }, []);
}
