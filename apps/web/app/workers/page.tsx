import prisma from "@repo/database/src/client";
import { BiaImportWidget } from "./BiaImportWidget";

export const dynamic = "force-dynamic";

const SCOPE_OPTIONS = ["ALL", "CBS", "CCT", "BOTH"] as const;
const STATUS_OPTIONS = ["ALL", "ACTIVE", "INACTIVE"] as const;
const SORT_OPTIONS = ["LAST", "FIRST"] as const;

type ScopeFilter = (typeof SCOPE_OPTIONS)[number];
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type SortKey = (typeof SORT_OPTIONS)[number];

type PageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

function normalizeScope(value: unknown): ScopeFilter {
  const v = (Array.isArray(value) ? value[0] : value) ?? "ALL";
  const upper = String(v).toUpperCase();
  return (SCOPE_OPTIONS.includes(upper as ScopeFilter)
    ? upper
    : "ALL") as ScopeFilter;
}

function normalizeStatus(value: unknown): StatusFilter {
  const v = (Array.isArray(value) ? value[0] : value) ?? "ALL";
  const upper = String(v).toUpperCase();
  return (STATUS_OPTIONS.includes(upper as StatusFilter)
    ? upper
    : "ALL") as StatusFilter;
}

function normalizeSort(value: unknown): SortKey {
  const v = (Array.isArray(value) ? value[0] : value) ?? "LAST";
  const upper = String(v).toUpperCase();
  return (SORT_OPTIONS.includes(upper as SortKey) ? upper : "LAST") as SortKey;
}

function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

