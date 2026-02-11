import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Switch } from "react-native";
import { logout } from "../auth/auth";
import { countPendingOutbox } from "../offline/outbox";
import { syncOnce } from "../offline/sync";
import { getWifiOnlySync, setWifiOnlySync } from "../storage/settings";
import { getUserMe, getUserCompanyMe } from "../api/user";
import { switchCompany as apiSwitchCompany } from "../api/company";

export function HomeScreen({
  onLogout,
  onGoProjects,
  onGoInventory,
  onGoOutbox,
}: {
  onLogout: () => void;
  onGoProjects: () => void;
  onGoInventory: () => void;
  onGoOutbox: () => void;
}) {
  const [wifiOnly, setWifiOnly] = useState(false);
  const [pending, setPending] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);

  // Tenant / company selection
  const [companies, setCompanies] = useState<
    { id: string; name: string; kind?: string | null }[]
  >([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<string | null>(null);
  const [companySwitchingId, setCompanySwitchingId] = useState<string | null>(null);

  const refresh = async () => {
    const [w, p] = await Promise.all([getWifiOnlySync(), countPendingOutbox()]);
    setWifiOnly(w);
    setPending(p);
  };

  // Load tenant/company context for the current user.
  const loadCompanies = async () => {
    try {
      setCompanyLoading(true);
      setCompanyMessage(null);

      const me = await getUserMe();
      const membershipCompanies = Array.isArray(me.memberships)
        ? me.memberships.map((m) => ({
            id: m.companyId,
            name: m.company?.name ?? m.companyId,
            kind: (m.company as any)?.kind ?? null,
          }))
        : [];

      // Deduplicate by id in case of overlapping memberships.
      const byId = new Map<string, { id: string; name: string; kind?: string | null }>();
      for (const c of membershipCompanies) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }

      const list = Array.from(byId.values());
      setCompanies(list);

      // Best-effort: fetch the current company context so we know which one is active.
      try {
        const companyMe = await getUserCompanyMe();
        if (companyMe?.id) {
          setCurrentCompanyId(String(companyMe.id));
          setCurrentCompanyName(String(companyMe.name ?? companyMe.id));
        }
      } catch {
        // Non-fatal; we can still render the list without labeling the active org.
      }

      if (!list.length) {
        setCompanyMessage("No organizations found for this user.");
      }
    } catch (e) {
      setCompanyMessage(
        e instanceof Error ? e.message : `Failed to load organizations: ${String(e)}`,
      );
      setCompanies([]);
    } finally {
      setCompanyLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    void loadCompanies();
  }, []);

  const toggleWifiOnly = async (next: boolean) => {
    setWifiOnly(next);
    await setWifiOnlySync(next);
  };

  const runSync = async () => {
    setSyncing(true);
    setLastSyncMsg(null);
    try {
      const res = await syncOnce();
      if (res.skippedReason) {
        setLastSyncMsg(`Sync skipped: ${res.skippedReason}`);
      } else {
        setLastSyncMsg(`Synced. processed=${res.processed} failed=${res.failed}`);
      }
    } catch (e) {
      setLastSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
      await refresh();
    }
  };

  const handleSelectCompany = async (companyId: string) => {
    if (!companyId || companyId === currentCompanyId) return;
    setCompanySwitchingId(companyId);
    setCompanyMessage(null);
    try {
      const res = await apiSwitchCompany(companyId);
      if (res.company?.id) {
        setCurrentCompanyId(res.company.id);
        setCurrentCompanyName(res.company.name ?? res.company.id);
        setCompanyMessage("Switched organization context.");
      } else {
        setCompanyMessage("Switched, but no company details returned.");
      }
    } catch (e) {
      setCompanyMessage(
        e instanceof Error ? e.message : `Failed to switch organization: ${String(e)}`,
      );
    } finally {
      setCompanySwitchingId(null);
    }
  };

  const doLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nexus Mobile</Text>

      {/* Tenant / organization selector */}
      {!companyLoading && companies.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.sectionLabel}>Organization</Text>
          <View style={styles.companyRow}>
            {companies.map((c) => {
              const selected = c.id === currentCompanyId;
              const switching = companySwitchingId === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => handleSelectCompany(c.id)}
                  disabled={switching}
                >
                  <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                    {c.name}
                    {switching ? " (switching…)" : selected ? " (current)" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {currentCompanyName ? (
            <Text style={styles.small}>Current: {currentCompanyName}</Text>
          ) : null}
        </View>
      )}
      {companyLoading && (
        <Text style={styles.small}>Loading organizations…</Text>
      )}
      {companyMessage && <Text style={styles.small}>{companyMessage}</Text>}

      <View style={styles.row}>
        <Text style={styles.label}>Wi‑Fi only sync</Text>
        <Switch value={wifiOnly} onValueChange={toggleWifiOnly} />
      </View>

      <Text style={styles.small}>Pending outbox items: {pending}</Text>

      <Pressable style={styles.button} onPress={runSync} disabled={syncing}>
        <Text style={styles.buttonText}>{syncing ? "Syncing…" : "Sync now"}</Text>
      </Pressable>

      {lastSyncMsg ? <Text style={styles.small}>{lastSyncMsg}</Text> : null}

      <View style={{ flex: 1 }} />

      <Pressable style={styles.logout} onPress={doLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4 },
  companyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  label: { fontSize: 15, color: "#111827" },
  small: { color: "#374151", marginTop: 8 },
  button: {
    backgroundColor: "#1e3a8a",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#1e3a8a",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  buttonSecondaryText: { color: "#1e3a8a", fontWeight: "600" },
  logout: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
  },
  logoutText: { color: "#991b1b", fontWeight: "700" },
  chip: {
    borderWidth: 1,
    borderColor: "#1e3a8a",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#ffffff",
  },
  chipSelected: {
    backgroundColor: "#1e3a8a",
    borderColor: "#1e3a8a",
  },
  chipText: { fontSize: 12, color: "#1e3a8a" },
  chipTextSelected: { fontSize: 12, color: "#f9fafb", fontWeight: "600" },
});
