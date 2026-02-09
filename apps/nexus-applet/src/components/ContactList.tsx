import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContactCard } from "./ContactCard";
import { ContactReviewModal } from "./ContactReviewModal";
import { SyncStatus } from "./SyncStatus";
import { SettingsPanel } from "./SettingsPanel";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { useSettings } from "../hooks/useSettings";
import { useAutoSync } from "../hooks/useAutoSync";
import { importContacts, listContacts, type ImportContactInput } from "../lib/api";

interface DeviceContact {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;       // Primary email
  phone: string | null;       // Primary phone
  allEmails: string[];        // All emails from device
  allPhones: string[];        // All phones from device
}

interface MailContact {
  email: string;
  displayName: string | null;
  messageCount: number;
  constructionScore: number;
  domainSignals: string[];
  keywordSignals: string[];
  lastSeen: number | null;
  sampleSubjects: string[];
}

interface MailAnalysisResult {
  contactsAnalyzed: number;
  constructionContacts: number;
  emailsScanned: number;
  contacts: MailContact[];
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
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [primaryOverrides, setPrimaryOverrides] = useState<Map<string, { email: string | null; phone: string | null }>>(new Map());
  
  // Mail analysis state
  const [mailAnalysis, setMailAnalysis] = useState<MailAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [showMailPanel, setShowMailPanel] = useState(false);

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
      setContacts(result || []);
      setSyncState("idle");
    } catch (err) {
      console.error("Failed to load contacts:", err);
      const errorMsg = typeof err === "string" ? err : (err as Error)?.message || "Failed to load contacts";
      setError(errorMsg);
      setSyncState("error");
    }
  };

  const loadSyncedContacts = async () => {
    try {
      const synced = await listContacts(undefined, 200);
      const emails = new Set<string>();
      const phones = new Set<string>();
      (synced || []).forEach((c) => {
        if (c.email) emails.add(c.email.toLowerCase());
        if (c.phone) phones.add(c.phone);
      });
      setSyncedEmails(emails);
      setSyncedPhones(phones);
    } catch (err) {
      // Don't block UI for this - just log it
    }
  };

  const analyzeMail = async () => {
    setIsAnalyzing(true);
    setMailError(null);
    try {
      const result = await invoke<MailAnalysisResult>("analyze_mail");
      setMailAnalysis(result);
      setShowMailPanel(true);
    } catch (err) {
      console.error("Mail analysis failed:", err);
      setMailError(typeof err === "string" ? err : "Failed to analyze mail. You may need Full Disk Access.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const term = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.displayName?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.includes(term)
    );
  }, [contacts, search]);

  // Group contacts by first letter
  const groupedContacts = useMemo(() => {
    const groups: Record<string, DeviceContact[]> = {};
    filteredContacts.forEach((contact) => {
      const firstChar = (contact.displayName || contact.email || "#")
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

  // Check if any selected contacts have multiple emails/phones
  const selectedContactsWithMultiple = useMemo(() => {
    return contacts.filter(
      (c) =>
        selectedIds.has(c.id) &&
        (c.allEmails?.length > 1 || c.allPhones?.length > 1)
    );
  }, [contacts, selectedIds]);

  const handleReviewConfirm = (updates: Map<string, { email: string | null; phone: string | null }>) => {
    setPrimaryOverrides(updates);
    // Proceed with sync after review
    performSync(updates);
  };

  const handleSync = async () => {
    if (selectedIds.size === 0) return;

    // If there are contacts with multiple emails/phones, show review modal
    if (selectedContactsWithMultiple.length > 0) {
      setShowReviewModal(true);
      return;
    }

    // Otherwise sync directly
    performSync(primaryOverrides);
  };

  const performSync = async (overrides: Map<string, { email: string | null; phone: string | null }>) => {
    if (selectedIds.size === 0) return;

    setSyncState("syncing");
    setError(null);
    setSyncResult(null);

    try {
      const toSync = contacts.filter((c) => selectedIds.has(c.id));
      const platform = navigator.platform.toLowerCase().includes("mac")
        ? "MACOS"
        : "WINDOWS";

      const payload: ImportContactInput[] = toSync.map((c) => {
        // Use overridden primary email/phone if available
        const override = overrides.get(c.id);
        return {
          displayName: c.displayName,
          firstName: c.firstName,
          lastName: c.lastName,
          email: override?.email ?? c.email,
          phone: override?.phone ?? c.phone,
          allEmails: c.allEmails?.length ? c.allEmails : null,
          allPhones: c.allPhones?.length ? c.allPhones : null,
          source: platform as "MACOS" | "WINDOWS",
        };
      });

      const result = await importContacts(payload);
      setSyncResult({ created: result.createdCount, updated: result.updatedCount });
      setSyncState("success");
      
      // Clear overrides after successful sync
      setPrimaryOverrides(new Map());
      
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
    <div className="h-full flex flex-col space-y-4">
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

      {/* Mail Analysis Panel */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-slate-700">📧 Construction Contact Detection</h3>
          <button
            onClick={analyzeMail}
            disabled={isAnalyzing}
            className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Mail"}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Scan your Mail.app to identify construction-related contacts by analyzing email patterns.
        </p>
        {mailError && (
          <p className="text-xs text-red-600 mb-2">{mailError}</p>
        )}
        {mailAnalysis && (
          <div className="space-y-2">
            <div className="flex gap-4 text-xs">
              <span className="text-slate-500">
                📊 {mailAnalysis.emailsScanned.toLocaleString()} emails scanned
              </span>
              <span className="text-slate-500">
                👥 {mailAnalysis.contactsAnalyzed.toLocaleString()} contacts
              </span>
              <span className="text-green-600 font-medium">
                🏗️ {mailAnalysis.constructionContacts} likely construction
              </span>
            </div>
            <button
              onClick={() => setShowMailPanel(!showMailPanel)}
              className="text-xs text-nexus-600 hover:underline"
            >
              {showMailPanel ? "Hide results" : "Show top construction contacts"}
            </button>
            {showMailPanel && mailAnalysis.contacts.filter(c => c.constructionScore >= 20).length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                {mailAnalysis.contacts
                  .filter(c => c.constructionScore >= 20)
                  .slice(0, 50)
                  .map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">
                          {c.displayName || c.email}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{c.email}</p>
                        {c.domainSignals.length > 0 && (
                          <p className="text-xs text-green-600 truncate">
                            {c.domainSignals.slice(0, 2).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-xs text-slate-400">
                          {c.messageCount} emails
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          c.constructionScore >= 50 ? "bg-green-100 text-green-700" :
                          c.constructionScore >= 30 ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {c.constructionScore}%
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

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
            type="button"
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
              type="button"
              onClick={selectAll}
              className="text-nexus-600 hover:text-nexus-700"
            >
              Select unsynced
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
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

      {/* Demo mode notice */}
      {syncState === "idle" && contacts.length > 0 && contacts[0]?.id?.startsWith("demo") && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          <strong>Demo Mode:</strong> Showing sample contacts. Real macOS contacts integration coming soon.
        </div>
      )}

      {/* Contact list */}
      {syncState !== "loading" && contacts.length > 0 && (
        <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
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
                      displayName: contact.displayName,
                      email: contact.email,
                      phone: contact.phone,
                      allEmails: contact.allEmails,
                      allPhones: contact.allPhones,
                    }}
                    isSelected={selectedIds.has(contact.id)}
                    isSynced={isSynced(contact)}
                    onToggle={() => toggleSelect(contact.id)}
                    onReview={
                      contact.allEmails?.length > 1 || contact.allPhones?.length > 1
                        ? () => setShowReviewModal(true)
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync button */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 space-y-2">
          {selectedContactsWithMultiple.length > 0 && (
            <p className="text-center text-xs text-slate-500">
              {selectedContactsWithMultiple.length} contact{selectedContactsWithMultiple.length === 1 ? " has" : "s have"} multiple emails/phones
            </p>
          )}
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
            ) : selectedContactsWithMultiple.length > 0 ? (
              `Review & Sync ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}`
            ) : (
              `Sync ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}`
            )}
          </button>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <ContactReviewModal
          contacts={contacts.filter((c) => selectedIds.has(c.id))}
          onClose={() => setShowReviewModal(false)}
          onConfirm={handleReviewConfirm}
        />
      )}
    </div>
  );
}
