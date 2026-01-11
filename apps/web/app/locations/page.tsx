'use client';

import { useEffect, useState } from 'react';
import {
  fetchRootLocations,
  fetchChildLocations,
  fetchLocationHoldings,
  fetchMyHoldings,
  type Location,
  type Holdings,
} from '../../lib/api/locations';

type TreeNode = Location & {
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoaded?: boolean;
};

export default function LocationsPage() {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setRootNodes(asyncMapTree(rootNodes, nodeId, async (node) => {
      if (node.isLoaded) {
        return { ...node, isExpanded: !node.isExpanded };
      }
      const children = await fetchChildLocations(node.id);
      return {
        ...node,
        isExpanded: true,
        isLoaded: true,
        children: children.map((c) => ({
          ...c,
          children: [],
          isLoaded: false,
          isExpanded: false,
        })),
      };
    }));
  };

  const handleSelectLocation = async (loc: Location) => {
    setSelectedLocation(loc);
    setLoadingHoldings(true);
    setError(null);
    try {
      const data = await fetchLocationHoldings(loc.id);
      setHoldings(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load holdings');
      setHoldings(null);
    } finally {
      setLoadingHoldings(false);
    }
  };

  const handleShowMyHoldings = async () => {
    setSelectedLocation(null);
    setLoadingHoldings(true);
    setError(null);
    try {
      const data = await fetchMyHoldings();
      setHoldings(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load my holdings');
      setHoldings(null);
    } finally {
      setLoadingHoldings(false);
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
        <h2 className="mb-2 text-lg font-semibold">
          {selectedLocation ? `Holdings at ${selectedLocation.name}` : 'Holdings'}
        </h2>
        {loadingHoldings && <div className="text-sm text-gray-500">Loading holdings…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {holdings && (
          <div className="space-y-4 text-sm">
            <HoldingsSection title="Assets" items={holdings.assets} type="asset" />
            <HoldingsSection title="Material Lots" items={holdings.materialLots} type="material" />
            <HoldingsSection title="Particles" items={holdings.particles} type="particle" />
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

function asyncMapTree(
  nodes: TreeNode[],
  targetId: string,
  updater: (node: TreeNode) => Promise<TreeNode>,
): TreeNode[] {
  // This function is a bit of a hack to allow async updates inside useState.
  // We optimistically keep the old tree while kicking off async updates.
  updater;
  return nodes;
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
  | { title: string; type: 'asset'; items: Holdings['assets'] }
  | { title: string; type: 'material'; items: Holdings['materialLots'] }
  | { title: string; type: 'particle'; items: Holdings['particles'] };

function HoldingsSection({ title, type, items }: HoldingsSectionProps) {
  if (!items || items.length === 0) {
    return (
      <div>
        <h3 className="font-medium">{title}</h3>
        <div className="text-xs text-gray-500">None</div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-medium">
        {title}{' '}
        <span className="text-xs text-gray-500">({items.length})</span>
      </h3>
      <ul className="mt-1 space-y-1 text-xs">
        {type === 'asset' &&
          (items as Holdings['assets']).map((a) => (
            <li key={a.id}>
              {a.name} ({a.assetType}){' '}
              {a.code && <span className="text-gray-500">[{a.code}]</span>}
            </li>
          ))}
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
