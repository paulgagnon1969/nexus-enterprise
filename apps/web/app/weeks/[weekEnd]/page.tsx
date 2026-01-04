import prisma from "@repo/database/src/client";

export const dynamic = "force-dynamic";

function formatDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = ["ALL", "ACTIVE", "INACTIVE"] as const;
const PROJECT_OPTIONS = ["ALL", "CBS", "CCT"] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];
type ProjectFilter = (typeof PROJECT_OPTIONS)[number];

type PageProps = {
  params: { weekEnd: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

function normalizeStatus(value: unknown): StatusFilter {
  const v = (Array.isArray(value) ? value[0] : value) ?? "ALL";
  const upper = String(v).toUpperCase();
  return (STATUS_OPTIONS.includes(upper as StatusFilter)
    ? upper
    : "ALL") as StatusFilter;
}

function normalizeProject(value: unknown): ProjectFilter {
  const v = (Array.isArray(value) ? value[0] : value) ?? "ALL";
  const upper = String(v).toUpperCase();
  return (PROJECT_OPTIONS.includes(upper as ProjectFilter)
    ? upper
    : "ALL") as ProjectFilter;
}

function buildUrl(weekEnd: string, status: StatusFilter, project: ProjectFilter) {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (project !== "ALL") params.set("project", project);
  const qs = params.toString();
  return qs ? `/weeks/${encodeURIComponent(weekEnd)}?${qs}` : `/weeks/${encodeURIComponent(weekEnd)}`;
}

export default async function WeekDetailPage({ params, searchParams }: PageProps) {
  const { weekEnd } = params;
  const status = normalizeStatus(searchParams?.status);
  const project = normalizeProject(searchParams?.project);

  const conditions: string[] = [
    'ww."weekEndDate"::date = $1::date',
    'ww."totalHours" > 0',
  ];
  const paramsArr: any[] = [weekEnd];

  if (project === "CBS" || project === "CCT") {
    conditions.push('ww."projectCode" = $2');
    paramsArr.push(project);
  }

  if (status === "ACTIVE") {
    conditions.push('(w.status = \'ACTIVE\' OR w.status IS NULL)');
  } else if (status === "INACTIVE") {
    conditions.push("w.status = 'INACTIVE'");
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // All workers with hours > 0 for this week, optionally filtered by project and status
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ww.*, (ww."totalHours" * COALESCE(w."defaultPayRate", 0)) AS "estimatedPay", w."fullName", w."primaryClassCode", w."defaultProjectCode", w."phone", w.status FROM "WorkerWeek" ww JOIN "Worker" w ON w.id = ww."workerId" ${whereClause} ORDER BY w."fullName", ww."projectCode"`,
    ...paramsArr,
  )) as {
    id: string;
    workerId: string;
    weekEndDate: Date;
    projectCode: string;
    totalHours: number;
    estimatedPay: number | null;
    fullName: string;
    primaryClassCode: string | null;
    defaultProjectCode: string | null;
    phone: string | null;
    status: string | null;
  }[];

  const weekLabel = weekEnd;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Week {weekLabel}</h1>
      <p className="text-sm text-gray-600">
        All workers with hours recorded for this work week. Click a worker to
        see their full weekly history.
      </p>

      <div className="flex items-center gap-4 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-medium">Project:</span>
          {PROJECT_OPTIONS.map((opt) => {
            const href = buildUrl(weekEnd, status, opt);
            const isActive = project === opt;
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
                {opt === "ALL" ? "ALL" : opt}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          {STATUS_OPTIONS.map((opt) => {
            const href = buildUrl(weekEnd, opt, project);
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
      </div>

      <div className="border rounded max-h-[70vh] overflow-auto text-sm">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Worker</th>
              <th className="border px-2 py-1 text-left">Class</th>
              <th className="border px-2 py-1 text-left">Project</th>
              <th className="border px-2 py-1 text-right">Hours</th>
              <th className="border px-2 py-1 text-right">Est Pay</th>
              <th className="border px-2 py-1 text-left">Status</th>
              <th className="border px-2 py-1 text-left">Phone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.workerId}-${r.projectCode}`}>
                <td className="border px-2 py-1">
                  <a
                    href={`/workers/${r.workerId}/weeks`}
                    className="text-blue-600 hover:underline"
                  >
                    {r.fullName}
                  </a>
                </td>
                <td className="border px-2 py-1">
                  {r.primaryClassCode ?? ""}
                </td>
                <td className="border px-2 py-1">{r.projectCode}</td>
                <td className="border px-2 py-1 text-right">
                  {r.totalHours != null ? Number(r.totalHours).toFixed(1) : ""}
                </td>
                <td className="border px-2 py-1 text-right">
                  {r.estimatedPay != null
                    ? Number(r.estimatedPay).toFixed(2)
                    : ""}
                </td>
                <td className="border px-2 py-1">{r.status ?? ""}</td>
                <td className="border px-2 py-1">
                  {r.phone ? (
                    <a
                      href={`tel:${String(r.phone).replace(/[^\\d+]/g, "")}`}
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {r.phone}
                    </a>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="border px-2 py-4 text-center text-gray-500"
                >
                  No workers recorded any hours for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
