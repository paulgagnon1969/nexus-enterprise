import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { createHash, randomBytes } from "crypto";

// ─── DTOs ──────────────────────────────────────────────────────────

export interface CreateSitePassDto {
  displayName: string;
  companyName?: string;
  trade?: string;
  phone?: string;
  email?: string;
  userId?: string;
  workerId?: string;
}

export interface CreateSiteDocumentDto {
  title: string;
  htmlContent: string;
  category?: string;
  frequency?: string; // ONCE | DAILY | ON_CHANGE
  sortOrder?: number;
  sourceDocId?: string;
}

export interface UpdateSiteDocumentDto {
  title?: string;
  htmlContent?: string;
  category?: string;
  frequency?: string; // ONCE | DAILY | ON_CHANGE
  sortOrder?: number;
  isActive?: boolean;
  /** Bump version — forces ON_CHANGE docs to require re-acknowledgment */
  bumpVersion?: boolean;
}

export interface CompleteCheckInDto {
  signatureSvg: string;
  acks: Array<{ siteDocumentId: string; documentVersion: number }>;
}

export interface ActivateKioskDto {
  projectId: string;
  deviceId: string;
}

export interface DelegateKioskDto {
  projectId: string;
  delegatedToUserId: string;
  /** Duration in hours. Default: 24, max: 168 (7 days) */
  durationHours?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function startOfDayUTC(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Service ───────────────────────────────────────────────────────

@Injectable()
export class NexCheckService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────────
  // Site Pass
  // ────────────────────────────────────────────────────────────────

  /** Register a new site pass. Returns the raw token (only time it's visible). */
  async createSitePass(companyId: string, dto: CreateSitePassDto) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const pass = await (this.prisma as any).sitePass.create({
      data: {
        companyId,
        userId: dto.userId ?? null,
        workerId: dto.workerId ?? null,
        tokenHash,
        displayName: dto.displayName,
        companyName: dto.companyName ?? null,
        trade: dto.trade ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
      },
    });

    return { ...pass, rawToken };
  }

  /** Identify a person by their raw site pass token. */
  async identifyByToken(token: string) {
    const tokenHash = hashToken(token);
    const pass = await (this.prisma as any).sitePass.findUnique({
      where: { tokenHash },
    });
    if (!pass || !pass.isActive || pass.revokedAt) {
      throw new NotFoundException("Site pass not found or revoked");
    }
    return pass;
  }

