import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { colors } from "../theme/colors";
import { login } from "../api/client";

interface Props {
  onLoggedIn: () => void;
}

export function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert("Missing Fields", "Enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      await login(trimmedEmail, password);
      onLoggedIn();
    } catch (err: any) {
      Alert.alert("Login Failed", err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        {/* Branding */}
        <View style={styles.brandSection}>
          <Text style={styles.appName}>NexCard</Text>
          <Text style={styles.tagline}>Every card. One view. Sync anywhere.</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Sign in with your NCC account</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.skipText}>
            NCC account required for bank sync via Plaid.{"\n"}
            Apple FinanceKit works without an account.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },

  brandSection: { alignItems: "center", marginBottom: 48 },
  appName: { color: colors.textOnPrimary, fontSize: 36, fontWeight: "800", letterSpacing: 2 },
  tagline: { color: "#94a3b8", fontSize: 14, marginTop: 8 },

  formSection: { backgroundColor: colors.cardBackground, borderRadius: 16, padding: 24 },
  formTitle: { fontSize: 15, fontWeight: "600", color: colors.textSecondary, marginBottom: 16, textAlign: "center" },

  input: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  loginButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: colors.textOnAccent, fontSize: 17, fontWeight: "700" },

  skipText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});
