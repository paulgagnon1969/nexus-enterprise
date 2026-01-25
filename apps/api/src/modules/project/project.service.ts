import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import type { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { GlobalRole, Role, ProjectRole, ProjectParticleType, ProjectParticipantScope, ProjectVisibilityLevel, MessageThreadType, PetlReconciliationEntryKind } from "@prisma/client";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import { importXactCsvForProject, importXactComponentsCsvForEstimate, allocateComponentsForEstimate } from "@repo/database";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly taxJurisdictions: TaxJurisdictionService,
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

    // Seed or reuse a TaxJurisdiction for this project's location so that
    // Certified Payroll and project dashboards have something to work with.
    const jurisdiction = await this.taxJurisdictions.resolveOrCreateForProject(
      companyId,
      project,
    );

    if (jurisdiction && !project.taxJurisdictionId) {
      await this.prisma.project.update({
        where: { id: project.id },
        data: { taxJurisdictionId: jurisdiction.id },
      });
    }

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
      units: Array.from(unitsById.values())
    };
  }

  /**
   * List distinct payroll employees for a given project, based on
   * PayrollWeekRecord rows (Certified Payroll source of truth).
   */
  async listProjectFiles(options: {
    projectId: string;
    actor: AuthenticatedUser;
    folderId?: string;
    search?: string;
  }) {
    const { projectId, actor, folderId, search } = options;
    const { companyId } = actor;

    // Reuse existing access control
    await this.getProjectByIdForUser(projectId, actor);

    const where: any = {
      companyId,
      projectId,
    };
    if (folderId) {
      where.folderId = folderId;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.fileName = { contains: q, mode: "insensitive" };
    }

    return this.prisma.projectFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async registerProjectFile(options: {
    projectId: string;
    actor: AuthenticatedUser;
    fileUri: string;
    fileName: string;
    mimeType?: string;
    sizeBytes?: number | null;
    folderId?: string | null;
  }) {
    const { projectId, actor, fileUri, fileName, mimeType, sizeBytes, folderId } = options;
    const { companyId, userId } = actor;

    if (!fileUri || !fileUri.trim()) {
      throw new BadRequestException("fileUri is required");
    }
    if (!fileName || !fileName.trim()) {
      throw new BadRequestException("fileName is required");
    }

    // Validate project access (throws if not allowed)
    await this.getProjectByIdForUser(projectId, actor);

    const file = await this.prisma.projectFile.create({
      data: {
        companyId,
        projectId,
        folderId: folderId || undefined,
        storageUrl: fileUri,
        fileName,
        mimeType: mimeType || null,
        sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
        createdById: userId,
      },
    });

    await this.audit.log(actor, "PROJECT_FILE_REGISTERED", {
      companyId,
      projectId,
      metadata: {
        fileId: file.id,
        fileName: file.fileName,
        storageUrl: file.storageUrl,
      },
    });

    return file;
  }

  async getProjectEmployees(companyId: string, projectId: string) {
    const records = await this.prisma.payrollWeekRecord.findMany({
      where: { companyId, projectId },
      select: {
        firstName: true,
        lastName: true,
        employeeId: true,
        ssn: true,
        classCode: true,
        weekEndDate: true,
        weekCode: true,
        totalHoursSt: true,
        totalHoursOt: true,
        totalHoursDt: true,
      },
    });

    type Agg = {
      firstName: string | null;
      lastName: string | null;
      employeeId: string | null;
      ssnLast4: string | null;
      classCode: string | null;
      totalHours: number;
      firstWeekEnd: Date | null;
      lastWeekEnd: Date | null;
      weekCodes: Set<string>;
    };

    const byKey = new Map<string, Agg>();

    for (const r of records) {
      const keyParts = [
        r.employeeId ?? "",
        (r.firstName ?? "").trim().toUpperCase(),
        (r.lastName ?? "").trim().toUpperCase(),
        r.ssn ?? "",
      ];
      const key = keyParts.join("|");
      const existing = byKey.get(key);

      const hoursSt = r.totalHoursSt ?? 0;
      const hoursOt = r.totalHoursOt ?? 0;
      const hoursDt = r.totalHoursDt ?? 0;
      const hours = hoursSt + hoursOt + hoursDt;

      const ssnLast4 = r.ssn && r.ssn.length >= 4 ? r.ssn.slice(-4) : null;
      const wCode = (r.weekCode ?? "").trim();

      if (!existing) {
        const weeks = new Set<string>();
        if (wCode) weeks.add(wCode);
        byKey.set(key, {
          firstName: r.firstName ?? null,
          lastName: r.lastName ?? null,
          employeeId: r.employeeId ?? null,
          ssnLast4,
          classCode: r.classCode ?? null,
          totalHours: hours,
          firstWeekEnd: r.weekEndDate,
          lastWeekEnd: r.weekEndDate,
          weekCodes: weeks,
        });
      } else {
        existing.totalHours += hours;
        if (!existing.classCode && r.classCode) {
          existing.classCode = r.classCode;
        }
        if (!existing.firstWeekEnd || r.weekEndDate < existing.firstWeekEnd) {
          existing.firstWeekEnd = r.weekEndDate;
        }
        if (!existing.lastWeekEnd || r.weekEndDate > existing.lastWeekEnd) {
          existing.lastWeekEnd = r.weekEndDate;
        }
        if (wCode) {
          existing.weekCodes.add(wCode);
        }
      }
    }

    const result = Array.from(byKey.values()).map((agg) => ({
      firstName: agg.firstName,
      lastName: agg.lastName,
      employeeId: agg.employeeId,
      ssnLast4: agg.ssnLast4,
      classCode: agg.classCode,
      totalHours: agg.totalHours,
      firstWeekEnd: agg.firstWeekEnd?.toISOString() ?? null,
      lastWeekEnd: agg.lastWeekEnd?.toISOString() ?? null,
      weekCodes: Array.from(agg.weekCodes.values()),
    }));

    // Sort by lastName, then firstName for a stable roster.
    result.sort((a, b) => {
      const aLast = (a.lastName ?? "").toLowerCase();
      const bLast = (b.lastName ?? "").toLowerCase();
      if (aLast < bLast) return -1;
      if (aLast > bLast) return 1;
      const aFirst = (a.firstName ?? "").toLowerCase();
      const bFirst = (b.firstName ?? "").toLowerCase();
      if (aFirst < bFirst) return -1;
      if (aFirst > bFirst) return 1;
      return 0;
    });

    return result;
  }

  async getProjectEmployeePayroll(
    companyId: string,
    projectId: string,
    employeeId: string,
  ) {
    const records = await this.prisma.payrollWeekRecord.findMany({
      where: { companyId, projectId, employeeId },
      orderBy: { weekEndDate: "asc" },
    });

    return records.map((r) => ({
      companyId: r.companyId,
      projectId: r.projectId,
      projectCode: r.projectCode,
      employeeId: r.employeeId,
      firstName: r.firstName,
      lastName: r.lastName,
      classCode: r.classCode,
      weekEndDate: r.weekEndDate,
      weekCode: r.weekCode,
      totalPay: r.totalPay,
      totalHoursSt: r.totalHoursSt ?? 0,
      totalHoursOt: r.totalHoursOt ?? 0,
      totalHoursDt: r.totalHoursDt ?? 0,
    }));
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

      // 1b) PETL reconciliation (cascades to entries/events)
      await tx.petlReconciliationCase.deleteMany({ where: { projectId } });

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

  private async getLatestEstimateVersionForPetl(projectId: string) {
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

    return latestVersion;
  }

  private async resolveProjectParticlesForProject(options: {
    projectId: string;
    particleIds: string[];
  }) {
    const { projectId, particleIds } = options;

    const ids = Array.from(new Set(particleIds.filter(Boolean)));
    if (ids.length === 0) return new Map<string, { id: string; name: string; fullLabel: string }>();

    // NOTE: We intentionally do NOT rely on Prisma relation includes here.
    // Some legacy/imported rows in prod can have orphaned foreign keys, and
    // Prisma will throw when it tries to hydrate a required relation.
    const particles = await this.prisma.projectParticle.findMany({
      where: {
        id: { in: ids },
        projectId,
      },
      select: {
        id: true,
        name: true,
        fullLabel: true,
      },
    });

    const byId = new Map<string, { id: string; name: string; fullLabel: string }>();
    for (const p of particles) {
      byId.set(p.id, p);
    }
    return byId;
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

    // Prefer the latest estimate version that actually has PETL rows.
    const latestVersion = await this.getLatestEstimateVersionForPetl(projectId);

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        items: [],
        reconciliationEntries: [],
      };
    }

    // IMPORTANT: Do NOT include required relations like projectParticle here.
    // In some prod data, orphaned particle IDs can exist and Prisma will throw
    // when hydrating a required relation include.
    const [itemsRaw, reconciliationEntriesRaw] = await Promise.all([
      this.prisma.sowItem.findMany({
        where: { estimateVersionId: latestVersion.id },
        orderBy: { lineNo: "asc" },
      }),
      this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const particleById = await this.resolveProjectParticlesForProject({
      projectId,
      particleIds: [
        ...itemsRaw.map((i) => i.projectParticleId),
        ...reconciliationEntriesRaw.map((e) => e.projectParticleId),
      ],
    });

    const items = itemsRaw.map((i) => ({
      ...i,
      projectParticle: particleById.get(i.projectParticleId) ?? null,
    }));

    const reconciliationEntries = reconciliationEntriesRaw.map((e) => ({
      ...e,
      projectParticle: particleById.get(e.projectParticleId) ?? null,
    }));

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      items,
      reconciliationEntries,
    };
  }

  private buildRcvBreakdownForSowItem(item: {
    qty: number | null;
    unitCost: number | null;
    itemAmount: number | null;
    salesTaxAmount: number | null;
    rcvAmount: number | null;
  }) {
    const qty = item.qty ?? null;
    const unitCost = item.unitCost ?? null;

    const itemAmount = item.itemAmount ?? null;
    const salesTaxAmount = item.salesTaxAmount ?? null;

    const rcvAmount = (item.rcvAmount ?? itemAmount ?? 0) as number;

    // Treat anything above (item + tax) as "O&P/other" for display.
    const opRaw = rcvAmount - ((itemAmount ?? 0) + (salesTaxAmount ?? 0));
    const opAmount = Math.max(0, opRaw);

    return {
      qty,
      unitCost,
      itemAmount,
      salesTaxAmount,
      opAmount,
      rcvAmount,
    };
  }

  private computeSelectedRcvAmount(
    breakdown: {
      itemAmount: number | null;
      salesTaxAmount: number | null;
      opAmount: number;
    },
    components?: { itemAmount?: boolean; salesTaxAmount?: boolean; opAmount?: boolean },
  ) {
    const includeItem = components?.itemAmount ?? true;
    const includeTax = components?.salesTaxAmount ?? true;
    const includeOp = components?.opAmount ?? true;

    const amount =
      (includeItem ? breakdown.itemAmount ?? 0 : 0) +
      (includeTax ? breakdown.salesTaxAmount ?? 0 : 0) +
      (includeOp ? breakdown.opAmount ?? 0 : 0);

    return amount;
  }

  private async findPetlReconciliationCaseForSowItem(options: {
    projectId: string;
    sowItemId: string;
  }) {
    const { projectId, sowItemId } = options;

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: { logicalItemId: true },
    });

    if (!sowItem) {
      return null;
    }

    return this.prisma.petlReconciliationCase.findFirst({
      where: {
        projectId,
        OR: [
          { sowItemId },
          { logicalItemId: sowItem.logicalItemId },
        ],
      },
      include: {
        entries: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  private async getOrCreatePetlReconciliationCaseForSowItem(options: {
    projectId: string;
    companyId: string;
    actor: AuthenticatedUser;
    sowItemId: string;
  }) {
    const { projectId, companyId, actor, sowItemId } = options;

    // Validate access + project existence
    await this.getProjectByIdForUser(projectId, actor);

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: {
        id: true,
        estimateVersionId: true,
        logicalItemId: true,
        projectParticleId: true,
        description: true,
        estimateVersion: { select: { projectId: true } },
      },
    });

    if (!sowItem || sowItem.estimateVersion.projectId !== projectId) {
      throw new NotFoundException("SOW item not found for this project");
    }

    const existing = await this.prisma.petlReconciliationCase.findFirst({
      where: {
        projectId,
        OR: [
          { sowItemId: sowItem.id },
          { logicalItemId: sowItem.logicalItemId },
        ],
      },
    });

    if (existing) {
      // Keep sowItemId updated to the latest version's row when possible.
      if (!existing.sowItemId || existing.sowItemId !== sowItem.id) {
        await this.prisma.petlReconciliationCase.update({
          where: { id: existing.id },
          data: {
            sowItemId: sowItem.id,
            estimateVersionId: sowItem.estimateVersionId,
          },
        });
      }

      return existing;
    }

    // Create a dedicated JOURNAL thread for notes/attachments.
    const thread = await this.prisma.messageThread.create({
      data: {
        companyId,
        projectId,
        createdById: actor.userId,
        type: MessageThreadType.JOURNAL,
        subject: `PETL Reconciliation: ${sowItem.description}`,
      },
    });

    const created = await this.prisma.petlReconciliationCase.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        sowItemId: sowItem.id,
        logicalItemId: sowItem.logicalItemId,
        noteThreadId: thread.id,
        createdByUserId: actor.userId,
        events: {
          create: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            eventType: "CASE_CREATED",
            payloadJson: {
              sowItemId: sowItem.id,
              logicalItemId: sowItem.logicalItemId,
            },
            createdByUserId: actor.userId,
          },
        },
      },
    });

    return created;
  }

  async getPetlReconciliationForSowItem(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
  ) {
    await this.getProjectByIdForUser(projectId, actor);

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      include: {
        estimateVersion: { select: { projectId: true } },
      },
    });

    if (!sowItem || sowItem.estimateVersion.projectId !== projectId) {
      throw new NotFoundException("SOW item not found for this project");
    }

    const particleById = await this.resolveProjectParticlesForProject({
      projectId,
      particleIds: [sowItem.projectParticleId],
    });

    const sowItemWithParticle = {
      ...sowItem,
      projectParticle: particleById.get(sowItem.projectParticleId) ?? null,
    };

    const breakdown = this.buildRcvBreakdownForSowItem({
      qty: sowItemWithParticle.qty ?? null,
      unitCost: sowItemWithParticle.unitCost ?? null,
      itemAmount: sowItemWithParticle.itemAmount ?? null,
      salesTaxAmount: sowItemWithParticle.salesTaxAmount ?? null,
      rcvAmount: sowItemWithParticle.rcvAmount ?? null,
    });

    const existingCase = await this.findPetlReconciliationCaseForSowItem({
      projectId,
      sowItemId,
    });

    return {
      projectId,
      sowItemId: sowItemWithParticle.id,
      estimateVersionId: sowItemWithParticle.estimateVersionId,
      projectParticleId: sowItemWithParticle.projectParticleId,
      sowItem: sowItemWithParticle,
      rcvBreakdown: breakdown,
      reconciliationCase: existingCase,
    };
  }

  async createPetlReconciliationPlaceholder(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    body: { kind?: string; note?: string | null },
  ) {
    const theCase = await this.getOrCreatePetlReconciliationCaseForSowItem({
      projectId,
      companyId,
      actor,
      sowItemId,
    });

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: {
        estimateVersionId: true,
        projectParticleId: true,
      },
    });

    if (!sowItem) {
      throw new NotFoundException("SOW item not found");
    }

    const kind =
      body.kind === "CHANGE_ORDER_CLIENT_PAY"
        ? PetlReconciliationEntryKind.CHANGE_ORDER_CLIENT_PAY
        : body.kind === "REIMBURSE_OWNER"
          ? PetlReconciliationEntryKind.REIMBURSE_OWNER
          : PetlReconciliationEntryKind.NOTE_ONLY;

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind,
        note: body.note ?? null,
        rcvAmount: null,
        percentComplete: 0,
        isPercentCompleteLocked: true,
        createdByUserId: actor.userId,
        events: {
          create: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            caseId: theCase.id,
            eventType: "ENTRY_CREATED",
            payloadJson: { kind, note: body.note ?? null },
            createdByUserId: actor.userId,
          },
        },
      },
      include: {
        case: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return { entry, reconciliationCase: entry.case };
  }

  async importPetlReconcileNotesFromCsv(args: {
    projectId: string;
    companyId: string;
    actor: AuthenticatedUser;
    csvText: string;
    dryRun?: boolean;
    fileName?: string | null;
  }) {
    const {
      projectId,
      companyId,
      actor,
      csvText,
      dryRun = false,
      fileName = null,
    } = args;

    // Validate access + project existence
    await this.getProjectByIdForUser(projectId, actor);

    const latestVersion = await this.getLatestEstimateVersionForPetl(projectId);
    if (!latestVersion) {
      throw new BadRequestException("No estimate version found for this project");
    }

    // Load PETL rows for matching.
    const sowItems = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      select: {
        id: true,
        lineNo: true,
        description: true,
        categoryCode: true,
        selectionCode: true,
        projectParticleId: true,
        logicalItemId: true,
        estimateVersionId: true,
      },
    });

    const byLineNo = new Map<number, (typeof sowItems)[number]>();
    for (const it of sowItems) {
      if (!byLineNo.has(it.lineNo)) byLineNo.set(it.lineNo, it);
    }

    const cleanText = (value: any, max = 5000): string | null => {
      if (value == null) return null;
      const s = String(value)
        .replace(/\r?\n/g, " ")
        .replace(/[\u0000-\u001F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!s) return null;
      return s.length > max ? s.slice(0, max) : s;
    };

    const parseIntLoose = (value: any): number | null => {
      if (value == null) return null;
      const s = String(value).trim();
      if (!s) return null;
      const normalized = s.replace(/,/g, "");
      const n = Number(normalized);
      if (!Number.isFinite(n)) return null;
      return Math.trunc(n);
    };

    // Parse CSV as a loose matrix and locate the detail header row.
    const rows: any[] = parse(csvText, {
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    });

    const headerIdx = rows.findIndex((r) => {
      const first = String(r?.[0] ?? "").trim();
      if (first !== "ACV Pay") return false;
      return (r as any[]).some((c: any) => String(c ?? "").includes("Reimburish Owner"));
    });

    if (headerIdx < 0) {
      throw new BadRequestException(
        "Could not locate reconcile detail header row (expected first cell 'ACV Pay').",
      );
    }

    const header: string[] = (rows[headerIdx] as any[]).map((c) => String(c ?? "").trim());

    // Preload existing imported-style placeholders so we don't duplicate notes.
    const existing = await this.prisma.petlReconciliationEntry.findMany({
      where: {
        projectId,
        estimateVersionId: latestVersion.id,
        rcvAmount: null,
        kind: {
          in: [
            PetlReconciliationEntryKind.NOTE_ONLY,
            PetlReconciliationEntryKind.REIMBURSE_OWNER,
            PetlReconciliationEntryKind.CHANGE_ORDER_CLIENT_PAY,
          ],
        },
      },
      select: {
        parentSowItemId: true,
        kind: true,
        note: true,
      },
    });

    const existingKey = new Set<string>();
    for (const e of existing) {
      if (!e.parentSowItemId) continue;
      const k = `${e.parentSowItemId}::${e.kind}::${e.note ?? ""}`;
      existingKey.add(k);
    }

    const caseCache = new Map<string, { id: string }>();

    let totalCsvDetailRows = 0;
    let matched = 0;
    let missing = 0;
    let mismatchMeta = 0;
    let createdCases = 0;
    let createdEntries = 0;
    let skippedExisting = 0;

    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const row = rows[i] as any[];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rec: Record<string, any> = {};
      for (let j = 0; j < header.length; j += 1) {
        rec[header[j] ?? String(j)] = row[j];
      }

      const lineNo = parseIntLoose(rec["#"]);
      if (lineNo == null) continue;

      totalCsvDetailRows += 1;

      const sowItem = byLineNo.get(lineNo) ?? null;
      if (!sowItem) {
        missing += 1;
        continue;
      }

      matched += 1;

      // Optional sanity check (do not block import)
      const csvCat = cleanText(rec["Cat"], 50) ?? "";
      const csvSel = cleanText(rec["Sel"], 50) ?? "";
      const csvDesc = cleanText(rec["Desc"], 2000) ?? "";
      const dbCat = (sowItem.categoryCode ?? "").trim();
      const dbSel = (sowItem.selectionCode ?? "").trim();
      const dbDesc = (sowItem.description ?? "").trim();

      if (
        (csvCat && dbCat && csvCat.toLowerCase() !== dbCat.toLowerCase()) ||
        (csvSel && dbSel && csvSel.toLowerCase() !== dbSel.toLowerCase()) ||
        (csvDesc && dbDesc && csvDesc.toLowerCase() !== dbDesc.toLowerCase())
      ) {
        mismatchMeta += 1;
      }

      const notes: { kind: PetlReconciliationEntryKind; note: string; column: string }[] = [];

      const ro = cleanText(rec["Reimburish Owner"], 5000);
      if (ro) {
        notes.push({
          kind: PetlReconciliationEntryKind.REIMBURSE_OWNER,
          note: ro,
          column: "Reimburish Owner",
        });
      }

      const co = cleanText(rec["Change Orders - Customer Pay"], 5000);
      if (co) {
        notes.push({
          kind: PetlReconciliationEntryKind.CHANGE_ORDER_CLIENT_PAY,
          note: co,
          column: "Change Orders - Customer Pay",
        });
      }

      const pol = cleanText(rec["Add to POL"], 5000);
      if (pol) {
        notes.push({
          kind: PetlReconciliationEntryKind.NOTE_ONLY,
          note: `Add to POL: ${pol}`,
          column: "Add to POL",
        });
      }

      if (notes.length === 0) {
        continue;
      }

      let theCase = caseCache.get(sowItem.id) ?? null;
      if (!theCase) {
        if (dryRun) {
          // We don't create cases in dry-run; just count notes.
          theCase = { id: "dry-run" };
        } else {
          const existingCase = await this.prisma.petlReconciliationCase.findFirst({
            where: {
              projectId,
              OR: [{ sowItemId: sowItem.id }, { logicalItemId: sowItem.logicalItemId }],
            },
            select: { id: true },
          });

          if (existingCase) {
            theCase = existingCase;
          } else {
            const created = await this.getOrCreatePetlReconciliationCaseForSowItem({
              projectId,
              companyId,
              actor,
              sowItemId: sowItem.id,
            });
            theCase = { id: created.id };
            createdCases += 1;
          }
        }

        caseCache.set(sowItem.id, theCase);
      }

      for (const n of notes) {
        const key = `${sowItem.id}::${n.kind}::${n.note}`;
        if (existingKey.has(key)) {
          skippedExisting += 1;
          continue;
        }

        createdEntries += 1;
        existingKey.add(key);

        if (dryRun) {
          continue;
        }

        await this.prisma.petlReconciliationEntry.create({
          data: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            caseId: theCase.id,
            parentSowItemId: sowItem.id,
            projectParticleId: sowItem.projectParticleId,
            kind: n.kind,
            note: n.note,
            rcvAmount: null,
            percentComplete: 0,
            isPercentCompleteLocked: true,
            createdByUserId: actor.userId,
            sourceSnapshotJson: {
              source: "PWC Reconcile2 - Xactimate POL - Summary Detail",
              fileName,
              lineNo,
              column: n.column,
            },
            events: {
              create: {
                projectId,
                estimateVersionId: sowItem.estimateVersionId,
                caseId: theCase.id,
                eventType: "ENTRY_CREATED_IMPORT",
                payloadJson: {
                  kind: n.kind,
                  note: n.note,
                  column: n.column,
                  lineNo,
                  fileName,
                },
                createdByUserId: actor.userId,
              },
            },
          },
        });
      }
    }

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      totalCsvDetailRows,
      matched,
      missing,
      mismatchMeta,
      createdCases,
      createdEntries,
      skippedExisting,
      dryRun,
    };
  }

  async createPetlReconciliationCredit(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    body: {
      note?: string | null;
      components?: { itemAmount?: boolean; salesTaxAmount?: boolean; opAmount?: boolean };
    },
  ) {
    const theCase = await this.getOrCreatePetlReconciliationCaseForSowItem({
      projectId,
      companyId,
      actor,
      sowItemId,
    });

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: {
        estimateVersionId: true,
        projectParticleId: true,
        description: true,
        categoryCode: true,
        selectionCode: true,
        unit: true,
        qty: true,
        unitCost: true,
        itemAmount: true,
        salesTaxAmount: true,
        rcvAmount: true,
      },
    });

    if (!sowItem) {
      throw new NotFoundException("SOW item not found");
    }

    const breakdown = this.buildRcvBreakdownForSowItem({
      qty: sowItem.qty ?? null,
      unitCost: sowItem.unitCost ?? null,
      itemAmount: sowItem.itemAmount ?? null,
      salesTaxAmount: sowItem.salesTaxAmount ?? null,
      rcvAmount: sowItem.rcvAmount ?? null,
    });

    const selected = this.computeSelectedRcvAmount(breakdown, body.components);

    if (selected <= 0) {
      throw new BadRequestException("Credit amount must be greater than 0");
    }

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind: PetlReconciliationEntryKind.CREDIT,
        description: sowItem.description,
        categoryCode: sowItem.categoryCode,
        selectionCode: sowItem.selectionCode,
        unit: sowItem.unit,
        qty: sowItem.qty,
        unitCost: sowItem.unitCost,
        itemAmount: breakdown.itemAmount,
        salesTaxAmount: breakdown.salesTaxAmount,
        opAmount: breakdown.opAmount,
        rcvAmount: -1 * selected,
        rcvComponentsJson: {
          itemAmount: body.components?.itemAmount ?? true,
          salesTaxAmount: body.components?.salesTaxAmount ?? true,
          opAmount: body.components?.opAmount ?? true,
        },
        note: body.note ?? null,
        percentComplete: 0,
        isPercentCompleteLocked: true,
        createdByUserId: actor.userId,
        events: {
          create: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            caseId: theCase.id,
            eventType: "ENTRY_CREATED",
            payloadJson: { kind: "CREDIT", amount: -1 * selected },
            createdByUserId: actor.userId,
          },
        },
      },
      include: {
        case: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return { entry, reconciliationCase: entry.case };
  }

  async createPetlReconciliationAddManual(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    body: {
      description?: string | null;
      categoryCode?: string | null;
      selectionCode?: string | null;
      unit?: string | null;
      qty?: number | null;
      unitCost?: number | null;
      itemAmount?: number | null;
      salesTaxAmount?: number | null;
      opAmount?: number | null;
      rcvAmount?: number | null;
      note?: string | null;
    },
  ) {
    const theCase = await this.getOrCreatePetlReconciliationCaseForSowItem({
      projectId,
      companyId,
      actor,
      sowItemId,
    });

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: {
        estimateVersionId: true,
        projectParticleId: true,
        description: true,
      },
    });

    if (!sowItem) {
      throw new NotFoundException("SOW item not found");
    }

    const qty = body.qty ?? null;
    const unitCost = body.unitCost ?? null;
    const itemAmount =
      body.itemAmount ?? (qty != null && unitCost != null ? qty * unitCost : null);

    const salesTaxAmount = body.salesTaxAmount ?? null;
    const opAmount = body.opAmount ?? null;

    const rcvAmount =
      body.rcvAmount ??
      ((itemAmount ?? 0) + (salesTaxAmount ?? 0) + (opAmount ?? 0));

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind: PetlReconciliationEntryKind.ADD,
        description: body.description ?? sowItem.description,
        categoryCode: body.categoryCode ?? null,
        selectionCode: body.selectionCode ?? null,
        unit: body.unit ?? null,
        qty,
        unitCost,
        itemAmount,
        salesTaxAmount,
        opAmount,
        rcvAmount,
        rcvComponentsJson: {
          itemAmount: itemAmount != null,
          salesTaxAmount: salesTaxAmount != null,
          opAmount: opAmount != null,
        },
        note: body.note ?? null,
        percentComplete: 0,
        isPercentCompleteLocked: false,
        createdByUserId: actor.userId,
        events: {
          create: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            caseId: theCase.id,
            eventType: "ENTRY_CREATED",
            payloadJson: { kind: "ADD", amount: rcvAmount },
            createdByUserId: actor.userId,
          },
        },
      },
      include: {
        case: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return { entry, reconciliationCase: entry.case };
  }

  async createPetlReconciliationAddFromCostBook(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    body: {
      companyPriceListItemId: string;
      qty?: number | null;
      unitCostOverride?: number | null;
      note?: string | null;
    },
  ) {
    const theCase = await this.getOrCreatePetlReconciliationCaseForSowItem({
      projectId,
      companyId,
      actor,
      sowItemId,
    });

    const sowItem = await this.prisma.sowItem.findUnique({
      where: { id: sowItemId },
      select: {
        estimateVersionId: true,
        projectParticleId: true,
        qty: true,
      },
    });

    if (!sowItem) {
      throw new NotFoundException("SOW item not found");
    }

    const costBookItem = await this.prisma.companyPriceListItem.findFirst({
      where: {
        id: body.companyPriceListItemId,
        companyPriceList: {
          companyId,
          isActive: true,
        },
      },
    });

    if (!costBookItem) {
      throw new NotFoundException("Cost book item not found for this company");
    }

    const qty = body.qty ?? sowItem.qty ?? 1;
    const unitCost = body.unitCostOverride ?? costBookItem.unitPrice ?? 0;
    const itemAmount = qty * unitCost;

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind: PetlReconciliationEntryKind.ADD,
        description: costBookItem.description,
        categoryCode: costBookItem.cat,
        selectionCode: costBookItem.sel,
        unit: costBookItem.unit,
        qty,
        unitCost,
        itemAmount,
        salesTaxAmount: 0,
        opAmount: 0,
        rcvAmount: itemAmount,
        rcvComponentsJson: {
          itemAmount: true,
          salesTaxAmount: false,
          opAmount: false,
        },
        companyPriceListItemId: costBookItem.id,
        sourceSnapshotJson: {
          id: costBookItem.id,
          cat: costBookItem.cat,
          sel: costBookItem.sel,
          description: costBookItem.description,
          unit: costBookItem.unit,
          unitPrice: costBookItem.unitPrice,
          rawJson: costBookItem.rawJson,
          companyPriceListId: costBookItem.companyPriceListId,
          lastPriceChangedAt: costBookItem.lastPriceChangedAt,
        },
        note: body.note ?? null,
        percentComplete: 0,
        isPercentCompleteLocked: false,
        createdByUserId: actor.userId,
        events: {
          create: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            caseId: theCase.id,
            eventType: "ENTRY_CREATED",
            payloadJson: {
              kind: "ADD_FROM_COST_BOOK",
              companyPriceListItemId: costBookItem.id,
              amount: itemAmount,
            },
            createdByUserId: actor.userId,
          },
        },
      },
      include: {
        case: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return { entry, reconciliationCase: entry.case };
  }

  async updatePetlReconciliationEntryPercent(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    entryId: string,
    newPercent: number,
  ) {
    await this.getProjectByIdForUser(projectId, actor);

    const entry = await this.prisma.petlReconciliationEntry.findUnique({
      where: { id: entryId },
      include: { case: true },
    });

    if (!entry || entry.projectId !== projectId) {
      throw new NotFoundException("Reconciliation entry not found for this project");
    }

    if (entry.isPercentCompleteLocked) {
      throw new BadRequestException("Percent complete is locked for this entry");
    }

    const updated = await this.prisma.petlReconciliationEntry.update({
      where: { id: entryId },
      data: {
        percentComplete: newPercent,
        events: {
          create: {
            projectId,
            estimateVersionId: entry.estimateVersionId,
            caseId: entry.caseId,
            eventType: "ENTRY_PERCENT_UPDATED",
            payloadJson: { newPercent },
            createdByUserId: actor.userId,
          },
        },
      },
      include: {
        case: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return { entry: updated, reconciliationCase: updated.case };
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
        },
      ],
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

    // Prefer the same estimate version that backs the PETL grid and summary so
    // room groupings stay aligned with what the user sees in the PETL tab.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

    if (!latestVersion) {
      return { projectId, groups: [] };
    }

    const [items, reconEntries] = await Promise.all([
      this.prisma.sowItem.findMany({
        where: { estimateVersionId: latestVersion.id },
      }),
      this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
        },
      }),
    ]);

    const particleById = await this.resolveProjectParticlesForProject({
      projectId,
      particleIds: [
        ...items.map((i) => i.projectParticleId),
        ...reconEntries.map((e) => e.projectParticleId),
      ],
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
      const particle = particleById.get(item.projectParticleId) ?? null;
      const key = particle ? particle.id : "__project__";
      const roomName = particle?.fullLabel ?? particle?.name ?? "Whole Project";

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

    // Apply reconciliation adjustments to room totals / percent complete.
    for (const entry of reconEntries) {
      const particle = particleById.get(entry.projectParticleId) ?? null;
      const key = particle ? particle.id : "__project__";
      const roomName = particle?.fullLabel ?? particle?.name ?? "Whole Project";

      let agg = byParticle.get(key);
      if (!agg) {
        agg = {
          particleId: particle ? particle.id : null,
          roomName,
          itemsCount: 0,
          totalAmount: 0,
          completedAmount: 0,
          percentComplete: 0,
        };
        byParticle.set(key, agg);
      }

      const lineTotal = entry.rcvAmount ?? 0;
      agg.itemsCount += 1;
      agg.totalAmount += lineTotal;

      const pct = entry.isPercentCompleteLocked ? 0 : (entry.percentComplete ?? 0);
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

    // Prefer the same estimate version that backs the PETL grid so selection
    // summaries stay aligned with what the user sees in the PETL tab.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

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

    const [items, reconEntries] = await Promise.all([
      this.prisma.sowItem.findMany({ where }),
      this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
          ...(filters.roomParticleId
            ? { projectParticleId: filters.roomParticleId }
            : {}),
          ...(filters.categoryCode ? { categoryCode: filters.categoryCode } : {}),
          ...(filters.selectionCode ? { selectionCode: filters.selectionCode } : {}),
        },
      }),
    ]);

    if (items.length === 0 && reconEntries.length === 0) {
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

    for (const entry of reconEntries) {
      const lineTotal = entry.rcvAmount ?? 0;
      const pct = entry.isPercentCompleteLocked ? 0 : (entry.percentComplete ?? 0);
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

  /**
   * Field PETL view for PUDL / Daily Logs.
   * Returns PETL (SOW) rows without any pricing information so that
   * crew/foremen can see scope and quantities but not dollars.
   */
  async getFieldPetlForProject(
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

    // Any user who can see the project can see Field PETL, but we still
    // enforce project membership for non-owners/admins.
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

    // Use the same estimateVersion selection logic as the main PETL grid.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        items: [],
      };
    }

    const items = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      orderBy: [{ lineNo: "asc" }],
    });

    const particleById = await this.resolveProjectParticlesForProject({
      projectId,
      particleIds: items.map((i) => i.projectParticleId),
    });

    const mapped = items.map((item) => {
      const particle = particleById.get(item.projectParticleId) ?? null;
      return {
        id: item.id,
        lineNo: item.lineNo,
        roomParticleId: item.projectParticleId,
        roomName: particle?.fullLabel ?? particle?.name ?? null,
        categoryCode: item.categoryCode ?? null,
        selectionCode: item.selectionCode ?? null,
        activity: item.activity ?? null,
        description: item.description,
        unit: item.unit ?? null,
        originalQty: item.originalQty ?? item.qty ?? null,
        qty: item.qty ?? null,
        qtyFlaggedIncorrect: item.qtyFlaggedIncorrect,
        qtyFieldReported: item.qtyFieldReported ?? null,
        qtyReviewStatus: item.qtyReviewStatus ?? null,
      };
    });

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      items: mapped,
    };
  }

  /**
   * Apply quantity flags from the Field PETL (PUDL) UI.
   * This does NOT change official quantities immediately; it records
   * field-reported discrepancies for PM/estimators to review.
   */
  async applyFieldPetlQuantityFlags(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      items: { sowItemId: string; qtyFlaggedIncorrect: boolean; qtyFieldReported?: number | null; notes?: string | null }[];
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Any project member can submit flags; enforce membership for non-owner/admin.
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

    const { items } = payload;
    if (!Array.isArray(items) || items.length === 0) {
      return { updatedCount: 0 };
    }

    const now = new Date();
    let updatedCount = 0;

    for (const entry of items) {
      const { sowItemId, qtyFlaggedIncorrect, qtyFieldReported, notes } = entry;

      await this.prisma.sowItem.updateMany({
        where: {
          id: sowItemId,
          sow: { projectId },
        },
        data: {
          qtyFlaggedIncorrect,
          qtyFieldReported: qtyFlaggedIncorrect ? (qtyFieldReported ?? null) : null,
          qtyFieldReportedByUserId: qtyFlaggedIncorrect ? actor.userId : null,
          qtyFieldReportedAt: qtyFlaggedIncorrect ? now : null,
          qtyFieldNotes: qtyFlaggedIncorrect ? (notes ?? null) : null,
          qtyReviewStatus: qtyFlaggedIncorrect ? "PENDING" : null,
        },
      });

      updatedCount += 1;
    }

    return { updatedCount };
  }

  /**
   * PM/Estimator review endpoint for Field PETL quantity flags.
   * Allows accepting or rejecting field-reported quantities. On ACCEPT,
   * we update the official qty and log a PetlEditChange; on REJECT we
   * mark the flag as rejected without changing qty.
   */
  async reviewFieldPetlQuantityFlags(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      items: { sowItemId: string; action: "ACCEPT" | "REJECT"; coSupTag?: string | null }[];
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Restrict review to OWNER / ADMIN roles.
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only project owners/admins can review PETL quantities");
    }

    const { items } = payload;
    if (!Array.isArray(items) || items.length === 0) {
      return { reviewedCount: 0 };
    }

    const now = new Date();
    let reviewedCount = 0;

    for (const entry of items) {
      const { sowItemId, action } = entry;

      const sowItem = await this.prisma.sowItem.findFirst({
        where: {
          id: sowItemId,
          sow: { projectId },
        },
      });

      if (!sowItem) {
        continue;
      }

      if (action === "ACCEPT") {
        // If there is a field-reported qty, use it; otherwise leave as-is.
        const newQty = sowItem.qtyFieldReported ?? sowItem.qty ?? null;
        const oldQty = sowItem.qty ?? null;

        // Initialize originalQty the first time we accept a change.
        const originalQty = sowItem.originalQty ?? sowItem.qty ?? null;

        await this.prisma.$transaction(async (tx) => {
          await tx.sowItem.update({
            where: { id: sowItem.id },
            data: {
              originalQty,
              qty: newQty,
              qtyFlaggedIncorrect: false,
              qtyReviewStatus: "ACCEPTED",
            },
          });

          if (oldQty !== newQty) {
            await tx.petlEditChange.create({
              data: {
                sessionId: await this.ensurePetlEditSessionId(tx, projectId, actor.userId),
                sowItemId: sowItem.id,
                field: "qty",
                oldValue: oldQty,
                newValue: newQty,
                effectiveAt: now,
              },
            });
          }
        });

        reviewedCount += 1;
      } else if (action === "REJECT") {
        await this.prisma.sowItem.update({
          where: { id: sowItem.id },
          data: {
            qtyFlaggedIncorrect: false,
            qtyReviewStatus: "REJECTED",
          },
        });
        reviewedCount += 1;
      }
    }

    return { reviewedCount };
  }

  /**
   * Internal helper to ensure there is a PetlEditSession to attach qty
   * changes to. We keep this simple: one session per project/user/day
   * for now.
   */
  private async ensurePetlEditSessionId(
    tx: Prisma.TransactionClient,
    projectId: string,
    userId?: string | null,
  ): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await tx.petlEditSession.findFirst({
      where: {
        projectId,
        userId: userId ?? undefined,
        startedAt: {
          gte: today,
        },
      },
      orderBy: { startedAt: "desc" },
    });

    if (existing) return existing.id;

    const created = await tx.petlEditSession.create({
      data: {
        projectId,
        userId: userId ?? null,
        source: "petl-field-review",
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    return created.id;
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

    // Prefer the same estimate version that backs the PETL grid so components
    // are drawn from the same baseline as the PETL rows.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

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

    // Prefer the latest estimate version that has at least one PETL row, so
    // summary numbers stay aligned with what the PETL tab shows.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

    if (!latestVersion) {
      return {
        projectId,
        estimateVersionId: null,
        itemCount: 0,
        totalAmount: 0,
        componentsCount: 0,
      };
    }

    const [sowItems, reconEntries, componentsCount] = await Promise.all([
      this.prisma.sowItem.findMany({
        where: { estimateVersionId: latestVersion.id },
        select: { rcvAmount: true, itemAmount: true },
      }),
      this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
        },
        select: { rcvAmount: true },
      }),
      this.prisma.componentSummary.count({
        where: { estimateVersionId: latestVersion.id },
      }),
    ]);

    let totalAmount = 0;
    for (const item of sowItems) {
      totalAmount += item.rcvAmount ?? item.itemAmount ?? 0;
    }
    for (const entry of reconEntries) {
      totalAmount += entry.rcvAmount ?? 0;
    }

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      itemCount: sowItems.length + reconEntries.length,
      totalAmount,
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

    // Financials should also follow the same estimate version as PETL.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        sows: {
          some: {
            items: {
              some: {},
            },
          },
        },
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

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

    const reconAgg = await this.prisma.petlReconciliationEntry.aggregate({
      where: {
        projectId,
        estimateVersionId: latestVersion.id,
        rcvAmount: { not: null },
      },
      _max: { updatedAt: true },
    });
    const reconUpdatedAt = reconAgg._max.updatedAt ?? null;

    // Try to use an existing snapshot if it is from today, not forced to refresh,
    // and no reconciliation entries have been updated since the snapshot.
    if (!forceRefresh) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existing = await this.prisma.projectFinancialSnapshot.findFirst({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          snapshotDate: { gte: todayStart },
        },
        orderBy: [{ snapshotDate: "desc" }, { computedAt: "desc" }],
      });

      if (existing && (!reconUpdatedAt || existing.computedAt >= reconUpdatedAt)) {
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

    const [items, reconEntries] = await Promise.all([
      this.prisma.sowItem.findMany({
        where: { estimateVersionId: latestVersion.id },
        select: {
          rcvAmount: true,
          itemAmount: true,
          acvAmount: true,
          percentComplete: true,
          isAcvOnly: true,
        },
      }),
      this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
        },
        select: {
          rcvAmount: true,
          percentComplete: true,
          isPercentCompleteLocked: true,
        },
      }),
    ]);

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

    for (const entry of reconEntries) {
      const rcv = entry.rcvAmount ?? 0;
      const pct = entry.isPercentCompleteLocked ? 0 : (entry.percentComplete ?? 0);
      totalRcvClaim += rcv;
      workCompleteRcv += rcv * (pct / 100);
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
