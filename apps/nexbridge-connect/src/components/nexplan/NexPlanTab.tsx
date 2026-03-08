import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listProjects,
  listPlanningRooms,
  getPlanningRoom,
  createPlanningRoom,
  archivePlanningRoom,
  addSelection,
  updateSelection,
  deleteSelection,
  listVendorCatalogs,
  listVendorProducts,
  generateSelectionSheet,
} from "../../lib/api";
import type {
  ProjectListItem,
  PlanningRoomItem,
  PlanningRoomDetail,
  VendorCatalogItem,
  VendorProductItem,
} from "../../lib/api";

// ── Status helpers ────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  PROPOSED: { bg: "bg-amber-100", text: "text-amber-700" },
  APPROVED: { bg: "bg-green-100", text: "text-green-700" },
  ORDERED: { bg: "bg-blue-100", text: "text-blue-700" },
  DELIVERED: { bg: "bg-purple-100", text: "text-purple-700" },
  INSTALLED: { bg: "bg-emerald-100", text: "text-emerald-700" },
  REJECTED: { bg: "bg-red-100", text: "text-red-700" },
};

const STATUSES = ["PROPOSED", "APPROVED", "ORDERED", "DELIVERED", "INSTALLED", "REJECTED"] as const;

function formatDims(p: VendorProductItem) {
  return [p.width, p.height, p.depth]
    .filter(Boolean)
    .map((d) => `${d}"`)
    .join(" × ");
}

