import { Prisma, InventoryItemType } from "@prisma/client";
import { prisma } from "./index";

export type MoveInventoryWithCostOptions = {
  companyId: string;
  itemType: InventoryItemType;
  itemId: string;
  fromLocationId?: string | null;
  toLocationId: string;
  quantity: number; // positive number of units to move
  reason: string; // e.g. "TRANSFER", "DELIVERY", "INSTALL", "CONSUME"
  note?: string | null;
  movedByUserId: string;
  transportCost?: number | null; // external freight/etc. to capitalize
  internalLaborCost?: number | null; // tracked for reporting only
  explicitUnitCostForInitialLoad?: number | null; // required when fromLocationId is null
  tx?: Prisma.TransactionClient;
};

export type MoveInventoryResult = {
  movement: Awaited<ReturnType<typeof prisma.inventoryMovement.create>>;
  fromPosition: Awaited<ReturnType<typeof prisma.inventoryPosition.findUnique>> | null;
  toPosition: Awaited<ReturnType<typeof prisma.inventoryPosition.findUnique>>;
  unitCostFrom: Prisma.Decimal | null;
  movedCostBase: Prisma.Decimal;
};

/**
 * Internal helper to find or create an InventoryPosition for a given
 * (company, itemType, itemId, location).
 */
async function upsertInventoryPosition(
  tx: any,
  args: { companyId: string; itemType: InventoryItemType; itemId: string; locationId: string },
) {
  const existing = await tx.inventoryPosition.findUnique({
    where: {
      companyId_itemType_itemId_locationId: {
        companyId: args.companyId,
        itemType: args.itemType,
        itemId: args.itemId,
        locationId: args.locationId,
      },
    },
  });

  if (existing) return existing;

  return tx.inventoryPosition.create({
    data: {
      companyId: args.companyId,
      itemType: args.itemType,
      itemId: args.itemId,
      locationId: args.locationId,
      quantity: new Prisma.Decimal(0),
      totalCost: new Prisma.Decimal(0),
    },
  });
}

/**
 * Core movement helper that applies the SOP costing semantics:
 * - Derives unit cost from the source location when moving between locations.
 * - Capitalizes external transport cost into destination inventory.
 * - Tracks internal labor cost on the movement only (not capitalized).
 * - Updates InventoryPosition rows transactionally.
 */
