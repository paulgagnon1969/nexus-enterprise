import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { apiJson } from "../api/client";
import { getCache, setCache } from "../offline/cache";
import { enqueueOutbox } from "../offline/outbox";
import type { LocationHoldingsDto, LocationDto } from "@repo/types";
import type { ProjectListItem } from "../types/api";

type Loc = LocationDto & {
  code?: string | null;
  type?: string;
  parentLocationId?: string | null;
};

export function InventoryScreen({ onBack }: { onBack: () => void }) {
  const [myHoldings, setMyHoldings] = useState<LocationHoldingsDto | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Project -> location tree
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const [projectRoot, setProjectRoot] = useState<Loc | null>(null);
  const [locStack, setLocStack] = useState<Loc[]>([]);
  const [children, setChildren] = useState<Loc[]>([]);
  const [currentHoldings, setCurrentHoldings] = useState<LocationHoldingsDto | null>(null);

  const myHoldingsKey = "inventory.holdings.me";
  const projectsKey = "projects.list";

  const currentLoc = locStack.length ? locStack[locStack.length - 1] : null;
  const breadcrumb = locStack.map((l) => l.name).join(" > ");

  const loadCachedBootstrap = async () => {
    const [h, p] = await Promise.all([
      getCache<LocationHoldingsDto>(myHoldingsKey),
      getCache<ProjectListItem[]>(projectsKey),
    ]);
    if (h) setMyHoldings(h);
    if (p) setProjects(p);
  };

  const refreshBootstrapOnline = async () => {
    try {
      const [h, p] = await Promise.all([
        apiJson<LocationHoldingsDto>("/inventory/holdings/me"),
        apiJson<ProjectListItem[]>("/projects"),
      ]);
      setMyHoldings(h);
      setProjects(p);
      await Promise.all([setCache(myHoldingsKey, h), setCache(projectsKey, p)]);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadCachedBootstrap().then(refreshBootstrapOnline);
  }, []);

  const myAssets = useMemo(() => myHoldings?.assets ?? [], [myHoldings]);

  const loadLocationChildren = async (locationId: string) => {
    const key = `locations.children:${locationId}`;
    const cached = await getCache<Loc[]>(key);
    if (cached) setChildren(cached);

    try {
      const latest = await apiJson<Loc[]>(`/locations/children/${encodeURIComponent(locationId)}`);
      setChildren(latest);
      await setCache(key, latest);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const loadLocationHoldings = async (locationId: string) => {
    const key = `inventory.holdings.location:${locationId}`;
    const cached = await getCache<LocationHoldingsDto>(key);
    if (cached) setCurrentHoldings(cached);

    try {
      const latest = await apiJson<LocationHoldingsDto>(
        `/inventory/holdings/location/${encodeURIComponent(locationId)}`,
      );
      setCurrentHoldings(latest);
      await setCache(key, latest);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const openLocation = async (loc: Loc) => {
    setStatus(null);
    setLocStack((prev) => [...prev, loc]);
    await Promise.all([loadLocationChildren(loc.id), loadLocationHoldings(loc.id)]);
  };

  const goUp = async () => {
    setStatus(null);
    setLocStack((prev) => {
      const next = prev.slice(0, -1);
      return next;
    });

    // After state update, compute next current location from the previous stack.
    const nextStack = locStack.slice(0, -1);
    const nextLoc = nextStack[nextStack.length - 1];
    if (nextLoc) {
      await Promise.all([loadLocationChildren(nextLoc.id), loadLocationHoldings(nextLoc.id)]);
    } else {
      setChildren([]);
      setCurrentHoldings(null);
    }
  };

  const resolveProjectRoot = async (project: ProjectListItem) => {
    setStatus("Loading project locations…");
    setSelectedProject(project);

    const cacheKey = `locations.projectRoot:${project.id}`;
    const cached = await getCache<Loc>(cacheKey);
    if (cached) {
      setProjectRoot(cached);
      setLocStack([cached]);
      await Promise.all([loadLocationChildren(cached.id), loadLocationHoldings(cached.id)]);
      setStatus(null);
      return;
    }

    const existing = await apiJson<Loc | null>(
      `/locations/project/${encodeURIComponent(project.id)}/root`,
    );

    if (existing) {
      setProjectRoot(existing);
      setLocStack([existing]);
      await setCache(cacheKey, existing);
      await Promise.all([loadLocationChildren(existing.id), loadLocationHoldings(existing.id)]);
      setStatus(null);
      return;
    }

    setProjectRoot(null);
    setLocStack([]);
    setChildren([]);
    setCurrentHoldings(null);
    setStatus(
      "This project does not have locations seeded yet. If you are an admin, tap Seed Project Locations.",
    );
  };

  const seedProjectLocations = async () => {
    if (!selectedProject) return;
    setStatus("Seeding project locations…");

    try {
      const seeded = await apiJson<any>(
        `/locations/project/${encodeURIComponent(selectedProject.id)}/seed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zonesCount: 3,
            upstreamVendors: ["Home Depot"],
          }),
        },
      );

      const root = seeded?.projectRoot as Loc | undefined;
      if (!root?.id) {
        throw new Error("Seed response missing projectRoot");
      }

      const cacheKey = `locations.projectRoot:${selectedProject.id}`;
      await setCache(cacheKey, root);
      setProjectRoot(root);
      setLocStack([root]);
      await Promise.all([loadLocationChildren(root.id), loadLocationHoldings(root.id)]);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const queueMoveToCurrent = async () => {
    if (!selectedAssetId || !currentLoc?.id) return;
    await enqueueOutbox("inventory.moveAsset", {
      toLocationId: currentLoc.id,
      assetId: selectedAssetId,
      reason: "TRANSFER",
    });
    setStatus(`Move queued offline to ${currentLoc.name}. Sync later.`);
    setSelectedAssetId(null);
  };

  const resetProjectSelection = () => {
    setSelectedProject(null);
    setProjectRoot(null);
    setLocStack([]);
    setChildren([]);
    setCurrentHoldings(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Inventory</Text>
        <Pressable onPress={refreshBootstrapOnline}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <ScrollView style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>My holdings</Text>
        <Text style={styles.small}>
          Location: {myHoldings?.location?.name ?? "(unknown)"}
        </Text>

        {myAssets.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.card, selectedAssetId === a.id ? styles.cardActive : null]}
            onPress={() => setSelectedAssetId(a.id)}
          >
            <Text style={styles.cardTitle}>{a.name}</Text>
            <Text style={styles.cardSub}>{a.id}</Text>
          </Pressable>
        ))}

        {!myAssets.length ? <Text style={styles.small}>No assets cached yet.</Text> : null}

        <View style={{ height: 18 }} />

        <Text style={styles.sectionTitle}>Project location tree</Text>

        {!selectedProject ? (
          <>
            <Text style={styles.small}>
              Select a project to browse: Tenant → Project → Warehouse → Zones, plus Upstream/Downstream.
            </Text>

            {projects.map((p) => (
              <Pressable key={p.id} style={styles.moveRow} onPress={() => resolveProjectRoot(p)}>
                <Text style={styles.moveRowText}>{p.name}</Text>
                <Text style={styles.cardSub}>{p.id}</Text>
              </Pressable>
            ))}

            {!projects.length ? <Text style={styles.small}>No projects cached yet.</Text> : null}
          </>
        ) : (
          <>
            <View style={styles.rowBetween}>
              <Text style={{ fontWeight: "700" }}>{selectedProject.name}</Text>
              <Pressable onPress={resetProjectSelection}>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>

            {!projectRoot ? (
              <Pressable style={styles.seedButton} onPress={seedProjectLocations}>
                <Text style={styles.seedButtonText}>Seed Project Locations</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.rowBetween}>
                  <Pressable onPress={goUp} disabled={locStack.length <= 1}>
                    <Text style={[styles.link, locStack.length <= 1 ? styles.linkDisabled : null]}>
                      ↑ Up
                    </Text>
                  </Pressable>
                  <Text style={styles.small} numberOfLines={2}>
                    {breadcrumb}
                  </Text>
                  <View style={{ width: 24 }} />
                </View>

                {selectedAssetId && currentLoc ? (
                  <Pressable style={styles.primaryButton} onPress={queueMoveToCurrent}>
                    <Text style={styles.primaryButtonText}>
                      Move selected asset → {currentLoc.name}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.small}>
                    Select an asset above to enable "Move selected asset".
                  </Text>
                )}

                {currentHoldings?.assets?.length ? (
                  <Text style={styles.small}>
                    Assets at this location: {currentHoldings.assets.length}
                  </Text>
                ) : null}

                <Text style={[styles.sectionTitle, { marginTop: 10 }]}>
                  Locations
                </Text>

                {children.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.childRow}
                    onPress={() => openLocation(c)}
                  >
                    <Text style={{ fontWeight: "700" }}>{c.name}</Text>
                    <Text style={styles.cardSub}>
                      {c.type} {c.code ? `• ${c.code}` : ""}
                    </Text>
                  </Pressable>
                ))}

                {!children.length ? (
                  <Text style={styles.small}>
                    No children cached for this node yet.
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  link: { color: "#2563eb", fontWeight: "600" },
  linkDisabled: { color: "#9ca3af" },
  status: { color: "#374151", marginBottom: 8 },
  sectionTitle: { fontWeight: "700", marginTop: 6, marginBottom: 6 },
  small: { color: "#6b7280", marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardActive: {
    borderColor: "#111827",
    backgroundColor: "#f3f4f6",
  },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  cardSub: { color: "#6b7280", marginTop: 4, fontSize: 12 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  seedButton: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  seedButtonText: { color: "#ffffff", fontWeight: "700" },
  primaryButton: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "700" },
  moveRow: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  moveRowText: { fontWeight: "600" },
  childRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
});
