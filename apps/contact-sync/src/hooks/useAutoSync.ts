import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { importContacts, type ImportContactInput } from "../lib/api";
import { getStoredToken } from "../lib/auth";

interface DeviceContact {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface UseAutoSyncOptions {
  enabled: boolean;
  intervalMinutes: number;
  selectedContactIds: string[];
  onSyncComplete?: (result: { created: number; updated: number }) => void;
  onSyncError?: (error: string) => void;
}

export function useAutoSync({
  enabled,
  intervalMinutes,
  selectedContactIds,
  onSyncComplete,
  onSyncError,
}: UseAutoSyncOptions) {
  const intervalRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  const performSync = useCallback(async () => {
    // Skip if already syncing, no selection, or no auth
    if (isSyncingRef.current || selectedContactIds.length === 0 || !getStoredToken()) {
      return;
    }

    isSyncingRef.current = true;

    try {
      // Get contacts from device
      const allContacts = await invoke<DeviceContact[]>("get_contacts");

      // Filter to selected ones
      const toSync = allContacts.filter((c) =>
        selectedContactIds.includes(c.id)
      );

      if (toSync.length === 0) {
        isSyncingRef.current = false;
        return;
      }

      // Determine platform
      const platform = navigator.platform.toLowerCase().includes("mac")
        ? "MACOS"
        : "WINDOWS";

      // Build payload
      const payload: ImportContactInput[] = toSync.map((c) => ({
        displayName: c.display_name,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        source: platform as "MACOS" | "WINDOWS",
      }));

      // Sync to server
      const result = await importContacts(payload);

      onSyncComplete?.({
        created: result.createdCount,
        updated: result.updatedCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Auto-sync failed";
      onSyncError?.(message);
    } finally {
      isSyncingRef.current = false;
    }
  }, [selectedContactIds, onSyncComplete, onSyncError]);

  // Set up interval when enabled
  useEffect(() => {
    if (enabled && intervalMinutes > 0) {
      // Perform initial sync after a short delay
      const initialTimeout = setTimeout(() => {
        performSync();
      }, 5000);

      // Set up recurring interval
      intervalRef.current = window.setInterval(
        () => {
          performSync();
        },
        intervalMinutes * 60 * 1000
      );

      return () => {
        clearTimeout(initialTimeout);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Clear interval when disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [enabled, intervalMinutes, performSync]);

  return { performSync };
}
