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
      defaultPayRate: w.defaultPayRate,
      billRate: w.billRate,
      cpRate: w.cpRate,
      cpRole: w.cpRole,
    }));
  }

  async updateWorkerComp(
    workerId: string,
    input: {
      phone?: string | null;
      defaultPayRate?: number | null;
      billRate?: number | null;
      cpRate?: number | null;
      cpRole?: string | null;
    },
  ) {
    const data: any = {};

    if (input.phone !== undefined) {
      const raw = (input.phone ?? "").toString().trim();
      data.phone = raw || null;
    }

    if (input.defaultPayRate !== undefined) {
      data.defaultPayRate = input.defaultPayRate === null ? null : input.defaultPayRate;
    }

    if (input.billRate !== undefined) {
      data.billRate = input.billRate === null ? null : input.billRate;
    }

    if (input.cpRate !== undefined) {
      data.cpRate = input.cpRate === null ? null : input.cpRate;
    }

    if (input.cpRole !== undefined) {
      const rawRole = (input.cpRole ?? "").toString().trim();
      data.cpRole = rawRole || null;
    }

    const updated = await this.prisma.worker.update({
      where: { id: workerId },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        fullName: true,
        email: true,
        phone: true,
        defaultPayRate: true,
        billRate: true,
        cpRate: true,
        cpRole: true,
      },
    });

    return updated;
  }
}
