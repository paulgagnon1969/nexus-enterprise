import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guards';
import { ProcurementService } from './procurement.service';
import { ProductIntelligenceService } from './product-intelligence.service';
import { BulkDetectionService } from './bulk-detection.service';
import type { ShoppingCartStatus, ShoppingCartHorizon, ShoppingCartItemStatus } from '@prisma/client';

@Controller('procurement')
@UseGuards(JwtAuthGuard)
export class ProcurementController {
  private readonly logger = new Logger(ProcurementController.name);
  constructor(
    private readonly service: ProcurementService,
    private readonly productIntelligence: ProductIntelligenceService,
    private readonly bulkDetection: BulkDetectionService,
  ) {}

  // ── Carts ────────────────────────────────────────────────────────────────

  /** All carts across the tenant — for Group Shopping Cart view */
  @Get('carts/all')
  listAllCarts(
    @Req() req: any,
    @Query('status') statusFilter?: string,
    @Query('includeCompleted') includeCompleted?: string,
  ) {
    const user = req.user;
    const statuses = statusFilter
      ? (statusFilter.split(',').map(s => s.trim().toUpperCase()) as any[])
      : undefined;
    return this.service.listAllCartsForCompany(user.companyId, {
      statuses,
      includeCompleted: includeCompleted === 'true',
    });
  }

  @Get('carts')
  listCarts(@Query('projectId') projectId: string) {
    return this.service.listCarts(projectId);
  }

  @Get('carts/:id')
  getCart(@Param('id') id: string) {
    return this.service.getCart(id);
  }

  @Post('carts')
  async createCart(
    @Req() req: any,
    @Body()
    body: {
      companyId?: string;
      projectId: string;
      createdByUserId?: string;
      label?: string;
      horizon?: ShoppingCartHorizon;
      horizonDate?: string;
      notes?: string;
    },
  ) {
    const user = req.user;
    const dto = {
      ...body,
      companyId: body.companyId || user.companyId,
      createdByUserId: body.createdByUserId || user.userId,
      horizonDate: body.horizonDate ? new Date(body.horizonDate) : undefined,
    };
    this.logger.log(`createCart dto=${JSON.stringify(dto)}`);
    try {
      return await this.service.createCart(dto);
    } catch (err: any) {
      this.logger.error(`createCart FAILED: ${err?.message}`, err?.stack);
      throw new InternalServerErrorException(err?.message ?? 'createCart failed');
    }
  }

