import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  ProjectCollaborationService,
  CreateCollaborationDto,
  UpdateCollaborationDto,
} from "./project-collaboration.service";

/**
 * Contractor-side endpoints for managing collaborations on projects they own.
 * Mounted under /projects/:projectId/collaborations
 */
@Controller("projects/:projectId/collaborations")
@UseGuards(JwtAuthGuard)
export class ProjectCollaborationController {
  constructor(private readonly collabService: ProjectCollaborationService) {}

  /**
   * POST /projects/:projectId/collaborations
   * Invite a company to collaborate on this project.
   */
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  create(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateCollaborationDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.create(projectId, user.companyId, user.userId, dto);
  }

  /**
   * GET /projects/:projectId/collaborations
   * List all collaborating orgs on this project.
   */
  @Get()
  list(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.listForProject(projectId, user.companyId);
  }

  /**
   * PATCH /projects/:projectId/collaborations/:collabId
   * Update a collaboration's role, visibility, or notes.
   */
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(":collabId")
  update(
    @Req() req: any,
    @Param("collabId") collabId: string,
    @Body() dto: UpdateCollaborationDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.update(collabId, user.companyId, dto);
  }

  /**
   * DELETE /projects/:projectId/collaborations/:collabId
   * Revoke a collaboration (soft-delete).
   */
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(":collabId")
  revoke(@Req() req: any, @Param("collabId") collabId: string) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.revoke(collabId, user.companyId);
  }
}

/**
 * Collaborating-org-side endpoints for accepting/declining invites
 * and viewing cross-tenant projects.
 * Mounted under /collaborations
 */
@Controller("collaborations")
@UseGuards(JwtAuthGuard)
export class CollaborationPortalController {
  constructor(private readonly collabService: ProjectCollaborationService) {}

  /**
   * GET /collaborations/pending
   * List pending collaboration invites for the caller's company.
   */
  @Get("pending")
  listPending(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.listPendingForCompany(user.companyId);
  }

  /**
   * GET /collaborations/projects
   * List all cross-tenant projects the caller can access via collaborations.
   */
  @Get("projects")
  listProjects(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.listCrossTenantProjectsForUser(user.userId);
  }

  /**
   * POST /collaborations/:id/accept
   * Accept a collaboration invite.
   */
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/accept")
  accept(@Req() req: any, @Param("id") collaborationId: string) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.accept(collaborationId, user.companyId);
  }

  /**
   * POST /collaborations/:id/decline
   * Decline a collaboration invite.
   */
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/decline")
  decline(@Req() req: any, @Param("id") collaborationId: string) {
    const user = req.user as AuthenticatedUser;
    return this.collabService.decline(collaborationId, user.companyId);
  }
}
