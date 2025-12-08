import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles } from "../auth/auth.guards";
import { GlobalRole } from "@prisma/client";
import { JobStatusService } from "./job-status.service";

@Controller("job-status")
export class JobStatusController {
  constructor(private readonly jobStatus: JobStatusService) {}

  // Any authenticated user can list active job statuses
  @UseGuards(JwtAuthGuard)
  @Get()
  listActive() {
    return this.jobStatus.listActive();
  }

  // Only SUPER_ADMIN / developers can edit the list
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post()
  upsert(@Body() body: { id?: string; code: string; label: string; sortOrder?: number; active?: boolean }) {
    return this.jobStatus.upsertStatus(body);
  }

  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.jobStatus.deleteStatus(id);
  }
}
