"use client";

export const dynamic = "force-dynamic";

// Workers admin list, implemented against the Nest API (no direct Prisma usage
// from the web app). For each worker, we show a small "market" chip using the
// same /workers/:id/market-comp endpoint used on the Company User Profile page.

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface WorkerListRow {
  id: string;
  fullName: string | null;
}

interface WorkerMarketComp {
  worker?: {
    id: string;
    name: string | null;
    state: string | null;
    baseHourly: number | null;
    cpTotalHourly: number | null;
  };
  market?: {
    stateCode: string;
    socCode: string;
    occupationName: string;
    hourlyMedian: number | null;
  };
  comparisons?: {
    baseVsMedian: number | null;
  };
  message?: string;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [marketById, setMarketById] = useState<Record<string, WorkerMarketComp | null>>({});
  const [marketErrorById, setMarketErrorById] = useState<Record<string, string | null>>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Load workers + current user info from API
  useEffect(() => {
    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [workersRes, meRes] = await Promise.all([
          fetch(`${API_BASE}/workers`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!workersRes.ok) {
          const text = await workersRes.text().catch(() => "");
          throw new Error(text || `Failed to load workers (${workersRes.status})`);
        }
        const workersJson = await workersRes.json();
        const list = Array.isArray(workersJson?.workers) ? workersJson.workers : [];
        setWorkers(list);

        if (meRes.ok) {
          const me = await meRes.json();
          setIsSuperAdmin(me?.globalRole === "SUPER_ADMIN");
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load workers.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);
  useEffect(() => {
    // After workers are loaded, lazily fetch market comparison for each worker.
    if (!isSuperAdmin) return;
    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (!token) return;

    let cancelled = false;

    async function loadMarketFor(workerId: string) {
      try {
        const res = await fetch(`${API_BASE}/workers/${workerId}/market-comp`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load market comparison (${res.status})`);
        }
        const json = (await res.json()) as WorkerMarketComp;
        if (!cancelled) {
          setMarketById(prev => ({ ...prev, [workerId]: json }));
        }
      } catch (e: any) {
        if (!cancelled) {
          setMarketErrorById(prev => ({ ...prev, [workerId]: e?.message ?? "Failed to load market comparison." }));
        }
      }
    }

    for (const w of workers) {
      if (!w?.id) continue;
      if (marketById[w.id] || marketErrorById[w.id]) continue;
      void loadMarketFor(w.id);
    }

    return () => {
      cancelled = true;
    };
  }, [workers, marketById, marketErrorById]);

  const fmtCurrency = (value: number | null | undefined) =>
    typeof value === "number" ? value.toFixed(2) : "—";

  const fmtSignedCurrency = (value: number | null | undefined) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    const fixed = value.toFixed(2);
    if (value > 0) return `+${fixed}`;
    return fixed;
  };

  const getMarketBadge = (entry: WorkerMarketComp | null | undefined) => {
    if (!entry || !entry.market || !entry.comparisons) return { label: "No data", color: "#6b7280" };
    const delta = entry.comparisons.baseVsMedian;
    if (typeof delta !== "number" || Number.isNaN(delta)) {
      return { label: "No data", color: "#6b7280" };
    }
    if (delta > 1) return { label: "Above market", color: "#16a34a" };
    if (delta < -1) return { label: "Below market", color: "#b91c1c" };
    return { label: "At market", color: "#374151" };
  };

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workers admin</h1>
          <p className="text-sm text-gray-600">
            Imported field workers from Certified Payroll / BIA data, with a quick
            view of how their base pay compares to state occupational wage
            benchmarks.
          </p>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-600">Loading workers…</p>
      )}
      {error && !loading && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && workers.length === 0 && (
        <p className="text-sm text-gray-600">No workers found.</p>
      )}

      {!loading && !error && workers.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-3 py-2">Worker</th>
                {isSuperAdmin && <th className="px-3 py-2">Base / Median</th>}
                {isSuperAdmin && <th className="px-3 py-2">Market</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {workers.map(w => {
                const market = marketById[w.id];
                const marketErr = marketErrorById[w.id];
                const badge = getMarketBadge(market);

                return (
                  <tr key={w.id}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-gray-900 text-sm">
                        <a
                          href={`/workers/${w.id}/weeks`}
                          className="text-blue-600 hover:underline"
                        >
                          {w.fullName || w.id}
                        </a>
                      </div>
                      {market?.worker?.state && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {market.worker.state}
                        </div>
                      )}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-3 py-2 align-top text-xs text-gray-700">
                        {market ? (
                          <div>
                            <div>
                              Base: ${fmtCurrency(market.worker?.baseHourly)}
                            </div>
                            <div>
                              Median: ${fmtCurrency(market.market?.hourlyMedian)}
                            </div>
                            {market.comparisons && (
                              <div>
                                Δ: {fmtSignedCurrency(market.comparisons.baseVsMedian)}
                              </div>
                            )}
                          </div>
                        ) : marketErr ? (
                          <span className="text-red-600">{marketErr}</span>
                        ) : (
                          <span className="text-gray-400">Loading…</span>
                        )}
                      </td>
                    )}
                    {isSuperAdmin && (
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            border: `1px solid ${badge.color}`,
                            color: badge.color,
                            backgroundColor: "#f9fafb",
                          }}
                        >
                          {badge.label}
                        </span>
                        {market?.market && (
                          <div className="mt-0.5 text-[11px] text-gray-500">
                            {market.market.stateCode} · {market.market.socCode}
                          </div>
                        )}
                      </td>
                    )}
                        <div>
                          <div>
                            Base: ${fmtCurrency(market.worker?.baseHourly)}
                          </div>
                          <div>
                            Median: ${fmtCurrency(market.market?.hourlyMedian)}
                          </div>
                          {market.comparisons && (
                            <div>
                              Δ: {fmtSignedCurrency(market.comparisons.baseVsMedian)}
                            </div>
                          )}
                        </div>
                      ) : marketErr ? (
                        <span className="text-red-600">{marketErr}</span>
                      ) : (
                        <span className="text-gray-400">Loading…</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          border: `1px solid ${badge.color}`,
                          color: badge.color,
                          backgroundColor: "#f9fafb",
                        }}
                      >
                        {badge.label}
                      </span>
                      {market?.market && (
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {market.market.stateCode} · {market.market.socCode}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
