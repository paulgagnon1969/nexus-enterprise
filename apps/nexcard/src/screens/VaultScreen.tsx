import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import * as Crypto from "expo-crypto";
import { colors } from "../theme/colors";
import {
  getAllVaultCredentials,
  upsertVaultCredential,
  deleteVaultCredential,
  type VaultCredential,
} from "../db/database";
import {
  ensureVaultUnlocked,
  isVaultUnlocked,
  lockVault,
  encrypt,
  decrypt,
  getBiometricTypeName,
} from "../services/vault";

// ── Constants ───────────────────────────────────────────────

const CATEGORIES = ["general", "banking", "email", "social", "work", "shopping", "crypto", "other"];

// ── Types ───────────────────────────────────────────────────

interface CredentialForm {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
}

const EMPTY_FORM: CredentialForm = {
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  category: "general",
};

// ── Main Component ──────────────────────────────────────────

export function VaultScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CredentialForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [biometricName, setBiometricName] = useState("Biometric");

  // Check initial unlock state
  useEffect(() => {
    setUnlocked(isVaultUnlocked());
    getBiometricTypeName().then(setBiometricName);
  }, []);

  const loadCredentials = useCallback(async () => {
    const creds = await getAllVaultCredentials(search || undefined);
    setCredentials(creds);
  }, [search]);

  useEffect(() => {
    if (unlocked) loadCredentials();
  }, [unlocked, loadCredentials]);

  // ── Unlock ────────────────────────────────────────────────

  const handleUnlock = async () => {
    const ok = await ensureVaultUnlocked();
    setUnlocked(ok);
    if (ok) loadCredentials();
  };

  const handleLock = () => {
    lockVault();
    setUnlocked(false);
    setCredentials([]);
    setRevealedId(null);
    setRevealedPassword(null);
  };

  // ── CRUD ──────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert("Required", "Enter a title for this credential.");
      return;
    }
    if (!form.password) {
      Alert.alert("Required", "Enter a password.");
      return;
    }

    const encryptedPassword = await encrypt(form.password);
    const now = new Date().toISOString();

    const cred: VaultCredential = {
      id: editingId ?? (await generateId()),
      title: form.title.trim(),
      username: form.username.trim(),
      encryptedPassword,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
      category: form.category,
      createdAt: editingId ? credentials.find((c) => c.id === editingId)?.createdAt ?? now : now,
      updatedAt: now,
    };

    await upsertVaultCredential(cred);
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowPassword(false);
    await loadCredentials();
  };

  const handleEdit = async (cred: VaultCredential) => {
    const ok = await ensureVaultUnlocked();
    if (!ok) return;

    const password = await decrypt(cred.encryptedPassword);
    setForm({
      title: cred.title,
      username: cred.username,
      password,
      url: cred.url ?? "",
      notes: cred.notes ?? "",
      category: cred.category,
    });
    setEditingId(cred.id);
    setShowPassword(false);
    setModalVisible(true);
  };

  const handleDelete = (cred: VaultCredential) => {
    Alert.alert("Delete Credential", `Delete "${cred.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteVaultCredential(cred.id);
          await loadCredentials();
        },
      },
    ]);
  };

  const handleRevealPassword = async (cred: VaultCredential) => {
    if (revealedId === cred.id) {
      setRevealedId(null);
      setRevealedPassword(null);
      return;
    }

    const ok = await ensureVaultUnlocked();
    if (!ok) return;

    const password = await decrypt(cred.encryptedPassword);
    setRevealedId(cred.id);
    setRevealedPassword(password);

    // Auto-hide after 10 seconds
    setTimeout(() => {
      setRevealedId((current) => (current === cred.id ? null : current));
      setRevealedPassword((current) => (current !== null && revealedId === cred.id ? null : current));
    }, 10000);
  };

  const handleCopyPassword = async (cred: VaultCredential) => {
    const ok = await ensureVaultUnlocked();
    if (!ok) return;

    const password = await decrypt(cred.encryptedPassword);
    // React Native Clipboard (basic — password is in memory briefly)
    const { setStringAsync } = await import("expo-clipboard");
    await setStringAsync(password);
    Alert.alert("Copied", "Password copied to clipboard. It will clear in 30 seconds.");

    // Clear clipboard after 30 seconds
    setTimeout(async () => {
      const { setStringAsync: clear } = await import("expo-clipboard");
      await clear("");
    }, 30000);
  };

  const handleGeneratePassword = async () => {
    const bytes = await Crypto.getRandomBytesAsync(24);
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
    let password = "";
    for (const b of bytes) {
      password += chars[b % chars.length];
    }
    setForm((f) => ({ ...f, password }));
    setShowPassword(true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCredentials();
    setRefreshing(false);
  }, [loadCredentials]);

  // ── Locked State ──────────────────────────────────────────

  if (!unlocked) {
    return (
      <View style={styles.lockedContainer}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockedTitle}>Vault Locked</Text>
        <Text style={styles.lockedSubtitle}>
          Use {biometricName} to unlock your password vault
        </Text>
        <TouchableOpacity style={styles.unlockButton} onPress={handleUnlock} activeOpacity={0.8}>
          <Text style={styles.unlockButtonText}>Unlock Vault</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Credential Row ────────────────────────────────────────

  const renderCredential = ({ item }: { item: VaultCredential }) => {
    const isRevealed = revealedId === item.id;
    return (
      <TouchableOpacity
        style={styles.credCard}
        onPress={() => handleEdit(item)}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.7}
      >
        <View style={styles.credHeader}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{item.category}</Text>
          </View>
          <Text style={styles.credDate}>
            {new Date(item.updatedAt).toLocaleDateString()}
          </Text>
        </View>

        <Text style={styles.credTitle}>{item.title}</Text>
        {item.username ? (
          <Text style={styles.credUsername}>{item.username}</Text>
        ) : null}

        <View style={styles.credActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleRevealPassword(item)}
          >
            <Text style={styles.actionText}>{isRevealed ? "Hide" : "Reveal"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleCopyPassword(item)}
          >
            <Text style={styles.actionText}>Copy</Text>
          </TouchableOpacity>
        </View>

        {isRevealed && revealedPassword && (
          <View style={styles.revealedBox}>
            <Text style={styles.revealedText} selectable>{revealedPassword}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Main Render ───────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Search + Lock */}
      <View style={styles.topBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search vault..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.lockBtn} onPress={handleLock}>
          <Text style={styles.lockBtnText}>Lock</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={credentials}
        keyExtractor={(c) => c.id}
        renderItem={renderCredential}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No saved credentials</Text>
            <Text style={styles.emptySubtitle}>Tap + to add your first password</Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => { setForm(EMPTY_FORM); setEditingId(null); setShowPassword(false); setModalVisible(true); }}
            activeOpacity={0.8}
          >
            <Text style={styles.addButtonText}>+ Add Credential</Text>
          </TouchableOpacity>
        }
      />

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setModalVisible(false); setShowPassword(false); }}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? "Edit" : "Add"} Credential</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Title *</Text>
          <TextInput
            style={styles.modalInput}
            value={form.title}
            onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
            placeholder="e.g. Chase Bank"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Username / Email</Text>
          <TextInput
            style={styles.modalInput}
            value={form.username}
            onChangeText={(t) => setForm((f) => ({ ...f, username: t }))}
            placeholder="user@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />

          <Text style={styles.fieldLabel}>Password *</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.modalInput, styles.passwordInput]}
              value={form.password}
              onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />
            <TouchableOpacity
              style={styles.toggleBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.toggleText}>{showPassword ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.generateBtn} onPress={handleGeneratePassword}>
            <Text style={styles.generateText}>Generate Strong Password</Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Website URL</Text>
          <TextInput
            style={styles.modalInput}
            value={form.url}
            onChangeText={(t) => setForm((f) => ({ ...f, url: t }))}
            placeholder="https://example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryPicker}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, form.category === cat && styles.categoryChipActive]}
                onPress={() => setForm((f) => ({ ...f, category: cat }))}
              >
                <Text style={[styles.categoryChipText, form.category === cat && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.modalInput, styles.notesInput]}
            value={form.notes}
            onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
            placeholder="Optional notes..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />
        </ScrollView>
      </Modal>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────

async function generateId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },

  // Locked
  lockedContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.primary, padding: 24 },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  lockedTitle: { color: colors.textOnPrimary, fontSize: 24, fontWeight: "800", marginBottom: 8 },
  lockedSubtitle: { color: "#94a3b8", fontSize: 14, textAlign: "center", marginBottom: 32 },
  unlockButton: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 16 },
  unlockButtonText: { color: colors.textOnAccent, fontSize: 17, fontWeight: "700" },

  // Top bar
  topBar: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  lockBtn: { backgroundColor: colors.primaryLight, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  lockBtnText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: "700" },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  // Credential card
  credCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  credHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  categoryBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  categoryBadgeText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  credDate: { fontSize: 11, color: colors.textMuted },
  credTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
  credUsername: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  credActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: colors.backgroundTertiary },
  actionText: { fontSize: 13, fontWeight: "600", color: colors.accent },
  revealedBox: { marginTop: 8, backgroundColor: colors.backgroundTertiary, borderRadius: 6, padding: 10 },
  revealedText: { fontSize: 14, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: colors.textPrimary },

  // Add button
  addButton: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  addButtonText: { color: colors.textOnAccent, fontSize: 16, fontWeight: "700" },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted },

  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingTop: Platform.OS === "ios" ? 8 : 0 },
  modalCancel: { fontSize: 16, color: colors.textMuted },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  modalSave: { fontSize: 16, fontWeight: "700", color: colors.accent },

  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: 6, marginTop: 16 },
  modalInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  passwordRow: { flexDirection: "row", gap: 8 },
  passwordInput: { flex: 1 },
  toggleBtn: { backgroundColor: colors.backgroundTertiary, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  toggleText: { fontSize: 13, fontWeight: "600", color: colors.accent },
  generateBtn: { marginTop: 8, alignSelf: "flex-start" },
  generateText: { fontSize: 13, fontWeight: "600", color: colors.accent },

  categoryPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  categoryChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  categoryChipText: { fontSize: 13, color: colors.textSecondary },
  categoryChipTextActive: { color: colors.textOnPrimary, fontWeight: "600" },

  notesInput: { minHeight: 80, textAlignVertical: "top" },
});
