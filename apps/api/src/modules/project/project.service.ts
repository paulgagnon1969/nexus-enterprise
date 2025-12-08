import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { Role, ProjectRole, ProjectParticleType, ProjectParticipantScope, ProjectVisibilityLevel } from "@prisma/client";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateProjectDto } from "./dto/project.dto";
import { importXactCsvForProject } from "@repo/database";

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async createProject(dto: CreateProjectDto, actor: AuthenticatedUser) {
    const { userId, companyId } = actor;

    const project = await this.prisma.project.create({
      data: {
        companyId,
        name: dto.name,
        externalId: dto.externalId,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country ?? undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        primaryContactName: dto.primaryContactName,
        primaryContactPhone: dto.primaryContactPhone,
        primaryContactEmail: dto.primaryContactEmail,
        createdByUserId: userId
      }
    });

    // For convenience, create a default Unit and a top-level ProjectParticle
    const unit = await this.prisma.projectUnit.create({
      data: {
        companyId,
        projectId: project.id,
        label: "Unit 1"
      }
    });

    await this.prisma.projectParticle.create({
      data: {
        companyId,
        projectId: project.id,
        unitId: unit.id,
        type: ProjectParticleType.ROOM,
        name: "Whole Unit",
        fullLabel: `${unit.label} - Whole Unit`
      }
    });

    await this.prisma.projectMembership.create({
      data: {
        userId,
        projectId: project.id,
        companyId,
        role: ProjectRole.OWNER
      }
    });

    await this.audit.log(actor, "PROJECT_CREATED", {
      companyId,
      projectId: project.id,
      metadata: {
        projectName: project.name,
        addressLine1: project.addressLine1,
        city: project.city,
        state: project.state
      }
    });

    return project;
  }

  async listProjectsForUser(
    userId: string,
    companyId: string,
    companyRole: Role,
    filters?: { status?: string; tagIds?: string[] }
  ) {
    const where: any = {
      companyId
    };

    // Status filter: map Open/Closed/Warranty to project.status strings
    if (filters?.status) {
      const s = filters.status.toLowerCase();
      if (s === "open") {
        where.status = { in: ["active", "open"], mode: "insensitive" } as any;
      } else if (s === "closed") {
        where.status = { equals: "closed", mode: "insensitive" } as any;
      } else if (s === "warranty") {
        where.status = { equals: "warranty", mode: "insensitive" } as any;
      }
    }

    // Tag filter: if tagIds present, restrict to projects that have any of those tags
    if (filters?.tagIds && filters.tagIds.length) {
      const tagAssignments = await this.prisma.tagAssignment.findMany({
        where: {
          companyId,
          entityType: "project",
          tagId: { in: filters.tagIds }
        },
        select: { entityId: true }
      });
      const projectIds = Array.from(
        new Set(tagAssignments.map(a => a.entityId))
      );
      if (!projectIds.length) {
        return [];
      }
      where.id = { in: projectIds };
    }

    if (companyRole === Role.OWNER || companyRole === Role.ADMIN) {
      return this.prisma.project.findMany({ where });
    }

    return this.prisma.project.findMany({
      where: {
        ...where,
        memberships: {
          some: {
            userId,
            companyId
          }
        }
      }
    });
  }

  async getHierarchy(
    projectId: string,
    userId: string,
    companyId: string,
    companyRole: Role
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (companyRole !== Role.OWNER && companyRole !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId,
            projectId
          }
        }
      });

      if (!membership) {
        throw new ForbiddenException("You do not have access to this project");
      }
    }

    const [buildings, units, particles] = await Promise.all([
      this.prisma.projectBuilding.findMany({
        where: { projectId, companyId }
      }),
      this.prisma.projectUnit.findMany({
        where: { projectId, companyId }
      }),
      this.prisma.projectParticle.findMany({
        where: { projectId, companyId }
      })
    ]);

    const particlesById = new Map<string, any>();
    particles.forEach((p: any) => {
      particlesById.set(p.id, { ...p, children: [] as any[] });
    });

    const rootParticles: any[] = [];

    particlesById.forEach((p) => {
      if (p.parentParticleId) {
        const parent = particlesById.get(p.parentParticleId);
        if (parent) {
          parent.children.push(p);
        } else {
          rootParticles.push(p);
        }
      } else {
        rootParticles.push(p);
      }
    });

    const unitsById = new Map<string, any>();
    units.forEach((u: any) => {
      unitsById.set(u.id, { ...u, particles: [] as any[] });
    });

    // Attach particles to units (or leave as project-level if no unitId)
    rootParticles.forEach((p) => {
      if (p.unitId && unitsById.has(p.unitId)) {
        unitsById.get(p.unitId).particles.push(p);
      }
    });

    const buildingsById = new Map<string, any>();
    buildings.forEach((b: any) => {
      buildingsById.set(b.id, {
        ...b,
        units: [] as any[],
        particles: [] as any[]
      });
    });

    // Attach units to buildings (or treat as project-level units if no buildingId)
    const projectLevelUnits: any[] = [];
    unitsById.forEach((u) => {
      if (u.buildingId && buildingsById.has(u.buildingId)) {
        buildingsById.get(u.buildingId).units.push(u);
      } else {
        projectLevelUnits.push(u);
      }
    });

    // Attach particles that are directly on buildings or project
    particlesById.forEach((p) => {
      if (p.parentParticleId) return; // already nested under another particle
      if (p.buildingId && buildingsById.has(p.buildingId)) {
        buildingsById.get(p.buildingId).particles.push(p);
      }
    });

    const buildingTree = Array.from(buildingsById.values());

    return {
      project,
      buildings: buildingTree,
      units: projectLevelUnits
    };
  }

  async addMember(
    projectId: string,
    targetUserId: string,
    role: ProjectRole,
    currentUserRole: Role,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    if (currentUserRole !== Role.OWNER && currentUserRole !== Role.ADMIN) {
      throw new ForbiddenException("Only company OWNER or ADMIN can manage project members");
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        companyId
      }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // For now, we only allow adding members from the same company.
    const userMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: targetUserId,
          companyId
        }
      }
    });

    if (!userMembership) {
      throw new ForbiddenException("Target user is not a member of this company");
    }

    const membership = await this.prisma.client.projectMembership.upsert({
      where: {
        userId_projectId: {
          userId: targetUserId,
          projectId
        }
      },
      update: {
        role,
        scope: ProjectParticipantScope.OWNER_MEMBER,
        visibility: ProjectVisibilityLevel.FULL
      },
      create: {
        userId: targetUserId,
        projectId,
        companyId,
        role,
        scope: ProjectParticipantScope.OWNER_MEMBER,
        visibility: ProjectVisibilityLevel.FULL
      }
    });

    await this.audit.log(actor, "PROJECT_MEMBER_ADDED", {
      companyId,
      userId: targetUserId,
      projectId,
      metadata: { role, targetUserId }
    });

    return membership;
  }

  async getParticipantsForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.client.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId
          }
        }
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to this project");
      }
    }

    const memberships = await this.prisma.projectMembership.findMany({
      where: { projectId },
      include: {
        user: true,
        company: true
      }
    });

    const myOrganization = memberships.filter(
      (m) =>
        m.companyId === project.companyId &&
        m.scope === ProjectParticipantScope.OWNER_MEMBER
    );

    const collaborators = memberships.filter(
      (m) =>
        m.companyId !== project.companyId &&
        m.scope === ProjectParticipantScope.COLLABORATOR_MEMBER
    );

    return {
      projectId,
      myOrganization,
      collaborators
    };
  }

  async importXactForProject(
    projectId: string,
    companyId: string,
    csvPath: string,
    actor: AuthenticatedUser
  ) {
    try {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, companyId }
      });

      if (!project) {
        throw new NotFoundException("Project not found in this company");
      }

      const result = await importXactCsvForProject({
        projectId,
        csvPath,
        importedByUserId: actor.userId
      });

      await this.audit.log(actor, "ESTIMATE_IMPORTED", {
        companyId,
        projectId,
        metadata: {
          estimateVersionId: result.estimateVersionId,
          sowId: result.sowId,
          itemCount: result.itemCount,
          totalAmount: result.totalAmount
        }
      });

      return result;
    } catch (err: any) {
      console.error("Error in importXactForProject", {
        projectId,
        companyId,
        csvPath,
        error: err?.message ?? String(err)
      });
      throw err;
    }
  }

  async deleteProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only OWNER or ADMIN can delete projects");
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    await this.prisma.client.$transaction(async (tx) => {
      // 1) PETL audit trail
      await tx.petlEditChange.deleteMany({
        where: {
          sowItem: {
            sow: { projectId }
          }
        }
      });
      await tx.petlEditSession.deleteMany({ where: { projectId } });

      // 2) SOW items and raw rows
      await tx.sowItem.deleteMany({
        where: {
          sow: { projectId }
        }
      });
      await tx.rawXactRow.deleteMany({
        where: {
          estimateVersion: { projectId }
        }
      });

      // 3) SOWs and estimate versions
      await tx.sow.deleteMany({ where: { projectId } });
      await tx.estimateVersion.deleteMany({ where: { projectId } });

      // 4) Tasks and parcels
      await tx.task.deleteMany({ where: { projectId } });
      await tx.parcel.deleteMany({ where: { projectId } });

      // 5) SOW logical items that reference particles
      await tx.sowLogicalItem.deleteMany({ where: { projectId } });

      // 6) Physical hierarchy (particles, units, buildings)
      await tx.projectParticle.deleteMany({ where: { projectId } });
      await tx.projectUnit.deleteMany({ where: { projectId } });
      await tx.projectBuilding.deleteMany({ where: { projectId } });

      // 7) Project memberships
      await tx.projectMembership.deleteMany({ where: { projectId } });

      // 8) Any NameAlias rows that point at this project
      await tx.nameAlias.deleteMany({
        where: {
          entityType: "project",
          entityId: projectId
        }
      });

      // 9) Finally, the project itself
      await tx.project.delete({ where: { id: projectId } });
    });

    await this.audit.log(actor, "PROJECT_DELETED", {
      companyId,
      projectId
    });

    return { success: true };
  }

  async getPetlForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as other PETL endpoints
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.client.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId
          }
        }
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to this project's PETL");
      }
    }

    const latestVersion = await this.prisma.client.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { sequenceNo: "desc" }
    });

    if (!latestVersion) {
      return { projectId, estimateVersionId: null, items: [] };
    }

    const items = await this.prisma.client.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      orderBy: { lineNo: "asc" },
      include: {
        projectParticle: true
      }
    });

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      items
    };
  }

  async applySinglePetlPercentEdit(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    newPercent: number
  ) {
    // simple wrapper to reuse applyPetlPercentageEditsForProject with a single change
    return this.applyPetlPercentageEditsForProject(projectId, companyId, actor, {
      changes: [
        {
          sowItemId,
          newPercent
        }
      ]
    });
  }

  async applyPetlPercentageEditsForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    body: {
      filters?: {
        roomParticleIds?: string[];
        categoryCodes?: string[];
        selectionCodes?: string[];
      };
      operation?: "set" | "increment" | "decrement";
      percent?: number;
      changes?: { sowItemId: string; oldPercent?: number | null; newPercent: number }[];
    }
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const { filters, operation, percent, changes } = body ?? {};

    // Backwards-compatible path: explicit changes array (e.g., per-row updates or "all items" bulk set)
    if (changes && Array.isArray(changes) && changes.length > 0) {
      const normalized = changes.map((c) => ({
        sowItemId: String(c.sowItemId),
        oldPercent: typeof c.oldPercent === "number" ? c.oldPercent : null,
        newPercent: c.newPercent
      }));

      const distinct = normalized.filter(
        (c) => c.oldPercent === null || c.oldPercent !== c.newPercent
      );
      if (distinct.length === 0) {
        return { status: "noop" };
      }

      await this.prisma.$transaction(async (tx) => {
        const startedAt = new Date();
        const endedAt = new Date();

        const session = await tx.petlEditSession.create({
          data: {
            projectId,
            userId: actor.userId,
            source: "ncc-petl-ui",
            startedAt,
            endedAt
          }
        });

        const sowItemIds = [...new Set(distinct.map((c) => c.sowItemId))];
        const sowItems = await tx.sowItem.findMany({
          where: { id: { in: sowItemIds } }
        });
        const byId = new Map<string, (typeof sowItems)[number]>(
          sowItems.map((i) => [i.id, i])
        );

        for (const change of distinct) {
          const row = byId.get(change.sowItemId);
          if (!row) continue;

          const currentDbPercent = row.percentComplete ?? 0;
          const old = change.oldPercent ?? currentDbPercent;
          const next = change.newPercent;

          await tx.petlEditChange.create({
            data: {
              sessionId: session.id,
              sowItemId: row.id,
              field: "percent_complete",
              oldValue: old,
              newValue: next,
              effectiveAt: endedAt
            }
          });

          await tx.sowItem.update({
            where: { id: row.id },
            data: { percentComplete: next }
          });
        }
      });

      return { status: "ok" };
    }

    // Filtered / batch operation path
    if (percent === undefined || Number.isNaN(percent)) {
      throw new ForbiddenException("percent is required for filtered updates");
    }
    const op: "set" | "increment" | "decrement" = (operation as any) ?? "set";

    const where: any = {
      sow: { projectId }
    };
    if (filters?.roomParticleIds && filters.roomParticleIds.length > 0) {
      where.projectParticleId = { in: filters.roomParticleIds };
    }
    if (filters?.categoryCodes && filters.categoryCodes.length > 0) {
      where.categoryCode = { in: filters.categoryCodes };
    }
    if (filters?.selectionCodes && filters.selectionCodes.length > 0) {
      where.selectionCode = { in: filters.selectionCodes };
    }

    const items = await this.prisma.sowItem.findMany({ where });
    if (items.length === 0) {
      return { status: "noop" };
    }

    const computedChanges = items
      .map((row) => {
        const current = row.percentComplete ?? 0;
        let next = current;
        if (op === "set") {
          next = percent;
        } else if (op === "increment") {
          next = current + percent;
        } else if (op === "decrement") {
          next = current - percent;
        }
        next = Math.max(0, Math.min(100, next));
        if (next === current) {
          return null;
        }
        return {
          sowItemId: row.id,
          oldPercent: current,
          newPercent: next
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (computedChanges.length === 0) {
      return { status: "noop" };
    }

    await this.prisma.$transaction(async (tx) => {
      const startedAt = new Date();
      const endedAt = new Date();

      const session = await tx.petlEditSession.create({
        data: {
          projectId,
          userId: actor.userId,
          source: "ncc-petl-ui",
          startedAt,
          endedAt
        }
      });

      const sowItemIds = [...new Set(computedChanges.map((c) => c.sowItemId))];
      const sowItems = await tx.sowItem.findMany({
        where: { id: { in: sowItemIds } }
      });
      const byId = new Map<string, (typeof sowItems)[number]>(
        sowItems.map((i) => [i.id, i])
      );

      for (const change of computedChanges) {
        const row = byId.get(change.sowItemId);
        if (!row) continue;

        const currentDbPercent = row.percentComplete ?? 0;
        const old = change.oldPercent ?? currentDbPercent;
        const next = change.newPercent;

        await tx.petlEditChange.create({
          data: {
            sessionId: session.id,
            sowItemId: row.id,
            field: "percent_complete",
            oldValue: old,
            newValue: next,
            effectiveAt: endedAt
          }
        });

        await tx.sowItem.update({
          where: { id: row.id },
          data: { percentComplete: next }
        });
      }
    });

    return { status: "ok" };
  }

  async getPetlGroupsForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.client.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId
          }
        }
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to this project's PETL");
      }
    }

    const latestVersion = await this.prisma.client.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { sequenceNo: "desc" }
    });

    if (!latestVersion) {
      return { projectId, groups: [] };
    }

    const items = await this.prisma.client.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      include: { projectParticle: true }
    });

    type GroupAgg = {
      particleId: string | null;
      roomName: string;
      itemsCount: number;
      totalAmount: number;
      completedAmount: number;
      percentComplete: number;
    };

    const byParticle = new Map<string, GroupAgg>();

    for (const item of items) {
      const particle = item.projectParticle;
      const key = particle ? particle.id : "__project__";
      const roomName =
        particle?.fullLabel ?? particle?.name ?? "Whole Project";

      let agg = byParticle.get(key);
      if (!agg) {
        agg = {
          particleId: particle ? particle.id : null,
          roomName,
          itemsCount: 0,
          totalAmount: 0,
          completedAmount: 0,
          percentComplete: 0
        };
        byParticle.set(key, agg);
      }

      agg.itemsCount += 1;

      const lineTotal = item.itemAmount ?? 0;
      agg.totalAmount += lineTotal;

      const pct = item.percentComplete ?? 0;
      agg.completedAmount += lineTotal * (pct / 100);
    }

    const groups = Array.from(byParticle.values()).map((g, idx) => {
      const total = g.totalAmount;
      const percent = total > 0 ? (g.completedAmount / total) * 100 : 0;
      return {
        id: idx + 1,
        particleId: g.particleId,
        roomName: g.roomName,
        itemsCount: g.itemsCount,
        totalAmount: g.totalAmount,
        completedAmount: g.completedAmount,
        percentComplete: percent
      };
    });

    return { projectId, groups };
  }

  async getPetlSelectionSummaryForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    filters: {
      roomParticleId?: string;
      categoryCode?: string;
      selectionCode?: string;
    }
  ) {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.client.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId
          }
        }
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to this project's PETL");
      }
    }

    const latestVersion = await this.prisma.client.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { sequenceNo: "desc" }
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        itemCount: 0,
        totalAmount: 0,
        completedAmount: 0,
        percentComplete: 0
      };
    }

    const where: any = {
      estimateVersionId: latestVersion.id
    };

    if (filters.roomParticleId) {
      where.projectParticleId = filters.roomParticleId;
    }
    if (filters.categoryCode) {
      where.categoryCode = filters.categoryCode;
    }
    if (filters.selectionCode) {
      where.selectionCode = filters.selectionCode;
    }

    const items = await this.prisma.client.sowItem.findMany({ where });

    if (items.length === 0) {
      return {
        projectId,
        estimateVersionId: latestVersion.id,
        itemCount: 0,
        totalAmount: 0,
        completedAmount: 0,
        percentComplete: 0
      };
    }

    let itemCount = 0;
    let totalAmount = 0;
    let completedAmount = 0;

    for (const item of items) {
      const lineTotal = item.itemAmount ?? 0;
      const pct = item.percentComplete ?? 0;
      itemCount += 1;
      totalAmount += lineTotal;
      completedAmount += lineTotal * (pct / 100);
    }

    const percentComplete =
      totalAmount > 0 ? (completedAmount / totalAmount) * 100 : 0;

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      itemCount,
      totalAmount,
      completedAmount,
      percentComplete
    };
  }

  async getEstimateSummaryForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Reuse same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.client.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId
          }
        }
      });
      if (!membership) {
        throw new ForbiddenException(
          "You do not have access to this project's estimates"
        );
      }
    }

    const latestVersion = await this.prisma.client.estimateVersion.findFirst({
      where: { projectId },
      orderBy: { sequenceNo: "desc" }
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        itemCount: 0,
        totalAmount: 0
      };
    }

    const agg = await this.prisma.client.sowItem.aggregate({
      where: { estimateVersionId: latestVersion.id },
      _count: { _all: true },
      _sum: { itemAmount: true }
    });

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      itemCount: agg._count._all ?? 0,
      totalAmount: agg._sum.itemAmount ?? 0
    };
  }
}
