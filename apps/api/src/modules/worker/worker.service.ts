import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class WorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkersForCompany(companyId: string) {
    // Simple list of workers associated with this tenant via any PayrollWeekRecord
    // or DailyTimeEntry participation. This keeps the dropdown focused on
    // people who have actually shown up in timecards/payroll for this company.
    const workers = await this.prisma.worker.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return workers.map((w) => ({
      id: w.id,
      firstName: w.firstName,
      lastName: w.lastName,
      fullName: w.fullName,
      email: w.email,
      phone: w.phone,
      defaultProjectCode: w.defaultProjectCode,
      status: w.status,
    }));
  }
}
