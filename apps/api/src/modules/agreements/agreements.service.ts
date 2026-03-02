import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AgreementStatus, AgreementAuditAction, Prisma } from "@prisma/client";
import {
  CreateAgreementTemplateDto,
  UpdateAgreementTemplateDto,
  CreateAgreementDto,
  UpdateAgreementDto,
  SignAgreementDto,
  VoidAgreementDto,
} from "./dto/agreements.dto";
import { randomBytes } from "crypto";

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Templates
  // =========================================================================

  /** List templates visible to a company (system-level + company-owned). */
  async listTemplates(companyId: string) {
    return this.prisma.agreementTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: null }, { companyId }],
      },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      select: {
        id: true,
        companyId: true,
        code: true,
        title: true,
        description: true,
        jurisdiction: true,
        category: true,
        isActive: true,
        currentVersion: true,
        variables: true,
        createdAt: true,
      },
    });
  }

  /** Get a single template with full HTML content. */
  async getTemplate(companyId: string, templateId: string) {
    const template = await this.prisma.agreementTemplate.findFirst({
      where: {
        id: templateId,
        isActive: true,
        OR: [{ companyId: null }, { companyId }],
      },
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  /** Create a company-owned template. */
  async createTemplate(companyId: string, userId: string, dto: CreateAgreementTemplateDto) {
    const existing = await this.prisma.agreementTemplate.findFirst({
      where: { companyId, code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Template with code "${dto.code}" already exists`);
    }

    return this.prisma.agreementTemplate.create({
      data: {
        companyId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        jurisdiction: dto.jurisdiction,
        category: dto.category ?? "OTHER",
        htmlContent: dto.htmlContent,
        variables: dto.variables as any,
        createdByUserId: userId,
      },
    });
  }

  /** Update a company-owned template (auto-snapshots before content changes). */
  async updateTemplate(companyId: string, templateId: string, dto: UpdateAgreementTemplateDto) {
    const template = await this.prisma.agreementTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException("Template not found or not owned by your company");

    // Auto-snapshot current state before content changes
    const contentChanged = dto.htmlContent || dto.variables !== undefined;
    if (contentChanged) {
      await this.prisma.agreementTemplateVersion.create({
        data: {
          templateId,
          versionNo: template.currentVersion,
          htmlContent: template.htmlContent,
          variables: template.variables ?? Prisma.JsonNull,
          overlayFields: (template as any).overlayFields ?? Prisma.JsonNull,
          changeNote: `Auto-snapshot before update (v${template.currentVersion})`,
        },
      });
    }

    return this.prisma.agreementTemplate.update({
      where: { id: templateId },
      data: {
        title: dto.title ?? template.title,
        description: dto.description ?? template.description,
        jurisdiction: dto.jurisdiction ?? template.jurisdiction,
        category: dto.category ?? template.category,
        htmlContent: dto.htmlContent ?? template.htmlContent,
        variables: dto.variables !== undefined ? (dto.variables as any) : template.variables,
        isActive: dto.isActive ?? template.isActive,
        currentVersion: contentChanged ? template.currentVersion + 1 : template.currentVersion,
        sourceType: dto.sourceType ?? (template as any).sourceType,
        originalFileUrl: dto.originalFileUrl ?? (template as any).originalFileUrl,
        overlayFields: dto.overlayFields !== undefined ? (dto.overlayFields as any) : (template as any).overlayFields,
        pageImageUrls: dto.pageImageUrls !== undefined ? (dto.pageImageUrls as any) : (template as any).pageImageUrls,
      },
    });
  }

  /** List version history for a template. */
  async listTemplateVersions(companyId: string, templateId: string) {
    // Verify access
    const template = await this.prisma.agreementTemplate.findFirst({
      where: { id: templateId, isActive: true, OR: [{ companyId: null }, { companyId }] },
    });
    if (!template) throw new NotFoundException("Template not found");

    return this.prisma.agreementTemplateVersion.findMany({
      where: { templateId },
      orderBy: { versionNo: "desc" },
      select: {
        id: true,
        versionNo: true,
        changeNote: true,
        createdAt: true,
        changedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  /** Get a specific version of a template (full content). */
  async getTemplateVersion(companyId: string, templateId: string, versionNo: number) {
    const template = await this.prisma.agreementTemplate.findFirst({
      where: { id: templateId, isActive: true, OR: [{ companyId: null }, { companyId }] },
    });
    if (!template) throw new NotFoundException("Template not found");

    const version = await this.prisma.agreementTemplateVersion.findFirst({
      where: { templateId, versionNo },
      include: {
        changedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!version) throw new NotFoundException(`Version ${versionNo} not found`);
    return version;
  }

  // =========================================================================
  // Agreements
  // =========================================================================

  /** Generate next agreement number for a company (AGR-YYYY-NNNN). */
  private async generateAgreementNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `AGR-${year}-`;

    const lastAgreement = await this.prisma.agreement.findFirst({
      where: { companyId, agreementNumber: { startsWith: prefix } },
      orderBy: { agreementNumber: "desc" },
      select: { agreementNumber: true },
    });

    let nextNum = 1;
    if (lastAgreement) {
      const lastNum = parseInt(lastAgreement.agreementNumber.replace(prefix, ""), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  }

  /** Render template HTML by replacing {{VARIABLE}} placeholders. */
  private renderTemplate(htmlContent: string, variables: Record<string, string>): string {
    let rendered = htmlContent;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      rendered = rendered.replace(regex, value || "");
    }
    // Remove any conditional blocks for unset variables (Mustache-style sections)
    rendered = rendered.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, "");
    return rendered;
  }

  /** List agreements for a company with optional filters. */
  async listAgreements(
    companyId: string,
    filters?: {
      status?: AgreementStatus;
      projectId?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const where: any = { companyId };
    if (filters?.status) where.status = filters.status;
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { agreementNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;

    const [items, total] = await Promise.all([
      this.prisma.agreement.findMany({
        where,
        include: {
          template: { select: { id: true, code: true, title: true, category: true } },
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          signatories: {
            select: { id: true, role: true, name: true, signedAt: true },
            orderBy: { sortOrder: "asc" },
          },
          _count: { select: { signatories: true, auditLog: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agreement.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Get a single agreement with full detail. */
  async getAgreement(companyId: string, agreementId: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, companyId },
      include: {
        template: { select: { id: true, code: true, title: true, category: true, variables: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        signatories: { orderBy: { sortOrder: "asc" } },
        auditLog: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!agreement) throw new NotFoundException("Agreement not found");
    return agreement;
  }

  /** Create a new agreement, optionally from a template. */
  async createAgreement(companyId: string, userId: string, dto: CreateAgreementDto) {
    const agreementNumber = await this.generateAgreementNumber(companyId);

    let htmlContent: string | null = null;
    if (dto.templateId) {
      const template = await this.getTemplate(companyId, dto.templateId);
      htmlContent = dto.variables
        ? this.renderTemplate(template.htmlContent, dto.variables)
        : template.htmlContent;
    }

    return this.prisma.$transaction(async (tx) => {
      const agreement = await tx.agreement.create({
        data: {
          companyId,
          templateId: dto.templateId,
          projectId: dto.projectId,
          title: dto.title,
          agreementNumber,
          htmlContent,
          variables: dto.variables as any,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          createdByUserId: userId,
        },
      });

      // Create signatories if provided
      if (dto.signatories?.length) {
        await tx.agreementSignatory.createMany({
          data: dto.signatories.map((s, i) => ({
            agreementId: agreement.id,
            role: s.role,
            name: s.name,
            email: s.email,
            phone: s.phone,
            sortOrder: s.sortOrder ?? i,
            signatureToken: randomBytes(32).toString("hex"),
          })),
        });
      }

      // Audit log
      await tx.agreementAuditLog.create({
        data: {
          agreementId: agreement.id,
          action: AgreementAuditAction.CREATED,
          actorUserId: userId,
          metadata: { templateId: dto.templateId, signatoryCount: dto.signatories?.length ?? 0 },
        },
      });

      return this.getAgreementTx(tx, companyId, agreement.id);
    });
  }

  /** Update a draft agreement. */
  async updateAgreement(companyId: string, userId: string, agreementId: string, dto: UpdateAgreementDto) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, companyId },
    });
    if (!agreement) throw new NotFoundException("Agreement not found");
    if (agreement.status !== AgreementStatus.DRAFT) {
      throw new BadRequestException("Only draft agreements can be edited");
    }

    let htmlContent = dto.htmlContent ?? agreement.htmlContent;
    // If variables changed and we have a template, re-render
    if (dto.variables && agreement.templateId) {
      const template = await this.prisma.agreementTemplate.findUnique({
        where: { id: agreement.templateId },
      });
      if (template) {
        htmlContent = this.renderTemplate(template.htmlContent, dto.variables);
      }
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        title: dto.title ?? agreement.title,
        variables: dto.variables !== undefined ? (dto.variables as any) : agreement.variables,
        htmlContent,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : agreement.dueDate,
        projectId: dto.projectId !== undefined ? dto.projectId : agreement.projectId,
      },
    });

    await this.prisma.agreementAuditLog.create({
      data: {
        agreementId,
        action: dto.variables ? AgreementAuditAction.VARIABLES_FILLED : AgreementAuditAction.UPDATED,
        actorUserId: userId,
      },
    });

    return this.getAgreement(companyId, agreementId);
  }

  /** Transition to PENDING_SIGNATURES. */
  async sendForSignatures(companyId: string, userId: string, agreementId: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, companyId },
      include: { signatories: true },
    });
    if (!agreement) throw new NotFoundException("Agreement not found");
    if (agreement.status !== AgreementStatus.DRAFT) {
      throw new BadRequestException("Only draft agreements can be sent for signatures");
    }
    if (!agreement.signatories.length) {
      throw new BadRequestException("At least one signatory is required before sending");
    }

    await this.prisma.agreement.update({
      where: { id: agreementId },
      data: { status: AgreementStatus.PENDING_SIGNATURES, sentAt: new Date() },
    });

    await this.prisma.agreementAuditLog.create({
      data: {
        agreementId,
        action: AgreementAuditAction.SENT_FOR_SIGNATURES,
        actorUserId: userId,
        metadata: { signatoryCount: agreement.signatories.length },
      },
    });

    return this.getAgreement(companyId, agreementId);
  }

  /** Record a signature on an agreement. */
  async signAgreement(
    companyId: string,
    userId: string | null,
    agreementId: string,
    dto: SignAgreementDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, companyId },
      include: { signatories: true },
    });
    if (!agreement) throw new NotFoundException("Agreement not found");
    if (
      agreement.status !== AgreementStatus.PENDING_SIGNATURES &&
      agreement.status !== AgreementStatus.PARTIALLY_SIGNED
    ) {
      throw new BadRequestException("Agreement is not awaiting signatures");
    }

    const signatory = agreement.signatories.find((s) => s.id === dto.signatoryId);
    if (!signatory) throw new NotFoundException("Signatory not found on this agreement");
    if (signatory.signedAt) throw new BadRequestException("This signatory has already signed");

    await this.prisma.agreementSignatory.update({
      where: { id: dto.signatoryId },
      data: {
        signedAt: new Date(),
        signatureData: dto.signatureData,
        signatureMethod: dto.signatureMethod,
        ipAddress,
        userAgent,
      },
    });

    // Check if all signatories have now signed
    const unsignedCount = agreement.signatories.filter(
      (s) => s.id !== dto.signatoryId && !s.signedAt,
    ).length;

    const newStatus =
      unsignedCount === 0
        ? AgreementStatus.FULLY_EXECUTED
        : AgreementStatus.PARTIALLY_SIGNED;

    await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: newStatus,
        fullyExecutedAt: newStatus === AgreementStatus.FULLY_EXECUTED ? new Date() : undefined,
      },
    });

    await this.prisma.agreementAuditLog.create({
      data: {
        agreementId,
        action: AgreementAuditAction.SIGNED,
        actorUserId: userId,
        actorName: signatory.name,
        metadata: {
          signatoryId: dto.signatoryId,
          role: signatory.role,
          method: dto.signatureMethod,
        },
        ipAddress,
      },
    });

    return this.getAgreement(companyId, agreementId);
  }

  /** Void an agreement. */
  async voidAgreement(companyId: string, userId: string, agreementId: string, dto: VoidAgreementDto) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, companyId },
    });
    if (!agreement) throw new NotFoundException("Agreement not found");
    if (agreement.status === AgreementStatus.VOIDED) {
      throw new BadRequestException("Agreement is already voided");
    }

    await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: AgreementStatus.VOIDED,
        voidedAt: new Date(),
        voidReason: dto.reason,
      },
    });

    await this.prisma.agreementAuditLog.create({
      data: {
        agreementId,
        action: AgreementAuditAction.VOIDED,
        actorUserId: userId,
        metadata: { reason: dto.reason },
      },
    });

    return this.getAgreement(companyId, agreementId);
  }

  /** Get agreement stats for a company. */
  async getStats(companyId: string) {
    const [draft, pending, partial, executed, voided, total] = await Promise.all([
      this.prisma.agreement.count({ where: { companyId, status: AgreementStatus.DRAFT } }),
      this.prisma.agreement.count({ where: { companyId, status: AgreementStatus.PENDING_SIGNATURES } }),
      this.prisma.agreement.count({ where: { companyId, status: AgreementStatus.PARTIALLY_SIGNED } }),
      this.prisma.agreement.count({ where: { companyId, status: AgreementStatus.FULLY_EXECUTED } }),
      this.prisma.agreement.count({ where: { companyId, status: AgreementStatus.VOIDED } }),
      this.prisma.agreement.count({ where: { companyId } }),
    ]);
    return { draft, pending, partial, executed, voided, total };
  }

  // =========================================================================
  // Internal helpers (transaction-safe getAgreement)
  // =========================================================================

  private async getAgreementTx(tx: any, companyId: string, agreementId: string) {
    return tx.agreement.findFirst({
      where: { id: agreementId, companyId },
      include: {
        template: { select: { id: true, code: true, title: true, category: true, variables: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        signatories: { orderBy: { sortOrder: "asc" } },
        auditLog: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
  }
}
