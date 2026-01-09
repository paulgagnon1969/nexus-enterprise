import prisma from "../client";

const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

async function main() {
  const rows = await prisma.payrollWeekRecord.findMany({
    where: {
      companyId: FORTIFIED_COMPANY_ID,
      weekCode: "WW02",
    },
    orderBy: [
      { projectCode: "asc" },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
  });

  console.log(`Found ${rows.length} PayrollWeekRecord rows for WW02.`);

  for (const row of rows) {
    const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "(unknown)";
    const project = row.projectCode ?? "?";
    const hours = row.totalHoursSt ?? 0;
    const rate = row.baseHourlyRate ?? null;
    const pay = row.totalPay;

    console.log(
      `${project.padEnd(3)} | ${name.padEnd(25)} | hours=${hours.toFixed(
        2,
      )} | rate=${rate != null ? rate.toFixed(2) : "n/a"} | pay=${pay.toFixed(2)}`,
    );
  }

  // Aggregate by project
  const byProject = new Map<string, { hours: number; pay: number }>();
  for (const row of rows) {
    const project = row.projectCode ?? "?";
    const entry = byProject.get(project) ?? { hours: 0, pay: 0 };
    entry.hours += row.totalHoursSt ?? 0;
    entry.pay += row.totalPay;
    byProject.set(project, entry);
  }

  console.log("\nProject totals (WW02):");
  for (const [project, { hours, pay }] of byProject.entries()) {
    console.log(
      `${project.padEnd(3)} | total_hours=${hours.toFixed(2)} | total_pay=${pay.toFixed(
        2,
      )}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
