import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { createHash } from "crypto";
import {
  BidRecipientStatus,
  BidResponseStatus,
  BidItemAvailability,
} from "@prisma/client";

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 30;

interface SubmitResponseDto {
  items: {
    bidRequestItemId: string;
    unitPrice: number;
    notes?: string;
    leadTimeDays?: number;
    availability?: BidItemAvailability;
  }[];
  totalAmount?: number;
  notes?: string;
  submittedByName?: string;
  submittedByEmail?: string;
}

@Injectable()
export class BidPortalService {
  constructor(private prisma: PrismaService) {}

  /**
   * Verify token exists and return basic info (no PIN required yet)
   */
  async getPortalInfo(accessToken: string) {
    const recipient = await this.prisma.bidRequestRecipient.findUnique({
      where: { accessToken },
      include: {
        bidRequest: {
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            status: true,
            project: {
              select: { addressLine1: true, city: true, state: true },
            },
            company: {
              select: { name: true },
            },
          },
        },
        supplier: {
          select: { name: true },
        },
      },
    });

    if (!recipient) {
      throw new NotFoundException("Invalid or expired access link");
    }

    // Check if token is expired
    if (recipient.expiresAt && recipient.expiresAt < new Date()) {
      throw new UnauthorizedException("This access link has expired");
    }

    // Check if locked out from too many PIN attempts
    if (recipient.pinLockedAt) {
      const lockoutEnd = new Date(
        recipient.pinLockedAt.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000
      );
      if (new Date() < lockoutEnd) {
        throw new UnauthorizedException(
          `Too many incorrect PIN attempts. Please try again in ${PIN_LOCKOUT_MINUTES} minutes.`
        );
      }
      // Lockout expired, reset
      await this.prisma.bidRequestRecipient.update({
        where: { id: recipient.id },
        data: { pinAttempts: 0, pinLockedAt: null },
      });
    }

