import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class JobStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    let statuses = await this.prisma.jobStatus.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });

    // If none exist, seed a basic default set.
    if (!statuses.length) {
      await this.prisma.jobStatus.createMany({
        data: [
          { code: "OPEN", label: "Open", sortOrder: 1, active: true },
          { code: "CLOSED", label: "Closed", sortOrder: 2, active: true },
          { code: "WARRANTY", label: "Warranty", sortOrder: 3, active: true },
        ],
        skipDuplicates: true,
      });

      statuses = await this.prisma.jobStatus.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      });
    }

    return statuses;
  }

  async upsertStatus(input: { id?: string; code: string; label: string; sortOrder?: number; active?: boolean }) {
    if (input.id) {
      return this.prisma.jobStatus.update({
        where: { id: input.id },
        data: {
          code: input.code,
          label: input.label,
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
        },
      });
    }

    return this.prisma.jobStatus.create({
      data: {
        code: input.code,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true,
      },
    });
  }

  async deleteStatus(id: string) {
    // Soft delete: just mark inactive
    return this.prisma.jobStatus.update({
      where: { id },
      data: { active: false },
    });
  }
}
