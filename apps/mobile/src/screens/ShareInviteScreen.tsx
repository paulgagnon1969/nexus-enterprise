import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from "react-native";
import * as Contacts from "expo-contacts";
import {
  sendBulkShareInvites,
  fetchMyShareInvites,
  type MyShareInvite,
} from "../api/shareInvite";

type InviteType = "cam" | "master_class";
type DeliveryMethod = "email" | "sms";

interface Recipient {
  id: string;
  name: string;
  email: string;
  phone: string;
}

let recipientIdSeq = 0;
function nextId() {
  return `r-${++recipientIdSeq}`;
}

interface Props {
  onBack: () => void;
}

export function ShareInviteScreen({ onBack }: Props) {
  const [inviteType, setInviteType] = useState<InviteType>("cam");
  const [message, setMessage] = useState("");
  const [deliveryEmail, setDeliveryEmail] = useState(true);
  const [deliverySms, setDeliverySms] = useState(false);
  const [sending, setSending] = useState(false);

  // Multi-recipient list
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Current entry fields
  const [entryName, setEntryName] = useState("");
  const [entryEmail, setEntryEmail] = useState("");
  const [entryPhone, setEntryPhone] = useState("");

  const emailRef = useRef<TextInput>(null);

  // Phone contacts picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<
    Array<{ id: string; name: string; email: string; phone: string }>
  >([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());

  // Recent invites
  const [recentInvites, setRecentInvites] = useState<MyShareInvite[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    fetchMyShareInvites()
      .then(setRecentInvites)
      .catch((err) => console.error("Failed to load share invites:", err))
      .finally(() => setLoadingRecent(false));
  }, []);

  const openContactsPicker = useCallback(async () => {
    setPickerLoading(true);
    setPickerVisible(true);
    setPickerSearch("");
    setPickerSelected(new Set());
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Contacts Access Denied",
          "Go to Settings → Nexus Mobile to enable contacts.",
        );
        setPickerVisible(false);
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
      const mapped = data
        .filter((c) => c.emails?.length) // must have email for invite
        .map((c) => {
          const emails = (c.emails ?? []).map((e) => e.email!).filter(Boolean);
          const phones = (c.phoneNumbers ?? []).map((p) => p.number!).filter(Boolean);
          const name =
            c.name ||
            [c.firstName, c.lastName].filter(Boolean).join(" ") ||
            emails[0] ||
            "Unknown";
          return {
            id: c.id!,
            name,
            email: emails[0] ?? "",
            phone: phones[0] ?? "",
          };
        })
        .filter((c) => c.email); // safety filter
      setPhoneContacts(mapped);
    } catch (err) {
      console.error("Failed to load phone contacts:", err);
      Alert.alert("Error", "Failed to load phone contacts.");
      setPickerVisible(false);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const filteredPhoneContacts = useMemo(() => {
    if (!pickerSearch.trim()) return phoneContacts;
    const term = pickerSearch.toLowerCase();
    return phoneContacts.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.phone.includes(term),
    );
  }, [phoneContacts, pickerSearch]);

  const togglePickerContact = useCallback((id: string) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirmPickerSelection = useCallback(() => {
    const existingEmails = new Set(recipients.map((r) => r.email));
    const newRecipients = phoneContacts
      .filter((c) => pickerSelected.has(c.id) && !existingEmails.has(c.email.toLowerCase()))
      .map((c) => ({
        id: nextId(),
        name: c.name,
        email: c.email.toLowerCase(),
        phone: c.phone,
      }));

    if (newRecipients.length === 0 && pickerSelected.size > 0) {
      Alert.alert("Already added", "All selected contacts are already in the list.");
    } else {
      setRecipients((prev) => [...prev, ...newRecipients]);
    }
    setPickerVisible(false);
  }, [phoneContacts, pickerSelected, recipients]);

  const addRecipient = useCallback(() => {
    const email = entryEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert("Email required", "Enter the recipient's email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    if (recipients.some((r) => r.email === email)) {
      Alert.alert("Duplicate", "This email is already in the list.");
      return;
    }

    setRecipients((prev) => [
      ...prev,
      { id: nextId(), name: entryName.trim(), email, phone: entryPhone.trim() },
    ]);
    setEntryName("");
    setEntryEmail("");
    setEntryPhone("");
    emailRef.current?.focus();
  }, [entryName, entryEmail, entryPhone, recipients]);

  const removeRecipient = useCallback((id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSendAll = useCallback(async () => {
    if (recipients.length === 0) {
      Alert.alert("No recipients", "Add at least one recipient before sending.");
      return;
    }
    if (!deliveryEmail && !deliverySms) {
      Alert.alert("Delivery method", "Select at least one delivery method.");
      return;
    }

    const methods: DeliveryMethod[] = [];
    if (deliveryEmail) methods.push("email");
    if (deliverySms) methods.push("sms");

    setSending(true);
    try {
      const result = await sendBulkShareInvites({
        recipients: recipients.map((r) => ({
          email: r.email,
          name: r.name || undefined,
          phone: r.phone || undefined,
        })),
        deliveryMethods: methods,
        message: message.trim() || undefined,
        inviteType,
      });

      const label = inviteType === "cam" ? "CAM Library" : "Master Class";
      if (result.failed === 0) {
        Alert.alert(
          "All Sent",
          `${result.sent} ${label} invite${result.sent !== 1 ? "s" : ""} sent.\nEach recipient received their own private invite link.`,
          [
            { text: "Send More", onPress: () => { setRecipients([]); setMessage(""); } },
            { text: "Done", onPress: onBack },
          ],
        );
      } else {
        Alert.alert(
          "Partial Success",
          `${result.sent} sent, ${result.failed} failed.\nEach successful recipient has their own private invite.`,
        );
      }

      // Refresh recent list
      fetchMyShareInvites().then(setRecentInvites).catch(() => {});
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to send invites.");
    } finally {
      setSending(false);
    }
  }, [recipients, inviteType, message, deliveryEmail, deliverySms, onBack]);

  const handleShareLink = useCallback(async () => {
    if (recipients.length === 0) {
      Alert.alert("No recipients", "Add at least one recipient to generate share links.");
      return;
    }

    setSending(true);
    try {
      const result = await sendBulkShareInvites({
        recipients: recipients.map((r) => ({
          email: r.email,
          name: r.name || undefined,
          phone: r.phone || undefined,
        })),
        deliveryMethods: ["email"],
        message: message.trim() || undefined,
        inviteType,
      });

      const firstSuccess = result.results.find((r) => r.success && r.shareUrl);
      if (!firstSuccess?.shareUrl) {
        Alert.alert("Error", "No share link was generated.");
        return;
      }

      const label = inviteType === "cam" ? "Nexus CAM Library" : "Nexus Master Class";
      if (recipients.length === 1) {
        // Single recipient — share their specific link
        await Share.share({
          title: `${label} Invitation`,
          message: `You're invited to view the ${label}. Access here: ${firstSuccess.shareUrl}`,
          url: firstSuccess.shareUrl,
        });
      } else {
        // Multiple — each already got their own link via email
        Alert.alert(
          "Links Sent",
          `${result.sent} individual invite${result.sent !== 1 ? "s" : ""} sent via email.\nEach person received their own private access link — no shared group link.`,
        );
      }
    } catch (err: any) {
      if (err instanceof Error && !err.message.includes("dismissed")) {
        Alert.alert("Error", err?.message || "Failed to generate share links.");
      }
    } finally {
      setSending(false);
    }
  }, [recipients, inviteType, message]);

  const statusColors: Record<string, string> = {
    pending: "#9ca3af",
    opened: "#f59e0b",
    cnda_accepted: "#3b82f6",
    viewing: "#10b981",
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Share Invite</Text>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Type toggle */}
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, inviteType === "cam" && styles.modeBtnActive]}
            onPress={() => setInviteType("cam")}
          >
            <Text style={[styles.modeBtnText, inviteType === "cam" && styles.modeBtnTextActive]}>
              🏆 CAM Library
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, inviteType === "master_class" && styles.modeBtnActive]}
            onPress={() => setInviteType("master_class")}
          >
            <Text
              style={[
                styles.modeBtnText,
                inviteType === "master_class" && styles.modeBtnTextActive,
              ]}
            >
              🎓 Master Class
            </Text>
          </Pressable>
        </View>

        <Text style={styles.modeDescription}>
          {inviteType === "cam"
            ? "Each recipient gets their own private invite link and token. No one sees another recipient's info."
            : "Each recipient gets their own private Master Class invite. Identity is never shared between invitees."}
        </Text>

        {/* ── Recipient entry ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            Add Recipients ({recipients.length})
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#9ca3af"
            value={entryName}
            onChangeText={setEntryName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="Email *"
            placeholderTextColor="#9ca3af"
            value={entryEmail}
            onChangeText={setEntryEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (optional — for SMS)"
            placeholderTextColor="#9ca3af"
            value={entryPhone}
            onChangeText={setEntryPhone}
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={addRecipient}
          />
          <View style={styles.entryActions}>
            <Pressable style={styles.addBtn} onPress={addRecipient}>
              <Text style={styles.addBtnText}>+ Add Manually</Text>
            </Pressable>
            <Pressable style={styles.contactsBtn} onPress={openContactsPicker}>
              <Text style={styles.contactsBtnText}>📱 From Contacts</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Recipient list ───────────────────────────────────────── */}
        {recipients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Recipients</Text>
            {recipients.map((r) => (
              <View key={r.id} style={styles.recipientRow}>
                <View style={styles.recipientInfo}>
                  <Text style={styles.recipientName}>{r.name || r.email}</Text>
                  {r.name ? (
                    <Text style={styles.recipientDetail}>{r.email}</Text>
                  ) : null}
                  {r.phone ? (
                    <Text style={styles.recipientDetail}>{r.phone}</Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removeRecipient(r.id)}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ── Delivery method ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Delivery Method</Text>
          <View style={styles.deliveryRow}>
            <Pressable
              style={[styles.deliveryChip, deliveryEmail && styles.deliveryChipActive]}
              onPress={() => setDeliveryEmail(!deliveryEmail)}
            >
              <Text
                style={[
                  styles.deliveryChipText,
                  deliveryEmail && styles.deliveryChipTextActive,
                ]}
              >
                ✉️ Email
              </Text>
            </Pressable>
            <Pressable
              style={[styles.deliveryChip, deliverySms && styles.deliveryChipActive]}
              onPress={() => setDeliverySms(!deliverySms)}
            >
              <Text
                style={[styles.deliveryChipText, deliverySms && styles.deliveryChipTextActive]}
              >
                💬 SMS
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Personal message ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Personal Message (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Add a personal note — included in every invite..."
            placeholderTextColor="#9ca3af"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* ── Privacy notice ───────────────────────────────────────── */}
        <View style={styles.privacyNotice}>
          <Text style={styles.privacyText}>
            🔒 Each recipient receives their own unique token and email. No
            recipient can see any other invitee's name, email, or identity.
          </Text>
        </View>

        {/* ── Action buttons ───────────────────────────────────────── */}
        <View style={styles.actionRow}>
          <Pressable
            style={[
              styles.sendBtn,
              (sending || recipients.length === 0) && styles.btnDisabled,
            ]}
            onPress={handleSendAll}
            disabled={sending || recipients.length === 0}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>
                Send {recipients.length > 0 ? `(${recipients.length})` : ""}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={[
              styles.shareBtn,
              (sending || recipients.length === 0) && styles.btnDisabled,
            ]}
            onPress={handleShareLink}
            disabled={sending || recipients.length === 0}
          >
            <Text style={styles.shareBtnText}>Share Link</Text>
          </Pressable>
        </View>

        {/* ── Recent invites ───────────────────────────────────────── */}
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent Invites</Text>
          {loadingRecent ? (
            <ActivityIndicator size="small" color="#1e3a8a" style={{ marginTop: 12 }} />
          ) : recentInvites.length === 0 ? (
            <Text style={styles.emptyText}>No invites sent yet.</Text>
          ) : (
            recentInvites.slice(0, 20).map((inv) => (
              <View key={inv.id} style={styles.recentRow}>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>
                    {inv.recipientName || inv.recipientEmail || "Unknown"}
                  </Text>
                  <Text style={styles.recentMeta}>
                    {inv.type === "master_class" ? "🎓 Master Class" : "🏆 CAM Library"}
                    {"  ·  "}
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (statusColors[inv.status] || "#9ca3af") + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: statusColors[inv.status] || "#9ca3af" },
                    ]}
                  >
                    {inv.status.replace("_", " ")}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      {/* ── Phone contacts picker modal ────────────────────────── */}
      <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Pressable onPress={() => setPickerVisible(false)} style={styles.pickerCancel}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.pickerTitle}>Phone Contacts</Text>
            <Pressable
              onPress={confirmPickerSelection}
              style={[styles.pickerDone, pickerSelected.size === 0 && styles.btnDisabled]}
              disabled={pickerSelected.size === 0}
            >
              <Text style={styles.pickerDoneText}>
                Add ({pickerSelected.size})
              </Text>
            </Pressable>
          </View>

          <View style={styles.pickerSearchWrap}>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search contacts..."
              placeholderTextColor="#9ca3af"
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {pickerLoading ? (
            <View style={styles.pickerCentered}>
              <ActivityIndicator size="large" color="#1e3a8a" />
              <Text style={styles.pickerLoadingText}>Loading contacts...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredPhoneContacts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = pickerSelected.has(item.id);
                const alreadyAdded = recipients.some(
                  (r) => r.email === item.email.toLowerCase(),
                );
                return (
                  <Pressable
                    style={[
                      styles.pickerRow,
                      isSelected && styles.pickerRowSelected,
                      alreadyAdded && styles.pickerRowDisabled,
                    ]}
                    onPress={() => !alreadyAdded && togglePickerContact(item.id)}
                    disabled={alreadyAdded}
                  >
                    <View
                      style={[
                        styles.pickerCheck,
                        isSelected && styles.pickerCheckSelected,
                      ]}
                    >
                      {isSelected && <Text style={styles.pickerCheckMark}>✓</Text>}
                    </View>
                    <View style={styles.pickerInfo}>
                      <Text
                        style={[
                          styles.pickerName,
                          alreadyAdded && styles.pickerTextDim,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.pickerDetail}>{item.email}</Text>
                      {item.phone ? (
                        <Text style={styles.pickerDetail}>{item.phone}</Text>
                      ) : null}
                    </View>
                    {alreadyAdded && (
                      <Text style={styles.pickerAlready}>Added</Text>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.pickerCentered}>
                  <Text style={styles.pickerEmptyText}>
                    No contacts with email addresses found.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  scroll: { flex: 1 },

  // Type toggle
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

  // Sections
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1f2937",
    marginBottom: 8,
  },
  multiline: { minHeight: 80 },

  // Entry action buttons
  entryActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  addBtn: {
    flex: 1,
    backgroundColor: "#dbeafe",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  addBtnText: { fontSize: 14, fontWeight: "700", color: "#1e3a8a" },
  contactsBtn: {
    flex: 1,
    backgroundColor: "#f0fdf4",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  contactsBtnText: { fontSize: 14, fontWeight: "700", color: "#059669" },

  // Recipient list
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  recipientInfo: { flex: 1 },
  recipientName: { fontSize: 14, fontWeight: "600", color: "#1f2937" },
  recipientDetail: { fontSize: 12, color: "#6b7280", marginTop: 1 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  removeBtnText: { fontSize: 13, fontWeight: "700", color: "#dc2626" },

  // Delivery
  deliveryRow: { flexDirection: "row", gap: 10 },
  deliveryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  deliveryChipActive: { backgroundColor: "#dbeafe" },
  deliveryChipText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  deliveryChipTextActive: { color: "#1e3a8a" },

  // Privacy notice
  privacyNotice: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  privacyText: { fontSize: 12, color: "#1e40af", lineHeight: 18 },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 16,
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

  // Recent invites
  recentSection: { marginTop: 28, paddingHorizontal: 16, paddingBottom: 40 },
  recentTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  emptyText: { fontSize: 14, color: "#9ca3af", textAlign: "center", marginTop: 8 },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  recentInfo: { flex: 1 },
  recentName: { fontSize: 14, fontWeight: "600", color: "#1f2937" },
  recentMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },

  // ── Phone contacts picker modal ──────────────────────────────────
  pickerContainer: { flex: 1, backgroundColor: "#ffffff" },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  pickerCancel: { paddingVertical: 4 },
  pickerCancelText: { fontSize: 16, color: "#6b7280", fontWeight: "600" },
  pickerTitle: { fontSize: 18, fontWeight: "700", color: "#1f2937" },
  pickerDone: { paddingVertical: 4 },
  pickerDoneText: { fontSize: 16, color: "#1e3a8a", fontWeight: "700" },
  pickerSearchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pickerSearchInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
  },
  pickerCentered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  pickerLoadingText: { fontSize: 14, color: "#6b7280", marginTop: 12 },
  pickerEmptyText: { fontSize: 15, color: "#6b7280" },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  pickerRowSelected: { backgroundColor: "#eff6ff" },
  pickerRowDisabled: { opacity: 0.45 },
  pickerCheck: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pickerCheckSelected: { backgroundColor: "#1e3a8a", borderColor: "#1e3a8a" },
  pickerCheckMark: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  pickerInfo: { flex: 1 },
  pickerName: { fontSize: 15, fontWeight: "600", color: "#1f2937" },
  pickerTextDim: { color: "#9ca3af" },
  pickerDetail: { fontSize: 13, color: "#6b7280", marginTop: 1 },
  pickerAlready: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
  },
});
