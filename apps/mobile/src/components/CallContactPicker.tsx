import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  SectionList,
} from "react-native";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { fetchContacts } from "../api/contacts";
import { apiJson } from "../api/client";
import type { Contact } from "../types/api";

// ── Types ──────────────────────────────────────────────────────────

/** A phone-book contact from the device (not yet in the API). */
export interface DeviceContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  allEmails: string[];
  allPhones: string[];
}

/** Union type for anything selectable in the picker. */
export type PickerContact =
  | (Contact & { _source: "api" })
  | (DeviceContact & { _source: "device" });

/** What the parent receives when the user taps Call. */
export interface CallPickerResult {
  /** Selected API contacts (org members, clients, subs, personal). */
  apiContacts: Contact[];
  /** Selected device-only contacts (not in Nexus). */
  deviceContacts: DeviceContact[];
  /** Manual entry (phone or email typed by user). */
  manualEntry: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps the Call / Send Link button. */
  onStartCall: (result: CallPickerResult) => void;
  /** If true, show a spinner on the call button. */
  calling?: boolean;
  /** If provided, the picker is in "invite to existing room" mode (no room creation). */
  existingRoomId?: string;
}

// ── Section helpers ────────────────────────────────────────────────

type SectionKey = "team" | "collaborators" | "contacts" | "device";

const SECTION_META: Record<SectionKey, { title: string; icon: string }> = {
  team: { title: "Team", icon: "🏢" },
  collaborators: { title: "Collaborators", icon: "🤝" },
  contacts: { title: "My Contacts", icon: "👤" },
  device: { title: "Phone Contacts", icon: "📱" },
};

function categorizeContact(c: Contact): SectionKey {
  if (c.category === "internal") return "team";
  if (c.category === "subs" || c.category === "clients") return "collaborators";
  return "contacts"; // personal or unknown
}

function badgeForContact(c: Contact): string | null {
  if (c.category === "internal") return c.role ?? null;
  if (c.category === "clients") return "Client";
  if (c.category === "subs") return "Subcontractor";
  if (c.source === "personal") return c.phone ? "📱" : null;
  return null;
}

// ── Component ──────────────────────────────────────────────────────

