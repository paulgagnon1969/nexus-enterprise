import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
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
}
