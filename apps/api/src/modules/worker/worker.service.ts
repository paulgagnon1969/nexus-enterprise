import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role } from "../auth/auth.guards";

@Injectable()
export class WorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkersForCompany(companyId: string) {
    // Simple list of workers. For now we order by fullName since some
    // historical Worker tables in prod may not have firstName/lastName
    // columns, and ordering by those fields can cause runtime errors.
    const workers = await this.prisma.worker.findMany({
      orderBy: [{ fullName: "asc" }],
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
    actor: AuthenticatedUser,
    workerId: string,
    input: {
      phone?: string | null;
      defaultPayRate?: number | null;
      billRate?: number | null;
      cpRate?: number | null;
      cpRole?: string | null;
    },
  ) {
    // Authorization: SUPER_ADMIN anywhere, or Nexus System HR/OWNER/ADMIN in
    // the Nexus System company context.
    const isSuperAdmin = actor.globalRole === GlobalRole.SUPER_ADMIN;

    let isNexusSystemCompany = false;
    if (actor.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: actor.companyId },
        select: { name: true },
      });
      const name = company?.name?.toLowerCase() ?? "";
      isNexusSystemCompany = name === "nexus system";
    }

    const isOwnerOrAdmin = actor.role === Role.OWNER || actor.role === Role.ADMIN;
    const isHrProfile = actor.profileCode === "HR";

    if (!isSuperAdmin && !(isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile))) {
      throw new ForbiddenException("Not allowed to edit worker compensation");
    }

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
