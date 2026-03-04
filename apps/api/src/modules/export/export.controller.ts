import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";

/**
 * Data export endpoint for NexBridge Connect users.
 * Returns a JSON payload containing all user-accessible data,
 * suitable for download and offline access.
 *
 * Rate limit: best-effort 1 export/hour (enforced via exportCompletedAt on device).
 */
@UseGuards(JwtAuthGuard)
@Controller("export")
export class ExportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("my-data")
  async exportMyData(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    const deviceId = req.headers["x-device-id"] || "";

    // Rate limit: check if exported within the last hour
    if (deviceId) {
      const device = await this.prisma.userDevice.findUnique({
        where: {
          UserDevice_user_device_key: {
            userId: user.userId,
            deviceId,
          },
        },
      });
      if (device?.exportCompletedAt) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (device.exportCompletedAt > hourAgo) {
          return {
            error: "RATE_LIMITED",
            message: "You can export once per hour. Please try again later.",
            nextExportAt: new Date(
              device.exportCompletedAt.getTime() + 60 * 60 * 1000,
            ).toISOString(),
          };
        }
      }
    }

    // Gather data
    const [assets, contacts, devices, userInfo, companyInfo] =
      await Promise.all([
        // Assets the user owns or has access to
        this.prisma.asset.findMany({
          where: {
            companyId: user.companyId,
            OR: [
              { ownershipType: "COMPANY" },
              { ownershipType: "PERSONAL", ownerId: user.userId },
              { ownershipType: "PERSONAL", sharingVisibility: "COMPANY" },
            ],
          },
          include: {
            disposition: {
              select: { code: true, label: true },
            },
            tagAssignments: {
              include: { tag: { select: { label: true, color: true } } },
            },
            attachments: {
              select: {
                id: true,
                fileName: true,
                fileSize: true,
                category: true,
                createdAt: true,
              },
            },
          },
        }),

        // Personal contacts
        this.prisma.personalContact.findMany({
          where: { ownerUserId: user.userId },
        }),

        // Registered devices
        this.prisma.userDevice.findMany({
          where: { userId: user.userId },
          select: {
            deviceId: true,
            platform: true,
            deviceName: true,
            appVersion: true,
            lastSeenAt: true,
            registeredAt: true,
            isRevoked: true,
            licenseType: true,
          },
        }),

        // User info
        this.prisma.user.findUnique({
          where: { id: user.userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true,
          },
        }),

        // Company info
        this.prisma.company.findUnique({
          where: { id: user.companyId },
          select: { id: true, name: true },
        }),
      ]);

    // Mark export completed on device
    if (deviceId) {
      await this.prisma.userDevice
        .updateMany({
          where: { userId: user.userId, deviceId },
          data: { exportCompletedAt: new Date() },
        })
        .catch(() => {});
    }

    return {
      exportedAt: new Date().toISOString(),
      user: userInfo,
      company: companyInfo,
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        description: a.description,
        assetType: a.assetType,
        ownershipType: a.ownershipType,
        manufacturer: a.manufacturer,
        model: a.model,
        serialNumberOrVin: a.serialNumberOrVin,
        year: a.year,
        baseUnit: a.baseUnit,
        baseRate: a.baseRate ? Number(a.baseRate) : null,
        isActive: a.isActive,
        disposition: a.disposition?.label ?? null,
        tags: a.tagAssignments.map((ta) => ta.tag.label),
        attachmentCount: a.attachments.length,
        attachments: a.attachments.map((att) => ({
          id: att.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          category: att.category,
        })),
      })),
      contacts: contacts.map((c) => ({
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        source: c.source,
      })),
      devices,
      _meta: {
        format: "nexbridge-export-v1",
        assetCount: assets.length,
        contactCount: contacts.length,
        deviceCount: devices.length,
      },
    };
  }
}