export function CallContactPicker({
  visible,
  onClose,
  onStartCall,
  calling = false,
  existingRoomId,
}: Props) {
  // API contacts
  const [apiContacts, setApiContacts] = useState<Contact[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Device contacts
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [deviceLoaded, setDeviceLoaded] = useState(false);

  // UI state
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualValue, setManualValue] = useState("");

  // ── Load API contacts on open ──────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setSelectedIds(new Set());
    setShowManualInput(false);
    setManualValue("");
    setApiError(null);
    loadApiContacts();
  }, [visible]);

  const loadApiContacts = useCallback(async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const list = await fetchContacts({ category: "all" });
      setApiContacts(list);
      if (list.length === 0) {
        setApiError("No contacts found. Make sure you're in the correct organization.");
      }
    } catch (err) {
      console.warn("[CallPicker] fetchContacts failed:", err);
      setApiContacts([]);
      setApiError(
        `Could not load contacts: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setApiLoading(false);
    }
  }, []);

  // ── Load device contacts (once, on first search miss) ──────────

  const loadDeviceContacts = useCallback(async () => {
    if (deviceLoaded) return;
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setDeviceLoaded(true);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
        ],
        sort: Contacts.SortTypes.FirstName,
      });

      const mapped: DeviceContact[] = data
        .filter(
          (c) =>
            c.firstName ||
            c.lastName ||
            c.emails?.length ||
            c.phoneNumbers?.length,
        )
        .map((c) => {
          const allEmails = (c.emails ?? [])
            .map((e) => e.email!)
            .filter(Boolean);
          const allPhones = (c.phoneNumbers ?? [])
            .map((p) => p.number!)
            .filter(Boolean);
          return {
            id: `device-${c.id}`,
            firstName: c.firstName ?? null,
            lastName: c.lastName ?? null,
            displayName:
              c.name ||
              [c.firstName, c.lastName].filter(Boolean).join(" ") ||
              allEmails[0] ||
              allPhones[0] ||
              "Unknown",
            email: allEmails[0] ?? null,
            phone: allPhones[0] ?? null,
            allEmails,
            allPhones,
          };
        });

      setDeviceContacts(mapped);
    } catch (err) {
      console.warn("[CallPicker] device contacts failed:", err);
    } finally {
      setDeviceLoaded(true);
    }
  }, [deviceLoaded]);

  // Trigger device contact load when user starts searching
  useEffect(() => {
    if (search.trim().length >= 2 && !deviceLoaded) {
      void loadDeviceContacts();
    }
  }, [search, deviceLoaded, loadDeviceContacts]);

  // ── Filtering & sectioning ─────────────────────────────────────

  const searchLower = search.trim().toLowerCase();

  const filteredApiContacts = useMemo(() => {
    if (!searchLower) return apiContacts;
    return apiContacts.filter((c) => {
      const text = [c.displayName, c.firstName, c.lastName, c.email, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(searchLower);
    });
  }, [apiContacts, searchLower]);

  // Deduplicate device contacts against API contacts by email/phone
  const filteredDeviceContacts = useMemo(() => {
    if (!searchLower || searchLower.length < 2) return [];

    const apiEmails = new Set(
      apiContacts
        .map((c) => c.email?.toLowerCase())
        .filter(Boolean) as string[],
    );
    const apiPhones = new Set(
      apiContacts
        .map((c) => c.phone?.replace(/\D/g, ""))
        .filter(Boolean) as string[],
    );

    return deviceContacts.filter((dc) => {
      // Skip if already in API results
      if (dc.email && apiEmails.has(dc.email.toLowerCase())) return false;
      if (dc.phone && apiPhones.has(dc.phone.replace(/\D/g, ""))) return false;

      const text = [dc.displayName, dc.firstName, dc.lastName, dc.email, dc.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(searchLower);
    });
  }, [deviceContacts, apiContacts, searchLower]);

  // Build SectionList data
  const sections = useMemo(() => {
    const groups: Record<SectionKey, PickerContact[]> = {
      team: [],
      collaborators: [],
      contacts: [],
      device: [],
    };

    for (const c of filteredApiContacts) {
      const key = categorizeContact(c);
      groups[key].push({ ...c, _source: "api" });
    }

    for (const dc of filteredDeviceContacts) {
      groups.device.push({ ...dc, _source: "device" });
    }

    return (Object.keys(groups) as SectionKey[])
      .filter((key) => groups[key].length > 0)
      .map((key) => ({
        key,
        title: `${SECTION_META[key].icon} ${SECTION_META[key].title}`,
        data: groups[key],
      }));
  }, [filteredApiContacts, filteredDeviceContacts]);

  // ── Selection ──────────────────────────────────────────────────

  const toggleContact = useCallback((id: string) => {
    void Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Call action ────────────────────────────────────────────────

  const handleCall = useCallback(() => {
    const selectedApi = apiContacts.filter((c) => selectedIds.has(c.id));
    const selectedDevice = deviceContacts.filter((dc) =>
      selectedIds.has(dc.id),
    );

    // Auto-import selected device contacts (fire-and-forget)
    if (selectedDevice.length > 0) {
      const toImport = selectedDevice.map((dc) => ({
        displayName: dc.displayName,
        firstName: dc.firstName,
        lastName: dc.lastName,
        email: dc.email,
        phone: dc.phone,
        allEmails: dc.allEmails,
        allPhones: dc.allPhones,
        source: "PHONE" as const,
      }));
      apiJson("/personal-contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: toImport }),
      }).catch(() => {});
    }

    onStartCall({
      apiContacts: selectedApi,
      deviceContacts: selectedDevice,
      manualEntry: manualValue.trim() || null,
    });
  }, [apiContacts, deviceContacts, selectedIds, manualValue, onStartCall]);

  // ── Render ─────────────────────────────────────────────────────

  const getName = (item: PickerContact): string => {
    if (item._source === "device") return item.displayName;
    return (
      item.displayName ||
      [item.firstName, item.lastName].filter(Boolean).join(" ") ||
      item.email ||
      "Unknown"
    );
  };

  const getBadge = (item: PickerContact): string | null => {
    if (item._source === "device") {
      return item.phone || item.email || null;
    }
    return badgeForContact(item);
  };

  const totalSelected =
    selectedIds.size + (manualValue.trim() ? 1 : 0);
  const callLabel = existingRoomId
    ? totalSelected > 0
      ? `Invite ${totalSelected} person${totalSelected > 1 ? "s" : ""}`
      : "Send Call Link"
    : totalSelected > 0
    ? `📞 Call ${totalSelected} person${totalSelected > 1 ? "s" : ""}`
    : "📞 Start Call";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {existingRoomId ? "Invite to Call" : "Start a Call"}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Search */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts…"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />

          {/* Contact list */}
          {apiLoading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginTop: 32 }}
            />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionCount}>
                    {section.data.length}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => {
                const name = getName(item);
                const badge = getBadge(item);
                const selected = selectedIds.has(item.id);
                return (
                  <Pressable
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => toggleContact(item.id)}
                  >
                    <View
                      style={[
                        styles.avatar,
                        selected && styles.avatarSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          selected && styles.avatarTextSelected,
                        ]}
                      >
                        {selected ? "✓" : name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                      </Text>
                      {badge && (
                        <Text style={styles.badge} numberOfLines={1}>
                          {badge}
                        </Text>
                      )}
                    </View>
                    {item._source === "device" && (
                      <Text style={styles.deviceIcon}>📱</Text>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {apiError ||
                      (searchLower
                        ? "No matches found"
                        : "No contacts found")}
                  </Text>
                </View>
              }
              ListFooterComponent={
                <View style={styles.footerContainer}>
                  {/* Send Call Link manual entry */}
                  {showManualInput ? (
                    <View style={styles.manualInputRow}>
                      <TextInput
                        style={styles.manualInput}
                        placeholder="Phone number or email…"
                        placeholderTextColor="#9ca3af"
                        value={manualValue}
                        onChangeText={setManualValue}
                        autoCorrect={false}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                    </View>
                  ) : (
                    <Pressable
                      style={styles.sendLinkBtn}
                      onPress={() => setShowManualInput(true)}
                    >
                      <Text style={styles.sendLinkIcon}>🔗</Text>
                      <Text style={styles.sendLinkText}>
                        Send Call Link
                      </Text>
                      <Text style={styles.sendLinkSub}>
                        Enter phone or email
                      </Text>
                    </Pressable>
                  )}
                </View>
              }
            />
          )}

          {/* Action button */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.callBtn, calling && { opacity: 0.6 }]}
              onPress={handleCall}
              disabled={calling}
            >
              {calling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.callBtnText}>{callLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  closeBtn: {
    fontSize: 22,
    color: "#6b7280",
    padding: 4,
  },
  searchInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    color: "#1f2937",
  },
  list: {
    paddingHorizontal: 20,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 12,
    color: "#9ca3af",
    marginLeft: 6,
  },

  // Contact rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  rowSelected: {
    backgroundColor: "#eff6ff",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarSelected: {
    backgroundColor: "#2563eb",
  },
  avatarText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "700",
  },
  avatarTextSelected: {
    color: "#fff",
  },
  name: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1f2937",
  },
  badge: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 1,
  },
  deviceIcon: {
    fontSize: 16,
    marginLeft: 8,
  },

  // Empty state
  emptyContainer: {
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 14,
  },

  // Footer: Send Call Link
  footerContainer: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  sendLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  sendLinkIcon: {
    fontSize: 20,
  },
  sendLinkText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  sendLinkSub: {
    fontSize: 12,
    color: "#9ca3af",
  },
  manualInputRow: {
    paddingVertical: 4,
  },
  manualInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
  },

  // Action button
  actions: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  callBtn: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  callBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
