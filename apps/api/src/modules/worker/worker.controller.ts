import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
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

  // Update core worker contact + compensation fields. This is primarily used
  // from the Company user profile page when editing worker phone + rates.
  //
  // Authorization is enforced in the service layer:
  // - SUPER_ADMIN anywhere in the system; or
  // - Nexus System HR / OWNER / ADMIN in the Nexus System company context.
  @UseGuards(JwtAuthGuard)
  @Patch(":id/comp")
  async updateWorkerComp(
    @Param("id") workerId: string,
    @Req() req: any,
    @Body()
    body: {
      phone?: string | null;
      defaultPayRate?: number | null;
      billRate?: number | null;
      cpRate?: number | null;
      cpRole?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.workerService.updateWorkerComp(actor, workerId, body ?? {});
  }
}
