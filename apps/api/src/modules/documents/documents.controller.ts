import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, RolesGuard, Roles, Role } from "../auth/auth.guards";
import { DocumentsService } from "./documents.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateDocumentTemplateDto, UpdateDocumentTemplateDto } from "./dto/document-template.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  // View templates (member+)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("templates")
  async listTemplates(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.docs.listTemplates(actor);
  }

  // View template detail (member+)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("templates/:id")
  async getTemplate(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.docs.getTemplate(actor, id);
  }

  // Create template (admin+)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("templates")
  async createTemplate(@Req() req: any, @Body() body: CreateDocumentTemplateDto) {
    const actor = req.user as AuthenticatedUser;
    return this.docs.createTemplate(actor, body);
  }

  // Update metadata and/or create new version (admin+)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch("templates/:id")
  async updateTemplate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: UpdateDocumentTemplateDto,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.docs.updateTemplate(actor, id, body);
  }

  // Convenience: set current version without editing HTML (admin+)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("templates/:id/set-current")
  async setCurrentVersion(
    @Req() req: any,
    @Param("id") id: string,
    @Body("versionId") versionId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.docs.updateTemplate(actor, id, { currentVersionId: versionId });
  }
}
