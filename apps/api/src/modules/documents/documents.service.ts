import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DocumentTemplateType } from "@prisma/client";
import { createHash } from "crypto";

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private hashHtml(html: string): string {
    return createHash("sha256").update(html || "").digest("hex");
  }

  /**
   * Get dashboard stats for the Documents landing page
   */
  async getDashboardStats(actor: AuthenticatedUser) {
    const companyId = actor.companyId;
    const isAdmin = actor.role === "OWNER" || actor.role === "ADMIN";

    // Run counts in parallel for efficiency
    const [inbox, published, templates, pnp, unpublished, systemDocs] = await Promise.all([
      // Inbox: TenantDocumentCopy with UNRELEASED status (pending review)
      this.prisma.tenantDocumentCopy.count({
        where: { companyId, status: "UNRELEASED" },
      }),

      // Published: TenantDocumentCopy with PUBLISHED status
      this.prisma.tenantDocumentCopy.count({
        where: { companyId, status: "PUBLISHED" },
      }),

      // Templates: DocumentTemplate count for this company
      this.prisma.documentTemplate.count({
        where: { companyId, active: true },
      }),

      // P&P: Published documents (could filter by category if needed)
      // For now, just count published tenant copies as P&P
      this.prisma.tenantDocumentCopy.count({
        where: { companyId, status: "PUBLISHED" },
      }),

      // Unpublished eDocs (admin only): StagedDocument with ACTIVE status
      isAdmin
        ? this.prisma.stagedDocument.count({
            where: { companyId, status: "ACTIVE" },
          }).catch(() => 0) // Table might not exist
        : Promise.resolve(0),

      // System Documents (admin only): Total active SystemDocuments
      isAdmin
        ? this.prisma.systemDocument.count({
            where: { active: true },
          }).catch(() => 0) // Table might not exist
        : Promise.resolve(0),
    ]);

    // Safety sections - hardcoded for now (could query from a safety_sections table later)
    const safety = 6;

    return {
      inbox,
      published,
      templates,
      pnp,
      safety,
      // Admin-only stats
      unpublished: isAdmin ? unpublished : undefined,
      systemDocs: isAdmin ? systemDocs : undefined,
    };
  }

  async listTemplates(actor: AuthenticatedUser) {
    return this.prisma.documentTemplate.findMany({
      where: { companyId: actor.companyId },
      orderBy: [{ active: "desc" }, { type: "asc" }, { label: "asc" }],
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            label: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getTemplate(actor: AuthenticatedUser, templateId: string) {
    const tpl = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, companyId: actor.companyId },
      include: {
        currentVersion: true,
        versions: {
          orderBy: { versionNo: "desc" },
        },
      },
    });

    if (!tpl) throw new Error("Template not found");

    return tpl;
  }

  async createTemplate(
    actor: AuthenticatedUser,
    input: {
      type?: DocumentTemplateType;
      code: string;
      label: string;
      description?: string;
      templateHtml?: string;
      versionLabel?: string;
      versionNotes?: string;
    },
  ) {
    const code = (input.code || "").trim().toUpperCase();
    const label = (input.label || "").trim();
    if (!code) throw new Error("Template code is required");
    if (!label) throw new Error("Template label is required");

    const html = String(input.templateHtml ?? "");

    const created = await this.prisma.$transaction(async (tx) => {
      const tpl = await tx.documentTemplate.create({
        data: {
          companyId: actor.companyId,
          type: input.type ?? DocumentTemplateType.GENERIC,
          code,
          label,
          description: input.description?.trim() || null,
          active: true,
        },
      });

      const v1 = await tx.documentTemplateVersion.create({
        data: {
          templateId: tpl.id,
          versionNo: 1,
          label: input.versionLabel?.trim() || null,
          notes: input.versionNotes?.trim() || null,
          html,
          contentHash: this.hashHtml(html),
          createdByUserId: actor.userId,
        },
      });

      const updated = await tx.documentTemplate.update({
        where: { id: tpl.id },
        data: { currentVersionId: v1.id },
        include: {
          currentVersion: true,
        },
      });

      return updated;
    });

    return created;
  }

  async updateTemplate(
    actor: AuthenticatedUser,
    templateId: string,
    input: {
      type?: DocumentTemplateType;
      label?: string;
      description?: string;
      active?: boolean;
      templateHtml?: string;
      versionLabel?: string;
      versionNotes?: string;
      currentVersionId?: string;
    },
  ) {
    // Ensure template belongs to company
    const existing = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, companyId: actor.companyId },
      select: { id: true },
    });

    if (!existing) throw new Error("Template not found");

    const hasNewHtml = typeof input.templateHtml === "string";

    return this.prisma.$transaction(async (tx) => {
      // Update metadata first
      await tx.documentTemplate.update({
        where: { id: templateId },
        data: {
          type: input.type,
          label: input.label?.trim(),
          description: input.description === undefined ? undefined : input.description?.trim() || null,
          active: input.active,
        },
      });

      if (input.currentVersionId) {
        const version = await tx.documentTemplateVersion.findFirst({
          where: { id: input.currentVersionId, templateId },
          select: { id: true },
        });
        if (!version) {
          throw new Error("Selected version not found for this template");
        }
        await tx.documentTemplate.update({
          where: { id: templateId },
          data: { currentVersionId: version.id },
        });
      }

      if (hasNewHtml) {
        const html = String(input.templateHtml ?? "");

        const agg = await tx.documentTemplateVersion.aggregate({
          where: { templateId },
          _max: { versionNo: true },
        });
        const nextVersionNo = (agg._max.versionNo ?? 0) + 1;

        const next = await tx.documentTemplateVersion.create({
          data: {
            templateId,
            versionNo: nextVersionNo,
            label: input.versionLabel?.trim() || null,
            notes: input.versionNotes?.trim() || null,
            html,
            contentHash: this.hashHtml(html),
            createdByUserId: actor.userId,
          },
        });

        await tx.documentTemplate.update({
          where: { id: templateId },
          data: { currentVersionId: next.id },
        });
      }

      return tx.documentTemplate.findFirst({
        where: { id: templateId, companyId: actor.companyId },
        include: {
          currentVersion: true,
          versions: { orderBy: { versionNo: "desc" } },
        },
      });
    });
  }
}