  @Patch('carts/:id')
  updateCart(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      label: string;
      status: ShoppingCartStatus;
      horizon: ShoppingCartHorizon;
      horizonDate: string;
      notes: string;
    }>,
  ) {
    const { horizonDate, ...rest } = body;
    return this.service.updateCart(id, {
      ...rest,
      horizonDate: horizonDate ? new Date(horizonDate) : undefined,
    });
  }

  @Delete('carts/:id')
  deleteCart(@Param('id') id: string) {
    return this.service.deleteCart(id);
  }

  // ── Cart Items ───────────────────────────────────────────────────────────

  @Post('carts/:id/items')
  async addItem(
    @Param('id') cartId: string,
    @Body()
    body: {
      sowItemId?: string;
      costBookItemId?: string;
      description: string;
      unit?: string;
      unitPrice?: number;
      projectNeedQty: number;
      cartQty: number;
      roomParticleId?: string;
    },
  ) {
    this.logger.log(`addItem cartId=${cartId} body=${JSON.stringify(body)}`);
    try {
      return await this.service.addItem(cartId, body);
    } catch (err: any) {
      this.logger.error(`addItem FAILED: ${err?.message}`, err?.stack);
      throw new InternalServerErrorException(err?.message ?? 'addItem failed');
    }
  }

  @Patch('carts/:cartId/items/:itemId')
  updateItem(
    @Param('itemId') itemId: string,
    @Body() body: Partial<{ cartQty: number; status: ShoppingCartItemStatus; purchasedQty: number }>,
  ) {
    return this.service.updateItem(itemId, body);
  }

  @Delete('carts/:cartId/items/:itemId')
  deleteItem(@Param('itemId') itemId: string) {
    return this.service.deleteItem(itemId);
  }

  @Post('carts/:cartId/items/:itemId/record-purchase')
  recordPurchase(
    @Param('itemId') itemId: string,
    @Body() body: { purchasedQty: number },
  ) {
    return this.service.recordPurchase(itemId, body.purchasedQty);
  }

  // ── PETL Population ──────────────────────────────────────────────────────

  @Post('carts/:id/populate-from-petl')
  populateFromPetl(
    @Param('id') cartId: string,
    @Body() body?: { roomParticleId?: string; categoryCode?: string },
  ) {
    return this.service.populateFromPetl(cartId, body);
  }

  // ── CBA + Optimizer ──────────────────────────────────────────────────────

  @Post('carts/:id/run-cba')
  runCba(
    @Param('id') cartId: string,
    @Body() body?: { zipCode?: string },
  ) {
    return this.service.runCba(cartId, body?.zipCode);
  }

  // ── Consolidated Purchase ────────────────────────────────────────────────

  @Post('consolidate')
  consolidatePurchase(
    @Req() req: any,
    @Body() body: { cartIds: string[] },
  ) {
    const user = req.user;
    return this.service.consolidatePurchase(user.companyId, body.cartIds);
  }

  // ── Drawdown Ledger ──────────────────────────────────────────────────────

  @Get('drawdown')
  getDrawdown(@Query('projectId') projectId: string) {
    return this.service.getDrawdown(projectId);
  }

  // ── NexPRINT: Fingerprint Enrichment ───────────────────────────────────

  /** Batch-enrich items with fingerprint data (confidence + price history). */
  @Post('fingerprints/enrich')
  enrichFingerprints(
    @Req() req: any,
    @Body() body: { items: Array<{ supplierKey: string; productId: string }> },
  ) {
    return this.productIntelligence.enrichFingerprints(req.user.companyId, body.items ?? []);
  }

  // ── NexAGG: Bulk Procurement Opportunities ──────────────────────────────

  /** List all bulk procurement opportunities for the tenant */
  @Get('bulk-opportunities')
  listBulkOpportunities(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('clusterKey') clusterKey?: string,
  ) {
    return this.bulkDetection.listOpportunities(req.user.companyId, { status, clusterKey });
  }

  /** Get full detail for a bulk opportunity */
  @Get('bulk-opportunities/:id')
  getBulkOpportunity(@Req() req: any, @Param('id') id: string) {
    return this.bulkDetection.getOpportunityDetail(id, req.user.companyId);
  }

  /** Mark an opportunity as being reviewed */
  @Patch('bulk-opportunities/:id/review')
  reviewBulkOpportunity(@Req() req: any, @Param('id') id: string) {
    return this.bulkDetection.markReviewing(id, req.user.userId);
  }

  /** Approve a bulk opportunity for purchasing */
  @Patch('bulk-opportunities/:id/approve')
  approveBulkOpportunity(@Req() req: any, @Param('id') id: string) {
    return this.bulkDetection.approve(id, req.user.userId);
  }

  /** Dismiss a bulk opportunity with optional reason */
  @Patch('bulk-opportunities/:id/dismiss')
  dismissBulkOpportunity(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.bulkDetection.dismiss(id, req.user.userId, body?.reason);
  }

  /** Convert an approved opportunity to NexBUY shopping carts */
  @Post('bulk-opportunities/:id/convert')
  convertBulkOpportunity(@Req() req: any, @Param('id') id: string) {
    return this.bulkDetection.convertToNexBuy(id, req.user.companyId, req.user.userId);
  }

  /** Manually trigger NexAGG detection scan for the tenant */
  @Post('bulk-opportunities/scan')
  async triggerBulkScan(@Req() req: any) {
    const ids = await this.bulkDetection.detectOpportunities(req.user.companyId);
    return { detected: ids.length, opportunityIds: ids };
  }
}
