import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { randomBytes, createHash } from "crypto";
import {
  BidRequestStatus,
  BidRecipientStatus,
  BidCostType,
  BidItemSourceType,
} from "@prisma/client";

interface CreateBidRequestDto {
  projectId: string;
  title: string;
  description?: string;
  dueDate?: string;
  filterConfig?: {
    categories?: string[];  // cat/sel codes like "DRY/1/2+"
    costTypes?: BidCostType[];
  };
  supplierIds: string[];
  notes?: string;
}

interface BidRequestItemInput {
  sourceType: BidItemSourceType;
  sourceId?: string;
  catSel?: string;
  divisionCode?: string;
  description: string;
  quantity: number;
  unit: string;
  costType: BidCostType;
}

@Injectable()
export class BidRequestService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a bid request from BOM data for a project
   */
  async createBidRequest(companyId: string, userId: string, dto: CreateBidRequestDto) {
    const { projectId, title, description, dueDate, filterConfig, supplierIds, notes } = dto;

    // Verify project belongs to company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // Get latest estimate version for the project
    const latestEstimate = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { sequenceNo: "desc" },
    });

    if (!latestEstimate) {
      throw new BadRequestException("Project has no estimate version - cannot create bid request");
    }

    // Get BOM items based on filter config
    const items = await this.getBomItemsForBidRequest(
      latestEstimate.id,
      filterConfig
    );

    if (items.length === 0) {
      throw new BadRequestException("No BOM items match the specified filters");
    }

    // Verify suppliers belong to company
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        id: { in: supplierIds },
        companyId,
        isActive: true,
      },
    });

    if (suppliers.length === 0) {
      throw new BadRequestException("No valid suppliers specified");
    }

    // Create bid request with items and recipients
    const bidRequest = await this.prisma.bidRequest.create({
      data: {
        companyId,
        projectId,
        requestedByUserId: userId,
        title,
        description,
        notes,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: BidRequestStatus.DRAFT,
        filterConfig: filterConfig ? filterConfig : undefined,
        items: {
          create: items.map((item, index) => ({
            sortOrder: index,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            catSel: item.catSel,
            divisionCode: item.divisionCode,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            costType: item.costType,
          })),
        },
        recipients: {
          create: suppliers.map((supplier) => ({
            supplierId: supplier.id,
            accessToken: this.generateAccessToken(),
            accessPin: this.hashPin(this.generatePin()),
            status: BidRecipientStatus.PENDING,
          })),
        },
      },
      include: {
        items: true,
        recipients: {
          include: {
            supplier: true,
          },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: {
          select: { id: true, addressLine1: true, city: true },
        },
      },
    });

    return bidRequest;
  }

  /**
   * Get BOM items for bid request based on filters.
   * Uses SowItems (PETL lines) which have detailed category/cost data.
   */
  private async getBomItemsForBidRequest(
    estimateVersionId: string,
    filterConfig?: CreateBidRequestDto["filterConfig"]
  ): Promise<BidRequestItemInput[]> {
    // Get SowItems (PETL lines) for the estimate
    const sowItems = await this.prisma.sowItem.findMany({
      where: { estimateVersionId },
      orderBy: [{ lineNo: "asc" }],
    });

    // Filter and convert to bid request items
    const items: BidRequestItemInput[] = [];
    const costTypes = filterConfig?.costTypes || [BidCostType.MATERIAL];
    const categories = filterConfig?.categories || [];

    for (const item of sowItems) {
      // Build catSel string
      const catSel = [item.categoryCode, item.selectionCode]
        .filter(Boolean)
        .join("/");

      // Category filter
      if (categories.length > 0 && !categories.some((c) => catSel.startsWith(c))) {
        continue;
      }

      // Material items
      if (
        costTypes.includes(BidCostType.MATERIAL) &&
        item.materialAmount &&
        item.materialAmount > 0
      ) {
        items.push({
          sourceType: BidItemSourceType.PETL,
          sourceId: item.id,
          catSel: catSel || undefined,
          divisionCode: undefined,
          description: item.description,
          quantity: item.qty || 1,
          unit: item.unit || "EA",
          costType: BidCostType.MATERIAL,
        });
      }

      // Labor items (if requested and has labor component)
      if (
        costTypes.includes(BidCostType.LABOR) &&
        item.itemAmount &&
        item.materialAmount &&
        item.itemAmount > item.materialAmount
      ) {
        items.push({
          sourceType: BidItemSourceType.PETL,
          sourceId: item.id,
          catSel: catSel || undefined,
          divisionCode: undefined,
          description: `${item.description} (Labor)`,
          quantity: item.qty || 1,
          unit: item.unit || "EA",
          costType: BidCostType.LABOR,
        });
      }

      // Equipment items
      if (
        costTypes.includes(BidCostType.EQUIPMENT) &&
        item.equipmentAmount &&
        item.equipmentAmount > 0
      ) {
        items.push({
          sourceType: BidItemSourceType.PETL,
          sourceId: item.id,
          catSel: catSel || undefined,
          divisionCode: undefined,
          description: `${item.description} (Equipment)`,
          quantity: item.qty || 1,
          unit: item.unit || "EA",
          costType: BidCostType.EQUIPMENT,
        });
      }
    }

    return items;
  }

  /**
   * List bid requests for a project
   */
  async listBidRequests(companyId: string, projectId: string) {
    return this.prisma.bidRequest.findMany({
      where: { companyId, projectId },
      include: {
        requestedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: {
            items: true,
            recipients: true,
          },
        },
        recipients: {
          select: {
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get bid request details
   */
  async getBidRequest(companyId: string, bidRequestId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
        recipients: {
          include: {
            supplier: {
              select: { id: true, name: true, email: true, phone: true },
            },
            responses: {
              include: {
                items: true,
              },
              orderBy: { submittedAt: "desc" },
              take: 1,
            },
          },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: {
          select: { id: true, addressLine1: true, city: true, state: true },
        },
      },
    });

    if (!bidRequest) {
      throw new NotFoundException("Bid request not found");
    }

    return bidRequest;
  }

  /**
   * Send bid request to all pending recipients
   */
  async sendBidRequest(companyId: string, bidRequestId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
      include: {
        recipients: {
          where: { status: BidRecipientStatus.PENDING },
          include: {
            supplier: true,
          },
        },
        project: true,
      },
    });

    if (!bidRequest) {
      throw new NotFoundException("Bid request not found");
    }

    // Update status to SENT
    await this.prisma.bidRequest.update({
      where: { id: bidRequestId },
      data: {
        status: BidRequestStatus.SENT,
        sentAt: new Date(),
        recipients: {
          updateMany: {
            where: { status: BidRecipientStatus.PENDING },
            data: {
              status: BidRecipientStatus.SENT,
              sentAt: new Date(),
            },
          },
        },
      },
    });

    // TODO: Send emails to recipients via email service
    // For now, return the recipient data that would be sent
    return {
      bidRequestId,
      sentCount: bidRequest.recipients.length,
      recipients: bidRequest.recipients.map((r) => ({
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        supplierEmail: r.supplier.defaultContactEmail || r.supplier.email,
        accessToken: r.accessToken,
        // Note: PIN is hashed, would need to regenerate for email
      })),
    };
  }

  /**
   * Add a supplier to an existing bid request
   */
  async addRecipient(companyId: string, bidRequestId: string, supplierId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
    });

    if (!bidRequest) {
      throw new NotFoundException("Bid request not found");
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId, isActive: true },
    });

    if (!supplier) {
      throw new NotFoundException("Supplier not found");
    }

    // Check if already a recipient
    const existing = await this.prisma.bidRequestRecipient.findFirst({
      where: { bidRequestId, supplierId },
    });

    if (existing) {
      throw new BadRequestException("Supplier is already a recipient of this bid request");
    }

    const pin = this.generatePin();

    return this.prisma.bidRequestRecipient.create({
      data: {
        bidRequestId,
        supplierId,
        accessToken: this.generateAccessToken(),
        accessPin: this.hashPin(pin),
        status: BidRecipientStatus.PENDING,
      },
      include: {
        supplier: true,
      },
    });
  }

  /**
   * Remove a recipient from a bid request
   */
  async removeRecipient(companyId: string, bidRequestId: string, recipientId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
    });

    if (!bidRequest) {
      throw new NotFoundException("Bid request not found");
    }

    return this.prisma.bidRequestRecipient.delete({
      where: { id: recipientId },
    });
  }

  /**
   * Get available categories for bid request creation
   */
  async getBomFilters(companyId: string, projectId: string) {
    // Get latest estimate version for the project
    const latestEstimate = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { sequenceNo: "desc" },
    });

    if (!latestEstimate) {
      return { categories: [], costTypes: [] };
    }

    // Get unique categories from SowItems
    const sowItems = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestEstimate.id },
      select: { categoryCode: true, selectionCode: true },
      distinct: ["categoryCode", "selectionCode"],
    });

    // Build unique catSel strings
    const catSelSet = new Set<string>();
    for (const item of sowItems) {
      const catSel = [item.categoryCode, item.selectionCode]
        .filter(Boolean)
        .join("/");
      if (catSel) catSelSet.add(catSel);
    }

    // Also get unique category codes for high-level filtering
    const categorySet = new Set<string>();
    for (const item of sowItems) {
      if (item.categoryCode) categorySet.add(item.categoryCode);
    }

    return {
      categories: Array.from(categorySet).sort(),
      catSels: Array.from(catSelSet).sort(),
      costTypes: Object.values(BidCostType),
    };
  }

  /**
   * Update bid request (title, description, due date, notes)
   */
  async updateBidRequest(
    companyId: string,
    bidRequestId: string,
    data: { title?: string; description?: string; dueDate?: string; notes?: string }
  ) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
    });

    if (!bidRequest) {
      throw new NotFoundException("Bid request not found");
    }

    return this.prisma.bidRequest.update({
      where: { id: bidRequestId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate !== undefined && {
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  }

  /**
   * Delete a bid request (only if DRAFT)
   */
  async deleteBidRequest(companyId: string, bidRequestId: string) {
    const bidRequest = await this.prisma.bidRequest.findFirst({
      where: { id: bidRequestId, companyId },
    });

    if (!bidRequest) {
      throw new NotFoundException("Bid request not found");
    }

    if (bidRequest.status !== BidRequestStatus.DRAFT) {
      throw new BadRequestException("Can only delete draft bid requests");
    }

    // Delete items and recipients first (cascade)
    await this.prisma.bidRequestItem.deleteMany({ where: { bidRequestId } });
    await this.prisma.bidRequestRecipient.deleteMany({ where: { bidRequestId } });
    await this.prisma.bidRequest.delete({ where: { id: bidRequestId } });

    return { success: true };
  }

  // --- Helpers ---

  private generateAccessToken(): string {
    return randomBytes(32).toString("hex");
  }

  private generatePin(): string {
    // 6-digit PIN
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashPin(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
  }
}
