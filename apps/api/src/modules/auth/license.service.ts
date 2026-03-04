import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

const GRACE_PERIOD_DAYS = 14;

/**
 * Manages device license lifecycle. Called from billing webhooks and
 * module toggle flows to start/clear grace periods on user devices.
 */
@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * When a specific module is disabled for a company, start the grace
   * period on all registered devices for that company.
   */
  async onModuleDisabled(companyId: string, moduleCode: string) {
    if (moduleCode !== "NEXBRIDGE") return;

    const graceEndsAt = new Date(
      Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.userDevice.updateMany({
      where: {
        companyId,
        isRevoked: false,
        graceEndsAt: null, // Don't override existing grace periods
      },
      data: { graceEndsAt },
    });
  }

  /**
   * When a company's entire subscription is canceled, start grace
   * period on ALL their devices.
   */
  async onSubscriptionCanceled(companyId: string) {
    const graceEndsAt = new Date(
      Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.userDevice.updateMany({
      where: {
        companyId,
        isRevoked: false,
        graceEndsAt: null,
      },
      data: { graceEndsAt },
    });
  }

  /**
   * When a module is re-enabled (or subscription renewed), clear
   * grace periods on all company devices.
   */
  async onModuleReEnabled(companyId: string, moduleCode: string) {
    if (moduleCode !== "NEXBRIDGE") return;

    await this.prisma.userDevice.updateMany({
      where: {
        companyId,
        isRevoked: false,
        graceEndsAt: { not: null },
      },
      data: { graceEndsAt: null },
    });
  }

  /**
   * Register (or update) a device for a user. Enforces the device limit.
   */
  async registerDevice(
    userId: string,
    companyId: string,
    input: {
      deviceId: string;
      platform: string;
      deviceName?: string;
      appVersion?: string;
    },
  ) {
    const maxDevices = parseInt(process.env.MAX_DEVICES_PER_USER || "3", 10);

    // Check if this device is already registered
    const existing = await this.prisma.userDevice.findUnique({
      where: {
        UserDevice_user_device_key: {
          userId,
          deviceId: input.deviceId,
        },
      },
    });

    if (existing) {
      // Update existing device
      return this.prisma.userDevice.update({
        where: { id: existing.id },
        data: {
          platform: input.platform,
          deviceName: input.deviceName ?? existing.deviceName,
          appVersion: input.appVersion,
          lastSeenAt: new Date(),
          isRevoked: false,
          revokedAt: null,
        },
      });
    }

    // Check device count
    const activeCount = await this.prisma.userDevice.count({
      where: {
        userId,
        isRevoked: false,
      },
    });

    if (activeCount >= maxDevices) {
      const activeDevices = await this.prisma.userDevice.findMany({
        where: { userId, isRevoked: false },
        select: {
          id: true,
          deviceId: true,
          platform: true,
          deviceName: true,
          lastSeenAt: true,
          registeredAt: true,
        },
        orderBy: { lastSeenAt: "desc" },
      });

      return {
        error: "DEVICE_LIMIT_REACHED",
        maxDevices,
        activeDevices,
      };
    }

    return this.prisma.userDevice.create({
      data: {
        userId,
        companyId,
        deviceId: input.deviceId,
        platform: input.platform,
        deviceName: input.deviceName,
        appVersion: input.appVersion,
      },
    });
  }

  async listDevices(userId: string) {
    return this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.userDevice.findFirst({
      where: { userId, deviceId, isRevoked: false },
    });
    if (!device) return null;

    return this.prisma.userDevice.update({
      where: { id: device.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  async adminRevokeDevice(targetUserId: string, deviceId: string) {
    const device = await this.prisma.userDevice.findFirst({
      where: { userId: targetUserId, deviceId, isRevoked: false },
    });
    if (!device) return null;

    return this.prisma.userDevice.update({
      where: { id: device.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }
}
