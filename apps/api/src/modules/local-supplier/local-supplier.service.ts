import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { getEffectiveRoleLevel } from "../auth/auth.guards";
import { LocalSupplierStatus } from "@prisma/client";

@Injectable()
export class LocalSupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List suppliers for the company, optionally filtered by status. */
  async list(
    actor: AuthenticatedUser,
    filters?: { status?: LocalSupplierStatus },
  ) {
    return this.prisma.localSupplier.findMany({
      where: {
        companyId: actor.companyId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        flaggedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Worker (any authenticated user) flags a supplier as no longer in business.
   * Creates a Task assigned to the nearest project's PM for review.
   */
  async flagClosed(
    actor: AuthenticatedUser,
    supplierId: string,
    reason: string,
  ) {
    const supplier = await this.prisma.localSupplier.findFirst({
      where: { id: supplierId, companyId: actor.companyId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    if (supplier.status !== LocalSupplierStatus.ACTIVE) {
      throw new BadRequestException(
        `Supplier is already ${supplier.status} — cannot flag again`,
      );
    }

    // Transition to PENDING_REMOVAL
    const updated = await this.prisma.localSupplier.update({
      where: { id: supplierId },
      data: {
        status: LocalSupplierStatus.PENDING_REMOVAL,
        flaggedByUserId: actor.userId,
        flaggedAt: new Date(),
        flagReason: reason,
      },
    });

    // Find the nearest project to the supplier (by simple distance), then
    // look up a PM on that project to assign the review task.
    const assigneeId = await this.findNearestPm(actor.companyId, supplier.lat, supplier.lng);

    if (assigneeId) {
      // Pick any project in the company for the task (ideally closest).
      const nearestProject = await this.findNearestProject(
        actor.companyId,
        supplier.lat,
        supplier.lng,
      );

      if (nearestProject) {
        await this.prisma.task.create({
          data: {
            title: `Review supplier removal: ${supplier.name}`,
            description: `${actor.email} flagged "${supplier.name}" as no longer in business.\nReason: ${reason}\n\nPlease approve or deny the removal.`,
            status: "TODO",
            priority: "MEDIUM",
            companyId: actor.companyId,
            projectId: nearestProject.id,
            assigneeId,
            createdByUserId: actor.userId,
            relatedEntityType: "LOCAL_SUPPLIER",
            relatedEntityId: supplierId,
          },
        });
      }
    }

    await this.audit.log(actor, "LOCAL_SUPPLIER_FLAGGED", {
      companyId: actor.companyId,
      metadata: { supplierId, reason },
    });

    return updated;
  }

  /**
   * PM or above approves the removal → PERMANENTLY_CLOSED.
   */
  async approveRemoval(
    actor: AuthenticatedUser,
    supplierId: string,
    note?: string,
  ) {
    this.assertPmOrAbove(actor);

    const supplier = await this.prisma.localSupplier.findFirst({
      where: { id: supplierId, companyId: actor.companyId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    if (supplier.status !== LocalSupplierStatus.PENDING_REMOVAL) {
      throw new BadRequestException(
        "Supplier must be in PENDING_REMOVAL status to approve",
      );
    }

    const updated = await this.prisma.localSupplier.update({
      where: { id: supplierId },
      data: {
        status: LocalSupplierStatus.PERMANENTLY_CLOSED,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    // Close related tasks
    await this.closeRelatedTasks(supplierId, actor.companyId);

    await this.audit.log(actor, "LOCAL_SUPPLIER_REMOVAL_APPROVED", {
      companyId: actor.companyId,
      metadata: { supplierId, note },
    });

    return updated;
  }

  /**
   * PM or above denies the removal → back to ACTIVE.
   */
  async denyRemoval(
    actor: AuthenticatedUser,
    supplierId: string,
    note?: string,
  ) {
    this.assertPmOrAbove(actor);

    const supplier = await this.prisma.localSupplier.findFirst({
      where: { id: supplierId, companyId: actor.companyId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    if (supplier.status !== LocalSupplierStatus.PENDING_REMOVAL) {
      throw new BadRequestException(
        "Supplier must be in PENDING_REMOVAL status to deny",
      );
    }

    const updated = await this.prisma.localSupplier.update({
      where: { id: supplierId },
      data: {
        status: LocalSupplierStatus.ACTIVE,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
        // Clear flag fields
        flaggedByUserId: null,
        flaggedAt: null,
        flagReason: null,
      },
    });

    // Close related tasks
    await this.closeRelatedTasks(supplierId, actor.companyId);

    await this.audit.log(actor, "LOCAL_SUPPLIER_REMOVAL_DENIED", {
      companyId: actor.companyId,
      metadata: { supplierId, note },
    });

    return updated;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private assertPmOrAbove(actor: AuthenticatedUser) {
    const level = getEffectiveRoleLevel({
      globalRole: actor.globalRole,
      role: actor.role,
      profileCode: actor.profileCode,
    });
    if (level < 60) {
      throw new ForbiddenException("PM-level access or higher required");
    }
  }

  /**
   * Find the PM (or OWNER/ADMIN) nearest to a given lat/lng by looking at
   * company projects sorted by distance.
   */
  private async findNearestPm(
    companyId: string,
    lat: number,
    lng: number,
  ): Promise<string | null> {
    // Grab projects with coords, compute simple Euclidean distance
    const projects = await this.prisma.project.findMany({
      where: { companyId, latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        memberships: {
          where: { role: { in: ["OWNER", "ADMIN"] } },
          select: { userId: true, role: true },
        },
      },
    });

    // Sort by distance to supplier
    const sorted = projects
      .filter((p) => p.latitude && p.longitude)
      .map((p) => ({
        ...p,
        dist: Math.hypot(p.latitude! - lat, p.longitude! - lng),
      }))
      .sort((a, b) => a.dist - b.dist);

    for (const proj of sorted) {
      // Prefer ADMIN, then OWNER
      const admin = proj.memberships.find((m) => m.role === "ADMIN");
      if (admin) return admin.userId;
      const owner = proj.memberships.find((m) => m.role === "OWNER");
      if (owner) return owner.userId;
    }

    return null;
  }

  private async findNearestProject(
    companyId: string,
    lat: number,
    lng: number,
  ) {
    const projects = await this.prisma.project.findMany({
      where: { companyId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    });

    return projects
      .filter((p) => p.latitude && p.longitude)
      .map((p) => ({
        ...p,
        dist: Math.hypot(p.latitude! - lat, p.longitude! - lng),
      }))
      .sort((a, b) => a.dist - b.dist)[0] ?? null;
  }

  private async closeRelatedTasks(supplierId: string, companyId: string) {
    await this.prisma.task.updateMany({
      where: {
        companyId,
        relatedEntityType: "LOCAL_SUPPLIER",
        relatedEntityId: supplierId,
        status: { in: ["TODO", "IN_PROGRESS"] },
      },
      data: { status: "DONE" },
    });
  }
}
