import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { PrismaService } from "../infra/prisma/prisma.service";
import { EntitlementService } from "../modules/billing/entitlement.service";
import { AuthenticatedUser } from "../modules/auth/jwt.strategy";

const GRACE_PERIOD_DAYS = 14;
const EXPORT_WINDOW_DAYS = 30;

/**
 * Global interceptor for NexBridge license enforcement.
 * Only activates when X-App-Platform: nexbridge is present AND user is authenticated.
 *
 * Adds response headers:
 *   X-License-Status: ACTIVE | GRACE_PERIOD | EXPORT_ONLY | LOCKED
 *   X-Grace-Ends-At: ISO date (when in grace period)
 *
 * Returns 402 when subscription has fully lapsed (past grace period).
 */
@Injectable()
export class LicenseStatusInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const platform = (request.headers["x-app-platform"] || "").toLowerCase();
    if (platform !== "nexbridge") {
      return next.handle();
    }

    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.userId || !user?.companyId) {
      // Not yet authenticated — let auth guards handle it
      return next.handle();
    }

    // Skip enforcement for SUPER_ADMIN / SUPPORT
    if (user.globalRole === "SUPER_ADMIN" || user.globalRole === "SUPPORT") {
      response.setHeader("X-License-Status", "ACTIVE");
      return next.handle();
    }

    // 1. Check NEXBRIDGE module entitlement
    const nexbridgeEnabled = await this.entitlements.isModuleEnabled(
      user.companyId,
      "NEXBRIDGE",
    );

    // 2. Look up the device (if registered)
    const deviceId = request.headers["x-device-id"] || "";
    let device: any = null;
    if (deviceId) {
      device = await this.prisma.userDevice.findUnique({
        where: {
          UserDevice_user_device_key: {
            userId: user.userId,
            deviceId,
          },
        },
      });
    }

    // Determine license status
    const now = new Date();
    let status = "ACTIVE";

    if (!nexbridgeEnabled) {
      // Module disabled for this company
      if (device?.graceEndsAt) {
        const graceEnd = new Date(device.graceEndsAt);
        const exportEnd = new Date(
          graceEnd.getTime() + EXPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );

        if (now < graceEnd) {
          status = "GRACE_PERIOD";
          response.setHeader("X-Grace-Ends-At", graceEnd.toISOString());
        } else if (now < exportEnd) {
          status = "EXPORT_ONLY";
        } else {
          status = "LOCKED";
        }
      } else if (device && !device.graceEndsAt) {
        // Module just got disabled but grace hasn't been set yet — start grace now
        const graceEndsAt = new Date(
          now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
        );
        await this.prisma.userDevice.update({
          where: { id: device.id },
          data: { graceEndsAt },
        });
        status = "GRACE_PERIOD";
        response.setHeader("X-Grace-Ends-At", graceEndsAt.toISOString());
      } else {
        // No device registered + module disabled → block immediately
        status = "LOCKED";
      }
    } else if (device?.licenseType === "EXPIRED") {
      status = "LOCKED";
    } else if (device?.graceEndsAt) {
      // Module re-enabled — clear grace period
      await this.prisma.userDevice.update({
        where: { id: device.id },
        data: { graceEndsAt: null },
      });
    }

    response.setHeader("X-License-Status", status);

    // Block requests when past grace
    if (status === "EXPORT_ONLY") {
      // Allow only export and auth endpoints
      const path = request.url || "";
      const isExportOrAuth =
        path.includes("/export/") ||
        path.includes("/auth/") ||
        path.includes("/health");
      if (!isExportOrAuth) {
        throw new HttpException(
          {
            error: "SUBSCRIPTION_LAPSED",
            message:
              "Your NexBridge subscription has ended. You can export your data or renew.",
            exportOnly: true,
            graceEndedAt: device?.graceEndsAt?.toISOString(),
          },
          402,
        );
      }
    }

    if (status === "LOCKED") {
      const path = request.url || "";
      const isAuth = path.includes("/auth/") || path.includes("/health");
      if (!isAuth) {
        throw new HttpException(
          {
            error: "LICENSE_LOCKED",
            message:
              "Your NexBridge license has expired. Contact support or purchase a new license.",
          },
          402,
        );
      }
    }

    // Update lastSeenAt on device (best-effort, don't block request)
    if (device && status === "ACTIVE") {
      this.prisma.userDevice
        .update({
          where: { id: device.id },
          data: { lastSeenAt: now },
        })
        .catch(() => {});
    }

    return next.handle();
  }
}
