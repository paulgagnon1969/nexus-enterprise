"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Popup, NavigationControl, FullscreenControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ── Types ───────────────────────────────────────────────────────────────

interface LogisticsCenter {
  lat: number | null;
  lng: number | null;
  name: string;
  address: string;
}

interface LogisticsAsset {
  usageId: string;
  assetId: string;
  name: string;
  code: string | null;
  assetType: string;
  manufacturer: string | null;
  model: string | null;
  location: {
    id: string;
    name: string;
    type: string;
    lat: number | null;
    lng: number | null;
  } | null;
}

interface InventoryItem {
  sku: string;
  name: string;
  quantity: number;
  uom: string;
}

interface InventoryLocation {
  id: string;
  name: string;
  type: string;
  lat: number | null;
  lng: number | null;
  items: InventoryItem[];
}

interface NearbyProject {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  distanceMiles: number;
}

interface LogisticsData {
  center: LogisticsCenter;
  assets: LogisticsAsset[];
  inventory: InventoryLocation[];
  nearbyProjects: NearbyProject[];
}

// ── Pin SVGs ────────────────────────────────────────────────────────────

function ProjectPin() {
  return (
    <div style={{ position: "relative", cursor: "pointer" }}>
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
        <path
          d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z"
          fill="#2563eb"
        />
        <circle cx="16" cy="16" r="8" fill="#ffffff" />
        <circle cx="16" cy="16" r="4" fill="#2563eb" />
      </svg>
    </div>
  );
}