function buildUrl(scope: ScopeFilter, status: StatusFilter, sort: SortKey): string {
  const params = new URLSearchParams();
  if (scope !== "ALL") params.set("scope", scope);
  if (status !== "ALL") params.set("status", status);
  if (sort !== "LAST") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/workers?${qs}` : "/workers";
}

export default async function WorkersPage({ searchParams }: PageProps) {
  const scope = normalizeScope(searchParams?.scope);
  const status = normalizeStatus(searchParams?.status);
  const sort = normalizeSort(searchParams?.sort);

  // Use raw SQL to query the Worker table to avoid issues if the generated
  // Prisma client instance used in this app build does not surface the
  // `worker` model property for some reason.
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (scope !== "ALL") {
    conditions.push(`"defaultProjectCode" = $${paramIndex}`);
    params.push(scope);
    paramIndex += 1;
  }

  if (status === "ACTIVE") {
    conditions.push('(status = \'ACTIVE\' OR status IS NULL)');
  } else if (status === "INACTIVE") {
    conditions.push("status = 'INACTIVE'");
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const orderByClause =
    sort === "FIRST"
      ? 'ORDER BY "firstName" ASC, "lastName" ASC'
      : 'ORDER BY "lastName" ASC, "firstName" ASC';

  const sql = `SELECT * FROM "Worker" ${whereClause} ${orderByClause}`;

  const workers = (await prisma.$queryRawUnsafe(sql, ...params)) as any[];

  // Derive the last 52 distinct work weeks (most recent first) for the grid.
  const weekRows = (await prisma.$queryRawUnsafe(
    'SELECT DISTINCT "weekEndDate"::date as "weekDate" FROM "WorkerWeek" ORDER BY "weekDate" ASC',
  )) as { weekDate: Date }[];
  const allWeekDates = weekRows
    .map((r) => {
      const dt = r.weekDate instanceof Date ? r.weekDate : new Date(r.weekDate as any);
      if (Number.isNaN(dt.getTime())) return "";
      return dt.toISOString().slice(0, 10);
    })
    .filter(Boolean);
  const last52 = allWeekDates.slice(-52);
  const weekColumns = last52.slice().reverse(); // latest on the left

  // Aggregate total hours per worker per week (across all projects) and track
  // which jobs (CBS / CCT) they worked in those weeks.
  let hoursRows: { workerId: string; weekDate: Date; projectCode: string; hours: number }[] = [];
  if (weekColumns.length > 0) {
    const inList = weekColumns.map((d) => `'${d}'`).join(", ");
    hoursRows = (await prisma.$queryRawUnsafe(
      `SELECT "workerId", "weekEndDate"::date as "weekDate", "projectCode", SUM("totalHours") as "hours" FROM "WorkerWeek" WHERE "weekEndDate"::date IN (${inList}) GROUP BY "workerId", "weekDate", "projectCode"`,
    )) as { workerId: string; weekDate: Date; projectCode: string; hours: number }[];
  }

  type WeekAgg = { totalHours: number; projects: Set<string> };

  const perWorkerWeek = new Map<string, Map<string, WeekAgg>>();

  for (const row of hoursRows) {
    const dt = row.weekDate instanceof Date ? row.weekDate : new Date(row.weekDate as any);
    if (Number.isNaN(dt.getTime())) continue;
    const wk = dt.toISOString().slice(0, 10);

    let byWeek = perWorkerWeek.get(row.workerId);
    if (!byWeek) {
      byWeek = new Map();
      perWorkerWeek.set(row.workerId, byWeek);
    }
    let agg = byWeek.get(wk);
    if (!agg) {
      agg = { totalHours: 0, projects: new Set() };
      byWeek.set(wk, agg);
    }
    agg.totalHours += Number(row.hours || 0);
    if (row.projectCode) {
      agg.projects.add(row.projectCode);
    }
  }

  // Map worker -> week -> total hours (for the grid).
  const hoursByWorker = new Map<string, Map<string, number>>();
  // Map worker -> job label for their latest week with hours (CBS / CCT / Multi).
  const jobLabelByWorker = new Map<string, string>();

  for (const [workerId, byWeek] of perWorkerWeek.entries()) {
    const hoursMap = new Map<string, number>();
    for (const [wk, agg] of byWeek.entries()) {
      hoursMap.set(wk, agg.totalHours);
    }
    hoursByWorker.set(workerId, hoursMap);

    // Find latest week in our 52-week window where this worker has hours.
    for (const wk of weekColumns) {
      const agg = byWeek.get(wk);
      if (!agg || agg.totalHours <= 0) continue;
      const projects = Array.from(agg.projects.values()).filter(Boolean);
      let label = "";
      const distinct = Array.from(new Set(projects.map((p) => p.toUpperCase())));
      if (distinct.length === 1) {
        label = distinct[0];
      } else if (distinct.length > 1) {
        label = "Multi";
      }
      if (label) {
        jobLabelByWorker.set(workerId, label);
      }
      break;
    }
  }

  const formatDate = (d: Date | string | null) => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Workers (BIA / LCP Import)</h1>
      <p className="text-sm text-gray-600">
        Listing of all workers imported from LCP upload templates and Payroll
        Admin. Use the scope and status filters to view CBS, CCT, BOTH, and
        Active/Inactive workers.
      </p>

      <div className="flex items-center text-sm flex-wrap gap-6">
        <div className="flex items-center gap-2 pr-4 mr-4 border-r border-gray-300">
          <span className="font-medium">Scope:</span>
          {SCOPE_OPTIONS.map((opt) => {
            const href = buildUrl(opt, status, sort);
            const isActive = scope === opt;
            return (
              <a
                key={opt}
                href={href}
                className={
                  "px-2 py-1 rounded border text-xs" +
                  (isActive
                    ? " bg-blue-600 text-white border-blue-600"
                    : " bg-white text-gray-800 border-gray-300")
                }
              >
                {opt}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pr-4 mr-4 border-r border-gray-300">
          <span className="font-medium">Status:</span>
          {STATUS_OPTIONS.map((opt) => {
            const href = buildUrl(scope, opt, sort);
            const isActive = status === opt;
            return (
              <a
                key={opt}
                href={href}
                className={
                  "px-2 py-1 rounded border text-xs" +
                  (isActive
                    ? " bg-green-600 text-white border-green-600"
                    : " bg-white text-gray-800 border-gray-300")
                }
              >
                {opt}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium">Sort:</span>
          {SORT_OPTIONS.map((opt) => {
            const href = buildUrl(scope, status, opt);
            const isActive = sort === opt;
            return (
              <a
                key={opt}
                href={href}
                className={
                  "px-2 py-1 rounded border text-xs" +
                  (isActive
                    ? " bg-purple-600 text-white border-purple-600"
                    : " bg-white text-gray-800 border-gray-300")
                }
              >
                {opt === "LAST" ? "Last Name" : "First Name"}
              </a>
            );
          })}
        </div>

        <span className="ml-auto text-xs text-gray-500">
          Total workers: {workers.length}
        </span>
      </div>

      <BiaImportWidget />

      <div className="border rounded max-h-[70vh] overflow-auto text-sm">
        <table className="min-w-full border-separate border-spacing-x-2 border-spacing-y-1">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Last Name</th>
              <th className="border px-2 py-1 text-left">First Name</th>
              <th className="border px-2 py-1 text-left">Class</th>
              <th className="border px-2 py-1 text-left">Job</th>
              <th className="border px-2 py-1 text-left">Phone</th>
              {weekColumns.map((week) => (
                <th
                  key={week}
                  className="border px-1 py-1 text-center text-[10px]"
                  title={`Ending ${week.replace(/-/g, ".")}`}
                >
                  {(() => {
                    const dt = new Date(week);
                    if (Number.isNaN(dt.getTime())) return week;
                    const ww = getIsoWeek(dt);
                    const label = `WW ${ww.toString().padStart(2, "0")}`;
                    return (
                      <a
                        href={`/weeks/${week}`}
                        className="text-blue-700 hover:underline"
                      >
                        {label}
                      </a>
                    );
                  })()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map((w, idx) => (
              <tr
                key={w.id}
                className={idx % 2 === 0 ? "bg-white" : "bg-amber-50"}
              >
                <td className="border border-gray-300 px-2 py-1">
                  <a
                    href={`/workers/${w.id}/weeks`}
                    className="text-blue-600 hover:underline"
                  >
                    {w.lastName}
                  </a>
                </td>
                <td className="border border-gray-300 px-2 py-1">{w.firstName}</td>
                <td className="border border-gray-300 px-2 py-1">{w.primaryClassCode ?? ""}</td>
                <td className="border border-gray-300 px-2 py-1">
                  {jobLabelByWorker.get(w.id) ?? w.defaultProjectCode ?? ""}
                </td>
                <td className="border border-gray-300 px-2 py-1">{w.phone ?? ""}</td>
                {weekColumns.map((week) => {
                  const byWeek = hoursByWorker.get(w.id);
                  const hours = byWeek?.get(week) ?? 0;
                  return (
                    <td
                      key={week}
                      className="border border-gray-300 px-1 py-0.5 text-right text-xs"
                    >
                      {hours > 0 ? hours.toFixed(1) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="border px-2 py-4 text-center text-gray-500"
                >
                  No workers found for this filter. Try a different filter or run
                  the BIA import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
