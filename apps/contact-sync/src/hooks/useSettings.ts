import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load, Store } from "@tauri-apps/plugin-store";

export interface SyncSettings {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  selectedContactIds: string[];
  launchAtStartup: boolean;
  lastSyncAt: string | null;
}

const DEFAULT_SETTINGS: SyncSettings = {
  autoSyncEnabled: false,
  syncIntervalMinutes: 15,
  selectedContactIds: [],
  launchAtStartup: false,
  lastSyncAt: null,
};

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await load("settings.json", {
      autoSave: true,
      defaults: {
        syncSettings: DEFAULT_SETTINGS,
      },
    });
  }
  return store;
}

export function useSettings() {
  const [settings, setSettings] = useState<SyncSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await getStore();
      const saved = await s.get<SyncSettings>("syncSettings");
      if (saved) {
        setSettings(saved);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = useCallback(async (newSettings: SyncSettings) => {
    try {
      const s = await getStore();
      await s.set("syncSettings", newSettings);
      setSettings(newSettings);

      // Also update Tauri state
      await invoke("update_sync_settings", {
        settings: {
          auto_sync_enabled: newSettings.autoSyncEnabled,
          sync_interval_minutes: newSettings.syncIntervalMinutes,
          selected_contact_ids: newSettings.selectedContactIds,
          launch_at_startup: newSettings.launchAtStartup,
          last_sync_at: newSettings.lastSyncAt,
        },
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }, []);

  const setAutoSync = useCallback(
    async (enabled: boolean) => {
      const newSettings = { ...settings, autoSyncEnabled: enabled };
      await saveSettings(newSettings);
    },
    [settings, saveSettings]
  );

  const setSyncInterval = useCallback(
    async (minutes: number) => {
      const newSettings = { ...settings, syncIntervalMinutes: minutes };
      await saveSettings(newSettings);
    },
    [settings, saveSettings]
  );

  const setSelectedContacts = useCallback(
    async (ids: string[]) => {
      const newSettings = { ...settings, selectedContactIds: ids };
      await saveSettings(newSettings);
    },
    [settings, saveSettings]
  );

  const setLaunchAtStartup = useCallback(
    async (enabled: boolean) => {
      const newSettings = { ...settings, launchAtStartup: enabled };
      await saveSettings(newSettings);
    },
    [settings, saveSettings]
  );

  const recordSync = useCallback(async () => {
    const newSettings = { ...settings, lastSyncAt: new Date().toISOString() };
    await saveSettings(newSettings);
    await invoke("record_sync");
  }, [settings, saveSettings]);

  return {
    settings,
    isLoading,
    setAutoSync,
    setSyncInterval,
    setSelectedContacts,
    setLaunchAtStartup,
    recordSync,
    saveSettings,
  };
}
