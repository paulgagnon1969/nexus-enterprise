import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { DailyLogService } from "./daily-log.service";
import { JwtAuthGuard, Roles } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateDailyLogDto } from "./dto/create-daily-log.dto";
import { Role } from "@prisma/client";

@Controller("projects/:projectId/daily-logs")
export class DailyLogController {
  constructor(private readonly dailyLogs: DailyLogService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.listForProject(projectId, user.companyId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  create(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateDailyLogDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.createForProject(projectId, user.companyId, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":logId/approve")
  approve(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.approveLog(logId, user.companyId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":logId/reject")
  reject(
    @Req() req: any,
    @Param("logId") logId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.dailyLogs.rejectLog(logId, user.companyId, user);
  }
}
