import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DrawingsBomService } from "./drawings-bom.service";
import { BomCabinetMatcherService } from "./bom-cabinet-matcher.service";

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/drawings-bom")
export class DrawingsBomController {
  constructor(
    private readonly service: DrawingsBomService,
    private readonly cabinetMatcher: BomCabinetMatcherService,
  ) {}

  // ── Upload a PDF drawing set ─────────────────────────────────────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Post("upload")
  async upload(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;

    const parts = (req as any).parts?.();
    if (!parts) {
      throw new BadRequestException("Multipart support is not configured");
    }

    let filePart: {
      filename: string;
      mimetype: string;
      toBuffer: () => Promise<Buffer>;
    } | undefined;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        filePart = part;
        break;
      }
    }

    if (!filePart) {
      throw new BadRequestException(
        'No file uploaded. Send a multipart form with field "file".',
      );
    }

    if (filePart.mimetype !== "application/pdf") {
      throw new BadRequestException(
        `Expected a PDF file, got: ${filePart.mimetype}`,
      );
    }

    const buffer = await filePart.toBuffer();

    // 100 MB limit for drawing sets
    if (buffer.length > 100 * 1024 * 1024) {
      throw new BadRequestException("File too large. Maximum size is 100 MB.");
    }

    return this.service.createUpload(projectId, user.companyId, user, {
      fileName: filePart.filename,
      buffer,
    });
  }

  // ── List uploads for a project ───────────────────────────────────────

  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.listUploads(projectId, user.companyId);
  }

  // ── Get upload details + BOM lines ───────────────────────────────────

  @Get(":uploadId")
  async getUpload(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
    @Query("source") source?: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.getUpload(uploadId, user.companyId, source);
  }

  // ── Re-run cost book matching (e.g. after cost book update) ──────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":uploadId/rematch")
  async rematch(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    // Verify access
    await this.service.getUpload(uploadId, user.companyId);
    await this.service.matchBomToCostBook(uploadId);
    return { ok: true };
  }

  // ── Update a single BOM line (manual match / qty override) ───────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(":uploadId/bom-lines/:bomLineId")
  async updateBomLine(
    @Req() req: FastifyRequest,
    @Param("bomLineId") bomLineId: string,
    @Body()
    body: {
      matchedCostBookItemId?: string | null;
      unitPrice?: number | null;
      qty?: number | null;
      unit?: string | null;
      notes?: string | null;
    },
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.updateBomLine(bomLineId, user.companyId, body);
  }

  // ── Side-by-side AI provider comparison ───────────────────────────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":uploadId/compare")
  async compare(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    // Verify access
    await this.service.getUpload(uploadId, user.companyId);
    return this.service.compareBomExtraction(uploadId);
  }

  // ── Generate PETL from matched BOM ───────────────────────────────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":uploadId/generate-petl")
  async generatePetl(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    // Verify access
    await this.service.getUpload(uploadId, user.companyId);
    return this.service.generatePetl(uploadId, user);
  }

  // ── Enhanced cabinet matching using specHash ─────────────────────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":uploadId/match-cabinets")
  async matchCabinets(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    // Verify access
    await this.service.getUpload(uploadId, user.companyId);
    return this.cabinetMatcher.matchCabinetBomLines(uploadId);
  }
}
