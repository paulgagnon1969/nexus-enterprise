import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { login } from "../auth/auth";
import { getApiBaseUrl } from "../api/config";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<string | null>(null);

  const apiBase = getApiBaseUrl();

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
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

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
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={submit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
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
  button: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#b91c1c", marginTop: 8 },
});
