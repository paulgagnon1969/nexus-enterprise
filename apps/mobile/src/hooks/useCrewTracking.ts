import { useEffect, useRef, useState, useCallback } from "react";
import * as Location from "expo-location";
import { apiJson } from "../api/client";
import type { CrewPosition } from "../components/CrewDots";

interface UseCrewTrackingOptions {
  projectId: string | null;
  /** Poll interval for crew positions in ms (default 15 000) */
  pollInterval?: number;
  /** Report own location interval in ms (default 30 000) */
  reportInterval?: number;
  enabled?: boolean;
}

/**
 * Foreground-only crew tracking.
 * - Polls GET /projects/:id/crew-locations every `pollInterval` ms
 * - Reports own position via POST /projects/:id/location every `reportInterval` ms
 */
export function useCrewTracking({
  projectId,
  pollInterval = 15_000,
  reportInterval = 30_000,
  enabled = true,
}: UseCrewTrackingOptions) {
  const [crew, setCrew] = useState<CrewPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const lastReport = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCrew = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await apiJson<CrewPosition[]>(
        `/projects/${projectId}/crew-locations`,
      );
      setCrew(data);
    } catch {
      // non-fatal
    }
  }, [projectId]);

  // Report own location
  const reportLocation = useCallback(
    async (lat: number, lng: number, accuracy?: number | null) => {
      if (!projectId) return;
      const now = Date.now();
      if (now - lastReport.current < reportInterval) return;
      lastReport.current = now;
      try {
        await apiJson(`/projects/${projectId}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            accuracy: accuracy ?? undefined,
          }),
        });
      } catch {
        // non-fatal
      }
    },
    [projectId, reportInterval],
  );

  useEffect(() => {
    if (!enabled || !projectId) {
      setCrew([]);
      return;
    }

    // Initial fetch
    setLoading(true);
    fetchCrew().finally(() => setLoading(false));

    // Poll crew positions
    pollTimer.current = setInterval(fetchCrew, pollInterval);

    // Watch own position and periodically report
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        (loc) => {
          void reportLocation(
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.accuracy,
          );
        },
      );
    })();

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      locationSub.current?.remove();
    };
  }, [enabled, projectId, pollInterval, fetchCrew, reportLocation]);

  return { crew, loading, refetch: fetchCrew };
}
