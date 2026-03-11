import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from "react-native";
import Constants from "expo-constants";
import { colors } from "../theme/colors";
import { LogoutContext } from "../navigation/AppNavigator";
import { destroyVault } from "../services/vault";
import { deleteAllVaultCredentials } from "../db/database";

export function SettingsScreen() {
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const onLogout = React.useContext(LogoutContext);

  const handleManageSubscription = () => {
    // Opens App Store subscription management on iOS
    Linking.openURL("https://apps.apple.com/account/subscriptions");
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL("https://staging-ncc.nfsgrp.com/privacy");
  };

  const handleSupport = () => {
    Linking.openURL("mailto:support@nfsgrp.com?subject=NexCard%20Support");
  };

  const handleDeleteData = () => {
    Alert.alert(
      "Delete All Data",
      "This will permanently delete all accounts, transactions, vault credentials, and sync settings from this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            await deleteAllVaultCredentials();
            await destroyVault();
            Alert.alert("Done", "All local data has been deleted.");
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "You will need to sign in again to sync bank accounts.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: onLogout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Subscription */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <TouchableOpacity style={styles.row} onPress={handleManageSubscription}>
          <Text style={styles.rowTitle}>Manage Subscription</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Data */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data & Privacy</Text>
        <TouchableOpacity style={styles.row} onPress={handlePrivacyPolicy}>
          <Text style={styles.rowTitle}>Privacy Policy</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, styles.destructiveRow]} onPress={handleDeleteData}>
          <Text style={styles.destructiveText}>Delete All Local Data</Text>
        </TouchableOpacity>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={[styles.row, styles.destructiveRow]} onPress={handleLogout}>
          <Text style={styles.destructiveText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <TouchableOpacity style={styles.row} onPress={handleSupport}>
          <Text style={styles.rowTitle}>Contact Support</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.aboutSection}>
        <Text style={styles.appName}>NexCard</Text>
        <Text style={styles.tagline}>Every card. One view. Sync anywhere.</Text>
        <Text style={styles.version}>Version {version}</Text>
        <Text style={styles.copyright}>© {new Date().getFullYear()} NFS Group</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", marginBottom: 8, paddingHorizontal: 4 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 14,
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  rowTitle: { fontSize: 15, color: colors.textPrimary },
  rowChevron: { fontSize: 20, color: colors.textMuted },

  destructiveRow: { marginTop: 8 },
  destructiveText: { fontSize: 15, color: colors.error, fontWeight: "500" },

  aboutSection: { alignItems: "center", paddingTop: 32 },
  appName: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  tagline: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  version: { fontSize: 13, color: colors.textMuted, marginTop: 12 },
  copyright: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
