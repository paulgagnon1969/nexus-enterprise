import prisma from "@repo/database/src/client";

function formatDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export default async function WeeksPage() {
  // Distinct weeks with aggregates: worker count and total hours
  const rows = (await prisma.$queryRawUnsafe(
    'SELECT ww."weekEndDate"::date as "weekDate", COUNT(DISTINCT ww."workerId") AS "workerCount", SUM(ww."totalHours") AS "totalHours", SUM(ww."totalHours" * COALESCE(w."defaultPayRate", 0)) AS "totalPayEstimate" FROM "WorkerWeek" ww JOIN "Worker" w ON w.id = ww."workerId" GROUP BY "weekDate" ORDER BY "weekDate" ASC',
  )) as { weekDate: Date; workerCount: number; totalHours: number; totalPayEstimate: number }[];

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Work Weeks (BIA / LCP)</h1>
      <p className="text-sm text-gray-600">
        Distinct work weeks imported from LCPUpload templates. Click a week to
        see all workers and their hours for that period.
      </p>

      <div className="border rounded max-h-[70vh] overflow-auto text-sm">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1 text-left">Week End</th>
              <th className="border px-2 py-1 text-right">Workers</th>
              <th className="border px-2 py-1 text-right">Total Hours</th>
              <th className="border px-2 py-1 text-right">Est Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dateStr = formatDate(r.weekDate);
              return (
                <tr key={dateStr}>
                  <td className="border px-2 py-1">
                    <a
                      href={`/weeks/${dateStr}`}
                      className="text-blue-600 hover:underline"
                    >
                      {dateStr}
                    </a>
                  </td>
                  <td className="border px-2 py-1 text-right">{r.workerCount}</td>
                  <td className="border px-2 py-1 text-right">
                    {r.totalHours != null ? Number(r.totalHours).toFixed(1) : ""}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {r.totalPayEstimate != null
                      ? Number(r.totalPayEstimate).toFixed(2)
                      : ""}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="border px-2 py-4 text-center text-gray-500"
                >
                  No weekly data found. Try running the BIA import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
