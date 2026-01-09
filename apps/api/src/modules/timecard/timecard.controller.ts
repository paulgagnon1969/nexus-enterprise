import { Controller, Get, Post, Body, Query, Param } from "@nestjs/common";
import { TimecardService, UpsertTimecardDto } from "./timecard.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { UseGuards, Req } from "@nestjs/common";

@Controller("projects/:projectId/timecards")
export class TimecardController {
  constructor(private readonly timecardService: TimecardService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getForDate(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    return this.timecardService.getTimecardForProjectDate({
      companyId,
      projectId,
      date,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async upsert(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: UpsertTimecardDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    return this.timecardService.upsertTimecard({
      companyId,
      projectId,
      userId: user.userId,
      body,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("copy-from-previous")
  async copyFromPrevious(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body("date") date: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    return this.timecardService.copyFromPrevious({
      companyId,
      projectId,
      userId: user.userId,
      date,
    });
  }
}
