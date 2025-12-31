import prisma from "@repo/database/src/client";

export const dynamic = "force-dynamic";

function formatDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

type PageProps = {
  params: { id: string };
};

export default async function WorkerWeeksPage({ params }: PageProps) {
  const { id } = params;

  const worker = (await prisma.$queryRawUnsafe(
    'SELECT id, "fullName", status, "defaultProjectCode", "primaryClassCode" FROM "Worker" WHERE id = $1',
    id,
  )) as {
    id: string;
    fullName: string;
    status: string | null;
    defaultProjectCode: string | null;
    primaryClassCode: string | null;
  }[];

  const w = worker[0];

  if (!w) {
    return (
      <main className="p-6">
        <p className="text-sm text-red-600">Worker not found.</p>
      </main>
    );
  }

  // Get the global list of distinct weeks so we can show 0-hour weeks
  const weeks = (await prisma.$queryRawUnsafe(
    'SELECT DISTINCT "weekEndDate"::date as "weekDate" FROM "WorkerWeek" ORDER BY "weekDate" ASC',
  )) as { weekDate: Date }[];

  // Get all WorkerWeek rows for this worker
  const wwRows = (await prisma.$queryRawUnsafe(
    'SELECT "weekEndDate"::date as "weekEndDate", "projectCode", "totalHours" FROM "WorkerWeek" WHERE "workerId" = $1',
    id,
  )) as {
    weekEndDate: Date;
    projectCode: string;
    totalHours: number;
  }[];

  const byWeek = new Map<
    string,
    { cbs: number; cct: number; both: number; any: number }
  >();

  for (const row of wwRows) {
    const key = formatDate(row.weekEndDate);
    const entry =
      byWeek.get(key) ??
      { cbs: 0, cct: 0, both: 0, any: 0 };

    if (row.projectCode === "CBS") {
      entry.cbs += Number(row.totalHours || 0);
    } else if (row.projectCode === "CCT") {
      entry.cct += Number(row.totalHours || 0);
    } else if (row.projectCode === "BOTH") {
      entry.both += Number(row.totalHours || 0);
    }
    entry.any += Number(row.totalHours || 0);

    byWeek.set(key, entry);
  }

  return (
    <main className="p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{w.fullName}</h1>
        <p className="text-sm text-gray-600">
          Weekly hours across all available work weeks.
        </p>
        <p className="text-xs text-gray-500">
          Status: {w.status ?? "UNKNOWN"} · Default Scope: {w.defaultProjectCode ?? "N/A"} · Class: {w.primaryClassCode ?? ""}
        </p>
      </div>

      <div className="border rounded max-h-[70vh] overflow-auto text-sm">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Week End</th>
              <th className="border px-2 py-1 text-right">CBS Hours</th>
              <th className="border px-2 py-1 text-right">CCT Hours</th>
              <th className="border px-2 py-1 text-right">Total Hours</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((wRow) => {
              const key = formatDate(wRow.weekDate);
              const entry = byWeek.get(key) ?? {
                cbs: 0,
                cct: 0,
                both: 0,
                any: 0,
              };
              const total = entry.any;

              return (
                <tr key={key} className={total === 0 ? "text-gray-400" : ""}>
                  <td className="border px-2 py-1">
                    <a
                      href={`/weeks/${key}`}
                      className="text-blue-600 hover:underline"
                    >
                      {key}
                    </a>
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {entry.cbs.toFixed(1)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {entry.cct.toFixed(1)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {total.toFixed(1)}
                  </td>
                </tr>
              );
            })}
            {weeks.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border px-2 py-4 text-center text-gray-500"
                >
                  No work weeks found in the dataset.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
