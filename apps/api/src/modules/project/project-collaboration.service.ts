import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EmailService } from "../../common/email.service";
import {
  CollaborationRole,
  ProjectVisibilityLevel,
} from "@prisma/client";

export interface CreateCollaborationDto {
  companyId: string;
  role: CollaborationRole;
  visibility?: ProjectVisibilityLevel;
  notes?: string;
}

export interface UpdateCollaborationDto {
  role?: CollaborationRole;
  visibility?: ProjectVisibilityLevel;
  notes?: string;
}

@Injectable()
export class ProjectCollaborationService {
  private readonly logger = new Logger(ProjectCollaborationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Create a collaboration link between a project and an external company.
   * The caller must be from the project-owning company.
   */
  async create(
    projectId: string,
    ownerCompanyId: string,
    invitedByUserId: string,
    dto: CreateCollaborationDto,
  ) {
    // Validate project belongs to caller's company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: ownerCompanyId },
      select: {
        id: true, name: true, companyId: true,
        addressLine1: true, city: true, state: true,
        company: { select: { name: true } },
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found or you do not own this project");
    }

    // Cannot collaborate with yourself
    if (dto.companyId === ownerCompanyId) {
      throw new BadRequestException("Cannot add your own company as a collaborator");
    }

    // Validate the collaborating company exists
    const collaboratingCompany = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!collaboratingCompany || collaboratingCompany.deletedAt) {
      throw new NotFoundException("Collaborating company not found");
    }

    // Check for existing collaboration
    const existing = await this.prisma.projectCollaboration.findUnique({
      where: {
        ProjectCollaboration_project_company_key: {
          projectId,
          companyId: dto.companyId,
        },
      },
    });

    if (existing) {
      if (existing.active) {
        throw new BadRequestException("This company is already collaborating on this project");
      }
      // Reactivate a previously revoked collaboration
      const reactivated = await this.prisma.projectCollaboration.update({
        where: { id: existing.id },
        data: {
          active: true,
          role: dto.role,
          visibility: dto.visibility ?? ProjectVisibilityLevel.LIMITED,
          notes: dto.notes ?? null,
          invitedByUserId,
          invitedAt: new Date(),
          acceptedAt: null,
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      this.logger.log(
        `Reactivated collaboration: project=${projectId}, company=${dto.companyId}, role=${dto.role}`,
      );
      return this.toResponse(reactivated);
    }

    const collaboration = await this.prisma.projectCollaboration.create({
      data: {
        projectId,
        companyId: dto.companyId,
        role: dto.role,
        visibility: dto.visibility ?? ProjectVisibilityLevel.LIMITED,
        invitedByUserId,
        notes: dto.notes ?? undefined,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `Created collaboration: project=${projectId}, company=${dto.companyId}, role=${dto.role}`,
    );

    // Determine if this is an existing partner (other accepted collaborations between
    // these two companies) — use a different notification tone.
    void this.determineAndNotify(project, collaboratingCompany, collaboration.role).catch(
      (err) => this.logger.warn(`Failed to send collaboration notification: ${err?.message}`),
    );

    return this.toResponse(collaboration);
  }

  /**
   * List all collaborations on a project.
   * Caller must be from the project-owning company.
   */
  async listForProject(projectId: string, ownerCompanyId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: ownerCompanyId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const collaborations = await this.prisma.projectCollaboration.findMany({
      where: { projectId, active: true },
      include: {
        company: { select: { id: true, name: true, tier: true } },
        invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { invitedAt: "desc" },
    });

    return collaborations.map((c) => ({
      id: c.id,
      company: c.company,
      role: c.role,
      visibility: c.visibility,
      invitedAt: c.invitedAt,
      acceptedAt: c.acceptedAt,
      invitedBy: {
        id: c.invitedBy.id,
        name: [c.invitedBy.firstName, c.invitedBy.lastName].filter(Boolean).join(" ") || c.invitedBy.email,
      },
      notes: c.notes,
    }));
  }

  /**
   * Update a collaboration's role, visibility, or notes.
   */
  async update(
    collaborationId: string,
    ownerCompanyId: string,
    dto: UpdateCollaborationDto,
  ) {
    const collab = await this.prisma.projectCollaboration.findUnique({
      where: { id: collaborationId },
      include: {
        project: { select: { companyId: true } },
        company: { select: { id: true, name: true } },
      },
    });

    if (!collab || collab.project.companyId !== ownerCompanyId) {
      throw new NotFoundException("Collaboration not found");
    }

    const updated = await this.prisma.projectCollaboration.update({
      where: { id: collaborationId },
      data: {
        role: dto.role,
        visibility: dto.visibility,
        notes: dto.notes,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    return this.toResponse(updated);
  }

  /**
   * Revoke (soft-delete) a collaboration.
   */
  async revoke(collaborationId: string, ownerCompanyId: string) {
    const collab = await this.prisma.projectCollaboration.findUnique({
      where: { id: collaborationId },
      include: {
        project: { select: { companyId: true } },
      },
    });

    if (!collab || collab.project.companyId !== ownerCompanyId) {
      throw new NotFoundException("Collaboration not found");
    }

    await this.prisma.projectCollaboration.update({
      where: { id: collaborationId },
      data: { active: false },
    });

    this.logger.log(`Revoked collaboration: id=${collaborationId}`);

    return { success: true, revokedId: collaborationId };
  }

  // ── Accept / Decline (called by the collaborating org) ────────────

  /**
   * Accept a collaboration invite. Caller must be an admin of the
   * collaborating company.
   */
  async accept(collaborationId: string, callerCompanyId: string) {
    const collab = await this.prisma.projectCollaboration.findUnique({
      where: { id: collaborationId },
      include: {
        project: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } },
        company: { select: { id: true, name: true } },
      },
    });

    if (!collab || collab.companyId !== callerCompanyId) {
      throw new NotFoundException("Collaboration not found");
    }

    if (!collab.active) {
      throw new BadRequestException("Collaboration has been revoked");
    }

    if (collab.acceptedAt) {
      return { success: true, alreadyAccepted: true };
    }

    await this.prisma.projectCollaboration.update({
      where: { id: collaborationId },
      data: { acceptedAt: new Date() },
    });

    this.logger.log(
      `Collaboration accepted: id=${collaborationId}, project=${collab.projectId}, company=${collab.companyId}`,
    );

    return {
      success: true,
      project: { id: collab.project.id, name: collab.project.name },
      company: collab.company,
    };
  }

  /**
   * Decline a collaboration invite. Caller must be an admin of the
   * collaborating company.
   */
  async decline(collaborationId: string, callerCompanyId: string) {
    const collab = await this.prisma.projectCollaboration.findUnique({
      where: { id: collaborationId },
    });

    if (!collab || collab.companyId !== callerCompanyId) {
      throw new NotFoundException("Collaboration not found");
    }

    await this.prisma.projectCollaboration.update({
      where: { id: collaborationId },
      data: { active: false },
    });

    this.logger.log(`Collaboration declined: id=${collaborationId}`);

    return { success: true };
  }

  // ── Cross-Tenant Access Resolution ─────────────────────────────────

  /**
   * Check whether a user can access a project via a cross-tenant
   * ProjectCollaboration. Returns the collaboration record if access is
   * granted, or null if not.
   */
  async resolveAccessForUser(
    userId: string,
    projectId: string,
  ): Promise<{
    collaborationId: string;
    companyId: string;
    companyName: string;
    role: CollaborationRole;
    visibility: ProjectVisibilityLevel;
  } | null> {
    // Find all active company memberships for this user
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, isActive: true },
      select: { companyId: true },
    });

    if (!memberships.length) return null;

    const companyIds = memberships.map((m) => m.companyId);

    // Check if any of those companies have an active, accepted collaboration
    // on this project
    const collab = await this.prisma.projectCollaboration.findFirst({
      where: {
        projectId,
        companyId: { in: companyIds },
        active: true,
        acceptedAt: { not: null },
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    if (!collab) return null;

    return {
      collaborationId: collab.id,
      companyId: collab.companyId,
      companyName: collab.company.name,
      role: collab.role,
      visibility: collab.visibility,
    };
  }

  /**
   * List all cross-tenant projects accessible to a user via
   * ProjectCollaboration. Groups by company.
   */
  async listCrossTenantProjectsForUser(userId: string) {
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, isActive: true },
      select: { companyId: true },
    });

    if (!memberships.length) return [];

    const companyIds = memberships.map((m) => m.companyId);

    const collaborations = await this.prisma.projectCollaboration.findMany({
      where: {
        companyId: { in: companyIds },
        active: true,
        acceptedAt: { not: null },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            addressLine1: true,
            city: true,
            state: true,
            updatedAt: true,
            company: { select: { id: true, name: true } },
          },
        },
        company: { select: { id: true, name: true } },
      },
      orderBy: { project: { updatedAt: "desc" } },
    });

    // Group by the user's company that has the collaboration
    const byCompany = new Map<
      string,
      {
        company: { id: string; name: string };
        projects: Array<{
          id: string;
          name: string;
          status: string;
          addressLine1: string;
          city: string;
          state: string;
          visibility: ProjectVisibilityLevel;
          role: CollaborationRole;
          ownerCompany: { id: string; name: string };
          updatedAt: Date;
        }>;
      }
    >();

    for (const c of collaborations) {
      const key = c.companyId;
      if (!byCompany.has(key)) {
        byCompany.set(key, { company: c.company, projects: [] });
      }
      byCompany.get(key)!.projects.push({
        id: c.project.id,
        name: c.project.name,
        status: c.project.status,
        addressLine1: c.project.addressLine1,
        city: c.project.city,
        state: c.project.state,
        visibility: c.visibility,
        role: c.role,
        ownerCompany: c.project.company,
        updatedAt: c.project.updatedAt,
      });
    }

    return Array.from(byCompany.values());
  }

  /**
   * List all pending collaboration invites for a company.
   */
  async listPendingForCompany(companyId: string) {
    const pending = await this.prisma.projectCollaboration.findMany({
      where: {
        companyId,
        active: true,
        acceptedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            addressLine1: true,
            city: true,
            state: true,
            company: { select: { id: true, name: true } },
          },
        },
        invitedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { invitedAt: "desc" },
    });

    return pending.map((p) => ({
      id: p.id,
      role: p.role,
      visibility: p.visibility,
      invitedAt: p.invitedAt,
      notes: p.notes,
      project: {
        id: p.project.id,
        name: p.project.name,
        address: p.project.addressLine1
          ? `${p.project.addressLine1}, ${p.project.city}, ${p.project.state}`
          : null,
      },
      ownerCompany: p.project.company,
      invitedBy: {
        name: [p.invitedBy.firstName, p.invitedBy.lastName].filter(Boolean).join(" ") || p.invitedBy.email,
      },
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Route notification based on whether this is a first-time invite or an
   * existing partner getting a new project linked.
   */
  private async determineAndNotify(
    project: { id: string; name: string; companyId: string; addressLine1: string; city: string; state: string; company: { name: string } },
    collaboratingCompany: { id: string; name: string },
    role: CollaborationRole,
  ) {
    // Check if there are other accepted collaborations between the project
    // owner and this collaborating company (on different projects)
    const existingAccepted = await this.prisma.projectCollaboration.count({
      where: {
        companyId: collaboratingCompany.id,
        active: true,
        acceptedAt: { not: null },
        project: { companyId: project.companyId },
        projectId: { not: project.id }, // Exclude the one just created
      },
    });

    if (existingAccepted > 0) {
      // Existing partner — broader "new project added" notification
      await this.notifyNewProjectLinked(
        project,
        collaboratingCompany.id,
        project.company.name,
        role,
      );
    } else {
      // First-time invite — admin-only invite notification
      await this.notifyCollaboratingOrg(project, collaboratingCompany, role);
    }
  }

  private toResponse(collab: any) {
    return {
      id: collab.id,
      projectId: collab.projectId,
      company: collab.company,
      role: collab.role,
      visibility: collab.visibility,
      invitedAt: collab.invitedAt,
      acceptedAt: collab.acceptedAt,
      active: collab.active,
      notes: collab.notes,
    };
  }

  /**
   * Send invite notification to admins/owners of the collaborating company.
   */
  private async notifyCollaboratingOrg(
    project: { id: string; name: string; addressLine1: string; city: string; state: string },
    collaboratingCompany: { id: string; name: string },
    role: CollaborationRole,
  ) {
    const members = await this.prisma.companyMembership.findMany({
      where: {
        companyId: collaboratingCompany.id,
        isActive: true,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: {
        user: { select: { email: true, firstName: true } },
      },
      take: 10,
    });

    if (!members.length) return;

    const address = project.addressLine1
      ? `${project.addressLine1}, ${project.city}, ${project.state}`
      : "";

    const webBase = process.env.WEB_BASE_URL || "https://ncc.nfsgrp.com";
    const portalUrl = `${webBase.replace(/\/$/, "")}/portal/collaborations`;

    for (const member of members) {
      try {
        await this.email.sendMail({
          to: member.user.email,
          subject: `You've been invited to collaborate on a project`,
          html: `
            <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
              <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 20px;">Project Collaboration Invite</h1>
              </div>
              <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
                <p style="margin: 0 0 16px;">Hi ${member.user.firstName || "there"},</p>
                <p style="margin: 0 0 16px;">Your organization has been invited to collaborate on:</p>
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
                  <h2 style="margin: 0 0 4px; font-size: 16px;">${project.name}</h2>
                  ${address ? `<p style="margin: 0; color: #6b7280; font-size: 13px;">${address}</p>` : ""}
                  <p style="margin: 8px 0 0; font-size: 13px; color: #374151;">Role: <strong>${role}</strong></p>
                </div>
                <p style="margin: 0 0 24px; text-align: center;">
                  <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    View & Accept Invite
                  </a>
                </p>
              </div>
            </div>
          `.trim(),
          text: `You've been invited to collaborate on ${project.name}${address ? ` (${address})` : ""}. Role: ${role}. View invite: ${portalUrl}`,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send collaboration email to ${member.user.email}: ${err?.message}`);
      }
    }
  }

  /**
   * Notify all project-viewing users of a collaborating org that a new
   * project has been added to their portfolio. Used when a collaboration
   * is created with a partner that has an existing relationship.
   */
  async notifyNewProjectLinked(
    project: { id: string; name: string; addressLine1: string; city: string; state: string },
    collaboratingCompanyId: string,
    ownerCompanyName: string,
    role: CollaborationRole,
  ) {
    // Notify all active members of the collaborating org (not just admins)
    const members = await this.prisma.companyMembership.findMany({
      where: {
        companyId: collaboratingCompanyId,
        isActive: true,
      },
      include: {
        user: { select: { email: true, firstName: true } },
      },
      take: 50, // Broader audience — cap at 50
    });

    if (!members.length) return;

    const address = project.addressLine1
      ? `${project.addressLine1}, ${project.city}, ${project.state}`
      : "";

    const webBase = process.env.WEB_BASE_URL || "https://ncc.nfsgrp.com";
    const portalUrl = `${webBase.replace(/\/$/, "")}/portal/projects`;

    for (const member of members) {
      try {
        await this.email.sendMail({
          to: member.user.email,
          subject: `New project added to your portfolio`,
          html: `
            <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
              <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 20px;">New Project Added</h1>
              </div>
              <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
                <p style="margin: 0 0 16px;">Hi ${member.user.firstName || "there"},</p>
                <p style="margin: 0 0 16px;">A new project has been added to your portfolio with <strong>${ownerCompanyName}</strong>:</p>
                <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
                  <h2 style="margin: 0 0 4px; font-size: 16px;">${project.name}</h2>
                  ${address ? `<p style="margin: 0; color: #6b7280; font-size: 13px;">${address}</p>` : ""}
                  <p style="margin: 8px 0 0; font-size: 13px; color: #374151;">Role: <strong>${role}</strong></p>
                </div>
                <p style="margin: 0 0 24px; text-align: center;">
                  <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    View Project
                  </a>
                </p>
              </div>
            </div>
          `.trim(),
          text: `A new project has been added to your portfolio with ${ownerCompanyName}: ${project.name}${address ? ` (${address})` : ""}. Role: ${role}. View: ${portalUrl}`,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to send new-project-linked email to ${member.user.email}: ${err?.message}`);
      }
    }
  }
}
