import { prisma } from "../index";
import { runMaintenanceScheduler } from "../maintenance-scheduler";

async function main() {
  const companyId = process.env.COMPANY_ID;

  // eslint-disable-next-line no-console
  console.log("Running maintenance scheduler", companyId ? `for company ${companyId}` : "for all companies");

  await runMaintenanceScheduler(companyId);

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void prisma.$disconnect().finally(() => {
    process.exit(1);
  });
});
