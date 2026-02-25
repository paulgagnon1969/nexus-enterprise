import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PlanSheetsService } from "./plan-sheets.service";
import * as path from "path";
import * as fs from "fs";

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/plan-sheets")
export class PlanSheetsController {
  constructor(private readonly service: PlanSheetsService) {}

  // ── List all plan sets for a project ───────────────────────────────────

  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.listPlanSets(projectId, user.companyId);
  }

  // ── Get a single plan set with all sheets ──────────────────────────────

  @Get(":uploadId")
  async getPlanSet(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.getPlanSet(uploadId, user.companyId);
  }

  // ── Get a signed image URL for a specific sheet at a given tier ─────────

  @Get(":uploadId/sheets/:sheetId/image")
  async getSheetImage(
    @Req() req: FastifyRequest,
    @Param("sheetId") sheetId: string,
    @Query("tier") tier?: "thumb" | "standard" | "master",
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.getSheetImageUrl(
      sheetId,
      user.companyId,
      tier || "standard",
    );
  }

  // ── Trigger plan sheet image processing ────────────────────────────────

  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":uploadId/process")
  async triggerProcessing(
    @Req() req: FastifyRequest,
    @Param("uploadId") uploadId: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;
    return this.service.enqueueProcessing(
      uploadId,
      user.companyId,
      user.userId,
    );
  }
}

// Separate controller for serving local plan sheet images (dev only).
// Not auth-guarded because the signed-URL flow in the main controller
// already validates access before handing out the local URL.
@Controller("plan-sheet-images")
export class PlanSheetImagesController {
  @Get("plan-sheets/:uploadId/:tier/:file")
  async serveImage(
    @Param("uploadId") uploadId: string,
    @Param("tier") tier: string,
    @Param("file") file: string,
    @Res() reply: FastifyReply,
  ) {
    // Sanitize to prevent directory traversal
    const safeTier = tier.replace(/[^a-z]/g, "");
    const safeFile = file.replace(/[^a-zA-Z0-9._-]/g, "");
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");

    const filePath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "uploads",
      "plan-sheets",
      safeUploadId,
      safeTier,
      safeFile,
    );

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: "Image not found" });
    }

    const stream = fs.createReadStream(filePath);
    return reply
      .header("Content-Type", "image/webp")
      .header("Cache-Control", "public, max-age=86400")
      .send(stream);
  }
}
