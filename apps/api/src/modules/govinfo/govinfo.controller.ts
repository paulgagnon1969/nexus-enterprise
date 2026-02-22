import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, getEffectiveRoleLevel } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { FrMonitorService } from "./fr-monitor.service";
import { GovInfoService } from "./govinfo.service";
import { McpClientService } from "./mcp-client.service";
import { CfrHistoryService } from "./cfr-history.service";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) throw new ForbiddenException("Authentication required");
  return user;
}

function assertSuperAdmin(user: AuthenticatedUser) {
  if (user.globalRole !== "SUPER_ADMIN") {
    throw new ForbiddenException("SUPER_ADMIN role required");
  }
}

function assertAdminOrPm(user: AuthenticatedUser) {
  const level = getEffectiveRoleLevel({
    globalRole: user.globalRole,
    role: user.role,
    profileCode: user.profileCode,
  });
  // PM level (60) or above
  if (level < 60) {
    throw new ForbiddenException("PM-level access or higher required");
  }
}

@Controller("system/govinfo")
@UseGuards(JwtAuthGuard)
export class GovInfoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frMonitor: FrMonitorService,
    private readonly govInfo: GovInfoService,
    private readonly mcp: McpClientService,
    private readonly cfrHistory: CfrHistoryService,
  ) {}

  // =========================================================================
  // Federal Register Alerts (Phase 1)
  // =========================================================================

  /** List FR alerts with optional filters. */
  @Get("fr-alerts")
  async listAlerts(
    @Req() req: FastifyRequest,
    @Query("isRead") isRead?: string,
    @Query("isRelevant") isRelevant?: string,
    @Query("documentType") documentType?: string,
    @Query("agency") agency?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const where: any = {};
    if (isRead === "true") where.isRead = true;
    if (isRead === "false") where.isRead = false;
    if (isRelevant === "true") where.isRelevant = true;
    if (isRelevant === "false") where.isRelevant = false;
    if (documentType) where.documentType = documentType;
    if (agency) where.agencies = { has: agency };

    const [alerts, total] = await Promise.all([
      this.prisma.federalRegisterAlert.findMany({
        where,
        orderBy: { publishedDate: "desc" },
        take: Math.min(Number(take) || 50, 200),
        skip: Number(skip) || 0,
      }),
      this.prisma.federalRegisterAlert.count({ where }),
    ]);

    return { alerts, total };
  }

  /** Update an FR alert (mark read, toggle relevance). */
  @Patch("fr-alerts/:id")
  async updateAlert(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: { isRead?: boolean; isRelevant?: boolean },
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const data: any = {};
    if (body.isRead !== undefined) data.isRead = body.isRead;
    if (body.isRelevant !== undefined) data.isRelevant = body.isRelevant;

    return this.prisma.federalRegisterAlert.update({ where: { id }, data });
  }

  /** Manually trigger an FR monitor check. */
  @Post("fr-monitor/check")
  async triggerMonitorCheck(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);

    return this.frMonitor.triggerCheck();
  }

  /** Get FR monitor status. */
  @Get("fr-monitor/status")
  async getMonitorStatus(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);

    return this.frMonitor.getStatus();
  }

  // =========================================================================
  // GovInfo API Status
  // =========================================================================

  /** Check if GovInfo integration is enabled. */
  @Get("status")
  async getGovInfoStatus(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);

    return {
      apiEnabled: this.govInfo.isEnabled(),
      mcpEnabled: this.mcp.isEnabled(),
    };
  }

  // =========================================================================
  // Regulatory AI — MCP Assistant (Phase 3)
  // =========================================================================

  /** Ask a regulatory question via the GovInfo MCP integration. */
  @Post("ask")
  async askRegulatory(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      question: string;
      context?: { cfrTitle?: number; cfrPart?: number };
    },
  ) {
    const user = getUser(req);
    assertAdminOrPm(user);

    if (!body.question || body.question.trim().length < 5) {
      throw new BadRequestException("Question must be at least 5 characters");
    }

    return this.mcp.query(user.userId, body.question.trim(), body.context);
  }

  /** Get recent query history for the current user. */
  @Get("ask/history")
  async getQueryHistory(
    @Req() req: FastifyRequest,
    @Query("take") take?: string,
  ) {
    const user = getUser(req);
    assertAdminOrPm(user);

    return this.prisma.regQueryLog.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(take) || 20, 100),
    });
  }

  // =========================================================================
  // CFR Historical Changes (Phase 4)
  // =========================================================================

  /** Get CFR changes for a specific year. */
  @Get("cfr-changes")
  async getCfrChanges(
    @Req() req: FastifyRequest,
    @Query("title") title: string,
    @Query("part") part: string,
    @Query("year") year: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    if (!title || !part || !year) {
      throw new BadRequestException("title, part, and year are required");
    }

    return this.prisma.cfrAnnualDiff.findMany({
      where: {
        cfrTitle: Number(title),
        cfrPart: Number(part),
        toYear: Number(year),
      },
      orderBy: { sectionCfr: "asc" },
    });
  }

  /** Get change timeline for a single CFR section. */
  @Get("cfr-changes/:sectionCfr/timeline")
  async getSectionTimeline(
    @Req() req: FastifyRequest,
    @Param("sectionCfr") sectionCfr: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    return this.prisma.cfrAnnualDiff.findMany({
      where: { sectionCfr },
      orderBy: { toYear: "desc" },
    });
  }

  /** Trigger a CFR annual diff for a specific title/part/year range. */
  @Post("cfr-history/build")
  async buildCfrHistory(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      cfrTitle: number;
      cfrPart: number;
      fromYear: number;
      toYear: number;
    },
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    if (!body.cfrTitle || !body.cfrPart || !body.fromYear || !body.toYear) {
      throw new BadRequestException("cfrTitle, cfrPart, fromYear, and toYear are required");
    }

    return this.cfrHistory.buildDiff(
      body.cfrTitle,
      body.cfrPart,
      body.fromYear,
      body.toYear,
    );
  }

  /** List available annual snapshots. */
  @Get("cfr-history/snapshots")
  async listSnapshots(
    @Req() req: FastifyRequest,
    @Query("title") title?: string,
    @Query("part") part?: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const where: any = {};
    if (title) where.cfrTitle = Number(title);
    if (part) where.cfrPart = Number(part);

    return this.prisma.cfrAnnualSnapshot.findMany({
      where,
      orderBy: [{ cfrTitle: "asc" }, { cfrPart: "asc" }, { year: "desc" }],
    });
  }
}
