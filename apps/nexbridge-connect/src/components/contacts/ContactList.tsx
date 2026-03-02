import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ContactCard } from "./ContactCard";
import { ContactReviewModal } from "./ContactReviewModal";
import { SyncStatus } from "./SyncStatus";
import { SettingsPanel } from "../SettingsPanel";
import { EnvironmentSelector } from "../EnvironmentSelector";
import { useSettings } from "../../hooks/useSettings";
import { useAutoSync } from "../../hooks/useAutoSync";
import { importContacts, listContacts, type ImportContactInput } from "../../lib/api";

interface DeviceContact {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  allEmails: string[];
  allPhones: string[];
  // Address fields
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  // Organization
  company: string | null;
  jobTitle: string | null;
}

interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
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
  
  // Advanced filters
  const [stateFilter, setStateFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  
  // Groups
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [contactGroupMap, setContactGroupMap] = useState<Map<string, string[]>>(new Map());
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  
  // Ignored contacts
  const [ignoredContacts, setIgnoredContacts] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);
  

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

  // Load device contacts and groups
  useEffect(() => {
    loadContacts();
    loadSyncedContacts();
    loadGroups();
    loadIgnoredContacts();
  }, []);

  const loadGroups = async () => {
    try {
      const groupList = await invoke<ContactGroup[]>("list_contact_groups");
      setGroups(groupList);
      
      // Load contact-group memberships
      const memberMap = new Map<string, string[]>();
      for (const group of groupList) {
        const contactIds = await invoke<string[]>("get_contacts_in_group", { groupId: group.id });
        for (const contactId of contactIds) {
          const existing = memberMap.get(contactId) || [];
          memberMap.set(contactId, [...existing, group.id]);
        }
      }
      setContactGroupMap(memberMap);
    } catch (err) {
      console.error("Failed to load groups:", err);
    }
  };

  const loadIgnoredContacts = async () => {
    try {
      const ignored = await invoke<string[]>("get_ignored_contacts");
      setIgnoredContacts(new Set(ignored));
    } catch (err) {
      console.error("Failed to load ignored contacts:", err);
    }
  };

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

  // Valid US state/territory codes
  const US_STATE_CODES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
    'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
    'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
    'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    // Territories
    'PR', 'GU', 'VI', 'AS', 'MP',
    // Canadian provinces
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK'
  ]);

  // Get unique values for filter dropdowns - US states first, then others
  const { usStates, otherStates } = useMemo(() => {
    const allStates = [...new Set(contacts.map(c => c.state).filter(Boolean))] as string[];
    const us = allStates.filter(s => US_STATE_CODES.has(s.toUpperCase())).sort();
    const other = allStates.filter(s => !US_STATE_CODES.has(s.toUpperCase())).sort();
    return { usStates: us, otherStates: other };
  }, [contacts]);
  const uniqueCities = useMemo(() => 
    [...new Set(contacts.map(c => c.city).filter(Boolean))].sort() as string[],
    [contacts]
  );
  const uniqueCompanies = useMemo(() => 
    [...new Set(contacts.map(c => c.company).filter(Boolean))].sort() as string[],
    [contacts]
  );

  // Filter contacts by search and advanced filters
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // Text search
      if (search.trim()) {
        const term = search.toLowerCase();
        const matchesSearch = 
          c.displayName?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term) ||
          c.phone?.includes(term) ||
          c.company?.toLowerCase().includes(term) ||
          c.city?.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      
      // State filter
      if (stateFilter && c.state !== stateFilter) return false;
      
      // City filter
      if (cityFilter && c.city !== cityFilter) return false;
      
      // Company filter
      if (companyFilter && c.company !== companyFilter) return false;
      
      // Group filter
      if (groupFilter) {
        const contactGroups = contactGroupMap.get(c.id) || [];
        if (!contactGroups.includes(groupFilter)) return false;
      }
      
      // Hide ignored contacts unless showIgnored is true
      if (!showIgnored && ignoredContacts.has(c.id)) return false;
      
      return true;
    });
  }, [contacts, search, stateFilter, cityFilter, companyFilter, groupFilter, contactGroupMap, showIgnored, ignoredContacts]);

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

  const toggleSelect = useCallback((id: string) => {
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
  }, [settings.autoSyncEnabled, setSelectedContacts]);

  const selectAll = useCallback(() => {
    const unsynced = filteredContacts.filter((c) => !isSynced(c));
    const newSelection = new Set(unsynced.map((c) => c.id));
    setSelectedIds(newSelection);
    if (settings.autoSyncEnabled) {
      setSelectedContacts(Array.from(newSelection));
    }
  }, [filteredContacts, settings.autoSyncEnabled, setSelectedContacts]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    if (settings.autoSyncEnabled) {
      setSelectedContacts([]);
    }
  }, [settings.autoSyncEnabled, setSelectedContacts]);

  // Check if any selected contacts have multiple emails/phones
  const selectedContactsWithMultiple = useMemo(() => {
    return contacts.filter(
      (c) =>
        selectedIds.has(c.id) &&
        (c.allEmails?.length > 1 || c.allPhones?.length > 1)
    );
  }, [contacts, selectedIds]);

  // Memoized callback for review button
  const handleReviewContact = useCallback((_id: string) => {
    setShowReviewModal(true);
  }, []);

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
        
        {/* Advanced Filters */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
          >
            <option value="">All States</option>
            {usStates.length > 0 && (
              <optgroup label="US / Canada">
                {usStates.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            )}
            {otherStates.length > 0 && (
              <optgroup label="International / Other">
                {otherStates.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            )}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
          >
            <option value="">All Cities</option>
            {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
          >
            <option value="">All Companies</option>
            {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
          >
            <option value="">All Groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {(stateFilter || cityFilter || companyFilter || groupFilter) && (
            <button
              type="button"
              onClick={() => {
                setStateFilter("");
                setCityFilter("");
                setCompanyFilter("");
                setGroupFilter("");
              }}
              className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
            >
              Clear filters
            </button>
          )}
          <label className="flex items-center gap-1 text-xs text-slate-500 ml-auto">
            <input
              type="checkbox"
              checked={showIgnored}
              onChange={(e) => setShowIgnored(e.target.checked)}
              className="w-3 h-3"
            />
            Show ignored ({ignoredContacts.size})
          </label>
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
                    onToggle={toggleSelect}
                    onReview={
                      contact.allEmails?.length > 1 || contact.allPhones?.length > 1
                        ? handleReviewContact
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons for selected contacts */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 space-y-2">
          {selectedContactsWithMultiple.length > 0 && (
            <p className="text-center text-xs text-slate-500">
              {selectedContactsWithMultiple.length} contact{selectedContactsWithMultiple.length === 1 ? " has" : "s have"} multiple emails/phones
            </p>
          )}
          
          {/* Ignore / Group tagging */}
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await invoke("ignore_contacts", { contactIds: Array.from(selectedIds) });
                  await loadIgnoredContacts();
                  setSelectedIds(new Set());
                } catch (err) {
                  console.error("Failed to ignore contacts:", err);
                }
              }}
              className="px-3 py-2 bg-slate-500 text-white rounded-lg text-sm hover:bg-slate-600"
            >
              ✕ Remove from Sync
            </button>
            {showIgnored && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await invoke("unignore_contacts", { contactIds: Array.from(selectedIds) });
                    await loadIgnoredContacts();
                    setSelectedIds(new Set());
                  } catch (err) {
                    console.error("Failed to unignore contacts:", err);
                  }
                }}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                ✓ Restore to Sync
              </button>
            )}
          </div>
          
          {/* Group tagging */}
          <div className="flex gap-2">
            <select
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              onChange={async (e) => {
                if (e.target.value) {
                  try {
                    await invoke("add_contacts_to_group", {
                      contactIds: Array.from(selectedIds),
                      groupId: e.target.value,
                    });
                    await loadGroups();
                    e.target.value = "";
                  } catch (err) {
                    console.error("Failed to add to group:", err);
                  }
                }
              }}
              defaultValue=""
            >
              <option value="">Add to group...</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowGroupModal(true)}
              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
              title="Create new group"
            >
              + New Group
            </button>
          </div>
          
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
      
      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Create New Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowGroupModal(false);
                  setNewGroupName("");
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (newGroupName.trim()) {
                    try {
                      const newGroup = await invoke<ContactGroup>("create_contact_group", {
                        name: newGroupName.trim(),
                        description: null,
                        color: null,
                      });
                      // Add selected contacts to the new group
                      if (selectedIds.size > 0) {
                        await invoke("add_contacts_to_group", {
                          contactIds: Array.from(selectedIds),
                          groupId: newGroup.id,
                        });
                      }
                      await loadGroups();
                      setShowGroupModal(false);
                      setNewGroupName("");
                    } catch (err) {
                      console.error("Failed to create group:", err);
                    }
                  }
                }}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 bg-nexus-600 text-white rounded-lg hover:bg-nexus-700 disabled:opacity-50"
              >
                Create{selectedIds.size > 0 ? ` & Add ${selectedIds.size} contacts` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
