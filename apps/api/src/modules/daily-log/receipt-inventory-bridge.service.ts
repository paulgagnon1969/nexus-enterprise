import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  InventoryItemType,
  FulfillmentMethod,
  TaskPriority,
  DailyLogType,
  $Enums,
} from '@prisma/client';
import { moveInventoryWithCost } from '@repo/database';
import { VendorLocationService } from '../locations/vendor-location.service';
import { TaskService } from '../task/task.service';
import { TaskPriorityEnum } from '../task/dto/task.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NexfindService } from '../nexfind/nexfind.service';
import { EntitlementService } from '../billing/entitlement.service';

/** Shape of a single OCR line item stored in ReceiptOcrResult.lineItemsJson */
interface OcrLineItem {
  description: string;
  sku?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  category?: string | null;
}

export interface PromoteReceiptResult {
  vendorLocationId: string;
  vendorMatchType: string;
  materialLotIds: string[];
  movementIds: string[];
  transitLocationId?: string | null;
  taskId?: string | null;
}

@Injectable()
export class ReceiptInventoryBridgeService {
  private readonly logger = new Logger(ReceiptInventoryBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendorLocation: VendorLocationService,
    private readonly tasks: TaskService,
    private readonly notifications: NotificationsService,
    private readonly nexfind: NexfindService,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * After OCR completes on a RECEIPT_EXPENSE log, promote line items to
   * MaterialLots and create InventoryPositions via the costing engine.
   *
   * Flow:
   * 1. Match/create vendor Location from OCR + geo data
   * 2. For each line item → create MaterialLot at vendor location
   * 3. Initial inventory load (null → vendor) via moveInventoryWithCost
   * 4. If WILL_CALL → move from vendor → user TRANSIT location
   * 5. If RETURN → debit existing lots via lotKey FIFO
   * 6. Persist ledger snapshot on the DailyLog
   * 7. Auto-create follow-up Task for project team
   */
  async promoteReceipt(
    dailyLogId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ): Promise<PromoteReceiptResult> {
    // ── 1. Load the daily log + all OCR results ──────────────────────────
    const log = await this.prisma.dailyLog.findUnique({
      where: { id: dailyLogId },
      include: {
        ocrResults: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!log) throw new Error(`DailyLog ${dailyLogId} not found`);
    if (log.type !== DailyLogType.RECEIPT_EXPENSE) {
      throw new Error(`DailyLog ${dailyLogId} is not RECEIPT_EXPENSE`);
    }

    const completedOcrs = log.ocrResults;
    if (!completedOcrs.length) {
      throw new Error(`No completed OCR result for log ${dailyLogId}`);
    }

    // Use first OCR for vendor info (primary receipt)
    const ocr = completedOcrs[0];

    // Merge line items from all OCR results
    let lineItems: OcrLineItem[] = [];
    for (const ocrResult of completedOcrs) {
      if (ocrResult.lineItemsJson) {
        try {
          const items = JSON.parse(ocrResult.lineItemsJson);
          if (Array.isArray(items)) lineItems.push(...items);
        } catch {
          this.logger.warn(`Failed to parse lineItemsJson for OCR ${ocrResult.id}`);
        }
      }
    }

    if (!lineItems.length) {
      this.logger.log(`No line items to promote for log ${dailyLogId}`);
      return {
        vendorLocationId: '',
        vendorMatchType: 'NONE',
        materialLotIds: [],
        movementIds: [],
      };
    }

    const fulfillment = (log.fulfillmentMethod as FulfillmentMethod) ?? FulfillmentMethod.UNKNOWN;
    const isReturn = fulfillment === FulfillmentMethod.RETURN;

    // ── 2. Match or create vendor location ──────────────────────────────
    const vendorMatch = await this.vendorLocation.matchOrCreate({
      companyId,
      vendorName: ocr.vendorName,
      vendorStoreNumber: ocr.vendorStoreNumber,
      vendorAddress: ocr.vendorAddress,
      vendorCity: ocr.vendorCity,
      vendorState: ocr.vendorState,
      vendorZip: ocr.vendorZip,
      vendorPhone: ocr.vendorPhone,
      captureLat: ocr.captureLat ?? log.receiptCaptureLat,
      captureLng: ocr.captureLng ?? log.receiptCaptureLng,
    });

    // Update the DailyLog with the resolved vendor location
    await this.prisma.dailyLog.update({
      where: { id: dailyLogId },
      data: { originLocationId: vendorMatch.locationId },
    });

    // ── 2b. NexFIND: upsert LocalSupplier from receipt data (if add-on enabled)
    void this.entitlements.isModuleEnabled(companyId, 'NEXFIND_RECEIPT').then((enabled) => {
      if (!enabled) return;
      return this.nexfind
        .upsertFromReceiptData(companyId, {
          name: ocr.vendorName ?? 'Unknown',
          address: [ocr.vendorAddress, ocr.vendorCity, ocr.vendorState, ocr.vendorZip]
            .filter(Boolean)
            .join(', ') || null,
          phone: ocr.vendorPhone,
          lat: ocr.captureLat ?? log.receiptCaptureLat,
          lng: ocr.captureLng ?? log.receiptCaptureLng,
          storeNumber: ocr.vendorStoreNumber,
        })
        .catch((err: any) =>
          this.logger.warn(`NexFIND receipt bridge failed (non-fatal): ${err?.message}`),
        );
    });

    // ── 3. Handle RETURN flow ───────────────────────────────────────────
    if (isReturn) {
      return this.handleReturnFlow(
        log,
        lineItems,
        vendorMatch,
        companyId,
        actor,
      );
    }

    // ── 4. Purchase flow: create MaterialLots + initial load ────────────
    const materialLotIds: string[] = [];
    const movementIds: string[] = [];
    const lotLocationCode = vendorMatch.location.code ?? vendorMatch.locationId.slice(0, 8);

    for (const item of lineItems) {
      const qty = Math.abs(item.qty ?? 1);
      const unitPrice = Math.abs(item.unitPrice ?? 0);
      const sku = item.sku ?? this.generateSkuFromDescription(item.description);
      const lotKey = `${lotLocationCode}:${sku}`;

      // Create MaterialLot
      const lot = await this.prisma.materialLot.create({
        data: {
          companyId,
          sku,
          name: item.description,
          quantity: qty,
          uom: 'EA',
          currentLocationId: vendorMatch.locationId,
          originLocationId: vendorMatch.locationId,
          sourceDailyLogId: dailyLogId,
          destinationProjectId: log.projectId,
          lotKey,
          metadata: {
            category: item.category,
            unitPrice,
            receiptDate: ocr.receiptDate?.toISOString(),
          },
        },
      });

      materialLotIds.push(lot.id);

      // Initial inventory load: null → vendor location
      try {
        const result = await moveInventoryWithCost({
          companyId,
          itemType: InventoryItemType.MATERIAL,
          itemId: lot.id,
          fromLocationId: null,
          toLocationId: vendorMatch.locationId,
          quantity: qty,
          reason: 'RECEIPT',
          note: `Receipt log ${dailyLogId}: ${item.description}`,
          movedByUserId: actor.userId,
          explicitUnitCostForInitialLoad: unitPrice,
        });
        movementIds.push(result.movement.id);
      } catch (err: any) {
        this.logger.error(`Initial load failed for lot ${lot.id}: ${err?.message}`);
      }
    }

    // ── 5. WILL_CALL: move from vendor → user TRANSIT ───────────────────
    let transitLocationId: string | null = null;
    if (fulfillment === FulfillmentMethod.WILL_CALL) {
      transitLocationId = await this.vendorLocation.getOrCreateTransitLocation(companyId, actor.userId);

      for (const lotId of materialLotIds) {
        try {
          const lot = await this.prisma.materialLot.findUnique({ where: { id: lotId } });
          if (!lot) continue;

          const result = await moveInventoryWithCost({
            companyId,
            itemType: InventoryItemType.MATERIAL,
            itemId: lotId,
            fromLocationId: vendorMatch.locationId,
            toLocationId: transitLocationId,
            quantity: Number(lot.quantity),
            reason: 'WILL_CALL_PICKUP',
            note: `Will-call pickup from ${vendorMatch.location.name}`,
            movedByUserId: actor.userId,
          });
          movementIds.push(result.movement.id);

          // Update lot's current location
          await this.prisma.materialLot.update({
            where: { id: lotId },
            data: { currentLocationId: transitLocationId },
          });
        } catch (err: any) {
          this.logger.error(`Will-call move failed for lot ${lotId}: ${err?.message}`);
        }
      }
    }

    // ── 6. Persist ledger snapshot on DailyLog ──────────────────────────
    await this.prisma.dailyLog.update({
      where: { id: dailyLogId },
      data: {
        inventoryLedgerJson: {
          materialLotIds,
          movementIds,
          vendorLocationId: vendorMatch.locationId,
          vendorMatchType: vendorMatch.matchType,
          transitLocationId,
          fulfillment,
          promotedAt: new Date().toISOString(),
        },
      },
    });

    // ── 7. Auto-create follow-up task ───────────────────────────────────
    const taskId = await this.createReceiptTask(log, vendorMatch, fulfillment, companyId, actor);

    this.logger.log(
      `Promoted receipt ${dailyLogId}: ${materialLotIds.length} lots, ${movementIds.length} movements, fulfillment=${fulfillment}`,
    );

    return {
      vendorLocationId: vendorMatch.locationId,
      vendorMatchType: vendorMatch.matchType,
      materialLotIds,
      movementIds,
      transitLocationId,
      taskId,
    };
  }

  /**
   * Handle RETURN fulfillment: debit existing lots via lotKey matching + FIFO.
   * Returns are identified by negative amounts in the receipt.
   */
  private async handleReturnFlow(
    log: any,
    lineItems: OcrLineItem[],
    vendorMatch: any,
    companyId: string,
    actor: AuthenticatedUser,
  ): Promise<PromoteReceiptResult> {
    const materialLotIds: string[] = [];
    const movementIds: string[] = [];

    for (const item of lineItems) {
      const qty = Math.abs(item.qty ?? 1);
      const sku = item.sku ?? this.generateSkuFromDescription(item.description);

      // Find existing lots by SKU (strip origin for partial returns)
      // Match on companyId + sku, ordered by createdAt ASC (FIFO)
      const existingLots = await this.prisma.materialLot.findMany({
        where: {
          companyId,
          sku,
          destinationProjectId: log.projectId,
          quantity: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      });

      let remainingToReturn = qty;

      for (const lot of existingLots) {
        if (remainingToReturn <= 0) break;

        const lotQty = Number(lot.quantity);
        const debitQty = Math.min(lotQty, remainingToReturn);

        try {
          // Move material back to vendor location (return)
          const result = await moveInventoryWithCost({
            companyId,
            itemType: InventoryItemType.MATERIAL,
            itemId: lot.id,
            fromLocationId: lot.currentLocationId,
            toLocationId: vendorMatch.locationId,
            quantity: debitQty,
            reason: 'RETURN',
            note: `Return receipt log ${log.id}: ${item.description}`,
            movedByUserId: actor.userId,
          });
          movementIds.push(result.movement.id);
          materialLotIds.push(lot.id);

          // Update lot quantity
          const newQty = lotQty - debitQty;
          await this.prisma.materialLot.update({
            where: { id: lot.id },
            data: {
              quantity: newQty,
              currentLocationId: newQty > 0 ? lot.currentLocationId : vendorMatch.locationId,
            },
          });

          remainingToReturn -= debitQty;
        } catch (err: any) {
          this.logger.error(`Return debit failed for lot ${lot.id}: ${err?.message}`);
        }
      }

      if (remainingToReturn > 0) {
        this.logger.warn(
          `Return for SKU ${sku}: could not fully debit. Remaining: ${remainingToReturn}`,
        );
      }
    }

    // Persist ledger snapshot
    await this.prisma.dailyLog.update({
      where: { id: log.id },
      data: {
        inventoryLedgerJson: {
          materialLotIds,
          movementIds,
          vendorLocationId: vendorMatch.locationId,
          vendorMatchType: vendorMatch.matchType,
          fulfillment: FulfillmentMethod.RETURN,
          promotedAt: new Date().toISOString(),
        },
      },
    });

    const taskId = await this.createReceiptTask(log, vendorMatch, FulfillmentMethod.RETURN, companyId, actor);

    this.logger.log(`Processed return ${log.id}: debited ${materialLotIds.length} lots`);

    return {
      vendorLocationId: vendorMatch.locationId,
      vendorMatchType: vendorMatch.matchType,
      materialLotIds,
      movementIds,
      taskId,
    };
  }

  /**
   * Auto-create a follow-up Task linked to the receipt daily log.
   * Uses Project.teamTreeJson for Level 1 notifications (PM, Superintendent, Foreman).
   */
  private async createReceiptTask(
    log: any,
    vendorMatch: any,
    fulfillment: FulfillmentMethod,
    companyId: string,
    actor: AuthenticatedUser,
  ): Promise<string | null> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: log.projectId },
        select: { id: true, name: true, teamTreeJson: true },
      });

      if (!project) return null;

      // Determine task title and priority based on fulfillment
      let title: string;
      let priority: TaskPriorityEnum;
      let dueDate: Date | undefined;

      switch (fulfillment) {
        case FulfillmentMethod.WILL_CALL:
          title = `Materials picked up — deliver to ${project.name}`;
          priority = TaskPriorityEnum.HIGH;
          dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
          break;
        case FulfillmentMethod.DELIVERY:
          title = `Pending delivery from ${vendorMatch.location.name} for ${project.name}`;
          priority = TaskPriorityEnum.MEDIUM;
          dueDate = log.expectedDeliveryDate
            ? new Date(log.expectedDeliveryDate)
            : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
          break;
        case FulfillmentMethod.RETURN:
          title = `Material return processed at ${vendorMatch.location.name} for ${project.name}`;
          priority = TaskPriorityEnum.LOW;
          break;
        default:
          title = `New receipt from ${vendorMatch.location.name} for ${project.name}`;
          priority = TaskPriorityEnum.MEDIUM;
          dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 48h
          break;
      }

      const description =
        `Auto-created from receipt daily log.\n` +
        `Vendor: ${vendorMatch.location.name}\n` +
        `Fulfillment: ${fulfillment}\n` +
        `Submitted by: ${actor.userId}`;

      const task = await this.tasks.createTask(actor, {
        projectId: log.projectId,
        title,
        description,
        priority,
        dueDate,
        relatedEntityType: 'DAILY_LOG',
        relatedEntityId: log.id,
      });

      // ── Level 1 notifications: PM, Superintendent, Foreman ────────────
      await this.notifyProjectTeam(project, companyId, title, description, log.id);

      return (task as any)?.id ?? null;
    } catch (err: any) {
      this.logger.warn(`Failed to create receipt task for log ${log.id}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Notify Level 1 project team members (PM, Superintendent, Foreman)
   * using Project.teamTreeJson.
   */
  private async notifyProjectTeam(
    project: { id: string; name: string; teamTreeJson?: any },
    companyId: string,
    title: string,
    body: string,
    dailyLogId: string,
  ): Promise<void> {
    try {
      const teamTree = project.teamTreeJson as Record<string, string[]> | null;
      if (!teamTree) return;

      // Level 1 roles
      const level1Roles = ['PM', 'SUPERINTENDENT', 'FOREMAN'];
      const userIds = new Set<string>();

      for (const role of level1Roles) {
        const ids = teamTree[role];
        if (Array.isArray(ids)) {
          ids.forEach((id) => userIds.add(id));
        }
      }

      for (const userId of userIds) {
        await this.notifications.createNotification({
          userId,
          companyId,
          projectId: project.id,
          kind: $Enums.NotificationKind.DAILY_LOG,
          channel: $Enums.NotificationChannel.IN_APP,
          title,
          body,
          metadata: {
            type: 'receipt_inventory_promoted',
            dailyLogId,
            projectId: project.id,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Team notification failed: ${err?.message}`);
    }
  }

  /**
   * Generate a deterministic SKU slug from a description when no SKU is
   * available from OCR. Used for lot key matching.
   */
  private generateSkuFromDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }
}
