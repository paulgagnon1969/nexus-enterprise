import { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";

/**
 * Android-only: Hides the system navigation bar (back / home / recent) in
 * sticky immersive mode. When the user swipes from the bottom edge the bar
 * appears as a semi-transparent overlay, then auto-hides again after
 * `rehideDelayMs` (default 3 000 ms).
 *
 * On iOS this hook is a no-op.
 */
export function useAutoHideNavBar(rehideDelayMs = 3000) {
  const visibility = NavigationBar.useVisibility();

  // Initial setup: hide the bar and set overlay-swipe behavior
  useEffect(() => {
    if (Platform.OS !== "android") return;

    (async () => {
      try {
        await NavigationBar.setPositionAsync("absolute");
        await NavigationBar.setVisibilityAsync("hidden");
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setBackgroundColorAsync("#00000001"); // nearly transparent
      } catch (err) {
        console.warn("[useAutoHideNavBar] setup failed:", err);
      }
    })();
  }, []);

  // Re-hide automatically after the user swipes the bar visible
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (visibility !== "visible") return;

    const timer = setTimeout(() => {
      NavigationBar.setVisibilityAsync("hidden").catch(() => {});
    }, rehideDelayMs);

    return () => clearTimeout(timer);
  }, [visibility, rehideDelayMs]);
}
