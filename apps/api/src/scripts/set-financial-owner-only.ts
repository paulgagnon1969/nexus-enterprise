/**
 * One-off script: Restrict Financial page fields to OWNER-only
 * for Nexus Fortified Structures (cmjr9okjz000401s6rdkbatvr).
 *
 * Usage (via prod proxy):
 *   source ~/.nexus-prod-env && ./scripts/prod-db-run-with-proxy.sh --allow-kill-port --no-prompt -- \
 *     npx ts-node apps/api/src/scripts/set-financial-owner-only.ts
 */
import { prisma } from "@repo/database";

const COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

const FINANCIAL_RESOURCE_KEYS = [
  "financial.revenue",
  "financial.expenses",
  "financial.profit",
  "financial.cashFlow",
  "invoice.amount",
  "invoice.paid",
  "invoice.balance",
];

const ALL_ROLES = [
  "CLIENT",
  "CREW",
  "FOREMAN",
  "SUPER",
  "PM",
  "EXECUTIVE",
  "ADMIN",
  "OWNER",
  "SUPER_ADMIN",
];

const ALLOWED_ROLES = new Set(["OWNER", "SUPER_ADMIN"]);

async function main() {
  try {
    for (const resourceKey of FINANCIAL_RESOURCE_KEYS) {
      // Upsert the policy
      const policy = await prisma.fieldSecurityPolicy.upsert({
        where: {
          FieldSecurityPolicy_company_resource_key: {
            companyId: COMPANY_ID,
            resourceKey,
          },
        },
        update: { description: `Owner-only: ${resourceKey}` },
        create: {
          companyId: COMPANY_ID,
          resourceKey,
          description: `Owner-only: ${resourceKey}`,
        },
      });

      // Delete existing permissions for this policy
      await prisma.fieldSecurityPermission.deleteMany({
        where: { policyId: policy.id },
      });

      // Create permissions: only OWNER + SUPER_ADMIN can view/edit/export
      await prisma.fieldSecurityPermission.createMany({
        data: ALL_ROLES.map((roleCode) => ({
          policyId: policy.id,
          roleCode,
          canView: ALLOWED_ROLES.has(roleCode),
          canEdit: ALLOWED_ROLES.has(roleCode),
          canExport: ALLOWED_ROLES.has(roleCode),
        })),
      });

      console.log(`✓ ${resourceKey} → Owner-only`);
    }

    console.log("\nDone. Financial fields restricted to Owner + Superuser.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
