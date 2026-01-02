import prisma from "../client";

/**
 * Map PayrollWeekRecord rows for a given company + projectCode to a specific
 * NCC Project.id by setting payrollWeekRecord.projectId.
 *
 * Usage (from repo root):
 *   PAYROLL_COMPANY_ID=<companyId> \
 *   PAYROLL_PROJECT_CODE=CBS \
 *   PAYROLL_PROJECT_ID=<projectId> \
 *   npx ts-node packages/database/src/scripts/map-payroll-project-code.ts
 */
async function main() {
  const companyId = process.env.PAYROLL_COMPANY_ID;
  const projectCode = process.env.PAYROLL_PROJECT_CODE;
  const projectId = process.env.PAYROLL_PROJECT_ID;

  if (!companyId || !projectCode || !projectId) {
    throw new Error(
      "PAYROLL_COMPANY_ID, PAYROLL_PROJECT_CODE, and PAYROLL_PROJECT_ID env vars are required",
    );
  }

  console.log("Mapping PayrollWeekRecord rows", { companyId, projectCode, projectId });

  const result = await prisma.payrollWeekRecord.updateMany({
    where: { companyId, projectCode },
    data: { projectId },
  });

  console.log(`Updated ${result.count} PayrollWeekRecord rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
