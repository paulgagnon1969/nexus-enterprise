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
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { OrgTemplateService } from "./org-template.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ProjectParticleType } from "@prisma/client";

@Controller()
export class OrgTemplateController {
  constructor(
    private readonly templates: OrgTemplateService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Template CRUD
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get("org-templates")
  listTemplates(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.templates.listTemplates(user.companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("org-templates/:id")
  getTemplate(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.templates.getTemplate(id, user.companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("org-templates")
  createTemplate(
    @Req() req: any,
    @Body() body: { name: string; description?: string; vertical?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.createTemplate(user.companyId, user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("org-templates/:id")
  updateTemplate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string; vertical?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.updateTemplate(id, user.companyId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("org-templates/:id")
  deleteTemplate(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.templates.deleteTemplate(id, user.companyId);
  }

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post("org-templates/:id/nodes")
  addNode(
    @Req() req: any,
    @Param("id") templateId: string,
    @Body()
    body: {
      name: string;
      parentNodeId?: string;
      sortOrder?: number;
      defaultPctComplete?: number;
      defaultDurationDays?: number;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.addNode(templateId, user.companyId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("org-templates/:id/nodes/:nodeId")
  updateNode(
    @Req() req: any,
    @Param("id") templateId: string,
    @Param("nodeId") nodeId: string,
    @Body()
    body: {
      name?: string;
      sortOrder?: number;
      defaultPctComplete?: number;
      defaultDurationDays?: number;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.updateNode(templateId, nodeId, user.companyId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("org-templates/:id/nodes/:nodeId")
  deleteNode(
    @Req() req: any,
    @Param("id") templateId: string,
    @Param("nodeId") nodeId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.deleteNode(templateId, nodeId, user.companyId);
  }

  // ---------------------------------------------------------------------------
  // Apply template to project
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post("projects/:id/apply-org-template")
  applyTemplate(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { orgTemplateId: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.applyTemplateToProject(
      projectId,
      user.companyId,
      body.orgTemplateId,
    );
  }

  // ---------------------------------------------------------------------------
  // Save project as template
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post("projects/:id/save-as-org-template")
  saveAsTemplate(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { name: string; description?: string; vertical?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.templates.saveProjectAsTemplate(
      projectId,
      user.companyId,
      user,
      body,
    );
  }

  // ---------------------------------------------------------------------------
  // Particle CRUD (manual org tree edits)
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post("projects/:id/particles")
  async createParticle(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { name: string; parentParticleId?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
    });
    if (!project) throw new Error("Project not found");

    // Resolve unit — use "Project Site" unit.
    let unit = await this.prisma.projectUnit.findFirst({
      where: { projectId, label: "Project Site" },
    });
    if (!unit) {
      unit = await this.prisma.projectUnit.create({
        data: {
          companyId: user.companyId,
          projectId,
          label: "Project Site",
        },
      });
    }

    return this.prisma.projectParticle.create({
      data: {
        companyId: user.companyId,
        projectId,
        unitId: unit.id,
        type: ProjectParticleType.ROOM,
        name: body.name.trim(),
        fullLabel: body.name.trim(),
        parentParticleId: body.parentParticleId?.trim() || null,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch("projects/:id/particles/:particleId")
  async updateParticle(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("particleId") particleId: string,
    @Body() body: { name?: string; percentComplete?: number },
  ) {
    const user = req.user as AuthenticatedUser;
    const particle = await this.prisma.projectParticle.findFirst({
      where: { id: particleId, projectId, companyId: user.companyId },
    });
    if (!particle) throw new Error("Particle not found");

    const data: any = {};
    if (body.name != null) {
      data.name = body.name.trim();
      data.fullLabel = body.name.trim();
    }
    if (body.percentComplete != null) {
      data.percentComplete = Math.max(0, Math.min(100, body.percentComplete));
    }

    return this.prisma.projectParticle.update({
      where: { id: particleId },
      data,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete("projects/:id/particles/:particleId")
  async deleteParticle(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("particleId") particleId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const particle = await this.prisma.projectParticle.findFirst({
      where: { id: particleId, projectId, companyId: user.companyId },
    });
    if (!particle) throw new Error("Particle not found");

    // Check for attached PETL items.
    const itemCount = await this.prisma.sowItem.count({
      where: { projectParticleId: particleId },
    });
    if (itemCount > 0) {
      throw new Error(
        `Cannot delete particle "${particle.name}" — it has ${itemCount} PETL item(s) attached`,
      );
    }

    // Check for child particles.
    const childCount = await this.prisma.projectParticle.count({
      where: { parentParticleId: particleId },
    });
    if (childCount > 0) {
      throw new Error(
        `Cannot delete particle "${particle.name}" — it has ${childCount} child particle(s)`,
      );
    }

    await this.prisma.projectParticle.delete({ where: { id: particleId } });
    return { deleted: true };
  }
}
