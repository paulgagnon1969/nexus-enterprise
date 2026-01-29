import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role } from "../auth/auth.guards";
import { getMarketWageBandsForWorker } from "@repo/database";

@Injectable()
export class WorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkersForCompany(companyId: string) {
    // NOTE: In production we may be talking to a legacy mirror of the Worker
    // table whose physical columns do not exactly match the Prisma schema
    // (e.g. some columns may be missing or named differently). Direct
    // `prisma.worker.findMany` calls can therefore throw runtime errors like
    // "The column (not available) does not exist" even though the table and
    // data are present.
    //
    // To make /workers robust across environments, we:
    //   1) Introspect information_schema.columns for the "Worker" table.
    //   2) Dynamically construct a minimal SELECT that only references
    //      columns that actually exist (id + some form of name).
    //   3) Return a lightweight DTO suitable for dropdowns and lookups.
    //
    // We intentionally do not depend on any specific set of columns beyond
    // "id" and at least one of (fullName, firstName, lastName).

    type ColumnRow = { column_name: string };

    let columns: ColumnRow[] = [];
    try {
      columns = await this.prisma.$queryRaw<ColumnRow[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'Worker'
      `;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("listWorkersForCompany: failed to introspect Worker columns", {
        error: String(err),
      });
      return [];
    }

    if (!columns.length) {
      // eslint-disable-next-line no-console
      console.error("listWorkersForCompany: no columns found for Worker table");
      return [];
    }

    const colNames = new Set(columns.map(c => c.column_name));
    const findCol = (name: string): string | null => {
      if (colNames.has(name)) return name;
      const lower = name.toLowerCase();
      const match = columns.find(c => c.column_name.toLowerCase() === lower);
      return match?.column_name ?? null;
    };

    const idCol = findCol("id");
    if (!idCol) {
      // eslint-disable-next-line no-console
      console.error("listWorkersForCompany: Worker table is missing id column");
      return [];
    }

    const fullNameCol = findCol("fullName");
    const firstNameCol = findCol("firstName");
    const lastNameCol = findCol("lastName");

    // Build a best-effort expression for the display name.
    const nameExprParts: string[] = [];
    if (fullNameCol) {
      nameExprParts.push(`"${fullNameCol}"`);
    } else {
      if (firstNameCol) {
        nameExprParts.push(`COALESCE("${firstNameCol}", '')`);
      }
      if (lastNameCol) {
        nameExprParts.push(`COALESCE("${lastNameCol}", '')`);
      }
    }

    const nameExpr = nameExprParts.length
      ? nameExprParts.join(` || ' ' || `)
      : `''`;

    const sql = `SELECT "${idCol}" AS "id", ${nameExpr} AS "fullName" FROM "Worker" ORDER BY ${nameExpr} ASC`;

    type Row = { id: string; fullName: string | null };
    let rows: Row[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows = await this.prisma.$queryRawUnsafe<Row[]>(sql as any);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("listWorkersForCompany: raw Worker query failed", {
        error: String(err),
      });
      return [];
    }

    return rows.map(r => {
      const nameFromRow = (r.fullName ?? "").trim();
      const fullName = nameFromRow || r.id;
      return {
        id: r.id,
        firstName: null,
        lastName: null,
        fullName,
        email: null,
        phone: null,
        defaultProjectCode: null,
        status: null,
        primaryClassCode: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        unionLocal: null,
        dateHired: null,
        defaultPayRate: null,
        billRate: null,
        cpRate: null,
        cpRole: null,
      };
    });
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
      defaultHoursPerDay?: number | null;
      billRate?: number | null;
      cpRate?: number | null;
      cpRole?: string | null;
      cpFringeRate?: number | null;
    },
  ) {
    // Authorization (BETA intent):
    // - SUPER_ADMIN can edit anywhere.
    // - Nexus System HR / OWNER / ADMIN can edit while in the Nexus System context.
    // - Tenant OWNER/ADMIN can edit for their tenant.
    // - Tenant HR/FINANCE/EXECUTIVE profiles can edit for their tenant.
    //
    // Because Worker is a global table, tenant edits must be scoped to workers
    // that are actually associated with the tenant (via a User email + CompanyMembership).
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
    const isFinanceProfile = actor.profileCode === "FINANCE";
    const isExecutiveProfile = actor.profileCode === "EXECUTIVE";

    const canEditInNexusSystem = isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile);
    const canEditInTenant = isOwnerOrAdmin || isHrProfile || isFinanceProfile || isExecutiveProfile;

    if (!isSuperAdmin && !canEditInNexusSystem && !canEditInTenant) {
      throw new ForbiddenException("Not allowed to edit worker compensation");
    }

    // Tenant scoping: only allow editing Worker rows that map to a tenant member.
    // SUPER_ADMIN and Nexus System privileged users can bypass this.
    if (!isSuperAdmin && !canEditInNexusSystem) {
      const worker = await (this.prisma as any).worker.findUnique({
        where: { id: workerId },
        select: { email: true },
      });

      const email = (worker?.email || "").trim().toLowerCase();
      if (!email) {
        throw new ForbiddenException(
          "Not allowed to edit this worker: no email is associated to a tenant user",
        );
      }

      const user = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });

      if (!user) {
        throw new ForbiddenException(
          "Not allowed to edit this worker: no tenant user exists for this email",
        );
      }

      const membership = await this.prisma.companyMembership.findUnique({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: actor.companyId,
          },
        },
        select: { userId: true },
      });

      if (!membership) {
        throw new ForbiddenException(
          "Not allowed to edit this worker: they are not a member of your company",
        );
      }
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

    if (input.defaultHoursPerDay !== undefined) {
      data.defaultHoursPerDay =
        input.defaultHoursPerDay === null ? null : input.defaultHoursPerDay;
    }

    if (input.billRate !== undefined) {
      data.billRate = input.billRate === null ? null : input.billRate;
    }

    if (input.cpRate !== undefined) {
      data.cpRate = input.cpRate === null ? null : input.cpRate;
    }

    if (input.cpFringeRate !== undefined) {
      data.cpFringeRate =
        input.cpFringeRate === null ? null : input.cpFringeRate;
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
        defaultHoursPerDay: true,
        billRate: true,
        cpRate: true,
        cpRole: true,
        cpFringeRate: true,
      },
    });

    return updated;
  }

  async getWorkerMarketComp(actor: AuthenticatedUser, workerId: string) {
    // Authorization mirrors updateWorkerComp (BETA intent):
    // - SUPER_ADMIN can view anywhere.
    // - Nexus System HR / OWNER / ADMIN can view while in the Nexus System context.
    // - Tenant OWNER/ADMIN/HR/FINANCE/EXECUTIVE can view for their tenant.
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
    const isFinanceProfile = actor.profileCode === "FINANCE";
    const isExecutiveProfile = actor.profileCode === "EXECUTIVE";
    const isPmProfile = actor.profileCode === "PM" || actor.profileCode === "PM_OWNER";

    const canViewInNexusSystem = isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile);

    // View-only: PMs can see compensation for workers in their tenant so they can
    // staff jobs and plan labor. Editing remains restricted to OWNER/ADMIN/HR/FINANCE/EXECUTIVE.
    const canViewInTenant =
      isOwnerOrAdmin || isHrProfile || isFinanceProfile || isExecutiveProfile || isPmProfile;

    if (!isSuperAdmin && !canViewInNexusSystem && !canViewInTenant) {
      throw new ForbiddenException("Not allowed to view worker market compensation");
    }

    // Tenant scoping (same reason as updateWorkerComp).
    if (!isSuperAdmin && !canViewInNexusSystem) {
      const worker = await (this.prisma as any).worker.findUnique({
        where: { id: workerId },
        select: { email: true },
      });

      const email = (worker?.email || "").trim().toLowerCase();
      if (!email) {
        throw new ForbiddenException(
          "Not allowed to view this worker: no email is associated to a tenant user",
        );
      }

      const user = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });

      if (!user) {
        throw new ForbiddenException(
          "Not allowed to view this worker: no tenant user exists for this email",
        );
      }

      const membership = await this.prisma.companyMembership.findUnique({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: actor.companyId,
          },
        },
        select: { userId: true },
      });

      if (!membership) {
        throw new ForbiddenException(
          "Not allowed to view this worker: they are not a member of your company",
        );
      }
    }

    const worker = await this.prisma.worker.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        fullName: true,
        state: true,
        primaryClassCode: true,
        cpRole: true,
        defaultPayRate: true,
        cpRate: true,
        cpFringeRate: true,
      },
    });

    if (!worker) {
      throw new NotFoundException("Worker not found");
    }

    const stateCode = (worker.state ?? "").trim();
    if (!stateCode) {
      return {
        worker: {
          id: worker.id,
          name: (() => {
            const fallback = [worker.firstName, worker.lastName]
              .filter(Boolean)
              .join(" ");
            const rawName = worker.fullName ?? fallback;
            return rawName || null;
          })(),
          state: worker.state,
          primaryClassCode: worker.primaryClassCode,
          cpRole: worker.cpRole,
          baseHourly: worker.defaultPayRate ?? null,
          cpHourly: worker.cpRate ?? null,
          cpFringeHourly: worker.cpFringeRate ?? null,
          cpTotalHourly:
            worker.cpRate != null || worker.cpFringeRate != null
              ? (worker.cpRate ?? 0) + (worker.cpFringeRate ?? 0)
              : null,
        },
        market: null,
        comparisons: null,
        message: "Worker state is not set; cannot compute market comparison",
      };
    }

    const market = await getMarketWageBandsForWorker({
      stateCode,
      cpRole: worker.cpRole,
      workerClassCode: worker.primaryClassCode,
    });

    if (!market) {
      return {
        worker: {
          id: worker.id,
          name: (() => {
            const fallback = [worker.firstName, worker.lastName]
              .filter(Boolean)
              .join(" ");
            const rawName = worker.fullName ?? fallback;
            return rawName || null;
          })(),
          state: worker.state,
          primaryClassCode: worker.primaryClassCode,
          cpRole: worker.cpRole,
          baseHourly: worker.defaultPayRate ?? null,
          cpHourly: worker.cpRate ?? null,
          cpFringeHourly: worker.cpFringeRate ?? null,
          cpTotalHourly:
            worker.cpRate != null || worker.cpFringeRate != null
              ? (worker.cpRate ?? 0) + (worker.cpFringeRate ?? 0)
              : null,
        },
        market: null,
        comparisons: null,
        message:
          "No state occupational wage data found for this worker's classification",
      };
    }

    const workerBase = worker.defaultPayRate ?? null;
    const workerCpTotal =
      worker.cpRate != null || worker.cpFringeRate != null
        ? (worker.cpRate ?? 0) + (worker.cpFringeRate ?? 0)
        : null;

    const delta = (val: number | null, ref: number | null): number | null => {
      if (val == null || ref == null) return null;
      return val - ref;
    };

    return {
      worker: {
        id: worker.id,
        name: (() => {
          const fallback = [worker.firstName, worker.lastName]
            .filter(Boolean)
            .join(" ");
          const rawName = worker.fullName ?? fallback;
          return rawName || null;
        })(),
        state: worker.state,
        primaryClassCode: worker.primaryClassCode,
        cpRole: worker.cpRole,
        baseHourly: workerBase,
        cpHourly: worker.cpRate ?? null,
        cpFringeHourly: worker.cpFringeRate ?? null,
        cpTotalHourly: workerCpTotal,
      },
      market,
      comparisons: {
        baseVsMedian: delta(workerBase, market.hourlyMedian),
        baseVsP25: delta(workerBase, market.hourlyP25),
        baseVsP75: delta(workerBase, market.hourlyP75),
        cpTotalVsMedian: delta(workerCpTotal, market.hourlyMedian),
      },
    };
  }
}