    return {
      supplierName: recipient.supplier.name,
      companyName: recipient.bidRequest.company.name,
      bidRequest: {
        title: recipient.bidRequest.title,
        description: recipient.bidRequest.description,
        dueDate: recipient.bidRequest.dueDate,
        status: recipient.bidRequest.status,
        project: recipient.bidRequest.project,
      },
      status: recipient.status,
      hasResponded: recipient.status === BidRecipientStatus.RESPONDED,
    };
  }

  /**
   * Verify PIN and return full bid request data
   */
  async verifyPinAndGetBidRequest(accessToken: string, pin: string) {
    const recipient = await this.prisma.bidRequestRecipient.findUnique({
      where: { accessToken },
      include: {
        bidRequest: {
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
            },
            project: {
              select: { addressLine1: true, city: true, state: true },
            },
            company: {
              select: { name: true },
            },
          },
        },
        supplier: true,
        responses: {
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!recipient) {
      throw new NotFoundException("Invalid access link");
    }

    // Check lockout
    if (recipient.pinLockedAt) {
      const lockoutEnd = new Date(
        recipient.pinLockedAt.getTime() + PIN_LOCKOUT_MINUTES * 60 * 1000
      );
      if (new Date() < lockoutEnd) {
        const minutesLeft = Math.ceil(
          (lockoutEnd.getTime() - Date.now()) / (60 * 1000)
        );
        throw new UnauthorizedException(
          `Account locked. Please try again in ${minutesLeft} minutes.`
        );
      }
    }

    // Verify PIN
    const hashedPin = this.hashPin(pin);
    if (hashedPin !== recipient.accessPin) {
      // Increment failed attempts
      const newAttempts = recipient.pinAttempts + 1;
      const updates: any = { pinAttempts: newAttempts };

      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        updates.pinLockedAt = new Date();
      }

      await this.prisma.bidRequestRecipient.update({
        where: { id: recipient.id },
        data: updates,
      });

      const remaining = MAX_PIN_ATTEMPTS - newAttempts;
      if (remaining > 0) {
        throw new UnauthorizedException(
          `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
        );
      } else {
        throw new UnauthorizedException(
          `Too many incorrect attempts. Account locked for ${PIN_LOCKOUT_MINUTES} minutes.`
        );
      }
    }

    // PIN correct - reset attempts and update viewed status
    const updateData: any = { pinAttempts: 0, pinLockedAt: null };

    if (!recipient.viewedAt) {
      updateData.viewedAt = new Date();
    }

    if (recipient.status === BidRecipientStatus.SENT) {
      updateData.status = BidRecipientStatus.VIEWED;
    }

    await this.prisma.bidRequestRecipient.update({
      where: { id: recipient.id },
      data: updateData,
    });

    // Return bid request data
    const bidReq = recipient.bidRequest;
    const respList = recipient.responses || [];
    return {
      recipientId: recipient.id,
      supplier: {
        id: recipient.supplier.id,
        name: recipient.supplier.name,
      },
      bidRequest: {
        id: bidReq.id,
        title: bidReq.title,
        description: bidReq.description,
        dueDate: bidReq.dueDate,
        status: bidReq.status,
        company: bidReq.company,
        project: bidReq.project,
        items: bidReq.items.map((item: any) => ({
          id: item.id,
          catSel: item.catSel,
          divisionCode: item.divisionCode,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          costType: item.costType,
        })),
      },
      existingResponse: respList[0] || null,
      status: recipient.status,
    };
  }

  /**
   * Submit or update a bid response
   */
  async submitResponse(
    accessToken: string,
    pin: string,
    dto: SubmitResponseDto
  ) {
    // Verify PIN first
    const data = await this.verifyPinAndGetBidRequest(accessToken, pin);

    const recipient = await this.prisma.bidRequestRecipient.findUnique({
      where: { accessToken },
      include: {
        bidRequest: true,
        supplier: true,
      },
    });

    if (!recipient) {
      throw new NotFoundException("Invalid access link");
    }

    // Check if bid request is still open
    if (recipient.bidRequest.status !== "SENT") {
      throw new BadRequestException(
        "This bid request is no longer accepting responses"
      );
    }

    // Validate all items belong to this bid request
    const validItemIds = new Set(data.bidRequest.items.map((i: any) => i.id));
    for (const item of dto.items) {
      if (!validItemIds.has(item.bidRequestItemId)) {
        throw new BadRequestException(
          `Invalid item ID: ${item.bidRequestItemId}`
        );
      }
    }

    // Calculate total if not provided
    const totalAmount =
      dto.totalAmount ??
      dto.items.reduce((sum, item) => {
        const bidItem = data.bidRequest.items.find(
          (i: any) => i.id === item.bidRequestItemId
        );
        return sum + item.unitPrice * (bidItem?.quantity || 1);
      }, 0);

    // Create or update response
    const existingResponse = await this.prisma.bidResponse.findFirst({
      where: {
        bidRequestId: recipient.bidRequest.id,
        recipientId: recipient.id,
        supplierId: recipient.supplier.id,
      },
    });

    let response;

    if (existingResponse) {
      // Delete old items and update response
      await this.prisma.bidResponseItem.deleteMany({
        where: { bidResponseId: existingResponse.id },
      });

      response = await this.prisma.bidResponse.update({
        where: { id: existingResponse.id },
        data: {
          totalAmount,
          notes: dto.notes,
          submittedByName: dto.submittedByName,
          submittedByEmail: dto.submittedByEmail,
          status: BidResponseStatus.SUBMITTED,
          submittedAt: new Date(),
          items: {
            create: dto.items.map((item) => ({
              bidRequestItemId: item.bidRequestItemId,
              unitPrice: item.unitPrice,
              notes: item.notes,
              leadTimeDays: item.leadTimeDays,
              availability: item.availability || BidItemAvailability.IN_STOCK,
            })),
          },
        },
      });
    } else {
      // Create new response
      response = await this.prisma.bidResponse.create({
        data: {
          bidRequestId: recipient.bidRequestId,
          recipientId: recipient.id,
          supplierId: recipient.supplierId,
          totalAmount,
          notes: dto.notes,
          submittedByName: dto.submittedByName,
          submittedByEmail: dto.submittedByEmail,
          status: BidResponseStatus.SUBMITTED,
          submittedAt: new Date(),
          items: {
            create: dto.items.map((item) => ({
              bidRequestItemId: item.bidRequestItemId,
              unitPrice: item.unitPrice,
              notes: item.notes,
              leadTimeDays: item.leadTimeDays,
              availability: item.availability || BidItemAvailability.IN_STOCK,
            })),
          },
        },
      });
    }

    // Update recipient status
    await this.prisma.bidRequestRecipient.update({
      where: { id: recipient.id },
      data: {
        status: BidRecipientStatus.RESPONDED,
        respondedAt: new Date(),
      },
    });

    // Count items from the dto since we didn't include them
    return {
      success: true,
      responseId: response.id,
      totalAmount: response.totalAmount,
      itemCount: dto.items.length,
    };
  }

  /**
   * Decline to bid
   */
  async declineBid(accessToken: string, pin: string, reason?: string) {
    // Verify PIN
    await this.verifyPinAndGetBidRequest(accessToken, pin);

    const recipient = await this.prisma.bidRequestRecipient.findUnique({
      where: { accessToken },
    });

    if (!recipient) {
      throw new NotFoundException("Invalid access link");
    }

    await this.prisma.bidRequestRecipient.update({
      where: { id: recipient.id },
      data: {
        status: BidRecipientStatus.DECLINED,
        declinedAt: new Date(),
      },
    });

    return { success: true };
  }

  private hashPin(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
  }
}
