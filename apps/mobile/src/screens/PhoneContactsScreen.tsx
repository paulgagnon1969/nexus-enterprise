import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Contacts from "expo-contacts";
import { apiJson } from "../api/client";

type PhoneContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  allEmails: string[];
  allPhones: string[];
};

interface Props {
  onBack: () => void;
  onSynced?: () => void;
}

export function PhoneContactsScreen({ onBack, onSynced }: Props) {
  const [permissionStatus, setPermissionStatus] = useState<"undetermined" | "granted" | "denied">("undetermined");
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const requestAndLoad = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setPermissionStatus(status === "granted" ? "granted" : "denied");

      if (status !== "granted") {
        setLoading(false);
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

      const mapped: PhoneContact[] = data
        .filter((c) => c.firstName || c.lastName || c.emails?.length || c.phoneNumbers?.length)
        .map((c) => {
          const allEmails = (c.emails ?? []).map((e) => e.email!).filter(Boolean);
          const allPhones = (c.phoneNumbers ?? []).map((p) => p.number!).filter(Boolean);
          return {
            id: c.id!,
            firstName: c.firstName ?? null,
            lastName: c.lastName ?? null,
            displayName: c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || allEmails[0] || allPhones[0] || "Unknown",
            email: allEmails[0] ?? null,
            phone: allPhones[0] ?? null,
            allEmails,
            allPhones,
          };
        });

      setContacts(mapped);
    } catch (err) {
      console.error("Failed to load phone contacts:", err);
      Alert.alert("Error", "Failed to load phone contacts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestAndLoad();
  }, [requestAndLoad]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(filtered.map((c) => c.id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const term = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.displayName.toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term) ||
        (c.phone ?? "").includes(term),
    );
  }, [contacts, search]);

  const handleSync = useCallback(async () => {
    if (selected.size === 0) {
      Alert.alert("No contacts selected", "Select at least one contact to sync.");
      return;
    }

    setSyncing(true);
    try {
      const toSync = contacts
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          displayName: c.displayName,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          allEmails: c.allEmails,
          allPhones: c.allPhones,
          source: "PHONE",
        }));

      const result = await apiJson<{ count: number; createdCount: number; updatedCount: number }>(
        "/personal-contacts/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: toSync }),
        },
      );

      Alert.alert(
        "Contacts Synced",
        `${result.createdCount} added, ${result.updatedCount} updated.`,
        [{ text: "OK", onPress: () => { onSynced?.(); onBack(); } }],
      );
    } catch (err) {
      console.error("Failed to sync contacts:", err);
      Alert.alert("Sync Failed", err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setSyncing(false);
    }
  }, [selected, contacts, onBack, onSynced]);

  // Permission denied state
  if (!loading && permissionStatus === "denied") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Phone Contacts</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyText}>
            Contacts access was denied. Go to Settings → Nexus Mobile to enable contacts.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Phone Contacts</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1e3a8a" />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : (
        <>
          {/* Search */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search phone contacts..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable style={styles.clearBtn} onPress={() => setSearch("")}>
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* Bulk actions */}
          <View style={styles.bulkRow}>
            <Text style={styles.selectedCount}>
              {selected.size} of {filtered.length} selected
            </Text>
            <View style={styles.bulkActions}>
              <Pressable onPress={selectAll} style={styles.bulkBtn}>
                <Text style={styles.bulkBtnText}>Select All</Text>
              </Pressable>
              {selected.size > 0 && (
                <Pressable onPress={clearSelection} style={styles.bulkBtn}>
                  <Text style={styles.bulkBtnText}>Clear</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Contact list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              return (
                <Pressable
                  style={[styles.contactRow, isSelected && styles.contactRowSelected]}
                  onPress={() => toggleSelect(item.id)}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{item.displayName}</Text>
                    {item.email && <Text style={styles.contactDetail}>{item.email}</Text>}
                    {item.phone && <Text style={styles.contactDetail}>{item.phone}</Text>}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No contacts found</Text>
              </View>
            }
          />

          {/* Sync button */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.syncBtn, (selected.size === 0 || syncing) && styles.syncBtnDisabled]}
              onPress={handleSync}
              disabled={selected.size === 0 || syncing}
            >
              {syncing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.syncBtnText}>
                  Sync {selected.size} Contact{selected.size !== 1 ? "s" : ""} to NCC
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    fontSize: 16,
    color: "#1e3a8a",
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1f2937",
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },
  clearBtnText: { fontSize: 14, color: "#6b7280" },

  // Bulk
  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  selectedCount: {
    fontSize: 13,
    color: "#6b7280",
  },
  bulkActions: {
    flexDirection: "row",
    gap: 12,
  },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  bulkBtnText: {
    fontSize: 13,
    color: "#1e3a8a",
    fontWeight: "600",
  },

  // List
  list: { flex: 1 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  contactRowSelected: {
    backgroundColor: "#eff6ff",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: "#1e3a8a",
    borderColor: "#1e3a8a",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  contactInfo: { flex: 1 },
  contactName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
  },
  contactDetail: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 1,
  },

  // Footer
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  syncBtn: {
    backgroundColor: "#1e3a8a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
