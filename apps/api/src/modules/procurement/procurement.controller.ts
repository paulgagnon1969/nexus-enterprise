import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guards';
import { ProcurementService } from './procurement.service';
import type { ShoppingCartStatus, ShoppingCartHorizon, ShoppingCartItemStatus } from '@prisma/client';

@Controller('procurement')
@UseGuards(JwtAuthGuard)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  // ── Carts ────────────────────────────────────────────────────────────────

  @Get('carts')
  listCarts(@Query('projectId') projectId: string) {
    return this.service.listCarts(projectId);
  }

  @Get('carts/:id')
  getCart(@Param('id') id: string) {
    return this.service.getCart(id);
  }

  @Post('carts')
  createCart(
    @Body()
    body: {
      companyId: string;
      projectId: string;
      createdByUserId?: string;
      label?: string;
      horizon?: ShoppingCartHorizon;
      horizonDate?: string;
      notes?: string;
    },
  ) {
    return this.service.createCart({
      ...body,
      horizonDate: body.horizonDate ? new Date(body.horizonDate) : undefined,
    });
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
  addItem(
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
    return this.service.addItem(cartId, body);
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

  // ── Drawdown Ledger ──────────────────────────────────────────────────────

  @Get('drawdown')
  getDrawdown(@Query('projectId') projectId: string) {
    return this.service.getDrawdown(projectId);
  }
}
