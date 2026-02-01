import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import type { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import {
  GlobalRole,
  Role,
  ProjectRole,
  ProjectParticleType,
  ProjectParticipantScope,
  ProjectVisibilityLevel,
  MessageThreadType,
  PetlReconciliationCaseStatus,
  PetlReconciliationEntryKind,
  PetlReconciliationEntryTag,
  PetlPercentUpdateSessionStatus,
  PetlPercentUpdateTargetType,
  ProjectBillLineItemAmountSource,
  ProjectBillLineItemKind,
  ProjectBillStatus,
  ProjectInvoiceLineItemKind,
  ProjectInvoicePetlLineBillingTag,
  ProjectInvoiceStatus,
  ProjectPaymentMethod,
  ProjectPaymentStatus,
} from "@prisma/client";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import {
  AddInvoiceLineItemDto,
  ApplyPaymentToInvoiceDto,
  CreateOrGetDraftInvoiceDto,
  IssueInvoiceDto,
  RecordInvoicePaymentDto,
  RecordProjectPaymentDto,
  UpdateInvoiceLineItemDto,
  UpdateInvoicePetlLineDto,
} from "./dto/project-invoice.dto";
import {
  AttachProjectBillFileDto,
  CreateProjectBillDto,
  UpdateProjectBillDto,
} from "./dto/project-bill.dto";
import { importXactCsvForProject, importXactComponentsCsvForEstimate, allocateComponentsForEstimate } from "@repo/database";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";

type PetlArchiveBundleV1 = {
  schemaVersion: 1;
  exportedAt: string;
  companyId: string;
  projectId: string;
  sourceEstimateVersion: {
    id: string;
    sequenceNo: number;
    sourceType: string;
    fileName: string;
    storedPath: string;
    estimateKind: string;
    defaultPayerType: string;
    description: string | null;
    status: string;
    importedAt: string | null;
    createdAt: string;
  };
  items: Array<{
    lineNo: number;
    projectParticleId: string;
    logicalItem: {
      signatureHash: string;
      projectParticleId: string;
    };
    rawRow: {
      lineNo: number;
      groupCode: string | null;
      groupDescription: string | null;
      desc: string | null;
      age: number | null;
      condition: string | null;
      qty: number | null;
      itemAmount: number | null;
      reportedCost: number | null;
      unitCost: number | null;
      unit: string | null;
      coverage: string | null;
      activity: string | null;
      workersWage: number | null;
      laborBurden: number | null;
      laborOverhead: number | null;
      material: number | null;
      equipment: number | null;
      marketConditions: number | null;
      laborMinimum: number | null;
      salesTax: number | null;
      rcv: number | null;
      life: number | null;
      depreciationType: string | null;
      depreciationAmount: number | null;
      recoverable: boolean | null;
      acv: number | null;
      tax: number | null;
      replaceFlag: boolean | null;
      cat: string | null;
      sel: string | null;
      owner: string | null;
      originalVendor: string | null;
      sourceName: string | null;
      sourceDate: string | null;
      note1: string | null;
      adjSource: string | null;
      rawRowJson: any;
    };
    sowItem: {
      description: string;
      qty: number | null;
      originalQty: number | null;
      unit: string | null;
      unitCost: number | null;
      itemAmount: number | null;
      rcvAmount: number | null;
      acvAmount: number | null;
      depreciationAmount: number | null;
      salesTaxAmount: number | null;
      categoryCode: string | null;
      selectionCode: string | null;
      activity: string | null;
      materialAmount: number | null;
      equipmentAmount: number | null;
      payerType: string;
      performed: boolean;
      eligibleForAcvRefund: boolean;
      acvRefundAmount: number | null;
      percentComplete: number;
      isAcvOnly: boolean;
      qtyFlaggedIncorrect: boolean;
      qtyFieldReported: number | null;
      qtyFieldReportedByUserId: string | null;
      qtyFieldReportedAt: string | null;
      qtyFieldNotes: string | null;
      qtyReviewStatus: string | null;
    };
  }>;
  reconciliationEntries: Array<{
    parentPetlLineNo: number | null;
    projectParticleId: string;
    kind: string;
    tag: string | null;
    description: string | null;
    categoryCode: string | null;
    selectionCode: string | null;
    unit: string | null;
    qty: number | null;
    unitCost: number | null;
    itemAmount: number | null;
    salesTaxAmount: number | null;
    opAmount: number | null;
    rcvAmount: number | null;
    rcvComponentsJson: any;
    percentComplete: number;
    isPercentCompleteLocked: boolean;
    companyPriceListItemId: string | null;
    sourceSnapshotJson: any;
    note: string | null;
  }>;
};

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

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

  private async isProjectManagerOrAbove(projectId: string, actor: AuthenticatedUser) {
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) return true;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        userId_projectId: {
          userId: actor.userId,
          projectId,
        },
      },
    });

    return membership?.role === ProjectRole.OWNER || membership?.role === ProjectRole.MANAGER;
  }

  private async getLatestEstimateVersionForPetl(projectId: string) {
    // Prefer completed imports. If an import fails part-way through, it may still
    // have some SowItems written; we should not treat that partial estimate as the
    // active PETL version.
    let latestVersion = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        status: "completed",
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

    // Fallback: if no completed estimate exists (e.g., legacy env), return the latest
    // version even if it isn't completed.
    if (!latestVersion) {
      latestVersion = await this.prisma.estimateVersion.findFirst({
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
    }

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

  /**
   * Ensure there is a manual-from-cost-book EstimateVersion + Sow for this project
   * that we can attach PETL rows to when the user builds an estimate directly from
   * the tenant Cost Book.
   */
  private async getOrCreateManualCostBookEstimateVersion(projectId: string, actor: AuthenticatedUser) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // Try to find an existing manual-from-cost-book estimate for this project.
    let version = await this.prisma.estimateVersion.findFirst({
      where: {
        projectId,
        OR: [
          { sourceType: "manual_cost_book" },
          { estimateKind: "manual" },
        ],
      },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (version) {
      return version;
    }

    const maxAgg = await this.prisma.estimateVersion.aggregate({
      where: { projectId },
      _max: { sequenceNo: true },
    });
    const nextSequenceNo = (maxAgg._max.sequenceNo ?? 0) + 1;

    const now = new Date();
    const defaultPayerType = "Insurance";

    version = await this.prisma.estimateVersion.create({
      data: {
        projectId,
        sourceType: "manual_cost_book",
        fileName: `Manual Cost Book Estimate – ${project.name}`.slice(0, 255),
        storedPath: "(manual)",
        estimateKind: "manual",
        sequenceNo: nextSequenceNo,
        defaultPayerType,
        description: "Manual PETL estimate built from tenant cost book",
        status: "completed",
        importedByUserId: actor.userId,
        importedAt: now,
      },
    });

    // Ensure a SOW exists for this manual estimate version.
    await this.prisma.sow.create({
      data: {
        projectId,
        estimateVersionId: version.id,
        sourceType: "manual_cost_book",
        totalAmount: null,
      },
    });

    return version;
  }

  /**
   * Ensure we have a top-level project particle representing the whole site/location
   * that we can attach manual PETL lines to by default.
   */
  private async ensureProjectLocationParticle(projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const existing = await this.prisma.projectParticle.findFirst({
      where: {
        projectId,
        companyId: project.companyId,
        buildingId: null,
        unitId: null,
        type: ProjectParticleType.ROOM,
        fullLabel: project.name,
      },
    });

    if (existing) return existing;

    return this.prisma.projectParticle.create({
      data: {
        companyId: project.companyId,
        projectId: project.id,
        buildingId: null,
        unitId: null,
        type: ProjectParticleType.ROOM,
        name: project.name,
        fullLabel: project.name,
      },
    });
  }

  /**
   * Create baseline PETL (SowItem) rows directly from the tenant Cost Book for a project.
   *
   * - If a PETL-backed estimate already exists, we append new lines to that version.
   * - Otherwise we create a manual-from-cost-book EstimateVersion + Sow and attach rows there.
   * - Optionally creates a zero-priced "Location" line item to track final material location.
   */
  async addPetlLinesFromCostBook(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    body: {
      lines: {
        companyPriceListItemId: string;
        qty?: number | null;
        projectParticleId?: string | null;
        payerType?: string | null;
        tag?: string | null;
        note?: string | null;
      }[];
      locationDescription?: string | null;
    },
  ) {
    const { lines, locationDescription } = body ?? {};

    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException("At least one Cost Book line is required");
    }

    // Reuse PETL access rules: only PM/Owner/Admin can materially change PETL.
    const canEdit = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canEdit) {
      throw new ForbiddenException("Only PM/owner/admin can add PETL line items from the Cost Book");
    }

    // Ensure the project exists in this company.
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Prefer the same estimate version the PETL grid uses; fall back to a
    // manual-from-cost-book version when no PETL exists yet.
    let estimateVersion = await this.getLatestEstimateVersionForPetl(projectId);
    if (!estimateVersion) {
      estimateVersion = await this.getOrCreateManualCostBookEstimateVersion(projectId, actor);
    }

    // Ensure there is a SOW row for this estimate version.
    let sow = await this.prisma.sow.findFirst({
      where: { projectId, estimateVersionId: estimateVersion.id },
    });
    if (!sow) {
      sow = await this.prisma.sow.create({
        data: {
          projectId,
          estimateVersionId: estimateVersion.id,
          sourceType: estimateVersion.sourceType || "manual_cost_book",
          totalAmount: null,
        },
      });
    }

    const locationParticle = await this.ensureProjectLocationParticle(projectId);

    // Helper to normalize quantities.
    const toQty = (value: any, fallback: number): number => {
      if (value == null) return fallback;
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return n;
    };

    // Helper to compute a simple logical signature for Cost Book–sourced lines.
    const buildSignature = (item: {
      cat: string | null;
      sel: string | null;
      description: string | null;
      unit: string | null;
    }) => {
      const parts = [item.cat, item.sel, item.description, item.unit]
        .map((x) => String(x ?? "").trim())
        .filter((x) => x.length > 0);
      return parts.join("|") || "(cost-book-line)";
    };

    const trimmedLocation = String(locationDescription ?? "").trim();

    // Perform all writes in a single transaction so PETL stays consistent.
    const result = await this.prisma.$transaction(async (tx) => {
      // Determine next PETL line number for this estimate version.
      const maxAgg = await tx.sowItem.aggregate({
        where: { estimateVersionId: estimateVersion.id },
        _max: { lineNo: true },
      });
      let nextLineNo = (maxAgg._max.lineNo ?? 0) + 1;

      // Preload all requested Cost Book items for the active tenant Cost Book.
      const itemIds = Array.from(
        new Set(lines.map((l) => String(l.companyPriceListItemId ?? "").trim()).filter(Boolean)),
      );
      const costBookItems = await tx.companyPriceListItem.findMany({
        where: {
          id: { in: itemIds },
          companyPriceList: {
            companyId,
            isActive: true,
          },
        },
      });

      const costBookById = new Map(costBookItems.map((it) => [it.id, it]));
      if (costBookById.size !== itemIds.length) {
        throw new BadRequestException("One or more Cost Book items were not found for this company");
      }

      const createdSowItems: any[] = [];
      let createdLocation: any | null = null;

      // Optional Location line (zero-cost by default, but participates in PETL totals).
      if (trimmedLocation) {
        const existingLocation = await tx.sowItem.findFirst({
          where: {
            estimateVersionId: estimateVersion.id,
            categoryCode: "LOG",
            selectionCode: "LOCATION",
          },
        });

        if (!existingLocation) {
          const locationLineNo = nextLineNo++;
          const locationLabel = `Location: ${trimmedLocation}`.slice(0, 255);

          const rawLocation = await tx.rawXactRow.create({
            data: {
              estimateVersionId: estimateVersion.id,
              lineNo: locationLineNo,
              desc: locationLabel,
              qty: 1,
              unitCost: 0,
              itemAmount: 0,
              rcv: 0,
              unit: "LS",
              cat: "LOG",
              sel: "LOCATION",
              sourceName: "MANUAL_COST_BOOK_LOCATION",
              rawRowJson: {
                costBookSource: {
                  kind: "LOCATION",
                  locationDescription: trimmedLocation,
                },
              },
            },
          });

          const logicalLocation = await tx.sowLogicalItem.create({
            data: {
              projectId,
              projectParticleId: locationParticle.id,
              signatureHash: `LOCATION|${locationLabel}`.slice(0, 255),
            },
          });

          createdLocation = await tx.sowItem.create({
            data: {
              sowId: sow.id,
              estimateVersionId: estimateVersion.id,
              rawRowId: rawLocation.id,
              logicalItemId: logicalLocation.id,
              projectParticleId: locationParticle.id,
              lineNo: locationLineNo,
              description: locationLabel,
              qty: 1,
              originalQty: 1,
              unit: "LS",
              unitCost: 0,
              itemAmount: 0,
              rcvAmount: 0,
              categoryCode: "LOG",
              selectionCode: "LOCATION",
              payerType: estimateVersion.defaultPayerType,
              performed: false,
              eligibleForAcvRefund: false,
              acvRefundAmount: null,
              percentComplete: 0,
              isAcvOnly: false,
              qtyFlaggedIncorrect: false,
            },
          });

          createdSowItems.push(createdLocation);
        }
      }

      // Create PETL rows for each requested Cost Book line.
      for (const line of lines) {
        const id = String(line.companyPriceListItemId ?? "").trim();
        const costItem: any = costBookById.get(id);
        if (!id || !costItem) {
          throw new BadRequestException("Cost Book item not found or invalid");
        }

        const particleId =
          (line.projectParticleId && String(line.projectParticleId).trim()) || locationParticle.id;

        const qty = toQty(line.qty, 1);
        const unitCost = (() => {
          if (line.payerType && line.payerType === "0") return 0;
          if (line.qty != null && line.qty <= 0) return costItem.unitPrice ?? 0;
          const override = (line as any).unitCostOverride;
          if (override != null) {
            const n = Number(override);
            if (Number.isFinite(n) && n >= 0) return n;
          }
          return costItem.unitPrice ?? 0;
        })();

        const itemAmount = qty * unitCost;
        const rcvAmount = itemAmount;

        const raw = await tx.rawXactRow.create({
          data: {
            estimateVersionId: estimateVersion.id,
            lineNo: nextLineNo,
            desc: costItem.description ?? null,
            qty,
            unitCost,
            itemAmount,
            rcv: rcvAmount,
            unit: costItem.unit ?? null,
            cat: costItem.cat ?? null,
            sel: costItem.sel ?? null,
            activity: costItem.activity ?? null,
            groupCode: costItem.groupCode ?? null,
            groupDescription: costItem.groupDescription ?? null,
            owner: costItem.owner ?? null,
            originalVendor: costItem.sourceVendor ?? null,
            sourceDate: costItem.sourceDate ?? null,
            sourceName: "MANUAL_COST_BOOK",
            rawRowJson: {
              costBookSource: {
                kind: "COMPANY_PRICE_LIST_ITEM",
                companyPriceListItemId: costItem.id,
                companyPriceListId: costItem.companyPriceListId,
              },
              rawJson: costItem.rawJson ?? null,
            },
          },
        });

        const signature = buildSignature({
          cat: costItem.cat ?? null,
          sel: costItem.sel ?? null,
          description: costItem.description ?? null,
          unit: costItem.unit ?? null,
        }).slice(0, 255);

        let logical = await tx.sowLogicalItem.findFirst({
          where: {
            projectId,
            projectParticleId: particleId,
            signatureHash: signature,
          },
        });

        if (!logical) {
          logical = await tx.sowLogicalItem.create({
            data: {
              projectId,
              projectParticleId: particleId,
              signatureHash: signature,
            },
          });
        }

        const sowItem = await tx.sowItem.create({
          data: {
            sowId: sow.id,
            estimateVersionId: estimateVersion.id,
            rawRowId: raw.id,
            logicalItemId: logical.id,
            projectParticleId: particleId,
            lineNo: nextLineNo,
            description: costItem.description ?? "(Cost Book item)",
            qty,
            originalQty: qty,
            unit: costItem.unit ?? null,
            unitCost,
            itemAmount,
            rcvAmount,
            acvAmount: null,
            depreciationAmount: null,
            salesTaxAmount: null,
            categoryCode: costItem.cat ?? null,
            selectionCode: costItem.sel ?? null,
            activity: costItem.activity ?? null,
            materialAmount: null,
            equipmentAmount: null,
            payerType: String(line.payerType ?? estimateVersion.defaultPayerType ?? "Insurance"),
            performed: false,
            eligibleForAcvRefund: false,
            acvRefundAmount: null,
            percentComplete: 0,
            isAcvOnly: false,
            qtyFlaggedIncorrect: false,
          },
        });

        createdSowItems.push(sowItem);
        nextLineNo += 1;
      }

      return {
        projectId,
        estimateVersionId: estimateVersion.id,
        createdCount: createdSowItems.length,
        createdLocation,
        items: createdSowItems,
      };
    });

    await this.audit.log(actor, "PROJECT_PETL_LINES_CREATED_FROM_COST_BOOK", {
      companyId,
      projectId,
      metadata: {
        estimateVersionId: result.estimateVersionId,
        createdCount: result.createdCount,
        hasLocation: !!result.createdLocation,
      },
    });

    return result;
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

  private isMissingPrismaTableError(err: any, tableOrModel: string) {
    const code = String(err?.code ?? "");
    if (code !== "P2021") return false;
    const msg = String(err?.message ?? "");
    return msg.includes(tableOrModel);
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
    const itemsRaw = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      orderBy: { lineNo: "asc" },
    });

    // Reconciliation entries are optional. If the DB migration hasn't been
    // applied yet in an environment, Prisma throws P2021 (table missing).
    let reconciliationEntriesRaw: any[] = [];
    let reconciliationActivitySowItemIds: string[] = [];
    try {
      const [reconMonetary, reconActivity] = await Promise.all([
        this.prisma.petlReconciliationEntry.findMany({
          where: {
            projectId,
            estimateVersionId: latestVersion.id,
            rcvAmount: { not: null },
          },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.petlReconciliationEntry.findMany({
          where: {
            projectId,
            estimateVersionId: latestVersion.id,
            parentSowItemId: { not: null },
          },
          distinct: ["parentSowItemId"],
          select: { parentSowItemId: true },
        }),
      ]);

      reconciliationEntriesRaw = reconMonetary;
      reconciliationActivitySowItemIds = reconActivity
        .map((r: any) => r.parentSowItemId)
        .filter((v: any): v is string => typeof v === "string" && v.length > 0);
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationEntry")) {
        throw err;
      }
    }

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
      reconciliationActivitySowItemIds,
    };
  }

  private assertAdminOrAbove(actor: AuthenticatedUser) {
    const role = (actor as any)?.role;
    const globalRole = (actor as any)?.globalRole;
    const ok = role === "OWNER" || role === "ADMIN" || globalRole === "SUPER_ADMIN";
    if (!ok) {
      throw new ForbiddenException("Only Admin/Owner (or SUPER_ADMIN) can perform this action");
    }
  }

  private petlArchiveModelsAvailable() {
    const p: any = this.prisma as any;
    return typeof p?.projectPetlArchive?.findMany === "function";
  }

  private ensurePetlArchiveModelsAvailable() {
    if (this.petlArchiveModelsAvailable()) return;

    throw new BadRequestException(
      "PETL archives are not initialized on this API instance. Run `npm -w packages/database run prisma:generate` and restart the API; if it still fails, run `npm -w packages/database run prisma:migrate`.",
    );
  }

  private isPetlArchiveTableMissingError(err: any) {
    return this.isMissingPrismaTableError(err, "ProjectPetlArchive");
  }

  private throwPetlArchiveTablesNotMigrated() {
    throw new BadRequestException(
      "Project PETL archive tables are not present in the database yet. Run `npm -w packages/database run prisma:migrate` (against your dev DATABASE_URL), then restart the API.",
    );
  }

  async listPetlArchives(projectId: string, actor: AuthenticatedUser) {
    this.assertAdminOrAbove(actor);
    this.ensurePetlArchiveModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      return this.prisma.projectPetlArchive.findMany({
        where: {
          projectId: project.id,
          companyId: project.companyId,
        },
        orderBy: [{ createdAt: "desc" }],
        include: {
          projectFile: true,
          sourceEstimateVersion: {
            select: {
              id: true,
              sequenceNo: true,
              fileName: true,
              sourceType: true,
              importedAt: true,
              createdAt: true,
            },
          },
          restoredEstimateVersion: {
            select: {
              id: true,
              sequenceNo: true,
              fileName: true,
              sourceType: true,
              importedAt: true,
              createdAt: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              email: true,
            },
          },
          restoredBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    } catch (err: any) {
      if (this.isPetlArchiveTableMissingError(err)) {
        this.throwPetlArchiveTablesNotMigrated();
      }
      throw err;
    }
  }

  async getPetlArchiveForProject(projectId: string, archiveId: string, actor: AuthenticatedUser) {
    this.assertAdminOrAbove(actor);
    this.ensurePetlArchiveModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const archive = await this.prisma.projectPetlArchive.findFirst({
        where: {
          id: archiveId,
          projectId: project.id,
          companyId: project.companyId,
        },
        include: {
          projectFile: true,
          sourceEstimateVersion: {
            select: {
              id: true,
              sequenceNo: true,
              fileName: true,
              sourceType: true,
              defaultPayerType: true,
              importedAt: true,
              createdAt: true,
            },
          },
          restoredEstimateVersion: {
            select: {
              id: true,
              sequenceNo: true,
              fileName: true,
              sourceType: true,
              importedAt: true,
              createdAt: true,
            },
          },
        },
      });

      if (!archive) {
        throw new NotFoundException("PETL archive not found for this project");
      }

      return archive;
    } catch (err: any) {
      if (this.isPetlArchiveTableMissingError(err)) {
        this.throwPetlArchiveTablesNotMigrated();
      }
      throw err;
    }
  }

  async buildPetlArchiveBundle(projectId: string, actor: AuthenticatedUser): Promise<PetlArchiveBundleV1> {
    this.assertAdminOrAbove(actor);

    // Validate project access
    await this.getProjectByIdForUser(projectId, actor);

    const latestVersion = await this.getLatestEstimateVersionForPetl(projectId);
    if (!latestVersion) {
      throw new BadRequestException("No estimate version found for this project");
    }

    const sowItems = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      orderBy: { lineNo: "asc" },
      select: {
        id: true,
        rawRowId: true,
        logicalItemId: true,
        projectParticleId: true,
        lineNo: true,
        description: true,
        qty: true,
        originalQty: true,
        unit: true,
        unitCost: true,
        itemAmount: true,
        rcvAmount: true,
        acvAmount: true,
        depreciationAmount: true,
        salesTaxAmount: true,
        categoryCode: true,
        selectionCode: true,
        activity: true,
        materialAmount: true,
        equipmentAmount: true,
        payerType: true,
        performed: true,
        eligibleForAcvRefund: true,
        acvRefundAmount: true,
        percentComplete: true,
        isAcvOnly: true,
        qtyFlaggedIncorrect: true,
        qtyFieldReported: true,
        qtyFieldReportedByUserId: true,
        qtyFieldReportedAt: true,
        qtyFieldNotes: true,
        qtyReviewStatus: true,
      },
    });

    if (sowItems.length === 0) {
      throw new BadRequestException("No PETL line items found for this project");
    }

    const logicalItemIds = Array.from(new Set(sowItems.map((s) => s.logicalItemId).filter(Boolean)));
    const rawRowIds = Array.from(new Set(sowItems.map((s) => s.rawRowId).filter(Boolean)));

    const [logicalItems, rawRows] = await Promise.all([
      this.prisma.sowLogicalItem.findMany({
        where: { id: { in: logicalItemIds } },
        select: {
          id: true,
          projectParticleId: true,
          signatureHash: true,
        },
      }),
      this.prisma.rawXactRow.findMany({
        where: { id: { in: rawRowIds } },
        select: {
          id: true,
          lineNo: true,
          groupCode: true,
          groupDescription: true,
          desc: true,
          age: true,
          condition: true,
          qty: true,
          itemAmount: true,
          reportedCost: true,
          unitCost: true,
          unit: true,
          coverage: true,
          activity: true,
          workersWage: true,
          laborBurden: true,
          laborOverhead: true,
          material: true,
          equipment: true,
          marketConditions: true,
          laborMinimum: true,
          salesTax: true,
          rcv: true,
          life: true,
          depreciationType: true,
          depreciationAmount: true,
          recoverable: true,
          acv: true,
          tax: true,
          replaceFlag: true,
          cat: true,
          sel: true,
          owner: true,
          originalVendor: true,
          sourceName: true,
          sourceDate: true,
          note1: true,
          adjSource: true,
          rawRowJson: true,
        },
      }),
    ]);

    const logicalById = new Map(logicalItems.map((l) => [l.id, l]));
    const rawById = new Map(rawRows.map((r) => [r.id, r]));

    const items = sowItems.map((s) => {
      const logical = logicalById.get(s.logicalItemId);
      const raw = rawById.get(s.rawRowId);
      if (!logical) {
        throw new BadRequestException(
          `PETL archive build failed: missing SowLogicalItem ${s.logicalItemId} for line #${s.lineNo}`,
        );
      }
      if (!raw) {
        throw new BadRequestException(
          `PETL archive build failed: missing RawXactRow ${s.rawRowId} for line #${s.lineNo}`,
        );
      }

      return {
        lineNo: s.lineNo,
        projectParticleId: s.projectParticleId,
        logicalItem: {
          signatureHash: logical.signatureHash,
          projectParticleId: logical.projectParticleId,
        },
        rawRow: {
          lineNo: raw.lineNo,
          groupCode: raw.groupCode ?? null,
          groupDescription: raw.groupDescription ?? null,
          desc: raw.desc ?? null,
          age: raw.age ?? null,
          condition: raw.condition ?? null,
          qty: raw.qty ?? null,
          itemAmount: raw.itemAmount ?? null,
          reportedCost: raw.reportedCost ?? null,
          unitCost: raw.unitCost ?? null,
          unit: raw.unit ?? null,
          coverage: raw.coverage ?? null,
          activity: raw.activity ?? null,
          workersWage: raw.workersWage ?? null,
          laborBurden: raw.laborBurden ?? null,
          laborOverhead: raw.laborOverhead ?? null,
          material: raw.material ?? null,
          equipment: raw.equipment ?? null,
          marketConditions: raw.marketConditions ?? null,
          laborMinimum: raw.laborMinimum ?? null,
          salesTax: raw.salesTax ?? null,
          rcv: raw.rcv ?? null,
          life: raw.life ?? null,
          depreciationType: raw.depreciationType ?? null,
          depreciationAmount: raw.depreciationAmount ?? null,
          recoverable: raw.recoverable ?? null,
          acv: raw.acv ?? null,
          tax: raw.tax ?? null,
          replaceFlag: raw.replaceFlag ?? null,
          cat: raw.cat ?? null,
          sel: raw.sel ?? null,
          owner: raw.owner ?? null,
          originalVendor: raw.originalVendor ?? null,
          sourceName: raw.sourceName ?? null,
          sourceDate: raw.sourceDate ? raw.sourceDate.toISOString() : null,
          note1: raw.note1 ?? null,
          adjSource: raw.adjSource ?? null,
          rawRowJson: raw.rawRowJson ?? null,
        },
        sowItem: {
          description: s.description,
          qty: s.qty ?? null,
          originalQty: s.originalQty ?? null,
          unit: s.unit ?? null,
          unitCost: s.unitCost ?? null,
          itemAmount: s.itemAmount ?? null,
          rcvAmount: s.rcvAmount ?? null,
          acvAmount: s.acvAmount ?? null,
          depreciationAmount: s.depreciationAmount ?? null,
          salesTaxAmount: s.salesTaxAmount ?? null,
          categoryCode: s.categoryCode ?? null,
          selectionCode: s.selectionCode ?? null,
          activity: s.activity ?? null,
          materialAmount: s.materialAmount ?? null,
          equipmentAmount: s.equipmentAmount ?? null,
          payerType: s.payerType,
          performed: s.performed,
          eligibleForAcvRefund: s.eligibleForAcvRefund,
          acvRefundAmount: s.acvRefundAmount ?? null,
          percentComplete: s.percentComplete ?? 0,
          isAcvOnly: s.isAcvOnly,
          qtyFlaggedIncorrect: s.qtyFlaggedIncorrect,
          qtyFieldReported: s.qtyFieldReported ?? null,
          qtyFieldReportedByUserId: s.qtyFieldReportedByUserId ?? null,
          qtyFieldReportedAt: s.qtyFieldReportedAt ? s.qtyFieldReportedAt.toISOString() : null,
          qtyFieldNotes: s.qtyFieldNotes ?? null,
          qtyReviewStatus: s.qtyReviewStatus ?? null,
        },
      };
    });

    const sowLineNoById = new Map<string, number>();
    for (const s of sowItems) {
      sowLineNoById.set(s.id, s.lineNo);
    }

    let reconEntriesRaw: any[] = [];
    try {
      reconEntriesRaw = await this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
        },
        orderBy: { createdAt: "asc" },
        select: {
          parentSowItemId: true,
          projectParticleId: true,
          kind: true,
          tag: true,
          description: true,
          categoryCode: true,
          selectionCode: true,
          unit: true,
          qty: true,
          unitCost: true,
          itemAmount: true,
          salesTaxAmount: true,
          opAmount: true,
          rcvAmount: true,
          rcvComponentsJson: true,
          percentComplete: true,
          isPercentCompleteLocked: true,
          companyPriceListItemId: true,
          sourceSnapshotJson: true,
          note: true,
        },
      });
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationEntry")) {
        throw err;
      }
      // If reconciliation tables don't exist in an environment, we still allow
      // exporting the base PETL rows.
      reconEntriesRaw = [];
    }

    const reconciliationEntries = reconEntriesRaw.map((e) => {
      const parentPetlLineNo = e.parentSowItemId ? (sowLineNoById.get(e.parentSowItemId) ?? null) : null;
      return {
        parentPetlLineNo,
        projectParticleId: e.projectParticleId,
        kind: e.kind,
        tag: e.tag ?? null,
        description: e.description ?? null,
        categoryCode: e.categoryCode ?? null,
        selectionCode: e.selectionCode ?? null,
        unit: e.unit ?? null,
        qty: e.qty ?? null,
        unitCost: e.unitCost ?? null,
        itemAmount: e.itemAmount ?? null,
        salesTaxAmount: e.salesTaxAmount ?? null,
        opAmount: e.opAmount ?? null,
        rcvAmount: e.rcvAmount ?? null,
        rcvComponentsJson: e.rcvComponentsJson ?? null,
        percentComplete: e.percentComplete ?? 0,
        isPercentCompleteLocked: e.isPercentCompleteLocked ?? false,
        companyPriceListItemId: e.companyPriceListItemId ?? null,
        sourceSnapshotJson: e.sourceSnapshotJson ?? null,
        note: e.note ?? null,
      };
    });

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      companyId: actor.companyId,
      projectId,
      sourceEstimateVersion: {
        id: latestVersion.id,
        sequenceNo: latestVersion.sequenceNo,
        sourceType: latestVersion.sourceType,
        fileName: latestVersion.fileName,
        storedPath: latestVersion.storedPath,
        estimateKind: latestVersion.estimateKind,
        defaultPayerType: latestVersion.defaultPayerType,
        description: latestVersion.description ?? null,
        status: latestVersion.status,
        importedAt: latestVersion.importedAt ? latestVersion.importedAt.toISOString() : null,
        createdAt: latestVersion.createdAt.toISOString(),
      },
      items,
      reconciliationEntries,
    };
  }

  async createPetlArchiveRecord(args: {
    projectId: string;
    actor: AuthenticatedUser;
    projectFileId: string;
    sourceEstimateVersionId: string;
    label?: string | null;
    note?: string | null;
  }) {
    this.assertAdminOrAbove(args.actor);
    this.ensurePetlArchiveModelsAvailable();

    const project = await this.getProjectByIdForUser(args.projectId, args.actor);

    // Ensure the file + estimate version belong to this project.
    const [file, version] = await Promise.all([
      this.prisma.projectFile.findFirst({
        where: {
          id: args.projectFileId,
          projectId: project.id,
          companyId: project.companyId,
        },
        select: { id: true, fileName: true },
      }),
      this.prisma.estimateVersion.findFirst({
        where: {
          id: args.sourceEstimateVersionId,
          projectId: project.id,
        },
        select: { id: true, sequenceNo: true },
      }),
    ]);

    if (!file) {
      throw new BadRequestException("projectFileId does not exist for this project");
    }
    if (!version) {
      throw new BadRequestException("sourceEstimateVersionId does not exist for this project");
    }

    try {
      const created = await this.prisma.projectPetlArchive.create({
        data: {
          companyId: project.companyId,
          projectId: project.id,
          projectFileId: file.id,
          sourceEstimateVersionId: version.id,
          label: args.label ?? null,
          note: args.note ?? null,
          createdByUserId: args.actor.userId,
        },
        include: {
          projectFile: true,
          sourceEstimateVersion: {
            select: {
              id: true,
              sequenceNo: true,
              fileName: true,
              sourceType: true,
              importedAt: true,
              createdAt: true,
            },
          },
          restoredEstimateVersion: {
            select: {
              id: true,
              sequenceNo: true,
              fileName: true,
              sourceType: true,
              importedAt: true,
              createdAt: true,
            },
          },
          createdBy: { select: { id: true, email: true } },
          restoredBy: { select: { id: true, email: true } },
        },
      });

      await this.audit.log(args.actor, "PROJECT_PETL_ARCHIVE_CREATED", {
        companyId: project.companyId,
        projectId: project.id,
        metadata: {
          archiveId: created.id,
          projectFileId: created.projectFileId,
          sourceEstimateVersionId: created.sourceEstimateVersionId,
          label: created.label,
        },
      });

      return created;
    } catch (err: any) {
      if (this.isPetlArchiveTableMissingError(err)) {
        this.throwPetlArchiveTablesNotMigrated();
      }
      throw err;
    }
  }

  async restorePetlArchiveFromBundle(args: {
    projectId: string;
    actor: AuthenticatedUser;
    archiveId: string;
    bundle: any;
  }) {
    this.assertAdminOrAbove(args.actor);
    this.ensurePetlArchiveModelsAvailable();

    const project = await this.getProjectByIdForUser(args.projectId, args.actor);

    const archive = await this.getPetlArchiveForProject(args.projectId, args.archiveId, args.actor);

    const bundle = args.bundle as Partial<PetlArchiveBundleV1>;

    if (bundle.schemaVersion !== 1) {
      throw new BadRequestException("Unsupported PETL archive schemaVersion");
    }
    if (bundle.projectId !== project.id) {
      throw new BadRequestException("Archive bundle projectId does not match this project");
    }
    if (bundle.companyId !== project.companyId) {
      throw new BadRequestException("Archive bundle companyId does not match this company");
    }

    const items = Array.isArray(bundle.items) ? bundle.items : [];
    if (items.length === 0) {
      throw new BadRequestException("Archive bundle has no PETL items");
    }

    const now = new Date();

    let restoredEstimateVersionId: string | null = null;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const maxAgg = await tx.estimateVersion.aggregate({
            where: { projectId: project.id },
            _max: { sequenceNo: true },
          });
          const nextSequenceNo = (maxAgg._max.sequenceNo ?? 0) + 1;

          const sourceMeta = bundle.sourceEstimateVersion;
          const defaultPayerType = String(sourceMeta?.defaultPayerType ?? "").trim() || "Insurance";

          const fileName = `PETL Archive Restore ${archive.id} (${now.toISOString().slice(0, 10)})`;

          const newVersion = await tx.estimateVersion.create({
            data: {
              projectId: project.id,
              sourceType: "petl_archive",
              fileName,
              storedPath: archive.projectFile?.storageUrl ?? "(archive)",
              estimateKind: "petl_archive",
              sequenceNo: nextSequenceNo,
              defaultPayerType,
              description: archive.label ?? null,
              status: "completed",
              importedByUserId: args.actor.userId,
              importedAt: now,
            },
          });

          restoredEstimateVersionId = newVersion.id;

          const sow = await tx.sow.create({
            data: {
              projectId: project.id,
              estimateVersionId: newVersion.id,
              sourceType: "petl_archive",
              totalAmount: null,
            },
            select: { id: true },
          });

          // 1) Raw rows (use PETL lineNo as RawXactRow.lineNo to keep deterministic mapping)
          await tx.rawXactRow.createMany({
            data: items.map((it) => {
              const rr: any = it.rawRow ?? {};
              const lineNo = Number(it.lineNo);
              const baseRawRowJson =
                rr.rawRowJson &&
                typeof rr.rawRowJson === "object" &&
                !Array.isArray(rr.rawRowJson)
                  ? rr.rawRowJson
                  : {};

              const rawRowJson = {
                ...baseRawRowJson,
                petlArchive: {
                  sourceRawLineNo: rr.lineNo ?? null,
                  archivedAt: bundle.exportedAt ?? null,
                },
              };

              return {
                estimateVersionId: newVersion.id,
                lineNo,
                groupCode: rr.groupCode ?? null,
                groupDescription: rr.groupDescription ?? null,
                desc: rr.desc ?? null,
                age: rr.age ?? null,
                condition: rr.condition ?? null,
                qty: rr.qty ?? null,
                itemAmount: rr.itemAmount ?? null,
                reportedCost: rr.reportedCost ?? null,
                unitCost: rr.unitCost ?? null,
                unit: rr.unit ?? null,
                coverage: rr.coverage ?? null,
                activity: rr.activity ?? null,
                workersWage: rr.workersWage ?? null,
                laborBurden: rr.laborBurden ?? null,
                laborOverhead: rr.laborOverhead ?? null,
                material: rr.material ?? null,
                equipment: rr.equipment ?? null,
                marketConditions: rr.marketConditions ?? null,
                laborMinimum: rr.laborMinimum ?? null,
                salesTax: rr.salesTax ?? null,
                rcv: rr.rcv ?? null,
                life: rr.life ?? null,
                depreciationType: rr.depreciationType ?? null,
                depreciationAmount: rr.depreciationAmount ?? null,
                recoverable: rr.recoverable ?? null,
                acv: rr.acv ?? null,
                tax: rr.tax ?? null,
                replaceFlag: rr.replaceFlag ?? null,
                cat: rr.cat ?? null,
                sel: rr.sel ?? null,
                owner: rr.owner ?? null,
                originalVendor: rr.originalVendor ?? null,
                sourceName: rr.sourceName ?? null,
                sourceDate: (() => {
                  if (!rr.sourceDate) return null;
                  const d = new Date(rr.sourceDate);
                  return Number.isNaN(d.getTime()) ? null : d;
                })(),
                note1: rr.note1 ?? null,
                adjSource: rr.adjSource ?? null,
                rawRowJson,
              };
            }),
          });

          const rawRowsCreated = await tx.rawXactRow.findMany({
            where: { estimateVersionId: newVersion.id },
            select: { id: true, lineNo: true },
          });
          const rawRowIdByLineNo = new Map<number, string>();
          for (const r of rawRowsCreated) {
            rawRowIdByLineNo.set(r.lineNo, r.id);
          }

          // 2) Logical items (re-use if already present)
          const wantedKeys = items.map((it) => {
            const sig = String((it as any)?.logicalItem?.signatureHash ?? "");
            const particleId = String((it as any)?.logicalItem?.projectParticleId ?? it.projectParticleId ?? "");
            return { sig, particleId };
          }).filter((k) => k.sig && k.particleId);

          const particleIds = Array.from(new Set(wantedKeys.map((k) => k.particleId)));
          const sigs = Array.from(new Set(wantedKeys.map((k) => k.sig)));

          const existingLogical = await tx.sowLogicalItem.findMany({
            where: {
              projectId: project.id,
              projectParticleId: { in: particleIds },
              signatureHash: { in: sigs },
            },
            select: { id: true, projectParticleId: true, signatureHash: true },
          });

          const logicalIdByKey = new Map<string, string>();
          for (const l of existingLogical) {
            logicalIdByKey.set(`${l.projectParticleId}|${l.signatureHash}`, l.id);
          }

          const missingLogical = wantedKeys.filter(
            (k) => !logicalIdByKey.has(`${k.particleId}|${k.sig}`),
          );

          if (missingLogical.length) {
            await tx.sowLogicalItem.createMany({
              data: missingLogical.map((k) => ({
                projectId: project.id,
                projectParticleId: k.particleId,
                signatureHash: k.sig,
              })),
            });

            const createdLogical = await tx.sowLogicalItem.findMany({
              where: {
                projectId: project.id,
                projectParticleId: { in: missingLogical.map((k) => k.particleId) },
                signatureHash: { in: missingLogical.map((k) => k.sig) },
              },
              select: { id: true, projectParticleId: true, signatureHash: true },
            });

            for (const l of createdLogical) {
              logicalIdByKey.set(`${l.projectParticleId}|${l.signatureHash}`, l.id);
            }
          }

          // 3) Sow items
          await tx.sowItem.createMany({
            data: items.map((it) => {
              const lineNo = Number(it.lineNo);
              const rawRowId = rawRowIdByLineNo.get(lineNo);
              if (!rawRowId) {
                throw new BadRequestException(
                  `Restore failed: missing raw row for PETL line #${lineNo}`,
                );
              }

              const li = (it as any).logicalItem ?? {};
              const sig = String(li.signatureHash ?? "");
              const particleId = String(li.projectParticleId ?? it.projectParticleId ?? "");
              const logicalId = logicalIdByKey.get(`${particleId}|${sig}`);
              if (!logicalId) {
                throw new BadRequestException(
                  `Restore failed: missing logical item for PETL line #${lineNo}`,
                );
              }

              const si: any = it.sowItem ?? {};

              return {
                sowId: sow.id,
                estimateVersionId: newVersion.id,
                rawRowId,
                logicalItemId: logicalId,
                projectParticleId: String(it.projectParticleId),
                lineNo,
                description: String(si.description ?? "").trim() || "(missing description)",
                qty: si.qty ?? null,
                originalQty: si.originalQty ?? null,
                unit: si.unit ?? null,
                unitCost: si.unitCost ?? null,
                itemAmount: si.itemAmount ?? null,
                rcvAmount: si.rcvAmount ?? null,
                acvAmount: si.acvAmount ?? null,
                depreciationAmount: si.depreciationAmount ?? null,
                salesTaxAmount: si.salesTaxAmount ?? null,
                categoryCode: si.categoryCode ?? null,
                selectionCode: si.selectionCode ?? null,
                activity: si.activity ?? null,
                materialAmount: si.materialAmount ?? null,
                equipmentAmount: si.equipmentAmount ?? null,
                payerType: String(si.payerType ?? "").trim() || defaultPayerType,
                performed: si.performed ?? false,
                eligibleForAcvRefund: si.eligibleForAcvRefund ?? false,
                acvRefundAmount: si.acvRefundAmount ?? null,
                percentComplete: si.percentComplete ?? 0,
                isAcvOnly: si.isAcvOnly ?? false,
                qtyFlaggedIncorrect: si.qtyFlaggedIncorrect ?? false,
                qtyFieldReported: si.qtyFieldReported ?? null,
                qtyFieldReportedByUserId: si.qtyFieldReportedByUserId ?? null,
                qtyFieldReportedAt: (() => {
                  if (!si.qtyFieldReportedAt) return null;
                  const d = new Date(si.qtyFieldReportedAt);
                  return Number.isNaN(d.getTime()) ? null : d;
                })(),
                qtyFieldNotes: si.qtyFieldNotes ?? null,
                qtyReviewStatus: si.qtyReviewStatus ?? null,
              };
            }),
          });

          const sowItemsCreated = await tx.sowItem.findMany({
            where: { estimateVersionId: newVersion.id },
            select: {
              id: true,
              lineNo: true,
              logicalItemId: true,
              projectParticleId: true,
            },
          });

          const sowItemByLineNo = new Map<number, { id: string; logicalItemId: string; projectParticleId: string }>();
          for (const s of sowItemsCreated) {
            sowItemByLineNo.set(s.lineNo, {
              id: s.id,
              logicalItemId: s.logicalItemId,
              projectParticleId: s.projectParticleId,
            });
          }

          // 4) Reconciliation cases + entries (optional)
          const reconEntries = Array.isArray(bundle.reconciliationEntries)
            ? bundle.reconciliationEntries
            : [];

          if (reconEntries.length > 0) {
            const caseIdByLogicalItemId = new Map<string, string>();

            for (const sowItem of sowItemsCreated) {
              const logicalItemId = sowItem.logicalItemId;

              const existing = await tx.petlReconciliationCase.findFirst({
                where: {
                  projectId: project.id,
                  logicalItemId,
                },
                select: { id: true },
              });

              if (existing) {
                const updated = await tx.petlReconciliationCase.update({
                  where: { id: existing.id },
                  data: {
                    estimateVersionId: newVersion.id,
                    sowItemId: sowItem.id,
                    status: PetlReconciliationCaseStatus.OPEN,
                  },
                });
                caseIdByLogicalItemId.set(logicalItemId, updated.id);
              } else {
                const created = await tx.petlReconciliationCase.create({
                  data: {
                    projectId: project.id,
                    estimateVersionId: newVersion.id,
                    sowItemId: sowItem.id,
                    logicalItemId,
                    status: PetlReconciliationCaseStatus.OPEN,
                    createdByUserId: args.actor.userId,
                  },
                  select: { id: true },
                });
                caseIdByLogicalItemId.set(logicalItemId, created.id);
              }
            }

            const reconCreateData: any[] = [];

            for (const e of reconEntries) {
              const parentLineNo = typeof e.parentPetlLineNo === "number" ? e.parentPetlLineNo : null;
              if (parentLineNo == null) {
                // Entries without a parent line are not currently supported.
                continue;
              }

              const parent = sowItemByLineNo.get(parentLineNo);
              if (!parent) {
                throw new BadRequestException(
                  `Restore failed: reconciliation entry references missing PETL line #${parentLineNo}`,
                );
              }

              const caseId = caseIdByLogicalItemId.get(parent.logicalItemId);
              if (!caseId) {
                throw new BadRequestException(
                  `Restore failed: missing reconciliation case for PETL line #${parentLineNo}`,
                );
              }

              const kindRaw = String(e.kind ?? "").trim();
              if (!(Object.values(PetlReconciliationEntryKind) as string[]).includes(kindRaw)) {
                throw new BadRequestException(`Invalid reconciliation entry kind '${kindRaw}' in archive`);
              }

              const tagRaw = e.tag == null ? null : String(e.tag).trim();
              if (tagRaw && !(Object.values(PetlReconciliationEntryTag) as string[]).includes(tagRaw)) {
                throw new BadRequestException(`Invalid reconciliation entry tag '${tagRaw}' in archive`);
              }

              reconCreateData.push({
                projectId: project.id,
                estimateVersionId: newVersion.id,
                caseId,
                parentSowItemId: parent.id,
                projectParticleId: String(e.projectParticleId ?? parent.projectParticleId),
                kind: kindRaw,
                tag: tagRaw,
                description: e.description ?? null,
                categoryCode: e.categoryCode ?? null,
                selectionCode: e.selectionCode ?? null,
                unit: e.unit ?? null,
                qty: e.qty ?? null,
                unitCost: e.unitCost ?? null,
                itemAmount: e.itemAmount ?? null,
                salesTaxAmount: e.salesTaxAmount ?? null,
                opAmount: e.opAmount ?? null,
                rcvAmount: e.rcvAmount ?? null,
                rcvComponentsJson: e.rcvComponentsJson ?? null,
                percentComplete: e.percentComplete ?? 0,
                isPercentCompleteLocked: e.isPercentCompleteLocked ?? false,
                companyPriceListItemId: e.companyPriceListItemId ?? null,
                sourceSnapshotJson: e.sourceSnapshotJson ?? null,
                note: e.note ?? null,
                createdByUserId: args.actor.userId,
              });
            }

            if (reconCreateData.length) {
              await tx.petlReconciliationEntry.createMany({ data: reconCreateData });
            }
          }

          await tx.projectPetlArchive.update({
            where: { id: archive.id },
            data: {
              restoredEstimateVersionId: newVersion.id,
              restoredByUserId: args.actor.userId,
              restoredAt: now,
            },
          });
        },
        { timeout: 600_000, maxWait: 60_000 },
      );
    } catch (err: any) {
      if (
        this.isPetlArchiveTableMissingError(err) ||
        this.isMissingPrismaTableError(err, "PetlReconciliationCase") ||
        this.isMissingPrismaTableError(err, "PetlReconciliationEntry")
      ) {
        // Make missing migration errors actionable.
        throw new BadRequestException(
          "Required PETL archive/reconciliation tables are not present in the database yet. Run `npm -w packages/database run prisma:migrate` and restart the API.",
        );
      }
      throw err;
    }

    await this.audit.log(args.actor, "PROJECT_PETL_ARCHIVE_RESTORED", {
      companyId: project.companyId,
      projectId: project.id,
      metadata: {
        archiveId: archive.id,
        restoredEstimateVersionId,
      },
    });

    return {
      status: "restored",
      archiveId: archive.id,
      restoredEstimateVersionId,
    };
  }

  async deletePetlLineItemForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
  ) {
    this.assertAdminOrAbove(actor);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const sowItem = await this.prisma.sowItem.findFirst({
      where: {
        id: sowItemId,
        sow: {
          projectId,
        },
      },
      select: {
        id: true,
        lineNo: true,
        estimateVersionId: true,
        logicalItemId: true,
      },
    });

    if (!sowItem) {
      throw new NotFoundException("PETL line item not found for this project");
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Null out references (daily logs + asset usages) to avoid FK issues.
        const [dailyLogsUpdated, assetUsagesUpdated] = await Promise.all([
          tx.dailyLog.updateMany({
            where: { projectId, sowItemId: sowItem.id },
            data: { sowItemId: null },
          }),
          tx.assetUsage.updateMany({
            where: { projectId, sowItemId: sowItem.id },
            data: { sowItemId: null },
          }),
        ]);

      // Remove reconciliations for this line item (best effort if tables exist).
      let reconCasesDeleted = 0;
      try {
        const deleted = await tx.petlReconciliationCase.deleteMany({
          where: {
            projectId,
            OR: [
              { sowItemId: sowItem.id },
              // logicalItemId is required on SowItem, but keep this defensive anyway.
              ...(sowItem.logicalItemId ? [{ logicalItemId: sowItem.logicalItemId }] : []),
            ],
          },
        });
        reconCasesDeleted = deleted.count;
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "PetlReconciliationCase")) {
          throw err;
        }
      }

      // Delete any edit logs for this PETL line.
      const petlEditChangesDeleted = await tx.petlEditChange.deleteMany({
        where: { sowItemId: sowItem.id },
      });

      // Delete percent update records that target this sow item.
      // (Sessions are left intact; they may include other updates.)
      const petlPercentUpdatesDeleted = await tx.petlPercentUpdate.deleteMany({
        where: { sowItemId: sowItem.id },
      });

      // Remove component allocations for this sow item.
      const allocationsDeleted = await tx.sowComponentAllocation.deleteMany({
        where: { sowItemId: sowItem.id },
      });

      // Finally, delete the sow item.
      await tx.sowItem.delete({ where: { id: sowItem.id } });

        return {
          sowItemId: sowItem.id,
          lineNo: sowItem.lineNo,
          estimateVersionId: sowItem.estimateVersionId,
          dailyLogsUpdated: dailyLogsUpdated.count,
          assetUsagesUpdated: assetUsagesUpdated.count,
          reconCasesDeleted,
          petlEditChangesDeleted: petlEditChangesDeleted.count,
          petlPercentUpdatesDeleted: petlPercentUpdatesDeleted.count,
          allocationsDeleted: allocationsDeleted.count,
        };
      },
      // Deleting a line can still touch many related rows (allocations, logs);
      // extend the interactive transaction timeout to avoid premature aborts.
      { timeout: 600_000, maxWait: 60_000 },
    );

    await this.audit.log(actor, "PROJECT_PETL_LINE_ITEM_DELETED", {
      companyId,
      projectId,
      metadata: result,
    });

    return { status: "deleted", ...result };
  }

  async deletePetlAndComponentsForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertAdminOrAbove(actor);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const estimateVersions = await this.prisma.estimateVersion.findMany({
      where: { projectId },
      select: { id: true },
    });

    const estimateVersionIds = estimateVersions.map((v) => v.id);

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Detach any references that would prevent deleting sow items.
        const [dailyLogsUpdated, assetUsagesUpdated] = await Promise.all([
          tx.dailyLog.updateMany({
            where: { projectId, sowItemId: { not: null } },
            data: { sowItemId: null },
          }),
          tx.assetUsage.updateMany({
            where: { projectId, sowItemId: { not: null } },
            data: { sowItemId: null },
          }),
        ]);

      // If tenant price update logs point at these estimate versions, detach them so the
      // estimate versions can be removed.
      const tenantPriceLogsDetached = await tx.tenantPriceUpdateLog.updateMany({
        where: {
          projectId,
          estimateVersionId: { in: estimateVersionIds },
        },
        data: { estimateVersionId: null },
      });

      // PETL percent update sessions
      const percentSessionsDeleted = await tx.petlPercentUpdateSession.deleteMany({
        where: { projectId },
      });

      // PETL reconciliation cases (cascade deletes entries/events)
      let reconCasesDeleted = 0;
      try {
        const deleted = await tx.petlReconciliationCase.deleteMany({ where: { projectId } });
        reconCasesDeleted = deleted.count;
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "PetlReconciliationCase")) {
          throw err;
        }
      }

      // PETL edit sessions (delete changes first)
      const petlEditChangesDeleted = await tx.petlEditChange.deleteMany({
        where: { session: { projectId } },
      });

      const petlEditSessionsDeleted = await tx.petlEditSession.deleteMany({
        where: { projectId },
      });

      // Allocations -> components -> items -> raw -> versions
      const allocationsDeleted = await tx.sowComponentAllocation.deleteMany({ where: { projectId } });
      const componentsDeleted = await tx.componentSummary.deleteMany({ where: { projectId } });
      const allocationRulesDeleted = await tx.componentAllocationRule.deleteMany({ where: { projectId } });

      const sowItemsDeleted = estimateVersionIds.length
        ? await tx.sowItem.deleteMany({ where: { estimateVersionId: { in: estimateVersionIds } } })
        : { count: 0 };

      const sowsDeleted = estimateVersionIds.length
        ? await tx.sow.deleteMany({ where: { estimateVersionId: { in: estimateVersionIds } } })
        : { count: 0 };

      const logicalItemsDeleted = await tx.sowLogicalItem.deleteMany({ where: { projectId } });

      const rawRowsDeleted = estimateVersionIds.length
        ? await tx.rawXactRow.deleteMany({ where: { estimateVersionId: { in: estimateVersionIds } } })
        : { count: 0 };

      const rawComponentRowsDeleted = estimateVersionIds.length
        ? await tx.rawComponentRow.deleteMany({ where: { estimateVersionId: { in: estimateVersionIds } } })
        : { count: 0 };

      const estimateVersionsDeleted = await tx.estimateVersion.deleteMany({
        where: { projectId },
      });

        return {
          estimateVersionIds,
          dailyLogsUpdated: dailyLogsUpdated.count,
          assetUsagesUpdated: assetUsagesUpdated.count,
          tenantPriceLogsDetached: tenantPriceLogsDetached.count,
          percentSessionsDeleted: percentSessionsDeleted.count,
          reconCasesDeleted,
          petlEditChangesDeleted: petlEditChangesDeleted.count,
          petlEditSessionsDeleted: petlEditSessionsDeleted.count,
          allocationsDeleted: allocationsDeleted.count,
          componentsDeleted: componentsDeleted.count,
          allocationRulesDeleted: allocationRulesDeleted.count,
          sowItemsDeleted: sowItemsDeleted.count,
          sowsDeleted: sowsDeleted.count,
          logicalItemsDeleted: logicalItemsDeleted.count,
          rawRowsDeleted: rawRowsDeleted.count,
          rawComponentRowsDeleted: rawComponentRowsDeleted.count,
          estimateVersionsDeleted: estimateVersionsDeleted.count,
        };
      },
      // Wiping a project can delete millions of rows (allocations, raw rows).
      // Prisma's default interactive transaction timeout is too low for this.
      { timeout: 600_000, maxWait: 60_000 },
    );

    await this.audit.log(actor, "PROJECT_PETL_AND_COMPONENTS_DELETED", {
      companyId,
      projectId,
      metadata: result,
    });

    return { status: "deleted", ...result };
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
    body: { kind?: string; tag?: string | null; note?: string | null },
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

    const tag = (() => {
      if (body.tag == null || String(body.tag).trim() === "") return null;
      const raw = String(body.tag).trim();
      if ((Object.values(PetlReconciliationEntryTag) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryTag;
      }
      throw new BadRequestException("Invalid reconciliation entry tag");
    })();

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind,
        tag,
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
        percentComplete: true,
        isAcvOnly: true,
        rawRow: {
          select: {
            lineNo: true,
          },
        },
      },
    });

    // We support two possible meanings of the reconcile CSV "#" column:
    // 1) PETL-managed sequential lineNo (1..N)
    // 2) Raw Xactimate line number (RawXactRow.lineNo), which can be non-sequential and larger than N
    const byPetlLineNo = new Map<number, (typeof sowItems)[number]>();
    const byXactLineNo = new Map<number, (typeof sowItems)[number]>();

    for (const it of sowItems) {
      if (!byPetlLineNo.has(it.lineNo)) byPetlLineNo.set(it.lineNo, it);
      const xactLineNo = it.rawRow?.lineNo;
      if (typeof xactLineNo === "number" && xactLineNo > 0 && !byXactLineNo.has(xactLineNo)) {
        byXactLineNo.set(xactLineNo, it);
      }
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

    const parsePercentLoose = (value: any): number | null => {
      if (value == null) return null;
      const raw = String(value).trim();
      if (!raw) return null;

      const hasPercent = raw.includes("%") || raw.toLowerCase().includes("percent");
      const normalized = raw.replace(/%/g, "").replace(/,/g, "").trim();
      const n = Number(normalized);
      if (!Number.isFinite(n)) return null;

      // If input is a fraction (0-1) and wasn't explicitly a percent, treat it as fraction.
      const pct = !hasPercent && n > 0 && n <= 1 ? n * 100 : n;
      if (!Number.isFinite(pct)) return null;

      return Math.max(0, Math.min(100, pct));
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

    // Reconciliation tables may not exist in some environments if the migration
    // hasn't been applied yet. In that case, we still want to update % complete,
    // but we must skip note/case/entry creation to avoid 500s.
    let reconTablesAvailable = true;

    // Preload existing imported-style placeholders so we don't duplicate notes.
    let existing: { parentSowItemId: string | null; kind: PetlReconciliationEntryKind; note: string | null }[] = [];
    try {
      // Touch both Entry + Case tables up front.
      await this.prisma.petlReconciliationCase.findFirst({
        where: { projectId },
        select: { id: true },
      });

      existing = await this.prisma.petlReconciliationEntry.findMany({
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
    } catch (err: any) {
      if (
        this.isMissingPrismaTableError(err, "PetlReconciliationEntry") ||
        this.isMissingPrismaTableError(err, "PetlReconciliationCase")
      ) {
        reconTablesAvailable = false;
        existing = [];
      } else {
        throw err;
      }
    }

    const existingKey = new Set<string>();
    for (const e of existing) {
      if (!e.parentSowItemId) continue;
      const k = `${e.parentSowItemId}::${e.kind}::${e.note ?? ""}`;
      existingKey.add(k);
    }

    const caseCache = new Map<string, { id: string }>();

    // Track percent complete updates keyed by SowItem.id
    const percentBySowItemId = new Map<string, number>();

    let totalCsvDetailRows = 0;
    let matched = 0;
    let missing = 0;
    let mismatchMeta = 0;
    let percentSeen = 0;
    let percentInvalid = 0;
    let percentApplied = 0;
    let percentNoop = 0;
    let createdCases = 0;
    let createdEntries = 0;
    let skippedExisting = 0;

    // First pass: collect detail rows so we can detect what the CSV "#" column represents.
    const detailRows: Array<{ lineNo: number; rec: Record<string, any> }> = [];
    let maxCsvLineNo = 0;

    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const row = rows[i] as any[];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rec: Record<string, any> = {};
      for (let j = 0; j < header.length; j += 1) {
        rec[header[j] ?? String(j)] = row[j];
      }

      const lineNo = parseIntLoose(rec["#"]);
      if (lineNo == null) continue;

      detailRows.push({ lineNo, rec });
      if (lineNo > maxCsvLineNo) maxCsvLineNo = lineNo;
    }

    // Heuristic: if the CSV references a line number larger than the PETL row count,
    // assume the "#" column is the Xactimate raw line number.
    const preferXactLineNo = maxCsvLineNo > sowItems.length;

    for (const row of detailRows) {
      const { lineNo, rec } = row;

      totalCsvDetailRows += 1;

      const sowItem = (
        preferXactLineNo
          ? byXactLineNo.get(lineNo) ?? byPetlLineNo.get(lineNo)
          : byPetlLineNo.get(lineNo) ?? byXactLineNo.get(lineNo)
      ) ?? null;

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

      // Percent complete updates
      const pctRaw = rec["% Complete"];
      const pct = parsePercentLoose(pctRaw);
      if (pctRaw != null && String(pctRaw).trim()) {
        if (pct == null) {
          percentInvalid += 1;
        } else {
          percentSeen += 1;
          percentBySowItemId.set(sowItem.id, pct);
        }
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

      // If we have no notes, we still might have a percent update; only skip when neither.
      if (notes.length === 0 && !percentBySowItemId.has(sowItem.id)) {
        continue;
      }

      // If reconciliation tables are not available, skip note creation.
      if (!reconTablesAvailable || notes.length === 0) {
        continue;
      }

      let theCase = caseCache.get(sowItem.id) ?? null;
      if (!theCase) {
        if (dryRun) {
          // We don't create cases in dry-run; just count notes.
          theCase = { id: "dry-run" };
        } else {
          let existingCase: { id: string } | null = null;
          try {
            existingCase = await this.prisma.petlReconciliationCase.findFirst({
              where: {
                projectId,
                OR: [{ sowItemId: sowItem.id }, { logicalItemId: sowItem.logicalItemId }],
              },
              select: { id: true },
            });
          } catch (err: any) {
            if (!this.isMissingPrismaTableError(err, "PetlReconciliationCase")) {
              throw err;
            }
            // If table is missing, we should have already set reconTablesAvailable=false
            existingCase = null;
          }

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

    // Apply percent complete updates (independent from reconciliation note tables).
    if (percentBySowItemId.size > 0) {
      const byId = new Map<string, (typeof sowItems)[number]>(sowItems.map((s) => [s.id, s]));
      const updates = Array.from(percentBySowItemId.entries());

      const toUpdate: Array<{ sowItemId: string; nextPct: number }> = [];

      for (const [sowItemId, nextPct] of updates) {
        const currentRow = byId.get(sowItemId);
        if (!currentRow) continue;

        const currentPct = Number(currentRow.percentComplete ?? 0);
        const needsUpdate = currentRow.isAcvOnly || Math.abs(currentPct - nextPct) > 0.0001;

        if (!needsUpdate) {
          percentNoop += 1;
          continue;
        }

        percentApplied += 1;
        toUpdate.push({ sowItemId, nextPct });
      }

      // IMPORTANT: Avoid Prisma interactive transactions here.
      // In production, large reconcile imports can require hundreds/thousands of % updates, and
      // Prisma interactive transactions default to a 5s timeout (P2028).
      if (!dryRun && toUpdate.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < toUpdate.length; i += chunkSize) {
          const chunk = toUpdate.slice(i, i + chunkSize);
          await this.prisma.$transaction(
            chunk.map(({ sowItemId, nextPct }) =>
              this.prisma.sowItem.update({
                where: { id: sowItemId },
                data: {
                  percentComplete: nextPct,
                  isAcvOnly: false,
                },
              }),
            ),
          );
        }
      }
    }

    return {
      projectId,
      estimateVersionId: latestVersion.id,
      reconciliationTablesAvailable: reconTablesAvailable,
      totalCsvDetailRows,
      matched,
      missing,
      mismatchMeta,
      percentSeen,
      percentInvalid,
      percentApplied,
      percentNoop,
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
      tag?: string | null;
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

    const tag = (() => {
      if (body.tag == null || String(body.tag).trim() === "") return null;
      const raw = String(body.tag).trim();
      if ((Object.values(PetlReconciliationEntryTag) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryTag;
      }
      throw new BadRequestException("Invalid reconciliation entry tag");
    })();

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind: PetlReconciliationEntryKind.CREDIT,
        tag,
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
      tag?: string | null;
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

    const tag = (() => {
      if (body.tag == null || String(body.tag).trim() === "") return null;
      const raw = String(body.tag).trim();
      if ((Object.values(PetlReconciliationEntryTag) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryTag;
      }
      throw new BadRequestException("Invalid reconciliation entry tag");
    })();

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind: PetlReconciliationEntryKind.ADD,
        tag,
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
      tag?: string | null;
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

    const tag = (() => {
      if (body.tag == null || String(body.tag).trim() === "") return null;
      const raw = String(body.tag).trim();
      if ((Object.values(PetlReconciliationEntryTag) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryTag;
      }
      throw new BadRequestException("Invalid reconciliation entry tag");
    })();

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind: PetlReconciliationEntryKind.ADD,
        tag,
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

  async replacePetlLineItemFromCostBook(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    body: {
      companyPriceListItemId: string;
      qty?: number | null;
      unitCostOverride?: number | null;
      tag?: string | null;
      note?: string | null;
    },
  ) {
    // Only PM/Owner/Admin can create GAAP-style revisions.
    const canCommit = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canCommit) {
      throw new ForbiddenException("Only PM/owner/admin can replace PETL line items");
    }

    // 1) Credit the original line item in full (zero out)
    const creditNote =
      body.note ??
      "GAAP replacement: credit original line item in full (field-reported discrepancy / revision).";

    await this.createPetlReconciliationCredit(projectId, companyId, actor, sowItemId, {
      note: creditNote,
      tag: body.tag ?? null,
      components: { itemAmount: true, salesTaxAmount: true, opAmount: true },
    });

    // 2) Add a replacement line item sourced from the tenant cost book
    const addNote =
      body.note ?? "GAAP replacement: add replacement line item from tenant cost book.";

    return this.createPetlReconciliationAddFromCostBook(projectId, companyId, actor, sowItemId, {
      companyPriceListItemId: body.companyPriceListItemId,
      qty: body.qty ?? null,
      unitCostOverride: body.unitCostOverride ?? null,
      tag: body.tag ?? null,
      note: addNote,
    });
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

    // Best effort: regenerate the current living invoice draft from PETL.
    await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);

    return { entry: updated, reconciliationCase: updated.case };
  }

  async updatePetlReconciliationEntry(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    entryId: string,
    body: {
      kind?: string | null;
      tag?: string | null;
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
      isPercentCompleteLocked?: boolean | null;
    },
  ) {
    await this.getProjectByIdForUser(projectId, actor);

    const entry = await this.prisma.petlReconciliationEntry.findUnique({
      where: { id: entryId },
      include: { case: true },
    });

    if (!entry || entry.projectId !== projectId) {
      throw new NotFoundException("Reconciliation entry not found for this project");
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

    const parseNumberOrNull = (value: any, fieldName: string): number | null => {
      if (value == null) return null;
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new BadRequestException(`${fieldName} must be a finite number`);
      }
      return n;
    };

    const kind = (() => {
      if (body.kind === undefined) return undefined;
      if (body.kind == null || String(body.kind).trim() === "") return null;
      const raw = String(body.kind).trim();
      if ((Object.values(PetlReconciliationEntryKind) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryKind;
      }
      throw new BadRequestException("Invalid reconciliation entry kind");
    })();

    const tag = (() => {
      if (body.tag === undefined) return undefined;
      if (body.tag == null || String(body.tag).trim() === "") return null;
      const raw = String(body.tag).trim();
      if ((Object.values(PetlReconciliationEntryTag) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryTag;
      }
      throw new BadRequestException("Invalid reconciliation entry tag");
    })();

    // Numbers
    const qty = body.qty === undefined ? undefined : parseNumberOrNull(body.qty, "qty");
    const unitCost =
      body.unitCost === undefined ? undefined : parseNumberOrNull(body.unitCost, "unitCost");
    const itemAmount =
      body.itemAmount === undefined
        ? undefined
        : parseNumberOrNull(body.itemAmount, "itemAmount");
    const salesTaxAmount =
      body.salesTaxAmount === undefined
        ? undefined
        : parseNumberOrNull(body.salesTaxAmount, "salesTaxAmount");
    const opAmount =
      body.opAmount === undefined ? undefined : parseNumberOrNull(body.opAmount, "opAmount");
    const rcvAmount =
      body.rcvAmount === undefined ? undefined : parseNumberOrNull(body.rcvAmount, "rcvAmount");

    // Derive amounts when needed.
    let nextQty = qty === undefined ? entry.qty : qty;
    let nextUnitCost = unitCost === undefined ? entry.unitCost : unitCost;
    let nextItemAmount = itemAmount === undefined ? entry.itemAmount : itemAmount;
    const nextSalesTaxAmount =
      salesTaxAmount === undefined ? entry.salesTaxAmount : salesTaxAmount;
    const nextOpAmount = opAmount === undefined ? entry.opAmount : opAmount;

    // If qty/unitCost changed and itemAmount wasn't explicitly set, recompute.
    if (itemAmount === undefined && (qty !== undefined || unitCost !== undefined)) {
      if (nextQty != null && nextUnitCost != null) {
        nextItemAmount = nextQty * nextUnitCost;
      }
    }

    let nextRcvAmount = rcvAmount === undefined ? entry.rcvAmount : rcvAmount;

    if (
      rcvAmount === undefined &&
      (nextItemAmount !== entry.itemAmount ||
        nextSalesTaxAmount !== entry.salesTaxAmount ||
        nextOpAmount !== entry.opAmount)
    ) {
      // If we have a financial entry, keep rcv in sync with its parts.
      // If it's a note-only entry with rcvAmount null, keep it null.
      if (entry.rcvAmount != null || nextItemAmount != null || nextSalesTaxAmount != null || nextOpAmount != null) {
        nextRcvAmount =
          (nextItemAmount ?? 0) + (nextSalesTaxAmount ?? 0) + (nextOpAmount ?? 0);
      }
    }

    // Normalize sign based on kind when possible.
    const nextKindForSign = kind === undefined ? entry.kind : kind ?? entry.kind;
    if (nextRcvAmount != null) {
      if (nextKindForSign === PetlReconciliationEntryKind.CREDIT) {
        nextRcvAmount = -Math.abs(nextRcvAmount);
      } else if (nextKindForSign === PetlReconciliationEntryKind.ADD) {
        nextRcvAmount = Math.abs(nextRcvAmount);
      }
    }

    const nextIsLocked =
      body.isPercentCompleteLocked === undefined
        ? undefined
        : !!body.isPercentCompleteLocked;

    const data: Prisma.PetlReconciliationEntryUpdateInput = {
      kind: kind === undefined ? undefined : kind ?? undefined,
      tag: tag === undefined ? undefined : tag,
      description:
        body.description === undefined
          ? undefined
          : cleanText(body.description, 2000),
      categoryCode:
        body.categoryCode === undefined ? undefined : cleanText(body.categoryCode, 50),
      selectionCode:
        body.selectionCode === undefined ? undefined : cleanText(body.selectionCode, 50),
      unit: body.unit === undefined ? undefined : cleanText(body.unit, 50),
      qty: qty === undefined ? undefined : nextQty,
      unitCost: unitCost === undefined ? undefined : nextUnitCost,
      itemAmount:
        itemAmount === undefined && qty === undefined && unitCost === undefined
          ? undefined
          : nextItemAmount,
      salesTaxAmount: salesTaxAmount === undefined ? undefined : nextSalesTaxAmount,
      opAmount: opAmount === undefined ? undefined : nextOpAmount,
      rcvAmount:
        rcvAmount === undefined &&
        itemAmount === undefined &&
        qty === undefined &&
        unitCost === undefined &&
        salesTaxAmount === undefined &&
        opAmount === undefined
          ? undefined
          : nextRcvAmount,
      rcvComponentsJson:
        itemAmount === undefined &&
        qty === undefined &&
        unitCost === undefined &&
        salesTaxAmount === undefined &&
        opAmount === undefined &&
        rcvAmount === undefined
          ? undefined
          : {
              itemAmount: nextItemAmount != null,
              salesTaxAmount: nextSalesTaxAmount != null,
              opAmount: nextOpAmount != null,
            },
      note: body.note === undefined ? undefined : cleanText(body.note, 5000),
      isPercentCompleteLocked: nextIsLocked === undefined ? undefined : nextIsLocked,
      events: {
        create: {
          projectId,
          estimateVersionId: entry.estimateVersionId,
          caseId: entry.caseId,
          eventType: "ENTRY_UPDATED",
          payloadJson: {
            kind: body.kind ?? undefined,
            tag: body.tag ?? undefined,
            description: body.description ?? undefined,
            categoryCode: body.categoryCode ?? undefined,
            selectionCode: body.selectionCode ?? undefined,
            unit: body.unit ?? undefined,
            qty: body.qty ?? undefined,
            unitCost: body.unitCost ?? undefined,
            itemAmount: body.itemAmount ?? undefined,
            salesTaxAmount: body.salesTaxAmount ?? undefined,
            opAmount: body.opAmount ?? undefined,
            rcvAmount: body.rcvAmount ?? undefined,
            note: body.note ?? undefined,
            isPercentCompleteLocked: body.isPercentCompleteLocked ?? undefined,
          },
          createdByUserId: actor.userId,
        },
      },
    };

    const updated = await this.prisma.petlReconciliationEntry.update({
      where: { id: entryId },
      data,
      include: {
        case: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    // Best effort: regenerate the current living invoice draft from PETL.
    await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);

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
    // Wrapper for single-row updates.
    return this.applyPetlPercentageEditsForProject(projectId, companyId, actor, {
      changes: [
        {
          sowItemId,
          newPercent,
          acvOnly: acvOnly ?? false,
        } as any,
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

    const canDirectlyCommit = await this.isProjectManagerOrAbove(projectId, actor);

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

      // Field/crew path: queue updates for approval.
      if (!canDirectlyCommit) {
        const sowItemIds = [...new Set(distinct.map((c) => c.sowItemId))];
        const sowItems = await this.prisma.sowItem.findMany({
          where: { id: { in: sowItemIds } },
          select: { id: true, estimateVersionId: true, percentComplete: true, sow: { select: { projectId: true } } },
        });

        const byId = new Map(sowItems.map((s) => [s.id, s]));
        const estimateVersionIds = Array.from(new Set(sowItems.map((s) => s.estimateVersionId)));

        if (estimateVersionIds.length !== 1) {
          throw new BadRequestException(
            "Pending percent updates must target a single estimate version; submit per version.",
          );
        }

        const estimateVersionId = estimateVersionIds[0];

        const created = await this.prisma.petlPercentUpdateSession.create({
          data: {
            projectId,
            estimateVersionId,
            createdByUserId: actor.userId,
            source: "petl-ui",
            metaJson: {
              requestedByUserId: actor.userId,
              requestedAt: new Date().toISOString(),
            },
            status: PetlPercentUpdateSessionStatus.PENDING,
            updates: {
              create: distinct.map((c) => {
                const row = byId.get(c.sowItemId);
                const oldPercent = row?.percentComplete ?? 0;
                return {
                  targetType: PetlPercentUpdateTargetType.SOW_ITEM,
                  sowItemId: c.sowItemId,
                  oldPercent,
                  newPercent: c.newPercent,
                };
              }),
            },
          },
          include: { updates: true },
        });

        return { status: "pending", sessionId: created.id, pendingCount: created.updates.length };
      }

      // PM/Owner/Admin path: commit immediately and audit via PetlEditSession/PetlEditChange.
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

      // Best effort: regenerate the current living invoice draft from PETL.
      await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);

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

    if (!canDirectlyCommit) {
      const estimateVersionIds = Array.from(new Set(items.map((i) => i.estimateVersionId)));
      if (estimateVersionIds.length !== 1) {
        throw new BadRequestException(
          "Pending percent updates must target a single estimate version; submit per version.",
        );
      }

      const created = await this.prisma.petlPercentUpdateSession.create({
        data: {
          projectId,
          estimateVersionId: estimateVersionIds[0],
          createdByUserId: actor.userId,
          source: "petl-ui",
          status: PetlPercentUpdateSessionStatus.PENDING,
          metaJson: {
            requestedByUserId: actor.userId,
            requestedAt: new Date().toISOString(),
            operation: op,
            percent,
            filters: filters ?? null,
          },
          updates: {
            create: computedChanges.map((c) => ({
              targetType: PetlPercentUpdateTargetType.SOW_ITEM,
              sowItemId: c.sowItemId,
              oldPercent: c.oldPercent ?? 0,
              newPercent: c.newPercent,
            })),
          },
        },
        include: { updates: true },
      });

      return { status: "pending", sessionId: created.id, pendingCount: created.updates.length };
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

    // Best effort: regenerate the current living invoice draft from PETL.
    await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);

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
      return { projectId, estimateVersionId: null, groups: [], unitGroups: [] };
    }

    const items = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
    });

    let reconEntries: any[] = [];
    try {
      reconEntries = await this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
        },
      });
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationEntry")) {
        throw err;
      }
      reconEntries = [];
    }

    const particleIds = Array.from(
      new Set(
        [
          ...items.map((i) => i.projectParticleId),
          ...reconEntries.map((e) => e.projectParticleId),
        ].filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );

    // NOTE: Avoid Prisma relation includes here. Some prod data can have orphaned
    // foreign keys, and Prisma will throw when hydrating required relations.
    const particles = await this.prisma.projectParticle.findMany({
      where: {
        projectId,
        id: { in: particleIds },
      },
      select: {
        id: true,
        name: true,
        fullLabel: true,
        unitId: true,
        buildingId: true,
      },
    });

    const particleById = new Map(particles.map((p) => [p.id, p]));

    const unitIds = Array.from(
      new Set(particles.map((p) => p.unitId).filter((v): v is string => typeof v === "string" && v.length > 0)),
    );

    const units = await this.prisma.projectUnit.findMany({
      where: {
        projectId,
        id: { in: unitIds },
      },
      select: {
        id: true,
        label: true,
        floor: true,
      },
    });

    const unitById = new Map(units.map((u) => [u.id, u]));

    type RoomGroupAgg = {
      particleId: string | null;
      roomName: string;
      itemsCount: number;
      totalAmount: number;
      completedAmount: number;
    };

    const byParticle = new Map<string, RoomGroupAgg>();

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
        percentComplete: percent,
      };
    });

    type UnitGroup = {
      id: number;
      unitId: string | null;
      unitLabel: string;
      rooms: typeof groups;
      itemsCount: number;
      totalAmount: number;
      completedAmount: number;
      percentComplete: number;
    };

    const byUnit = new Map<string, Omit<UnitGroup, "id" | "percentComplete">>();

    for (const room of groups) {
      const particle = room.particleId ? particleById.get(room.particleId) ?? null : null;
      const unit = particle?.unitId ? unitById.get(particle.unitId) ?? null : null;

      const unitKey = unit?.id ?? "__no_unit__";
      const unitLabel = unit ? (this.formatUnitLabel(unit) ?? unit.label) : "(No unit)";

      let agg = byUnit.get(unitKey);
      if (!agg) {
        agg = {
          unitId: unit?.id ?? null,
          unitLabel,
          rooms: [],
          itemsCount: 0,
          totalAmount: 0,
          completedAmount: 0,
        };
        byUnit.set(unitKey, agg);
      }

      agg.rooms.push(room);
      agg.itemsCount += room.itemsCount;
      agg.totalAmount += room.totalAmount;
      agg.completedAmount += room.completedAmount;
    }

    const unitSortKey = (label: string) => {
      const s = String(label ?? "");
      const m = s.match(/^Unit\s+0*(\d+)\b/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return { kind: 0, n, s };
      }
      return { kind: 1, n: Number.POSITIVE_INFINITY, s: s.toLowerCase() };
    };

    const unitGroups: UnitGroup[] = Array.from(byUnit.values())
      .map((u, idx) => {
        const total = u.totalAmount;
        const percent = total > 0 ? (u.completedAmount / total) * 100 : 0;

        // Keep rooms sorted for consistent UI.
        u.rooms.sort((a, b) => String(a.roomName).localeCompare(String(b.roomName)));

        return {
          id: idx + 1,
          unitId: u.unitId,
          unitLabel: u.unitLabel,
          rooms: u.rooms,
          itemsCount: u.itemsCount,
          totalAmount: u.totalAmount,
          completedAmount: u.completedAmount,
          percentComplete: percent,
        };
      })
      .sort((a, b) => {
        const ka = unitSortKey(a.unitLabel);
        const kb = unitSortKey(b.unitLabel);
        if (ka.kind !== kb.kind) return ka.kind - kb.kind;
        if (ka.n !== kb.n) return ka.n - kb.n;
        return ka.s.localeCompare(kb.s);
      });

    return { projectId, estimateVersionId: latestVersion.id, groups, unitGroups };
  }

  async getPetlSelectionSummaryForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    filters: {
      roomParticleIds?: string[];
      categoryCodes?: string[];
      selectionCodes?: string[];
    },
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

    if (filters.roomParticleIds?.length) {
      where.projectParticleId = { in: filters.roomParticleIds };
    }
    if (filters.categoryCodes?.length) {
      where.categoryCode = { in: filters.categoryCodes };
    }
    if (filters.selectionCodes?.length) {
      where.selectionCode = { in: filters.selectionCodes };
    }

    const items = await this.prisma.sowItem.findMany({ where });

    let reconEntries: any[] = [];
    try {
      reconEntries = await this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
          ...(filters.roomParticleIds?.length
            ? { projectParticleId: { in: filters.roomParticleIds } }
            : {}),
          ...(filters.categoryCodes?.length ? { categoryCode: { in: filters.categoryCodes } } : {}),
          ...(filters.selectionCodes?.length
            ? { selectionCode: { in: filters.selectionCodes } }
            : {}),
        },
      });
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationEntry")) {
        throw err;
      }
      reconEntries = [];
    }

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

  async updatePetlLineItemForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    sowItemId: string,
    patch: {
      qty?: number | null;
      unit?: string | null;
      itemAmount?: number | null;
      rcvAmount?: number | null;
      categoryCode?: string | null;
      selectionCode?: string | null;
      description?: string | null;
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const canEdit = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canEdit) {
      throw new ForbiddenException(
        "Only project managers/owners/admins can edit PETL line items",
      );
    }

    const sowItem = await this.prisma.sowItem.findFirst({
      where: {
        id: sowItemId,
        sow: { projectId },
      },
    });

    if (!sowItem) {
      throw new NotFoundException("PETL line item not found for this project");
    }

    // Compute field-level diffs.
    const changes: {
      field: string;
      oldValue: any;
      newValue: any;
    }[] = [];

    const normalizeString = (v: any) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };

    const numericPatch = (value: any) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const n = Number(value);
      if (!Number.isFinite(n)) return undefined;
      return n;
    };

    const nextQty = numericPatch(patch.qty);
    if (patch.qty !== undefined) {
      const oldQty = sowItem.qty ?? null;
      if (nextQty !== undefined && nextQty !== oldQty) {
        changes.push({ field: "qty", oldValue: oldQty, newValue: nextQty });
      }
    }

    const nextUnit = normalizeString(patch.unit);
    if (patch.unit !== undefined) {
      const oldUnit = sowItem.unit ?? null;
      if (nextUnit !== oldUnit) {
        changes.push({ field: "unit", oldValue: oldUnit, newValue: nextUnit });
      }
    }

    const nextItemAmount = numericPatch(patch.itemAmount);
    if (patch.itemAmount !== undefined) {
      const oldItemAmount = sowItem.itemAmount ?? null;
      if (nextItemAmount !== undefined && nextItemAmount !== oldItemAmount) {
        changes.push({
          field: "item_amount",
          oldValue: oldItemAmount,
          newValue: nextItemAmount,
        });
      }
    }

    const nextRcvAmount = numericPatch(patch.rcvAmount);
    if (patch.rcvAmount !== undefined) {
      const oldRcvAmount = sowItem.rcvAmount ?? null;
      if (nextRcvAmount !== undefined && nextRcvAmount !== oldRcvAmount) {
        changes.push({
          field: "rcv_amount",
          oldValue: oldRcvAmount,
          newValue: nextRcvAmount,
        });
      }
    }

    const nextCategoryCode = normalizeString(patch.categoryCode);
    if (patch.categoryCode !== undefined) {
      const oldCategoryCode = sowItem.categoryCode ?? null;
      if (nextCategoryCode !== oldCategoryCode) {
        changes.push({
          field: "category_code",
          oldValue: oldCategoryCode,
          newValue: nextCategoryCode,
        });
      }
    }

    const nextSelectionCode = normalizeString(patch.selectionCode);
    if (patch.selectionCode !== undefined) {
      const oldSelectionCode = sowItem.selectionCode ?? null;
      if (nextSelectionCode !== oldSelectionCode) {
        changes.push({
          field: "selection_code",
          oldValue: oldSelectionCode,
          newValue: nextSelectionCode,
        });
      }
    }

    const nextDescription = normalizeString(patch.description);
    if (patch.description !== undefined) {
      const oldDescription = sowItem.description ?? null;
      if (nextDescription !== oldDescription) {
        changes.push({
          field: "description",
          oldValue: oldDescription,
          newValue: nextDescription,
        });
      }
    }

    if (changes.length === 0) {
      return { status: "noop" };
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const sessionId = await this.ensurePetlEditSessionId(
        tx,
        projectId,
        actor.userId,
      );

      for (const change of changes) {
        await tx.petlEditChange.create({
          data: {
            sessionId,
            sowItemId: sowItem.id,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            effectiveAt: now,
          },
        });
      }

      const data: any = {};
      for (const change of changes) {
        if (change.field === "qty") data.qty = change.newValue;
        if (change.field === "unit") data.unit = change.newValue;
        if (change.field === "item_amount") data.itemAmount = change.newValue;
        if (change.field === "rcv_amount") data.rcvAmount = change.newValue;
        if (change.field === "category_code") data.categoryCode = change.newValue;
        if (change.field === "selection_code") data.selectionCode = change.newValue;
        if (change.field === "description") data.description = change.newValue;
      }

      return tx.sowItem.update({
        where: { id: sowItem.id },
        data,
      });
    });

    // Best effort: keep living draft invoice in sync when RCV or amounts change.
    if (changes.some((c) => c.field === "rcv_amount" || c.field === "item_amount")) {
      try {
        await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);
      } catch {
        // non-fatal for inline edits
      }
    }

    return {
      status: "ok",
      sowItemId: updated.id,
      qty: updated.qty,
      unit: updated.unit,
      itemAmount: updated.itemAmount,
      rcvAmount: updated.rcvAmount,
      categoryCode: updated.categoryCode,
      selectionCode: updated.selectionCode,
      description: updated.description,
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
      return { updatedCount: 0, escalatedCount: 0 };
    }

    const now = new Date();
    let updatedCount = 0;
    let escalatedCount = 0;

    for (const entry of items) {
      const { sowItemId, qtyFlaggedIncorrect, qtyFieldReported, notes } = entry;

      const sowItem = await this.prisma.sowItem.findFirst({
        where: {
          id: sowItemId,
          sow: { projectId },
        },
        select: {
          id: true,
          qty: true,
          description: true,
          estimateVersionId: true,
          projectParticleId: true,
          qtyFlaggedIncorrect: true,
          qtyFieldReported: true,
        },
      });

      if (!sowItem) {
        continue;
      }

      const currentQty = sowItem.qty ?? null;
      const reportedQty = qtyFieldReported ?? null;

      // Only escalate into reconciliation workflow when a discrepancy exists.
      const hasDeviation =
        qtyFlaggedIncorrect === true &&
        !(currentQty === null && reportedQty === null) &&
        currentQty !== reportedQty;

      await this.prisma.sowItem.update({
        where: { id: sowItem.id },
        data: {
          qtyFlaggedIncorrect,
          qtyFieldReported: qtyFlaggedIncorrect ? reportedQty : null,
          qtyFieldReportedByUserId: qtyFlaggedIncorrect ? actor.userId : null,
          qtyFieldReportedAt: qtyFlaggedIncorrect ? now : null,
          qtyFieldNotes: qtyFlaggedIncorrect ? (notes ?? null) : null,
          qtyReviewStatus: qtyFlaggedIncorrect ? "PENDING" : null,
        },
      });

      updatedCount += 1;

      if (!hasDeviation) {
        continue;
      }

      // Create/ensure reconciliation case and add a standardized note entry.
      const reconCase = await this.getOrCreatePetlReconciliationCaseForSowItem({
        projectId,
        companyId,
        actor,
        sowItemId: sowItem.id,
      });

      const existingToday = await this.prisma.petlReconciliationEntry.findFirst({
        where: {
          caseId: reconCase.id,
          parentSowItemId: sowItem.id,
          kind: PetlReconciliationEntryKind.NOTE_ONLY,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, note: true },
      });

      const notePrefix = "[FIELD_QTY_DISCREPANCY]";
      if (!existingToday?.note?.startsWith(notePrefix)) {
        await this.prisma.petlReconciliationEntry.create({
          data: {
            projectId,
            estimateVersionId: sowItem.estimateVersionId,
            caseId: reconCase.id,
            parentSowItemId: sowItem.id,
            projectParticleId: sowItem.projectParticleId,
            kind: PetlReconciliationEntryKind.NOTE_ONLY,
            rcvAmount: null,
            percentComplete: 0,
            isPercentCompleteLocked: true,
            note: `${notePrefix} Field reported qty ${reportedQty} differs from estimate qty ${currentQty}. Review required.`,
            createdByUserId: actor.userId,
            events: {
              create: {
                projectId,
                estimateVersionId: sowItem.estimateVersionId,
                caseId: reconCase.id,
                eventType: "ENTRY_CREATED_FIELD_QTY_DISCREPANCY",
                payloadJson: {
                  sowItemId: sowItem.id,
                  estimateQty: currentQty,
                  fieldQty: reportedQty,
                },
                createdByUserId: actor.userId,
              },
            },
          },
        });
      }

      // Push to PM/owner todo list (tasks).
      const pmMemberships = await this.prisma.projectMembership.findMany({
        where: {
          projectId,
          role: { in: [ProjectRole.MANAGER, ProjectRole.OWNER] },
        },
        select: { userId: true },
      });

      for (const m of pmMemberships) {
        const existingTask = await this.prisma.task.findFirst({
          where: {
            companyId,
            projectId,
            assigneeId: m.userId,
            status: { not: "DONE" },
            relatedEntityType: "PETL_QTY_DISCREPANCY",
            relatedEntityId: sowItem.id,
          },
          select: { id: true },
        });

        if (existingTask) continue;

        await this.prisma.task.create({
          data: {
            title: `Review PETL qty discrepancy: ${sowItem.description}`,
            description: `Field reported qty ${reportedQty} differs from estimate qty ${currentQty}. Open the PETL reconciliation for this item and decide how to handle as a revision (credit/debit / replacement line item).`,
            status: "TODO",
            priority: "HIGH",
            companyId,
            projectId,
            assigneeId: m.userId,
            relatedEntityType: "PETL_QTY_DISCREPANCY",
            relatedEntityId: sowItem.id,
          },
        });
      }

      escalatedCount += 1;
    }

    return { updatedCount, escalatedCount };
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

  async listPendingPetlPercentUpdateSessions(projectId: string, actor: AuthenticatedUser) {
    await this.getProjectByIdForUser(projectId, actor);

    const canReview = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canReview) {
      // Crew/field can submit, but cannot browse pending queue.
      throw new ForbiddenException("Only PM/owner/admin can view pending PETL updates");
    }

    const sessions = await this.prisma.petlPercentUpdateSession.findMany({
      where: { projectId, status: PetlPercentUpdateSessionStatus.PENDING },
      orderBy: { createdAt: "asc" },
      include: {
        createdBy: { select: { id: true, email: true } },
        updates: true,
      },
    });

    return sessions;
  }

  async approvePetlPercentUpdateSession(
    projectId: string,
    sessionId: string,
    actor: AuthenticatedUser,
    reviewNote?: string | null,
  ) {
    await this.getProjectByIdForUser(projectId, actor);

    const canReview = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canReview) {
      throw new ForbiddenException("Only PM/owner/admin can approve PETL updates");
    }

    const session = await this.prisma.petlPercentUpdateSession.findFirst({
      where: { id: sessionId, projectId },
      include: { updates: true },
    });

    if (!session) {
      throw new NotFoundException("Pending PETL percent update session not found");
    }

    if (session.status !== PetlPercentUpdateSessionStatus.PENDING) {
      throw new BadRequestException("This PETL percent update session is not pending");
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Attribute the edit session to the original data-entry user, while recording
      // the reviewer on the pending session.
      const petlEditSession = await tx.petlEditSession.create({
        data: {
          projectId,
          userId: session.createdByUserId ?? null,
          source: "petl-percent-approved",
          meta: {
            pendingSessionId: session.id,
            approvedByUserId: actor.userId,
            approvedAt: now.toISOString(),
          },
          startedAt: now,
          endedAt: now,
        },
      });

      for (const update of session.updates) {
        if (update.targetType === PetlPercentUpdateTargetType.SOW_ITEM && update.sowItemId) {
          const sowItem = await tx.sowItem.findUnique({ where: { id: update.sowItemId } });
          if (!sowItem) continue;

          const current = sowItem.percentComplete ?? 0;
          const next = update.newPercent;

          if (current !== next) {
            await tx.petlEditChange.create({
              data: {
                sessionId: petlEditSession.id,
                sowItemId: sowItem.id,
                field: "percent_complete",
                oldValue: current,
                newValue: next,
                effectiveAt: now,
              },
            });

            await tx.sowItem.update({
              where: { id: sowItem.id },
              data: { percentComplete: next },
            });
          }
        }

        // Future: support recon entry percent approvals.
      }

      await tx.petlPercentUpdateSession.update({
        where: { id: session.id },
        data: {
          status: PetlPercentUpdateSessionStatus.APPROVED,
          reviewedByUserId: actor.userId,
          reviewedAt: now,
          reviewNote: reviewNote ?? null,
        },
      });
    });

    return { status: "approved" };
  }

  async rejectPetlPercentUpdateSession(
    projectId: string,
    sessionId: string,
    actor: AuthenticatedUser,
    reviewNote?: string | null,
  ) {
    await this.getProjectByIdForUser(projectId, actor);

    const canReview = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canReview) {
      throw new ForbiddenException("Only PM/owner/admin can reject PETL updates");
    }

    const session = await this.prisma.petlPercentUpdateSession.findFirst({
      where: { id: sessionId, projectId },
      select: { id: true, status: true },
    });

    if (!session) {
      throw new NotFoundException("Pending PETL percent update session not found");
    }

    if (session.status !== PetlPercentUpdateSessionStatus.PENDING) {
      throw new BadRequestException("This PETL percent update session is not pending");
    }

    await this.prisma.petlPercentUpdateSession.update({
      where: { id: session.id },
      data: {
        status: PetlPercentUpdateSessionStatus.REJECTED,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });

    return { status: "rejected" };
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
      roomParticleIds?: string[];
      categoryCodes?: string[];
      selectionCodes?: string[];
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
        roomParticleId: filters.roomParticleIds?.length === 1 ? filters.roomParticleIds[0] : null,
        categoryCode: filters.categoryCodes?.length === 1 ? filters.categoryCodes[0] : null,
        selectionCode: filters.selectionCodes?.length === 1 ? filters.selectionCodes[0] : null,
        components: [],
      };
    }

    const sowWhere: any = {
      estimateVersionId: latestVersion.id,
    };

    if (filters.roomParticleIds?.length) {
      sowWhere.projectParticleId = { in: filters.roomParticleIds };
    }
    if (filters.categoryCodes?.length) {
      sowWhere.categoryCode = { in: filters.categoryCodes };
    }
    if (filters.selectionCodes?.length) {
      sowWhere.selectionCode = { in: filters.selectionCodes };
    }

    const sowItems = await this.prisma.sowItem.findMany({
      where: sowWhere,
      select: { id: true },
    });

    if (sowItems.length === 0) {
      return {
        projectId,
        estimateVersionId: latestVersion.id,
        roomParticleId: filters.roomParticleIds?.length === 1 ? filters.roomParticleIds[0] : null,
        categoryCode: filters.categoryCodes?.length === 1 ? filters.categoryCodes[0] : null,
        selectionCode: filters.selectionCodes?.length === 1 ? filters.selectionCodes[0] : null,
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
      roomParticleId: filters.roomParticleIds?.length === 1 ? filters.roomParticleIds[0] : null,
      categoryCode: filters.categoryCodes?.length === 1 ? filters.categoryCodes[0] : null,
      selectionCode: filters.selectionCodes?.length === 1 ? filters.selectionCodes[0] : null,
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

    const [sowItems, componentsCount] = await Promise.all([
      this.prisma.sowItem.findMany({
        where: { estimateVersionId: latestVersion.id },
        select: { rcvAmount: true, itemAmount: true },
      }),
      this.prisma.componentSummary.count({
        where: { estimateVersionId: latestVersion.id },
      }),
    ]);

    let reconEntries: { rcvAmount: number | null }[] = [];
    try {
      reconEntries = await this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
        },
        select: { rcvAmount: true },
      });
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationEntry")) {
        throw err;
      }
      reconEntries = [];
    }

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

    // Project billing (invoices/payments) should also invalidate snapshots.
    const maxDate = (a: Date | null, b: Date | null) => {
      if (a && b) return a > b ? a : b;
      return a ?? b;
    };

    let invoiceUpdatedAt: Date | null = null;
    if (this.billingModelsAvailable()) {
      try {
        const invAgg = await this.prisma.projectInvoice.aggregate({
          where: {
            projectId,
            companyId: project.companyId,
            status: {
              in: [
                ProjectInvoiceStatus.ISSUED,
                ProjectInvoiceStatus.PARTIALLY_PAID,
                ProjectInvoiceStatus.PAID,
                ProjectInvoiceStatus.VOID,
              ],
            },
          },
          _max: { updatedAt: true },
        });
        invoiceUpdatedAt = invAgg._max.updatedAt ?? null;
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "ProjectInvoice")) {
          throw err;
        }
      }
    }

    let paymentUpdatedAt: Date | null = null;
    if (this.billingModelsAvailable()) {
      try {
        const payAgg = await this.prisma.projectPayment.aggregate({
          where: {
            projectId,
            companyId: project.companyId,
            status: ProjectPaymentStatus.RECORDED,
          },
          _max: { createdAt: true },
        });
        paymentUpdatedAt = payAgg._max.createdAt ?? null;
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "ProjectPayment")) {
          throw err;
        }
      }
    }

    let paymentAppUpdatedAt: Date | null = null;
    if (this.billingModelsAvailable() && this.paymentApplicationModelsAvailable()) {
      try {
        const p: any = this.prisma as any;
        const appAgg = await p.projectPaymentApplication.aggregate({
          where: {
            projectId,
            companyId: project.companyId,
          },
          _max: { createdAt: true },
        });
        paymentAppUpdatedAt = appAgg?._max?.createdAt ?? null;
      } catch (err: any) {
        if (!this.isPaymentApplicationTableMissingError(err)) {
          throw err;
        }
      }
    }

    const billingUpdatedAt = maxDate(invoiceUpdatedAt, maxDate(paymentUpdatedAt, paymentAppUpdatedAt));

    // Try to use an existing snapshot if it is from today, not forced to refresh,
    // and no reconciliation entries OR billing activity has been updated since the snapshot.
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

      if (
        existing &&
        (!reconUpdatedAt || existing.computedAt >= reconUpdatedAt) &&
        (!billingUpdatedAt || existing.computedAt >= billingUpdatedAt)
      ) {
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

    // Billed-to-date comes from issued/locked invoices (the "living" DRAFT invoice is excluded).
    // In environments where billing migrations haven't been applied yet, this stays 0.
    let billedToDate = 0;
    if (this.billingModelsAvailable()) {
      try {
        const billedAgg = await this.prisma.projectInvoice.aggregate({
          where: {
            projectId,
            companyId: project.companyId,
            status: {
              in: [
                ProjectInvoiceStatus.ISSUED,
                ProjectInvoiceStatus.PARTIALLY_PAID,
                ProjectInvoiceStatus.PAID,
              ],
            },
          },
          _sum: { totalAmount: true },
        });
        billedToDate = billedAgg._sum.totalAmount ?? 0;
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "ProjectInvoice")) {
          throw err;
        }
        billedToDate = 0;
      }
    }

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

  private formatInvoiceNumber(sequenceNo: number) {
    return `INV-${String(sequenceNo).padStart(5, "0")}`;
  }

  private computeInvoicePrefixFromProjectName(projectName: string | null | undefined): string | null {
    const raw = String(projectName ?? "").trim();
    if (!raw) return null;

    const tokens = raw
      // Treat punctuation as word boundaries.
      .replace(/[^a-zA-Z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) return null;

    const STOP = new Set(["THE", "AND", "OF", "AT", "IN", "ON", "FOR", "A", "AN"]);
    const significant = tokens.filter((t) => !STOP.has(t.toUpperCase()));
    const source = significant.length > 0 ? significant : tokens;

    const letters: string[] = [];
    for (const t of source) {
      const c = t[0];
      if (c) letters.push(c.toUpperCase());
      if (letters.length >= 3) break;
    }

    let prefix = letters.join("");

    // If there are fewer than 3 words, fall back to first 3 alphanumerics from the joined name.
    if (prefix.length < 3) {
      const joined = source.join("");
      prefix = joined.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase().slice(0, 3);
    }

    return prefix.length === 3 ? prefix : null;
  }

  private billingModelsAvailable() {
    const p: any = this.prisma as any;
    return (
      typeof p?.projectInvoice?.findFirst === "function" &&
      typeof p?.projectInvoiceLineItem?.create === "function" &&
      typeof p?.projectPayment?.create === "function" &&
      typeof p?.companyInvoiceCounter?.upsert === "function"
    );
  }

  private ensureBillingModelsAvailable() {
    if (this.billingModelsAvailable()) return;

    // This typically means Prisma client wasn't regenerated after adding the billing models,
    // or the API server process hasn't been restarted since `prisma generate` ran.
    throw new BadRequestException(
      "Project billing is not initialized on this API instance. Run `npm -w packages/database run prisma:generate` and restart the API; if it still fails, run `npm -w packages/database run prisma:migrate`.",
    );
  }

  private isBillingTableMissingError(err: any) {
    return (
      this.isMissingPrismaTableError(err, "ProjectInvoice") ||
      this.isMissingPrismaTableError(err, "ProjectInvoiceLineItem") ||
      this.isMissingPrismaTableError(err, "ProjectPayment") ||
      this.isMissingPrismaTableError(err, "CompanyInvoiceCounter")
    );
  }

  private throwBillingTablesNotMigrated() {
    throw new BadRequestException(
      "Project billing tables are not present in the database yet. Run `npm -w packages/database run prisma:migrate` (against your dev DATABASE_URL), then restart the API.",
    );
  }

  private billModelsAvailable() {
    const p: any = this.prisma as any;
    return (
      typeof p?.projectBill?.findMany === "function" &&
      typeof p?.projectBillLineItem?.create === "function" &&
      typeof p?.projectBillAttachment?.create === "function"
    );
  }

  private ensureBillModelsAvailable() {
    if (this.billModelsAvailable()) return;

    throw new BadRequestException(
      "Project bills are not initialized on this API instance. Run `npm -w packages/database run prisma:generate` and restart the API; if it still fails, run `npm -w packages/database run prisma:migrate`.",
    );
  }

  private isBillTableMissingError(err: any) {
    return (
      this.isMissingPrismaTableError(err, "ProjectBill") ||
      this.isMissingPrismaTableError(err, "ProjectBillLineItem") ||
      this.isMissingPrismaTableError(err, "ProjectBillAttachment")
    );
  }

  private throwBillTablesNotMigrated() {
    throw new BadRequestException(
      "Project bill tables are not present in the database yet. Run `npm -w packages/database run prisma:migrate` (against your dev DATABASE_URL), then restart the API.",
    );
  }

  private paymentApplicationModelsAvailable() {
    const p: any = this.prisma as any;
    return typeof p?.projectPaymentApplication?.findMany === "function";
  }

  private ensurePaymentApplicationModelsAvailable() {
    if (this.paymentApplicationModelsAvailable()) return;

    throw new BadRequestException(
      "Project payment applications are not initialized on this API instance. Run `npm -w packages/database run prisma:generate` and restart the API; if it still fails, run `npm -w packages/database run prisma:migrate`.",
    );
  }

  private isPaymentApplicationTableMissingError(err: any) {
    return this.isMissingPrismaTableError(err, "ProjectPaymentApplication");
  }

  private invoicePetlModelsAvailable() {
    const p: any = this.prisma as any;
    return (
      typeof p?.projectInvoicePetlLine?.findMany === "function" &&
      typeof p?.projectInvoicePetlLine?.deleteMany === "function" &&
      typeof p?.projectInvoicePetlLine?.createMany === "function"
    );
  }

  private ensureInvoicePetlModelsAvailable() {
    if (this.invoicePetlModelsAvailable()) return;

    // This typically means Prisma client wasn't regenerated after adding the model,
    // or the API server process hasn't been restarted since `prisma generate` ran.
    throw new BadRequestException(
      "Invoice PETL detail is not initialized on this API instance. Run `npm -w packages/database run prisma:generate` and restart the API; if it still fails, run `npm -w packages/database run prisma:migrate`."
    );
  }

  private async recomputeInvoiceTotal(invoiceId: string) {
    // Manual line items
    const manualAgg = await this.prisma.projectInvoiceLineItem.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const manualTotal = manualAgg._sum.amount ?? 0;

    // PETL-derived lines (best effort; table may not exist yet in some envs)
    let petlTotal = 0;
    if (this.invoicePetlModelsAvailable()) {
      try {
        const p: any = this.prisma as any;
        const petlAgg = await p.projectInvoicePetlLine.aggregate({
          where: { invoiceId },
          _sum: { thisInvTotal: true },
        });
        petlTotal = petlAgg?._sum?.thisInvTotal ?? 0;
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "ProjectInvoicePetlLine")) {
          throw err;
        }
      }
    }

    const totalAmount = manualTotal + petlTotal;

    await this.prisma.projectInvoice.update({
      where: { id: invoiceId },
      data: { totalAmount },
    });

    return totalAmount;
  }

  private async computeInvoicePaymentTotal(invoiceId: string) {
    // Legacy invoice-linked payments
    const legacyAgg = await this.prisma.projectPayment.aggregate({
      where: { invoiceId, status: ProjectPaymentStatus.RECORDED },
      _sum: { amount: true },
    });
    const legacyPaid = legacyAgg._sum.amount ?? 0;

    // Applied payments (best effort; table/model may not exist yet)
    let appliedPaid = 0;
    if (this.paymentApplicationModelsAvailable()) {
      try {
        const p: any = this.prisma as any;
        const appAgg = await p.projectPaymentApplication.aggregate({
          where: { invoiceId },
          _sum: { amount: true },
        });
        appliedPaid = appAgg?._sum?.amount ?? 0;
      } catch (err: any) {
        if (!this.isPaymentApplicationTableMissingError(err)) {
          throw err;
        }
      }
    }

    return legacyPaid + appliedPaid;
  }

  private async getInvoiceOrThrow(projectId: string, invoiceId: string, actor: AuthenticatedUser) {
    const project = await this.getProjectByIdForUser(projectId, actor);
    const invoice = await this.prisma.projectInvoice.findFirst({
      where: {
        id: invoiceId,
        projectId: project.id,
        companyId: project.companyId,
      },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found for this project");
    }
    return { project, invoice };
  }

  private assertInvoiceEditable(invoice: { status: ProjectInvoiceStatus; lockedAt: Date | null }) {
    if (invoice.status !== ProjectInvoiceStatus.DRAFT || invoice.lockedAt) {
      throw new BadRequestException("Invoice is locked and can no longer be edited");
    }
  }

  private async deriveLaborAmountFromTimecards(args: {
    companyId: string;
    projectId: string;
    startDate: Date;
    endDate: Date;
  }) {
    const { companyId, projectId, startDate, endDate } = args;

    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException("timecardStartDate is invalid");
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException("timecardEndDate is invalid");
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException("timecardStartDate must be <= timecardEndDate");
    }

    const entries = await this.prisma.dailyTimeEntry.findMany({
      where: {
        timecard: {
          companyId,
          projectId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: {
        timecard: { select: { date: true } },
        worker: { select: { id: true, fullName: true, defaultPayRate: true } },
      },
    });

    type WorkerAgg = {
      workerId: string;
      workerName: string;
      payRate: number;
      stHours: number;
      otHours: number;
      dtHours: number;
    };

    const byWorker = new Map<string, WorkerAgg>();

    for (const e of entries) {
      const w = e.worker;
      const workerName = String(w?.fullName ?? "").trim() || w?.id || "unknown";
      const rate = typeof w?.defaultPayRate === "number" ? w.defaultPayRate : null;

      if (rate == null || !Number.isFinite(rate)) {
        throw new BadRequestException(
          `Cannot derive labor amount: worker '${workerName}' has no defaultPayRate. Enter a manual amount instead.`,
        );
      }

      const agg = byWorker.get(w.id) ?? {
        workerId: w.id,
        workerName,
        payRate: rate,
        stHours: 0,
        otHours: 0,
        dtHours: 0,
      };

      agg.stHours += e.stHours ?? 0;
      agg.otHours += e.otHours ?? 0;
      agg.dtHours += e.dtHours ?? 0;

      byWorker.set(w.id, agg);
    }

    const byWorkerList = Array.from(byWorker.values()).map((w) => {
      const totalHours = (w.stHours ?? 0) + (w.otHours ?? 0) + (w.dtHours ?? 0);
      return {
        ...w,
        totalHours,
        amount: totalHours * w.payRate,
      };
    });

    const totalHours = byWorkerList.reduce((sum, w) => sum + (w.totalHours ?? 0), 0);
    const amount = byWorkerList.reduce((sum, w) => sum + (w.amount ?? 0), 0);

    return {
      amount,
      metaJson: {
        source: "TIMECARDS_DERIVED",
        timecardStartDate: startDate.toISOString(),
        timecardEndDate: endDate.toISOString(),
        entryCount: entries.length,
        totalHours,
        byWorker: byWorkerList,
      },
    };
  }

  async listProjectBills(projectId: string, actor: AuthenticatedUser) {
    this.ensureBillModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      // IMPORTANT: await the Prisma call so try/catch can intercept P2021.
      const bills = await this.prisma.projectBill.findMany({
        where: {
          projectId: project.id,
          companyId: project.companyId,
        },
        orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
        include: {
          lineItems: true,
          attachments: { orderBy: { createdAt: "asc" } },
        },
      });

      return bills;
    } catch (err: any) {
      // In prod right now, the bills migration may not be applied yet.
      // Don't 500 the project page; return an empty list.
      if (this.isBillTableMissingError(err)) {
        return [];
      }
      throw err;
    }
  }

  async createProjectBill(projectId: string, dto: CreateProjectBillDto, actor: AuthenticatedUser) {
    this.ensureBillModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const vendorName = String(dto.vendorName ?? "").trim();
      if (!vendorName) {
        throw new BadRequestException("vendorName is required");
      }

      const billDate = new Date(dto.billDate);
      if (Number.isNaN(billDate.getTime())) {
        throw new BadRequestException("billDate is invalid");
      }

      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      if (dto.dueAt && Number.isNaN(dueAt?.getTime() ?? NaN)) {
        throw new BadRequestException("dueAt is invalid");
      }

      const lineItem = dto.lineItem;
      const kind = lineItem.kind;
      const description = String(lineItem.description ?? "").trim();
      if (!description) {
        throw new BadRequestException("lineItem.description is required");
      }

      let amount: number | null = typeof lineItem.amount === "number" ? lineItem.amount : null;
      let amountSource: ProjectBillLineItemAmountSource = ProjectBillLineItemAmountSource.MANUAL;
      let timecardStartDate: Date | null = null;
      let timecardEndDate: Date | null = null;
      let metaJson: any = null;

      if (kind === ProjectBillLineItemKind.LABOR && (amount == null || !Number.isFinite(amount))) {
        if (!lineItem.timecardStartDate || !lineItem.timecardEndDate) {
          throw new BadRequestException(
            "Labor line items require amount or (timecardStartDate and timecardEndDate) to derive from timecards",
          );
        }

        timecardStartDate = new Date(lineItem.timecardStartDate);
        timecardEndDate = new Date(lineItem.timecardEndDate);

        const derived = await this.deriveLaborAmountFromTimecards({
          companyId: project.companyId,
          projectId: project.id,
          startDate: timecardStartDate,
          endDate: timecardEndDate,
        });

        amount = derived.amount;
        amountSource = ProjectBillLineItemAmountSource.TIMECARDS_DERIVED;
        metaJson = derived.metaJson;
      }

      if (amount == null || !Number.isFinite(amount)) {
        throw new BadRequestException("lineItem.amount is required");
      }

      const attachmentIds = Array.from(new Set(dto.attachmentProjectFileIds ?? [])).filter(Boolean);

      const files = attachmentIds.length
        ? await this.prisma.projectFile.findMany({
            where: {
              id: { in: attachmentIds },
              projectId: project.id,
              companyId: project.companyId,
            },
            select: {
              id: true,
              storageUrl: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
            },
          })
        : [];

      if (files.length !== attachmentIds.length) {
        throw new BadRequestException(
          "One or more attachmentProjectFileIds do not exist for this project",
        );
      }

      const bill = await this.prisma.projectBill.create({
        data: {
          companyId: project.companyId,
          projectId: project.id,
          vendorName,
          billNumber: dto.billNumber?.trim() || null,
          billDate,
          dueAt,
          status: dto.status ?? ProjectBillStatus.DRAFT,
          memo: dto.memo ?? null,
          totalAmount: amount,
          createdByUserId: actor.userId,
          lineItems: {
            create: {
              kind,
              description,
              amountSource,
              amount,
              timecardStartDate,
              timecardEndDate,
              metaJson,
            },
          },
          ...(files.length
            ? {
                attachments: {
                  create: files.map((f) => ({
                    projectFileId: f.id,
                    fileUrl: f.storageUrl,
                    fileName: f.fileName ?? null,
                    mimeType: f.mimeType ?? null,
                    sizeBytes: f.sizeBytes ?? null,
                  })),
                },
              }
            : {}),
        },
        include: {
          lineItems: true,
          attachments: { orderBy: { createdAt: "asc" } },
        },
      });

      await this.audit.log(actor, "PROJECT_BILL_CREATED", {
        companyId: project.companyId,
        projectId: project.id,
        metadata: {
          billId: bill.id,
          vendorName: bill.vendorName,
          billDate: bill.billDate,
          totalAmount: bill.totalAmount,
        },
      });

      return bill;
    } catch (err: any) {
      if (this.isBillTableMissingError(err)) {
        this.throwBillTablesNotMigrated();
      }
      throw err;
    }
  }

  async updateProjectBill(
    projectId: string,
    billId: string,
    dto: UpdateProjectBillDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const existing = await this.prisma.projectBill.findFirst({
        where: {
          id: billId,
          projectId: project.id,
          companyId: project.companyId,
        },
        include: {
          lineItems: { orderBy: { createdAt: "asc" } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!existing) {
        throw new NotFoundException("Bill not found for this project");
      }

      const existingLineItem = existing.lineItems[0] ?? null;
      if (!existingLineItem) {
        throw new BadRequestException("Bill is missing its line item");
      }

      const nextVendorName = dto.vendorName === undefined ? existing.vendorName : String(dto.vendorName ?? "").trim();
      if (!nextVendorName) {
        throw new BadRequestException("vendorName cannot be empty");
      }

      const nextBillDate = dto.billDate ? new Date(dto.billDate) : existing.billDate;
      if (dto.billDate && Number.isNaN(nextBillDate.getTime())) {
        throw new BadRequestException("billDate is invalid");
      }

      const nextDueAt = dto.dueAt === undefined ? existing.dueAt : dto.dueAt ? new Date(dto.dueAt) : null;
      if (dto.dueAt && Number.isNaN(nextDueAt?.getTime() ?? NaN)) {
        throw new BadRequestException("dueAt is invalid");
      }

      const li = dto.lineItem;

      const nextKind = li?.kind ?? (existingLineItem.kind as any);
      const nextDescription =
        li?.description === undefined ? existingLineItem.description : String(li.description ?? "").trim();
      if (!nextDescription) {
        throw new BadRequestException("lineItem.description cannot be empty");
      }

      let nextAmount =
        typeof li?.amount === "number" ? li.amount : (existingLineItem.amount as any);

      let nextAmountSource: ProjectBillLineItemAmountSource = existingLineItem.amountSource as any;
      let nextTimecardStartDate: Date | null = existingLineItem.timecardStartDate as any;
      let nextTimecardEndDate: Date | null = existingLineItem.timecardEndDate as any;
      let nextMetaJson: any = existingLineItem.metaJson;

      // Explicit manual amount update.
      if (typeof li?.amount === "number") {
        nextAmountSource = ProjectBillLineItemAmountSource.MANUAL;
        nextTimecardStartDate = null;
        nextTimecardEndDate = null;
        nextMetaJson = null;
      }

      // Re-derive labor amount if requested (amount omitted + both dates provided).
      if (
        nextKind === ProjectBillLineItemKind.LABOR &&
        (li?.amount === undefined || li?.amount === null) &&
        li?.timecardStartDate &&
        li?.timecardEndDate
      ) {
        nextTimecardStartDate = new Date(li.timecardStartDate);
        nextTimecardEndDate = new Date(li.timecardEndDate);

        const derived = await this.deriveLaborAmountFromTimecards({
          companyId: project.companyId,
          projectId: project.id,
          startDate: nextTimecardStartDate,
          endDate: nextTimecardEndDate,
        });

        nextAmount = derived.amount;
        nextAmountSource = ProjectBillLineItemAmountSource.TIMECARDS_DERIVED;
        nextMetaJson = derived.metaJson;
      }

      if (nextAmount == null || !Number.isFinite(nextAmount)) {
        throw new BadRequestException("lineItem.amount is invalid");
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.projectBill.update({
          where: { id: existing.id },
          data: {
            vendorName: nextVendorName,
            billNumber: dto.billNumber === undefined ? existing.billNumber : dto.billNumber?.trim() || null,
            billDate: nextBillDate,
            dueAt: nextDueAt,
            status: dto.status ?? existing.status,
            memo: dto.memo === undefined ? existing.memo : dto.memo ?? null,
          },
        });

        const nextLine = await tx.projectBillLineItem.update({
          where: { id: existingLineItem.id },
          data: {
            kind: nextKind,
            description: nextDescription,
            amountSource: nextAmountSource,
            amount: nextAmount,
            timecardStartDate: nextTimecardStartDate,
            timecardEndDate: nextTimecardEndDate,
            metaJson: nextMetaJson,
          },
        });

        return tx.projectBill.update({
          where: { id: existing.id },
          data: { totalAmount: nextLine.amount },
          include: {
            lineItems: { orderBy: { createdAt: "asc" } },
            attachments: { orderBy: { createdAt: "asc" } },
          },
        });
      });

      await this.audit.log(actor, "PROJECT_BILL_UPDATED", {
        companyId: project.companyId,
        projectId: project.id,
        metadata: {
          billId: updated.id,
          vendorName: updated.vendorName,
          billDate: updated.billDate,
          totalAmount: updated.totalAmount,
        },
      });

      return updated;
    } catch (err: any) {
      if (this.isBillTableMissingError(err)) {
        this.throwBillTablesNotMigrated();
      }
      throw err;
    }
  }

  async attachProjectBillFile(
    projectId: string,
    billId: string,
    dto: AttachProjectBillFileDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const bill = await this.prisma.projectBill.findFirst({
        where: {
          id: billId,
          projectId: project.id,
          companyId: project.companyId,
        },
        select: { id: true },
      });

      if (!bill) {
        throw new NotFoundException("Bill not found for this project");
      }

      const file = await this.prisma.projectFile.findFirst({
        where: {
          id: dto.projectFileId,
          projectId: project.id,
          companyId: project.companyId,
        },
        select: {
          id: true,
          storageUrl: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
        },
      });

      if (!file) {
        throw new NotFoundException("Project file not found for this project");
      }

      try {
        await this.prisma.projectBillAttachment.create({
          data: {
            billId: bill.id,
            projectFileId: file.id,
            fileUrl: file.storageUrl,
            fileName: file.fileName ?? null,
            mimeType: file.mimeType ?? null,
            sizeBytes: file.sizeBytes ?? null,
          },
        });
      } catch (err: any) {
        // Ignore duplicate attaches.
        if (String(err?.code ?? "") !== "P2002") {
          throw err;
        }
      }

      const out = await this.prisma.projectBill.findFirst({
        where: { id: bill.id },
        include: {
          lineItems: { orderBy: { createdAt: "asc" } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!out) {
        throw new NotFoundException("Bill not found for this project");
      }

      return out;
    } catch (err: any) {
      if (this.isBillTableMissingError(err)) {
        this.throwBillTablesNotMigrated();
      }
      throw err;
    }
  }

  async listProjectInvoices(projectId: string, actor: AuthenticatedUser) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const invoices = await this.prisma.projectInvoice.findMany({
        where: { projectId: project.id, companyId: project.companyId },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          projectId: true,
          companyId: true,
          status: true,
          invoiceSequenceNo: true,
          invoiceNo: true,
          billToName: true,
          billToEmail: true,
          memo: true,
          issuedAt: true,
          dueAt: true,
          lockedAt: true,
          totalAmount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const paymentTotals = await this.prisma.projectPayment.groupBy({
        by: ["invoiceId"],
        where: {
          projectId: project.id,
          companyId: project.companyId,
          status: ProjectPaymentStatus.RECORDED,
          invoiceId: { not: null },
        },
        _sum: { amount: true },
      });

      const paidByInvoiceId = new Map<string, number>();
      for (const row of paymentTotals) {
        if (row.invoiceId) {
          paidByInvoiceId.set(row.invoiceId, row._sum.amount ?? 0);
        }
      }

      if (this.paymentApplicationModelsAvailable()) {
        try {
          const p: any = this.prisma as any;
          const appTotals = await p.projectPaymentApplication.groupBy({
            by: ["invoiceId"],
            where: {
              projectId: project.id,
              companyId: project.companyId,
            },
            _sum: { amount: true },
          });

          for (const row of appTotals) {
            if (!row?.invoiceId) continue;
            const prev = paidByInvoiceId.get(row.invoiceId) ?? 0;
            paidByInvoiceId.set(row.invoiceId, prev + (row?._sum?.amount ?? 0));
          }
        } catch (err: any) {
          if (!this.isPaymentApplicationTableMissingError(err)) {
            throw err;
          }
        }
      }

      return invoices.map((inv) => {
        const paidAmount = paidByInvoiceId.get(inv.id) ?? 0;
        const balanceDue = Math.max(0, (inv.totalAmount ?? 0) - paidAmount);
        return { ...inv, paidAmount, balanceDue };
      });
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async createOrGetDraftInvoice(
    projectId: string,
    dto: CreateOrGetDraftInvoiceDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const shouldForceNew = dto.forceNew === true;

      const existingDraft = shouldForceNew
        ? null
        : await this.prisma.projectInvoice.findFirst({
            where: {
              projectId: project.id,
              companyId: project.companyId,
              status: ProjectInvoiceStatus.DRAFT,
            },
            orderBy: [{ createdAt: "desc" }],
          });

      const invoice = existingDraft
        ? await this.prisma.projectInvoice.update({
            where: { id: existingDraft.id },
            data: {
              billToName: dto.billToName ?? existingDraft.billToName,
              billToEmail: dto.billToEmail ?? existingDraft.billToEmail,
              memo: dto.memo ?? existingDraft.memo,
            },
          })
        : await this.prisma.projectInvoice.create({
            data: {
              companyId: project.companyId,
              projectId: project.id,
              status: ProjectInvoiceStatus.DRAFT,
              billToName: dto.billToName ?? null,
              billToEmail: dto.billToEmail ?? null,
              memo: dto.memo ?? null,
              createdByUserId: actor.userId,
            },
          });

      // Best effort: keep the living draft synced to PETL as the source of truth.
      // Only run if the Prisma client includes the new model.
      if (this.invoicePetlModelsAvailable()) {
        try {
          await this.syncDraftInvoiceFromPetl(projectId, invoice.id, actor);
        } catch (err: any) {
          const code = String(err?.code ?? "");
          const msg = String(err?.message ?? "");

          // If the DB schema is missing the invoice PETL table or newer columns,
          // don't block invoice creation; the draft can still be created and
          // manual items can be added.
          const isMissingPetlTable = this.isMissingPrismaTableError(
            err,
            "ProjectInvoicePetlLine",
          );
          const isMissingPetlColumn = code === "P2022" && msg.includes("ProjectInvoicePetlLine");

          if (!isMissingPetlTable && !isMissingPetlColumn) {
            throw err;
          }

          this.logger.warn(
            `Skipping syncDraftInvoiceFromPetl for invoice ${invoice.id} on project ${projectId} due to missing ProjectInvoicePetlLine schema (code=${code}).`,
          );
          // swallow missing-table / missing-column errors
        }
      }

      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async getProjectInvoice(projectId: string, invoiceId: string, actor: AuthenticatedUser) {
    this.ensureBillingModelsAvailable();

    try {
      await this.getProjectByIdForUser(projectId, actor);

      const invoice = await this.prisma.projectInvoice.findFirst({
        where: { id: invoiceId, projectId, companyId: actor.companyId },
        include: {
          lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      });

      if (!invoice) {
        throw new NotFoundException("Invoice not found for this project");
      }

      const legacyPayments = await this.prisma.projectPayment.findMany({
        where: {
          invoiceId: invoice.id,
          status: ProjectPaymentStatus.RECORDED,
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      });

      const payments: any[] = [...legacyPayments];

      if (this.paymentApplicationModelsAvailable()) {
        try {
          const p: any = this.prisma as any;
          const apps = await p.projectPaymentApplication.findMany({
            where: { invoiceId: invoice.id },
            include: { payment: true },
            orderBy: [{ appliedAt: "desc" }, { createdAt: "desc" }],
          });

          for (const a of apps) {
            const pay = a?.payment;
            payments.push({
              id: a.id,
              paymentId: a.paymentId,
              invoiceId: a.invoiceId,
              appliedAt: a.appliedAt,
              // surface original payment fields expected by the web UI
              status: pay?.status,
              method: pay?.method,
              paidAt: pay?.paidAt,
              reference: pay?.reference,
              note: pay?.note,
              createdAt: pay?.createdAt,
              amount: a.amount,
            });
          }
        } catch (err: any) {
          if (!this.isPaymentApplicationTableMissingError(err)) {
            throw err;
          }
        }
      }

      payments.sort((a, b) => {
        const ta = a?.paidAt ? new Date(a.paidAt).getTime() : 0;
        const tb = b?.paidAt ? new Date(b.paidAt).getTime() : 0;
        return tb - ta;
      });

      // Load PETL-derived invoice detail lines (best effort; table may not exist yet)
      let petlLines: any[] = [];
      if (this.invoicePetlModelsAvailable()) {
        try {
          const p: any = this.prisma as any;

          // Explicit select so we can safely operate even if some newer columns haven't
          // been added to the DB yet (e.g., sourceLineNoSnapshot).
          petlLines = await p.projectInvoicePetlLine.findMany({
            where: { invoiceId: invoice.id },
            orderBy: [
              { projectTreePathSnapshot: "asc" },
              { lineNoSnapshot: "asc" },
              { kind: "asc" },
              { createdAt: "asc" },
            ],
            select: {
              id: true,
              invoiceId: true,
              kind: true,
              billingTag: true,
              parentLineId: true,
              estimateVersionId: true,
              sowItemId: true,
              logicalItemId: true,
              projectParticleId: true,
              projectParticleLabelSnapshot: true,
              projectUnitIdSnapshot: true,
              projectUnitLabelSnapshot: true,
              projectBuildingIdSnapshot: true,
              projectBuildingLabelSnapshot: true,
              projectTreePathSnapshot: true,
              lineNoSnapshot: true,
              // intentionally omit sourceLineNoSnapshot
              categoryCodeSnapshot: true,
              selectionCodeSnapshot: true,
              descriptionSnapshot: true,
              unitSnapshot: true,
              percentCompleteSnapshot: true,
              contractItemAmount: true,
              contractTaxAmount: true,
              contractOpAmount: true,
              contractTotal: true,
              earnedItemAmount: true,
              earnedTaxAmount: true,
              earnedOpAmount: true,
              earnedTotal: true,
              prevBilledItemAmount: true,
              prevBilledTaxAmount: true,
              prevBilledOpAmount: true,
              prevBilledTotal: true,
              thisInvItemAmount: true,
              thisInvTaxAmount: true,
              thisInvOpAmount: true,
              thisInvTotal: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        } catch (err: any) {
          if (!this.isMissingPrismaTableError(err, "ProjectInvoicePetlLine") && String(err?.code ?? "") !== "P2022") {
            throw err;
          }
          petlLines = [];
        }
      }

      const paidAmount = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const balanceDue = Math.max(0, (invoice.totalAmount ?? 0) - paidAmount);

      return { ...invoice, payments, petlLines, paidAmount, balanceDue };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async updateInvoicePetlLine(
    projectId: string,
    invoiceId: string,
    lineId: string,
    dto: UpdateInvoicePetlLineDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();
    if (!this.invoicePetlModelsAvailable()) {
      this.throwBillingTablesNotMigrated();
    }

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const invoice = await this.prisma.projectInvoice.findFirst({
        where: { id: invoiceId, projectId: project.id, companyId: project.companyId },
        select: { id: true },
      });

      if (!invoice) {
        throw new NotFoundException("Invoice not found for this project");
      }

      const p: any = this.prisma as any;
      const existing = await p.projectInvoicePetlLine.findFirst({
        where: { id: lineId, invoiceId: invoice.id },
      });

      if (!existing) {
        throw new NotFoundException("Invoice detail line not found");
      }

      const updated = await p.projectInvoicePetlLine.update({
        where: { id: lineId },
        data: { billingTag: dto.billingTag },
      });

      return updated;
    } catch (err: any) {
      if (this.isBillingTableMissingError(err) || this.isMissingPrismaTableError(err, "ProjectInvoicePetlLine")) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  private clampPercentComplete(value: any) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  private formatBuildingLabel(b: any) {
    const code = String(b?.code ?? "").trim();
    const name = String(b?.name ?? "").trim();
    return [code, name].filter(Boolean).join(" ").trim() || null;
  }

  private formatUnitLabel(u: any) {
    const rawLabel = String(u?.label ?? "").trim();

    // Normalize Unit 1..9 => Unit 01..09 so lexical sorting is stable.
    // Keep non-numeric labels (e.g. "Unit A") unchanged.
    const label = rawLabel.replace(/^Unit\s+0*(\d+)\b/i, (_m: string, nRaw: string) => {
      const n = Number(nRaw);
      if (!Number.isFinite(n) || n <= 0) return rawLabel;
      const padded = n < 10 ? `0${n}` : String(n);
      return `Unit ${padded}`;
    });

    const floor = typeof u?.floor === "number" ? ` (Floor ${u.floor})` : "";
    const out = `${label}${floor}`.trim();
    return out || null;
  }

  private formatParticleLabel(p: any) {
    const full = String(p?.fullLabel ?? "").trim();
    const name = String(p?.name ?? "").trim();
    return (full || name || "").trim() || null;
  }

  async syncDraftInvoiceFromPetl(projectId: string, invoiceId: string, actor: AuthenticatedUser) {
    // Requires base billing models.
    this.ensureBillingModelsAvailable();
    this.ensureInvoicePetlModelsAvailable();

    const { project, invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);
    this.assertInvoiceEditable(invoice);

    const latestVersion = await this.getLatestEstimateVersionForPetl(projectId);
    if (!latestVersion) {
      return { status: "noop", reason: "no_estimate_version" };
    }

    const sowItems = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: latestVersion.id },
      select: {
        id: true,
        logicalItemId: true,
        estimateVersionId: true,
        projectParticleId: true,
        lineNo: true,
        sourceLineNo: true,
        description: true,
        unit: true,
        categoryCode: true,
        selectionCode: true,
        percentComplete: true,
        isAcvOnly: true,
        itemAmount: true,
        salesTaxAmount: true,
        rcvAmount: true,
      },
      orderBy: { lineNo: "asc" },
    });

    if (sowItems.length === 0) {
      // Clear any previous PETL invoice lines.
      const p: any = this.prisma as any;
      await p.projectInvoicePetlLine.deleteMany({ where: { invoiceId: invoice.id } });
      await this.recomputeInvoiceTotal(invoice.id);
      return { status: "noop", reason: "no_petl_rows" };
    }

    const particleIds = Array.from(new Set(sowItems.map((s) => s.projectParticleId).filter(Boolean)));

    const particles = await this.prisma.projectParticle.findMany({
      where: { id: { in: particleIds }, projectId },
      select: {
        id: true,
        name: true,
        fullLabel: true,
        unitId: true,
        buildingId: true,
      },
    });

    const particleById = new Map(particles.map((p) => [p.id, p]));

    const unitIds = Array.from(
      new Set(particles.map((p) => p.unitId).filter((v): v is string => typeof v === "string" && v.length > 0)),
    );

    const units = await this.prisma.projectUnit.findMany({
      where: { id: { in: unitIds }, projectId },
      select: { id: true, label: true, floor: true, buildingId: true },
    });
    const unitById = new Map(units.map((u) => [u.id, u]));

    const buildingIds = Array.from(
      new Set(
        [
          ...particles.map((p) => p.buildingId),
          ...units.map((u) => u.buildingId),
        ].filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );

    const buildings = await this.prisma.projectBuilding.findMany({
      where: { id: { in: buildingIds }, projectId },
      select: { id: true, code: true, name: true },
    });
    const buildingById = new Map(buildings.map((b) => [b.id, b]));

    // Previously billed (sum of prior invoices' deltas), grouped by (sowItemId, kind)
    const pAny: any = this.prisma as any;

    const priorInvoices = await this.prisma.projectInvoice.findMany({
      where: {
        projectId: project.id,
        companyId: project.companyId,
        status: {
          in: [
            ProjectInvoiceStatus.ISSUED,
            ProjectInvoiceStatus.PARTIALLY_PAID,
            ProjectInvoiceStatus.PAID,
          ],
        },
        id: { not: invoice.id },
      },
      select: { id: true },
    });

    const priorInvoiceIds = priorInvoices.map((i) => i.id);

    const prevByKey = new Map<
      string,
      {
        item: number;
        tax: number;
        op: number;
        total: number;
      }
    >();

    if (priorInvoiceIds.length > 0) {
      const priorLines = await pAny.projectInvoicePetlLine.findMany({
        where: { invoiceId: { in: priorInvoiceIds } },
        select: {
          sowItemId: true,
          kind: true,
          thisInvItemAmount: true,
          thisInvTaxAmount: true,
          thisInvOpAmount: true,
          thisInvTotal: true,
        },
      });

      for (const row of priorLines) {
        const key = `${row.sowItemId}:${row.kind}`;
        const existing = prevByKey.get(key) ?? { item: 0, tax: 0, op: 0, total: 0 };
        existing.item += row.thisInvItemAmount ?? 0;
        existing.tax += row.thisInvTaxAmount ?? 0;
        existing.op += row.thisInvOpAmount ?? 0;
        existing.total += row.thisInvTotal ?? 0;
        prevByKey.set(key, existing);
      }
    }

    const ACV_HOLDBACK_RATE = 0.8;

    const linesToCreate: any[] = [];

    for (const s of sowItems) {
      const pct = this.clampPercentComplete(s.percentComplete) / 100;

      const contractItem = s.itemAmount ?? 0;
      const contractTax = s.salesTaxAmount ?? 0;
      const contractTotal = s.rcvAmount ?? s.itemAmount ?? 0;
      const contractOp = Math.max(0, contractTotal - contractItem - contractTax);

      const earnedItem = contractItem * pct;
      const earnedTax = contractTax * pct;
      const earnedOp = contractOp * pct;
      const earnedTotal = contractTotal * pct;

      const particle = particleById.get(s.projectParticleId) ?? null;
      const unit = particle?.unitId ? unitById.get(particle.unitId) ?? null : null;
      const buildingId = particle?.buildingId ?? unit?.buildingId ?? null;
      const building = buildingId ? buildingById.get(buildingId) ?? null : null;

      const buildingLabel = this.formatBuildingLabel(building);
      const unitLabel = this.formatUnitLabel(unit);
      const particleLabel = this.formatParticleLabel(particle);

      const treePath = [buildingLabel, unitLabel, particleLabel].filter(Boolean).join(" · ") || null;

      const basePrev = prevByKey.get(`${s.id}:BASE`) ?? { item: 0, tax: 0, op: 0, total: 0 };

      const baseThisInvItem = earnedItem - basePrev.item;
      const baseThisInvTax = earnedTax - basePrev.tax;
      const baseThisInvOp = earnedOp - basePrev.op;
      const baseThisInvTotal = earnedTotal - basePrev.total;

      const baseLine = {
        invoiceId: invoice.id,
        kind: "BASE",
        parentLineId: null,
        estimateVersionId: s.estimateVersionId,
        sowItemId: s.id,
        logicalItemId: s.logicalItemId,
        projectParticleId: s.projectParticleId,
        projectParticleLabelSnapshot: particleLabel,
        projectUnitIdSnapshot: unit?.id ?? null,
        projectUnitLabelSnapshot: unitLabel,
        projectBuildingIdSnapshot: building?.id ?? null,
        projectBuildingLabelSnapshot: buildingLabel,
        projectTreePathSnapshot: treePath,
        lineNoSnapshot: s.lineNo,
        // NOTE: sourceLineNoSnapshot exists in Prisma schema but is missing in prod DB right now.
        // If we include it, createMany will throw P2022. We can re-enable once the DB is migrated.
        categoryCodeSnapshot: s.categoryCode ?? null,
        selectionCodeSnapshot: s.selectionCode ?? null,
        descriptionSnapshot: s.description,
        unitSnapshot: s.unit ?? null,
        percentCompleteSnapshot: this.clampPercentComplete(s.percentComplete),
        contractItemAmount: contractItem,
        contractTaxAmount: contractTax,
        contractOpAmount: contractOp,
        contractTotal,
        earnedItemAmount: earnedItem,
        earnedTaxAmount: earnedTax,
        earnedOpAmount: earnedOp,
        earnedTotal,
        prevBilledItemAmount: basePrev.item,
        prevBilledTaxAmount: basePrev.tax,
        prevBilledOpAmount: basePrev.op,
        prevBilledTotal: basePrev.total,
        thisInvItemAmount: baseThisInvItem,
        thisInvTaxAmount: baseThisInvTax,
        thisInvOpAmount: baseThisInvOp,
        thisInvTotal: baseThisInvTotal,
      };

      linesToCreate.push(baseLine);

      if (s.isAcvOnly) {
        const creditPrev =
          prevByKey.get(`${s.id}:ACV_HOLDBACK_CREDIT`) ?? { item: 0, tax: 0, op: 0, total: 0 };

        const creditEarnedItem = -1 * earnedItem * ACV_HOLDBACK_RATE;
        const creditEarnedTax = -1 * earnedTax * ACV_HOLDBACK_RATE;
        const creditEarnedOp = -1 * earnedOp * ACV_HOLDBACK_RATE;
        const creditEarnedTotal = -1 * earnedTotal * ACV_HOLDBACK_RATE;

        const creditLine = {
          ...baseLine,
          kind: "ACV_HOLDBACK_CREDIT",
          parentLineId: null,
          contractItemAmount: -1 * contractItem * ACV_HOLDBACK_RATE,
          contractTaxAmount: -1 * contractTax * ACV_HOLDBACK_RATE,
          contractOpAmount: -1 * contractOp * ACV_HOLDBACK_RATE,
          contractTotal: -1 * contractTotal * ACV_HOLDBACK_RATE,
          earnedItemAmount: creditEarnedItem,
          earnedTaxAmount: creditEarnedTax,
          earnedOpAmount: creditEarnedOp,
          earnedTotal: creditEarnedTotal,
          prevBilledItemAmount: creditPrev.item,
          prevBilledTaxAmount: creditPrev.tax,
          prevBilledOpAmount: creditPrev.op,
          prevBilledTotal: creditPrev.total,
          thisInvItemAmount: creditEarnedItem - creditPrev.item,
          thisInvTaxAmount: creditEarnedTax - creditPrev.tax,
          thisInvOpAmount: creditEarnedOp - creditPrev.op,
          thisInvTotal: creditEarnedTotal - creditPrev.total,
        };

        linesToCreate.push(creditLine);
      }
    }

    await pAny.$transaction(async (tx: any) => {
      await tx.projectInvoicePetlLine.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.projectInvoicePetlLine.createMany({ data: linesToCreate });

      // Recompute totals inside the same transaction
      const manualAgg = await tx.projectInvoiceLineItem.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      });
      const petlAgg = await tx.projectInvoicePetlLine.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { thisInvTotal: true },
      });
      const totalAmount = (manualAgg?._sum?.amount ?? 0) + (petlAgg?._sum?.thisInvTotal ?? 0);

      await tx.projectInvoice.update({
        where: { id: invoice.id },
        data: { totalAmount },
      });
    });

    return { status: "ok", estimateVersionId: latestVersion.id, lineCount: linesToCreate.length };
  }

  private async maybeSyncLivingDraftInvoiceFromPetl(projectId: string, companyId: string, actor: AuthenticatedUser) {
    if (!this.billingModelsAvailable()) return;
    if (!this.invoicePetlModelsAvailable()) return;

    const draft = await this.prisma.projectInvoice.findFirst({
      where: {
        projectId,
        companyId,
        status: ProjectInvoiceStatus.DRAFT,
      },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true },
    });

    if (!draft) return;

    try {
      await this.syncDraftInvoiceFromPetl(projectId, draft.id, actor);
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "ProjectInvoicePetlLine")) {
        throw err;
      }
    }
  }

  async addInvoiceLineItem(
    projectId: string,
    invoiceId: string,
    dto: AddInvoiceLineItemDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { project, invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);
      this.assertInvoiceEditable(invoice);

      const kind: ProjectInvoiceLineItemKind = dto.kind ?? ProjectInvoiceLineItemKind.MANUAL;

      const companyPriceListItemId = dto.companyPriceListItemId?.trim() || null;

      if (companyPriceListItemId) {
        const costBookItem = await this.prisma.companyPriceListItem.findFirst({
          where: {
            id: companyPriceListItemId,
            companyPriceList: {
              companyId: project.companyId,
              isActive: true,
            },
          },
          select: { id: true },
        });

        if (!costBookItem) {
          throw new BadRequestException("Cost book item not found for this company");
        }
      }

      const qty = dto.qty ?? null;
      const unitPrice = dto.unitPrice ?? null;

      const amount =
        typeof dto.amount === "number"
          ? dto.amount
          : qty != null && unitPrice != null
          ? qty * unitPrice
          : null;

      if (amount == null || !Number.isFinite(amount)) {
        throw new BadRequestException(
          "Line item requires amount or (qty and unitPrice) to compute amount",
        );
      }

      const maxSort = await this.prisma.projectInvoiceLineItem.aggregate({
        where: { invoiceId: invoice.id },
        _max: { sortOrder: true },
      });

      const sortOrder =
        typeof dto.sortOrder === "number" ? dto.sortOrder : (maxSort._max.sortOrder ?? 0) + 1;

      await this.prisma.projectInvoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          kind,
          billingTag: dto.billingTag ?? ProjectInvoicePetlLineBillingTag.NONE,
          companyPriceListItemId,
          description: dto.description,
          qty,
          unitPrice,
          amount,
          sortOrder,
        },
      });

      await this.recomputeInvoiceTotal(invoice.id);
      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async updateInvoiceLineItem(
    projectId: string,
    invoiceId: string,
    lineId: string,
    dto: UpdateInvoiceLineItemDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);
      this.assertInvoiceEditable(invoice);

      const existing = await this.prisma.projectInvoiceLineItem.findFirst({
        where: { id: lineId, invoiceId: invoice.id },
      });

      if (!existing) {
        throw new NotFoundException("Invoice line item not found");
      }

      const nextQty = typeof dto.qty === "number" ? dto.qty : existing.qty;
      const nextUnitPrice = typeof dto.unitPrice === "number" ? dto.unitPrice : existing.unitPrice;

      let nextCompanyPriceListItemId =
        dto.companyPriceListItemId === undefined ? (existing as any).companyPriceListItemId ?? null : dto.companyPriceListItemId;
      nextCompanyPriceListItemId =
        typeof nextCompanyPriceListItemId === "string" && nextCompanyPriceListItemId.trim()
          ? nextCompanyPriceListItemId.trim()
          : null;

      if (nextCompanyPriceListItemId) {
        const costBookItem = await this.prisma.companyPriceListItem.findFirst({
          where: {
            id: nextCompanyPriceListItemId,
            companyPriceList: {
              companyId: actor.companyId,
              isActive: true,
            },
          },
          select: { id: true },
        });

        if (!costBookItem) {
          throw new BadRequestException("Cost book item not found for this company");
        }
      }

      const nextAmount =
        typeof dto.amount === "number"
          ? dto.amount
          : nextQty != null && nextUnitPrice != null
          ? nextQty * nextUnitPrice
          : existing.amount;

      await this.prisma.projectInvoiceLineItem.update({
        where: { id: existing.id },
        data: {
          description: dto.description ?? existing.description,
          kind: dto.kind ?? (existing as any).kind,
          billingTag:
            dto.billingTag === undefined
              ? ((existing as any).billingTag ?? ProjectInvoicePetlLineBillingTag.NONE)
              : dto.billingTag,
          companyPriceListItemId: nextCompanyPriceListItemId,
          qty: dto.qty === undefined ? existing.qty : dto.qty,
          unitPrice: dto.unitPrice === undefined ? existing.unitPrice : dto.unitPrice,
          amount: nextAmount,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
      });

      await this.recomputeInvoiceTotal(invoice.id);
      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async deleteInvoiceLineItem(
    projectId: string,
    invoiceId: string,
    lineId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);
      this.assertInvoiceEditable(invoice);

      const existing = await this.prisma.projectInvoiceLineItem.findFirst({
        where: { id: lineId, invoiceId: invoice.id },
      });

      if (!existing) {
        throw new NotFoundException("Invoice line item not found");
      }

      await this.prisma.projectInvoiceLineItem.delete({ where: { id: existing.id } });
      await this.recomputeInvoiceTotal(invoice.id);
      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async issueInvoice(
    projectId: string,
    invoiceId: string,
    dto: IssueInvoiceDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { project, invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);

      if (invoice.status !== ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException("Only draft invoices can be issued");
      }

      const totalAmount = await this.recomputeInvoiceTotal(invoice.id);
      if (totalAmount === 0) {
        throw new BadRequestException("Cannot issue an invoice with a $0.00 total");
      }

      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        const counter = await tx.companyInvoiceCounter.upsert({
          where: { companyId: project.companyId },
          create: { companyId: project.companyId, lastInvoiceNo: 1 },
          update: { lastInvoiceNo: { increment: 1 } },
        });

        const sequenceNo = counter.lastInvoiceNo;
        const prefix = this.computeInvoicePrefixFromProjectName(project.name);
        const invoiceNo = prefix ? `${prefix}-${this.formatInvoiceNumber(sequenceNo)}` : this.formatInvoiceNumber(sequenceNo);

        await tx.projectInvoice.update({
          where: { id: invoice.id },
          data: {
            status: ProjectInvoiceStatus.ISSUED,
            invoiceSequenceNo: sequenceNo,
            invoiceNo,
            issuedAt: now,
            lockedAt: now,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : invoice.dueAt,
            billToName: dto.billToName ?? invoice.billToName,
            billToEmail: dto.billToEmail ?? invoice.billToEmail,
            memo: dto.memo ?? invoice.memo,
            totalAmount,
          },
        });
      });

      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async recordInvoicePayment(
    projectId: string,
    invoiceId: string,
    dto: RecordInvoicePaymentDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);

      if (invoice.status === ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException("Cannot record payments against a draft invoice");
      }

      if (invoice.status === ProjectInvoiceStatus.VOID) {
        throw new BadRequestException("Cannot record payments against a void invoice");
      }

      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      await this.prisma.projectPayment.create({
        data: {
          companyId: actor.companyId,
          projectId,
          invoiceId,
          status: ProjectPaymentStatus.RECORDED,
          method: dto.method as ProjectPaymentMethod,
          paidAt,
          amount: dto.amount,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          createdByUserId: actor.userId,
        },
      });

      const paidTotal = await this.computeInvoicePaymentTotal(invoiceId);

      let nextStatus: ProjectInvoiceStatus = invoice.status;
      if (paidTotal >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
        nextStatus = ProjectInvoiceStatus.PAID;
      } else if (paidTotal > 0) {
        nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
      } else {
        nextStatus = ProjectInvoiceStatus.ISSUED;
      }

      if (nextStatus !== invoice.status) {
        await this.prisma.projectInvoice.update({
          where: { id: invoiceId },
          data: { status: nextStatus },
        });
      }

      return this.getProjectInvoice(projectId, invoiceId, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async recordProjectPayment(projectId: string, dto: RecordProjectPaymentDto, actor: AuthenticatedUser) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      return this.prisma.projectPayment.create({
        data: {
          companyId: project.companyId,
          projectId: project.id,
          invoiceId: null,
          status: ProjectPaymentStatus.RECORDED,
          method: dto.method as ProjectPaymentMethod,
          paidAt,
          amount: dto.amount,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          createdByUserId: actor.userId,
        },
      });
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async listProjectPayments(projectId: string, actor: AuthenticatedUser) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const payments = await this.prisma.projectPayment.findMany({
        where: {
          projectId: project.id,
          companyId: project.companyId,
          status: ProjectPaymentStatus.RECORDED,
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      });

      const paymentIds = payments.map((p) => p.id);

      const appsByPaymentId = new Map<string, any[]>();
      const invoiceIds = new Set<string>();

      // Legacy: payments tied directly to an invoice.
      for (const p of payments) {
        if (p.invoiceId) invoiceIds.add(p.invoiceId);
      }

      if (paymentIds.length > 0 && this.paymentApplicationModelsAvailable()) {
        try {
          const pAny: any = this.prisma as any;
          const apps = await pAny.projectPaymentApplication.findMany({
            where: {
              projectId: project.id,
              companyId: project.companyId,
              paymentId: { in: paymentIds },
            },
            include: {
              invoice: { select: { id: true, invoiceNo: true, status: true, totalAmount: true } },
            },
            orderBy: [{ appliedAt: "desc" }, { createdAt: "desc" }],
          });

          for (const a of apps) {
            const list = appsByPaymentId.get(a.paymentId) ?? [];
            list.push(a);
            appsByPaymentId.set(a.paymentId, list);
            if (a.invoiceId) invoiceIds.add(a.invoiceId);
          }
        } catch (err: any) {
          if (!this.isPaymentApplicationTableMissingError(err)) {
            throw err;
          }
        }
      }

      const invoices = invoiceIds.size
        ? await this.prisma.projectInvoice.findMany({
            where: {
              id: { in: Array.from(invoiceIds) },
              projectId: project.id,
              companyId: project.companyId,
            },
            select: { id: true, invoiceNo: true, status: true, totalAmount: true },
          })
        : [];

      const invoiceById = new Map(invoices.map((i) => [i.id, i]));

      return payments.map((pay) => {
        // Legacy invoice-linked payments are treated as fully applied.
        if (pay.invoiceId) {
          const inv = invoiceById.get(pay.invoiceId) ?? null;
          const applications = [
            {
              id: pay.id,
              invoiceId: pay.invoiceId,
              invoiceNo: inv?.invoiceNo ?? null,
              invoiceStatus: inv?.status ?? null,
              amount: pay.amount,
              appliedAt: pay.paidAt,
              source: "legacy",
            },
          ];
          return {
            ...pay,
            appliedAmount: pay.amount,
            unappliedAmount: 0,
            applications,
          };
        }

        const apps = appsByPaymentId.get(pay.id) ?? [];
        const appliedAmount = apps.reduce((sum, a) => sum + (a.amount ?? 0), 0);
        const unappliedAmount = Math.max(0, (pay.amount ?? 0) - appliedAmount);

        const applications = apps.map((a) => ({
          id: a.id,
          invoiceId: a.invoiceId,
          invoiceNo: a.invoice?.invoiceNo ?? null,
          invoiceStatus: a.invoice?.status ?? null,
          amount: a.amount,
          appliedAt: a.appliedAt,
          source: "application",
        }));

        return {
          ...pay,
          appliedAmount,
          unappliedAmount,
          applications,
        };
      });
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async applyProjectPaymentToInvoice(
    projectId: string,
    paymentId: string,
    dto: ApplyPaymentToInvoiceDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();
    this.ensurePaymentApplicationModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const payment = await this.prisma.projectPayment.findFirst({
        where: {
          id: paymentId,
          projectId: project.id,
          companyId: project.companyId,
          status: ProjectPaymentStatus.RECORDED,
        },
      });

      if (!payment) {
        throw new NotFoundException("Payment not found for this project");
      }

      if (payment.invoiceId) {
        throw new BadRequestException(
          "This payment is already attached to an invoice (legacy mode) and cannot be partially applied.",
        );
      }

      const { invoice } = await this.getInvoiceOrThrow(projectId, dto.invoiceId, actor);
      if (invoice.status === ProjectInvoiceStatus.VOID) {
        throw new BadRequestException("Cannot apply payments to a void invoice");
      }

      const pAny: any = this.prisma as any;

      const existingApps = await pAny.projectPaymentApplication.findMany({
        where: {
          paymentId: payment.id,
        },
        select: { amount: true },
      });
      const alreadyApplied = existingApps.reduce((sum: number, a: any) => sum + (a.amount ?? 0), 0);
      const remaining = Math.max(0, (payment.amount ?? 0) - alreadyApplied);

      if (dto.amount > remaining) {
        throw new BadRequestException(
          `Apply amount exceeds remaining unapplied balance. Remaining: ${remaining.toFixed(2)}`,
        );
      }

      const invoicePaidBefore = await this.computeInvoicePaymentTotal(invoice.id);
      const invoiceBalanceBefore = Math.max(0, (invoice.totalAmount ?? 0) - invoicePaidBefore);

      if (dto.amount > invoiceBalanceBefore) {
        throw new BadRequestException(
          `Apply amount exceeds invoice balance due. Balance: ${invoiceBalanceBefore.toFixed(2)}`,
        );
      }

      await pAny.projectPaymentApplication.upsert({
        where: { paymentId_invoiceId: { paymentId: payment.id, invoiceId: invoice.id } },
        create: {
          companyId: project.companyId,
          projectId: project.id,
          paymentId: payment.id,
          invoiceId: invoice.id,
          amount: dto.amount,
          appliedAt: new Date(),
          createdByUserId: actor.userId,
        },
        update: {
          amount: { increment: dto.amount },
          appliedAt: new Date(),
        },
      });

      // Update invoice paid status for issued invoices.
      // (Draft invoices can have prepayments applied but should remain DRAFT.)
      if (invoice.status !== ProjectInvoiceStatus.DRAFT) {
        const paidTotal = await this.computeInvoicePaymentTotal(invoice.id);

        let nextStatus: ProjectInvoiceStatus = invoice.status;
        if (paidTotal >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
          nextStatus = ProjectInvoiceStatus.PAID;
        } else if (paidTotal > 0) {
          nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
        } else {
          nextStatus = ProjectInvoiceStatus.ISSUED;
        }

        if (nextStatus !== invoice.status) {
          await this.prisma.projectInvoice.update({
            where: { id: invoice.id },
            data: { status: nextStatus },
          });
        }
      }

      return { status: "applied" };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err) || this.isPaymentApplicationTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async unapplyProjectPaymentFromInvoice(
    projectId: string,
    paymentId: string,
    invoiceId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const payment = await this.prisma.projectPayment.findFirst({
        where: {
          id: paymentId,
          projectId: project.id,
          companyId: project.companyId,
          status: ProjectPaymentStatus.RECORDED,
        },
      });

      if (!payment) {
        throw new NotFoundException("Payment not found for this project");
      }

      // Legacy invoice-linked payments: detach from invoice.
      if (payment.invoiceId) {
        if (payment.invoiceId !== invoiceId) {
          throw new BadRequestException("Payment is not assigned to that invoice");
        }

        await this.prisma.projectPayment.update({
          where: { id: payment.id },
          data: { invoiceId: null },
        });

        // Recompute invoice status after removing the payment.
        const { invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);
        if (invoice.status !== ProjectInvoiceStatus.DRAFT) {
          const paidTotal = await this.computeInvoicePaymentTotal(invoice.id);
          let nextStatus: ProjectInvoiceStatus = invoice.status;
          if (paidTotal >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
            nextStatus = ProjectInvoiceStatus.PAID;
          } else if (paidTotal > 0) {
            nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
          } else {
            nextStatus = ProjectInvoiceStatus.ISSUED;
          }

          if (nextStatus !== invoice.status) {
            await this.prisma.projectInvoice.update({ where: { id: invoice.id }, data: { status: nextStatus } });
          }
        }

        return { status: "unapplied", mode: "legacy" };
      }

      // Application-based: delete the application record.
      this.ensurePaymentApplicationModelsAvailable();

      const pAny: any = this.prisma as any;
      const existing = await pAny.projectPaymentApplication.findFirst({
        where: { paymentId: payment.id, invoiceId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException("Payment is not applied to that invoice");
      }

      await pAny.projectPaymentApplication.delete({ where: { id: existing.id } });

      const { invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);
      if (invoice.status !== ProjectInvoiceStatus.DRAFT) {
        const paidTotal = await this.computeInvoicePaymentTotal(invoice.id);
        let nextStatus: ProjectInvoiceStatus = invoice.status;
        if (paidTotal >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
          nextStatus = ProjectInvoiceStatus.PAID;
        } else if (paidTotal > 0) {
          nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
        } else {
          nextStatus = ProjectInvoiceStatus.ISSUED;
        }

        if (nextStatus !== invoice.status) {
          await this.prisma.projectInvoice.update({ where: { id: invoice.id }, data: { status: nextStatus } });
        }
      }

      return { status: "unapplied", mode: "application" };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err) || this.isPaymentApplicationTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
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
          unitLabel: p.unit ? (this.formatUnitLabel(p.unit) ?? p.unit.label) : null,
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
