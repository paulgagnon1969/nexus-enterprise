import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, Role, Roles, RolesGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AgreementsService } from "./agreements.service";
import { TemplateImportService } from "./template-import.service";
import {
  CreateAgreementTemplateDto,
  UpdateAgreementTemplateDto,
  CreateAgreementDto,
  UpdateAgreementDto,
  SignAgreementDto,
  VoidAgreementDto,
} from "./dto/agreements.dto";
import { RequiresModule } from "../billing/module.guard";
import { AgreementStatus } from "@prisma/client";
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) throw new Error("Authentication required");
  return user;
}

// =============================================================================
// Templates Controller
// =============================================================================

@RequiresModule("AGREEMENTS")
@Controller("agreements/templates")
@UseGuards(JwtAuthGuard)
export class AgreementTemplatesController {
  constructor(
    private readonly service: AgreementsService,
    private readonly importService: TemplateImportService,
  ) {}

  /** List templates available to the current company (system + company-owned). */
  @Get()
  async listTemplates(@Req() req: FastifyRequest) {
    const user = getUser(req);
    return this.service.listTemplates(user.companyId);
  }

  /** Get a single template with full HTML content. */
  @Get(":id")
  async getTemplate(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.getTemplate(user.companyId, id);
  }

  /** Create a company-owned template (ADMIN+ only). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async createTemplate(@Req() req: FastifyRequest, @Body() dto: CreateAgreementTemplateDto) {
    const user = getUser(req);
    return this.service.createTemplate(user.companyId, user.userId, dto);
  }

  /** Update a company-owned template (ADMIN+ only). */
  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async updateTemplate(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAgreementTemplateDto,
  ) {
    const user = getUser(req);
    return this.service.updateTemplate(user.companyId, id, dto);
  }

  /** Import a document file (DOCX/PDF/HTML/image) and convert to editable HTML. */
  @Post("import")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async importDocument(@Req() req: FastifyRequest) {
    const { file } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
    });
    const buffer = await file.toBuffer();
    return this.importService.convertDocument(buffer, file.filename, file.mimetype);
  }

  /** List version history for a template. */
  @Get(":id/versions")
  async listVersions(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.listTemplateVersions(user.companyId, id);
  }

  /** Get a specific version of a template. */
  @Get(":id/versions/:versionNo")
  async getVersion(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("versionNo") versionNo: string,
  ) {
    const user = getUser(req);
    return this.service.getTemplateVersion(user.companyId, id, parseInt(versionNo, 10));
  }
}

// =============================================================================
// Agreements Controller
// =============================================================================

@RequiresModule("AGREEMENTS")
@Controller("agreements")
@UseGuards(JwtAuthGuard)
export class AgreementsController {
  constructor(private readonly service: AgreementsService) {}

  /** Get agreement stats for the current company. */
  @Get("stats")
  async getStats(@Req() req: FastifyRequest) {
    const user = getUser(req);
    return this.service.getStats(user.companyId);
  }

  /** List agreements with optional filters. */
  @Get()
  async listAgreements(
    @Req() req: FastifyRequest,
    @Query("status") status?: AgreementStatus,
    @Query("projectId") projectId?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const user = getUser(req);
    return this.service.listAgreements(user.companyId, {
      status,
      projectId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  /** Get a single agreement with full detail. */
  @Get(":id")
  async getAgreement(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.getAgreement(user.companyId, id);
  }

  /** Create a new agreement (from template or blank). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async createAgreement(@Req() req: FastifyRequest, @Body() dto: CreateAgreementDto) {
    const user = getUser(req);
    return this.service.createAgreement(user.companyId, user.userId, dto);
  }

  /** Update a draft agreement. */
  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async updateAgreement(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAgreementDto,
  ) {
    const user = getUser(req);
    return this.service.updateAgreement(user.companyId, user.userId, id, dto);
  }

  /** Send agreement for signatures. */
  @Post(":id/send")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async sendForSignatures(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.sendForSignatures(user.companyId, user.userId, id);
  }

  /** Record a signature on an agreement. */
  @Post(":id/sign")
  async signAgreement(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: SignAgreementDto,
  ) {
    const user = getUser(req);
    const ip = (req.ip as string) || undefined;
    const ua = (req.headers["user-agent"] as string) || undefined;
    return this.service.signAgreement(user.companyId, user.userId, id, dto, ip, ua);
  }

  /** Void an agreement. */
  @Post(":id/void")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async voidAgreement(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: VoidAgreementDto,
  ) {
    const user = getUser(req);
    return this.service.voidAgreement(user.companyId, user.userId, id, dto);
  }
}
