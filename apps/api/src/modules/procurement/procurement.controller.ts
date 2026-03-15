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
import type { ShoppingCartStatus, ShoppingCartHorizon, ShoppingCartItemStatus } from '@prisma/client';

@Controller('procurement')
@UseGuards(JwtAuthGuard)
export class ProcurementController {
  private readonly logger = new Logger(ProcurementController.name);
  constructor(private readonly service: ProcurementService) {}

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
}
