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
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";

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
    @Body("password") password: string,
    @Body("referralToken") referralToken?: string,
  ) {
    const session = await this.onboarding.startPublicSession(email, password, referralToken);
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

  @Get(":token/referrer")
  async getReferrer(@Param("token") token: string) {
    const summary = await this.onboarding.getReferrerForSessionByToken(token);
    if (!summary) {
      throw new BadRequestException("Referral not found for this session");
    }
    return summary;
  }

  @Post(":token/referrer/confirm")
  async confirmReferrer(
    @Param("token") token: string,
    @Body("decision") decision: "accept" | "reject",
  ) {
    if (decision !== "accept" && decision !== "reject") {
      throw new BadRequestException("decision must be 'accept' or 'reject'");
    }
    const accepted = decision === "accept";
    return this.onboarding.confirmReferrerForSession(token, accepted);
  }

  @Post(":token/document")
  async uploadDocument(@Param("token") token: string, @Req() req: FastifyRequest) {
    // Fastify-native multipart parsing.
    // The web app sends `type` + `file` in a multipart/form-data payload.
    const { file: filePart, fields } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
      captureFields: ["type"],
    });

    const rawType = fields["type"];
    const type = rawType as "PHOTO" | "GOV_ID" | "OTHER" | undefined;

    if (!type || (type !== "PHOTO" && type !== "GOV_ID" && type !== "OTHER")) {
      throw new BadRequestException("Invalid or missing document type");
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
    @Query("detailStatusCode") detailStatusCode: string | undefined,
    @Req() req: any
  ) {
    const actor = req.user as AuthenticatedUser;
    const statuses = status ? status.split(",") : undefined;
    const detailCodes = detailStatusCode
      ? detailStatusCode.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;
    return this.onboarding.listSessionsForCompany(companyId, actor, statuses, detailCodes);
  }

  // Unified prospective candidates view for the web app. For most tenants this
  // is equivalent to /company/:companyId/sessions. For Nexus Fortified
  // Structures it returns a shared view over the Nexus System recruiting pool
  // plus any local Fortified onboarding sessions.
  @UseGuards(JwtAuthGuard)
  @Get("company/:companyId/prospects")
  async listProspectsForCompany(
    @Param("companyId") companyId: string,
    @Query("status") status: string | undefined,
    @Query("detailStatusCode") detailStatusCode: string | undefined,
    @Req() req: any,
  ) {
    const actor = req.user as AuthenticatedUser;
    const statuses = status ? status.split(",") : undefined;
    const detailCodes = detailStatusCode
      ? detailStatusCode.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;
    return this.onboarding.listProspectsForCompany(companyId, actor, statuses, detailCodes);
  }

  // Multi-tenant sharing: allow OWNER / ADMIN / HIRING_MANAGER (or SUPER_ADMIN)
  // in a company to share one or more prospective candidates with other tenant
  // companies. This wires up CandidatePoolVisibility so those tenants can see
  // the shared candidates in their own Prospective Candidates views.
  @UseGuards(JwtAuthGuard)
  @Post("company/:companyId/share-prospects")
  async shareProspectsForCompany(
    @Param("companyId") companyId: string,
    @Req() req: any,
    @Body()
    body: {
      sessionIds?: string[];
      targetCompanyIds?: string[];
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.shareProspectsWithCompanies(companyId, actor, body ?? {});
  }

  // Authenticated candidate self-view: return the latest onboarding session for the
  // current user in the current company context. This powers the /candidate portal
  // so applicants can see what they have completed vs what is still pending.
  @UseGuards(JwtAuthGuard)
  @Get("my-session")
  async getMySession(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.getLatestSessionForUser(actor);
  }

  // Allow a logged-in user (e.g. Nexis pool candidate) to bootstrap their own
  // Nexis profile / onboarding session if one does not already exist. This is
  // idempotent: if a session already exists for this user/email, we return it
  // instead of creating a duplicate.
  @UseGuards(JwtAuthGuard)
  @Post("start-self")
  async startSelf(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.startSelfProfile(actor);
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

  // Mark an onboarding session (and any linked Nex-Net candidates) as TEST so
  // they can be excluded from normal recruiting flows but still visible when
  // explicitly filtered.
  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/mark-test")
  async markTest(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.markSessionAsTest(id, actor);
  }

  // --- Candidate status definitions (admin/HR only) ---

  @UseGuards(JwtAuthGuard)
  @Get("company/:companyId/status-definitions")
  async listStatusDefinitions(@Param("companyId") companyId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.listStatusDefinitions(companyId, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post("company/:companyId/status-definitions")
  async upsertStatusDefinition(
    @Param("companyId") companyId: string,
    @Req() req: any,
    @Body() body: { code: string; label: string; color?: string | null; sortOrder?: number | null },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.upsertStatusDefinition(actor, { ...body, companyId });
  }

  @UseGuards(JwtAuthGuard)
  @Post("status-definitions/:id/deactivate")
  async deactivateStatusDefinition(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.deactivateStatusDefinition(actor, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/detail-status")
  async setSessionDetailStatus(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { detailStatusCode: string | null },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.setSessionDetailStatus(id, actor, body);
  }

  // HR/admin-only: allow privileged users to normalize/edit onboarding profile
  // fields for a candidate (e.g. fix capitalization, fill in missing city/state).
  @UseGuards(JwtAuthGuard)
  @Post("admin/normalize-states")
  async normalizeStates(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.normalizeProspectiveCandidateStates(actor);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/profile")
  async updateSessionProfile(
    @Param("id") id: string,
    @Req() req: any,
    @Body()
    body: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      dob?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.updateSessionProfile(id, actor, body ?? {});
  }

  // HR/admin-only: allow privileged users to edit the candidate's onboarding
  // bank info record (masked values only).
  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/bank-info")
  async updateSessionBankInfo(
    @Param("id") id: string,
    @Req() req: any,
    @Body()
    body: {
      bankName?: string | null;
      accountHolderName?: string | null;
      routingNumberMasked?: string | null;
      accountNumberMasked?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.onboarding.updateSessionBankInfo(id, actor, body ?? {});
  }
}