  /** Revoke a site pass. */
  async revokeSitePass(companyId: string, sitePassId: string) {
    const pass = await (this.prisma as any).sitePass.findFirst({
      where: { id: sitePassId, companyId },
    });
    if (!pass) throw new NotFoundException("Site pass not found");

    return (this.prisma as any).sitePass.update({
      where: { id: sitePassId },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  /** List site passes for a company. */
  async listSitePasses(companyId: string, activeOnly = true) {
    return (this.prisma as any).sitePass.findMany({
      where: { companyId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Site Documents (PM configuration)
  // ────────────────────────────────────────────────────────────────

  async createSiteDocument(
    companyId: string,
    projectId: string,
    userId: string,
    dto: CreateSiteDocumentDto,
  ) {
    await this.ensureProjectBelongsToCompany(companyId, projectId);

    return (this.prisma as any).siteDocument.create({
      data: {
        companyId,
        projectId,
        title: dto.title,
        htmlContent: dto.htmlContent,
        category: dto.category ?? "CUSTOM",
        frequency: dto.frequency ?? "DAILY",
        sortOrder: dto.sortOrder ?? 0,
        sourceDocId: dto.sourceDocId ?? null,
        createdByUserId: userId,
      },
    });
  }

  async updateSiteDocument(
    companyId: string,
    projectId: string,
    docId: string,
    dto: UpdateSiteDocumentDto,
  ) {
    const doc = await (this.prisma as any).siteDocument.findFirst({
      where: { id: docId, companyId, projectId },
    });
    if (!doc) throw new NotFoundException("Site document not found");

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.htmlContent !== undefined) data.htmlContent = dto.htmlContent;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.bumpVersion) data.version = doc.version + 1;

    return (this.prisma as any).siteDocument.update({
      where: { id: docId },
      data,
    });
  }

  async deleteSiteDocument(companyId: string, projectId: string, docId: string) {
    const doc = await (this.prisma as any).siteDocument.findFirst({
      where: { id: docId, companyId, projectId },
    });
    if (!doc) throw new NotFoundException("Site document not found");

    return (this.prisma as any).siteDocument.delete({ where: { id: docId } });
  }

  async listSiteDocuments(companyId: string, projectId: string) {
    return (this.prisma as any).siteDocument.findMany({
      where: { companyId, projectId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Document Queue Resolution
  // ────────────────────────────────────────────────────────────────

  /**
   * Compute which documents a worker still needs to acknowledge today.
   * Frequency rules:
   *   ONCE      — skip if any prior ack exists
   *   DAILY     — skip if acked today
   *   ON_CHANGE — skip if latest ack version matches current doc version
   */
  async getDocumentQueue(projectId: string, sitePassId: string) {
    const docs: any[] = await (this.prisma as any).siteDocument.findMany({
      where: { projectId, isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    if (docs.length === 0) return [];

    // Fetch all acks for this pass + project
    const acks: any[] = await (this.prisma as any).siteDocumentAck.findMany({
      where: { sitePassId, projectId },
      orderBy: { acknowledgedAt: "desc" },
    });

    const todayStart = startOfDayUTC();
    const pending: any[] = [];

    for (const doc of docs) {
      const docAcks = acks.filter((a: any) => a.siteDocumentId === doc.id);

      if (doc.frequency === "ONCE") {
        if (docAcks.length === 0) pending.push(doc);
      } else if (doc.frequency === "DAILY") {
        const ackedToday = docAcks.some(
          (a: any) => a.acknowledgedAt >= todayStart,
        );
        if (!ackedToday) pending.push(doc);
      } else if (doc.frequency === "ON_CHANGE") {
        const latestAck = docAcks[0]; // sorted desc
        if (!latestAck || latestAck.documentVersion < doc.version) {
          pending.push(doc);
        }
      }
    }

    return pending;
  }

  // ────────────────────────────────────────────────────────────────
  // Check-In / Sign-Out
  // ────────────────────────────────────────────────────────────────

  /** Start a check-in session. Returns the session + document queue. */
  async startCheckIn(
    companyId: string,
    projectId: string,
    sitePassId: string,
    kioskSessionId?: string,
  ) {
    await this.ensureProjectBelongsToCompany(companyId, projectId);

    // Verify site pass is valid
    const pass = await (this.prisma as any).sitePass.findFirst({
      where: { id: sitePassId, companyId, isActive: true },
    });
    if (!pass) throw new NotFoundException("Site pass not found or inactive");

    // Check for existing open session today (prevent double check-in)
    const todayStart = startOfDayUTC();
    const existing = await (this.prisma as any).siteCheckIn.findFirst({
      where: {
        sitePassId,
        projectId,
        checkInAt: { gte: todayStart },
        signOutAt: null,
      },
    });
    if (existing) {
      throw new ConflictException("Already checked in today. Sign out first.");
    }

    const checkIn = await (this.prisma as any).siteCheckIn.create({
      data: {
        companyId,
        projectId,
        sitePassId,
        kioskSessionId: kioskSessionId ?? null,
      },
    });

    const documentQueue = await this.getDocumentQueue(projectId, sitePassId);

    return { checkIn, documentQueue };
  }

  /** Complete a check-in: record signature and document acknowledgments. */
  async completeCheckIn(
    companyId: string,
    checkInId: string,
    dto: CompleteCheckInDto,
  ) {
    const checkIn = await (this.prisma as any).siteCheckIn.findFirst({
      where: { id: checkInId, companyId },
    });
    if (!checkIn) throw new NotFoundException("Check-in session not found");
    if (checkIn.signatureSvg) {
      throw new ConflictException("Check-in already completed");
    }

    // Create ack records
    if (dto.acks.length > 0) {
      await (this.prisma as any).siteDocumentAck.createMany({
        data: dto.acks.map((a) => ({
          siteDocumentId: a.siteDocumentId,
          sitePassId: checkIn.sitePassId,
          projectId: checkIn.projectId,
          documentVersion: a.documentVersion,
          checkInSessionId: checkInId,
        })),
      });
    }

    // Update check-in with signature and ack count
    return (this.prisma as any).siteCheckIn.update({
      where: { id: checkInId },
      data: {
        signatureSvg: dto.signatureSvg,
        documentsAcked: dto.acks.length,
      },
    });
  }

  /** Manual sign-out at kiosk. */
  async manualSignOut(companyId: string, projectId: string, sitePassId: string) {
    const checkIn = await this.findOpenCheckIn(companyId, projectId, sitePassId);
    if (!checkIn) throw new NotFoundException("No open check-in found");

    return (this.prisma as any).siteCheckIn.update({
      where: { id: checkIn.id },
      data: { signOutAt: new Date(), signOutMethod: "MANUAL" },
    });
  }

  /** System-triggered auto sign-out (geo-fence departure). */
  async autoSignOut(checkInId: string, departureTime: Date) {
    return (this.prisma as any).siteCheckIn.update({
      where: { id: checkInId },
      data: {
        signOutAt: departureTime,
        signOutMethod: "SYSTEM_AUTO_SIGNOUT",
      },
    });
  }

  /** EOD cutoff: close all open sessions for a project. */
  async eodSignOut(companyId: string, projectId: string) {
    const now = new Date();
    const todayStart = startOfDayUTC();

    const result = await (this.prisma as any).siteCheckIn.updateMany({
      where: {
        companyId,
        projectId,
        checkInAt: { gte: todayStart },
        signOutAt: null,
      },
      data: {
        signOutAt: now,
        signOutMethod: "SYSTEM_EOD_SIGNOUT",
      },
    });

    return { closed: result.count };
  }

  /** Find an open (not signed-out) check-in for today. */
  private async findOpenCheckIn(
    companyId: string,
    projectId: string,
    sitePassId: string,
  ) {
    const todayStart = startOfDayUTC();
    return (this.prisma as any).siteCheckIn.findFirst({
      where: {
        companyId,
        projectId,
        sitePassId,
        checkInAt: { gte: todayStart },
        signOutAt: null,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Kiosk Session
  // ────────────────────────────────────────────────────────────────

  /** Activate kiosk mode. Caller must be PM/admin or have delegation. */
  async activateKiosk(companyId: string, userId: string, dto: ActivateKioskDto) {
    await this.ensureProjectBelongsToCompany(companyId, dto.projectId);
    await this.ensureCanActivateKiosk(companyId, dto.projectId, userId);

    // Deactivate any existing session on this device
    await (this.prisma as any).kioskSession.updateMany({
      where: { deviceId: dto.deviceId, isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    return (this.prisma as any).kioskSession.create({
      data: {
        companyId,
        projectId: dto.projectId,
        deviceId: dto.deviceId,
        activatedByUserId: userId,
      },
    });
  }

  /** Deactivate kiosk mode. */
  async deactivateKiosk(companyId: string, sessionId: string) {
    const session = await (this.prisma as any).kioskSession.findFirst({
      where: { id: sessionId, companyId, isActive: true },
    });
    if (!session) throw new NotFoundException("Active kiosk session not found");

    return (this.prisma as any).kioskSession.update({
      where: { id: sessionId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Kiosk Delegation
  // ────────────────────────────────────────────────────────────────

  /** PM delegates kiosk activation rights to a user. */
  async delegateKiosk(companyId: string, delegatedByUserId: string, dto: DelegateKioskDto) {
    await this.ensureProjectBelongsToCompany(companyId, dto.projectId);

    const hours = Math.min(dto.durationHours ?? 24, 168); // Max 7 days
    if (hours < 1) throw new BadRequestException("Duration must be at least 1 hour");

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    return (this.prisma as any).kioskDelegation.create({
      data: {
        companyId,
        projectId: dto.projectId,
        delegatedToUserId: dto.delegatedToUserId,
        delegatedByUserId,
        expiresAt,
      },
    });
  }

  /** Revoke a kiosk delegation early. */
  async revokeDelegation(companyId: string, delegationId: string) {
    const delegation = await (this.prisma as any).kioskDelegation.findFirst({
      where: { id: delegationId, companyId, revokedAt: null },
    });
    if (!delegation) throw new NotFoundException("Active delegation not found");

    return (this.prisma as any).kioskDelegation.update({
      where: { id: delegationId },
      data: { revokedAt: new Date() },
    });
  }

  /** List active delegations for a project. */
  async listDelegations(companyId: string, projectId: string) {
    return (this.prisma as any).kioskDelegation.findMany({
      where: {
        companyId,
        projectId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        delegatedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        delegatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Roster
  // ────────────────────────────────────────────────────────────────

  /** Get today's site roster for a project. */
  async getRoster(companyId: string, projectId: string, date?: string) {
    const targetDate = date ? new Date(`${date}T00:00:00Z`) : startOfDayUTC();
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const checkIns: any[] = await (this.prisma as any).siteCheckIn.findMany({
      where: {
        companyId,
        projectId,
        checkInAt: { gte: targetDate, lt: nextDay },
      },
      include: {
        sitePass: {
          select: {
            id: true,
            displayName: true,
            companyName: true,
            trade: true,
            phone: true,
            email: true,
          },
        },
        acks: {
          include: {
            siteDocument: { select: { id: true, title: true, category: true } },
          },
        },
      },
      orderBy: { checkInAt: "asc" },
    });

    return checkIns.map((ci: any) => ({
      id: ci.id,
      sitePass: ci.sitePass,
      checkInAt: ci.checkInAt,
      signOutAt: ci.signOutAt,
      signOutMethod: ci.signOutMethod,
      hasSignature: !!ci.signatureSvg,
      documentsAcked: ci.documentsAcked,
      documents: ci.acks.map((a: any) => ({
        title: a.siteDocument.title,
        category: a.siteDocument.category,
        acknowledgedAt: a.acknowledgedAt,
      })),
    }));
  }

  // ────────────────────────────────────────────────────────────────
  // Auth Helpers
  // ────────────────────────────────────────────────────────────────

  private async ensureProjectBelongsToCompany(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found for company");
  }

  /** Check if user can activate kiosk: PM/admin role or active delegation. */
  private async ensureCanActivateKiosk(
    companyId: string,
    projectId: string,
    userId: string,
  ) {
    // Check project membership role (PM, ADMIN, OWNER)
    const membership = await this.prisma.companyMembership.findFirst({
      where: { companyId, userId },
      select: { role: true },
    });

    const pmRoles = ["ADMIN", "OWNER", "PM"];
    if (membership && pmRoles.includes(membership.role)) return;

    // Check for active delegation
    const delegation = await (this.prisma as any).kioskDelegation.findFirst({
      where: {
        companyId,
        projectId,
        delegatedToUserId: userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (delegation) return;

    throw new ForbiddenException(
      "Kiosk activation requires PM/admin role or an active kiosk delegation",
    );
  }
}
