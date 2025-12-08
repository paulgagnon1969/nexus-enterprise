import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  Query
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { JwtAuthGuard, Roles } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateProjectDto, AddProjectMemberDto, ImportXactDto } from "./dto/project.dto";
import { Role } from "@prisma/client";

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
    @Body() body: { newPercent: number }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applySinglePetlPercentEdit(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body.newPercent
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
