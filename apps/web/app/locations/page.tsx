'use client';

import { useEffect, useState } from 'react';
import {
  fetchRootLocations,
  fetchChildLocations,
  fetchLocationHoldings,
  fetchMyHoldings,
  fetchLocationHistory,
  type Location,
  type Holdings,
  type LocationMovement,
} from '../../lib/api/locations';

type TreeNodeStats = {
  people: number;
  assets: number;
  materialLots: number;
  particles: number;
};

type TreeNode = Location & {
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoaded?: boolean;
  stats?: TreeNodeStats;
};

function buildBreadcrumb(target: Location | null, roots: TreeNode[]): string | null {
  if (!target || roots.length === 0) return null;

  const path: TreeNode[] = [];

  const dfs = (nodes: TreeNode[]): boolean => {
    for (const n of nodes) {
      path.push(n);
      if (n.id === target.id) return true;
      if (n.children && n.children.length && dfs(n.children)) return true;
      path.pop();
    }
    return false;
  };

  const found = dfs(roots);
  if (!found) return null;
  return path.map((n) => n.name).join(' / ');
}

function applyStats(
  nodes: TreeNode[],
  id: string,
  stats: TreeNodeStats,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) {
      return { ...n, stats };
    }
    if (n.children && n.children.length) {
      return { ...n, children: applyStats(n.children, id, stats) };
    }
    return n;
  });
}

