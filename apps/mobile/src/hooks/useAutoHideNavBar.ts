import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import * as NavigationBar from "expo-navigation-bar";

/**
 * Android-only: Hides the system navigation bar (back / home / recent) in
 * sticky immersive mode. When the user swipes from the bottom edge the bar
 * appears as a semi-transparent overlay, then auto-hides again.
 *
 * IMPORTANT: This hook does NOT subscribe to NavigationBar.useVisibility()
 * because that causes the host component to re-render on every visibility
 * toggle — which at the App root means the entire tree flickers.
 *
 * Instead we use a polling/interval approach that checks periodically and
 * re-hides when needed, without causing React re-renders.
 *
 * On iOS this hook is a no-op.
 */
export function useAutoHideNavBar(rehideDelayMs = 3000) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Periodically re-hide the nav bar if it became visible (e.g. user swiped).
    // This avoids useVisibility() which triggers React re-renders.
    intervalRef.current = setInterval(async () => {
      try {
        const vis = await NavigationBar.getVisibilityAsync();
        if (vis === "visible") {
          await NavigationBar.setVisibilityAsync("hidden");
        }
      } catch {
        // ignore — may fail if app is backgrounded
      }
    }, rehideDelayMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [rehideDelayMs]);

  // Re-hide when app comes back to foreground
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        NavigationBar.setVisibilityAsync("hidden").catch(() => {});
      }
    });

    return () => sub.remove();
  }, []);
}
