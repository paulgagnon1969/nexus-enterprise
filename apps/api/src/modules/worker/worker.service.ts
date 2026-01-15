import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role } from "../auth/auth.guards";

@Injectable()
export class WorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkersForCompany(companyId: string) {
    // Simple list of workers. In some legacy mirrors of the Worker table,
    // certain name columns (fullName vs firstName/lastName) may be missing,
    // and ordering by a non-existent column can cause runtime errors in
    // production even when the Prisma client type-checks locally.
    //
    // To make this robust across environments, we try a preferred ordering
    // first and gracefully fall back if the database schema does not support
    // that column, ultimately returning an unordered list instead of
    // throwing a 500.

    const select = {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      phone: true,
      defaultProjectCode: true,
      status: true,
      primaryClassCode: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      unionLocal: true,
      dateHired: true,
      defaultPayRate: true,
      billRate: true,
      cpRate: true,
      cpRole: true,
    } as const;

    let workers;
    try {
      // Preferred: sort by fullName when available.
      workers = await this.prisma.worker.findMany({
        select,
        orderBy: [{ fullName: "asc" }],
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("listWorkersForCompany: fullName ordering failed, falling back", {
        error: String(err),
      });

      try {
        // Fallback: sort by firstName/lastName.
        workers = await this.prisma.worker.findMany({
          select,
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        });
      } catch (err2) {
        // eslint-disable-next-line no-console
        console.error("listWorkersForCompany: firstName/lastName ordering failed, returning unordered", {
          error: String(err2),
        });

        // Final fallback: no explicit ordering; better than a 500.
        workers = await this.prisma.worker.findMany({ select });
      }
    }

    return workers.map(w => ({
      id: w.id,
      firstName: w.firstName,
      lastName: w.lastName,
      fullName: w.fullName,
      email: w.email,
      phone: w.phone,
      defaultProjectCode: w.defaultProjectCode,
      status: w.status,
      primaryClassCode: w.primaryClassCode,
      addressLine1: w.addressLine1,
      addressLine2: w.addressLine2,
      city: w.city,
      state: w.state,
      postalCode: w.postalCode,
      unionLocal: w.unionLocal,
      dateHired: w.dateHired,
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
      status?: string | null;
      defaultProjectCode?: string | null;
      primaryClassCode?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      unionLocal?: string | null;
      dateHired?: string | null;
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

    const normalizeString = (value: string | null | undefined): string | null | undefined => {
      if (value === undefined) return undefined;
      const raw = (value ?? "").toString().trim();
      return raw || null;
    };

    const setString = (key: string, value: string | null | undefined) => {
      const v = normalizeString(value);
      if (v === undefined) return;
      data[key] = v;
    };

    setString("status", input.status);
    setString("defaultProjectCode", input.defaultProjectCode);
    setString("primaryClassCode", input.primaryClassCode);
    setString("addressLine1", input.addressLine1);
    setString("addressLine2", input.addressLine2);
    setString("city", input.city);
    setString("state", input.state);
    setString("postalCode", input.postalCode);
    setString("unionLocal", input.unionLocal);

    if (input.dateHired !== undefined) {
      if (input.dateHired === null || input.dateHired === "") {
        data.dateHired = null;
      } else {
        const parsed = new Date(input.dateHired as string);
        if (!Number.isNaN(parsed.getTime())) {
          data.dateHired = parsed;
        }
      }
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
        status: true,
        defaultProjectCode: true,
        primaryClassCode: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        unionLocal: true,
        dateHired: true,
        defaultPayRate: true,
        billRate: true,
        cpRate: true,
        cpRole: true,
      },
    });

    return updated;
  }
}
