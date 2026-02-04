import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContactCard } from "./ContactCard";
import { SyncStatus } from "./SyncStatus";
import { SettingsPanel } from "./SettingsPanel";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { useSettings } from "../hooks/useSettings";
import { useAutoSync } from "../hooks/useAutoSync";
import { importContacts, listContacts, type ImportContactInput } from "../lib/api";

interface DeviceContact {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

type SyncState = "idle" | "loading" | "syncing" | "success" | "error";

export function ContactList() {
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [syncedEmails, setSyncedEmails] = useState<Set<string>>(new Set());
  const [syncedPhones, setSyncedPhones] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number } | null>(null);

  // Settings management
  const {
    settings,
    setAutoSync,
    setSyncInterval,
    setSelectedContacts,
    setLaunchAtStartup,
    recordSync,
  } = useSettings();

  // Auto-sync callback handlers
  const handleAutoSyncComplete = useCallback(
    async (result: { created: number; updated: number }) => {
      setSyncResult(result);
      setSyncState("success");
      await recordSync();
      await loadSyncedContacts();
      setTimeout(() => setSyncState("idle"), 3000);
    },
    [recordSync]
  );

  const handleAutoSyncError = useCallback((err: string) => {
    console.error("Auto-sync error:", err);
    // Don't show error UI for background sync, just log it
  }, []);

  // Auto-sync hook
  useAutoSync({
    enabled: settings.autoSyncEnabled,
    intervalMinutes: settings.syncIntervalMinutes,
    selectedContactIds: settings.selectedContactIds,
    onSyncComplete: handleAutoSyncComplete,
    onSyncError: handleAutoSyncError,
  });

  // Initialize selected contacts from saved settings
  useEffect(() => {
    if (settings.selectedContactIds.length > 0) {
      setSelectedIds(new Set(settings.selectedContactIds));
    }
  }, [settings.selectedContactIds]);

  // Load device contacts
  useEffect(() => {
    loadContacts();
    loadSyncedContacts();
  }, []);

  const loadContacts = async () => {
    setSyncState("loading");
    setError(null);
    try {
      const result = await invoke<DeviceContact[]>("get_contacts");
      setContacts(result);
      setSyncState("idle");
    } catch (err) {
      setError(err as string);
      setSyncState("error");
    }
  };

  const loadSyncedContacts = async () => {
    try {
      const synced = await listContacts(undefined, 200);
      const emails = new Set<string>();
      const phones = new Set<string>();
      synced.forEach((c) => {
        if (c.email) emails.add(c.email.toLowerCase());
        if (c.phone) phones.add(c.phone);
      });
      setSyncedEmails(emails);
      setSyncedPhones(phones);
    } catch (err) {
      console.error("Failed to load synced contacts:", err);
    }
  };

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const term = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.display_name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.includes(term)
    );
  }, [contacts, search]);

  // Group contacts by first letter
  const groupedContacts = useMemo(() => {
    const groups: Record<string, DeviceContact[]> = {};
    filteredContacts.forEach((contact) => {
      const firstChar = (contact.display_name || contact.email || "#")
        .charAt(0)
        .toUpperCase();
      const key = /[A-Z]/.test(firstChar) ? firstChar : "#";
      if (!groups[key]) groups[key] = [];
      groups[key].push(contact);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredContacts]);

  const isSynced = (contact: DeviceContact) => {
    if (contact.email && syncedEmails.has(contact.email.toLowerCase())) return true;
    if (contact.phone && syncedPhones.has(contact.phone)) return true;
    return false;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Save selection for auto-sync
      if (settings.autoSyncEnabled) {
        setSelectedContacts(Array.from(next));
      }
      return next;
    });
  };

  const selectAll = () => {
    const unsynced = filteredContacts.filter((c) => !isSynced(c));
    const newSelection = new Set(unsynced.map((c) => c.id));
    setSelectedIds(newSelection);
    if (settings.autoSyncEnabled) {
      setSelectedContacts(Array.from(newSelection));
    }
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    if (settings.autoSyncEnabled) {
      setSelectedContacts([]);
    }
  };

  const handleSync = async () => {
    if (selectedIds.size === 0) return;

    setSyncState("syncing");
    setError(null);
    setSyncResult(null);

    try {
      const toSync = contacts.filter((c) => selectedIds.has(c.id));
      const platform = navigator.platform.toLowerCase().includes("mac")
        ? "MACOS"
        : "WINDOWS";

      const payload: ImportContactInput[] = toSync.map((c) => ({
        displayName: c.display_name,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        source: platform as "MACOS" | "WINDOWS",
      }));

      const result = await importContacts(payload);
      setSyncResult({ created: result.createdCount, updated: result.updatedCount });
      setSyncState("success");
      
      // Save selection for auto-sync before clearing (if auto-sync enabled)
      if (settings.autoSyncEnabled) {
        await setSelectedContacts(Array.from(selectedIds));
      } else {
        setSelectedIds(new Set());
      }

      // Record sync time and refresh
      await recordSync();
      await loadSyncedContacts();

      // Reset to idle after 3 seconds
      setTimeout(() => setSyncState("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
      setSyncState("error");
    }
  };

  const unsyncedCount = filteredContacts.filter((c) => !isSynced(c)).length;

  return (
    <div className="space-y-4">
      {/* Environment Selector */}
      <EnvironmentSelector />

      {/* Settings Panel */}
      <SettingsPanel
        settings={settings}
        onAutoSyncChange={setAutoSync}
        onIntervalChange={setSyncInterval}
        onLaunchAtStartupChange={setLaunchAtStartup}
        selectedCount={selectedIds.size}
      />

      {/* Search and actions */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent"
          />
          <button
            onClick={loadContacts}
            className="px-3 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            title="Refresh"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {filteredContacts.length} contacts • {unsyncedCount} not synced
          </span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-nexus-600 hover:text-nexus-700"
            >
              Select unsynced
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={deselectAll}
              className="text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Status messages */}
      {syncState === "loading" && (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nexus-600 mx-auto mb-3"></div>
          <p className="text-slate-600">Loading contacts from your device...</p>
          <p className="text-sm text-slate-400 mt-1">
            You may need to grant permission in System Settings
          </p>
        </div>
      )}

      {syncState === "error" && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={loadContacts}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
        </div>
      )}

      {syncState === "success" && syncResult && (
        <SyncStatus created={syncResult.created} updated={syncResult.updated} />
      )}

      {/* Contact list */}
      {syncState !== "loading" && contacts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="max-h-[400px] overflow-y-auto">
            {groupedContacts.map(([letter, group]) => (
              <div key={letter}>
                <div className="sticky top-0 bg-slate-50 px-4 py-1 text-xs font-semibold text-slate-500 border-b border-slate-100">
                  {letter}
                </div>
                {group.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={{
                      id: contact.id,
                      displayName: contact.display_name,
                      email: contact.email,
                      phone: contact.phone,
                    }}
                    isSelected={selectedIds.has(contact.id)}
                    isSynced={isSynced(contact)}
                    onToggle={() => toggleSelect(contact.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync button */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4">
          <button
            onClick={handleSync}
            disabled={syncState === "syncing"}
            className="w-full bg-nexus-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-nexus-700 focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {syncState === "syncing" ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Syncing...
              </span>
            ) : (
              `Sync ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
