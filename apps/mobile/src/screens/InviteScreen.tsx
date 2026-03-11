import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { apiJson } from "../api/client";
import { fetchContacts } from "../api/contacts";
import { getUserMe } from "../api/user";
import { sendBulkShareInvites } from "../api/shareInvite";
import type { Contact, ContactCategory, ApiRole, ApiGlobalRole } from "../types/api";

type InviteMode = "company" | "referral" | "cam" | "master_class";

const OWNER_PLUS_ROLES: Array<ApiRole | string> = ["OWNER"];
const OWNER_PLUS_GLOBAL: Array<ApiGlobalRole | string> = ["SUPER_ADMIN"];

interface Props {
  onBack: () => void;
  /** Pre-selected contact IDs (from directory selection) */
  preselectedIds?: string[];
}

export function InviteScreen({ onBack, preselectedIds }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(preselectedIds ?? []));
  const [mode, setMode] = useState<InviteMode>("company");
  const [isOwnerPlus, setIsOwnerPlus] = useState(false);

  useEffect(() => {
    getUserMe()
      .then((me) => {
        const globalMatch = OWNER_PLUS_GLOBAL.includes(me.globalRole ?? "");
        const roleMatch = me.memberships?.some((m) => OWNER_PLUS_ROLES.includes(m.role)) ?? false;
        setIsOwnerPlus(globalMatch || roleMatch);
      })
      .catch(() => setIsOwnerPlus(false));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchContacts({ includePersonal: true });
        setContacts(data);
      } catch (err) {
        console.error("Failed to load contacts for invite:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const term = search.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.displayName ?? "").toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term) ||
        (c.phone ?? "").includes(term),
    );
  }, [contacts, search]);

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selected.has(c.id)),
    [contacts, selected],
  );

  const handleSendInvites = useCallback(async () => {
    if (selectedContacts.length === 0) {
      Alert.alert("No contacts selected", "Select at least one contact to invite.");
      return;
    }

    // Check that all selected have an email
    const missing = selectedContacts.filter((c) => !c.email);
    if (missing.length > 0) {
      Alert.alert(
        "Missing emails",
        `${missing.length} contact(s) don't have an email address. Only contacts with email can be invited.`,
      );
      return;
    }

    setSending(true);
    let success = 0;
    let failed = 0;

    try {
      if (mode === "cam" || mode === "master_class") {
        // CAM / Master Class bulk invite
        const recipients = selectedContacts
          .filter((c) => c.email)
          .map((c) => ({
            email: c.email!,
            name: c.displayName ?? undefined,
            phone: c.phone ?? undefined,
          }));
        const result = await sendBulkShareInvites({
          recipients,
          deliveryMethods: ["email"],
          inviteType: mode === "master_class" ? "master_class" : "cam",
        });
        success = result.sent;
        failed = result.failed;
      } else {
        for (const contact of selectedContacts) {
          try {
            if (mode === "company") {
              await apiJson("/companies/me/invites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: contact.email,
                  role: "MEMBER",
                  channel: "email",
                }),
              });
            } else {
              await apiJson("/referrals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prospectName: contact.displayName,
                  prospectEmail: contact.email,
                  prospectPhone: contact.phone,
                }),
              });
            }
            success++;
          } catch (err) {
            console.error(`Failed to invite ${contact.email}:`, err);
            failed++;
          }
        }
      }

      const label = mode === "cam" ? "CAM invite" : mode === "master_class" ? "Master Class invite" : mode === "company" ? "invite" : "referral";
      if (failed === 0) {
        Alert.alert("Done", `${success} ${label}(s) sent successfully.`, [
          { text: "OK", onPress: onBack },
        ]);
      } else {
        Alert.alert(
          "Partial Success",
          `${success} sent, ${failed} failed. Check your connection and retry failed invites.`,
        );
      }
    } finally {
      setSending(false);
    }
  }, [selectedContacts, mode, onBack]);

  const handleShareLink = useCallback(async () => {
    if (selectedContacts.length === 0) {
      Alert.alert("No contacts selected", "Select at least one contact to share with.");
      return;
    }

    setSending(true);
    try {
      // Create a share link invite (skips email delivery, returns URL)
      const firstContact = selectedContacts[0];
      if (!firstContact.email) {
        Alert.alert("No email", "The selected contact needs an email to generate an invite link.");
        return;
      }

      const result = await apiJson<{ acceptUrl: string; companyName: string }>(
        "/companies/me/invites",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: firstContact.email,
            role: "MEMBER",
            channel: "share_link",
          }),
        },
      );

      const names = selectedContacts.map((c) => c.displayName ?? c.email).join(", ");
      await Share.share({
        title: `Join ${result.companyName} on NEXUS`,
        message: `You're invited to join ${result.companyName} on NEXUS! Accept here: ${result.acceptUrl}`,
        url: result.acceptUrl,
      });
    } catch (err) {
      console.error("Failed to share invite:", err);
      if (err instanceof Error && !err.message.includes("dismissed")) {
        Alert.alert("Error", err.message);
      }
    } finally {
      setSending(false);
    }
  }, [selectedContacts]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Invite</Text>
      </View>

      {/* Mode selector */}
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeBtn, mode === "company" && styles.modeBtnActive]}
          onPress={() => setMode("company")}
        >
          <Text style={[styles.modeBtnText, mode === "company" && styles.modeBtnTextActive]}>
            Company
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeBtn, mode === "referral" && styles.modeBtnActive]}
          onPress={() => setMode("referral")}
        >
          <Text style={[styles.modeBtnText, mode === "referral" && styles.modeBtnTextActive]}>
            Referral
          </Text>
        </Pressable>
        {isOwnerPlus && (
          <>
            <Pressable
              style={[styles.modeBtn, mode === "cam" && styles.modeBtnActive]}
              onPress={() => setMode("cam")}
            >
              <Text style={[styles.modeBtnText, mode === "cam" && styles.modeBtnTextActive]}>
                🏆 CAM
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === "master_class" && styles.modeBtnActive]}
              onPress={() => setMode("master_class")}
            >
              <Text style={[styles.modeBtnText, mode === "master_class" && styles.modeBtnTextActive]}>
                🎓 Class
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.modeDescription}>
        {mode === "company"
          ? "Invite contacts to join your company on NEXUS. They'll get an email with an accept link."
          : mode === "referral"
          ? "Refer contacts to the NEXUS workforce network. Great for finding talent."
          : mode === "cam"
          ? "Send a private CAM Library invite. Each recipient gets their own unique access link."
          : "Send a Master Class invite. Each recipient gets their own unique access link."}
      </Text>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts to invite..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1e3a8a" />
        </View>
      ) : (
        <>
          {/* Contact list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              const hasEmail = !!item.email;
              return (
                <Pressable
                  style={[
                    styles.contactRow,
                    isSelected && styles.contactRowSelected,
                    !hasEmail && styles.contactRowDisabled,
                  ]}
                  onPress={() => hasEmail && toggleSelect(item.id)}
                  disabled={!hasEmail}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactName, !hasEmail && styles.textDisabled]}>
                      {item.displayName ?? "Unknown"}
                    </Text>
                    {item.email ? (
                      <Text style={styles.contactDetail}>{item.email}</Text>
                    ) : (
                      <Text style={styles.noEmail}>No email — cannot invite</Text>
                    )}
                    {item.phone && <Text style={styles.contactDetail}>{item.phone}</Text>}
                  </View>
                  <View
                    style={[
                      styles.sourceDot,
                      item.source === "ncc" ? styles.sourceDotNcc : styles.sourceDotPersonal,
                    ]}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No contacts found</Text>
              </View>
            }
          />

          {/* Action buttons */}
          <View style={styles.footer}>
            <Text style={styles.selectedLabel}>
              {selected.size} contact{selected.size !== 1 ? "s" : ""} selected
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.sendBtn, (selected.size === 0 || sending) && styles.btnDisabled]}
                onPress={handleSendInvites}
                disabled={selected.size === 0 || sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendBtnText}>
                    {mode === "company" ? "Send Invites" : "Send Referrals"}
                  </Text>
                )}
              </Pressable>
              {mode === "company" && (
                <Pressable
                  style={[styles.shareBtn, (selected.size === 0 || sending) && styles.btnDisabled]}
                  onPress={handleShareLink}
                  disabled={selected.size === 0 || sending}
                >
                  <Text style={styles.shareBtnText}>Share Link</Text>
                </Pressable>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
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
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backText: { fontSize: 16, color: "#1e3a8a", fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700", color: "#1f2937" },

  // Mode selector
  modeRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: "#1e3a8a" },
  modeBtnText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  modeBtnTextActive: { color: "#ffffff" },
  modeDescription: {
    fontSize: 13,
    color: "#6b7280",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 8,
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

  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 15, color: "#6b7280" },

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
  contactRowSelected: { backgroundColor: "#eff6ff" },
  contactRowDisabled: { opacity: 0.5 },
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
  checkboxSelected: { backgroundColor: "#1e3a8a", borderColor: "#1e3a8a" },
  checkmark: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: "600", color: "#1f2937" },
  textDisabled: { color: "#9ca3af" },
  contactDetail: { fontSize: 13, color: "#6b7280", marginTop: 1 },
  noEmail: { fontSize: 12, color: "#dc2626", fontStyle: "italic", marginTop: 1 },
  sourceDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  sourceDotNcc: { backgroundColor: "#1e3a8a" },
  sourceDotPersonal: { backgroundColor: "#8b5cf6" },

  // Footer
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  selectedLabel: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  sendBtn: {
    flex: 1,
    backgroundColor: "#1e3a8a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  sendBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  shareBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  shareBtnText: { color: "#1e3a8a", fontSize: 14, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
});
