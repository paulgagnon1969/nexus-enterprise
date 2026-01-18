import { prisma, InventoryItemType, moveInventoryWithCost, adjustInventoryPosition } from "../index";

async function main() {
  // For now, these are hard-coded for manual testing. You can change them
  // or wire them to process.env / CLI args as needed.
  const companyId = process.env.TEST_COMPANY_ID ?? "";
  const itemId = process.env.TEST_ITEM_ID ?? "";
  const fromLocationId = process.env.TEST_FROM_LOCATION_ID ?? "";
  const toLocationId = process.env.TEST_TO_LOCATION_ID ?? "";
  const movedByUserId = process.env.TEST_MOVED_BY_USER_ID ?? "";

  if (!companyId || !itemId || !toLocationId || !movedByUserId) {
    // eslint-disable-next-line no-console
    console.error(
      "Missing required env vars: TEST_COMPANY_ID, TEST_ITEM_ID, TEST_TO_LOCATION_ID, TEST_MOVED_BY_USER_ID",
    );
    process.exit(1);
  }

  const qty = Number(process.env.TEST_QTY ?? "10");
  const unitCost = Number(process.env.TEST_UNIT_COST ?? "100");
  const transportCost = Number(process.env.TEST_TRANSPORT_COST ?? "0");

  // eslint-disable-next-line no-console
  console.log("Using settings:", {
    companyId,
    itemId,
    fromLocationId: fromLocationId || null,
    toLocationId,
    movedByUserId,
    qty,
    unitCost,
    transportCost,
  });

  try {
    // Optional: seed an initial position at the source for testing
    if (fromLocationId) {
      // eslint-disable-next-line no-console
      console.log("Seeding source InventoryPosition (if needed)...");
      await adjustInventoryPosition({
        companyId,
        itemType: InventoryItemType.ASSET,
        itemId,
        locationId: fromLocationId,
        newQuantity: qty,
        newTotalCost: qty * unitCost,
        movedByUserId,
        note: "TEST: seed source position",
      });
    }

    // Show positions before
    const beforeFrom = fromLocationId
      ? await prisma.inventoryPosition.findUnique({
          where: {
            companyId_itemType_itemId_locationId: {
              companyId,
              itemType: InventoryItemType.ASSET,
              itemId,
              locationId: fromLocationId,
            },
          },
        })
      : null;
    const beforeTo = await prisma.inventoryPosition.findUnique({
      where: {
        companyId_itemType_itemId_locationId: {
          companyId,
          itemType: InventoryItemType.ASSET,
          itemId,
          locationId: toLocationId,
        },
      },
    });

    // eslint-disable-next-line no-console
    console.log("Before move:", { from: beforeFrom, to: beforeTo });

    const result = await moveInventoryWithCost({
      companyId,
      itemType: InventoryItemType.ASSET,
      itemId,
      fromLocationId: fromLocationId || null,
      toLocationId,
      quantity: qty,
      reason: fromLocationId ? "TRANSFER" : "DELIVERY",
      movedByUserId,
      transportCost,
      internalLaborCost: 0,
      explicitUnitCostForInitialLoad: fromLocationId ? null : unitCost,
    });

    // eslint-disable-next-line no-console
    console.log("Movement result:", {
      movement: result.movement,
      unitCostFrom: result.unitCostFrom?.toString() ?? null,
      movedCostBase: result.movedCostBase.toString(),
    });

    const afterFrom = fromLocationId
      ? await prisma.inventoryPosition.findUnique({
          where: {
            companyId_itemType_itemId_locationId: {
              companyId,
              itemType: InventoryItemType.ASSET,
              itemId,
              locationId: fromLocationId,
            },
          },
        })
      : null;
    const afterTo = await prisma.inventoryPosition.findUnique({
      where: {
        companyId_itemType_itemId_locationId: {
          companyId,
          itemType: InventoryItemType.ASSET,
          itemId,
          locationId: toLocationId,
        },
      },
    });

    // eslint-disable-next-line no-console
    console.log("After move:", { from: afterFrom, to: afterTo });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
