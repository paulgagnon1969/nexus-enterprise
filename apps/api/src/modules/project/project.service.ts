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
  PetlReconciliationEntryStatus,
  PetlPercentUpdateSessionStatus,
  PetlPercentUpdateTargetType,
  ProjectBillLineItemAmountSource,
  ProjectBillLineItemKind,
  ProjectBillStatus,
  ProjectInvoiceCategory,
  ProjectInvoiceLineItemKind,
  ProjectInvoicePetlLineBillingTag,
  ProjectInvoiceStatus,
  ProjectPaymentMethod,
  ProjectPaymentStatus,
  PetlActivity,
} from "@prisma/client";
import {
  calculateCostByActivity,
  extractCostComponents,
  getNextCoSequenceNo,
} from "./petl-cost-utils";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import {
  AddInvoiceLineItemDto,
  ApplyInvoiceToInvoiceDto,
  ApplyPaymentToInvoiceDto,
  AttachInvoiceFileDto,
  CreateOrGetDraftInvoiceDto,
  IssueInvoiceDto,
  RecordInvoicePaymentDto,
  RecordProjectPaymentDto,
  UpdateInvoiceDto,
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

  /**
   * Convert a GCS URI (gs://bucket/path) to a public HTTP URL.
   * Returns the original URL if it's not a GCS URI.
   */
  private toPublicFileUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("gs://")) {
      const match = url.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (match) {
        const base = process.env.GCS_PUBLIC_BASE_URL || "https://storage.googleapis.com";
        return `${base}/${match[1]}/${match[2]}`;
      }
    }
    return url;
  }

  /**
   * Auto-sync client portal membership when a project is linked to a TenantClient.
   * 
   * If the TenantClient has a linked User (portal access enabled), this method
   * ensures the user has a ProjectMembership with EXTERNAL_CONTACT scope.
   * 
   * This is called automatically when:
   * - A new project is created with a tenantClientId
   * - An existing project is updated to link to a TenantClient
   */
  private async syncClientMembershipForProject(
    projectId: string,
    companyId: string,
    tenantClientId: string | null | undefined,
  ): Promise<void> {
    if (!tenantClientId) return;

    const tenantClient = await this.prisma.tenantClient.findUnique({
      where: { id: tenantClientId },
      select: { userId: true },
    });

    if (!tenantClient?.userId) return;

    // Create or update membership for the client user
    await this.prisma.projectMembership.upsert({
      where: {
        userId_projectId: {
          userId: tenantClient.userId,
          projectId,
        },
      },
      create: {
        userId: tenantClient.userId,
        projectId,
        companyId,
        role: ProjectRole.VIEWER,
        scope: ProjectParticipantScope.EXTERNAL_CONTACT,
        visibility: ProjectVisibilityLevel.LIMITED,
      },
      update: {}, // no-op if already exists
    });

    this.logger.log(
      `Auto-synced client membership: project=${projectId}, client=${tenantClientId}, user=${tenantClient.userId}`
    );
  }

  async createProject(dto: CreateProjectDto, actor: AuthenticatedUser) {
    const { userId, companyId } = actor;

    const project = await this.prisma.project.create({
      data: {
        companyId,
        name: dto.name,
        externalId: dto.externalId || undefined,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 || undefined,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode || undefined,
        country: dto.country || undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        primaryContactName: dto.primaryContactName || undefined,
        primaryContactPhone: dto.primaryContactPhone || undefined,
        primaryContactEmail: dto.primaryContactEmail || undefined,
        tenantClientId: dto.tenantClientId || undefined,
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

    // Auto-sync client portal membership if project is linked to a TenantClient
    await this.syncClientMembershipForProject(project.id, companyId, dto.tenantClientId);

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
        tenantClientId: dto.tenantClientId !== undefined ? (dto.tenantClientId || null) : project.tenantClientId,
        status: dto.status ?? project.status
      }
    });

    // Auto-sync client portal membership if tenantClientId was changed
    if (dto.tenantClientId !== undefined && dto.tenantClientId !== project.tenantClientId) {
      await this.syncClientMembershipForProject(projectId, companyId, dto.tenantClientId);
    }

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

  /**
   * List projects for a client portal user.
   * 
   * Returns all projects where the user has a ProjectMembership,
   * grouped by company (since a client can have projects across multiple companies).
   * 
   * Data is filtered based on each membership's visibility level.
   */
  async listProjectsForClientPortal(userId: string) {
    const memberships = await this.prisma.projectMembership.findMany({
      where: {
        userId,
        scope: ProjectParticipantScope.EXTERNAL_CONTACT,
      },
      include: {
        project: {
          include: {
            company: { select: { id: true, name: true } },
            tenantClient: {
              where: { userId },
              select: { id: true, displayName: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { project: { updatedAt: "desc" } },
    });

    // Group by company
    const byCompany = new Map<string, {
      company: { id: string; name: string };
      projects: Array<{
        id: string;
        name: string;
        status: string;
        addressLine1: string;
        city: string;
        state: string;
        visibility: ProjectVisibilityLevel;
        updatedAt: Date;
      }>;
    }>();

    for (const m of memberships) {
      const companyId = m.project.companyId;
      const companyData = m.project.company;

      if (!byCompany.has(companyId)) {
        byCompany.set(companyId, {
          company: companyData,
          projects: [],
        });
      }

      byCompany.get(companyId)!.projects.push({
        id: m.project.id,
        name: m.project.name,
        status: m.project.status,
        addressLine1: m.project.addressLine1,
        city: m.project.city,
        state: m.project.state,
        visibility: m.visibility,
        updatedAt: m.project.updatedAt,
      });
    }

    return Array.from(byCompany.values());
  }

  /**
   * Get project details for a client portal user.
   * 
   * Returns project data filtered based on the user's visibility level:
   * - FULL: All project data (same as internal users)
   * - LIMITED: Basic info, messages, files, schedule; excludes financials/PETL details
   * - READ_ONLY: Same as LIMITED but emphasizes no edit capability
   */
  async getProjectForClientPortal(projectId: string, userId: string) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        userId_projectId: { userId, projectId },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this project");
    }

    const visibility = membership.visibility;

    // Fetch project with all potential includes, then filter based on visibility
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        company: { select: { id: true, name: true } },
        tenantClient: {
          select: { id: true, displayName: true, firstName: true, lastName: true, email: true, phone: true },
        },
        scheduleTasks: {
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            trade: true,
            phaseLabel: true,
            room: true,
            startDate: true,
            endDate: true,
            durationDays: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // Fetch message threads separately if visibility allows
    let messageThreads: any[] = [];
    if (visibility !== ProjectVisibilityLevel.READ_ONLY) {
      messageThreads = await this.prisma.messageThread.findMany({
        where: {
          projectId,
          type: MessageThreadType.CUSTOMER,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, body: true, createdAt: true },
          },
        },
      });
    }

    // Build response
    const tenantClient = project.tenantClient;
    const response: any = {
      id: project.id,
      name: project.name,
      status: project.status,
      addressLine1: project.addressLine1,
      addressLine2: project.addressLine2,
      city: project.city,
      state: project.state,
      postalCode: project.postalCode,
      company: project.company,
      visibility,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      // Client contact info (their own info)
      clientContact: tenantClient ? {
        name: tenantClient.displayName || `${tenantClient.firstName} ${tenantClient.lastName}`,
        email: tenantClient.email,
        phone: tenantClient.phone,
      } : null,
      // Schedule is always visible - map to friendly format
      schedule: project.scheduleTasks.map((t) => ({
        id: t.id,
        name: t.room ? `${t.room} - ${t.phaseLabel}` : t.phaseLabel,
        trade: t.trade,
        startDate: t.startDate,
        endDate: t.endDate,
        durationDays: t.durationDays,
      })),
    };

    // Add message threads for LIMITED and FULL visibility
    if (visibility !== ProjectVisibilityLevel.READ_ONLY && messageThreads.length > 0) {
      response.recentMessages = messageThreads.map((t) => ({
        id: t.id,
        subject: t.subject,
        updatedAt: t.updatedAt,
        lastMessage: t.messages?.[0] ?? null,
      }));
    }

    // FULL visibility gets additional financial/PETL data
    if (visibility === ProjectVisibilityLevel.FULL) {
      response.hasFullAccess = true;
    }

    return response;
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

  /**
   * Get Bill of Materials (BOM) for a project.
   * 
   * Returns two views:
   * 1. PETL BOM - Aggregated material costs by Cat/Sel (qty × materialAmount per line)
   * 2. Components BOM - De-duplicated components from ComponentSummary (CSV import)
   */
  async getProjectBom(projectId: string, actor: AuthenticatedUser) {
    const project = await this.getProjectByIdForUser(projectId, actor);

    // Get the latest estimate version
    const estimateVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId: project.id },
      orderBy: { sequenceNo: "desc" },
      select: { id: true, sequenceNo: true },
    });

    if (!estimateVersion) {
      return {
        projectId: project.id,
        projectName: project.name,
        costDashboard: {
          workersWage: 0,
          laborBurden: 0,
          laborOverhead: 0,
          materials: 0,
          equipment: 0,
          marketConditions: 0,
          salesTax: 0,
          totalLabor: 0,
          totalCost: 0,
          lineCount: 0,
        },
        petlBom: { items: [], byCategory: [], totalQty: 0, totalMaterialCost: 0, lineCount: 0, uniqueCatSelCount: 0 },
        componentsBom: { items: [], totalCost: 0, itemCount: 0, rawRowCount: 0 },
      };
    }

    // ========== PETL BOM: Aggregate by Cat/Sel from SowItems ==========
    // materialAmount is PER-UNIT, so total material = qty × materialAmount
    const sowItems = await this.prisma.sowItem.findMany({
      where: { estimateVersionId: estimateVersion.id },
      select: {
        id: true,
        lineNo: true,
        description: true,
        qty: true,
        unit: true,
        materialAmount: true,  // per-unit material cost
        categoryCode: true,
        selectionCode: true,
        projectParticle: {
          select: { id: true, fullLabel: true },
        },
      },
      orderBy: { lineNo: "asc" },
    });

    // Aggregate by Cat/Sel combination
    const petlAggregated = new Map<
      string,
      {
        categoryCode: string;
        selectionCode: string;
        totalQty: number;
        unit: string;
        totalMaterialCost: number;  // sum of (qty × materialAmount)
        lineCount: number;
        descriptions: Set<string>;
      }
    >();

    for (const item of sowItems) {
      const cat = item.categoryCode || "";
      const sel = item.selectionCode || "";
      const key = `${cat}|${sel}`;
      const qty = item.qty ?? 0;
      const perUnitMaterial = item.materialAmount ?? 0;
      const lineMaterialCost = qty * perUnitMaterial;  // MULTIPLY qty × per-unit

      const existing = petlAggregated.get(key);
      if (existing) {
        existing.totalQty += qty;
        existing.totalMaterialCost += lineMaterialCost;
        existing.lineCount += 1;
        if (item.description) existing.descriptions.add(item.description);
      } else {
        petlAggregated.set(key, {
          categoryCode: cat,
          selectionCode: sel,
          totalQty: qty,
          unit: item.unit ?? "",
          totalMaterialCost: lineMaterialCost,
          lineCount: 1,
          descriptions: new Set(item.description ? [item.description] : []),
        });
      }
    }

    // Convert to array and sort by material cost
    const petlItems = Array.from(petlAggregated.values())
      .map((item) => ({
        categoryCode: item.categoryCode,
        selectionCode: item.selectionCode,
        catSel: item.categoryCode + (item.selectionCode ? `/${item.selectionCode}` : ""),
        totalQty: item.totalQty,
        unit: item.unit,
        totalMaterialCost: item.totalMaterialCost,
        lineCount: item.lineCount,
        sampleDescriptions: Array.from(item.descriptions).slice(0, 3),
      }))
      .sort((a, b) => b.totalMaterialCost - a.totalMaterialCost);

    // Aggregate by category for summary
    const petlByCategory = new Map<string, { totalQty: number; totalMaterialCost: number; lineCount: number }>();
    for (const item of petlItems) {
      const cat = item.categoryCode || "Uncategorized";
      const existing = petlByCategory.get(cat);
      if (existing) {
        existing.totalQty += item.totalQty;
        existing.totalMaterialCost += item.totalMaterialCost;
        existing.lineCount += item.lineCount;
      } else {
        petlByCategory.set(cat, {
          totalQty: item.totalQty,
          totalMaterialCost: item.totalMaterialCost,
          lineCount: item.lineCount,
        });
      }
    }

    const petlCategorySummary = Array.from(petlByCategory.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.totalMaterialCost - a.totalMaterialCost);

    // ========== COMPONENTS BOM: De-duplicate by code ==========
    const components = await this.prisma.componentSummary.findMany({
      where: { estimateVersionId: estimateVersion.id },
    });

    // De-duplicate - the CSV import created duplicate rows
    const componentsByCode = new Map<string, {
      code: string;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }>();

    for (const c of components) {
      const code = c.code ?? "";
      if (!componentsByCode.has(code)) {
        componentsByCode.set(code, {
          code,
          description: c.description ?? "",
          quantity: c.quantity ?? 0,
          unit: c.unit ?? "",
          unitPrice: c.unitPrice ?? 0,
          total: c.total ?? 0,
        });
      }
    }

    const componentItems = Array.from(componentsByCode.values())
      .sort((a, b) => b.total - a.total);

    const componentsTotalCost = componentItems.reduce((sum, c) => sum + c.total, 0);

    // ========== COST DASHBOARD: Aggregate from RawXactRow ==========
    // These are per-unit costs that we multiply by qty
    const rawXactRows = await this.prisma.rawXactRow.findMany({
      where: { estimateVersionId: estimateVersion.id },
      select: {
        qty: true,
        workersWage: true,
        laborBurden: true,
        laborOverhead: true,
        material: true,
        equipment: true,
        marketConditions: true,
        salesTax: true,
        itemAmount: true,
      },
    });

    const costDashboard = {
      workersWage: 0,
      laborBurden: 0,
      laborOverhead: 0,
      materials: 0,
      equipment: 0,
      marketConditions: 0,
      salesTax: 0,
      totalLabor: 0,  // wage + burden + overhead
      totalCost: 0,   // sum of all itemAmounts
      lineCount: rawXactRows.length,
    };

    for (const row of rawXactRows) {
      const qty = row.qty ?? 0;
      costDashboard.workersWage += qty * (row.workersWage ?? 0);
      costDashboard.laborBurden += qty * (row.laborBurden ?? 0);
      costDashboard.laborOverhead += qty * (row.laborOverhead ?? 0);
      costDashboard.materials += qty * (row.material ?? 0);
      costDashboard.equipment += qty * (row.equipment ?? 0);
      costDashboard.marketConditions += qty * (row.marketConditions ?? 0);
      costDashboard.salesTax += row.salesTax ?? 0;  // salesTax is already total, not per-unit
      costDashboard.totalCost += row.itemAmount ?? 0;
    }

    costDashboard.totalLabor =
      costDashboard.workersWage + costDashboard.laborBurden + costDashboard.laborOverhead;

    // ========== Summary totals ==========
    const petlTotalQty = sowItems.reduce((sum, item) => sum + (item.qty ?? 0), 0);
    const petlTotalMaterialCost = sowItems.reduce(
      (sum, item) => sum + (item.qty ?? 0) * (item.materialAmount ?? 0),
      0
    );

    return {
      projectId: project.id,
      projectName: project.name,
      estimateVersionId: estimateVersion.id,
      costDashboard,
      petlBom: {
        items: petlItems,
        byCategory: petlCategorySummary,
        totalQty: petlTotalQty,
        totalMaterialCost: petlTotalMaterialCost,
        lineCount: sowItems.length,
        uniqueCatSelCount: petlItems.length,
      },
      componentsBom: {
        items: componentItems,
        totalCost: componentsTotalCost,
        itemCount: componentItems.length,
        rawRowCount: components.length,
      },
    };
  }

  /**
   * Get raw ComponentSummary data for a project - no processing, no de-duplication.
   * This is for debugging/analysis to understand what was imported from the CSV.
   */
  async getProjectComponentsRaw(projectId: string, actor: AuthenticatedUser) {
    const project = await this.getProjectByIdForUser(projectId, actor);

    const estimateVersion = await this.prisma.estimateVersion.findFirst({
      where: { projectId: project.id },
      orderBy: { sequenceNo: "desc" },
      select: { id: true, sequenceNo: true },
    });

    if (!estimateVersion) {
      return {
        projectId: project.id,
        projectName: project.name,
        items: [],
        totalRows: 0,
        summary: { totalCost: 0, totalQty: 0 },
      };
    }

    // Get ALL raw rows - no de-duplication
    const components = await this.prisma.componentSummary.findMany({
      where: { estimateVersionId: estimateVersion.id },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });

    // Group by code to show duplicates together
    const groupedByCode = new Map<string, any[]>();
    for (const c of components) {
      const code = c.code ?? "";
      if (!groupedByCode.has(code)) {
        groupedByCode.set(code, []);
      }
      groupedByCode.get(code)!.push({
        id: c.id,
        code: c.code,
        description: c.description,
        quantity: c.quantity,
        unit: c.unit,
        unitPrice: c.unitPrice,
        total: c.total,
        taxStatus: c.taxStatus,
        contractorSupplied: c.contractorSupplied,
        createdAt: c.createdAt,
      });
    }

    // Convert to array of groups, sorted by total (descending)
    const groups = Array.from(groupedByCode.entries())
      .map(([code, items]) => ({
        code,
        count: items.length,
        isDuplicate: items.length > 1,
        totalForCode: items.reduce((sum, i) => sum + (i.total ?? 0), 0),
        items,
      }))
      .sort((a, b) => b.totalForCode - a.totalForCode);

    // Summary stats
    const totalCost = components.reduce((sum, c) => sum + (c.total ?? 0), 0);
    const totalQty = components.reduce((sum, c) => sum + (c.quantity ?? 0), 0);
    const uniqueCodes = groupedByCode.size;
    const duplicateCount = components.length - uniqueCodes;
    const duplicateGroups = groups.filter(g => g.isDuplicate);

    return {
      projectId: project.id,
      projectName: project.name,
      estimateVersionId: estimateVersion.id,
      groups,  // Grouped by code
      totalRows: components.length,
      uniqueCodes,
      duplicateCount,
      duplicateGroupCount: duplicateGroups.length,
      summary: {
        totalCost,
        totalQty,
        // What the total SHOULD be if we de-dup
        dedupedTotalCost: groups.reduce((sum, g) => sum + (g.items[0]?.total ?? 0), 0),
      },
    };
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
    contentHash?: string | null;
  }) {
    const { projectId, actor, fileUri, fileName, mimeType, sizeBytes, folderId, contentHash } = options;
    const { companyId, userId } = actor;

    this.logger.log(`[registerProjectFile] Starting for projectId=${projectId}, fileName=${fileName}`);

    try {
      if (!fileUri || !fileUri.trim()) {
        throw new BadRequestException("fileUri is required");
      }
      if (!fileName || !fileName.trim()) {
        throw new BadRequestException("fileName is required");
      }

      // Validate project access (throws if not allowed)
      await this.getProjectByIdForUser(projectId, actor);

    // Deduplication: Check if a file with the same content hash already exists
    // in this project (project-scoped only for security - no cross-tenant linking)
    if (contentHash && contentHash.trim()) {
      const existingFile = await this.prisma.projectFile.findFirst({
        where: {
          companyId,
          projectId,
          contentHash: contentHash.trim(),
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingFile) {
        this.logger.log(
          `Dedup: Found existing file with hash ${contentHash.substring(0, 12)}... in project ${projectId}, returning link to ${existingFile.id}`,
        );

        await this.audit.log(actor, "PROJECT_FILE_DEDUP_LINKED", {
          companyId,
          projectId,
          metadata: {
            existingFileId: existingFile.id,
            fileName: existingFile.fileName,
            contentHash,
            newFileUri: fileUri,
          },
        });

        // Return the existing file instead of creating a duplicate
        return { ...existingFile, isDuplicate: true };
      }
    }

    const file = await this.prisma.projectFile.create({
      data: {
        companyId,
        projectId,
        folderId: folderId || undefined,
        storageUrl: fileUri,
        fileName,
        mimeType: mimeType || null,
        sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
        contentHash: contentHash?.trim() || null,
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

    this.logger.log(`[registerProjectFile] Success: fileId=${file.id}`);
    return file;
    } catch (err: any) {
      const errCode = err?.code ?? 'no code';
      const errMeta = err?.meta ? JSON.stringify(err.meta) : 'no meta';
      this.logger.error(`[registerProjectFile] FAILED for projectId=${projectId}, fileName=${fileName}`);
      this.logger.error(`[registerProjectFile] Error: ${err?.message ?? err}`);
      this.logger.error(`[registerProjectFile] Code: ${errCode}, Meta: ${errMeta}`);
      throw err;
    }
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

      // Capture the currently active PETL-backed estimate version (if any) so we
      // can attempt to carry forward reconciliation entries after the new
      // Xactimate import completes.
      const previousVersion = await this.getLatestEstimateVersionForPetl(projectId);

      const result = await importXactCsvForProject({
        projectId,
        csvPath,
        importedByUserId: actor.userId
      });

      // Best effort: carry forward reconciliation entries from the previous
      // estimate version (if one existed) onto the newly imported version.
      if (previousVersion && previousVersion.id !== result.estimateVersionId) {
        try {
          await this.carryForwardPetlReconciliationForNewEstimateVersion({
            projectId,
            previousEstimateVersionId: previousVersion.id,
            newEstimateVersionId: result.estimateVersionId,
            actor,
          });
        } catch (err: any) {
          // If reconciliation tables are missing in this environment, treat as
          // non-fatal and allow the import to succeed.
          if (
            !this.isMissingPrismaTableError(err, "PetlReconciliationEntry") &&
            !this.isMissingPrismaTableError(err, "PetlReconciliationCase")
          ) {
            this.logger.error(
              `Failed to carry forward PETL reconciliation for project ${projectId}`,
              err instanceof Error ? err.stack : String(err),
            );
          }
        }
      }

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

      // Auto-create a living draft invoice and sync it from PETL (50% deposit ready).
      // Best effort - don't fail the import if billing tables aren't ready yet.
      try {
        if (this.billingModelsAvailable()) {
          this.logger.log(`[Import] Auto-creating draft invoice for project ${projectId}`);
          await this.createOrGetDraftInvoice(projectId, {}, actor);
        }
      } catch (invoiceErr: any) {
        this.logger.warn(
          `[Import] Failed to auto-create draft invoice for project ${projectId}: ${invoiceErr?.message ?? invoiceErr}`,
        );
        // Non-fatal: import succeeded, invoice can be created manually later.
      }

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

  private async carryForwardPetlReconciliationForNewEstimateVersion(options: {
    projectId: string;
    previousEstimateVersionId: string;
    newEstimateVersionId: string;
    actor: AuthenticatedUser;
  }) {
    const { projectId, previousEstimateVersionId, newEstimateVersionId, actor } = options;

    // If reconciliation tables are not present in this environment, treat
    // carry-forward as a no-op.
    try {
      const anyCase = await this.prisma.petlReconciliationCase.findFirst({
        where: { projectId },
        select: { id: true },
      });
      if (!anyCase) {
        return { carried: 0, orphans: 0 };
      }
    } catch (err: any) {
      if (
        this.isMissingPrismaTableError(err, "PetlReconciliationCase") ||
        this.isMissingPrismaTableError(err, "PetlReconciliationEntry")
      ) {
        return { carried: 0, orphans: 0 };
      }
      throw err;
    }

    return this.prisma.$transaction(async (tx) => {
      // Load all reconciliation entries tied to the previous estimate version.
      const previousEntries = await tx.petlReconciliationEntry.findMany({
        where: {
          projectId,
          estimateVersionId: previousEstimateVersionId,
        },
      });

      if (!previousEntries.length) {
        return { carried: 0, orphans: 0 };
      }

      // Map SowItems from previous -> new estimate version by logicalItemId so we
      // can attach carried-forward entries to the appropriate line when
      // possible.
      const previousSowItems = await tx.sowItem.findMany({
        where: { estimateVersionId: previousEstimateVersionId },
        select: {
          id: true,
          logicalItemId: true,
          lineNo: true,
          projectParticleId: true,
          rawRow: {
            select: { lineNo: true },
          },
        },
      });

      const newSowItems = await tx.sowItem.findMany({
        where: { estimateVersionId: newEstimateVersionId },
        select: {
          id: true,
          logicalItemId: true,
          lineNo: true,
          projectParticleId: true,
        },
      });

      const prevSowById = new Map<string, (typeof previousSowItems)[number]>(
        previousSowItems.map((s) => [s.id, s]),
      );

      const newByLogical = new Map<
        string,
        { id: string; lineNo: number | null; projectParticleId: string | null }[]
      >();
      for (const s of newSowItems) {
        const logicalId = s.logicalItemId;
        if (!logicalId) continue;
        const arr = newByLogical.get(logicalId);
        const payload = {
          id: s.id,
          lineNo: s.lineNo ?? null,
          projectParticleId: s.projectParticleId ?? null,
        };
        if (arr) arr.push(payload);
        else newByLogical.set(logicalId, [payload]);
      }

      const createData: any[] = [];
      let carried = 0;
      let orphans = 0;

      for (const entry of previousEntries) {
        const prevSow = entry.parentSowItemId ? prevSowById.get(entry.parentSowItemId) : null;
        const logicalId = prevSow?.logicalItemId ?? null;

        const candidates = logicalId ? newByLogical.get(logicalId) ?? [] : [];
        let target: { id: string; lineNo: number | null; projectParticleId: string | null } | null =
          null;
        let isOrphan = false;

        if (candidates.length === 1) {
          target = candidates[0];
        } else {
          // Zero or multiple matches = ambiguous; treat as orphan that requires
          // manual reassignment in the latest PETL.
          isOrphan = true;
        }

        const originEstimateVersionId =
          entry.originEstimateVersionId ?? entry.estimateVersionId ?? previousEstimateVersionId;
        const originSowItemId = entry.originSowItemId ?? entry.parentSowItemId ?? null;

        let originLineNo = entry.originLineNo ?? null;
        if (originLineNo == null && originSowItemId) {
          const originSow = prevSowById.get(originSowItemId);
          originLineNo = originSow?.rawRow?.lineNo ?? originSow?.lineNo ?? null;
        }

        const parentSowItemId = isOrphan ? null : target?.id ?? null;
        const projectParticleId =
          (!isOrphan && target?.projectParticleId) || entry.projectParticleId;

        createData.push({
          projectId,
          estimateVersionId: newEstimateVersionId,
          caseId: entry.caseId,
          parentSowItemId,
          projectParticleId,
          kind: entry.kind,
          tag: entry.tag,
          status: entry.status,
          description: entry.description,
          categoryCode: entry.categoryCode,
          selectionCode: entry.selectionCode,
          unit: entry.unit,
          qty: entry.qty,
          unitCost: entry.unitCost,
          itemAmount: entry.itemAmount,
          salesTaxAmount: entry.salesTaxAmount,
          opAmount: entry.opAmount,
          rcvAmount: entry.rcvAmount,
          rcvComponentsJson: entry.rcvComponentsJson,
          percentComplete: entry.percentComplete,
          isPercentCompleteLocked: entry.isPercentCompleteLocked,
          companyPriceListItemId: entry.companyPriceListItemId,
          sourceSnapshotJson: entry.sourceSnapshotJson,
          note: entry.note,
          createdByUserId: actor.userId,
          originEstimateVersionId,
          originSowItemId,
          originLineNo,
          carriedForwardFromEntryId: entry.id,
          carryForwardCount: (entry.carryForwardCount ?? 0) + 1,
        });

        if (isOrphan) orphans += 1;
        else carried += 1;
      }

      if (!createData.length) {
        return { carried: 0, orphans: 0 };
      }

      await tx.petlReconciliationEntry.createMany({ data: createData });

      return { carried, orphans };
    });
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
    if (ids.length === 0)
      return new Map<string, { id: string; name: string; fullLabel: string; externalGroupCode: string | null }>();

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
        externalGroupCode: true,
      },
    });

    const byId = new Map<
      string,
      { id: string; name: string; fullLabel: string; externalGroupCode: string | null }
    >();
    for (const p of particles) {
      byId.set(p.id, {
        id: p.id,
        name: p.name,
        fullLabel: p.fullLabel,
        externalGroupCode: (p as any).externalGroupCode ?? null,
      });
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
    try {
      console.log('[getPetlForProject] START', { projectId, companyId, userId: actor.userId });
      
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, companyId }
      });

      if (!project) {
        console.log('[getPetlForProject] Project not found');
        throw new NotFoundException("Project not found in this company");
      }
      
      console.log('[getPetlForProject] Project found:', project.name);

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
      // Fetch ALL reconciliation entries (including note-only with rcvAmount=null)
      // so notes from CSV imports are visible in the PETL UI as subordinate items.
      const [allEntries, reconActivity] = await Promise.all([
        this.prisma.petlReconciliationEntry.findMany({
          where: {
            projectId,
            estimateVersionId: latestVersion.id,
            parentSowItemId: { not: null },
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

      reconciliationEntriesRaw = allEntries;
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

      console.log('[getPetlForProject] SUCCESS', { itemCount: items.length, estimateVersionId: latestVersion.id });
      
      return {
        projectId,
        estimateVersionId: latestVersion.id,
        items,
        reconciliationEntries,
        reconciliationActivitySowItemIds,
      };
    } catch (error: any) {
      console.error('[getPetlForProject] ERROR:', {
        message: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 5),
        projectId,
        companyId
      });
      throw error;
    }
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
                status: PetlReconciliationEntryStatus.APPROVED,
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
      select: {
        logicalItemId: true,
        lineNo: true,
        rawRow: { select: { lineNo: true } },
      },
    });

    if (!sowItem) {
      return null;
    }

    // The source line number (Xact "#") is what users recognize and what we
    // preserve in originLineNo when carrying forward entries across versions.
    const sourceLineNo = sowItem.rawRow?.lineNo ?? sowItem.lineNo;

    const findCase = async (includeAttachments: boolean) => {
      // First try: direct match by sowItemId or logicalItemId
      const directMatch = await this.prisma.petlReconciliationCase.findFirst({
        where: {
          projectId,
          OR: [
            { sowItemId },
            { logicalItemId: sowItem.logicalItemId },
          ],
        },
        include: includeAttachments
          ? {
              entries: {
                orderBy: { createdAt: "asc" },
                include: { attachments: { orderBy: { createdAt: "asc" } } },
              },
              events: { orderBy: { createdAt: "asc" } },
            }
          : {
              entries: { orderBy: { createdAt: "asc" } },
              events: { orderBy: { createdAt: "asc" } },
            },
      });

      if (directMatch) return directMatch;

      // Fallback: find case via entries that reference this source line number.
      // This handles cases where the logicalItemId changed between versions
      // but the entries still have originLineNo pointing to the same line.
      if (sourceLineNo != null) {
        const entryWithOriginLine = await this.prisma.petlReconciliationEntry.findFirst({
          where: {
            projectId,
            originLineNo: sourceLineNo,
          },
          select: { caseId: true },
        });

        if (entryWithOriginLine) {
          return this.prisma.petlReconciliationCase.findFirst({
            where: { id: entryWithOriginLine.caseId, projectId },
            include: includeAttachments
              ? {
                  entries: {
                    orderBy: { createdAt: "asc" },
                    include: { attachments: { orderBy: { createdAt: "asc" } } },
                  },
                  events: { orderBy: { createdAt: "asc" } },
                }
              : {
                  entries: { orderBy: { createdAt: "asc" } },
                  events: { orderBy: { createdAt: "asc" } },
                },
          });
        }
      }

      return null;
    };

    try {
      // Preferred path: include attachments when the table exists.
      return await findCase(true);
    } catch (err: any) {
      // Backwards-compatible: in environments where the PetlReconciliationAttachment
      // table/migration is missing, fall back to loading the case without
      // attachments instead of 500-ing the project page.
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationAttachment")) {
        throw err;
      }

      return findCase(false);
    }
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
        rawRow: {
          select: {
            workersWage: true,
            laborBurden: true,
            laborOverhead: true,
            material: true,
            equipment: true,
            activity: true,
          },
        },
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

    // Extract Xactimate cost components from the raw row for activity-based calculations
    const xactCostComponents = sowItem.rawRow
      ? {
          workersWage: sowItem.rawRow.workersWage ?? null,
          laborBurden: sowItem.rawRow.laborBurden ?? null,
          laborOverhead: sowItem.rawRow.laborOverhead ?? null,
          material: sowItem.rawRow.material ?? null,
          equipment: sowItem.rawRow.equipment ?? null,
          sourceActivity: sowItem.rawRow.activity ?? null,
        }
      : null;

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
      xactCostComponents,
      reconciliationCase: existingCase,
    };
  }

  /**
   * Look up historical cost components by CAT/SEL from the tenant's PETL data.
   * This queries RawXactRow across all company projects to find matching line items
   * and returns aggregated cost component data for activity-based pricing.
   */
  async lookupCostComponentsByCatSel(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    cat: string | null,
    sel: string | null,
  ) {
    // Validate project access
    await this.getProjectByIdForUser(projectId, actor);

    if (!cat && !sel) {
      return {
        found: false,
        message: "No CAT or SEL provided",
        matches: [],
        suggested: null,
      };
    }

    // Query RawXactRow for matching CAT/SEL across all company projects
    // We join through EstimateVersion -> Project to scope to the company
    const matchingRows = await this.prisma.rawXactRow.findMany({
      where: {
        estimateVersion: {
          project: {
            companyId,
          },
        },
        ...(cat ? { cat: { equals: cat, mode: "insensitive" as const } } : {}),
        ...(sel ? { sel: { equals: sel, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true,
        cat: true,
        sel: true,
        desc: true,
        unit: true,
        unitCost: true,
        workersWage: true,
        laborBurden: true,
        laborOverhead: true,
        material: true,
        equipment: true,
        activity: true,
        rcv: true,
        qty: true,
        estimateVersion: {
          select: {
            projectId: true,
            project: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Limit to most recent 50 matches
    });

    if (matchingRows.length === 0) {
      return {
        found: false,
        message: `No PETL data found for CAT=${cat ?? "*"} SEL=${sel ?? "*"}`,
        matches: [],
        suggested: null,
      };
    }

    // Aggregate cost components - use most recent non-null values
    // Also compute averages for reference
    const withCosts = matchingRows.filter(
      (r) =>
        r.workersWage != null ||
        r.laborBurden != null ||
        r.laborOverhead != null ||
        r.material != null ||
        r.equipment != null,
    );

    // Find the most recent row with cost data
    const mostRecent = withCosts[0] ?? matchingRows[0];

    // Compute averages from rows that have cost data
    const avgWorkersWage =
      withCosts.filter((r) => r.workersWage != null).length > 0
        ? withCosts.filter((r) => r.workersWage != null).reduce((sum, r) => sum + (r.workersWage ?? 0), 0) /
          withCosts.filter((r) => r.workersWage != null).length
        : null;
    const avgLaborBurden =
      withCosts.filter((r) => r.laborBurden != null).length > 0
        ? withCosts.filter((r) => r.laborBurden != null).reduce((sum, r) => sum + (r.laborBurden ?? 0), 0) /
          withCosts.filter((r) => r.laborBurden != null).length
        : null;
    const avgLaborOverhead =
      withCosts.filter((r) => r.laborOverhead != null).length > 0
        ? withCosts.filter((r) => r.laborOverhead != null).reduce((sum, r) => sum + (r.laborOverhead ?? 0), 0) /
          withCosts.filter((r) => r.laborOverhead != null).length
        : null;
    const avgMaterial =
      withCosts.filter((r) => r.material != null).length > 0
        ? withCosts.filter((r) => r.material != null).reduce((sum, r) => sum + (r.material ?? 0), 0) /
          withCosts.filter((r) => r.material != null).length
        : null;
    const avgEquipment =
      withCosts.filter((r) => r.equipment != null).length > 0
        ? withCosts.filter((r) => r.equipment != null).reduce((sum, r) => sum + (r.equipment ?? 0), 0) /
          withCosts.filter((r) => r.equipment != null).length
        : null;

    // Build suggested values - prefer most recent, fall back to averages
    const suggested = {
      workersWage: mostRecent?.workersWage ?? avgWorkersWage,
      laborBurden: mostRecent?.laborBurden ?? avgLaborBurden,
      laborOverhead: mostRecent?.laborOverhead ?? avgLaborOverhead,
      material: mostRecent?.material ?? avgMaterial,
      equipment: mostRecent?.equipment ?? avgEquipment,
      unit: mostRecent?.unit ?? null,
      unitCost: mostRecent?.unitCost ?? null,
      activity: mostRecent?.activity ?? null,
      description: mostRecent?.desc ?? null,
      source: {
        projectId: mostRecent?.estimateVersion?.projectId ?? null,
        projectName: mostRecent?.estimateVersion?.project?.name ?? null,
      },
    };

    // Include sample matches for transparency
    const matches = matchingRows.slice(0, 10).map((r) => ({
      cat: r.cat,
      sel: r.sel,
      description: r.desc,
      unit: r.unit,
      unitCost: r.unitCost,
      workersWage: r.workersWage,
      laborBurden: r.laborBurden,
      laborOverhead: r.laborOverhead,
      material: r.material,
      equipment: r.equipment,
      activity: r.activity,
      projectName: r.estimateVersion?.project?.name ?? null,
    }));

    return {
      found: true,
      totalMatches: matchingRows.length,
      matchesWithCosts: withCosts.length,
      suggested,
      averages: {
        workersWage: avgWorkersWage,
        laborBurden: avgLaborBurden,
        laborOverhead: avgLaborOverhead,
        material: avgMaterial,
        equipment: avgEquipment,
      },
      matches,
    };
  }

  async getPetlReconciliationCaseHistory(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    caseId: string,
  ) {
    // Reuse standard project access rules
    await this.getProjectByIdForUser(projectId, actor);

    // Load the case scoped to this project.
    const reconCase = await this.prisma.petlReconciliationCase.findFirst({
      where: { id: caseId, projectId },
      select: {
        id: true,
        projectId: true,
        estimateVersionId: true,
        sowItemId: true,
        logicalItemId: true,
        status: true,
        createdByUserId: true,
        createdAt: true,
      },
    });

    if (!reconCase) {
      throw new NotFoundException("Reconciliation case not found for this project");
    }

    // Load all entries for this case (across estimate versions).
    const entries = await this.prisma.petlReconciliationEntry.findMany({
      where: { caseId: reconCase.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        projectId: true,
        estimateVersionId: true,
        caseId: true,
        parentSowItemId: true,
        projectParticleId: true,
        kind: true,
        tag: true,
        status: true,
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
        originEstimateVersionId: true,
        originSowItemId: true,
        originLineNo: true,
        carriedForwardFromEntryId: true,
        carryForwardCount: true,
        note: true,
        createdByUserId: true,
        approvedByUserId: true,
        approvedAt: true,
        createdAt: true,
      },
    });

    // Collect estimate versions referenced by the case + entries (current + origin).
    const estimateVersionIds = new Set<string>();
    if (reconCase.estimateVersionId) estimateVersionIds.add(reconCase.estimateVersionId);
    for (const e of entries) {
      if (e.estimateVersionId) estimateVersionIds.add(e.estimateVersionId);
      if (e.originEstimateVersionId) estimateVersionIds.add(e.originEstimateVersionId);
    }

    const estimateVersions = estimateVersionIds.size
      ? await this.prisma.estimateVersion.findMany({
          where: { id: { in: Array.from(estimateVersionIds) }, projectId },
          select: {
            id: true,
            sequenceNo: true,
            fileName: true,
            sourceType: true,
            importedAt: true,
            createdAt: true,
          },
        })
      : [];

    const versionById = new Map<string, any>();
    for (const v of estimateVersions) {
      versionById.set(v.id, v);
    }

    // Collect SOW items referenced by the case + entries (current + origin).
    const sowItemIds = new Set<string>();
    if (reconCase.sowItemId) sowItemIds.add(reconCase.sowItemId);
    for (const e of entries) {
      if (e.parentSowItemId) sowItemIds.add(e.parentSowItemId);
      if (e.originSowItemId) sowItemIds.add(e.originSowItemId);
    }

    const sowItems = sowItemIds.size
      ? await this.prisma.sowItem.findMany({
          where: { id: { in: Array.from(sowItemIds) } },
          select: {
            id: true,
            estimateVersionId: true,
            projectParticleId: true,
            lineNo: true,
            description: true,
            rawRow: {
              select: {
                lineNo: true,
              },
            },
          },
        })
      : [];

    const sowById = new Map<string, any>();
    for (const s of sowItems) {
      sowById.set(s.id, s);
    }

    // Resolve particles used by current/origin lines and entry-level particles.
    const particleIds = new Set<string>();
    for (const s of sowItems) {
      if (s.projectParticleId) particleIds.add(s.projectParticleId);
    }
    for (const e of entries) {
      if (e.projectParticleId) particleIds.add(e.projectParticleId);
    }

    const particleById = await this.resolveProjectParticlesForProject({
      projectId,
      particleIds: Array.from(particleIds),
    });

    const caseSow = reconCase.sowItemId ? sowById.get(reconCase.sowItemId) : null;
    const caseCurrentLineNo = caseSow?.rawRow?.lineNo ?? caseSow?.lineNo ?? null;
    const caseVersionMeta = versionById.get(reconCase.estimateVersionId) ?? null;

    const historyEntries = entries.map((e) => {
      const currentSow = e.parentSowItemId ? sowById.get(e.parentSowItemId) : null;
      const originSow = e.originSowItemId ? sowById.get(e.originSowItemId) : null;

      const currentVersion = versionById.get(e.estimateVersionId) ?? null;
      const originVersion = e.originEstimateVersionId
        ? versionById.get(e.originEstimateVersionId) ?? null
        : null;

      const currentLineNo = currentSow?.rawRow?.lineNo ?? currentSow?.lineNo ?? null;
      const originLineNo =
        e.originLineNo ?? originSow?.rawRow?.lineNo ?? originSow?.lineNo ?? null;

      const particle = particleById.get(e.projectParticleId) ?? null;

      return {
        ...e,
        current: {
          estimateVersion: currentVersion,
          sowItemId: currentSow?.id ?? null,
          lineNo: currentLineNo,
          description: currentSow?.description ?? null,
          projectParticle: particle,
        },
        origin: {
          estimateVersion: originVersion,
          sowItemId: originSow?.id ?? null,
          lineNo: originLineNo,
        },
      };
    });

    // Events are useful for audit, but optional for the initial UI.
    let events: any[] = [];
    try {
      events = await this.prisma.petlReconciliationEvent.findMany({
        where: { caseId: reconCase.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          projectId: true,
          estimateVersionId: true,
          caseId: true,
          entryId: true,
          eventType: true,
          payloadJson: true,
          createdByUserId: true,
          createdAt: true,
        },
      });
    } catch (err: any) {
      if (!this.isMissingPrismaTableError(err, "PetlReconciliationEvent")) {
        throw err;
      }
      events = [];
    }

    return {
      projectId,
      caseId: reconCase.id,
      case: {
        ...reconCase,
        estimateVersion: caseVersionMeta,
        currentLineNo: caseCurrentLineNo,
      },
      entries: historyEntries,
      estimateVersions,
      events,
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
        lineNo: true,
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
        status: PetlReconciliationEntryStatus.APPROVED,
        note: body.note ?? null,
        rcvAmount: null,
        percentComplete: 0,
        isPercentCompleteLocked: true,
        createdByUserId: actor.userId,
        originEstimateVersionId: sowItem.estimateVersionId,
        originSowItemId: sowItemId,
        originLineNo: sowItem.lineNo ?? null,
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
            entries: {
              orderBy: { createdAt: "asc" },
              include: {
                attachments: { orderBy: { createdAt: "asc" } },
              },
            },
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
            originEstimateVersionId: sowItem.estimateVersionId,
            originSowItemId: sowItem.id,
            originLineNo: sowItem.rawRow?.lineNo ?? sowItem.lineNo ?? null,
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
        lineNo: true,
        rawRow: {
          select: {
            lineNo: true,
          },
        },
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
        status: PetlReconciliationEntryStatus.APPROVED,
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
        originEstimateVersionId: sowItem.estimateVersionId,
        originSowItemId: sowItemId,
        originLineNo: sowItem.rawRow?.lineNo ?? sowItem.lineNo ?? null,
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
      kind?: string | null;
      isStandaloneChangeOrder?: boolean | null;
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
        lineNo: true,
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

    // Validate kind if provided, default to ADD
    const kindRaw = body.kind ?? 'ADD';
    let kind: PetlReconciliationEntryKind = PetlReconciliationEntryKind.ADD;
    if (kindRaw === 'CREDIT') {
      kind = PetlReconciliationEntryKind.CREDIT;
    } else if (kindRaw === 'ADD') {
      kind = PetlReconciliationEntryKind.ADD;
    }

    const isStandaloneChangeOrder = body.isStandaloneChangeOrder ?? false;

    const entry = await this.prisma.petlReconciliationEntry.create({
      data: {
        projectId,
        estimateVersionId: sowItem.estimateVersionId,
        caseId: theCase.id,
        parentSowItemId: sowItemId,
        projectParticleId: sowItem.projectParticleId,
        kind,
        tag,
        status: PetlReconciliationEntryStatus.APPROVED,
        isStandaloneChangeOrder,
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
        originEstimateVersionId: sowItem.estimateVersionId,
        originSowItemId: sowItemId,
        originLineNo: sowItem.lineNo ?? null,
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
            entries: {
              orderBy: { createdAt: "asc" },
              include: {
                attachments: { orderBy: { createdAt: "asc" } },
              },
            },
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
        lineNo: true,
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
        status: PetlReconciliationEntryStatus.APPROVED,
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
        originEstimateVersionId: sowItem.estimateVersionId,
        originSowItemId: sowItemId,
        originLineNo: sowItem.lineNo ?? null,
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
            entries: {
              orderBy: { createdAt: "asc" },
              include: {
                attachments: { orderBy: { createdAt: "asc" } },
              },
            },
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

    // Only PM/Owner/Admin can update locked percent complete
    if (entry.isPercentCompleteLocked) {
      const canEdit = await this.isProjectManagerOrAbove(projectId, actor);
      if (!canEdit) {
        throw new BadRequestException("Percent complete is locked for this entry");
      }
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

  async deletePetlReconciliationEntry(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    entryId: string,
  ) {
    await this.getProjectByIdForUser(projectId, actor);

    const canEdit = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canEdit) {
      throw new ForbiddenException(
        "Only project managers/owners/admins can delete reconciliation entries",
      );
    }

    const entry = await this.prisma.petlReconciliationEntry.findUnique({
      where: { id: entryId },
      include: { case: true },
    });

    // Older/migrated data may have inconsistent case.projectId; rely on entry.projectId
    // as the single source of truth for which project owns this entry.
    if (!entry || entry.projectId !== projectId) {
      throw new NotFoundException("Reconciliation entry not found for this project");
    }

    await this.prisma.petlReconciliationEntry.delete({ where: { id: entryId } });

    await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);

    return { deleted: true };
  }

  async updatePetlReconciliationEntry(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    entryId: string,
    body: {
      kind?: string | null;
      tag?: string | null;
      status?: string | null;
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
      percentComplete?: number | null;
      // Activity and cost component fields
      activity?: string | null;
      workersWage?: number | null;
      laborBurden?: number | null;
      laborOverhead?: number | null;
      materialCost?: number | null;
      equipmentCost?: number | null;
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

    const status = (() => {
      if (body.status === undefined) return undefined;
      const raw = String(body.status).trim();
      if (!raw) return undefined;
      if ((Object.values(PetlReconciliationEntryStatus) as string[]).includes(raw)) {
        return raw as PetlReconciliationEntryStatus;
      }
      throw new BadRequestException("Invalid reconciliation entry status");
    })();

    if (status !== undefined) {
      const canChangeStatus = await this.isProjectManagerOrAbove(projectId, actor);
      if (!canChangeStatus) {
        throw new ForbiddenException(
          "Only project managers/owners/admins can change reconciliation entry status",
        );
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

    // Auto-infer kind for financial entries when the client doesn't explicitly set it.
    // Let tag + presence of dollars drive kind so invoice math stays correct even if
    // the UI only edits tag/amounts.
    const autoKind = (() => {
      // If client explicitly set kind, respect it.
      if (kind !== undefined && kind !== null) return kind;

      const hasMoney =
        (nextItemAmount ?? 0) !== 0 ||
        (nextSalesTaxAmount ?? 0) !== 0 ||
        (nextOpAmount ?? 0) !== 0 ||
        (nextRcvAmount ?? 0) !== 0;

      if (!hasMoney) {
        // Pure note-only entry regardless of tag.
        return PetlReconciliationEntryKind.NOTE_ONLY;
      }

      const effectiveTag =
        tag === undefined || tag === null ? (entry.tag as PetlReconciliationEntryTag | null) : tag;

      const base =
        (nextItemAmount ?? 0) +
        (nextSalesTaxAmount ?? 0) +
        (nextOpAmount ?? 0);

      if (effectiveTag === "SUPPLEMENT" || effectiveTag === "CHANGE_ORDER") {
        if (base > 0) return PetlReconciliationEntryKind.ADD;
        if (base < 0) return PetlReconciliationEntryKind.CREDIT;
      }

      // Fallback: keep existing kind so we don't surprise older entries.
      return entry.kind;
    })();

    // Normalize sign based on inferred kind when possible.
    const nextKindForSign = autoKind;
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

    // Percent complete (0-100)
    const nextPercentComplete = (() => {
      if (body.percentComplete === undefined) return undefined;
      const pct = Number(body.percentComplete);
      if (!Number.isFinite(pct)) return undefined;
      return Math.max(0, Math.min(100, pct));
    })();

    // Activity enum value
    const activity = (() => {
      if (body.activity === undefined) return undefined;
      if (body.activity == null || String(body.activity).trim() === "") return null;
      const raw = String(body.activity).trim();
      const validActivities = [
        "REMOVE_AND_REPLACE",
        "REMOVE",
        "REPLACE",
        "DETACH_AND_RESET",
        "MATERIALS",
        "REPAIR",
        "INSTALL_ONLY",
      ];
      if (validActivities.includes(raw)) {
        return raw as PetlActivity;
      }
      throw new BadRequestException("Invalid activity value");
    })();

    // Cost component fields
    const workersWage =
      body.workersWage === undefined ? undefined : parseNumberOrNull(body.workersWage, "workersWage");
    const laborBurden =
      body.laborBurden === undefined ? undefined : parseNumberOrNull(body.laborBurden, "laborBurden");
    const laborOverhead =
      body.laborOverhead === undefined ? undefined : parseNumberOrNull(body.laborOverhead, "laborOverhead");
    const materialCost =
      body.materialCost === undefined ? undefined : parseNumberOrNull(body.materialCost, "materialCost");
    const equipmentCost =
      body.equipmentCost === undefined ? undefined : parseNumberOrNull(body.equipmentCost, "equipmentCost");

    const data: Prisma.PetlReconciliationEntryUpdateInput = {
      kind: kind === undefined ? autoKind : kind ?? undefined,
      tag: tag === undefined ? undefined : tag,
      status: status === undefined ? undefined : status,
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
      percentComplete: nextPercentComplete,
      // Activity and cost component fields
      activity: activity === undefined ? undefined : activity,
      workersWage: workersWage === undefined ? undefined : workersWage,
      laborBurden: laborBurden === undefined ? undefined : laborBurden,
      laborOverhead: laborOverhead === undefined ? undefined : laborOverhead,
      materialCost: materialCost === undefined ? undefined : materialCost,
      equipmentCost: equipmentCost === undefined ? undefined : equipmentCost,
      events: {
        create: {
          projectId,
          estimateVersionId: entry.estimateVersionId,
          caseId: entry.caseId,
          eventType: "ENTRY_UPDATED",
            payloadJson: {
            kind: body.kind ?? undefined,
            tag: body.tag ?? undefined,
            status: body.status ?? undefined,
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
            percentComplete: body.percentComplete ?? undefined,
            activity: body.activity ?? undefined,
            workersWage: body.workersWage ?? undefined,
            laborBurden: body.laborBurden ?? undefined,
            laborOverhead: body.laborOverhead ?? undefined,
            materialCost: body.materialCost ?? undefined,
            equipmentCost: body.equipmentCost ?? undefined,
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
            entries: {
              orderBy: { createdAt: "asc" },
              include: {
                attachments: { orderBy: { createdAt: "asc" } },
              },
            },
            events: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    // Best effort: regenerate the current living invoice draft from PETL.
    // If billing tables or invoice PETL detail are not present or sync fails for any
    // reason, we still want the reconciliation edit to succeed and avoid a 500.
    try {
      await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);
    } catch (err) {
      // Swallow non-fatal sync errors; the next invoice touch can recompute totals.
      // We intentionally do not rethrow here to keep reconciliation edits robust
      // even when billing tables or invoice PETL detail are mid-migration.
      this.logger.error(
        `Failed to sync living draft invoice from PETL after reconciliation update for project ${projectId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return { entry: updated, reconciliationCase: updated.case };
  }

  async attachPetlReconciliationEntryFile(
    projectId: string,
    entryId: string,
    dto: { projectFileId: string },
    actor: AuthenticatedUser,
  ) {
    const project = await this.getProjectByIdForUser(projectId, actor);

    const entry = await this.prisma.petlReconciliationEntry.findFirst({
      where: {
        id: entryId,
        projectId: project.id,
      },
      select: {
        id: true,
        projectId: true,
        estimateVersionId: true,
        caseId: true,
      },
    });

    if (!entry) {
      throw new NotFoundException("Reconciliation entry not found for this project");
    }

    const projectFile = await this.prisma.projectFile.findFirst({
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

    if (!projectFile) {
      throw new NotFoundException("Project file not found for this project");
    }

    const attachment = await this.prisma.petlReconciliationAttachment.create({
      data: {
        entryId: entry.id,
        projectFileId: projectFile.id,
        fileUrl: projectFile.storageUrl,
        fileName: projectFile.fileName ?? null,
        mimeType: projectFile.mimeType ?? null,
        sizeBytes: projectFile.sizeBytes ?? null,
      },
    });

    await this.audit.log(actor, "PETL_RECON_ATTACHMENT_ADDED", {
      companyId: project.companyId,
      projectId: project.id,
      metadata: {
        entryId: entry.id,
        attachmentId: attachment.id,
        projectFileId: projectFile.id,
      },
    });

    return attachment;
  }

  /**
   * Convert an existing reconciliation entry to a standalone Change Order (CO).
   * This creates a NEW SowItem for the CO and re-parents the reconciliation entry to it.
   * The new SowItem appears as its own row in the PETL grid with CO line numbering.
   */
  async convertEntryToStandaloneChangeOrder(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    entryId: string,
    body: {
      // Optional cost book item to attach
      companyPriceListItemId?: string | null;
      // Activity type for cost calculation
      activity?: PetlActivity | null;
      // Cost component overrides (user-editable)
      laborCost?: number | null;
      materialCost?: number | null;
      equipmentCost?: number | null;
      // Standard fields
      description?: string | null;
      qty?: number | null;
      unit?: string | null;
      note?: string | null;
    },
  ) {
    // Only PM/Owner/Admin can convert entries to standalone COs
    const canConvert = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canConvert) {
      throw new ForbiddenException(
        "Only project managers/owners/admins can convert entries to standalone Change Orders",
      );
    }

    // Fetch entry with full parent context
    const entry = await this.prisma.petlReconciliationEntry.findUnique({
      where: { id: entryId },
      include: {
        case: true,
        parentSowItem: {
          include: {
            sow: true,
            projectParticle: true,
          },
        },
      },
    });

    if (!entry || entry.projectId !== projectId) {
      throw new NotFoundException("Reconciliation entry not found for this project");
    }

    if (entry.isStandaloneChangeOrder) {
      throw new BadRequestException("Entry is already a standalone Change Order");
    }

    if (!entry.parentSowItem) {
      throw new BadRequestException("Entry has no parent line item to detach from");
    }

    const parentSowItem = entry.parentSowItem;
    const sourceLineNo = parentSowItem.sourceLineNo ?? parentSowItem.lineNo;

    // Calculate next CO sequence number for this source line
    const existingCoItems = await this.prisma.sowItem.findMany({
      where: {
        estimateVersionId: entry.estimateVersionId,
        isStandaloneChangeOrder: true,
        coSourceLineNo: sourceLineNo,
      },
      select: { coSequenceNo: true },
    });

    const nextCoSeq = getNextCoSequenceNo(existingCoItems.map(e => e.coSequenceNo));

    // If a cost book item is provided, fetch it
    let costBookItem: any = null;
    if (body.companyPriceListItemId) {
      costBookItem = await this.prisma.companyPriceListItem.findFirst({
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
    }

    // Calculate costs based on activity if provided
    let laborCost = body.laborCost ?? 0;
    let materialCost = body.materialCost ?? 0;
    let equipmentCost = body.equipmentCost ?? 0;

    // If we have a cost book item with cost components, use activity-based calculation
    if (costBookItem && body.activity) {
      const rawJson = costBookItem.rawJson as any;
      if (rawJson) {
        const costComponents = extractCostComponents({
          workersWage: rawJson.workersWage ?? rawJson.workers_wage ?? null,
          laborBurden: rawJson.laborBurden ?? rawJson.labor_burden ?? null,
          laborOverhead: rawJson.laborOverhead ?? rawJson.labor_overhead ?? null,
          material: rawJson.material ?? null,
          equipment: rawJson.equipment ?? null,
        });

        const calculated = calculateCostByActivity(costComponents, body.activity);
        laborCost = body.laborCost ?? calculated.laborCost;
        materialCost = body.materialCost ?? calculated.materialCost;
        equipmentCost = body.equipmentCost ?? calculated.equipmentCost;
      }
    }

    // Use entry's existing amounts if no costs provided
    const qty = body.qty ?? entry.qty ?? 1;
    const totalCost = (laborCost + materialCost + equipmentCost) || (entry.unitCost ?? 0);
    const itemAmount = (laborCost + materialCost + equipmentCost) > 0 
      ? qty * totalCost 
      : (entry.itemAmount ?? entry.rcvAmount ?? 0);
    const rcvAmount = itemAmount;
    const description = body.description ?? costBookItem?.description ?? entry.description ?? "Change Order";
    const unit = body.unit ?? costBookItem?.unit ?? entry.unit ?? "LS";
    const categoryCode = costBookItem?.cat ?? entry.categoryCode ?? "CO";
    const selectionCode = costBookItem?.sel ?? entry.selectionCode ?? null;

    // Run everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Determine next PETL line number
      const maxAgg = await tx.sowItem.aggregate({
        where: { estimateVersionId: entry.estimateVersionId },
        _max: { lineNo: true },
      });
      const nextLineNo = (maxAgg._max.lineNo ?? 0) + 1;

      // Create RawXactRow for the CO
      const rawRow = await tx.rawXactRow.create({
        data: {
          estimateVersionId: entry.estimateVersionId,
          lineNo: nextLineNo,
          desc: description,
          qty,
          unitCost: totalCost,
          itemAmount,
          rcv: rcvAmount,
          unit,
          cat: categoryCode,
          sel: selectionCode,
          sourceName: "STANDALONE_CO",
          rawRowJson: {
            coSource: {
              kind: "STANDALONE_CHANGE_ORDER",
              originalEntryId: entry.id,
              originalParentSowItemId: parentSowItem.id,
              sourceLineNo,
              coSequenceNo: nextCoSeq,
              createdByUserId: actor.userId,
            },
          },
        },
      });

      // Create or find SowLogicalItem
      const signature = `CO|${sourceLineNo}|${nextCoSeq}|${description}`.slice(0, 255);
      let logical = await tx.sowLogicalItem.findFirst({
        where: {
          projectId,
          projectParticleId: parentSowItem.projectParticleId,
          signatureHash: signature,
        },
      });

      if (!logical) {
        logical = await tx.sowLogicalItem.create({
          data: {
            projectId,
            projectParticleId: parentSowItem.projectParticleId,
            signatureHash: signature,
          },
        });
      }

      // Create the new SowItem for the CO
      const coSowItem = await tx.sowItem.create({
        data: {
          sowId: parentSowItem.sowId,
          estimateVersionId: entry.estimateVersionId,
          rawRowId: rawRow.id,
          logicalItemId: logical.id,
          projectParticleId: parentSowItem.projectParticleId,
          lineNo: nextLineNo,
          sourceLineNo: sourceLineNo, // Keep source for reference
          description,
          qty,
          originalQty: qty,
          unit,
          unitCost: totalCost,
          itemAmount,
          rcvAmount,
          categoryCode,
          selectionCode,
          payerType: parentSowItem.payerType ?? "Insurance",
          performed: false,
          eligibleForAcvRefund: false,
          percentComplete: 100, // COs default to 100% complete
          isAcvOnly: false,
          qtyFlaggedIncorrect: false,
          // CO-specific fields
          isStandaloneChangeOrder: true,
          coSequenceNo: nextCoSeq,
          coSourceLineNo: sourceLineNo,
        },
      });

      // Create a new reconciliation case for the CO SowItem
      const coCase = await tx.petlReconciliationCase.create({
        data: {
          projectId,
          estimateVersionId: entry.estimateVersionId,
          sowItemId: coSowItem.id,
          logicalItemId: logical.id,
          status: "OPEN",
          createdByUserId: actor.userId,
        },
      });

      // Update the reconciliation entry to point to the new CO SowItem
      const updatedEntry = await tx.petlReconciliationEntry.update({
        where: { id: entryId },
        data: {
          // Re-parent to the new CO SowItem
          parentSowItemId: coSowItem.id,
          caseId: coCase.id,
          // Mark as standalone CO
          isStandaloneChangeOrder: true,
          coSequenceNo: nextCoSeq,
          // Preserve original reference
          originSowItemId: parentSowItem.id,
          originLineNo: sourceLineNo,
          // Update financial data
          tag: PetlReconciliationEntryTag.CHANGE_ORDER,
          kind: PetlReconciliationEntryKind.ADD,
          status: PetlReconciliationEntryStatus.PENDING,
          percentComplete: 100,
          qty,
          unitCost: totalCost,
          itemAmount,
          rcvAmount,
          description,
          unit,
          categoryCode,
          selectionCode,
          note: body.note ?? entry.note,
          // Cost components
          workersWage: laborCost > 0 ? laborCost : null,
          materialCost: materialCost > 0 ? materialCost : null,
          equipmentCost: equipmentCost > 0 ? equipmentCost : null,
          activity: body.activity ?? null,
        },
        include: {
          case: {
            include: {
              entries: {
                orderBy: { createdAt: "asc" },
                include: {
                  attachments: { orderBy: { createdAt: "asc" } },
                },
              },
              events: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      });

      // Create audit event
      await tx.petlReconciliationEvent.create({
        data: {
          projectId,
          estimateVersionId: entry.estimateVersionId,
          caseId: coCase.id,
          entryId: updatedEntry.id,
          eventType: "ENTRY_CONVERTED_TO_STANDALONE_CO",
          payloadJson: {
            sourceLineNo,
            coSequenceNo: nextCoSeq,
            newSowItemId: coSowItem.id,
            originalParentSowItemId: parentSowItem.id,
            activity: body.activity ?? null,
            laborCost,
            materialCost,
            equipmentCost,
            totalCost: itemAmount,
          },
          createdByUserId: actor.userId,
        },
      });

      return {
        entry: updatedEntry,
        coSowItem,
        coCase,
        coLineNumber: `${sourceLineNo}-CO${nextCoSeq}`,
      };
    });

    // Sync invoice if applicable
    try {
      await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);
    } catch (err) {
      this.logger.error(
        `Failed to sync living draft invoice after CO conversion for project ${projectId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return {
      entry: result.entry,
      reconciliationCase: result.coCase,
      coSowItem: result.coSowItem,
      coLineNumber: result.coLineNumber,
    };
  }

  /**
   * Revert a standalone Change Order back to a regular reconciliation entry.
   * This deletes the CO SowItem and moves the entry back to the original parent.
   */
  async revertEntryFromStandaloneChangeOrder(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    entryId: string,
  ) {
    // Only PM/Owner/Admin can revert COs
    const canRevert = await this.isProjectManagerOrAbove(projectId, actor);
    if (!canRevert) {
      throw new ForbiddenException(
        "Only project managers/owners/admins can revert standalone Change Orders",
      );
    }

    const entry = await this.prisma.petlReconciliationEntry.findUnique({
      where: { id: entryId },
      include: {
        case: true,
        parentSowItem: {
          include: {
            sow: true,
            rawRow: true,
          },
        },
      },
    });

    if (!entry || entry.projectId !== projectId) {
      throw new NotFoundException("Reconciliation entry not found for this project");
    }

    if (!entry.isStandaloneChangeOrder) {
      throw new BadRequestException("Entry is not a standalone Change Order");
    }

    // Find the original parent SowItem
    if (!entry.originSowItemId) {
      throw new BadRequestException("Cannot revert: original line item reference not found");
    }

    const originalParent = await this.prisma.sowItem.findUnique({
      where: { id: entry.originSowItemId },
      include: { sow: true },
    });

    if (!originalParent) {
      throw new BadRequestException("Cannot revert: original line item no longer exists");
    }

    // The current parent is the CO SowItem we created
    const coSowItem = entry.parentSowItem;
    const coCase = entry.case;

    // Run in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Find or create a reconciliation case for the original parent
      let originalCase = await tx.petlReconciliationCase.findFirst({
        where: {
          projectId,
          sowItemId: originalParent.id,
        },
      });

      if (!originalCase) {
        originalCase = await tx.petlReconciliationCase.create({
          data: {
            projectId,
            estimateVersionId: entry.estimateVersionId,
            sowItemId: originalParent.id,
            status: "OPEN",
            createdByUserId: actor.userId,
          },
        });
      }

      // Move the entry back to the original parent
      const updatedEntry = await tx.petlReconciliationEntry.update({
        where: { id: entryId },
        data: {
          parentSowItemId: originalParent.id,
          caseId: originalCase.id,
          isStandaloneChangeOrder: false,
          coSequenceNo: null,
          // Clear CO-specific fields but keep financial data
          activity: null,
          sourceActivity: null,
          // Keep originSowItemId and originLineNo for history
        },
        include: {
          case: {
            include: {
              entries: {
                orderBy: { createdAt: "asc" },
                include: {
                  attachments: { orderBy: { createdAt: "asc" } },
                },
              },
              events: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      });

      // Create audit event on the original case
      await tx.petlReconciliationEvent.create({
        data: {
          projectId,
          estimateVersionId: entry.estimateVersionId,
          caseId: originalCase.id,
          entryId: updatedEntry.id,
          eventType: "ENTRY_REVERTED_FROM_STANDALONE_CO",
          payloadJson: {
            previousCoSequenceNo: entry.coSequenceNo,
            originLineNo: entry.originLineNo,
            deletedCoSowItemId: coSowItem?.id ?? null,
          },
          createdByUserId: actor.userId,
        },
      });

      // Delete the CO case if it exists and has no other entries
      if (coCase && coCase.id !== originalCase.id) {
        const otherEntries = await tx.petlReconciliationEntry.count({
          where: {
            caseId: coCase.id,
            id: { not: entryId },
          },
        });

        if (otherEntries === 0) {
          // Delete events first (cascade should handle this, but be explicit)
          await tx.petlReconciliationEvent.deleteMany({
            where: { caseId: coCase.id },
          });
          await tx.petlReconciliationCase.delete({
            where: { id: coCase.id },
          });
        }
      }

      // Delete the CO SowItem if it exists and was created for this CO
      if (coSowItem?.isStandaloneChangeOrder) {
        // Delete raw row first
        if (coSowItem.rawRowId) {
          await tx.rawXactRow.delete({
            where: { id: coSowItem.rawRowId },
          }).catch(() => {
            // Ignore if already deleted or has other references
          });
        }
        // Delete the SowItem
        await tx.sowItem.delete({
          where: { id: coSowItem.id },
        }).catch(() => {
          // Ignore if already deleted
        });
      }

      return {
        entry: updatedEntry,
        originalCase,
      };
    });

    // Sync invoice if applicable
    try {
      await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);
    } catch (err) {
      this.logger.error(
        `Failed to sync living draft invoice after CO revert for project ${projectId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return {
      entry: result.entry,
      reconciliationCase: result.originalCase,
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
        orgGroupCodes?: string[];
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
    this.logger.log(`[PETL bulk apply] projectId=${projectId}, body=${JSON.stringify(body)}`);
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

        // Batch create PetlEditChange records for audit trail
        const editChanges = distinct
          .map((change) => {
            const row = byId.get(change.sowItemId);
            if (!row) return null;
            const currentDbPercent = row.percentComplete ?? 0;
            const old = change.oldPercent ?? currentDbPercent;
            return {
              sessionId: session.id,
              sowItemId: row.id,
              field: "percent_complete",
              oldValue: old,
              newValue: change.newPercent,
              effectiveAt: endedAt
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        await tx.petlEditChange.createMany({
          data: editChanges
        });

        // Batch update sowItem records using Promise.all for parallelization
        await Promise.all(
          distinct.map(async (change) => {
            const row = byId.get(change.sowItemId);
            if (!row) return;
            await tx.sowItem.update({
              where: { id: row.id },
              data: {
                percentComplete: change.newPercent,
                isAcvOnly: change.acvOnly ?? false,
              },
            });
          })
        );
      }, { timeout: 30000 });

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
    if (filters?.orgGroupCodes && filters.orgGroupCodes.length > 0) {
      where.projectParticle = {
        ...(where.projectParticle || {}),
        externalGroupCode: { in: filters.orgGroupCodes },
      };
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

        // When setting ACV-only, preserve the existing percent complete.
        // ACV = carrier paid but client chose NOT to do the repair.
        // We bill only O&P (20%), rebating 80% back to the insured.
        if (isAcvOnlyForBatch) {
          next = current; // Keep existing percent
        } else if (op === "set") {
          next = percent;
        } else if (op === "increment") {
          next = current + percent;
        } else if (op === "decrement") {
          next = current - percent;
        }
        next = Math.max(0, Math.min(100, next));

        // Include the change if percent changed OR if we're toggling ACV-only flag
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

      // Batch create PetlEditChange records for audit trail
      const editChanges = computedChanges
        .map((change) => {
          const row = byId.get(change.sowItemId);
          if (!row) return null;
          const currentDbPercent = row.percentComplete ?? 0;
          const old = change.oldPercent ?? currentDbPercent;
          return {
            sessionId: session.id,
            sowItemId: row.id,
            field: "percent_complete",
            oldValue: old,
            newValue: change.newPercent,
            effectiveAt: endedAt
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      await tx.petlEditChange.createMany({
        data: editChanges
      });

      // Batch update sowItem records using Promise.all for parallelization
      await Promise.all(
        computedChanges.map(async (change) => {
          const row = byId.get(change.sowItemId);
          if (!row) return;
          await tx.sowItem.update({
            where: { id: row.id },
            data: {
              percentComplete: change.newPercent,
              isAcvOnly: !!change.acvOnly,
            },
          });
        })
      );
    }, { timeout: 30000 });

    // Best effort: regenerate the current living invoice draft from PETL.
    await this.maybeSyncLivingDraftInvoiceFromPetl(projectId, companyId, actor);

    return { status: "ok", updatedCount: computedChanges.length };
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
      const pct = entry.percentComplete ?? 0;
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
      const orgGroupCode = (particle as any)?.externalGroupCode
        ? String((particle as any).externalGroupCode).trim() || null
        : null;

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
        percentComplete: item.percentComplete ?? 0,
        orgGroupCode,
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
          lineNo: true,
          rawRow: {
            select: {
              lineNo: true,
            },
          },
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
            originEstimateVersionId: sowItem.estimateVersionId,
            originSowItemId: sowItem.id,
            originLineNo: sowItem.rawRow?.lineNo ?? sowItem.lineNo ?? null,
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

    // Track SowItem updates (e.g., isAcvOnly, percentComplete changes)
    const sowItemAgg = await this.prisma.sowItem.aggregate({
      where: { estimateVersionId: latestVersion.id },
      _max: { updatedAt: true },
    });
    const sowItemUpdatedAt = sowItemAgg._max.updatedAt ?? null;

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
        (!billingUpdatedAt || existing.computedAt >= billingUpdatedAt) &&
        (!sowItemUpdatedAt || existing.computedAt >= sowItemUpdatedAt)
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

    // ACV business logic:
    // - ACV = carrier paid but client chose NOT to do the repair
    // - 80% of RCV is rebated back to the insured (acvReturn / credit bucket)
    // - 20% of RCV is O&P that we bill (acvOP)
    const ACV_REBATE_RATE = 0.8;
    const ACV_OP_RATE = 0.2;

    let acvRcvTotal = 0; // Track total RCV of ACV items for O&P calculation

    for (const item of items) {
      const rcv = item.rcvAmount ?? item.itemAmount ?? 0;
      const acv = item.acvAmount ?? 0;
      const basePct = item.percentComplete ?? 0;

      totalRcvClaim += rcv;
      totalAcvClaim += acv;

      if (item.isAcvOnly) {
        // ACV items: 80% rebated as credit, 20% O&P billed
        acvRcvTotal += rcv;
        acvReturn += rcv * ACV_REBATE_RATE;
      } else {
        // Regular items: work complete based on percent
        workCompleteRcv += rcv * (basePct / 100);
      }
    }

    for (const entry of reconEntries) {
      const rcv = entry.rcvAmount ?? 0;
      const pct = entry.percentComplete ?? 0;
      totalRcvClaim += rcv;
      workCompleteRcv += rcv * (pct / 100);
    }

    // ACV O&P is 20% of total RCV for ACV items
    const opRate = ACV_OP_RATE;
    const acvOP = acvRcvTotal * ACV_OP_RATE;

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

  /**
   * Format invoice number as INV-[COMPANY]:yymmdd.xxxzz
   * Where xxxzz is a 5-digit sequence starting from a random 2-digit base.
   * Example: INV-NCC:260217.00147
   */
  private formatInvoiceNumber(sequenceNo: number, companyName?: string | null) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateStr = `${yy}${mm}${dd}`;
    const prefix = this.computeCompanyCodeFromName(companyName);
    const seqStr = String(sequenceNo).padStart(5, "0");
    return `INV-${prefix}:${dateStr}.${seqStr}`;
  }

  /**
   * Format draft invoice number as DFT-[COMPANY]:xx
   * Example: DFT-NCC:01
   */
  private formatDraftInvoiceNumber(draftSeqNo: number, companyName?: string | null) {
    const prefix = this.computeCompanyCodeFromName(companyName);
    const seqStr = String(draftSeqNo).padStart(2, "0");
    return `DFT-${prefix}:${seqStr}`;
  }

  /**
   * Extract first 3 alphanumeric characters from company name for invoice prefix.
   * Falls back to "NCC" if company name is empty or has no valid chars.
   */
  private computeCompanyCodeFromName(companyName: string | null | undefined): string {
    const raw = String(companyName ?? "").trim();
    if (!raw) return "NCC";

    // Remove all non-alphanumeric characters and take first 3
    const cleaned = raw.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
    if (cleaned.length === 0) return "NCC";

    return cleaned.slice(0, 3).padEnd(3, "X");
  }

  /**
   * Generate a random starting invoice number (10-99) for new tenants
   * so the company doesn't appear brand new.
   */
  private generateRandomStartingInvoiceNo(): number {
    return Math.floor(Math.random() * 90) + 10; // 10-99
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

  private invoiceApplicationModelsAvailable() {
    const p: any = this.prisma as any;
    return typeof p?.projectInvoiceApplication?.findMany === "function";
  }

  private ensureInvoiceApplicationModelsAvailable() {
    if (this.invoiceApplicationModelsAvailable()) return;

    throw new BadRequestException(
      "Project invoice applications are not initialized on this API instance. Run `npm -w packages/database run prisma:generate` and restart the API; if it still fails, run `npm -w packages/database run prisma:migrate`.",
    );
  }

  private isInvoiceApplicationTableMissingError(err: any) {
    return this.isMissingPrismaTableError(err, "ProjectInvoiceApplication");
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
          // Include source daily log to check if it still exists and is still a receipt
          sourceDailyLog: {
            select: {
              id: true,
              type: true,
              title: true,
            },
          },
          // Include invoice line items that reference this bill (to find actual invoice)
          invoiceLines: {
            select: {
              id: true,
              invoiceId: true,
              invoice: {
                select: {
                  id: true,
                  invoiceNo: true,
                  status: true,
                },
              },
            },
          },
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

      // Billable expense calculation
      const isBillable = dto.isBillable ?? false;
      const markupPercent = isBillable ? (dto.markupPercent ?? 25) : 0;
      const billableAmount = isBillable ? amount * (1 + markupPercent / 100) : 0;

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
          isBillable,
          markupPercent,
          billableAmount,
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
          isBillable: bill.isBillable,
          billableAmount: bill.billableAmount,
        },
      });

      // If billable, auto-create invoice line on the EXPENSE draft invoice
      if (bill.isBillable && this.billingModelsAvailable()) {
        try {
          await this.syncBillableExpenseInvoiceLine(project.id, project.companyId, bill, actor);
        } catch (syncErr: any) {
          this.logger.error(`Failed to sync billable expense invoice line for new bill ${bill.id}: ${syncErr?.message ?? syncErr}`);
          // Non-fatal - bill was created successfully
        }
      }

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

      // Billable expense handling
      const wasBillable = (existing as any).isBillable ?? false;
      const nextIsBillable = dto.isBillable === undefined ? wasBillable : dto.isBillable;
      const nextMarkupPercent = nextIsBillable
        ? (dto.markupPercent === undefined ? ((existing as any).markupPercent ?? 25) : dto.markupPercent)
        : 0;
      const nextBillableAmount = nextIsBillable ? nextAmount * (1 + nextMarkupPercent / 100) : 0;

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
            isBillable: nextIsBillable,
            markupPercent: nextMarkupPercent,
            billableAmount: nextBillableAmount,
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

        // Update totalAmount and return fresh data with all fields
        await tx.projectBill.update({
          where: { id: existing.id },
          data: { totalAmount: nextLine.amount },
        });

        return tx.projectBill.findFirstOrThrow({
          where: { id: existing.id },
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
          isBillable: (updated as any).isBillable,
          billableAmount: (updated as any).billableAmount,
        },
      });

      // Sync billable expense invoice line
      if (this.billingModelsAvailable()) {
        try {
          if ((updated as any).isBillable) {
            await this.syncBillableExpenseInvoiceLine(project.id, project.companyId, updated as any, actor);
          } else if (wasBillable && !nextIsBillable) {
            // Bill was billable, now it's not - remove the invoice line
            await this.removeBillableExpenseInvoiceLine(project.id, project.companyId, updated.id);
          }
        } catch (syncErr: any) {
          this.logger.error(`Failed to sync billable expense invoice line for bill ${updated.id}: ${syncErr?.message ?? syncErr}`);
          // Non-fatal - bill was updated successfully
        }
      }

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

  /**
   * Delete a project bill. Used primarily for orphaned receipt bills
   * where the source daily log was deleted or changed from RECEIPT_EXPENSE type.
   */
  async deleteProjectBill(
    projectId: string,
    billId: string,
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
        include: {
          sourceDailyLog: { select: { id: true, type: true } },
        },
      });

      if (!bill) {
        throw new NotFoundException("Bill not found for this project");
      }

      // If this bill is linked to an existing receipt daily log, prevent deletion
      // unless the daily log type has changed away from RECEIPT_EXPENSE
      if (bill.sourceDailyLogId && bill.sourceDailyLog) {
        if (bill.sourceDailyLog.type === "RECEIPT_EXPENSE") {
          throw new BadRequestException(
            "Cannot delete this bill because it is linked to an active receipt daily log. " +
            "To remove this bill, either change the daily log type or delete the daily log first."
          );
        }
      }

      // If billable, remove any associated invoice line items first
      if ((bill as any).isBillable && this.billingModelsAvailable()) {
        try {
          await this.removeBillableExpenseInvoiceLine(project.id, project.companyId, bill.id);
        } catch (syncErr: any) {
          this.logger.warn(`Failed to remove invoice line for bill ${bill.id}: ${syncErr?.message ?? syncErr}`);
          // Non-fatal
        }
      }

      // Delete the bill (cascade will remove line items and attachments)
      await this.prisma.projectBill.delete({
        where: { id: bill.id },
      });

      await this.audit.log(actor, "PROJECT_BILL_DELETED", {
        companyId: project.companyId,
        projectId: project.id,
        metadata: {
          billId: bill.id,
          vendorName: bill.vendorName,
          totalAmount: bill.totalAmount,
          wasOrphaned: bill.sourceDailyLogId && !bill.sourceDailyLog,
        },
      });

      return { deleted: true, billId: bill.id };
    } catch (err: any) {
      if (this.isBillTableMissingError(err)) {
        this.throwBillTablesNotMigrated();
      }
      throw err;
    }
  }

  async attachInvoiceFile(
    projectId: string,
    invoiceId: string,
    dto: AttachInvoiceFileDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const invoice = await this.prisma.projectInvoice.findFirst({
        where: {
          id: invoiceId,
          projectId: project.id,
          companyId: project.companyId,
        },
        select: { id: true },
      });

      if (!invoice) {
        throw new NotFoundException("Invoice not found for this project");
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
        await (this.prisma as any).projectInvoiceAttachment.create({
          data: {
            invoiceId: invoice.id,
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

      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  /**
   * Get or create a draft invoice for a specific category (EXPENSE or HOURS).
   * Used for billable expenses and billable hours invoices.
   */
  private async getOrCreateCategoryDraftInvoice(
    projectId: string,
    companyId: string,
    category: ProjectInvoiceCategory,
    actor: AuthenticatedUser,
  ) {
    const existingDraft = await this.prisma.projectInvoice.findFirst({
      where: {
        projectId,
        companyId,
        category,
        status: ProjectInvoiceStatus.DRAFT,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    if (existingDraft) {
      return existingDraft;
    }

    // Fetch company name for draft number prefix
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    // Increment draft counter
    const counter = await this.prisma.companyInvoiceCounter.upsert({
      where: { companyId },
      update: { lastDraftNo: { increment: 1 } },
      create: { companyId, lastDraftNo: 1 },
    });

    const draftSeqNo = counter.lastDraftNo;
    const draftInvoiceNo = this.formatDraftInvoiceNumber(draftSeqNo, company?.name);

    const categoryLabel = category === ProjectInvoiceCategory.EXPENSE
      ? "Billable Expenses"
      : category === ProjectInvoiceCategory.HOURS
        ? "Billable Hours"
        : "Invoice";

    return this.prisma.projectInvoice.create({
      data: {
        companyId,
        projectId,
        category,
        status: ProjectInvoiceStatus.DRAFT,
        draftSequenceNo: draftSeqNo,
        invoiceNo: draftInvoiceNo,
        memo: categoryLabel,
        createdByUserId: actor.userId,
      },
    });
  }

  /**
   * Sync a billable expense from a bill to an invoice line item.
   * Creates or updates a line item on the EXPENSE draft invoice.
   * Also copies bill attachments to the invoice.
   * 
   * If the bill has a targetInvoiceId set, the line item goes to that invoice instead
   * of the default EXPENSE draft invoice.
   */
  private async syncBillableExpenseInvoiceLine(
    projectId: string,
    companyId: string,
    bill: {
      id: string;
      vendorName: string;
      billNumber?: string | null;
      billableAmount: number;
      markupPercent: number;
      totalAmount: number;
      targetInvoiceId?: string | null;
      attachments?: { projectFileId: string; fileUrl: string; fileName?: string | null; mimeType?: string | null; sizeBytes?: number | null }[];
    },
    actor: AuthenticatedUser,
  ) {
    try {
      let invoice: { id: string };
      
      // If bill has a targetInvoiceId, use that invoice (must be DRAFT EXPENSE)
      if (bill.targetInvoiceId) {
        const targetInv = await this.prisma.projectInvoice.findFirst({
          where: {
            id: bill.targetInvoiceId,
            projectId,
            companyId,
            status: ProjectInvoiceStatus.DRAFT,
            category: ProjectInvoiceCategory.EXPENSE,
          },
        });
        
        if (targetInv) {
          invoice = targetInv;
        } else {
          // Target invoice not found or not draft/expense - fall back to default
          invoice = await this.getOrCreateCategoryDraftInvoice(
            projectId,
            companyId,
            ProjectInvoiceCategory.EXPENSE,
            actor,
          );
        }
      } else {
        // Default behavior: use/create the default EXPENSE draft invoice
        invoice = await this.getOrCreateCategoryDraftInvoice(
          projectId,
          companyId,
          ProjectInvoiceCategory.EXPENSE,
          actor,
        );
      }

      // Check if there's already an invoice line for this bill
      const existingLine = await this.prisma.projectInvoiceLineItem.findFirst({
        where: {
          invoiceId: invoice.id,
          sourceBillId: bill.id,
        },
      });

      const description = bill.billNumber
        ? `${bill.vendorName} (#${bill.billNumber})`
        : bill.vendorName;

      if (existingLine) {
        // Update existing line
        await this.prisma.projectInvoiceLineItem.update({
          where: { id: existingLine.id },
          data: {
            description,
            amount: bill.billableAmount,
            unitPrice: bill.totalAmount,
            qty: 1,
          },
        });
      } else {
        // Create new line
        await this.prisma.projectInvoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            kind: ProjectInvoiceLineItemKind.MANUAL,
            billingTag: ProjectInvoicePetlLineBillingTag.NONE,
            sourceBillId: bill.id,
            description,
            qty: 1,
            unitPrice: bill.totalAmount,
            amount: bill.billableAmount,
          },
        });
      }

      // Recompute invoice total
      await this.recomputeInvoiceTotal(invoice.id);

      // Copy bill attachments to the invoice (if any)
      if (bill.attachments && bill.attachments.length > 0) {
        for (const att of bill.attachments) {
          try {
            await (this.prisma as any).projectInvoiceAttachment.create({
              data: {
                invoiceId: invoice.id,
                projectFileId: att.projectFileId,
                fileUrl: att.fileUrl,
                fileName: att.fileName ?? null,
                mimeType: att.mimeType ?? null,
                sizeBytes: att.sizeBytes ?? null,
              },
            });
          } catch (attachErr: any) {
            // Ignore duplicate attaches (P2002 = unique constraint violation)
            if (String(attachErr?.code ?? "") !== "P2002") {
              this.logger.warn(
                `Failed to copy bill attachment ${att.projectFileId} to invoice ${invoice.id}: ${attachErr?.message ?? attachErr}`,
              );
            }
          }
        }
      }
    } catch (err: any) {
      // Non-fatal: log but don't fail the bill operation
      this.logger.warn(
        `syncBillableExpenseInvoiceLine failed for bill ${bill.id}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Remove a billable expense invoice line when a bill is no longer billable.
   */
  private async removeBillableExpenseInvoiceLine(
    projectId: string,
    companyId: string,
    billId: string,
  ) {
    try {
      // Find the EXPENSE draft invoice
      const invoice = await this.prisma.projectInvoice.findFirst({
        where: {
          projectId,
          companyId,
          category: ProjectInvoiceCategory.EXPENSE,
          status: ProjectInvoiceStatus.DRAFT,
        },
      });

      if (!invoice) return;

      // Delete the line item for this bill
      await this.prisma.projectInvoiceLineItem.deleteMany({
        where: {
          invoiceId: invoice.id,
          sourceBillId: billId,
        },
      });

      // Recompute invoice total
      await this.recomputeInvoiceTotal(invoice.id);
    } catch (err: any) {
      // Non-fatal: log but don't fail the bill operation
      this.logger.warn(
        `removeBillableExpenseInvoiceLine failed for bill ${billId}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Create or sync the EXPENSE category invoice from all billable bills.
   * This is called from the frontend to create the expense invoice if it doesn't exist,
   * or to sync all billable bills to the existing expense invoice.
   */
  async syncBillableExpensesInvoice(projectId: string, actor: AuthenticatedUser) {
    this.ensureBillingModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      // Get all billable bills for this project (including attachments)
      const billableBills = await this.prisma.projectBill.findMany({
        where: {
          projectId: project.id,
          companyId: project.companyId,
          isBillable: true,
        },
        include: {
          lineItems: { orderBy: { createdAt: "asc" } },
          attachments: true,
        },
      });

      if (billableBills.length === 0) {
        throw new BadRequestException("No billable bills found for this project");
      }

      // Get or create the EXPENSE draft invoice
      const invoice = await this.getOrCreateCategoryDraftInvoice(
        project.id,
        project.companyId,
        ProjectInvoiceCategory.EXPENSE,
        actor,
      );

      // Sync each billable bill to the invoice (including attachments)
      for (const bill of billableBills) {
        await this.syncBillableExpenseInvoiceLine(
          project.id,
          project.companyId,
          {
            id: bill.id,
            vendorName: bill.vendorName,
            billNumber: bill.billNumber,
            billableAmount: Number(bill.billableAmount) || 0,
            markupPercent: Number(bill.markupPercent) || 0,
            totalAmount: Number(bill.totalAmount) || 0,
            targetInvoiceId: (bill as any).targetInvoiceId ?? null,
            attachments: (bill.attachments ?? []).map((a) => ({
              projectFileId: a.projectFileId,
              fileUrl: a.fileUrl,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
            })),
          },
          actor,
        );
      }

      // Return the full invoice with line items
      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillTableMissingError(err)) {
        this.throwBillTablesNotMigrated();
      }
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
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
          category: true,
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

      let invoice;
      if (existingDraft) {
        invoice = await this.prisma.projectInvoice.update({
          where: { id: existingDraft.id },
          data: {
            billToName: dto.billToName ?? existingDraft.billToName,
            billToEmail: dto.billToEmail ?? existingDraft.billToEmail,
            memo: dto.memo ?? existingDraft.memo,
          },
        });
      } else {
        // Create new draft with provisional draft number
        const company = await this.prisma.company.findUnique({
          where: { id: project.companyId },
          select: { name: true },
        });

        // Increment draft counter
        const counter = await this.prisma.companyInvoiceCounter.upsert({
          where: { companyId: project.companyId },
          update: { lastDraftNo: { increment: 1 } },
          create: { companyId: project.companyId, lastDraftNo: 1 },
        });

        const draftSeqNo = counter.lastDraftNo;
        const draftInvoiceNo = this.formatDraftInvoiceNumber(draftSeqNo, company?.name);

        invoice = await this.prisma.projectInvoice.create({
          data: {
            companyId: project.companyId,
            projectId: project.id,
            status: ProjectInvoiceStatus.DRAFT,
            draftSequenceNo: draftSeqNo,
            invoiceNo: draftInvoiceNo,
            billToName: dto.billToName ?? null,
            billToEmail: dto.billToEmail ?? null,
            memo: dto.memo ?? null,
            createdByUserId: actor.userId,
          },
        });
      }

      // Best effort: keep the living draft synced to PETL as the source of truth.
      // Only run if the Prisma client includes the new model.
      // For existing drafts, skip sync to make "Open living invoice" instant - user can
      // manually trigger sync if needed. For newly created drafts, run sync inline so
      // the invoice has PETL lines when first opened.
      if (this.invoicePetlModelsAvailable()) {
        if (existingDraft) {
          // Existing draft: fire-and-forget async sync to avoid blocking the UI.
          // The UI will show current state immediately; sync happens in background.
          setImmediate(() => {
            this.syncDraftInvoiceFromPetl(projectId, invoice.id, actor).catch((err: any) => {
              const code = String((err as any)?.code ?? "");
              const msg = String((err as any)?.message ?? "");
              this.logger.warn(
                `[async] syncDraftInvoiceFromPetl failed for invoice ${invoice.id} on project ${projectId} (code=${code}): ${msg}`,
              );
            });
          });
        } else {
          // New draft: sync inline so the invoice has PETL lines immediately.
          try {
            await this.syncDraftInvoiceFromPetl(projectId, invoice.id, actor);
          } catch (err: any) {
            const code = String((err as any)?.code ?? "");
            const msg = String((err as any)?.message ?? "");
            this.logger.warn(
              `syncDraftInvoiceFromPetl failed for invoice ${invoice.id} on project ${projectId} (code=${code}): ${msg}`,
            );
          }
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
    this.logger.log(`[getProjectInvoice] Starting for projectId=${projectId}, invoiceId=${invoiceId}`);

    try {
      this.ensureBillingModelsAvailable();
      this.logger.log(`[getProjectInvoice] Billing models available, fetching project...`);
      await this.getProjectByIdForUser(projectId, actor);
      this.logger.log(`[getProjectInvoice] Project found, fetching invoice...`);

      const invoice = await this.prisma.projectInvoice.findFirst({
        where: { id: invoiceId, projectId, companyId: actor.companyId },
        include: {
          lineItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              sourceBill: {
                include: {
                  attachments: { orderBy: { createdAt: "asc" } },
                },
              },
            },
          },
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
              displayLineNo: true,
              anchorRootSourceLineNo: true,
              anchorKind: true,
              anchorSubIndex: true,
              anchorGroupSubIndex: true,
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

      // Load attachments (best effort; table may not exist yet)
      let attachments: any[] = [];
      try {
        const rawAttachments = await (this.prisma as any).projectInvoiceAttachment.findMany({
          where: { invoiceId: invoice.id },
          orderBy: [{ createdAt: "asc" }],
        });
        // Convert GCS URIs to public HTTP URLs
        attachments = rawAttachments.map((a: any) => ({
          ...a,
          fileUrl: this.toPublicFileUrl(a.fileUrl),
        }));
      } catch (err: any) {
        if (!this.isMissingPrismaTableError(err, "ProjectInvoiceAttachment")) {
          throw err;
        }
        attachments = [];
      }

      // Also transform bill attachment URLs in line items
      const lineItemsWithPublicUrls = (invoice.lineItems ?? []).map((li: any) => {
        if (!li.sourceBill?.attachments) return li;
        return {
          ...li,
          sourceBill: {
            ...li.sourceBill,
            attachments: li.sourceBill.attachments.map((a: any) => ({
              ...a,
              fileUrl: this.toPublicFileUrl(a.fileUrl),
            })),
          },
        };
      });

      return { ...invoice, lineItems: lineItemsWithPublicUrls, payments, petlLines, attachments, paidAmount, balanceDue };
    } catch (err: any) {
      const errCode = err?.code ?? 'no code';
      const errMeta = err?.meta ? JSON.stringify(err.meta) : 'no meta';
      const errStack = err?.stack?.slice(0, 800) ?? 'no stack';
      this.logger.error(`[getProjectInvoice] FAILED for projectId=${projectId}, invoiceId=${invoiceId}`);
      this.logger.error(`[getProjectInvoice] Error: ${err?.message ?? err}`);
      this.logger.error(`[getProjectInvoice] Code: ${errCode}, Meta: ${errMeta}`);
      this.logger.error(`[getProjectInvoice] Stack: ${errStack}`);
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  /**
   * Update invoice fields (Admin/Owner only, DRAFT invoices only).
   * Note: Role is enforced at the controller level via @Roles decorator.
   */
  async updateInvoice(
    projectId: string,
    invoiceId: string,
    dto: UpdateInvoiceDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    const project = await this.getProjectByIdForUser(projectId, actor);

    const invoice = await this.prisma.projectInvoice.findFirst({
      where: { id: invoiceId, projectId: project.id, companyId: project.companyId },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found for this project");
    }

    // Only allow updates on DRAFT invoices
    if (invoice.status !== ProjectInvoiceStatus.DRAFT) {
      throw new BadRequestException("Only draft invoices can be edited");
    }

    const updateData: any = {};
    if (dto.invoiceNo !== undefined) {
      updateData.invoiceNo = dto.invoiceNo || null;
    }
    if (dto.billToName !== undefined) {
      updateData.billToName = dto.billToName || null;
    }
    if (dto.billToEmail !== undefined) {
      updateData.billToEmail = dto.billToEmail || null;
    }
    if (dto.memo !== undefined) {
      updateData.memo = dto.memo || null;
    }

    const updated = await this.prisma.projectInvoice.update({
      where: { id: invoice.id },
      data: updateData,
    });

    return updated;
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
          billingTag: true,
          lineNoSnapshot: true,
          anchorRootSourceLineNo: true,
          anchorSubIndex: true,
          thisInvItemAmount: true,
          thisInvTaxAmount: true,
          thisInvOpAmount: true,
          thisInvTotal: true,
        },
      });

      // Track previously billed amounts for base/ACV PETL lines and, separately,
      // for reconciliation-driven supplement / change-order lines.
      const prevReconByKey = new Map<
        string,
        {
          item: number;
          tax: number;
          op: number;
          total: number;
        }
      >();

      for (const row of priorLines) {
        const isReconLine =
          row.kind === "BASE" &&
          row.billingTag !== ProjectInvoicePetlLineBillingTag.PETL_LINE_ITEM;

        if (isReconLine) {
          // Recon lines are keyed by (sowItemId, root, subIndex, billingTag) so each
          // supplement / change order can be tracked independently across invoices.
          const root = (row.anchorRootSourceLineNo ?? row.lineNoSnapshot ?? 0) as number;
          const subIndex = (row.anchorSubIndex ?? 0) as number;
          const reconKey = `${row.sowItemId}:${root}:${subIndex}:${row.billingTag}`;

          const existingRecon = prevReconByKey.get(reconKey) ?? {
            item: 0,
            tax: 0,
            op: 0,
            total: 0,
          };
          existingRecon.item += row.thisInvItemAmount ?? 0;
          existingRecon.tax += row.thisInvTaxAmount ?? 0;
          existingRecon.op += row.thisInvOpAmount ?? 0;
          existingRecon.total += row.thisInvTotal ?? 0;
          prevReconByKey.set(reconKey, existingRecon);

          // Do not let recon lines bleed into base/ACV prevByKey aggregation.
          continue;
        }

        const key = `${row.sowItemId}:${row.kind}`;
        const existing = prevByKey.get(key) ?? { item: 0, tax: 0, op: 0, total: 0 };
        existing.item += row.thisInvItemAmount ?? 0;
        existing.tax += row.thisInvTaxAmount ?? 0;
        existing.op += row.thisInvOpAmount ?? 0;
        existing.total += row.thisInvTotal ?? 0;
        prevByKey.set(key, existing);
      }

      // Expose prevReconByKey to the rest of this function via closure.
      (prevByKey as any)._recon = prevReconByKey;
    }

    // ACV (Actual Cash Value): Carrier paid, but client chose NOT to do the repair.
    // We only bill O&P (20%) - the rest (80%) is rebated to the insured.
    // The holdback rate is 80% (what we DON'T bill).
    const ACV_HOLDBACK_RATE = 0.8;

    // Line-tied reconciliation entries (APPROVED, monetary) keyed by parent sowItemId.
    let reconByParent = new Map<string, any[]>();
    let lineSubIndexByRoot = new Map<number, number>();
    try {
      const reconEntries = await this.prisma.petlReconciliationEntry.findMany({
        where: {
          projectId: project.id,
          estimateVersionId: latestVersion.id,
          rcvAmount: { not: null },
          parentSowItemId: { not: null },
        },
        orderBy: { createdAt: "asc" },
      });
      reconByParent = new Map();
      for (const e of reconEntries as any[]) {
        const key = String(e.parentSowItemId);
        const arr = reconByParent.get(key) ?? [];
        arr.push(e);
        reconByParent.set(key, arr);
      }
    } catch (err: any) {
      if (
        !this.isMissingPrismaTableError(err, "PetlReconciliationEntry") &&
        !this.isMissingPrismaTableError(err, "PetlReconciliationCase")
      ) {
        throw err;
      }
      reconByParent = new Map();
      lineSubIndexByRoot = new Map();
    }

    const nextLineSubIndex = (root: number) => {
      const current = lineSubIndexByRoot.get(root) ?? 0;
      const next = current + 1;
      lineSubIndexByRoot.set(root, next);
      return next;
    };

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
      const prevReconByKey = (prevByKey as any)._recon as
        | Map<
            string,
            {
              item: number;
              tax: number;
              op: number;
              total: number;
            }
          >
        | undefined;

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
        // For now, derive display and anchor information from PETL-managed lineNo.
        displayLineNo: String(s.lineNo),
        anchorRootSourceLineNo: s.sourceLineNo ?? s.lineNo,
        anchorKind: "BASE",
        anchorSubIndex: null,
        anchorGroupSubIndex: null,
        billingTag: ProjectInvoicePetlLineBillingTag.PETL_LINE_ITEM,
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

      // Line-tied reconciliation entries (supplements, change orders, adds, credits)
      const parentReconEntries = reconByParent.get(s.id) ?? [];
      if (parentReconEntries.length > 0) {
        const root = s.sourceLineNo ?? s.lineNo;

        for (const e of parentReconEntries) {
          const isSupplement = e.tag === PetlReconciliationEntryTag.SUPPLEMENT;
          const isChangeOrder =
            e.kind === PetlReconciliationEntryKind.CHANGE_ORDER_CLIENT_PAY ||
            e.tag === PetlReconciliationEntryTag.CHANGE_ORDER;
          const isAdd = e.kind === PetlReconciliationEntryKind.ADD;
          const isCredit = e.kind === PetlReconciliationEntryKind.CREDIT;

          // Skip NOTE_ONLY entries (no monetary value)
          if (e.kind === PetlReconciliationEntryKind.NOTE_ONLY) continue;

          const subIndex = nextLineSubIndex(root);
          const displayLineNo = `${root}.${subIndex.toString().padStart(3, "0")}`;

          const contractItem = e.itemAmount ?? 0;
          const contractTax = e.salesTaxAmount ?? 0;
          const contractOp = e.opAmount ?? 0;
          const contractTotal = e.rcvAmount ?? 0;

          const reconPct = this.clampPercentComplete(e.percentComplete) / 100;
          const earnedItem = contractItem * reconPct;
          const earnedTax = contractTax * reconPct;
          const earnedOp = contractOp * reconPct;
          const earnedTotal = contractTotal * reconPct;

          // Determine billing tag based on entry type
          const reconBillingTag = isSupplement
            ? ProjectInvoicePetlLineBillingTag.SUPPLEMENT
            : isChangeOrder
              ? ProjectInvoicePetlLineBillingTag.CHANGE_ORDER
              : ProjectInvoicePetlLineBillingTag.PETL_LINE_ITEM;

          const reconKey = `${e.parentSowItemId}:${root}:${subIndex}:${reconBillingTag}`;
          const reconPrev = prevReconByKey?.get(reconKey) ?? { item: 0, tax: 0, op: 0, total: 0 };

          let thisInvItem = earnedItem - reconPrev.item;
          let thisInvTax = earnedTax - reconPrev.tax;
          let thisInvOp = earnedOp - reconPrev.op;
          let thisInvTotal = earnedTotal - reconPrev.total;

          // If entry has since been marked REJECTED, zero out dollars but keep the line.
          if (e.status === PetlReconciliationEntryStatus.REJECTED) {
            thisInvItem = 0;
            thisInvTax = 0;
            thisInvOp = 0;
            thisInvTotal = 0;
          }

          // Use the reconciliation entry's own ID as sowItemId to avoid duplicate key
          // constraint with the parent BASE line (invoiceId, sowItemId, kind must be unique).
          const reconLine = {
            invoiceId: invoice.id,
            kind: "BASE" as const,
            parentLineId: null,
            estimateVersionId: e.estimateVersionId,
            sowItemId: e.id,
            logicalItemId: s.logicalItemId,
            projectParticleId: e.projectParticleId,
            projectParticleLabelSnapshot: particleLabel,
            projectUnitIdSnapshot: unit?.id ?? null,
            projectUnitLabelSnapshot: unitLabel,
            projectBuildingIdSnapshot: building?.id ?? null,
            projectBuildingLabelSnapshot: buildingLabel,
            projectTreePathSnapshot: treePath,
            lineNoSnapshot: s.lineNo,
            displayLineNo,
            anchorRootSourceLineNo: root,
            anchorKind: "LINE_TIED",
            anchorSubIndex: subIndex,
            anchorGroupSubIndex: null,
            billingTag: reconBillingTag,
            categoryCodeSnapshot: e.categoryCode ?? s.categoryCode ?? null,
            selectionCodeSnapshot: e.selectionCode ?? s.selectionCode ?? null,
            descriptionSnapshot: e.description ?? s.description,
            unitSnapshot: e.unit ?? s.unit ?? null,
            percentCompleteSnapshot: this.clampPercentComplete(e.percentComplete),
            contractItemAmount: contractItem,
            contractTaxAmount: contractTax,
            contractOpAmount: contractOp,
            contractTotal,
            earnedItemAmount: earnedItem,
            earnedTaxAmount: earnedTax,
            earnedOpAmount: earnedOp,
            earnedTotal: earnedTotal,
            prevBilledItemAmount: reconPrev.item,
            prevBilledTaxAmount: reconPrev.tax,
            prevBilledOpAmount: reconPrev.op,
            prevBilledTotal: reconPrev.total,
            thisInvItemAmount: thisInvItem,
            thisInvTaxAmount: thisInvTax,
            thisInvOpAmount: thisInvOp,
            thisInvTotal: thisInvTotal,
          };

          linesToCreate.push(reconLine);
        }
      }

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

    await pAny.$transaction(
      async (tx: any) => {
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
      },
      // Large PETL grids can involve many rows; extend the interactive transaction
      // timeout so Cloud SQL / Prisma do not abort with P2028 under normal loads.
      { timeout: 600_000, maxWait: 60_000 },
    );

    return { status: "ok", estimateVersionId: latestVersion.id, lineCount: linesToCreate.length };
  }

  private async maybeSyncLivingDraftInvoiceFromPetl(projectId: string, companyId: string, actor: AuthenticatedUser) {
    this.logger.log(`[Invoice sync] Starting for project ${projectId}`);
    if (!this.billingModelsAvailable()) {
      this.logger.log(`[Invoice sync] Billing models not available, skipping`);
      return;
    }
    if (!this.invoicePetlModelsAvailable()) {
      this.logger.log(`[Invoice sync] Invoice PETL models not available, skipping`);
      return;
    }

    const draft = await this.prisma.projectInvoice.findFirst({
      where: {
        projectId,
        companyId,
        status: ProjectInvoiceStatus.DRAFT,
      },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true },
    });

    if (!draft) {
      this.logger.log(`[Invoice sync] No draft invoice found for project ${projectId}`);
      return;
    }

    this.logger.log(`[Invoice sync] Found draft invoice ${draft.id}, syncing...`);
    try {
      const result = await this.syncDraftInvoiceFromPetl(projectId, draft.id, actor);
      this.logger.log(`[Invoice sync] Sync result: ${JSON.stringify(result)}`);
    } catch (err: any) {
      // Non-fatal: log the error but don't crash the PETL update.
      // Common issues include duplicate key constraints when reconciliation
      // entries create lines with the same (invoiceId, sowItemId, kind) tuple.
      this.logger.error(`[Invoice sync] Error (non-fatal): ${err?.message ?? err}`);
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

      const unitCode = dto.unitCode?.trim().toUpperCase().slice(0, 5) || null;

      await this.prisma.projectInvoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          kind,
          billingTag: dto.billingTag ?? ProjectInvoicePetlLineBillingTag.NONE,
          companyPriceListItemId,
          unitCode,
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

      const nextUnitCode =
        dto.unitCode === undefined
          ? (existing as any).unitCode ?? null
          : dto.unitCode?.trim().toUpperCase().slice(0, 5) || null;

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
          unitCode: nextUnitCode,
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

  async deleteDraftInvoice(
    projectId: string,
    invoiceId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);

      if (invoice.status !== ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException("Only draft invoices can be deleted");
      }

      // Check if the invoice has any dollar amount
      const total = await this.recomputeInvoiceTotal(invoice.id);
      if (total !== 0) {
        throw new BadRequestException(
          "Cannot delete an invoice with a non-zero total. Remove all line items first or void the invoice after issuing.",
        );
      }

      // Delete PETL lines first (if they exist)
      if (this.invoicePetlModelsAvailable()) {
        try {
          const p: any = this.prisma as any;
          await p.projectInvoicePetlLine.deleteMany({ where: { invoiceId: invoice.id } });
        } catch (err: any) {
          if (!this.isMissingPrismaTableError(err, "ProjectInvoicePetlLine")) {
            throw err;
          }
        }
      }

      // Delete manual line items
      await this.prisma.projectInvoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });

      // Delete the invoice
      await this.prisma.projectInvoice.delete({ where: { id: invoice.id } });

      return { deleted: true, invoiceId: invoice.id };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  /**
   * Void an issued (locked) invoice. This marks the invoice as VOID
   * and prevents further payments or edits. Existing payments are preserved
   * but the invoice balance is considered settled.
   */
  async voidInvoice(
    projectId: string,
    invoiceId: string,
    dto: { reason?: string },
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    try {
      const { project, invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);

      if (invoice.status === ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException(
          "Cannot void a draft invoice. Delete it instead or issue it first."
        );
      }

      if (invoice.status === ProjectInvoiceStatus.VOID) {
        throw new BadRequestException("Invoice is already voided");
      }

      // Update invoice status to VOID
      await this.prisma.projectInvoice.update({
        where: { id: invoice.id },
        data: {
          status: ProjectInvoiceStatus.VOID,
          memo: dto.reason
            ? `${invoice.memo ? invoice.memo + "\n" : ""}[VOIDED: ${dto.reason}]`
            : invoice.memo
            ? `${invoice.memo}\n[VOIDED]`
            : "[VOIDED]",
        },
      });

      await this.audit.log(actor, "PROJECT_INVOICE_VOIDED", {
        companyId: project.companyId,
        projectId: project.id,
        metadata: {
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          totalAmount: invoice.totalAmount,
          previousStatus: invoice.status,
          reason: dto.reason ?? null,
        },
      });

      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  /**
   * Unlock an issued invoice to allow editing.
   * - Only ISSUED invoices with $0 paid can be unlocked
   * - Requires Admin/Owner/PM role
   * - Requires a reason for audit trail
   * - Keeps the invoice number, increments revision number
   */
  async unlockInvoice(
    projectId: string,
    invoiceId: string,
    dto: { reason: string },
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    // Check role - only Admin or Owner can unlock
    const allowedRoles: string[] = [Role.ADMIN, Role.OWNER];
    if (!allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(
        "Only Admins or Owners can unlock invoices"
      );
    }

    // Validate reason is provided
    const reason = String(dto.reason ?? "").trim();
    if (!reason) {
      throw new BadRequestException("A reason is required to unlock an invoice");
    }

    try {
      const { project, invoice } = await this.getInvoiceOrThrow(projectId, invoiceId, actor);

      // Only non-DRAFT, non-VOID invoices can be unlocked
      if (invoice.status === ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException(
          "Cannot unlock a draft invoice. It's already editable."
        );
      }
      if (invoice.status === ProjectInvoiceStatus.VOID) {
        throw new BadRequestException(
          "Cannot unlock a voided invoice."
        );
      }

      // Check if any payments have been made
      const paidAmount = await this.computeInvoicePaymentTotal(invoice.id);
      if (paidAmount > 0) {
        throw new BadRequestException(
          `Cannot unlock invoice with payments received ($${paidAmount.toFixed(2)}). Remove payments first.`
        );
      }

      // Get current unlock history and add new entry
      const currentHistory = Array.isArray((invoice as any).unlockHistory)
        ? (invoice as any).unlockHistory
        : [];

      // Get user's name for audit trail
      const user = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      const userName = user
        ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
        : actor.userId;

      const newHistoryEntry = {
        unlockedAt: new Date().toISOString(),
        unlockedByUserId: actor.userId,
        unlockedByName: userName,
        reason,
        previousRevision: (invoice as any).revisionNumber ?? 1,
      };

      const updatedHistory = [...currentHistory, newHistoryEntry];
      const nextRevision = ((invoice as any).revisionNumber ?? 1) + 1;

      // Update invoice - revert to DRAFT but keep invoice number
      await this.prisma.projectInvoice.update({
        where: { id: invoice.id },
        data: {
          status: ProjectInvoiceStatus.DRAFT,
          lockedAt: null,
          // Keep issuedAt, invoiceNo, invoiceSequenceNo intact
          revisionNumber: nextRevision,
          unlockHistory: updatedHistory,
        },
      });

      await this.audit.log(actor, "PROJECT_INVOICE_UNLOCKED", {
        companyId: project.companyId,
        projectId: project.id,
        metadata: {
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          totalAmount: invoice.totalAmount,
          reason,
          newRevision: nextRevision,
        },
      });

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
        // Fetch company name for invoice prefix
        const company = await tx.company.findUnique({
          where: { id: project.companyId },
          select: { name: true },
        });

        // Check if counter exists for this company
        const existingCounter = await tx.companyInvoiceCounter.findUnique({
          where: { companyId: project.companyId },
        });

        let counter;
        if (existingCounter) {
          // Increment existing counter
          counter = await tx.companyInvoiceCounter.update({
            where: { companyId: project.companyId },
            data: { lastInvoiceNo: { increment: 1 } },
          });
        } else {
          // Create new counter with random starting number (10-99)
          const startingNo = this.generateRandomStartingInvoiceNo();
          counter = await tx.companyInvoiceCounter.create({
            data: { companyId: project.companyId, lastInvoiceNo: startingNo },
          });
        }

        const sequenceNo = counter.lastInvoiceNo;
        const invoiceNo = this.formatInvoiceNumber(sequenceNo, company?.name);

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

      return this.getProjectInvoice(projectId, invoice.id, actor);
    } catch (err: any) {
      if (
        this.isBillingTableMissingError(err) ||
        this.isPaymentApplicationTableMissingError(err) ||
        this.isMissingPrismaTableError(err, "ProjectPaymentApplication")
      ) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async listInvoiceApplicationSources(
    projectId: string,
    targetInvoiceId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();
    this.ensureInvoiceApplicationModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const target = await this.prisma.projectInvoice.findFirst({
        where: { id: targetInvoiceId, projectId: project.id, companyId: project.companyId },
        select: { id: true, status: true, totalAmount: true },
      });

      if (!target) {
        throw new NotFoundException("Invoice not found for this project");
      }

      if (target.status !== ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException("Can only apply credits to a draft (living) invoice");
      }

      const invoices = await this.prisma.projectInvoice.findMany({
        where: {
          projectId: project.id,
          companyId: project.companyId,
          status: { in: [ProjectInvoiceStatus.ISSUED, ProjectInvoiceStatus.PARTIALLY_PAID, ProjectInvoiceStatus.PAID] },
        },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          totalAmount: true,
          issuedAt: true,
        },
        orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      });

      if (invoices.length === 0) {
        return [];
      }

      const pAny: any = this.prisma as any;
      const appTotals = await pAny.projectInvoiceApplication.groupBy({
        by: ["sourceInvoiceId"],
        where: {
          projectId: project.id,
          companyId: project.companyId,
        },
        _sum: { amount: true },
      });

      const appliedBySource = new Map<string, number>();
      for (const row of appTotals) {
        if (row.sourceInvoiceId) {
          appliedBySource.set(row.sourceInvoiceId, row._sum.amount ?? 0);
        }
      }

      return invoices
        .map((inv) => {
          const applied = appliedBySource.get(inv.id) ?? 0;
          const remaining = Math.max(0, (inv.totalAmount ?? 0) - applied);
          return {
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            status: inv.status,
            totalAmount: inv.totalAmount ?? 0,
            appliedAmount: applied,
            remainingAmount: remaining,
            issuedAt: inv.issuedAt,
          };
        })
        .filter((row) => row.remainingAmount > 0);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err) || this.isInvoiceApplicationTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async applyInvoiceToInvoice(
    projectId: string,
    targetInvoiceId: string,
    dto: ApplyInvoiceToInvoiceDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();
    this.ensureInvoiceApplicationModelsAvailable();

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const target = await this.prisma.projectInvoice.findFirst({
        where: { id: targetInvoiceId, projectId: project.id, companyId: project.companyId },
      });

      if (!target) {
        throw new NotFoundException("Target invoice not found for this project");
      }

      if (target.status !== ProjectInvoiceStatus.DRAFT) {
        throw new BadRequestException("Can only apply credits to a draft (living) invoice");
      }

      const source = await this.prisma.projectInvoice.findFirst({
        where: { id: dto.sourceInvoiceId, projectId: project.id, companyId: project.companyId },
      });

      if (!source) {
        throw new NotFoundException("Source invoice not found for this project");
      }

      if (source.status === ProjectInvoiceStatus.DRAFT || source.status === ProjectInvoiceStatus.VOID) {
        throw new BadRequestException("Source invoice must be an issued, partially paid, or paid invoice");
      }

      const pAny: any = this.prisma as any;
      const existingApps = await pAny.projectInvoiceApplication.groupBy({
        by: ["sourceInvoiceId"],
        where: {
          projectId: project.id,
          companyId: project.companyId,
          sourceInvoiceId: source.id,
        },
        _sum: { amount: true },
      });

      const alreadyApplied = existingApps.length > 0 ? existingApps[0]._sum.amount ?? 0 : 0;
      const remaining = Math.max(0, (source.totalAmount ?? 0) - alreadyApplied);

      if (dto.amount > remaining) {
        throw new BadRequestException(
          `Apply amount exceeds remaining credit from source invoice. Remaining: ${remaining.toFixed(2)}`,
        );
      }

      await this.prisma.$transaction(async (tx) => {
        const maxSort = await tx.projectInvoiceLineItem.aggregate({
          where: { invoiceId: target.id },
          _max: { sortOrder: true },
        });
        const nextSortOrder = (maxSort._max.sortOrder ?? 0) + 1;

        const descriptionBase = source.invoiceNo ?? "source invoice";

        await tx.projectInvoiceLineItem.create({
          data: {
            invoiceId: target.id,
            kind: ProjectInvoiceLineItemKind.MANUAL,
            billingTag: ProjectInvoicePetlLineBillingTag.NONE,
            description: `Credit from ${descriptionBase}`,
            qty: null,
            unitPrice: null,
            amount: -dto.amount,
            sortOrder: nextSortOrder,
          },
        });

        await tx.projectInvoiceApplication.create({
          data: {
            companyId: project.companyId,
            projectId: project.id,
            sourceInvoiceId: source.id,
            targetInvoiceId: target.id,
            amount: dto.amount,
            appliedAt: new Date(),
            createdByUserId: actor.userId,
          },
        });
      });

      await this.recomputeInvoiceTotal(target.id);
      return this.getProjectInvoice(projectId, target.id, actor);
    } catch (err: any) {
      if (this.isBillingTableMissingError(err) || this.isInvoiceApplicationTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  /**
   * Move expense line items to a different invoice.
   * Source invoice must be a DRAFT EXPENSE invoice.
   * Target can be any DRAFT invoice (EXPENSE, PETL, etc.).
   * If targetInvoiceId is not provided, a new EXPENSE draft invoice is created.
   * 
   * Accepts either lineIds (invoice line item IDs) or billIds (project bill IDs).
   * If billIds are provided, the corresponding invoice line items are looked up.
   */
  async moveExpenseLineItemsToInvoice(
    projectId: string,
    sourceInvoiceId: string,
    payload: { lineIds?: string[]; billIds?: string[]; targetInvoiceId?: string },
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();
    this.ensureBillModelsAvailable();

    let lineIds = Array.isArray(payload?.lineIds) ? payload.lineIds.map(String).filter(Boolean) : [];
    const billIds = Array.isArray(payload?.billIds) ? payload.billIds.map(String).filter(Boolean) : [];

    try {
      const { project, invoice: sourceInvoice } = await this.getInvoiceOrThrow(projectId, sourceInvoiceId, actor);
      this.assertInvoiceEditable(sourceInvoice);

      if (sourceInvoice.category !== ProjectInvoiceCategory.EXPENSE) {
        throw new BadRequestException("Source invoice must be an EXPENSE category invoice");
      }

      // If billIds provided, look up the corresponding invoice line items
      if (billIds.length > 0 && lineIds.length === 0) {
        const linesFromBills = await this.prisma.projectInvoiceLineItem.findMany({
          where: {
            invoiceId: sourceInvoice.id,
            sourceBillId: { in: billIds },
          },
          select: { id: true },
        });
        lineIds = linesFromBills.map((li) => li.id);
      }

      if (lineIds.length === 0) {
        throw new BadRequestException("At least one line item id or bill id is required");
      }

      // Get the line items to move
      const lineItems = await this.prisma.projectInvoiceLineItem.findMany({
        where: {
          id: { in: lineIds },
          invoiceId: sourceInvoice.id,
        },
      });

      if (lineItems.length === 0) {
        throw new BadRequestException("No matching line items found on this invoice");
      }

      let targetInvoice: { id: string };

      if (payload.targetInvoiceId) {
        // Use existing invoice as target - can be any draft invoice
        const { invoice: target } = await this.getInvoiceOrThrow(projectId, payload.targetInvoiceId, actor);
        this.assertInvoiceEditable(target);

        if (target.id === sourceInvoice.id) {
          throw new BadRequestException("Target invoice cannot be the same as source invoice");
        }

        targetInvoice = target;
      } else {
        // Create a new EXPENSE draft invoice
        targetInvoice = await this.prisma.projectInvoice.create({
          data: {
            companyId: project.companyId,
            projectId: project.id,
            category: ProjectInvoiceCategory.EXPENSE,
            status: ProjectInvoiceStatus.DRAFT,
            billToName: sourceInvoice.billToName ?? null,
            billToEmail: sourceInvoice.billToEmail ?? null,
            memo: "Billable Expenses",
            createdByUserId: actor.userId,
          },
        });
      }

      // Move the line items in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Move the line items
        await tx.projectInvoiceLineItem.updateMany({
          where: {
            id: { in: lineIds },
            invoiceId: sourceInvoice.id,
          },
          data: {
            invoiceId: targetInvoice.id,
          },
        });

        // Update targetInvoiceId on any associated bills
        for (const item of lineItems) {
          if (item.sourceBillId) {
            await tx.projectBill.update({
              where: { id: item.sourceBillId },
              data: { targetInvoiceId: targetInvoice.id },
            });
          }
        }
      });

      // Recompute totals for both invoices
      await this.recomputeInvoiceTotal(sourceInvoice.id);
      await this.recomputeInvoiceTotal(targetInvoice.id);

      const updatedSource = await this.getProjectInvoice(projectId, sourceInvoice.id, actor);
      const updatedTarget = await this.getProjectInvoice(projectId, targetInvoice.id, actor);

      return {
        sourceInvoice: updatedSource,
        targetInvoice: updatedTarget,
        movedLineCount: lineItems.length,
      };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err) || this.isBillTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  async moveInvoicePetlLinesToNewInvoice(
    projectId: string,
    sourceInvoiceId: string,
    payload: { lineIds: string[] },
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();
    this.ensureInvoicePetlModelsAvailable();

    const lineIds = Array.isArray(payload?.lineIds) ? payload.lineIds.map(String).filter(Boolean) : [];
    if (lineIds.length === 0) {
      throw new BadRequestException("At least one PETL line id is required");
    }

    try {
      const { project, invoice } = await this.getInvoiceOrThrow(projectId, sourceInvoiceId, actor);
      this.assertInvoiceEditable(invoice);

      const pAny: any = this.prisma as any;
      const lines: any[] = await pAny.projectInvoicePetlLine.findMany({
        where: {
          id: { in: lineIds },
          invoiceId: invoice.id,
        },
      });

      if (lines.length === 0) {
        throw new BadRequestException("No matching PETL lines found on this invoice");
      }
      if (lines.length !== lineIds.length) {
        throw new BadRequestException("Some selected PETL lines were not found on this invoice");
      }

      const lockedLines = lines.filter((li) => {
        const kind = String(li.kind ?? "").trim().toUpperCase();
        const tag = String(li.billingTag ?? "").trim().toUpperCase();
        const hasParent = !!li.parentLineId;
        // Guardrail: baseline SUPPLEMENT lines (BASE, SUPPLEMENT, top-level) stay in POL living invoice.
        return kind === "BASE" && tag === "SUPPLEMENT" && !hasParent;
      });

      if (lockedLines.length > 0) {
        throw new BadRequestException(
          "One or more selected PETL lines are locked to the POL baseline (SUPPLEMENT) and cannot be moved to another invoice.",
        );
      }

      const newInvoice = await this.prisma.$transaction(async (tx) => {
        const created = await tx.projectInvoice.create({
          data: {
            companyId: project.companyId,
            projectId: project.id,
            status: ProjectInvoiceStatus.DRAFT,
            billToName: invoice.billToName ?? null,
            billToEmail: invoice.billToEmail ?? null,
            memo: invoice.memo ?? null,
            createdByUserId: actor.userId,
          },
        });

        const ids = lines.map((li) => String(li.id));
        await (tx as any).projectInvoicePetlLine.updateMany({
          where: {
            id: { in: ids },
            invoiceId: invoice.id,
          },
          data: {
            invoiceId: created.id,
          },
        });

        return created;
      });

      await this.recomputeInvoiceTotal(invoice.id);
      await this.recomputeInvoiceTotal(newInvoice.id);

      const updatedSource = await this.getProjectInvoice(projectId, invoice.id, actor);
      const updatedNew = await this.getProjectInvoice(projectId, newInvoice.id, actor);

      return { sourceInvoice: updatedSource, newInvoice: updatedNew };
    } catch (err: any) {
      if (
        this.isBillingTableMissingError(err) ||
        this.isMissingPrismaTableError(err, "ProjectInvoicePetlLine")
      ) {
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

  /**
   * Delete a payment entirely.
   * First unapplies from all invoices, then deletes the payment record.
   */
  async deleteProjectPayment(
    projectId: string,
    paymentId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    // Only OWNER/ADMIN can delete payments
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only admins can delete payments");
    }

    try {
      const project = await this.getProjectByIdForUser(projectId, actor);

      const payment = await this.prisma.projectPayment.findFirst({
        where: {
          id: paymentId,
          projectId: project.id,
          companyId: project.companyId,
        },
      });

      if (!payment) {
        throw new NotFoundException("Payment not found for this project");
      }

      // Collect all invoices that need status recalculation
      const affectedInvoiceIds = new Set<string>();

      // If legacy invoice-linked, track that invoice
      if (payment.invoiceId) {
        affectedInvoiceIds.add(payment.invoiceId);
      }

      // Find all payment applications and track their invoices
      if (this.paymentApplicationModelsAvailable()) {
        try {
          const pAny: any = this.prisma as any;
          const apps = await pAny.projectPaymentApplication.findMany({
            where: { paymentId: payment.id },
            select: { id: true, invoiceId: true },
          });

          for (const app of apps) {
            if (app.invoiceId) affectedInvoiceIds.add(app.invoiceId);
          }

          // Delete all applications
          if (apps.length > 0) {
            await pAny.projectPaymentApplication.deleteMany({
              where: { paymentId: payment.id },
            });
          }
        } catch (err: any) {
          if (!this.isPaymentApplicationTableMissingError(err)) {
            throw err;
          }
        }
      }

      // Delete the payment
      await this.prisma.projectPayment.delete({
        where: { id: payment.id },
      });

      // Recalculate status for all affected invoices
      for (const invoiceId of affectedInvoiceIds) {
        try {
          const invoice = await this.prisma.projectInvoice.findFirst({
            where: { id: invoiceId, projectId: project.id },
          });

          if (invoice && invoice.status !== ProjectInvoiceStatus.DRAFT && invoice.status !== ProjectInvoiceStatus.VOID) {
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
        } catch {
          // Ignore errors for individual invoice updates
        }
      }

      return {
        status: "deleted",
        paymentId: payment.id,
        affectedInvoices: Array.from(affectedInvoiceIds),
      };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
        this.throwBillingTablesNotMigrated();
      }
      throw err;
    }
  }

  /**
   * Move a payment to another project and/or apply to a different invoice.
   * If targetProjectId is provided, moves the payment to that project.
   * If targetInvoiceId is provided, applies the payment to that invoice (after unapplying from current).
   */
  async moveProjectPayment(
    projectId: string,
    paymentId: string,
    dto: { targetProjectId?: string; targetInvoiceId?: string },
    actor: AuthenticatedUser,
  ) {
    this.ensureBillingModelsAvailable();

    // Only OWNER/ADMIN can move payments
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only admins can move payments");
    }

    if (!dto.targetProjectId && !dto.targetInvoiceId) {
      throw new BadRequestException("Must specify targetProjectId or targetInvoiceId");
    }

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

      // Validate target project if specified
      let targetProject = project;
      if (dto.targetProjectId && dto.targetProjectId !== project.id) {
        targetProject = await this.getProjectByIdForUser(dto.targetProjectId, actor);
        if (targetProject.companyId !== project.companyId) {
          throw new BadRequestException("Cannot move payment to a project in a different company");
        }
      }

      // Validate target invoice if specified
      let targetInvoice: any = null;
      if (dto.targetInvoiceId) {
        targetInvoice = await this.prisma.projectInvoice.findFirst({
          where: {
            id: dto.targetInvoiceId,
            projectId: targetProject.id,
            companyId: targetProject.companyId,
          },
        });

        if (!targetInvoice) {
          throw new NotFoundException("Target invoice not found");
        }

        if (targetInvoice.status === ProjectInvoiceStatus.DRAFT) {
          throw new BadRequestException("Cannot apply payment to a draft invoice");
        }

        if (targetInvoice.status === ProjectInvoiceStatus.VOID) {
          throw new BadRequestException("Cannot apply payment to a void invoice");
        }
      }

      // Collect affected invoices for status recalculation
      const affectedInvoiceIds = new Set<string>();

      // Unapply from current invoice (legacy mode)
      if (payment.invoiceId) {
        affectedInvoiceIds.add(payment.invoiceId);
      }

      // Unapply from all current applications
      if (this.paymentApplicationModelsAvailable()) {
        try {
          const pAny: any = this.prisma as any;
          const apps = await pAny.projectPaymentApplication.findMany({
            where: { paymentId: payment.id },
            select: { id: true, invoiceId: true },
          });

          for (const app of apps) {
            if (app.invoiceId) affectedInvoiceIds.add(app.invoiceId);
          }

          // Delete all applications
          if (apps.length > 0) {
            await pAny.projectPaymentApplication.deleteMany({
              where: { paymentId: payment.id },
            });
          }
        } catch (err: any) {
          if (!this.isPaymentApplicationTableMissingError(err)) {
            throw err;
          }
        }
      }

      // Update the payment record
      const updateData: any = {
        invoiceId: null, // Clear legacy invoice link
      };

      if (dto.targetProjectId && dto.targetProjectId !== project.id) {
        updateData.projectId = targetProject.id;
      }

      await this.prisma.projectPayment.update({
        where: { id: payment.id },
        data: updateData,
      });

      // If target invoice specified, apply to it
      if (targetInvoice && this.paymentApplicationModelsAvailable()) {
        try {
          const pAny: any = this.prisma as any;
          await pAny.projectPaymentApplication.create({
            data: {
              companyId: targetProject.companyId,
              projectId: targetProject.id,
              paymentId: payment.id,
              invoiceId: targetInvoice.id,
              amount: payment.amount,
              appliedAt: new Date(),
              createdByUserId: actor.userId,
            },
          });
          affectedInvoiceIds.add(targetInvoice.id);
        } catch (err: any) {
          if (!this.isPaymentApplicationTableMissingError(err)) {
            throw err;
          }
        }
      }

      // Recalculate status for all affected invoices
      for (const invoiceId of affectedInvoiceIds) {
        try {
          const invoice = await this.prisma.projectInvoice.findFirst({
            where: { id: invoiceId },
          });

          if (invoice && invoice.status !== ProjectInvoiceStatus.DRAFT && invoice.status !== ProjectInvoiceStatus.VOID) {
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
        } catch {
          // Ignore errors for individual invoice updates
        }
      }

      return {
        status: "moved",
        paymentId: payment.id,
        newProjectId: targetProject.id,
        newInvoiceId: targetInvoice?.id ?? null,
        affectedInvoices: Array.from(affectedInvoiceIds),
      };
    } catch (err: any) {
      if (this.isBillingTableMissingError(err)) {
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