function formatPrice(n: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

// ── Product Picker Modal ──────────────────────────────────────────

function ProductPicker({
  onSelect,
  onClose,
}: {
  onSelect: (product: VendorProductItem) => void;
  onClose: () => void;
}) {
  const [catalogs, setCatalogs] = useState<VendorCatalogItem[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [products, setProducts] = useState<VendorProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    listVendorCatalogs()
      .then((c) => {
        setCatalogs(c);
        if (c.length > 0) setSelectedCatalog(c[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCatalog) return;
    setLoading(true);
    listVendorProducts(selectedCatalog, categoryFilter || undefined, search || undefined)
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCatalog, categoryFilter, search]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return Array.from(cats).sort();
  }, [products]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[680px] max-h-[80vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Vendor Catalog</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
          {catalogs.length > 1 && (
            <select
              value={selectedCatalog ?? ""}
              onChange={(e) => setSelectedCatalog(e.target.value)}
              className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.vendorName} — {c.productLine}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
          />
          {categories.length > 1 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">
              <div className="w-4 h-4 border-2 border-nexus-200 border-t-nexus-600 rounded-full animate-spin mr-2" />
              Loading…
            </div>
          ) : products.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">
              No products found
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-nexus-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-lg shrink-0">
                    🗄️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.sku} · {formatDims(p)} · {p.category}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-nexus-700 shrink-0">
                    {formatPrice(p.price)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Room Modal ────────────────────────────────────────────────

function NewRoomModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (name: string, desc: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[400px] bg-white rounded-xl shadow-2xl p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">New Planning Room</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Room Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen, Master Bath"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Notes about scope, style, etc."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onSubmit(name.trim(), desc.trim())}
            disabled={!name.trim()}
            className="px-5 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 disabled:opacity-50"
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Room Detail View ──────────────────────────────────────────────

function RoomDetailView({
  projectId,
  roomId,
  onBack,
}: {
  projectId: string;
  roomId: string;
  onBack: () => void;
}) {
  const [room, setRoom] = useState<PlanningRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genSuccess, setGenSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoom = useCallback(async () => {
    try {
      const data = await getPlanningRoom(projectId, roomId);
      setRoom(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, roomId]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  const handleAddProduct = async (product: VendorProductItem) => {
    setShowPicker(false);
    setError(null);
    try {
      const nextPos = (room?.selections?.length ?? 0) + 1;
      await addSelection(projectId, roomId, {
        vendorProductId: product.id,
        position: nextPos,
        quantity: 1,
      });
      await loadRoom();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (selId: string, status: string) => {
    setError(null);
    try {
      await updateSelection(projectId, selId, { status });
      await loadRoom();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (selId: string) => {
    setError(null);
    try {
      await deleteSelection(projectId, selId);
      await loadRoom();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenSuccess(false);
    setError(null);
    try {
      await generateSelectionSheet(projectId, roomId);
      setGenSuccess(true);
      await loadRoom();
      setTimeout(() => setGenSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const totalPrice = useMemo(() => {
    if (!room) return 0;
    return room.selections.reduce(
      (sum, s) => sum + (s.vendorProduct?.price ?? 0) * (s.quantity ?? 1),
      0,
    );
  }, [room]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-400">
        <div className="w-4 h-4 border-2 border-nexus-200 border-t-nexus-600 rounded-full animate-spin mr-2" />
        Loading room…
      </div>
    );
  }

  if (!room) {
    return (
      <div className="text-center py-16 text-sm text-red-600">
        {error ?? "Room not found"}
        <br />
        <button onClick={onBack} className="mt-4 text-nexus-600 hover:underline">← Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Room header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-nexus-600 hover:text-nexus-700">
          ← Rooms
        </button>
        <h3 className="text-lg font-semibold text-slate-900 flex-1">{room.name}</h3>
        <span className="text-xs text-slate-400">
          {room.selections.length} selection{room.selections.length !== 1 ? "s" : ""}
        </span>
      </div>

      {room.description && (
        <p className="text-sm text-slate-500">{room.description}</p>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Actions bar */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowPicker(true)}
          className="px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 flex items-center gap-1"
        >
          + Add Product
        </button>
        {room.selections.length > 0 && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
          >
            {generating ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>📄 Generate Sheet</>
            )}
          </button>
        )}
        {genSuccess && (
          <span className="self-center text-sm text-green-600 font-medium">✓ Sheet generated!</span>
        )}
      </div>

      {/* Selections table */}
      {room.selections.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="text-4xl">📐</div>
          <p className="text-sm text-slate-500">No selections yet. Add products from the vendor catalog.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="px-4 py-2 text-left w-10">#</th>
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-left">Dimensions</th>
                <th className="px-4 py-2 text-center">Qty</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {room.selections.map((sel) => {
                const p = sel.vendorProduct;
                const badge = STATUS_BADGE[sel.status] ?? STATUS_BADGE.PROPOSED;
                const lineTotal = (p?.price ?? 0) * (sel.quantity ?? 1);
                return (
                  <tr key={sel.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400">{sel.position}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{p?.name ?? "—"}</div>
                      {p && <div className="text-xs text-slate-400">{p.sku}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{p ? formatDims(p) : "—"}</td>
                    <td className="px-4 py-2.5 text-center">{sel.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatPrice(p?.price ?? null)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatPrice(lineTotal)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <select
                        value={sel.status}
                        onChange={(e) => handleStatusChange(sel.id, e.target.value)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer ${badge.bg} ${badge.text}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleDelete(sel.id)}
                        className="text-slate-300 hover:text-red-500 text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                  {formatPrice(totalPrice)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Sheet history */}
      {room.selectionSheets && room.selectionSheets.length > 0 && (
        <div className="text-xs text-slate-400 mt-2">
          Latest sheet: v{room.selectionSheets[0].version} —{" "}
          {new Date(room.selectionSheets[0].generatedAt).toLocaleString()}
        </div>
      )}

      {showPicker && (
        <ProductPicker onSelect={handleAddProduct} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

// ── Main NexPlanTab ───────────────────────────────────────────────

export function NexPlanTab() {
  // Project picker
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Rooms
  const [rooms, setRooms] = useState<PlanningRoomItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Modals
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    listProjects()
      .then((p) => {
        // Filter to active projects
        const active = p.filter((proj: any) => proj.status !== "CLOSED" && proj.status !== "CANCELLED");
        setProjects(active);
        if (active.length > 0 && !selectedProjectId) {
          setSelectedProjectId(active[0].id);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setProjectsLoading(false));
  }, []);

  // Load rooms when project changes
  const loadRooms = useCallback(async () => {
    if (!selectedProjectId) return;
    setRoomsLoading(true);
    setSelectedRoomId(null);
    try {
      const r = await listPlanningRooms(selectedProjectId);
      setRooms(r);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRoomsLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const handleCreateRoom = async (name: string, description: string) => {
    if (!selectedProjectId) return;
    setShowNewRoom(false);
    setError(null);
    try {
      const room = await createPlanningRoom(selectedProjectId, { name, description, sourceType: "MANUAL" });
      await loadRooms();
      setSelectedRoomId(room.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleArchiveRoom = async (roomId: string) => {
    if (!selectedProjectId) return;
    setError(null);
    try {
      await archivePlanningRoom(selectedProjectId, roomId);
      if (selectedRoomId === roomId) setSelectedRoomId(null);
      await loadRooms();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // ── Loading state ──────────────────────────────────────────────
  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-sm text-slate-400">
        <div className="w-4 h-4 border-2 border-nexus-200 border-t-nexus-600 rounded-full animate-spin" />
        Loading projects…
      </div>
    );
  }

  // ── No projects ───────────────────────────────────────────────
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="text-5xl">📐</div>
        <h2 className="text-lg font-semibold text-slate-900">NexPLAN Selections</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          No active projects found. Create a project in NCC to start planning material selections.
        </p>
      </div>
    );
  }

  // ── Room detail view ──────────────────────────────────────────
  if (selectedRoomId && selectedProjectId) {
    return (
      <RoomDetailView
        projectId={selectedProjectId}
        roomId={selectedRoomId}
        onBack={() => setSelectedRoomId(null)}
      />
    );
  }

  // ── Main view: project picker + room list ─────────────────────
  return (
    <div className="space-y-4">
      {/* Project picker */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 shrink-0">Project</label>
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.city ? ` — ${p.city}, ${p.state}` : ""}
              </option>
            ))}
          </select>
        </div>
        {selectedProject && (
          <div className="mt-2 text-xs text-slate-400">
            {selectedProject.addressLine1 && `${selectedProject.addressLine1}, `}
            {selectedProject.city} {selectedProject.state}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Room list header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">
          Planning Rooms
        </h3>
        <button
          onClick={() => setShowNewRoom(true)}
          className="px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700"
        >
          + New Room
        </button>
      </div>

      {/* Room list */}
      {roomsLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-nexus-200 border-t-nexus-600 rounded-full animate-spin mr-2" />
          Loading rooms…
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 bg-white rounded-xl border border-slate-200 text-center">
          <div className="text-4xl">🏠</div>
          <p className="text-sm text-slate-500">
            No planning rooms yet. Create one to start selecting materials.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rooms.map((room) => {
            const selCount = room._count?.selections ?? 0;
            const estTotal = room.selections?.reduce(
              (s, sel) => s + (sel.vendorProduct?.price ?? 0),
              0,
            ) ?? 0;

            return (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
              >
                <div className="w-11 h-11 bg-nexus-50 rounded-lg flex items-center justify-center text-xl shrink-0">
                  🏠
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{room.name}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500">
                      {room.sourceType}
                    </span>
                  </div>
                  {room.description && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{room.description}</p>
                  )}
                  <div className="flex gap-3 mt-1 text-xs text-slate-400">
                    <span>{selCount} selection{selCount !== 1 ? "s" : ""}</span>
                    {estTotal > 0 && <span>~{formatPrice(estTotal)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArchiveRoom(room.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-red-500 transition-opacity"
                    title="Archive room"
                  >
                    🗑
                  </button>
                  <span className="text-slate-300">›</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* New Room Modal */}
      {showNewRoom && (
        <NewRoomModal onSubmit={handleCreateRoom} onClose={() => setShowNewRoom(false)} />
      )}
    </div>
  );
}
