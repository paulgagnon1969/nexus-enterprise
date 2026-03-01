import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import * as QRCode from "qrcode";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  buildPlacardPayload,
  parsePlacardPayload,
  verifyPlacardSignature,
} from "../../common/crypto/placard.crypto";

@Injectable()
export class PlacardService {
  private readonly logger = new Logger(PlacardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Assign ────────────────────────────────────────────────────────────

  /**
   * Assign a new Nex-Plac placard to an asset.
   * Atomically allocates the next serial number and creates a signed QR payload.
   */
  async assignPlacard(companyId: string, actor: AuthenticatedUser, assetId: string) {
    // Verify asset exists and belongs to this company
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, isActive: true },
      select: { id: true, name: true, manufacturer: true, model: true },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);

    // Check for existing active placard on this asset
    const existing = await this.prisma.assetPlacard.findFirst({
      where: { assetId, companyId, status: "ACTIVE" },
    });
    if (existing) {
      throw new BadRequestException(
        `Asset already has active placard ${existing.code}. Void it first to reassign.`,
      );
    }

    // Atomically allocate the next serial number
    const counter = await this.prisma.placardCounter.upsert({
      where: { companyId },
      create: { companyId, nextSerial: 2 }, // current = 1, next = 2
      update: { nextSerial: { increment: 1 } },
    });
    // The serial we use is `nextSerial - 1` after increment, or `1` on first create
    const serial = counter.nextSerial - 1;
    const code = `NP-${String(serial).padStart(6, "0")}`;

    // Build signed QR payload
    const qrPayload = buildPlacardPayload(assetId, companyId);

    // Create the placard record
    const placard = await this.prisma.assetPlacard.create({
      data: {
        companyId,
        assetId,
        code,
        qrPayload,
        status: "ACTIVE",
        assignedByUserId: actor.userId,
      },
    });

    // Generate QR code as base64 data URL
    const qrDataUrl = await this.generateQrDataUrl(qrPayload);

    await this.audit.log(actor, "PLACARD_ASSIGNED", {
      companyId,
      metadata: { placardId: placard.id, code, assetId, assetName: asset.name },
    });

    this.logger.log(`Placard ${code} assigned to asset "${asset.name}" (${assetId})`);

    return {
      placard,
      qrDataUrl,
      asset: { id: asset.id, name: asset.name, manufacturer: asset.manufacturer, model: asset.model },
    };
  }

  // ── Verify & Lookup ───────────────────────────────────────────────────

  /**
   * Parse and verify a scanned QR payload, then return the linked asset details.
   */
  async verifyAndLookup(companyId: string, qrPayload: string) {
    const parsed = parsePlacardPayload(qrPayload);
    if (!parsed) throw new BadRequestException("Invalid Nex-Plac QR payload");

    // Enforce company isolation
    if (parsed.companyId !== companyId) {
      throw new ForbiddenException("This placard belongs to a different organization");
    }

    // Verify HMAC signature
    const valid = verifyPlacardSignature(parsed.assetId, parsed.companyId, parsed.sig);
    if (!valid) throw new BadRequestException("Placard signature verification failed — possible tamper");

    // Look up the placard record
    const placard = await this.prisma.assetPlacard.findFirst({
      where: { companyId, assetId: parsed.assetId, status: "ACTIVE" },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            manufacturer: true,
            model: true,
            serialNumberOrVin: true,
            year: true,
            assetType: true,
            tagPhotoUrl: true,
            currentLocationId: true,
            isActive: true,
          },
        },
      },
    });

    if (!placard) {
      // Signature is valid but no active placard — asset may have been voided or deleted
      const asset = await this.prisma.asset.findFirst({
        where: { id: parsed.assetId, companyId },
        select: { id: true, name: true, isActive: true },
      });
      if (!asset) throw new NotFoundException("Asset not found");
      throw new BadRequestException(
        `No active placard for asset "${asset.name}". It may have been voided.`,
      );
    }

    return {
      verified: true,
      placard: { id: placard.id, code: placard.code, status: placard.status },
      asset: placard.asset,
    };
  }

  // ── Void ──────────────────────────────────────────────────────────────

  async voidPlacard(companyId: string, actor: AuthenticatedUser, placardId: string) {
    const placard = await this.prisma.assetPlacard.findFirst({
      where: { id: placardId, companyId },
    });
    if (!placard) throw new NotFoundException("Placard not found");
    if (placard.status !== "ACTIVE") {
      throw new BadRequestException(`Placard ${placard.code} is already ${placard.status}`);
    }

    const updated = await this.prisma.assetPlacard.update({
      where: { id: placardId },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedByUserId: actor.userId,
      },
    });

    await this.audit.log(actor, "PLACARD_VOIDED", {
      companyId,
      metadata: { placardId, code: placard.code, assetId: placard.assetId },
    });

    this.logger.log(`Placard ${placard.code} voided by ${actor.userId}`);
    return updated;
  }

  // ── Label / Reprint ───────────────────────────────────────────────────

  async getLabelData(companyId: string, placardId: string) {
    const placard = await this.prisma.assetPlacard.findFirst({
      where: { id: placardId, companyId },
      include: {
        asset: {
          select: { id: true, name: true, manufacturer: true, model: true },
        },
      },
    });
    if (!placard) throw new NotFoundException("Placard not found");

    const qrDataUrl = await this.generateQrDataUrl(placard.qrPayload);

    return {
      placardCode: placard.code,
      qrPayload: placard.qrPayload,
      qrDataUrl,
      assetName: placard.asset.name,
      manufacturer: placard.asset.manufacturer,
      model: placard.asset.model,
    };
  }

  // ── Get active placard for an asset ───────────────────────────────────

  async getActivePlacardForAsset(companyId: string, assetId: string) {
    const placard = await this.prisma.assetPlacard.findFirst({
      where: { companyId, assetId, status: "ACTIVE" },
      include: {
        asset: {
          select: { id: true, name: true, manufacturer: true, model: true },
        },
      },
    });
    if (!placard) return null;

    const qrDataUrl = await this.generateQrDataUrl(placard.qrPayload);
    return { placard, qrDataUrl };
  }

  // ── QR generation helper ──────────────────────────────────────────────

  private async generateQrDataUrl(payload: string): Promise<string> {
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 200,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }
}
