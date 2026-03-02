import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  NexCheckService,
  CreateSitePassDto,
  CreateSiteDocumentDto,
  UpdateSiteDocumentDto,
  CompleteCheckInDto,
  ActivateKioskDto,
  DelegateKioskDto,
} from "./nexcheck.service";

// ─── Site Pass ─────────────────────────────────────────────────────

@Controller("nexcheck/site-pass")
@UseGuards(JwtAuthGuard)
export class SitePassController {
  constructor(private readonly svc: NexCheckService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateSitePassDto) {
    const user = req.user as AuthenticatedUser;
    return this.svc.createSitePass(user.companyId, dto);
  }

  @Post("identify")
  async identify(@Body("token") token: string) {
    return this.svc.identifyByToken(token);
  }

  @Get()
  async list(@Req() req: any, @Query("activeOnly") activeOnly?: string) {
    const user = req.user as AuthenticatedUser;
    return this.svc.listSitePasses(user.companyId, activeOnly !== "false");
  }

  @Delete(":id")
  async revoke(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.svc.revokeSitePass(user.companyId, id);
  }
}

// ─── Site Documents ────────────────────────────────────────────────

@Controller("nexcheck/projects/:projectId/documents")
@UseGuards(JwtAuthGuard)
export class SiteDocumentController {
  constructor(private readonly svc: NexCheckService) {}

  @Get()
  async list(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.svc.listSiteDocuments(user.companyId, projectId);
  }

  @Post()
  async create(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateSiteDocumentDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.createSiteDocument(user.companyId, projectId, user.userId, dto);
  }

  @Put(":docId")
  async update(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("docId") docId: string,
    @Body() dto: UpdateSiteDocumentDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.updateSiteDocument(user.companyId, projectId, docId, dto);
  }

  @Delete(":docId")
  async remove(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("docId") docId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.deleteSiteDocument(user.companyId, projectId, docId);
  }
}

// ─── Kiosk ─────────────────────────────────────────────────────────

@Controller("nexcheck/kiosk")
@UseGuards(JwtAuthGuard)
export class KioskController {
  constructor(private readonly svc: NexCheckService) {}

  @Post("activate")
  async activate(@Req() req: any, @Body() dto: ActivateKioskDto) {
    const user = req.user as AuthenticatedUser;
    return this.svc.activateKiosk(user.companyId, user.userId, dto);
  }

  @Post(":sessionId/deactivate")
  async deactivate(@Req() req: any, @Param("sessionId") sessionId: string) {
    const user = req.user as AuthenticatedUser;
    return this.svc.deactivateKiosk(user.companyId, sessionId);
  }

  /** Get pending document queue for a worker on a project. */
  @Get(":projectId/document-queue")
  async documentQueue(
    @Param("projectId") projectId: string,
    @Query("sitePassId") sitePassId: string,
  ) {
    return this.svc.getDocumentQueue(projectId, sitePassId);
  }
}

// ─── Check-In / Sign-Out ──────────────────────────────────────────

@Controller("nexcheck/projects/:projectId/check-in")
@UseGuards(JwtAuthGuard)
export class CheckInController {
  constructor(private readonly svc: NexCheckService) {}

  /** Start a check-in session. */
  @Post()
  async startCheckIn(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: { sitePassId: string; kioskSessionId?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.startCheckIn(
      user.companyId,
      projectId,
      body.sitePassId,
      body.kioskSessionId,
    );
  }

  /** Complete check-in with signature and acks. */
  @Post(":checkInId/complete")
  async completeCheckIn(
    @Req() req: any,
    @Param("checkInId") checkInId: string,
    @Body() dto: CompleteCheckInDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.completeCheckIn(user.companyId, checkInId, dto);
  }

  /** Manual sign-out. */
  @Post("sign-out")
  async signOut(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body("sitePassId") sitePassId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.manualSignOut(user.companyId, projectId, sitePassId);
  }

  /** System auto sign-out (called by geo-fence worker). */
  @Post(":checkInId/auto-sign-out")
  async autoSignOut(
    @Param("checkInId") checkInId: string,
    @Body("departureTime") departureTime: string,
  ) {
    return this.svc.autoSignOut(checkInId, new Date(departureTime));
  }

  /** EOD cutoff — close all open sessions. */
  @Post("eod-sign-out")
  async eodSignOut(
    @Req() req: any,
    @Param("projectId") projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.eodSignOut(user.companyId, projectId);
  }
}

// ─── Delegation ────────────────────────────────────────────────────

@Controller("nexcheck/projects/:projectId/delegation")
@UseGuards(JwtAuthGuard)
export class DelegationController {
  constructor(private readonly svc: NexCheckService) {}

  @Post()
  async delegate(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: { delegatedToUserId: string; durationHours?: number },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.delegateKiosk(user.companyId, user.userId, {
      projectId,
      delegatedToUserId: body.delegatedToUserId,
      durationHours: body.durationHours,
    });
  }

  @Get()
  async list(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.svc.listDelegations(user.companyId, projectId);
  }

  @Delete(":delegationId")
  async revoke(@Req() req: any, @Param("delegationId") delegationId: string) {
    const user = req.user as AuthenticatedUser;
    return this.svc.revokeDelegation(user.companyId, delegationId);
  }
}

// ─── Roster ────────────────────────────────────────────────────────

@Controller("nexcheck/projects/:projectId/roster")
@UseGuards(JwtAuthGuard)
export class RosterController {
  constructor(private readonly svc: NexCheckService) {}

  @Get()
  async getRoster(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.svc.getRoster(user.companyId, projectId, date);
  }
}
