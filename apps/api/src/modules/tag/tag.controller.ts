import { Body, Controller, Get, Post, Delete, Param, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles } from "../auth/auth.guards";
import { GlobalRole } from "@prisma/client";
import { TagService } from "./tag.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("tags")
export class TagController {
  constructor(private readonly tags: TagService) {}

  // List tags for a given entity type (e.g. project) within the caller's company
  @UseGuards(JwtAuthGuard)
  @Get()
  async listForType(@Req() req: any, @Query("entityType") entityType: string) {
    const user = req.user as AuthenticatedUser;
    return this.tags.listTagsForCompanyAndType(user.companyId, entityType || "project");
  }

  // Create / update a tag (SUPER_ADMIN / developer only for now)
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post()
  async upsertTag(@Req() req: any, @Body() body: { id?: string; code: string; label: string; color?: string | null; sortOrder?: number; active?: boolean }) {
    const user = req.user as AuthenticatedUser;
    return this.tags.createOrUpdateTag(user.companyId, {
      ...body,
      createdByUserId: user.userId,
    });
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
  async setProjectTags(@Req() req: any, @Param("projectId") projectId: string, @Body("tagIds") tagIds: string[]) {
    const user = req.user as AuthenticatedUser;
    // Later we can restrict this to OWNER / ADMIN via company membership roles
    return this.tags.setTagsForEntity(user.companyId, "project", projectId, tagIds || [], user.userId);
  }
}
