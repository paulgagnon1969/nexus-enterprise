import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Query
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateProjectDto, AddProjectMemberDto, ImportXactDto, ImportXactComponentsDto, UpdateProjectDto } from "./dto/project.dto";

@Controller("projects")
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query("status") status?: string,
    @Query("tagIds") tagIdsRaw?: string
  ) {
    const user = req.user as AuthenticatedUser;
    const tagIds = tagIdsRaw
      ? tagIdsRaw
          .split(",")
          .map(x => x.trim())
          .filter(Boolean)
      : [];

    return this.projects.listProjectsForUser(
      user.userId,
      user.companyId,
      user.role,
      {
        status: status || undefined,
        tagIds: tagIds.length ? tagIds : undefined
      }
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  create(@Req() req: any, @Body() dto: CreateProjectDto) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createProject(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  getOne(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getProjectByIdForUser(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(":id")
  update(@Req() req: any, @Param("id") projectId: string, @Body() dto: UpdateProjectDto) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updateProject(projectId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/participants")
  getParticipants(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getParticipantsForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/members")
  addMember(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: AddProjectMemberDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.addMember(
      projectId,
      dto.userId,
      dto.role,
      user.role,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/hierarchy")
  hierarchy(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getHierarchy(
      projectId,
      user.userId,
      user.companyId,
      user.role
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(":id")
  delete(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deleteProject(projectId, user.companyId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/import-xact")
  importXact(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: ImportXactDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.importXactForProject(
      projectId,
      user.companyId,
      dto.csvPath,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/import-xact-components")
  importXactComponents(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: ImportXactComponentsDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.importXactComponentsForProject(
      projectId,
      user.companyId,
      dto.csvPath,
      user,
      dto.estimateVersionId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl")
  getPetl(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/percent")
  updateSinglePetlPercent(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body() body: { newPercent: number; acvOnly?: boolean }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applySinglePetlPercentEdit(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body.newPercent,
      body.acvOnly,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl/:sowItemId/components")
  getPetlComponents(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlComponentsForItem(
      projectId,
      user.companyId,
      user,
      sowItemId
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-groups")
  getPetlGroups(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlGroupsForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/recent-activities")
  getRecentActivities(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getRecentActivityForProject(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/estimate-summary")
  getEstimateSummary(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getEstimateSummaryForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/financial-summary")
  getFinancialSummary(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("forceRefresh") forceRefresh?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getFinancialSummaryForProject(
      projectId,
      user.companyId,
      user,
      { forceRefresh: forceRefresh === "true" },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-selection-summary")
  getPetlSelectionSummary(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("roomParticleId") roomParticleId?: string,
    @Query("categoryCode") categoryCode?: string,
    @Query("selectionCode") selectionCode?: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlSelectionSummaryForProject(
      projectId,
      user.companyId,
      user,
      {
        roomParticleId: roomParticleId || undefined,
        categoryCode: categoryCode || undefined,
        selectionCode: selectionCode || undefined
      }
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-components")
  getPetlComponentsForSelection(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("roomParticleId") roomParticleId?: string,
    @Query("categoryCode") categoryCode?: string,
    @Query("selectionCode") selectionCode?: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlComponentsForSelection(
      projectId,
      user.companyId,
      user,
      {
        roomParticleId: roomParticleId || undefined,
        categoryCode: categoryCode || undefined,
        selectionCode: selectionCode || undefined
      }
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/import-structure/room-buckets")
  getImportStructureRoomBuckets(
    @Req() req: any,
    @Param("id") projectId: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getImportRoomBucketsForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/import-structure/room-lines")
  getImportStructureRoomBucketLines(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("groupCode") groupCode?: string | null,
    @Query("groupDescription") groupDescription?: string | null,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getImportRoomBucketLinesForProject(
      projectId,
      user.companyId,
      user,
      {
        groupCode: groupCode ?? null,
        groupDescription: groupDescription ?? null,
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/import-structure/assign-buckets-to-unit")
  assignImportStructureBucketsToUnit(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      target: {
        type: "existing" | "new";
        unitId?: string;
        label?: string;
        floor?: number | null;
      };
      buckets: { groupCode: string | null; groupDescription: string | null }[];
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.assignImportRoomBucketsToUnit({
      projectId,
      companyId: user.companyId,
      actor: user,
      target: body.target,
      buckets: body.buckets,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/percentage-edits")
  applyPetlPercentageEdits(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
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
    const user = req.user as AuthenticatedUser;
    return this.projects.applyPetlPercentageEditsForProject(
      projectId,
      user.companyId,
      user,
      body
    );
  }
}
