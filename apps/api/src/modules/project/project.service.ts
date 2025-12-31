import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role, ProjectRole, ProjectParticleType, ProjectParticipantScope, ProjectVisibilityLevel } from "@prisma/client";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import { importXactCsvForProject, importXactComponentsCsvForEstimate, allocateComponentsForEstimate } from "@repo/database";

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

  async getProjectByIdForUser(projectId: string, actor: AuthenticatedUser) {
    const { companyId, userId, role } = actor;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (role === Role.OWNER || role === Role.ADMIN) {
      return project;
    }

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

    return project;
  }

  async updateProject(projectId: string, dto: UpdateProjectDto, actor: AuthenticatedUser) {
    const { companyId, role } = actor;

    if (role !== Role.OWNER && role !== Role.ADMIN) {
      throw new ForbiddenException("Only company OWNER or ADMIN can edit projects");
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name ?? project.name,
        externalId: dto.externalId ?? project.externalId ?? undefined,
        addressLine1: dto.addressLine1 ?? project.addressLine1,
        addressLine2: dto.addressLine2 ?? project.addressLine2 ?? undefined,
        city: dto.city ?? project.city,
        state: dto.state ?? project.state,
        postalCode: dto.postalCode ?? project.postalCode ?? undefined,
        country: dto.country ?? project.country ?? undefined,
        latitude: dto.latitude ?? project.latitude ?? undefined,
        longitude: dto.longitude ?? project.longitude ?? undefined,
        primaryContactName: dto.primaryContactName ?? project.primaryContactName ?? undefined,
        primaryContactPhone: dto.primaryContactPhone ?? project.primaryContactPhone ?? undefined,
        primaryContactEmail: dto.primaryContactEmail ?? project.primaryContactEmail ?? undefined,
        status: dto.status ?? project.status
      }
    });

    await this.audit.log(actor, "PROJECT_UPDATED", {
      companyId,
      projectId: updated.id,
      metadata: {
        projectName: updated.name,
        status: updated.status
      }
    });

    return updated;
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

    const membership = await this.prisma.projectMembership.upsert({
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
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
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

  async importXactComponentsForProject(
    projectId: string,
    companyId: string,
    csvPath: string,
    actor: AuthenticatedUser,
    estimateVersionId?: string,
  ) {
    try {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, companyId },
      });

      if (!project) {
        throw new NotFoundException("Project not found in this company");
      }

      let version = null as null | { id: string };

      if (estimateVersionId) {
        version = await this.prisma.estimateVersion.findFirst({
          where: { id: estimateVersionId, projectId },
        });
        if (!version) {
          throw new NotFoundException("Estimate version not found for this project");
        }
      } else {
        version = await this.prisma.estimateVersion.findFirst({
          where: { projectId },
          orderBy: [
            { sequenceNo: "desc" },
            { importedAt: "desc" },
            { createdAt: "desc" },
          ],
        });
        if (!version) {
          throw new NotFoundException(
            "No estimate version found. Import Xactimate line items first.",
          );
        }
      }

      const componentsResult = await importXactComponentsCsvForEstimate({
        estimateVersionId: version.id,
        csvPath,
      });

      const allocationResult = await allocateComponentsForEstimate({
        estimateVersionId: version.id,
      });

      await this.audit.log(actor, "ESTIMATE_COMPONENTS_IMPORTED", {
        companyId,
        projectId,
        metadata: {
          estimateVersionId: version.id,
          rawCount: componentsResult.rawCount,
          summaryCount: componentsResult.summaryCount,
          allocationsCreated: allocationResult.allocationsCreated,
        },
      });

      return {
        projectId,
        estimateVersionId: version.id,
        components: componentsResult,
        allocation: allocationResult,
      };
    } catch (err: any) {
      console.error("Error in importXactComponentsForProject", {
        projectId,
        companyId,
        csvPath,
        error: err?.message ?? String(err),
      });

      // Surface underlying errors as a client-visible 400 so the UI shows more
      // than just "Internal server error" during components import.
      if (err instanceof HttpException) {
        throw err;
      }

      throw new BadRequestException(
        `Components import failed: ${err?.message ?? String(err)}`,
      );
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

    await this.prisma.$transaction(async (tx) => {
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

  async getRecentActivityForProject(
    projectId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId } });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const isSuperAdmin = actor.globalRole === GlobalRole.SUPER_ADMIN;

    if (!isSuperAdmin) {
      // Enforce standard project access rules for non-superadmins
      if (project.companyId !== actor.companyId) {
        throw new ForbiddenException("You do not have access to this project");
      }

      if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
        const membership = await this.prisma.projectMembership.findUnique({
          where: {
            userId_projectId: {
              userId: actor.userId,
              projectId,
            },
          },
        });
        if (!membership) {
          throw new ForbiddenException("You do not have access to this project");
        }
      }
    }

    const [dailyLogsRaw, tasksRaw, petlRaw] = await Promise.all([
      this.prisma.dailyLog.findMany({
        where: { projectId },
        orderBy: { logDate: "desc" },
        take: 5,
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          assignee: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.petlEditChange.findMany({
        where: {
          session: { projectId },
        },
        orderBy: { effectiveAt: "desc" },
        take: 5,
        include: {
          session: {
            select: {
              id: true,
              userId: true,
              startedAt: true,
              endedAt: true,
            },
          },
          sowItem: {
            select: {
              id: true,
              description: true,
              projectParticleId: true,
            },
          },
        },
      }),
    ]);

    const dailyLogs = dailyLogsRaw.map((l) => ({
      id: l.id,
      logDate: l.logDate,
      title: l.title,
      status: l.status,
      createdAt: l.createdAt,
      createdBy: l.createdBy,
    }));

    const tasks = tasksRaw.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      assignee: t.assignee,
    }));

    const petlEdits = petlRaw.map((c) => ({
      id: c.id,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      effectiveAt: c.effectiveAt,
      session: c.session,
      sowItem: c.sowItem,
    }));

    return {
      projectId: project.id,
      companyId: project.companyId,
      dailyLogs,
      tasks,
      petlEdits,
    };
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
      const membership = await this.prisma.projectMembership.findUnique({
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

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    if (!latestVersion) {
      return { projectId, estimateVersionId: null, items: [] };
    }

    const items = await this.prisma.sowItem.findMany({
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
    newPercent: number,
    acvOnly?: boolean,
  ) {
    // simple wrapper to reuse applyPetlPercentageEditsForProject with a single change
    return this.applyPetlPercentageEditsForProject(projectId, companyId, actor, {
      changes: [
        {
          sowItemId,
          newPercent,
          acvOnly: acvOnly ?? false,
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
      // Batch toggle (used when operation === "set")
      acvOnly?: boolean;
      changes?: {
        sowItemId: string;
        oldPercent?: number | null;
        newPercent: number;
        acvOnly?: boolean;
      }[];
    }
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const { filters, operation, percent, changes, acvOnly } = body ?? {};

    // Backwards-compatible path: explicit changes array (e.g., per-row updates or "all items" bulk set)
    if (changes && Array.isArray(changes) && changes.length > 0) {
      const normalized = changes.map((c) => ({
        sowItemId: String(c.sowItemId),
        oldPercent: typeof c.oldPercent === "number" ? c.oldPercent : null,
        newPercent: c.newPercent,
        acvOnly: c.acvOnly ?? false,
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
            data: {
              percentComplete: next,
              isAcvOnly: change.acvOnly ?? false,
            },
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

    const isAcvOnlyForBatch = op === "set" ? !!acvOnly : undefined;

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
        if (next === current && isAcvOnlyForBatch === undefined) {
          return null;
        }
        return {
          sowItemId: row.id,
          oldPercent: current,
          newPercent: next,
          acvOnly: isAcvOnlyForBatch,
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
        const isAcvOnly = !!change.acvOnly;

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
          data: {
            percentComplete: next,
            isAcvOnly,
          },
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
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
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

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    if (!latestVersion) {
      return { projectId, groups: [] };
    }

    const items = await this.prisma.sowItem.findMany({
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

      // Baseline room totals on RCV; fall back to Item Amount if RCV is missing.
      const lineTotal = item.rcvAmount ?? item.itemAmount ?? 0;
      agg.totalAmount += lineTotal;

      const basePct = item.percentComplete ?? 0;
      const pct = item.isAcvOnly ? 0 : basePct;
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
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
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

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" }
      ]
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

    const items = await this.prisma.sowItem.findMany({ where });

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
      // Baseline selection summaries on RCV; fall back to Item Amount if RCV is missing.
      const lineTotal = item.rcvAmount ?? item.itemAmount ?? 0;
      const basePct = item.percentComplete ?? 0;
      const pct = item.isAcvOnly ? 0 : basePct;
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

  async getPetlComponentsForItem(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
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

    const sowItem = await this.prisma.sowItem.findFirst({
      where: {
        id: sowItemId,
        sow: { projectId }
      },
      include: {
        sow: true
      }
    });

    if (!sowItem) {
      throw new NotFoundException("SowItem not found for this project");
    }

    const allocations = await this.prisma.sowComponentAllocation.findMany({
      where: { sowItemId },
      include: {
        componentSummary: true
      },
      orderBy: [{ code: "asc" }]
    });

    return {
      projectId,
      sowItemId,
      estimateVersionId: sowItem.estimateVersionId,
      allocations: allocations.map((a) => ({
        id: a.id,
        code: a.code,
        allocationBasis: a.allocationBasis,
        quantity: a.quantity,
        total: a.total,
        component: a.componentSummary
          ? {
              id: a.componentSummary.id,
              code: a.componentSummary.code,
              description: a.componentSummary.description,
              unit: a.componentSummary.unit,
              unitPrice: a.componentSummary.unitPrice,
              total: a.componentSummary.total
            }
          : null
      }))
    };
  }

  async getPetlComponentsForSelection(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    filters: {
      roomParticleId?: string;
      categoryCode?: string;
      selectionCode?: string;
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to this project's PETL");
      }
    }

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        roomParticleId: filters.roomParticleId ?? null,
        categoryCode: filters.categoryCode ?? null,
        selectionCode: filters.selectionCode ?? null,
        components: [],
      };
    }

    const sowWhere: any = {
      estimateVersionId: latestVersion.id,
    };

    if (filters.roomParticleId) {
      sowWhere.projectParticleId = filters.roomParticleId;
    }
    if (filters.categoryCode) {
      sowWhere.categoryCode = filters.categoryCode;
    }
    if (filters.selectionCode) {
      sowWhere.selectionCode = filters.selectionCode;
    }

    const sowItems = await this.prisma.sowItem.findMany({
      where: sowWhere,
      select: { id: true },
    });

    if (sowItems.length === 0) {
      return {
        projectId,
        estimateVersionId: latestVersion.id,
        roomParticleId: filters.roomParticleId ?? null,
        categoryCode: filters.categoryCode ?? null,
        selectionCode: filters.selectionCode ?? null,
        components: [],
      };
    }

    const sowItemIds = sowItems.map((s) => s.id);

    const allocations = await this.prisma.sowComponentAllocation.findMany({
      where: {
        estimateVersionId: latestVersion.id,
        sowItemId: { in: sowItemIds },
      },
      include: {
        componentSummary: true,
      },
    });

    type Agg = {
      code: string;
      description: string | null;
      unit: string | null;
      quantity: number;
      total: number;
      lines: number;
    };

    const byCode = new Map<string, Agg>();

    for (const a of allocations) {
      const comp = a.componentSummary;
      const code = (comp?.code || a.code || "").trim() || "(unknown)";
      const key = code;
      const existing = byCode.get(key);

      const qty = a.quantity ?? 0;
      const total = a.total ?? 0;

      if (existing) {
        existing.quantity += qty;
        existing.total += total;
        existing.lines += 1;
      } else {
        byCode.set(key, {
          code,
          description: comp?.description ?? null,
          unit: comp?.unit ?? null,
          quantity: qty,
          total,
          lines: 1,
        });
      }
    }

    const components = Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      roomParticleId: filters.roomParticleId ?? null,
      categoryCode: filters.categoryCode ?? null,
      selectionCode: filters.selectionCode ?? null,
      components,
    };
  }

  async getEstimateSummaryForProject(
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

    // Reuse same access rules as PETL
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
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

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        itemCount: 0,
        totalAmount: 0,
        componentsCount: 0,
      };
    }

    const [agg, componentsCount] = await Promise.all([
      this.prisma.sowItem.aggregate({
        where: { estimateVersionId: latestVersion.id },
        _count: { _all: true },
        _sum: { rcvAmount: true },
      }),
      this.prisma.componentSummary.count({
        where: { estimateVersionId: latestVersion.id },
      }),
    ]);

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      itemCount: agg._count._all ?? 0,
      totalAmount: agg._sum.rcvAmount ?? 0,
      componentsCount,
    };
  }

  async getFinancialSummaryForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    options?: { forceRefresh?: boolean },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL / estimate
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException(
          "You do not have access to this project's estimates",
        );
      }
    }

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        snapshotComputedAt: null,
        snapshotSource: "none",
        totalRcvClaim: 0,
        totalAcvClaim: 0,
        workCompleteRcv: 0,
        acvReturn: 0,
        opRate: 0.25,
        acvOP: 0,
        totalDueWorkBillable: 0,
        depositRate: 0.5,
        depositBaseline: 0,
        billedToDate: 0,
        duePayable: 0,
        dueAmount: 0,
      };
    }

    const forceRefresh = options?.forceRefresh === true;

    // Try to use an existing snapshot if it is from today and not forced to refresh.
    if (!forceRefresh) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existing = await this.prisma.projectFinancialSnapshot.findFirst({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          snapshotDate: { gte: todayStart },
        },
        orderBy: { snapshotDate: "desc" },
      });

      if (existing) {
        return {
          projectId,
          estimateVersionId: latestVersion.id,
          snapshotComputedAt: existing.computedAt,
          snapshotSource: "snapshot",
          totalRcvClaim: existing.totalRcvClaim,
          totalAcvClaim: existing.totalAcvClaim,
          workCompleteRcv: existing.workCompleteRcv,
          acvReturn: existing.acvReturn,
          opRate: existing.opRate,
          acvOP: existing.acvOP,
          totalDueWorkBillable: existing.totalDueWorkBillable,
          depositRate: existing.depositRate,
          depositBaseline: existing.depositBaseline,
          billedToDate: existing.billedToDate,
          duePayable: existing.duePayable,
          dueAmount: existing.dueAmount,
        };
      }
    }

    const items = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      select: {
        rcvAmount: true,
        itemAmount: true,
        acvAmount: true,
        percentComplete: true,
        isAcvOnly: true,
      },
    });

    let totalRcvClaim = 0;
    let totalAcvClaim = 0;
    let workCompleteRcv = 0;
    let acvReturn = 0;

    for (const item of items) {
      const rcv = item.rcvAmount ?? item.itemAmount ?? 0;
      const acv = item.acvAmount ?? 0;
      const basePct = item.percentComplete ?? 0;
      const pct = item.isAcvOnly ? 0 : basePct;

      totalRcvClaim += rcv;
      totalAcvClaim += acv;

      workCompleteRcv += rcv * (pct / 100);

      if (item.isAcvOnly) {
        acvReturn += acv;
      }
    }

    // Use a 25% O&P factor for ACV, matching current spreadsheet behavior.
    const opRate = 0.25;
    const acvOP = acvReturn * opRate;

    const totalDueWorkBillable = workCompleteRcv + acvOP;

    // Deposit baseline is typically 50% of total due for work complete.
    const depositRate = 0.5;
    const depositBaseline = totalDueWorkBillable * depositRate;

    // Placeholder: billed-to-date should eventually come from a payment schedule.
    const billedToDate = 0;

    // Due payable: baseline deposit; dueAmount: anything above baseline not yet billed.
    const duePayable = depositBaseline;
    const dueAmount = Math.max(0, totalDueWorkBillable - billedToDate - duePayable);

    const snapshotDate = new Date();
    snapshotDate.setHours(0, 0, 0, 0);

    const snapshot = await this.prisma.projectFinancialSnapshot.create({
      data: {
        projectId,
        estimateVersionId: latestVersion.id,
        totalRcvClaim,
        totalAcvClaim,
        workCompleteRcv,
        acvReturn,
        opRate,
        acvOP,
        totalDueWorkBillable,
        depositRate,
        depositBaseline,
        billedToDate,
        duePayable,
        dueAmount,
        snapshotDate,
      },
    });

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      snapshotComputedAt: snapshot.computedAt,
      snapshotSource: "recomputed",
      totalRcvClaim,
      totalAcvClaim,
      workCompleteRcv,
      acvReturn,
      opRate,
      acvOP,
      totalDueWorkBillable,
      depositRate,
      depositBaseline,
      billedToDate,
      duePayable,
      dueAmount,
    };
  }

  async getImportRoomBucketsForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Same access rules as PETL / estimate
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException(
          "You do not have access to this project's estimates",
        );
      }
    }

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        buckets: [],
      };
    }

    const rawRows = await this.prisma.rawXactRow.findMany({
      where: { estimateVersionId: latestVersion.id },
      select: {
        groupCode: true,
        groupDescription: true,
        itemAmount: true,
        rcv: true,
      },
    });

    type Bucket = {
      groupCode: string | null;
      groupDescription: string | null;
      lineCount: number;
      totalAmount: number;
    };

    const byKey = new Map<string, Bucket>();

    for (const row of rawRows) {
      const gc = (row.groupCode ?? "").trim();
      const gd = (row.groupDescription ?? "").trim();
      const key = `${gc}::${gd}`;
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = {
          groupCode: gc || null,
          groupDescription: gd || null,
          lineCount: 0,
          totalAmount: 0,
        };
        byKey.set(key, bucket);
      }

      // Bucket monetary totals are based on RCV; fall back to Item Amount if needed.
      const amount = row.rcv ?? row.itemAmount ?? 0;
      bucket.lineCount += 1;
      bucket.totalAmount += amount;
    }

    // Preload any existing particles keyed by (externalGroupCode, externalGroupDescription)
    const particles = await this.prisma.projectParticle.findMany({
      where: { projectId },
      include: { unit: true },
    });

    const particleByExternalKey = new Map<
      string,
      { particleId: string; unitId: string | null; unitLabel: string | null; fullLabel: string }
    >();

    for (const p of particles) {
      const gc = (p.externalGroupCode ?? "").trim();
      const gd = (p.externalGroupDescription ?? "").trim();
      if (!gc && !gd) continue;
      const key = `${gc}::${gd}`;
      if (!particleByExternalKey.has(key)) {
        particleByExternalKey.set(key, {
          particleId: p.id,
          unitId: p.unitId ?? null,
          unitLabel: p.unit ? p.unit.label : null,
          fullLabel: p.fullLabel,
        });
      }
    }

    const buckets = Array.from(byKey.values())
      .map((b) => {
        const key = `${(b.groupCode ?? "").trim()}::${
          (b.groupDescription ?? "").trim()
        }`;
        const match = particleByExternalKey.get(key) ?? null;
        return {
          groupCode: b.groupCode,
          groupDescription: b.groupDescription,
          lineCount: b.lineCount,
          totalAmount: b.totalAmount,
          sampleUnitLocations: [],
          assignedParticleId: match?.particleId ?? null,
          assignedUnitId: match?.unitId ?? null,
          assignedUnitLabel: match?.unitLabel ?? null,
          assignedFullLabel: match?.fullLabel ?? null,
        };
      })
      .sort((a, b) => {
        const ad = (a.groupDescription || "").toLowerCase();
        const bd = (b.groupDescription || "").toLowerCase();
        if (ad !== bd) return ad.localeCompare(bd);
        const ac = (a.groupCode || "").toLowerCase();
        const bc = (b.groupCode || "").toLowerCase();
        return ac.localeCompare(bc);
      });

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      buckets,
    };
  }

  async getImportRoomBucketLinesForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    bucket: { groupCode: string | null; groupDescription: string | null },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException(
          "You do not have access to this project's estimates",
        );
      }
    }

    const latestVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        groupCode: bucket.groupCode,
        groupDescription: bucket.groupDescription,
        rows: [],
      };
    }

    const where: any = { estimateVersionId: latestVersion.id };
    if (bucket.groupCode !== undefined) {
      // Distinguish between null and non-null values
      if (bucket.groupCode === null) where.groupCode = null;
      else where.groupCode = bucket.groupCode;
    }
    if (bucket.groupDescription !== undefined) {
      if (bucket.groupDescription === null) where.groupDescription = null;
      else where.groupDescription = bucket.groupDescription;
    }

    const rows = await this.prisma.rawXactRow.findMany({
      where,
      orderBy: { lineNo: "asc" },
      select: {
        lineNo: true,
        desc: true,
        qty: true,
        unit: true,
        itemAmount: true,
        rcv: true,
        cat: true,
        sel: true,
        owner: true,
        originalVendor: true,
        sourceName: true,
      },
    });

    const mappedRows = rows.map(row => ({
      lineNo: row.lineNo,
      desc: row.desc,
      qty: row.qty,
      unit: row.unit,
      // Expose RCV as the line "Total"; fall back to Item Amount if RCV is missing.
      itemAmount: row.rcv ?? row.itemAmount,
      cat: row.cat,
      sel: row.sel,
      owner: row.owner,
      originalVendor: row.originalVendor,
      sourceName: row.sourceName,
    }));

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      groupCode: bucket.groupCode,
      groupDescription: bucket.groupDescription,
      rows: mappedRows,
    };
  }

  async assignImportRoomBucketsToUnit(options: {
    projectId: string;
    companyId: string;
    actor: AuthenticatedUser;
    target: {
      type: "existing" | "new";
      unitId?: string;
      label?: string;
      floor?: number | null;
    };
    buckets: { groupCode: string | null; groupDescription: string | null }[];
  }) {
    const { projectId, companyId, actor, target, buckets } = options;

    if (!buckets || buckets.length === 0) {
      throw new BadRequestException("At least one bucket must be provided");
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException(
          "You do not have access to modify this project's structure",
        );
      }
    }

    let unitId: string;
    let createdUnit = false;

    if (target.type === "existing") {
      if (!target.unitId) {
        throw new BadRequestException("unitId is required for existing target");
      }
      const unit = await this.prisma.projectUnit.findFirst({
        where: { id: target.unitId, projectId },
      });
      if (!unit) {
        throw new NotFoundException("Target unit not found in this project");
      }
      unitId = unit.id;
    } else {
      const label = (target.label ?? "").trim();
      if (!label) {
        throw new BadRequestException("label is required for new unit");
      }
      const created = await this.prisma.projectUnit.create({
        data: {
          projectId,
          companyId,
          label,
          floor: target.floor ?? null,
        },
      });
      unitId = created.id;
      createdUnit = true;
    }

    const unit = await this.prisma.projectUnit.findUnique({ where: { id: unitId } });
    if (!unit) {
      throw new NotFoundException("Unit not found after creation");
    }

    const updatedParticles: string[] = [];

    for (const b of buckets) {
      const gc = (b.groupCode ?? "").trim();
      const gd = (b.groupDescription ?? "").trim();
      if (!gc && !gd) continue;

      const existing = await this.prisma.projectParticle.findFirst({
        where: {
          projectId,
          externalGroupCode: gc || null,
          externalGroupDescription: gd || null,
        },
      });

      const baseName = gd || gc || "Room";
      const fullLabel = `${unit.label} - ${baseName}`;

      if (existing) {
        const updated = await this.prisma.projectParticle.update({
          where: { id: existing.id },
          data: {
            unitId,
            fullLabel,
          },
        });
        updatedParticles.push(updated.id);
      } else {
        const createdParticle = await this.prisma.projectParticle.create({
          data: {
            projectId,
            companyId,
            unitId,
            type: ProjectParticleType.ROOM,
            name: baseName,
            fullLabel,
            externalGroupCode: gc || null,
            externalGroupDescription: gd || null,
          },
        });
        updatedParticles.push(createdParticle.id);
      }
    }

    return {
      projectId,
      unitId,
      createdUnit,
      updatedParticleCount: updatedParticles.length,
    };
  }
}