export default function LocationsPage() {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMoveAssetId, setPendingMoveAssetId] = useState<string | null>(null);
  const [history, setHistory] = useState<LocationMovement[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showingMyHoldings, setShowingMyHoldings] = useState(false);

  useEffect(() => {
    const loadRoots = async () => {
      setLoadingTree(true);
      setError(null);
      try {
        const roots = await fetchRootLocations();
        setRootNodes(
          roots.map((loc) => ({ ...loc, children: [], isLoaded: false, isExpanded: false })),
        );
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load locations');
      } finally {
        setLoadingTree(false);
      }
    };
    void loadRoots();
  }, []);

  const handleToggleNode = async (nodeId: string) => {
    setError(null);

    // Find the current node so we know whether to load children or just toggle.
    const findNode = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        if (n.children && n.children.length) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return undefined;
    };

    const current = findNode(rootNodes);

    if (current && current.isLoaded) {
      const toggleExpanded = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.id === nodeId) {
            return { ...n, isExpanded: !n.isExpanded };
          }
          if (n.children && n.children.length) {
            return { ...n, children: toggleExpanded(n.children) };
          }
          return n;
        });

      setRootNodes((prev) => toggleExpanded(prev));
      return;
    }

    // Not yet loaded; fetch children and attach them.
    try {
      setLoadingTree(true);
      const children = await fetchChildLocations(nodeId);

      const setChildren = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              isExpanded: true,
              isLoaded: true,
              children: children.map((c) => ({
                ...c,
                children: [],
                isLoaded: false,
                isExpanded: false,
              })),
            };
          }
          if (n.children && n.children.length) {
            return { ...n, children: setChildren(n.children) };
          }
          return n;
        });

      setRootNodes((prev) => setChildren(prev));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load child locations');
    } finally {
      setLoadingTree(false);
    }
  };

  const handleSelectLocation = async (loc: Location) => {
    setError(null);
    setShowingMyHoldings(false);
    if (pendingMoveAssetId) {
      // Move asset into this location
      try {
        setLoadingHoldings(true);
        const res = await fetch(
          `/api/inventory/holdings/location/${loc.id}/move-asset`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId: pendingMoveAssetId }),
          },
        );
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error('You do not have permission to move assets.');
          }
          throw new Error(json?.message || 'Failed to move asset');
        }
        setSelectedLocation(loc);
        setHoldings(json);
        setPendingMoveAssetId(null);
        // Update stats for this node
        setRootNodes((prev) =>
          applyStats(prev, loc.id, {
            people: json.people.length,
            assets: json.assets.length,
            materialLots: json.materialLots.length,
            particles: json.particles.length,
          }),
        );
      } catch (e: any) {
        setError(e?.message ?? 'Failed to move asset to new location');
      } finally {
        setLoadingHoldings(false);
      }
      return;
    }

    setSelectedLocation(loc);
    setLoadingHoldings(true);
    setLoadingHistory(true);
    try {
      const [data, hist] = await Promise.all([
        fetchLocationHoldings(loc.id),
        fetchLocationHistory(loc.id).catch(() => [] as LocationMovement[]),
      ]);
      setHoldings(data);
      setHistory(hist);
      setRootNodes((prev) =>
        applyStats(prev, loc.id, {
          people: data.people.length,
          assets: data.assets.length,
          materialLots: data.materialLots.length,
          particles: data.particles.length,
        }),
      );
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load holdings');
      setHoldings(null);
      setHistory(null);
    } finally {
      setLoadingHoldings(false);
      setLoadingHistory(false);
    }
  };

  const handleShowMyHoldings = async () => {
    setSelectedLocation(null);
    setLoadingHoldings(true);
    setLoadingHistory(true);
    setError(null);
    setShowingMyHoldings(true);
    try {
      const data = await fetchMyHoldings();
      setHoldings(data);
      if (data.location?.id) {
        const hist = await fetchLocationHistory(data.location.id).catch(
          () => [] as LocationMovement[],
        );
        setHistory(hist);
      } else {
        setHistory(null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load my holdings');
      setHoldings(null);
      setHistory(null);
    } finally {
      setLoadingHoldings(false);
      setLoadingHistory(false);
    }
  };

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-1/3 border-r pr-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Locations</h1>
          <button
            onClick={() => void handleShowMyHoldings()}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
          >
            My holdings
          </button>
        </div>
        {loadingTree && <div className="text-sm text-gray-500">Loading locations…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="mt-2 space-y-1 text-sm">
          {rootNodes.length === 0 && !loadingTree && !error && (
            <div className="text-xs text-gray-500">
              No locations defined yet. Use the Locations view and future admin
              settings to create hotels, rooms, warehouses, yards, and other
              logistics points.
            </div>
          )}
          {rootNodes.map((node) => (
            <LocationTreeNode
              key={node.id}
              node={node}
              depth={0}
              onToggle={handleToggleNode}
              onSelect={handleSelectLocation}
              selectedId={selectedLocation?.id ?? null}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 pl-4">
        <h2 className="mb-1 text-lg font-semibold">
          {selectedLocation
            ? `Holdings at ${
                buildBreadcrumb(selectedLocation, rootNodes) ?? selectedLocation.name
              }`
            : showingMyHoldings && holdings?.location
            ? `My holdings at ${holdings.location.name}`
            : 'Holdings'}
        </h2>
        {showingMyHoldings && holdings?.location && (
          <div className="mb-1 text-xs text-gray-500">
            You are currently assigned to: {holdings.location.name}
          </div>
        )}
        {loadingHoldings && <div className="text-sm text-gray-500">Loading holdings…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {pendingMoveAssetId && (
          <div className="mb-2 flex items-center justify-between rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
            <span>
              Move mode: click a destination location in the tree to move the selected
              asset.
            </span>
            <button
              type="button"
              onClick={() => setPendingMoveAssetId(null)}
              className="ml-2 rounded-full border border-emerald-400 bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-900"
            >
              Cancel move
            </button>
          </div>
        )}
        {holdings && (
          <div className="mt-2 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
            <HoldingsSection
              title="People"
              items={holdings.people}
              type="people"
              locationMetadata={holdings.location?.metadata ?? null}
            />
            <HoldingsSection
              title="Equipment & Other Assets"
              items={holdings.assets}
              type="asset"
              onAssetMove={(id) => setPendingMoveAssetId(id)}
              locationMetadata={holdings.location?.metadata ?? null}
              pendingMoveAssetId={pendingMoveAssetId}
            />
            <HoldingsSection
              title="Material Lots"
              items={holdings.materialLots}
              type="material"
              locationMetadata={holdings.location?.metadata ?? null}
            />
            <HoldingsSection
              title="Particles"
              items={holdings.particles}
              type="particle"
              locationMetadata={holdings.location?.metadata ?? null}
            />
            </div>
            <div className="rounded border border-gray-200 bg-white p-2 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold">Recent movements</h3>
                {loadingHistory && (
                  <span className="text-[10px] text-gray-400">Loading…</span>
                )}
              </div>
              {!history || history.length === 0 ? (
                <div className="text-[11px] text-gray-500">
                  No recent inventory movements for this location.
                </div>
              ) : (
                <ul className="mt-1 space-y-1">
                  {history.map((m) => {
                    const when = new Date(m.movedAt).toLocaleString();
                    const dir =
                      m.toLocationId === holdings.location?.id
                        ? 'in'
                        : m.fromLocationId === holdings.location?.id
                        ? 'out'
                        : '';
                    const dirLabel = dir === 'in' ? 'In' : dir === 'out' ? 'Out' : 'Move';
                    return (
                      <li key={m.id} className="leading-snug">
                        <div>
                          <span className="font-medium">{dirLabel}</span>{' '}
                          <span className="text-gray-600">
                            {m.quantity} {m.itemType.toLowerCase()} to{' '}
                            {m.toLocation?.name ?? m.toLocationId ?? 'unknown'}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400">{when}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
        {!holdings && !loadingHoldings && !error && (
          <div className="text-sm text-gray-500">
            Select a location or click "My holdings".
          </div>
        )}
      </div>
    </div>
  );
}

type LocationTreeNodeProps = {
  node: TreeNode;
  depth: number;
  onToggle: (id: string) => void;
  onSelect: (loc: Location) => void;
  selectedId: string | null;
};

function LocationTreeNode({ node, depth, onToggle, onSelect, selectedId }: LocationTreeNodeProps) {
  const hasChildrenPotential = node.type !== 'BIN' && node.type !== 'PERSON';
  const stats = node.stats;
  let statsLabel = '';
  if (stats) {
    const parts: string[] = [];
    if (stats.people) parts.push(`${stats.people} ppl`);
    if (stats.assets) parts.push(`${stats.assets} assets`);
    if (stats.materialLots) parts.push(`${stats.materialLots} lots`);
    if (stats.particles) parts.push(`${stats.particles} parts`);
    statsLabel = parts.join(' · ');
  }

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div className="flex items-center gap-1">
        {hasChildrenPotential && (
          <button
            type="button"
            className="text-xs"
            onClick={() => onToggle(node.id)}
          >
            {node.isExpanded ? '-' : '+'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect(node)}
          className={`text-left text-xs ${selectedId === node.id ? 'font-semibold text-blue-600' : ''}`}
        >
          {node.name}{' '}
          <span className="text-[10px] text-gray-500">({node.type})</span>
          {statsLabel && (
            <span className="ml-1 text-[10px] text-gray-400">· {statsLabel}</span>
          )}
        </button>
      </div>
      {node.isExpanded &&
        node.children?.map((child) => (
          <LocationTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        ))}
    </div>
  );
}

type HoldingsSectionProps =
  | {
      title: string;
      type: 'people';
      items: Holdings['people'];
      onAssetMove?: (id: string) => void;
      locationMetadata?: Record<string, unknown> | null;
      pendingMoveAssetId?: string | null;
    }
  | {
      title: string;
      type: 'asset';
      items: Holdings['assets'];
      onAssetMove: (id: string) => void;
      locationMetadata?: Record<string, unknown> | null;
      pendingMoveAssetId?: string | null;
    }
  | {
      title: string;
      type: 'material';
      items: Holdings['materialLots'];
      onAssetMove?: (id: string) => void;
      locationMetadata?: Record<string, unknown> | null;
      pendingMoveAssetId?: string | null;
    }
  | {
      title: string;
      type: 'particle';
      items: Holdings['particles'];
      onAssetMove?: (id: string) => void;
      locationMetadata?: Record<string, unknown> | null;
      pendingMoveAssetId?: string | null;
    };

function HoldingsSection({ title, type, items, onAssetMove, locationMetadata, pendingMoveAssetId }: HoldingsSectionProps) {
  if (!items || items.length === 0) {
    return (
      <div>
        <h3 className="font-medium">{title}</h3>
        <div className="text-xs text-gray-500">None</div>
      </div>
    );
  }

  // Optional capacity warning when metadata includes capacityPeople
  let capacityWarning: string | null = null;
  if (type === 'people' && locationMetadata) {
    const cap = (locationMetadata as any)?.capacityPeople;
    if (typeof cap === 'number' && items.length > cap) {
      capacityWarning = `Over capacity: ${items.length} / ${cap} people`;
    }
  }

  return (
    <div>
      <h3 className="font-medium">
        {title}{' '}
        <span className="text-xs text-gray-500">({items.length})</span>
      </h3>
      {capacityWarning && (
        <div className="text-[10px] text-red-600">{capacityWarning}</div>
      )}
      <ul className="mt-1 space-y-1 text-xs">
        {type === 'people' &&
          (items as Holdings['people']).map((p) => (
            <li key={p.userId}>
              {p.name ?? 'Unnamed user'}{' '}
              {p.email && <span className="text-gray-500">[{p.email}]</span>}
            </li>
          ))}
        {type === 'asset' &&
          (items as Holdings['assets']).map((a) => {
            const isArmed = pendingMoveAssetId === a.id;
            return (
              <li
                key={a.id}
                className={isArmed ? 'bg-emerald-50' : undefined}
              >
                {a.name} ({a.assetType}){' '}
                {a.code && <span className="text-gray-500">[{a.code}]</span>}
                {onAssetMove && (
                  <button
                    type="button"
                    onClick={() => onAssetMove(a.id)}
                    className="ml-2 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700"
                  >
                    Move…
                  </button>
                )}
              </li>
            );
          })}
        {type === 'material' &&
          (items as Holdings['materialLots']).map((m) => (
            <li key={m.id}>
              {m.sku} – {m.name} ({m.quantity} {m.uom})
            </li>
          ))}
        {type === 'particle' &&
          (items as Holdings['particles']).map((p) => (
            <li key={p.id}>
              {p.parentEntityType} {p.parentEntityId} – {p.quantity} {p.uom}
            </li>
          ))}
      </ul>
    </div>
  );
}
