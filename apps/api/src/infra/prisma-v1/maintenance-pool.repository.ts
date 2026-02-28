import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@prisma/client";

@Injectable()
export class MaintenancePoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Pool CRUD ──────────────────────────────────────────────────────

  async listPools(companyId: string) {
    return this.prisma.maintenancePool.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { assets: true } },
      },
    });
  }

  async getPool(companyId: string, poolId: string) {
    const pool = await this.prisma.maintenancePool.findFirst({
      where: { id: poolId, companyId },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { assets: true } },
      },
    });
    if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
    return pool;
  }

  async createPool(companyId: string, name: string, description?: string | null) {
    try {
      return await this.prisma.maintenancePool.create({
        data: { companyId, name, description: description ?? null },
      });
    } catch (e: any) {
      if (e.code === "P2002") throw new ConflictException(`Pool "${name}" already exists`);
      throw e;
    }
  }

  async updatePool(companyId: string, poolId: string, data: { name?: string; description?: string | null }) {
    const existing = await this.prisma.maintenancePool.findFirst({
      where: { id: poolId, companyId },
    });
    if (!existing) throw new NotFoundException(`Pool ${poolId} not found`);

    const update: any = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;

    return this.prisma.maintenancePool.update({
      where: { id: poolId },
      data: update,
    });
  }

  async deletePool(companyId: string, poolId: string) {
    const existing = await this.prisma.maintenancePool.findFirst({
      where: { id: poolId, companyId },
    });
    if (!existing) throw new NotFoundException(`Pool ${poolId} not found`);

    // Unassign assets from this pool before deleting
    await this.prisma.asset.updateMany({
      where: { maintenancePoolId: poolId },
      data: { maintenancePoolId: null },
    });

    return this.prisma.maintenancePool.delete({ where: { id: poolId } });
  }

  // ── Member management ──────────────────────────────────────────────

  async addMember(companyId: string, poolId: string, userId: string) {
    const pool = await this.prisma.maintenancePool.findFirst({
      where: { id: poolId, companyId },
    });
    if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);

    try {
      return await this.prisma.maintenancePoolMember.create({
        data: { poolId, userId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });
    } catch (e: any) {
      if (e.code === "P2002") throw new ConflictException("User is already a member of this pool");
      throw e;
    }
  }

  async removeMember(companyId: string, poolId: string, userId: string) {
    const pool = await this.prisma.maintenancePool.findFirst({
      where: { id: poolId, companyId },
    });
    if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);

    const member = await this.prisma.maintenancePoolMember.findUnique({
      where: { MaintenancePoolMember_pool_user_key: { poolId, userId } },
    });
    if (!member) throw new NotFoundException("User is not a member of this pool");

    return this.prisma.maintenancePoolMember.delete({
      where: { id: member.id },
    });
  }

  // ── Notification resolution ────────────────────────────────────────

  /**
   * Resolve who should receive maintenance notifications for an asset.
   * Priority chain:
   *   1. maintenanceAssigneeId → that user
   *   2. maintenancePoolId → all pool members
   *   3. ownerId (personal asset) → owner
   *   4. fallback → tenant admins
   */
  async getMaintenanceRecipients(
    companyId: string,
    assetId: string,
  ): Promise<{ userId: string; email: string; firstName: string | null; lastName: string | null }[]> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
      select: {
        maintenanceAssigneeId: true,
        maintenancePoolId: true,
        ownerId: true,
        ownershipType: true,
      },
    });
    if (!asset) return [];

    // 1. Individual assignee
    if (asset.maintenanceAssigneeId) {
      const user = await this.prisma.user.findUnique({
        where: { id: asset.maintenanceAssigneeId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      return user ? [{ userId: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }] : [];
    }

    // 2. Pool members
    if (asset.maintenancePoolId) {
      const members = await this.prisma.maintenancePoolMember.findMany({
        where: { poolId: asset.maintenancePoolId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });
      return members.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
      }));
    }

    // 3. Personal asset owner
    if (asset.ownershipType === "PERSONAL" && asset.ownerId) {
      const user = await this.prisma.user.findUnique({
        where: { id: asset.ownerId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      return user ? [{ userId: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }] : [];
    }

    // 4. Fallback: tenant admins
    const admins = await this.prisma.companyMembership.findMany({
      where: { companyId, role: { in: [Role.OWNER, Role.ADMIN] } },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    return admins.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
    }));
  }
}