function AssetPin({ label }: { label?: string }) {
  return (
    <div style={{ position: "relative", cursor: "pointer", textAlign: "center" }}>
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
        <path
          d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
          fill="#ea580c"
        />
        <circle cx="14" cy="14" r="6" fill="#ffffff" />
        <text x="14" y="17" textAnchor="middle" fill="#ea580c" fontSize="9" fontWeight="700">⚙</text>
      </svg>
      {label && (
        <div style={{
          position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
          background: "#ea580c", color: "#fff", fontSize: 9, fontWeight: 700,
          padding: "1px 4px", borderRadius: 4, whiteSpace: "nowrap",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

function InventoryPin({ count }: { count: number }) {
  return (
    <div style={{ position: "relative", cursor: "pointer", textAlign: "center" }}>
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
        <path
          d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
          fill="#059669"
        />
        <circle cx="14" cy="14" r="6" fill="#ffffff" />
      </svg>
      <div style={{
        position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
        background: "#059669", color: "#fff", fontSize: 9, fontWeight: 700,
        padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap",
      }}>
        {count}
      </div>
    </div>
  );
}

function NearbyProjectPin() {
  return (
    <div style={{ cursor: "pointer" }}>
      <svg width="20" height="26" viewBox="0 0 20 26" fill="none">
        <path
          d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 16 10 16s10-8.5 10-16C20 4.477 15.523 0 10 0z"
          fill="#6b7280"
        />
        <circle cx="10" cy="10" r="4" fill="#ffffff" />
      </svg>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────

interface LogisticsTabProps {
  projectId: string;
}

export default function LogisticsTab({ projectId }: LogisticsTabProps) {
  const mapRef = useRef<MapRef>(null);
  const [data, setData] = useState<LogisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [popupInfo, setPopupInfo] = useState<{
    type: "asset" | "inventory" | "nearby";
    lat: number;
    lng: number;
    content: any;
  } | null>(null);

  // Fetch logistics data
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!token) return;

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/projects/${projectId}/logistics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d: LogisticsData) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load logistics data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  const centerLat = data?.center?.lat ?? 39.8283;
  const centerLng = data?.center?.lng ?? -98.5795;
  const hasCoords = data?.center?.lat != null && data?.center?.lng != null;

  const totalAssets = data?.assets?.length ?? 0;
  const totalInventoryItems = data?.inventory?.reduce((s, l) => s + l.items.length, 0) ?? 0;
  const totalNearby = data?.nearbyProjects?.length ?? 0;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 500, color: "#6b7280" }}>
        Loading logistics map...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: "#991b1b", background: "#fef2f2", borderRadius: 8, border: "1px solid #fca5a5", margin: "12px 0" }}>
        {error}
      </div>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 20, background: "#fffbeb", borderRadius: 8, border: "1px solid #fcd34d", margin: "12px 0", fontSize: 13 }}>
        <strong>Mapbox token not configured.</strong> Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to enable the logistics map.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 260px)", minHeight: 500, marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      {/* ── Map ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{
            longitude: centerLng,
            latitude: centerLat,
            zoom: hasCoords ? 13 : 4,
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
        >
          <NavigationControl position="top-right" />
          <FullscreenControl position="top-right" />

          {/* Project center pin */}
          {hasCoords && (
            <Marker longitude={centerLng} latitude={centerLat} anchor="bottom">
              <ProjectPin />
            </Marker>
          )}

          {/* Asset pins */}
          {data?.assets?.map((a) => {
            const loc = a.location;
            if (!loc?.lat || !loc?.lng) return null;
            return (
              <Marker
                key={`asset-${a.usageId}`}
                longitude={loc.lng}
                latitude={loc.lat}
                anchor="bottom"
                onClick={(e: any) => {
                  e.originalEvent.stopPropagation();
                  setPopupInfo({
                    type: "asset",
                    lat: loc.lat!,
                    lng: loc.lng!,
                    content: a,
                  });
                }}
              >
                <AssetPin label={a.code ?? undefined} />
              </Marker>
            );
          })}

          {/* Inventory location pins */}
          {data?.inventory?.map((inv) => {
            if (!inv.lat || !inv.lng) return null;
            return (
              <Marker
                key={`inv-${inv.id}`}
                longitude={inv.lng}
                latitude={inv.lat}
                anchor="bottom"
                onClick={(e: any) => {
                  e.originalEvent.stopPropagation();
                  setPopupInfo({
                    type: "inventory",
                    lat: inv.lat!,
                    lng: inv.lng!,
                    content: inv,
                  });
                }}
              >
                <InventoryPin count={inv.items.length} />
              </Marker>
            );
          })}

          {/* Nearby project pins */}
          {data?.nearbyProjects?.map((np) => (
            <Marker
              key={`np-${np.id}`}
              longitude={np.lng}
              latitude={np.lat}
              anchor="bottom"
              onClick={(e: any) => {
                e.originalEvent.stopPropagation();
                setPopupInfo({
                  type: "nearby",
                  lat: np.lat,
                  lng: np.lng,
                  content: np,
                });
              }}
            >
              <NearbyProjectPin />
            </Marker>
          ))}

          {/* Popup */}
          {popupInfo && (
            <Popup
              longitude={popupInfo.lng}
              latitude={popupInfo.lat}
              anchor="bottom"
              onClose={() => setPopupInfo(null)}
              closeOnClick={false}
              style={{ maxWidth: 280 }}
            >
              <div style={{ fontSize: 12, padding: 4 }}>
                {popupInfo.type === "asset" && (() => {
                  const a = popupInfo.content as LogisticsAsset;
                  return (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{a.name}</div>
                      <div style={{ color: "#6b7280" }}>
                        {[a.manufacturer, a.model].filter(Boolean).join(" ")}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <span style={{
                          display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: "#fff7ed", color: "#ea580c", border: "1px solid #fed7aa",
                        }}>
                          {a.assetType}
                        </span>
                      </div>
                    </>
                  );
                })()}

                {popupInfo.type === "inventory" && (() => {
                  const inv = popupInfo.content as InventoryLocation;
                  return (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{inv.name}</div>
                      <div style={{ color: "#6b7280", marginBottom: 4 }}>{inv.type}</div>
                      {inv.items.slice(0, 5).map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                          <span>{item.name}</span>
                          <span style={{ fontWeight: 600 }}>{item.quantity} {item.uom}</span>
                        </div>
                      ))}
                      {inv.items.length > 5 && (
                        <div style={{ color: "#6b7280", fontSize: 10, marginTop: 2 }}>
                          +{inv.items.length - 5} more items
                        </div>
                      )}
                    </>
                  );
                })()}

                {popupInfo.type === "nearby" && (() => {
                  const np = popupInfo.content as NearbyProject;
                  return (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>{np.name}</div>
                      <div style={{ color: "#6b7280" }}>{np.city}, {np.state}</div>
                      <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>
                        {np.distanceMiles} mi away
                      </div>
                    </>
                  );
                })()}
              </div>
            </Popup>
          )}
        </Map>

        {/* Map overlay: no coords warning */}
        {!hasCoords && (
          <div style={{
            position: "absolute", top: 12, left: 12, right: 12,
            background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
            padding: "10px 14px", fontSize: 12, color: "#92400e", zIndex: 10,
          }}>
            This project has no geocoded coordinates. Add latitude/longitude to the project to center the map on the job site.
          </div>
        )}

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          style={{
            position: "absolute", top: 12, left: 12,
            background: "#fff", border: "1px solid #d1d5db", borderRadius: 6,
            padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600,
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)", zIndex: 10,
            display: hasCoords ? "block" : "none",
          }}
        >
          {sidebarOpen ? "◀ Hide Panel" : "▶ Show Panel"}
        </button>

        {/* Legend */}
        <div style={{
          position: "absolute", bottom: 12, left: 12,
          background: "#fff", border: "1px solid #d1d5db", borderRadius: 8,
          padding: "8px 12px", fontSize: 11, zIndex: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Legend</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", display: "inline-block" }} />
            Project Site
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ea580c", display: "inline-block" }} />
            Equipment / Asset
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", display: "inline-block" }} />
            Inventory Location
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#6b7280", display: "inline-block" }} />
            Nearby Project
          </div>
        </div>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={{
          width: 320, borderLeft: "1px solid #e5e7eb", background: "#fff",
          overflowY: "auto", fontSize: 13,
        }}>
          {/* Header */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Logistics Overview</div>
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#6b7280" }}>
              <span>{totalAssets} asset{totalAssets !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{totalInventoryItems} material{totalInventoryItems !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{totalNearby} nearby</span>
            </div>
          </div>

          {/* Deployed Assets */}
          <div style={{ borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "#ea580c", background: "#fff7ed" }}>
              Equipment & Assets ({totalAssets})
            </div>
            {data?.assets && data.assets.length > 0 ? (
              data.assets.map((a) => (
                <div
                  key={a.usageId}
                  style={{
                    padding: "8px 14px", borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                  }}
                  onClick={() => {
                    if (a.location?.lat && a.location?.lng) {
                      mapRef.current?.flyTo({ center: [a.location.lng, a.location.lat], zoom: 15, duration: 800 });
                      setPopupInfo({ type: "asset", lat: a.location.lat, lng: a.location.lng, content: a });
                    }
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {[a.manufacturer, a.model].filter(Boolean).join(" ") || a.assetType}
                    {a.code && ` · ${a.code}`}
                  </div>
                  {a.location && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>📍 {a.location.name}</div>}
                </div>
              ))
            ) : (
              <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: 12 }}>No assets deployed</div>
            )}
          </div>

          {/* Inventory */}
          <div style={{ borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "#059669", background: "#ecfdf5" }}>
              Materials ({totalInventoryItems})
            </div>
            {data?.inventory && data.inventory.length > 0 ? (
              data.inventory.map((inv) => (
                <div key={inv.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <div
                    style={{
                      padding: "8px 14px", cursor: inv.lat ? "pointer" : "default",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                    onClick={() => {
                      if (inv.lat && inv.lng) {
                        mapRef.current?.flyTo({ center: [inv.lng, inv.lat], zoom: 15, duration: 800 });
                        setPopupInfo({ type: "inventory", lat: inv.lat, lng: inv.lng, content: inv });
                      }
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{inv.name}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{inv.type}</div>
                    </div>
                    <span style={{
                      background: "#d1fae5", color: "#065f46", padding: "1px 6px",
                      borderRadius: 4, fontSize: 10, fontWeight: 700,
                    }}>
                      {inv.items.length}
                    </span>
                  </div>
                  {inv.items.slice(0, 3).map((item, i) => (
                    <div key={i} style={{ padding: "2px 14px 2px 28px", fontSize: 11, color: "#6b7280", display: "flex", justifyContent: "space-between" }}>
                      <span>{item.name}</span>
                      <span>{item.quantity} {item.uom}</span>
                    </div>
                  ))}
                  {inv.items.length > 3 && (
                    <div style={{ padding: "2px 14px 6px 28px", fontSize: 10, color: "#9ca3af" }}>
                      +{inv.items.length - 3} more
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: 12 }}>No materials tracked</div>
            )}
          </div>

          {/* Nearby Projects */}
          <div>
            <div style={{ padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "#374151", background: "#f3f4f6" }}>
              Nearby Projects ({totalNearby})
            </div>
            {data?.nearbyProjects && data.nearbyProjects.length > 0 ? (
              data.nearbyProjects.map((np) => (
                <div
                  key={np.id}
                  style={{
                    padding: "8px 14px", borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                  onClick={() => {
                    mapRef.current?.flyTo({ center: [np.lng, np.lat], zoom: 14, duration: 800 });
                    setPopupInfo({ type: "nearby", lat: np.lat, lng: np.lng, content: np });
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{np.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{np.city}, {np.state}</div>
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                    {np.distanceMiles} mi
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: 12 }}>No nearby projects</div>
            )}
          </div>

          {/* Suppliers placeholder */}
          <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
              🏪 Local suppliers discovery coming soon — construction supply, hardware stores, lumber yards within 10 mi of the project site.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
