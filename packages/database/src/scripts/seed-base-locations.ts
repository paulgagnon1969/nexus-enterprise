/*
 * Seed base logistics locations (material supplier, personnel pool, equipment warehouse, yard, etc.)
 * for a single company.
 *
 * Usage (from repo root):
 *   COMPANY_ID=... npx ts-node packages/database/src/scripts/seed-base-locations.ts
 */

import { prisma, LocationType } from "../index";

async function main() {
  const companyId = process.env.COMPANY_ID;
  if (!companyId) {
    // eslint-disable-next-line no-console
    console.error("COMPANY_ID env var is required");
    process.exit(1);
  }

  // Base seed set – can be expanded over time.
  const seeds: Array<{ code: string; name: string; type: LocationType }> = [
    { code: "EQUIPMENT_POOL", name: "Equipment Pool", type: LocationType.LOGICAL },
    { code: "MATERIALS_POOL", name: "Materials Pool", type: LocationType.LOGICAL },
    { code: "PEOPLE_POOL", name: "People Pool", type: LocationType.LOGICAL },
    { code: "SUPPLIER_DEFAULT", name: "Default Material Supplier", type: LocationType.SUPPLIER },
    { code: "YARD_MAIN", name: "Main Yard", type: LocationType.LOGICAL },
  ];

  // eslint-disable-next-line no-console
  console.log(`Seeding ${seeds.length} base locations for company ${companyId}`);

  for (const seed of seeds) {
    const existing = await prisma.location.findFirst({
      where: {
        companyId,
        code: seed.code,
      },
    });

    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Location '${seed.code}' already exists as '${existing.name}' (id=${existing.id})`);
      continue;
    }

    const created = await prisma.location.create({
      data: {
        companyId,
        code: seed.code,
        name: seed.name,
        type: seed.type,
        isActive: true,
      },
    });

    // eslint-disable-next-line no-console
    console.log(`Created location '${seed.code}' -> '${created.name}' (id=${created.id})`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void prisma.$disconnect().finally(() => {
    process.exit(1);
  });
});
