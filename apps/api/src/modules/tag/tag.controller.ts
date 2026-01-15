import { Body, Controller, Get, Post, Delete, Param, Query, Req, UseGuards, ForbiddenException } from "@nestjs/common";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles, GlobalRole, Roles, Role } from "../auth/auth.guards";
import { TagService } from "./tag.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Controller("tags")
export class TagController {
  constructor(
    private readonly tags: TagService,
    private readonly prisma: PrismaService,
  ) {}

  // List tags for a given entity type (e.g. project, candidate) within the caller's company
  @UseGuards(JwtAuthGuard)
  @Get()
  async listForType(@Req() req: any, @Query("entityType") entityType: string) {
    const user = req.user as AuthenticatedUser;
    const type = (entityType || "project").trim() || "project";
    return this.tags.listTagsForCompanyAndType(user.companyId, type);
  }

  // Create / update a tag (SUPER_ADMIN / developer only for now)
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post()
  async upsertTag(
    @Req() req: any,
    @Body()
    body: {
      id?: string;
      code: string;
      label: string;
      color?: string | null;
      sortOrder?: number;
      active?: boolean;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.tags.createOrUpdateTag(user.companyId, {
      ...body,
      createdByUserId: user.userId,
    });
  }

  // PM+/MANAGER-only creator for project-scoped tags. This keeps the generic
  // /tags endpoint SUPER_ADMIN-only while allowing tenants to define their own
  // project tag vocabulary.
  @UseGuards(JwtAuthGuard)
  @Post("/projects/:projectId/create")
  async createProjectTag(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: { label: string; color?: string | null },
  ) {
    const user = req.user as AuthenticatedUser;

    const companyMembership = await this.prisma.companyMembership.findFirst({
      where: { userId: user.userId, companyId: user.companyId },
      select: { role: true },
    });

    const isCompanyOwnerOrAdmin =
      companyMembership?.role === Role.OWNER || companyMembership?.role === Role.ADMIN;

    let isProjectManager = false;
    if (!isCompanyOwnerOrAdmin) {
      const projectMembership = await this.prisma.projectMembership.findFirst({
        where: { userId: user.userId, projectId },
        select: { role: true },
      });
      isProjectManager = projectMembership?.role === "MANAGER";
    }

    if (!isCompanyOwnerOrAdmin && !isProjectManager) {
      throw new ForbiddenException("Only PMs/Owners/Admins can create project tags");
    }

    const rawLabel = (body.label || "").trim();
    if (!rawLabel) {
      throw new ForbiddenException("Tag label is required");
    }

    // Derive a simple code from the label, e.g. "Group: Fortified Structures" -> "group_fortified_structures"
    const baseCode = rawLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const code = baseCode || "tag";

    const tag = await this.tags.createOrUpdateTag(user.companyId, {
      code,
      label: rawLabel,
      color: body.color ?? null,
      sortOrder: 0,
      active: true,
      createdByUserId: user.userId,
    });

    return tag;
  }

  // Candidate tag creator for recruiters/HR within a company.
  @UseGuards(JwtAuthGuard)
  @Post("/candidates/create")
  async createCandidateTag(@Req() req: any, @Body() body: { label: string; color?: string | null }) {
    const user = req.user as AuthenticatedUser;

    const rawLabel = (body.label || "").trim();
    if (!rawLabel) {
      throw new ForbiddenException("Tag label is required");
    }

    const isOwnerOrAdmin = user.role === Role.OWNER || user.role === Role.ADMIN;
    const isHrOrHiring = user.profileCode === "HR" || user.profileCode === "HIRING_MANAGER";
    const isSuperAdmin = user.globalRole === GlobalRole.SUPER_ADMIN;

    if (!isOwnerOrAdmin && !isHrOrHiring && !isSuperAdmin) {
      throw new ForbiddenException("Only HR/Owners/Admins can create candidate tags");
    }

    const baseCode = rawLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const code = baseCode || "candidate_tag";

    const tag = await this.tags.createOrUpdateTag(user.companyId, {
      code,
      label: rawLabel,
      color: body.color ?? null,
      sortOrder: 0,
      active: true,
      createdByUserId: user.userId,
    });

    return tag;
  }

  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Delete(":id")
  async deleteTag(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.tags.softDeleteTag(user.companyId, id);
  }

  // Project tag assignments
  @UseGuards(JwtAuthGuard)
  @Get("/projects/:projectId")
  async listProjectTags(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.tags.listTagsForEntity(user.companyId, "project", projectId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("/projects/:projectId")
  async setProjectTags(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body("tagIds") tagIds: string[],
  ) {
    const user = req.user as AuthenticatedUser;

    // Allow only company OWNER/ADMIN or project-level MANAGER to edit tags.
    const companyMembership = await this.prisma.companyMembership.findFirst({
      where: { userId: user.userId, companyId: user.companyId },
      select: { role: true },
    });

    const isCompanyOwnerOrAdmin =
      companyMembership?.role === Role.OWNER || companyMembership?.role === Role.ADMIN;

    let isProjectManager = false;
    if (!isCompanyOwnerOrAdmin) {
      const projectMembership = await this.prisma.projectMembership.findFirst({
        where: {
          userId: user.userId,
          projectId,
        },
        select: { role: true },
      });
      isProjectManager = projectMembership?.role === "MANAGER";
    }

    if (!isCompanyOwnerOrAdmin && !isProjectManager) {
      throw new ForbiddenException("Only PMs/Owners/Admins can change project tags");
    }

    return this.tags.setTagsForEntity(user.companyId, "project", projectId, tagIds || [], user.userId);
  }

  // Candidate tag assignments
  @UseGuards(JwtAuthGuard)
  @Get("/candidates/:sessionId")
  async listCandidateTags(@Req() req: any, @Param("sessionId") sessionId: string) {
    const user = req.user as AuthenticatedUser;

    // Resolve session to ensure it exists and determine owning company.
    const session = await this.prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: { companyId: true },
    });

    if (!session) {
      throw new ForbiddenException("Candidate session not found");
    }

    const sameCompany = session.companyId === user.companyId;
    const isSuperAdmin = user.globalRole === GlobalRole.SUPER_ADMIN;

    if (!sameCompany && !isSuperAdmin) {
      throw new ForbiddenException("Not allowed to view tags for this candidate");
    }

    return this.tags.listTagsForEntity(session.companyId, "candidate", sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("/candidates/:sessionId")
  async setCandidateTags(
    @Req() req: any,
    @Param("sessionId") sessionId: string,
    @Body("tagIds") tagIds: string[],
  ) {
    const user = req.user as AuthenticatedUser;

    const session = await this.prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: { companyId: true },
    });

    if (!session) {
      throw new ForbiddenException("Candidate session not found");
    }

    const sameCompany = session.companyId === user.companyId;
    const isSuperAdmin = user.globalRole === GlobalRole.SUPER_ADMIN;

    const isOwnerOrAdmin = user.role === Role.OWNER || user.role === Role.ADMIN;
    const isHrOrHiring = user.profileCode === "HR" || user.profileCode === "HIRING_MANAGER";

    if (!sameCompany && !isSuperAdmin) {
      throw new ForbiddenException("Not allowed to edit tags for this candidate");
    }

    if (!isOwnerOrAdmin && !isHrOrHiring && !isSuperAdmin) {
      throw new ForbiddenException("Only HR/Owners/Admins can edit candidate tags");
    }

    const safeTagIds = Array.isArray(tagIds)
      ? Array.from(new Set(tagIds.map(id => (typeof id === "string" ? id.trim() : "")).filter(Boolean)))
      : [];

    return this.tags.setTagsForEntity(session.companyId, "candidate", sessionId, safeTagIds, user.userId);
  }

  // Batch look-up of candidate tags for the Prospective Candidates grid.
  @UseGuards(JwtAuthGuard)
  @Post("/candidates/batch")
  async listCandidateTagsBatch(
    @Req() req: any,
    @Body() body: { sessionIds?: string[] },
  ) {
    const user = req.user as AuthenticatedUser;
    const rawIds = Array.isArray(body.sessionIds) ? body.sessionIds : [];
    const sessionIds = Array.from(
      new Set(
        rawIds
          .map(id => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean),
      ),
    );

    if (!sessionIds.length) {
      return [];
    }

    const assignments = await this.tags.listTagsForEntities("candidate", sessionIds);

    return assignments.map(a => ({
      sessionId: a.entityId,
      tag: {
        id: a.tag.id,
        code: a.tag.code,
        label: a.tag.label,
        color: a.tag.color ?? null,
      },
    }));
  }
}