export async function moveInventoryWithCost(options: MoveInventoryWithCostOptions): Promise<MoveInventoryResult> {
  const {
    companyId,
    itemType,
    itemId,
    fromLocationId,
    toLocationId,
    quantity,
    reason,
    note,
    movedByUserId,
    transportCost,
    internalLaborCost,
    explicitUnitCostForInitialLoad,
    tx,
  } = options;

  if (!companyId) throw new Error("companyId is required");
  if (!itemId) throw new Error("itemId is required");
  if (!toLocationId) throw new Error("toLocationId is required");
  if (!movedByUserId) throw new Error("movedByUserId is required");
  if (!reason) throw new Error("reason is required");

  const qty = new Prisma.Decimal(quantity);
  if (qty.lte(0)) {
    throw new Error("quantity must be > 0");
  }

  if (fromLocationId && fromLocationId === toLocationId) {
    throw new Error("fromLocationId and toLocationId must be different");
  }

  const runner = tx ?? prisma;

  return runner.$transaction(async (innerTx: any) => {
    let fromPosition: Awaited<ReturnType<typeof upsertInventoryPosition>> | null = null;
    let toPosition: Awaited<ReturnType<typeof upsertInventoryPosition>>;
    let unitCostFrom: Prisma.Decimal | null = null;
    let movedCostBase: Prisma.Decimal;

    // 1. Handle source side (if any)
    if (fromLocationId) {
      fromPosition = await upsertInventoryPosition(innerTx, {
        companyId,
        itemType,
        itemId,
        locationId: fromLocationId,
      });

      if (fromPosition.quantity.lt(qty)) {
        throw new Error(
          `Insufficient quantity at source location: have ${fromPosition.quantity.toString()}, attempted to move ${qty.toString()}`,
        );
      }

      // unitCostFrom = totalCost / quantity_at_source
      if (fromPosition.quantity.lte(0)) {
        throw new Error("Source InventoryPosition has non-positive quantity; cannot derive unit cost");
      }

      unitCostFrom = fromPosition.totalCost.div(fromPosition.quantity);
      movedCostBase = unitCostFrom!.mul(qty);

      const newSourceQty = fromPosition.quantity.sub(qty);
      const newSourceTotalCost = fromPosition.totalCost.sub(movedCostBase);

      fromPosition = await innerTx.inventoryPosition.update({
        where: { id: fromPosition.id },
        data: {
          quantity: newSourceQty,
          totalCost: newSourceTotalCost,
        },
      });
    } else {
      // Initial load: require explicit unit cost
      if (explicitUnitCostForInitialLoad == null) {
        throw new Error(
          "explicitUnitCostForInitialLoad is required when fromLocationId is null (initial receipt)",
        );
      }
      const unit = new Prisma.Decimal(explicitUnitCostForInitialLoad);
      if (unit.lt(0)) {
        throw new Error("explicitUnitCostForInitialLoad must be >= 0");
      }
      unitCostFrom = unit;
      movedCostBase = unit.mul(qty);
    }

    // 2. Destination side
    toPosition = await upsertInventoryPosition(innerTx, {
      companyId,
      itemType,
      itemId,
      locationId: toLocationId,
    });

    const transport = transportCost != null ? new Prisma.Decimal(transportCost) : new Prisma.Decimal(0);
    if (transport.lt(0)) {
      throw new Error("transportCost cannot be negative");
    }

    const internalLabor =
      internalLaborCost != null ? new Prisma.Decimal(internalLaborCost) : new Prisma.Decimal(0);
    if (internalLabor.lt(0)) {
      throw new Error("internalLaborCost cannot be negative");
    }

    const totalCostIncrement = movedCostBase.add(transport);

    const updatedToPosition = await innerTx.inventoryPosition.update({
      where: { id: toPosition.id },
      data: {
        quantity: toPosition.quantity.add(qty),
        totalCost: toPosition.totalCost.add(totalCostIncrement),
      },
    });
    toPosition = updatedToPosition;

    // 3. Record the movement event
    const movement = await innerTx.inventoryMovement.create({
      data: {
        companyId,
        itemType,
        itemId,
        fromLocationId: fromLocationId ?? null,
        toLocationId,
        quantity: qty,
        transportCost: transport,
        internalLaborCost: internalLabor,
        movedByUserId,
        movedAt: new Date(),
        reason,
        note: note ?? null,
      },
    });

    return {
      movement,
      fromPosition,
      toPosition,
      unitCostFrom,
      movedCostBase,
    };
  });
}

/**
 * Simple adjustment helper that directly sets quantity/totalCost for a
 * (company, itemType, itemId, location) and records an ADJUSTMENT movement.
 *
 * This is primarily for manual corrections and should be used sparingly.
 */
export async function adjustInventoryPosition(options: {
  companyId: string;
  itemType: InventoryItemType;
  itemId: string;
  locationId: string;
  newQuantity: number;
  newTotalCost: number;
  movedByUserId: string;
  note?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const { companyId, itemType, itemId, locationId, newQuantity, newTotalCost, movedByUserId, note, tx } =
    options;

  const runner = tx ?? prisma;

  return runner.$transaction(async (innerTx: any) => {
    const current = await upsertInventoryPosition(innerTx, {
      companyId,
      itemType,
      itemId,
      locationId,
    });

    const targetQty = new Prisma.Decimal(newQuantity);
    const targetCost = new Prisma.Decimal(newTotalCost);

    const deltaQty = targetQty.sub(current.quantity);
    const deltaCost = targetCost.sub(current.totalCost);

    const updated = await innerTx.inventoryPosition.update({
      where: { id: current.id },
      data: {
        quantity: targetQty,
        totalCost: targetCost,
      },
    });

    await innerTx.inventoryMovement.create({
      data: {
        companyId,
        itemType,
        itemId,
        fromLocationId: null,
        toLocationId: locationId,
        quantity: deltaQty,
        transportCost: deltaCost,
        internalLaborCost: new Prisma.Decimal(0),
        movedByUserId,
        movedAt: new Date(),
        reason: "ADJUSTMENT",
        note: note ?? null,
      },
    });

    return updated;
  });
}
