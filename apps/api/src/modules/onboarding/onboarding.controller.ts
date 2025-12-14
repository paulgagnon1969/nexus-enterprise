import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { OnboardingService } from "./onboarding.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import * as path from "node:path";
import * as fs from "node:fs";

@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // --- Public endpoints (no auth) ---

  @Post("start")
  async start(@Body("companyId") companyId: string, @Body("email") email: string) {
    // In a later pass we can restrict who can call this; for now this is a simple helper to
    // create an onboarding session and return a token.
    const session = await this.onboarding.startSession(companyId, email);
    return { id: session.id, token: session.token };
  }

  @Get(":token")
  async getByToken(@Param("token") token: string) {
    const session = await this.onboarding.getSessionByToken(token);
    return {
      id: session.id,
      email: session.email,
      status: session.status,
      checklist: session.checklistJson ? JSON.parse(session.checklistJson) : {},
      createdAt: session.createdAt
    };
  }

  @Post(":token/profile")
  async upsertProfile(@Param("token") token: string, @Body() body: any) {
    const session = await this.onboarding.upsertProfileByToken(token, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      country: body.country
    });

    return {
      id: session.id,
      status: session.status,
      checklist: session.checklistJson ? JSON.parse(session.checklistJson) : {}
    };
  }

  @Post(":token/document")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @Param("token") token: string,
    @Body("type") type: "PHOTO" | "GOV_ID" | "OTHER",
    @UploadedFile()
    file: any
  ) {
    // Store under uploads/onboarding similar to daily logs
    if (!file) {
      return { ok: false, message: "No file uploaded" };
    }

    const uploadsRoot = path.resolve(process.cwd(), "uploads/onboarding");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    const ext = path.extname(file.originalname || "");
    const fileName = `${token}-${Date.now()}${ext}`;
    const destPath = path.join(uploadsRoot, fileName);

    fs.writeFileSync(destPath, file.buffer);

    const publicUrl = `/uploads/onboarding/${fileName}`;

    const session = await this.onboarding.addDocumentByToken(token, {
      type,
      fileUrl: publicUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size
    });

    return {
      id: session.id,
      status: session.status,
      checklist: session.checklistJson ? JSON.parse(session.checklistJson) : {},
      fileUrl: publicUrl
    };
  }

  @Post(":token/submit")
  async submit(@Param("token") token: string) {
    const session = await this.onboarding.submitByToken(token);
    return { id: session.id, status: session.status };
  }

  @Get(":token/skills")
  async getSkills(@Param("token") token: string) {
    const skills = await this.onboarding.getSkillsForSessionByToken(token);
    return { skills };
  }

  @Post(":token/skills")
  async upsertSkills(
    @Param("token") token: string,
    @Body() body: { ratings: { skillId: string; level: number }[] }
  ) {
    const skills = await this.onboarding.upsertSkillsByToken(token, body.ratings || []);
    return { skills };
  }

  // --- Internal endpoints (auth required) ---

  @UseGuards(JwtAuthGuard)
  @Get("company/:companyId/sessions")
  async listForCompany(
    @Param("companyId") companyId: string,
    @Query("status") status: string | undefined,
    @Req() req: any
  ) {
    const actor = req.user as AuthenticatedUser;
    const statuses = status ? status.split(",") : undefined;
    return this.onboarding.listSessionsForCompany(companyId, actor, statuses);
  }

  @UseGuards(JwtAuthGuard)
  @Get("sessions/:id")
  async getForReview(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.getSessionForReview(id, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/approve")
  async approve(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.approveSession(id, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/reject")
  async reject(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.rejectSession(id, actor);
  }
}
