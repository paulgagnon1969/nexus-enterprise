import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { JwtAuthGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  // Create a referral from the current authenticated user (candidate or member).
  @UseGuards(JwtAuthGuard)
  @Post()
  async createForCurrentUser(
    @Req() req: any,
    @Body()
    body: {
      prospectName?: string | null;
      prospectEmail?: string | null;
      prospectPhone?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;

    if (!body) {
      throw new BadRequestException("Missing referral payload");
    }

    const result = await this.referrals.createReferralForUser(actor, {
      prospectName: body.prospectName ?? null,
      prospectEmail: body.prospectEmail ?? null,
      prospectPhone: body.prospectPhone ?? null,
    });

    return result;
  }

  // Current user's referrals (who I have referred).
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async listForMe(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listReferralsForUser(actor);
  }

  // Summary of current user's referrals + earnings (referral bank).
  @UseGuards(JwtAuthGuard)
  @Get("me/summary")
  async summaryForMe(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.getReferralSummaryForUser(actor);
  }

  // System-wide list of referrals (SUPER_ADMIN only).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system")
  async listForSystem(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listReferralsForSystem(actor);
  }

  // Certification catalog and templates (SUPER_ADMIN only).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/certification-types")
  async listCertificationTypes(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listCertificationTypes(actor);
  }

  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/certification-types/:id")
  async getCertificationType(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.getCertificationType(actor, id);
  }

  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post("system/certification-types/:id/template")
  async updateCertificationTemplate(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      certificateTemplateHtml: string;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body?.certificateTemplateHtml && body?.certificateTemplateHtml !== "") {
      throw new BadRequestException("certificateTemplateHtml is required (can be empty string)");
    }
    return this.referrals.updateCertificationTemplateHtml(actor, id, body.certificateTemplateHtml);
  }

  // System-wide list of Nex-Net candidates (SUPER_ADMIN only).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/candidates")
  async listCandidatesForSystem(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listCandidatesForSystem(actor);
  }

  // Nexus Fortified Structures: Nex-Net candidates shared to this tenant.
  @UseGuards(JwtAuthGuard)
  @Get("fortified/candidates")
  async listCandidatesForFortified(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listCandidatesForFortified(actor);
  }

  // Candidate training assignments (SUPER_ADMIN only for now).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/candidates/:candidateId/training")
  async getCandidateTraining(@Req() req: any, @Param("candidateId") candidateId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.getCandidateTraining(actor, candidateId);
  }

  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post("system/candidates/:candidateId/training")
  async assignTrainingToCandidate(
    @Req() req: any,
    @Param("candidateId") candidateId: string,
    @Body()
    body: {
      trainingModuleId: string;
      isRequired?: boolean | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body?.trainingModuleId) {
      throw new BadRequestException("trainingModuleId is required");
    }
    return this.referrals.assignTrainingToCandidate(actor, candidateId, body);
  }

  // Candidate certifications (SUPER_ADMIN only for now).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/candidates/:candidateId/certifications")
  async getCandidateCertifications(@Req() req: any, @Param("candidateId") candidateId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.getCandidateCertifications(actor, candidateId);
  }

  // Render a candidate certificate as HTML (for preview/issuing).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/certifications/:certificationId/preview-html")
  async previewCertificateHtml(
    @Req() req: any,
    @Param("certificationId") certificationId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.renderCandidateCertificateHtml(actor, certificationId);
  }

  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post("system/candidates/:candidateId/certifications")
  async upsertCandidateCertification(
    @Req() req: any,
    @Param("candidateId") candidateId: string,
    @Body()
    body: {
      certificationTypeId: string;
      licenseNumber?: string | null;
      issuedBy?: string | null;
      issuedAt?: string | null;
      effectiveAt?: string | null;
      expiresAt?: string | null;
      status?: string | null;
      verificationNotes?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body?.certificationTypeId) {
      throw new BadRequestException("certificationTypeId is required");
    }

    const parseDate = (value?: string | null): Date | null => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    return this.referrals.upsertCandidateCertification(actor, candidateId, {
      certificationTypeId: body.certificationTypeId,
      licenseNumber: body.licenseNumber ?? null,
      issuedBy: body.issuedBy ?? null,
      issuedAt: parseDate(body.issuedAt),
      effectiveAt: parseDate(body.effectiveAt),
      expiresAt: parseDate(body.expiresAt),
      status: body.status as any,
      verificationNotes: body.verificationNotes ?? null,
    });
  }

  // Candidate marketplace profile (SUPER_ADMIN only for now).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/candidates/:candidateId/market-profile")
  async getCandidateMarketProfile(@Req() req: any, @Param("candidateId") candidateId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.getCandidateMarketProfile(actor, candidateId);
  }

  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post("system/candidates/:candidateId/market-profile")
  async upsertCandidateMarketProfile(
    @Req() req: any,
    @Param("candidateId") candidateId: string,
    @Body()
    body: {
      publicId?: string | null;
      headline?: string | null;
      skillsSummary?: string | null;
      credentialsSummary?: string | null;
      locationRegion?: string | null;
      ratingNumeric?: number | null;
      ratingLabel?: string | null;
      rateMin?: number | null;
      rateMax?: number | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.upsertCandidateMarketProfile(actor, candidateId, body);
  }

  // System-wide gaming alerts: aggregate referee rejections per referrer.
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/gaming-alerts")
  async listGamingAlerts(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listGamingAlertsForSystem(actor);
  }
 
  // Public referral lookup for /apply?referralToken=...
  @Get("lookup/:token")
  async lookupPublic(@Param("token") token: string) {
    const result = await this.referrals.lookupByToken(token);
    if (!result) {
      throw new NotFoundException("Referral not found");
    }
    return result;
  }
}
