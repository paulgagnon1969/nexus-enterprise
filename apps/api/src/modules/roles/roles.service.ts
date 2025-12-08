import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RoleProfile, PermissionResource, RolePermission, Role } from "@prisma/client";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listProfilesForCompany(companyId: string) {
    // NCC standard profiles (companyId null) plus company-specific custom profiles
    return this.prisma.roleProfile.findMany({
      where: {
        OR: [{ companyId: null }, { companyId }],
        active: true,
      },
      orderBy: [{ isStandard: "desc" }, { label: "asc" }],
    });
  }

  async getProfileWithPermissions(profileId: string) {
    const profile = await this.prisma.roleProfile.findUnique({
      where: { id: profileId },
      include: {
        permissions: true,
      },
    });
    return profile;
  }

  async listResources() {
    return this.prisma.permissionResource.findMany({
      where: { active: true },
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });
  }
}
