import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { BidPackageStatus, BidStatus, InvitationStatus } from "@prisma/client";
import { cuid } from "@paralleldrive/cuid2";

export interface CreateBidPackageDto {
  projectId: string;
  estimateId?: string;
  title: string;
  description?: string;
  dueDate?: Date;
  attachmentUrls?: string[];
  lineItems: CreateBidLineItemDto[];
}

export interface CreateBidLineItemDto {
  estimateLineItemId?: string;
  category?: string;
  description: string;
  unit: string;
  qty: number;
  specHash?: string;
  notes?: string;
}

export interface InviteSupplierDto {
  supplierName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface SubmitBidDto {
  status: "DRAFT" | "SUBMITTED";
  notes?: string;
  lineItems: BidLineItemSubmissionDto[];
  subtotal?: number;
  tax?: number;
  shipping?: number;
  total?: number;
}

export interface BidLineItemSubmissionDto {
  bidPackageLineItemId: string;
  unitPrice?: number;
  notes?: string;
  leadTimeDays?: number;
}

@Injectable()
export class BidPackageService {
  private readonly logger = new Logger(BidPackageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new bid package from estimate items.
   */
  async createBidPackage(
    companyId: string,
    createdByUserId: string,
    dto: CreateBidPackageDto,
  ) {
    // Validate project belongs to company
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const bidPackage = await this.prisma.bidPackage.create({
      data: {
        companyId,
        projectId: dto.projectId,
        estimateId: dto.estimateId,
        createdByUserId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate,
        attachmentUrls: dto.attachmentUrls || [],
        status: BidPackageStatus.DRAFT,
        lineItems: {
          create: dto.lineItems.map((item, idx) => ({
            lineNo: idx + 1,
            estimateLineItemId: item.estimateLineItemId,
            category: item.category,
            description: item.description,
            unit: item.unit,
            qty: item.qty,
            specHash: item.specHash,
            notes: item.notes,
          })),
        },
      },
      include: {
        lineItems: { orderBy: { lineNo: "asc" } },
        project: { select: { name: true, addressLine1: true, city: true, state: true } },
      },
    });

    this.logger.log(`Created bid package ${bidPackage.id} for project ${dto.projectId}`);

    return bidPackage;
  }

  /**
   * List bid packages for a project.
   */
  async listBidPackages(companyId: string, projectId: string) {
    const packages = await this.prisma.bidPackage.findMany({
      where: { companyId, projectId },
      include: {
        _count: {
          select: {
            lineItems: true,
            invitations: true,
            bids: { where: { status: { in: [BidStatus.SUBMITTED, BidStatus.AMENDED] } } },
          },
        },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      title: pkg.title,
      status: pkg.status,
      dueDate: pkg.dueDate,
      createdAt: pkg.createdAt,
      projectName: pkg.project.name,
      lineItemsCount: pkg._count.lineItems,
      invitationsCount: pkg._count.invitations,
      bidsReceived: pkg._count.bids,
    }));
  }

  /**
   * Get bid package details with invitations and bids.
   */
  async getBidPackage(packageId: string, companyId: string) {
    const bidPackage = await this.prisma.bidPackage.findFirst({
      where: { id: packageId, companyId },
      include: {
        lineItems: { orderBy: { lineNo: "asc" } },
        invitations: {
          include: {
            bids: {
              include: {
                lineItems: {
                  include: { packageLineItem: true },
                },
              },
              orderBy: { submittedAt: "desc" },
              take: 1,
            },
          },
        },
        project: {
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
          },
        },
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!bidPackage) {
      throw new NotFoundException("Bid package not found");
    }

    return bidPackage;
  }

  /**
   * Invite suppliers to bid.
   */
  async inviteSuppliers(
    packageId: string,
    companyId: string,
    suppliers: InviteSupplierDto[],
  ) {
    const bidPackage = await this.prisma.bidPackage.findFirst({
      where: { id: packageId, companyId },
    });

    if (!bidPackage) {
      throw new NotFoundException("Bid package not found");
    }

    const invitations = await Promise.all(
      suppliers.map(async (supplier) => {
        const accessToken = cuid();

        return this.prisma.supplierInvitation.create({
          data: {
            bidPackageId: packageId,
            supplierName: supplier.supplierName,
            contactName: supplier.contactName,
            contactEmail: supplier.contactEmail,
            contactPhone: supplier.contactPhone,
            accessToken,
            status: InvitationStatus.PENDING,
          },
        });
      }),
    );

    // Update bid package status to OPEN if still DRAFT
    if (bidPackage.status === BidPackageStatus.DRAFT) {
      await this.prisma.bidPackage.update({
        where: { id: packageId },
        data: { status: BidPackageStatus.OPEN, openedAt: new Date() },
      });
    }

    this.logger.log(`Created ${invitations.length} invitations for bid package ${packageId}`);

    return invitations.map((inv) => ({
      id: inv.id,
      supplierName: inv.supplierName,
      contactEmail: inv.contactEmail,
      accessToken: inv.accessToken,
      portalUrl: `${process.env.APP_URL || "http://localhost:3000"}/supplier-portal/${inv.accessToken}`,
    }));
  }

  /**
   * Get bid package for supplier portal (by access token).
   */
  async getBidPackageByToken(accessToken: string) {
    const invitation = await this.prisma.supplierInvitation.findUnique({
      where: { accessToken },
      include: {
        bidPackage: {
          include: {
            lineItems: { orderBy: { lineNo: "asc" } },
            project: {
              select: {
                name: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                state: true,
                postalCode: true,
              },
            },
            company: {
              select: { name: true, email: true, phone: true },
            },
          },
        },
        bids: {
          include: {
            lineItems: {
              include: { packageLineItem: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException("Invalid access token");
    }

    // Check if bid package is still open
    if (invitation.bidPackage.status === BidPackageStatus.CLOSED) {
      throw new BadRequestException("Bidding has closed for this package");
    }

    // Check if due date has passed
    if (invitation.bidPackage.dueDate && new Date() > invitation.bidPackage.dueDate) {
      throw new BadRequestException("Submission deadline has passed");
    }

    // Mark invitation as opened (first time)
    if (invitation.status === InvitationStatus.PENDING) {
      await this.prisma.supplierInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.OPENED, openedAt: new Date() },
      });
    }

    return {
      bidPackage: invitation.bidPackage,
      invitation: {
        id: invitation.id,
        supplierName: invitation.supplierName,
        contactName: invitation.contactName,
        status: invitation.status,
      },
      existingBid: invitation.bids[0] || null,
    };
  }

  /**
   * Submit or save a bid.
   */
  async submitBid(accessToken: string, dto: SubmitBidDto) {
    const invitation = await this.prisma.supplierInvitation.findUnique({
      where: { accessToken },
      include: { bidPackage: true },
    });

    if (!invitation) {
      throw new NotFoundException("Invalid access token");
    }

    // Validate bid package is still open
    if (invitation.bidPackage.status === BidPackageStatus.CLOSED) {
      throw new BadRequestException("Bidding has closed");
    }

    if (invitation.bidPackage.dueDate && new Date() > invitation.bidPackage.dueDate) {
      throw new BadRequestException("Submission deadline has passed");
    }

    // Check if bid already exists
    const existingBid = await this.prisma.supplierBid.findFirst({
      where: { invitationId: invitation.id },
      orderBy: { createdAt: "desc" },
    });

    let bid;

    if (existingBid && dto.status === "SUBMITTED") {
      // Amend existing bid
      bid = await this.prisma.supplierBid.update({
        where: { id: existingBid.id },
        data: {
          status: BidStatus.AMENDED,
          revisionNo: existingBid.revisionNo + 1,
          notes: dto.notes,
          subtotal: dto.subtotal,
          tax: dto.tax,
          shipping: dto.shipping,
          total: dto.total,
          amendedAt: new Date(),
          lineItems: {
            deleteMany: {}, // Clear old line items
            create: dto.lineItems.map((item) => ({
              bidPackageLineItemId: item.bidPackageLineItemId,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice && item.unitPrice > 0
                ? await this.calculateLineTotal(item.bidPackageLineItemId, item.unitPrice)
                : null,
              notes: item.notes,
              leadTimeDays: item.leadTimeDays,
            })),
          },
        },
        include: { lineItems: true },
      });

      this.logger.log(`Amended bid ${bid.id} (revision ${bid.revisionNo})`);
    } else if (!existingBid) {
      // Create new bid
      bid = await this.prisma.supplierBid.create({
        data: {
          bidPackageId: invitation.bidPackageId,
          invitationId: invitation.id,
          status: dto.status === "SUBMITTED" ? BidStatus.SUBMITTED : BidStatus.DRAFT,
          notes: dto.notes,
          subtotal: dto.subtotal,
          tax: dto.tax,
          shipping: dto.shipping,
          total: dto.total,
          submittedAt: dto.status === "SUBMITTED" ? new Date() : null,
          lineItems: {
            create: dto.lineItems.map((item) => ({
              bidPackageLineItemId: item.bidPackageLineItemId,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice && item.unitPrice > 0
                ? null // Will calculate below
                : null,
              notes: item.notes,
              leadTimeDays: item.leadTimeDays,
            })),
          },
        },
        include: { lineItems: { include: { packageLineItem: true } } },
      });

      // Calculate line totals
      for (const lineItem of bid.lineItems) {
        if (lineItem.unitPrice && lineItem.packageLineItem.qty) {
          await this.prisma.supplierBidLineItem.update({
            where: { id: lineItem.id },
            data: { totalPrice: lineItem.unitPrice * lineItem.packageLineItem.qty },
          });
        }
      }

      this.logger.log(`Created bid ${bid.id} (status: ${bid.status})`);
    } else {
      // Update existing draft
      bid = await this.prisma.supplierBid.update({
        where: { id: existingBid.id },
        data: {
          status: dto.status === "SUBMITTED" ? BidStatus.SUBMITTED : BidStatus.DRAFT,
          notes: dto.notes,
          subtotal: dto.subtotal,
          tax: dto.tax,
          shipping: dto.shipping,
          total: dto.total,
          submittedAt: dto.status === "SUBMITTED" && !existingBid.submittedAt ? new Date() : existingBid.submittedAt,
          lineItems: {
            deleteMany: {},
            create: dto.lineItems.map((item) => ({
              bidPackageLineItemId: item.bidPackageLineItemId,
              unitPrice: item.unitPrice,
              totalPrice: null,
              notes: item.notes,
              leadTimeDays: item.leadTimeDays,
            })),
          },
        },
        include: { lineItems: { include: { packageLineItem: true } } },
      });

      // Calculate line totals
      for (const lineItem of bid.lineItems) {
        if (lineItem.unitPrice && lineItem.packageLineItem.qty) {
          await this.prisma.supplierBidLineItem.update({
            where: { id: lineItem.id },
            data: { totalPrice: lineItem.unitPrice * lineItem.packageLineItem.qty },
          });
        }
      }
    }

    // Update invitation status
    if (dto.status === "SUBMITTED") {
      await this.prisma.supplierInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.SUBMITTED, submittedAt: new Date() },
      });
    }

    return bid;
  }

  /**
   * Compare bids side-by-side.
   */
  async compareBids(packageId: string, companyId: string) {
    const bidPackage = await this.prisma.bidPackage.findFirst({
      where: { id: packageId, companyId },
      include: {
        lineItems: { orderBy: { lineNo: "asc" } },
        invitations: {
          include: {
            bids: {
              where: { status: { in: [BidStatus.SUBMITTED, BidStatus.AMENDED] } },
              include: {
                lineItems: {
                  include: { packageLineItem: true },
                },
              },
              orderBy: { submittedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!bidPackage) {
      throw new NotFoundException("Bid package not found");
    }

    // Build comparison matrix
    const lineItems = bidPackage.lineItems.map((pkgLine) => {
      const bids = bidPackage.invitations
        .filter((inv) => inv.bids.length > 0)
        .map((inv) => {
          const bid = inv.bids[0];
          const bidLine = bid.lineItems.find((bl) => bl.bidPackageLineItemId === pkgLine.id);

          return {
            supplier: inv.supplierName,
            unitPrice: bidLine?.unitPrice || null,
            total: bidLine?.totalPrice || null,
            leadTime: bidLine?.leadTimeDays || null,
            notes: bidLine?.notes || null,
          };
        });

      // Find lowest bid
      const validBids = bids.filter((b) => b.unitPrice !== null);
      const lowestBid = validBids.length > 0
        ? validBids.reduce((min, b) => (b.unitPrice! < min.unitPrice! ? b : min))
        : null;

      return {
        lineNo: pkgLine.lineNo,
        description: pkgLine.description,
        qty: pkgLine.qty,
        unit: pkgLine.unit,
        bids,
        lowestBid: lowestBid ? { supplier: lowestBid.supplier, unitPrice: lowestBid.unitPrice } : null,
      };
    });

    // Calculate totals per supplier
    const totals = bidPackage.invitations
      .filter((inv) => inv.bids.length > 0)
      .map((inv) => {
        const bid = inv.bids[0];
        return {
          supplier: inv.supplierName,
          total: bid.total || bid.lineItems.reduce((sum, line) => sum + (line.totalPrice || 0), 0),
        };
      });

    return { lineItems, totals };
  }

  /**
   * Award bid to a supplier.
   */
  async awardBid(packageId: string, companyId: string, bidId: string, notes?: string) {
    const bidPackage = await this.prisma.bidPackage.findFirst({
      where: { id: packageId, companyId },
    });

    if (!bidPackage) {
      throw new NotFoundException("Bid package not found");
    }

    const bid = await this.prisma.supplierBid.findFirst({
      where: { id: bidId, bidPackageId: packageId },
    });

    if (!bid) {
      throw new NotFoundException("Bid not found");
    }

    // Update bid status to AWARDED
    await this.prisma.supplierBid.update({
      where: { id: bidId },
      data: { status: BidStatus.AWARDED, awardedAt: new Date() },
    });

    // Update bid package status
    await this.prisma.bidPackage.update({
      where: { id: packageId },
      data: { status: BidPackageStatus.AWARDED, awardedAt: new Date() },
    });

    this.logger.log(`Awarded bid ${bidId} for package ${packageId}`);

    return { ok: true, awardedAt: new Date() };
  }

  /**
   * Close bidding (no more submissions).
   */
  async closeBidding(packageId: string, companyId: string) {
    const bidPackage = await this.prisma.bidPackage.findFirst({
      where: { id: packageId, companyId },
    });

    if (!bidPackage) {
      throw new NotFoundException("Bid package not found");
    }

    await this.prisma.bidPackage.update({
      where: { id: packageId },
      data: { status: BidPackageStatus.CLOSED, closedAt: new Date() },
    });

    this.logger.log(`Closed bidding for package ${packageId}`);

    return { ok: true, closedAt: new Date() };
  }

  // Helper: Calculate line item total
  private async calculateLineTotal(lineItemId: string, unitPrice: number): Promise<number> {
    const packageLine = await this.prisma.bidPackageLineItem.findUnique({
      where: { id: lineItemId },
    });
    return packageLine ? unitPrice * packageLine.qty : 0;
  }
}
