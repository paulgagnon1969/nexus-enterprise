import prisma from "../client";

async function main() {
  // Default to Nexus Fortified Structures BIA company if not provided.
  const companyId =
    process.env.BIA_COMPANY_ID ?? "cmjqzic0v0003vtkv7s2jmylo";

  console.log("Inspecting PayrollWeekRecord.weekCode for company:", companyId);

  const rows = await prisma.payrollWeekRecord.findMany({
    where: {
      companyId,
    },
    select: {
      projectCode: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      weekEndDate: true,
      weekCode: true,
      totalPay: true,
    },
    orderBy: { weekEndDate: "asc" },
    take: 50,
  });

  const withCode = rows.filter((r: any) => r.weekCode != null);
  const withoutCode = rows.filter((r: any) => r.weekCode == null);

  console.log("Total sampled rows:", rows.length);
  console.log("  With weekCode:", withCode.length);
  console.log("  Without weekCode:", withoutCode.length);

  console.log("\nSample rows with weekCode:");
  for (const r of withCode.slice(0, 10)) {
    console.log(
      `  ${r.projectCode ?? "?"} | ${r.employeeId ?? "?"} | ${r.firstName ?? ""} ${
        r.lastName ?? ""
      } | ${r.weekEndDate.toISOString().slice(0, 10)} | ${r.weekCode} | $${r.totalPay}`,
    );
  }

  console.log("\nSample rows without weekCode:");
  for (const r of withoutCode.slice(0, 10)) {
    console.log(
      `  ${r.projectCode ?? "?"} | ${r.employeeId ?? "?"} | ${r.firstName ?? ""} ${
        r.lastName ?? ""
      } | ${r.weekEndDate.toISOString().slice(0, 10)} | weekCode=NULL | $${
        r.totalPay
      }`,
    );
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
