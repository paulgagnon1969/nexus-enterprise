import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { fetchContacts } from "../api/contacts";
import type { Contact, ContactCategory } from "../types/api";

const CATEGORIES: { key: ContactCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "internal", label: "Team" },
  { key: "clients", label: "Clients" },
  { key: "subs", label: "Subs" },
];

export function DirectoryScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ContactCategory | "all">("all");
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      setError(null);
      const opts: { category?: ContactCategory; search?: string } = {};
      if (category !== "all") {
        opts.category = category;
      }
      const data = await fetchContacts(opts);
      setContacts(data);
    } catch (e) {
      console.error("Failed to load contacts:", e);
      setError(e instanceof Error ? e.message : "Failed to load contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    setLoading(true);
    loadContacts();
  }, [loadContacts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  }, [loadContacts]);

  // Filter contacts by search term
  const filteredContacts = contacts.filter((c) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const name = getDisplayName(c).toLowerCase();
    const comp = (c.company || "").toLowerCase();
    const role = (c.role || c.title || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    return (
      name.includes(term) ||
      comp.includes(term) ||
      role.includes(term) ||
      email.includes(term)
    );
  });

  const handleCall = (phone: string) => {
    const url = `tel:${phone.replace(/[^0-9+]/g, "")}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert("Cannot make call", "Phone calls are not supported on this device");
        }
      })
      .catch((err) => {
        console.error("Failed to open phone:", err);
        Alert.alert("Error", "Failed to open phone app");
      });
  };

  const handleEmail = (email: string) => {
    const url = `mailto:${email}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert("Cannot send email", "Email is not supported on this device");
        }
      })
      .catch((err) => {
        console.error("Failed to open email:", err);
        Alert.alert("Error", "Failed to open email app");
      });
  };

  const handleSms = (phone: string) => {
    const url = `sms:${phone.replace(/[^0-9+]/g, "")}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert("Cannot send SMS", "SMS is not supported on this device");
        }
      })
      .catch((err) => {
        console.error("Failed to open SMS:", err);
        Alert.alert("Error", "Failed to open messaging app");
      });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Directory</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
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

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            style={[styles.categoryTab, category === cat.key && styles.categoryTabActive]}
            onPress={() => setCategory(cat.key)}
          >
            <Text
              style={[
                styles.categoryTabText,
                category === cat.key && styles.categoryTabTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Contact list */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text style={styles.loadingText}>Loading contacts...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadContacts}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredContacts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>
              {search ? "No contacts match your search" : "No contacts found"}
            </Text>
          </View>
        ) : (
          filteredContacts.map((contact) => (
            <View key={contact.id} style={styles.contactCard}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{getDisplayName(contact)}</Text>
                {(contact.role || contact.title) && (
                  <Text style={styles.contactRole}>
                    {contact.role || contact.title}
                  </Text>
                )}
                {contact.company && (
                  <Text style={styles.contactCompany}>{contact.company}</Text>
                )}
                <View style={styles.categoryBadgeRow}>
                  <View
                    style={[
                      styles.categoryBadge,
                      contact.category === "internal" && styles.categoryBadgeInternal,
                      contact.category === "clients" && styles.categoryBadgeClients,
                      contact.category === "subs" && styles.categoryBadgeSubs,
                    ]}
                  >
                    <Text style={styles.categoryBadgeText}>
                      {contact.category === "internal"
                        ? "Team"
                        : contact.category === "clients"
                        ? "Client"
                        : contact.category === "subs"
                        ? "Sub"
                        : contact.category}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.contactActions}>
                {contact.phone && (
                  <>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => handleCall(contact.phone!)}
                    >
                      <Text style={styles.actionIcon}>📞</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => handleSms(contact.phone!)}
                    >
                      <Text style={styles.actionIcon}>💬</Text>
                    </Pressable>
                  </>
                )}
                {contact.email && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleEmail(contact.email!)}
                  >
                    <Text style={styles.actionIcon}>✉️</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function getDisplayName(contact: Contact): string {
  if (contact.displayName) return contact.displayName;
  if (contact.firstName || contact.lastName) {
    return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  }
  return contact.email || "Unknown";
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
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2937",
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
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 14,
    color: "#6b7280",
  },

  // Category tabs
  categoryScroll: {
    maxHeight: 44,
  },
  categoryContainer: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  categoryTabActive: {
    backgroundColor: "#1e3a8a",
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  categoryTabTextActive: {
    color: "#ffffff",
  },

  // List
  listContainer: {
    flex: 1,
    marginTop: 8,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
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
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#1e3a8a",
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "600",
  },

  // Contact card
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  contactRole: {
    fontSize: 13,
    color: "#6b7280",
  },
  contactCompany: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  categoryBadgeRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
  },
  categoryBadgeInternal: {
    backgroundColor: "#dbeafe",
  },
  categoryBadgeClients: {
    backgroundColor: "#dcfce7",
  },
  categoryBadgeSubs: {
    backgroundColor: "#fef3c7",
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },

  // Actions
  contactActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIcon: {
    fontSize: 18,
  },
});
