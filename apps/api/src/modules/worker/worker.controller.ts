import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
import { WorkerService } from "./worker.service";

@Controller("workers")
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async listWorkers(@Req() req: any) {
    const companyId = req.user?.companyId;
    // For now, companyId is not used to filter Worker, since Worker is a
    // global table imported from BIA/LCP. We still require auth so only
    // logged-in users can see the list.
    const workers = await this.workerService.listWorkersForCompany(companyId);
    return { workers };
  }

  // SUPER_ADMIN-only: update core worker contact + compensation fields. This
  // is primarily used from the Company user profile page when editing worker
  // phone + rates.
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Patch(":id/comp")
  async updateWorkerComp(
    @Param("id") workerId: string,
    @Body()
    body: {
      phone?: string | null;
      defaultPayRate?: number | null;
      billRate?: number | null;
      cpRate?: number | null;
      cpRole?: string | null;
    },
  ) {
    return this.workerService.updateWorkerComp(workerId, body ?? {});
  }
}
