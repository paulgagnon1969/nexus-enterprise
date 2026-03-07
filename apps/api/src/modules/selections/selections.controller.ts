import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CombinedAuthGuard, Roles, Role } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { SelectionsService } from './selections.service';
import { PlanningRoomService } from './planning-room.service';
import { VendorCatalogService } from './vendor-catalog.service';
import { SelectionSheetService } from './selection-sheet.service';
import type {
  CreatePlanningRoomDto,
  UpdatePlanningRoomDto,
  SendMessageDto,
  CreateSelectionDto,
  UpdateSelectionDto,
  GenerateSheetDto,
} from './dto';

@Controller()
export class SelectionsController {
  constructor(
    private readonly selections: SelectionsService,
    private readonly planningRooms: PlanningRoomService,
    private readonly vendorCatalog: VendorCatalogService,
    private readonly sheets: SelectionSheetService,
  ) {}

  // ─── Planning Rooms ──────────────────────────────────────────────

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get('projects/:projectId/planning-rooms')
  async listRooms(
    @Req() req: any,
    @Param('projectId') projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.listRooms(projectId, user.companyId);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('projects/:projectId/planning-rooms')
  async createRoom(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePlanningRoomDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.createRoom(user.companyId, user, {
      ...dto,
      projectId,
    } as any);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get('projects/:projectId/planning-rooms/:roomId')
  async getRoom(
    @Req() req: any,
    @Param('roomId') roomId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.getRoom(roomId, user.companyId);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch('projects/:projectId/planning-rooms/:roomId')
  async updateRoom(
    @Req() req: any,
    @Param('roomId') roomId: string,
    @Body() dto: UpdatePlanningRoomDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.updateRoom(roomId, user.companyId, dto);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Delete('projects/:projectId/planning-rooms/:roomId')
  async archiveRoom(
    @Req() req: any,
    @Param('roomId') roomId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.archiveRoom(roomId, user.companyId);
  }

  // ─── Planning Room Messages ──────────────────────────────────────

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get('projects/:projectId/planning-rooms/:roomId/messages')
  async listMessages(
    @Req() req: any,
    @Param('roomId') roomId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.planningRooms.listMessages(roomId, user.companyId);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('projects/:projectId/planning-rooms/:roomId/messages')
  async sendMessage(
    @Req() req: any,
    @Param('roomId') roomId: string,
    @Body() dto: SendMessageDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.planningRooms.sendMessage(roomId, user.companyId, user, dto);
  }

  // ─── Selections ──────────────────────────────────────────────────

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get('projects/:projectId/selections')
  async listSelections(
    @Req() req: any,
    @Param('projectId') projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.listSelectionsForProject(projectId, user.companyId);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('projects/:projectId/planning-rooms/:roomId/selections')
  async addSelection(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateSelectionDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.createSelection(
      user.companyId, projectId, roomId, user, dto,
    );
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch('projects/:projectId/selections/:selectionId')
  async updateSelection(
    @Req() req: any,
    @Param('selectionId') selectionId: string,
    @Body() dto: UpdateSelectionDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.updateSelection(selectionId, user.companyId, dto);
  }

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Delete('projects/:projectId/selections/:selectionId')
  async deleteSelection(
    @Req() req: any,
    @Param('selectionId') selectionId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.selections.deleteSelection(selectionId, user.companyId);
  }

  // ─── Selection Sheets ────────────────────────────────────────────

  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post('projects/:projectId/planning-rooms/:roomId/generate-sheet')
  async generateSheet(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('roomId') roomId: string,
    @Body() dto: GenerateSheetDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.sheets.generate(
      user.companyId, projectId, roomId, user, dto,
    );
  }

  @UseGuards(CombinedAuthGuard)
  @Get('projects/:projectId/selection-sheets')
  async listSheets(
    @Req() req: any,
    @Param('projectId') projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.sheets.listForProject(projectId, user.companyId);
  }

  @UseGuards(CombinedAuthGuard)
  @Get('projects/:projectId/selection-sheets/:sheetId')
  async getSheet(
    @Req() req: any,
    @Param('sheetId') sheetId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.sheets.getById(sheetId, user.companyId);
  }

  // ─── Vendor Catalog ──────────────────────────────────────────────

  @UseGuards(CombinedAuthGuard)
  @Get('vendor-catalogs')
  async listCatalogs(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.vendorCatalog.listCatalogs(user.companyId);
  }

  @UseGuards(CombinedAuthGuard)
  @Get('vendor-catalogs/:catalogId/products')
  async listProducts(
    @Param('catalogId') catalogId: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.vendorCatalog.listProducts(catalogId, { category, search });
  }

  @UseGuards(CombinedAuthGuard)
  @Get('vendor-catalogs/:catalogId/products/:productId')
  async getProduct(@Param('productId') productId: string) {
    return this.vendorCatalog.getProduct(productId);
  }
}
