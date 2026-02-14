import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Switch } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { login } from "../auth/auth";
import { getApiBaseUrl } from "../api/config";
import {
  saveCredentials,
  getCredentials,
  isBiometricEnabled,
  setBiometricEnabled,
} from "../storage/credentials";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [useBiometric, setUseBiometric] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [apiStatus, setApiStatus] = useState<string | null>(null);

  const apiBase = getApiBaseUrl();

  // Load saved credentials and check biometric availability on mount
  useEffect(() => {
    (async () => {
      try {
        // Check biometric availability
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);

        // Load saved biometric preference
        const bioEnabled = await isBiometricEnabled();
        setUseBiometric(bioEnabled);

        // Load saved credentials
        const saved = await getCredentials();
        if (saved) {
          setEmail(saved.email);
          setPassword(saved.password);
          setHasSavedCreds(true);
          // Don't auto-trigger biometric - let user explicitly tap the button
        }
      } catch (e) {
        console.warn("Failed to load credentials:", e);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const attemptBiometricLogin = async (savedEmail: string, savedPassword: string) => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Sign in to Nexus",
        fallbackLabel: "Use password",
        disableDeviceFallback: false,
      });

      if (result.success) {
        setLoading(true);
        setError(null);
        await login({ email: savedEmail, password: savedPassword });
        onLoggedIn();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    setUseBiometric(value);
    await setBiometricEnabled(value);
  };

  const testApi = async () => {
    setApiStatus("Testing…");
    try {
      const res = await fetch(`${apiBase}/health`);
      const text = await res.text();
      setApiStatus(`OK (${res.status}): ${text}`);
    } catch (e) {
      setApiStatus(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });

      // Save credentials if "Remember me" is checked
      if (rememberMe) {
        await saveCredentials({ email, password });
      }

      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Nexus Mobile</Text>
        <Text style={styles.small}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nexus Mobile</Text>
      <Text style={styles.subtitle}>Sign in</Text>

      <Text style={styles.small}>API: {apiBase}</Text>
      <Pressable style={styles.smallButton} onPress={testApi}>
        <Text style={styles.smallButtonText}>Test API (/health)</Text>
      </Pressable>
      {apiStatus ? <Text style={styles.small}>{apiStatus}</Text> : null}

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />

      {/* Password field with show/hide toggle */}
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry={!showPassword}
          autoComplete="password"
        />
        <Pressable
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁️"}</Text>
        </Pressable>
      </View>

      {/* Remember me toggle */}
      <View style={styles.optionRow}>
        <Text style={styles.optionLabel}>Remember me</Text>
        <Switch value={rememberMe} onValueChange={setRememberMe} />
      </View>

      {/* Biometric toggle (only show if available) */}
      {biometricAvailable && (
        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>Use Face ID / Fingerprint</Text>
          <Switch value={useBiometric} onValueChange={handleBiometricToggle} />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={submit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign in"}</Text>
      </Pressable>

      {/* Biometric quick login button */}
      {biometricAvailable && hasSavedCreds && useBiometric && (
        <Pressable
          style={styles.biometricButton}
          onPress={() => attemptBiometricLogin(email, password)}
          disabled={loading}
        >
          <Text style={styles.biometricButtonText}>🔐 Sign in with Face ID / Fingerprint</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 16, color: "#374151" },
  small: { color: "#374151", fontSize: 12, marginBottom: 8 },
  smallButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  smallButtonText: { fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eyeText: {
    fontSize: 18,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  optionLabel: {
    fontSize: 14,
    color: "#374151",
  },
  button: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  biometricButton: {
    backgroundColor: "#4f46e5",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  biometricButtonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#b91c1c", marginTop: 8 },
});
