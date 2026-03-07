import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import type {
  CreatePlanningRoomDto,
  UpdatePlanningRoomDto,
  CreateSelectionDto,
  UpdateSelectionDto,
} from './dto';

@Injectable()
export class SelectionsService {
  private readonly logger = new Logger(SelectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Planning Rooms ────────────────────────────────────────────────

  async listRooms(projectId: string, companyId: string) {
    return this.prisma.planningRoom.findMany({
      where: { projectId, companyId, status: 'ACTIVE' },
      include: {
        _count: { select: { selections: true, messages: true } },
        selections: {
          select: {
            id: true,
            status: true,
            vendorProduct: { select: { price: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRoom(roomId: string, companyId: string) {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        selections: {
          include: { vendorProduct: true },
          orderBy: { position: 'asc' },
        },
        selectionSheets: { orderBy: { version: 'desc' }, take: 1 },
        _count: { select: { selections: true } },
      },
    });
    if (!room) throw new NotFoundException('Planning room not found');
    return room;
  }

  async createRoom(
    companyId: string,
    actor: AuthenticatedUser,
    dto: CreatePlanningRoomDto,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.sourceId ? undefined : undefined, companyId },
    });

    const pipelineStatus = {
      capture: {
        status: dto.sourceType && dto.sourceType !== 'MANUAL' ? 'complete' : 'not_started',
        deviceOrigin: dto.deviceOrigin ?? null,
        capturedAt: dto.sourceType && dto.sourceType !== 'MANUAL'
          ? new Date().toISOString()
          : null,
      },
      dimensionExtraction: {
        status: dto.extractedDimensions ? 'complete' : 'not_started',
      },
      layoutProposal: { status: 'not_started', deviceOrigin: null },
      aiReview: { status: 'not_started', score: null },
      sheetGeneration: { status: 'not_started' },
    };

    return this.prisma.planningRoom.create({
      data: {
        companyId,
        projectId: (dto as any).projectId,
        name: dto.name,
        description: dto.description,
        floorPlanUrl: dto.floorPlanUrl,
        sourceType: dto.sourceType ?? 'MANUAL',
        sourceId: dto.sourceId,
        extractedDimensions: dto.extractedDimensions ?? undefined,
        pipelineStatus,
        createdById: actor.userId,
      },
      include: {
        _count: { select: { selections: true } },
      },
    });
  }

  async updateRoom(
    roomId: string,
    companyId: string,
    dto: UpdatePlanningRoomDto,
  ) {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId },
    });
    if (!room) throw new NotFoundException('Planning room not found');

    return this.prisma.planningRoom.update({
      where: { id: roomId },
      data: {
        name: dto.name,
        description: dto.description,
        floorPlanUrl: dto.floorPlanUrl,
        status: dto.status,
      },
    });
  }

  async archiveRoom(roomId: string, companyId: string) {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId },
    });
    if (!room) throw new NotFoundException('Planning room not found');

    return this.prisma.planningRoom.update({
      where: { id: roomId },
      data: { status: 'ARCHIVED' },
    });
  }

  // ─── Selections ────────────────────────────────────────────────────

  async listSelectionsForProject(projectId: string, companyId: string) {
    return this.prisma.selection.findMany({
      where: { projectId, companyId },
      include: {
        vendorProduct: true,
        room: { select: { id: true, name: true } },
      },
      orderBy: [{ roomId: 'asc' }, { position: 'asc' }],
    });
  }

  async createSelection(
    companyId: string,
    projectId: string,
    roomId: string,
    actor: AuthenticatedUser,
    dto: CreateSelectionDto,
  ) {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId, projectId },
    });
    if (!room) throw new NotFoundException('Planning room not found');

    return this.prisma.selection.create({
      data: {
        companyId,
        projectId,
        roomId,
        vendorProductId: dto.vendorProductId,
        position: dto.position,
        quantity: dto.quantity ?? 1,
        notes: dto.notes,
        customizations: dto.customizations,
        createdById: actor.userId,
      },
      include: { vendorProduct: true },
    });
  }

  async updateSelection(
    selectionId: string,
    companyId: string,
    dto: UpdateSelectionDto,
  ) {
    const sel = await this.prisma.selection.findFirst({
      where: { id: selectionId, companyId },
    });
    if (!sel) throw new NotFoundException('Selection not found');

    return this.prisma.selection.update({
      where: { id: selectionId },
      data: {
        vendorProductId: dto.vendorProductId,
        position: dto.position,
        quantity: dto.quantity,
        status: dto.status,
        notes: dto.notes,
        customizations: dto.customizations,
      },
      include: { vendorProduct: true },
    });
  }

  async deleteSelection(selectionId: string, companyId: string) {
    const sel = await this.prisma.selection.findFirst({
      where: { id: selectionId, companyId },
    });
    if (!sel) throw new NotFoundException('Selection not found');

    return this.prisma.selection.delete({ where: { id: selectionId } });
  }
}
