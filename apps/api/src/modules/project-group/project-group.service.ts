import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { Role } from "../auth/auth.guards";

@Injectable()
export class ProjectGroupService {
  constructor(private readonly prisma: PrismaService) {}

  private async getAccessibleProjectIdsForGroup(
    actor: AuthenticatedUser,
    groupId: string,
  ): Promise<{ companyId: string; projectIds: string[] }> {
    const group = await this.prisma.projectGroup.findFirst({
      where: { id: groupId },
      select: { id: true, companyId: true },
    });

    if (!group) {
      throw new NotFoundException("Project group not found");
    }

    if (group.companyId !== actor.companyId) {
      throw new NotFoundException("Project group not found");
    }

    const projects = await this.prisma.project.findMany({
      where: { companyId: group.companyId, groupId },
      select: { id: true },
    });

    const allProjectIds = projects.map((p) => p.id);
    if (!allProjectIds.length) {
      return { companyId: group.companyId, projectIds: [] };
    }

    // Company OWNER/ADMIN can see all projects in the group.
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return { companyId: group.companyId, projectIds: allProjectIds };
    }

    // Other roles: restrict to projects where the user is a member.
    const accessible = await this.prisma.project.findMany({
      where: {
        id: { in: allProjectIds },
        companyId: group.companyId,
        memberships: {
          some: {
            userId: actor.userId,
            companyId: actor.companyId,
          },
        },
      },
      select: { id: true },
    });

    return { companyId: group.companyId, projectIds: accessible.map((p) => p.id) };
  }

  async getGroupEmployees(actor: AuthenticatedUser, groupId: string) {
    const { companyId, projectIds } = await this.getAccessibleProjectIdsForGroup(
      actor,
      groupId,
    );

    if (!projectIds.length) {
      return [];
    }

    const records = await this.prisma.payrollWeekRecord.findMany({
      where: { companyId, projectId: { in: projectIds } },
      select: {
        projectId: true,
        projectCode: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        ssn: true,
        classCode: true,
        weekEndDate: true,
        totalHoursSt: true,
        totalHoursOt: true,
        totalHoursDt: true,
      },
    });

    type Agg = {
      firstName: string | null;
      lastName: string | null;
      employeeId: string | null;
      ssnLast4: string | null;
      classCode: string | null;
      totalHours: number;
      firstWeekEnd: Date | null;
      lastWeekEnd: Date | null;
      projectCodes: Set<string>;
    };

    const byKey = new Map<string, Agg>();

    for (const r of records) {
      const keyParts = [
        r.employeeId ?? "",
        (r.firstName ?? "").trim().toUpperCase(),
        (r.lastName ?? "").trim().toUpperCase(),
        r.ssn ?? "",
      ];
      const key = keyParts.join("|");
      const existing = byKey.get(key);

      const hoursSt = r.totalHoursSt ?? 0;
      const hoursOt = r.totalHoursOt ?? 0;
      const hoursDt = r.totalHoursDt ?? 0;
      const hours = hoursSt + hoursOt + hoursDt;

      const ssnLast4 = r.ssn && r.ssn.length >= 4 ? r.ssn.slice(-4) : null;
      const projectCode = (r.projectCode ?? "").trim() || "";

      if (!existing) {
        const codes = new Set<string>();
        if (projectCode) codes.add(projectCode);
        byKey.set(key, {
          firstName: r.firstName ?? null,
          lastName: r.lastName ?? null,
          employeeId: r.employeeId ?? null,
          ssnLast4,
          classCode: r.classCode ?? null,
          totalHours: hours,
          firstWeekEnd: r.weekEndDate,
          lastWeekEnd: r.weekEndDate,
          projectCodes: codes,
        });
      } else {
        existing.totalHours += hours;
        if (!existing.classCode && r.classCode) {
          existing.classCode = r.classCode;
        }
        if (!existing.firstWeekEnd || r.weekEndDate < existing.firstWeekEnd) {
          existing.firstWeekEnd = r.weekEndDate;
        }
        if (!existing.lastWeekEnd || r.weekEndDate > existing.lastWeekEnd) {
          existing.lastWeekEnd = r.weekEndDate;
        }
        if (projectCode) {
          existing.projectCodes.add(projectCode);
        }
      }
    }

    const result = Array.from(byKey.values()).map((agg) => ({
      firstName: agg.firstName,
      lastName: agg.lastName,
      employeeId: agg.employeeId,
      ssnLast4: agg.ssnLast4,
      classCode: agg.classCode,
      totalHours: agg.totalHours,
      firstWeekEnd: agg.firstWeekEnd?.toISOString() ?? null,
      lastWeekEnd: agg.lastWeekEnd?.toISOString() ?? null,
      projects: Array.from(agg.projectCodes.values()).sort(),
    }));

    result.sort((a, b) => {
      const aLast = (a.lastName ?? "").toLowerCase();
      const bLast = (b.lastName ?? "").toLowerCase();
      if (aLast < bLast) return -1;
      if (aLast > bLast) return 1;
      const aFirst = (a.firstName ?? "").toLowerCase();
      const bFirst = (b.firstName ?? "").toLowerCase();
      if (aFirst < bFirst) return -1;
      if (aFirst > bFirst) return 1;
      return 0;
    });

    return result;
  }
}
