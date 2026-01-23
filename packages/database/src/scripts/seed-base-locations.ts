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

  // 1) Ensure a root "Main Office" node exists for this company.
  const mainOffice = await prisma.location.upsert({
    where: {
      // Unique per company + code
      Location_companyId_code_unique: {
        companyId,
        code: "MAIN_OFFICE",
      },
    },
    update: {
      // Keep name/type stable but allow future tweaks
      name: "Main Office",
      type: LocationType.LOGICAL,
      isActive: true,
    },
    create: {
      companyId,
      code: "MAIN_OFFICE",
      name: "Main Office",
      type: LocationType.LOGICAL,
      isActive: true,
    },
  });

  // 2) Create high-level buckets under Main Office for people/equipment/materials.
  const peopleLocations = await prisma.location.upsert({
    where: {
      Location_companyId_code_unique: {
        companyId,
        code: "PEOPLE_LOCATIONS",
      },
    },
    update: {
      name: "People locations",
      type: LocationType.LOGICAL,
      isActive: true,
      parentLocationId: mainOffice.id,
    },
    create: {
      companyId,
      code: "PEOPLE_LOCATIONS",
      name: "People locations",
      type: LocationType.LOGICAL,
      isActive: true,
      parentLocationId: mainOffice.id,
    },
  });

  const equipmentLocations = await prisma.location.upsert({
    where: {
      Location_companyId_code_unique: {
        companyId,
        code: "EQUIPMENT_LOCATIONS",
      },
    },
    update: {
      name: "Equipment locations",
      type: LocationType.LOGICAL,
      isActive: true,
      parentLocationId: mainOffice.id,
    },
    create: {
      companyId,
      code: "EQUIPMENT_LOCATIONS",
      name: "Equipment locations",
      type: LocationType.LOGICAL,
      isActive: true,
      parentLocationId: mainOffice.id,
    },
  });

  const materialsLocations = await prisma.location.upsert({
    where: {
      Location_companyId_code_unique: {
        companyId,
        code: "MATERIALS_LOCATIONS",
      },
    },
    update: {
      name: "Materials locations",
      type: LocationType.LOGICAL,
      isActive: true,
      parentLocationId: mainOffice.id,
    },
    create: {
      companyId,
      code: "MATERIALS_LOCATIONS",
      name: "Materials locations",
      type: LocationType.LOGICAL,
      isActive: true,
      parentLocationId: mainOffice.id,
    },
  });

  // 3) Pools: attach to the appropriate bucket so every tenant gets a starter tree
  //    like Main Office > People locations > People Pool, etc. If the pools already
  //    exist (from earlier seeds), just re-parent them under the new hierarchy.
  const poolSeeds: Array<{ code: string; name: string; parentId: string }> = [
    { code: "PEOPLE_POOL", name: "People Pool", parentId: peopleLocations.id },
    { code: "EQUIPMENT_POOL", name: "Equipment Pool", parentId: equipmentLocations.id },
    { code: "MATERIALS_POOL", name: "Materials Pool", parentId: materialsLocations.id },
  ];

  for (const seed of poolSeeds) {
    const existing = await prisma.location.findFirst({
      where: {
        companyId,
        code: seed.code,
      },
    });

    if (existing) {
      if (existing.parentLocationId !== seed.parentId || existing.name !== seed.name) {
        await prisma.location.update({
          where: { id: existing.id },
          data: {
            name: seed.name,
            type: LocationType.LOGICAL,
            parentLocationId: seed.parentId,
            isActive: true,
          },
        });
        // eslint-disable-next-line no-console
        console.log(
          `Updated existing location '${seed.code}' -> '${seed.name}' (id=${existing.id}) under parent ${seed.parentId}`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `Location '${seed.code}' already exists as '${existing.name}' (id=${existing.id}) with correct parent`,
        );
      }
      continue;
    }

    const created = await prisma.location.create({
      data: {
        companyId,
        code: seed.code,
        name: seed.name,
        type: LocationType.LOGICAL,
        parentLocationId: seed.parentId,
        isActive: true,
      },
    });
    // eslint-disable-next-line no-console
    console.log(
      `Created pool location '${seed.code}' -> '${created.name}' (id=${created.id}) under parent ${seed.parentId}`,
    );
  }

  // 4) Supplier and yard-style logistics locations stay at the root level.
  const flatSeeds: Array<{ code: string; name: string; type: LocationType }> = [
    { code: "SUPPLIER_DEFAULT", name: "Default Material Supplier", type: LocationType.SUPPLIER },
    { code: "YARD_MAIN", name: "Main Yard", type: LocationType.LOGICAL },
  ];

  // eslint-disable-next-line no-console
  console.log(`Seeding ${flatSeeds.length} additional base locations for company ${companyId}`);

  for (const seed of flatSeeds) {
    const existing = await prisma.location.findFirst({
      where: {
        companyId,
        code: seed.code,
      },
    });

    if (existing) {
      // eslint-disable-next-line no-console
      console.log(
        `Location '${seed.code}' already exists as '${existing.name}' (id=${existing.id}); leaving parent as-is`,
      );
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
