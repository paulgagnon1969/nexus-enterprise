import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { OnboardingService } from "./onboarding.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import type { FastifyRequest } from "fastify";
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

  // Public recruiting endpoint: always attach candidate to the configured "pool" company.
  // If the email already exists, return a 409 so the UI can prompt them to log in instead.
  @Post("start-public")
  async startPublic(
    @Body("email") email: string,
    @Body("password") password: string
  ) {
    const session = await this.onboarding.startPublicSession(email, password);
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
      profile: session.profile,
      documents: session.documents,
      createdAt: session.createdAt
    };
  }

  @Post(":token/profile")
  async upsertProfile(@Param("token") token: string, @Body() body: any) {
    const session = await this.onboarding.upsertProfileByToken(token, {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      dob: body.dob ? new Date(body.dob) : undefined,
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
  async uploadDocument(@Param("token") token: string, @Req() req: FastifyRequest) {
    // Fastify-native multipart parsing.
    // The web app sends `type` + `file` in a multipart/form-data payload.
    let type: "PHOTO" | "GOV_ID" | "OTHER" | undefined;
    let filePart:
      | {
          filename: string;
          mimetype: string;
          toBuffer: () => Promise<Buffer>;
        }
      | undefined;

    // `req.parts()` is provided by @fastify/multipart
    const parts = (req as any).parts?.();
    if (!parts) {
      throw new BadRequestException("Multipart support is not configured");
    }

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        filePart = part;
      } else if (part.type === "field" && part.fieldname === "type") {
        type = String(part.value) as any;
      }
    }

    if (!type || (type !== "PHOTO" && type !== "GOV_ID" && type !== "OTHER")) {
      throw new BadRequestException("Invalid or missing document type");
    }

    if (!filePart) {
      throw new BadRequestException("No file uploaded");
    }

    // Store under uploads/onboarding similar to daily logs
    const uploadsRoot = path.resolve(process.cwd(), "uploads/onboarding");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    const fileBuffer = await filePart.toBuffer();
    const ext = path.extname(filePart.filename || "");
    const fileName = `${token}-${Date.now()}${ext}`;
    const destPath = path.join(uploadsRoot, fileName);

    fs.writeFileSync(destPath, fileBuffer);

    const publicUrl = `/uploads/onboarding/${fileName}`;

    const session = await this.onboarding.addDocumentByToken(token, {
      type,
      fileUrl: publicUrl,
      fileName: filePart.filename,
      mimeType: filePart.mimetype,
      sizeBytes: fileBuffer.length,
    });

    return {
      id: session.id,
      status: session.status,
      checklist: session.checklistJson ? JSON.parse(session.checklistJson) : {},
      fileUrl: publicUrl,
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

  // People → Trades: unified list of tradespeople (company members + recruiting candidates)
  // for the current company context.
  @UseGuards(JwtAuthGuard)
  @Get("company/:companyId/trades-people")
  async listTradesPeople(
    @Param("companyId") companyId: string,
    @Req() req: any
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.listTradesPeople(companyId, actor);
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
