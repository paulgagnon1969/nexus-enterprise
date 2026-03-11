import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { GlobalRole } from "@prisma/client";

const IDLE_DAYS = 30;

/**
 * Daily cron job that deactivates sandbox company memberships for users
 * who have been idle for more than 30 days. Deactivated users can seamlessly
 * re-enter the sandbox on their next login (auto-reactivation in AuthService).
 *
 * Runs at 03:00 UTC daily.
 */
@Injectable()
export class SandboxCleanupService {
  private readonly logger = new Logger(SandboxCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("0 3 * * *")
  async pruneIdleSandboxMembers() {
    const cutoff = new Date(Date.now() - IDLE_DAYS * 24 * 60 * 60 * 1000);

    // Find all sandbox companies
    const sandboxCompanies = await this.prisma.company.findMany({
      where: { isSandbox: true },
      select: { id: true },
    });

    if (!sandboxCompanies.length) return;

    const sandboxIds = sandboxCompanies.map((c) => c.id);

    // Find active sandbox memberships that are idle
    const idleMembers = await this.prisma.companyMembership.findMany({
      where: {
        companyId: { in: sandboxIds },
        isActive: true,
        user: {
          globalRole: { not: GlobalRole.SUPER_ADMIN },
        },
        OR: [
          // Has activity tracking but idle for 30+ days
          {
            sandboxLastActiveAt: { not: null, lt: cutoff },
          },
          // Never had activity tracking and was created 30+ days ago
          {
            sandboxLastActiveAt: null,
            createdAt: { lt: cutoff },
          },
        ],
      },
      select: { userId: true, companyId: true },
    });

    if (!idleMembers.length) {
      this.logger.log("Sandbox cleanup: no idle members to prune");
      return;
    }

    // Batch deactivate
    let pruned = 0;
    for (const member of idleMembers) {
      await this.prisma.companyMembership.update({
        where: {
          userId_companyId: {
            userId: member.userId,
            companyId: member.companyId,
          },
        },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedByUserId: null, // system-initiated
        },
      });
      pruned++;
    }

    this.logger.log(`Sandbox cleanup: pruned ${pruned} idle member(s)`);
  }
}
