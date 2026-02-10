import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { getEffectiveRoleLevel, PROFILE_LEVELS, ROLE_LEVELS, GLOBAL_ROLE_LEVELS, GlobalRole, Role } from "../auth/auth.guards";

/**
 * Role hierarchy for field-level security.
 * Each role can only modify permissions for roles at or below its level.
 */
export const FIELD_SECURITY_ROLE_HIERARCHY = [
  "CLIENT",
  "CREW",
  "FOREMAN",
  "SUPER",
  "PM",
  "EXECUTIVE",
  "ADMIN",
  "OWNER",
  "SUPER_ADMIN",
] as const;

export type FieldSecurityRoleCode = (typeof FIELD_SECURITY_ROLE_HIERARCHY)[number];

const ROLE_INDEX = Object.fromEntries(
  FIELD_SECURITY_ROLE_HIERARCHY.map((r, i) => [r, i])
) as Record<FieldSecurityRoleCode, number>;

export interface FieldPermission {
  roleCode: FieldSecurityRoleCode;
  canView: boolean;
  canEdit: boolean;
  canExport: boolean;
}

export interface FieldPolicy {
  id: string;
  companyId: string;
  resourceKey: string;
  description: string | null;
  permissions: FieldPermission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyUpdateInput {
  description?: string;
  permissions: Array<{
    roleCode: FieldSecurityRoleCode;
    canView?: boolean;
    canEdit?: boolean;
    canExport?: boolean;
  }>;
}

export interface BatchCheckRequest {
  resourceKeys: string[];
  action: "view" | "edit" | "export";
}

export interface BatchCheckResult {
  resourceKey: string;
  allowed: boolean;
}

@Injectable()
export class FieldSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the effective role code for a user based on their company role,
   * global role, and profile code.
   */
  getEffectiveRoleCode(user: AuthenticatedUser): FieldSecurityRoleCode {
    // SUPER_ADMIN always maps to SUPER_ADMIN
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      return "SUPER_ADMIN";
    }

    // Map company role to field security role
    const roleMap: Record<Role, FieldSecurityRoleCode> = {
      [Role.OWNER]: "OWNER",
      [Role.ADMIN]: "ADMIN",
      [Role.MEMBER]: "CREW", // Default for MEMBER, refined by profile
      [Role.CLIENT]: "CLIENT",
    };

    let effectiveRole: FieldSecurityRoleCode = roleMap[user.role] ?? "CLIENT";

    // Refine based on profile code if present
    if (user.profileCode) {
      const profileRoleMap: Record<string, FieldSecurityRoleCode> = {
        EXECUTIVE: "EXECUTIVE",
        PM: "PM",
        SUPERINTENDENT: "SUPER",
        FOREMAN: "FOREMAN",
        CREW: "CREW",
        CLIENT_OWNER: "CLIENT",
        CLIENT_REP: "CLIENT",
      };
      if (profileRoleMap[user.profileCode]) {
        effectiveRole = profileRoleMap[user.profileCode];
      }
    }

    return effectiveRole;
  }

  /**
   * Get the maximum role level a user can modify.
   * Users can only modify permissions for roles at or below their level.
   */
  getMaxModifiableRoleIndex(userRole: FieldSecurityRoleCode): number {
    return ROLE_INDEX[userRole] ?? 0;
  }

  /**
   * Check if a user can modify a specific role's permissions.
   */
  canModifyRole(userRole: FieldSecurityRoleCode, targetRole: FieldSecurityRoleCode): boolean {
    const userIndex = ROLE_INDEX[userRole] ?? 0;
    const targetIndex = ROLE_INDEX[targetRole] ?? 0;
    return userIndex >= targetIndex;
  }

  /**
   * List all field security policies for a company.
   */
  async listPolicies(companyId: string): Promise<FieldPolicy[]> {
    const policies = await this.prisma.fieldSecurityPolicy.findMany({
      where: { companyId },
      include: { permissions: true },
      orderBy: { resourceKey: "asc" },
    });

    return policies.map((p) => ({
      id: p.id,
      companyId: p.companyId,
      resourceKey: p.resourceKey,
      description: p.description,
      permissions: p.permissions.map((perm) => ({
        roleCode: perm.roleCode as FieldSecurityRoleCode,
        canView: perm.canView,
        canEdit: perm.canEdit,
        canExport: perm.canExport,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * Get a specific policy by resource key, or null if not found.
   */
  async getPolicy(companyId: string, resourceKey: string): Promise<FieldPolicy | null> {
    const policy = await this.prisma.fieldSecurityPolicy.findFirst({
      where: { companyId, resourceKey },
      include: { permissions: true },
    });

    if (!policy) return null;

    return {
      id: policy.id,
      companyId: policy.companyId,
      resourceKey: policy.resourceKey,
      description: policy.description,
      permissions: policy.permissions.map((perm: any) => ({
        roleCode: perm.roleCode as FieldSecurityRoleCode,
        canView: perm.canView,
        canEdit: perm.canEdit,
        canExport: perm.canExport,
      })),
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  /**
   * Get default permissions for a resource (when no policy exists).
   * Default: all roles can view/export, only PM+ can edit.
   */
  getDefaultPermissions(): FieldPermission[] {
    const pmIndex = ROLE_INDEX["PM"];
    return FIELD_SECURITY_ROLE_HIERARCHY.map((roleCode, index) => ({
      roleCode,
      canView: true,
      canEdit: index >= pmIndex,
      canExport: true,
    }));
  }

  /**
   * Create or update a policy. Returns the updated policy.
   * Enforces role hierarchy - user can only modify roles at or below their level.
   */
  async upsertPolicy(
    companyId: string,
    resourceKey: string,
    input: PolicyUpdateInput,
    actor: AuthenticatedUser
  ): Promise<FieldPolicy> {
    const actorRole = this.getEffectiveRoleCode(actor);
    const maxModifiableIndex = this.getMaxModifiableRoleIndex(actorRole);

    // Filter out permission changes for roles above the actor's level
    const allowedPermissions = input.permissions.filter((p) => {
      const targetIndex = ROLE_INDEX[p.roleCode] ?? 999;
      return targetIndex <= maxModifiableIndex;
    });

    // Get existing policy for audit log
    const existing = await this.prisma.fieldSecurityPolicy.findFirst({
      where: { companyId, resourceKey },
      include: { permissions: true },
    });

    const previousJson = existing
      ? {
          description: existing.description,
          permissions: existing.permissions.map((p: any) => ({
            roleCode: p.roleCode,
            canView: p.canView,
            canEdit: p.canEdit,
            canExport: p.canExport,
          })),
        }
      : null;

    // Create or update the policy
    let policy: any;
    if (existing) {
      // Delete existing permissions for the roles we're updating
      await this.prisma.fieldSecurityPermission.deleteMany({
        where: {
          policyId: existing.id,
          roleCode: { in: allowedPermissions.map((p) => p.roleCode) },
        },
      });

      // Create new permissions
      await this.prisma.fieldSecurityPermission.createMany({
        data: allowedPermissions.map((p) => ({
          policyId: existing.id,
          roleCode: p.roleCode,
          canView: p.canView ?? true,
          canEdit: p.canEdit ?? false,
          canExport: p.canExport ?? true,
        })),
      });

      // Update policy description
      policy = await this.prisma.fieldSecurityPolicy.update({
        where: { id: existing.id },
        data: { description: input.description ?? undefined },
        include: { permissions: true },
      });
    } else {
      // Create new policy with permissions
      policy = await this.prisma.fieldSecurityPolicy.create({
        data: {
          companyId,
          resourceKey,
          description: input.description ?? null,
          permissions: {
            create: allowedPermissions.map((p) => ({
              roleCode: p.roleCode,
              canView: p.canView ?? true,
              canEdit: p.canEdit ?? false,
              canExport: p.canExport ?? true,
            })),
          },
        },
        include: { permissions: true },
      });
    }

    // Write audit log
    const newJson = {
      description: policy.description,
      permissions: policy.permissions.map((p: any) => ({
        roleCode: p.roleCode,
        canView: p.canView,
        canEdit: p.canEdit,
        canExport: p.canExport,
      })),
    };

    await this.prisma.fieldSecurityAuditLog.create({
      data: {
        companyId,
        policyId: policy.id,
        resourceKey,
        action: existing ? "UPDATE" : "CREATE",
        actorUserId: actor.userId,
        actorEmail: actor.email,
        previousJson: previousJson ?? undefined,
        newJson,
      },
    });

    return {
      id: policy.id,
      companyId: policy.companyId,
      resourceKey: policy.resourceKey,
      description: policy.description,
      permissions: policy.permissions.map((perm: any) => ({
        roleCode: perm.roleCode as FieldSecurityRoleCode,
        canView: perm.canView,
        canEdit: perm.canEdit,
        canExport: perm.canExport,
      })),
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  /**
   * Check if a user has permission for a specific action on a resource.
   */
  async checkPermission(
    companyId: string,
    resourceKey: string,
    userRole: FieldSecurityRoleCode,
    action: "view" | "edit" | "export"
  ): Promise<boolean> {
    const policy = await this.getPolicy(companyId, resourceKey);

    // If no policy exists, use defaults
    const permissions = policy?.permissions ?? this.getDefaultPermissions();

    const rolePerm = permissions.find((p) => p.roleCode === userRole);
    if (!rolePerm) {
      // Role not in permissions, check if higher role has permission
      const roleIndex = ROLE_INDEX[userRole];
      const higherRolePerm = permissions.find((p) => {
        const permIndex = ROLE_INDEX[p.roleCode];
        return permIndex <= roleIndex;
      });
      if (higherRolePerm) {
        // Higher roles inherit lower role permissions
        switch (action) {
          case "view":
            return higherRolePerm.canView;
          case "edit":
            return higherRolePerm.canEdit;
          case "export":
            return higherRolePerm.canExport;
        }
      }
      // Default allow view/export, deny edit
      return action !== "edit";
    }

    switch (action) {
      case "view":
        return rolePerm.canView;
      case "edit":
        return rolePerm.canEdit;
      case "export":
        return rolePerm.canExport;
      default:
        return false;
    }
  }

  /**
   * Batch check permissions for multiple resources.
   */
  async batchCheckPermissions(
    companyId: string,
    userRole: FieldSecurityRoleCode,
    request: BatchCheckRequest
  ): Promise<BatchCheckResult[]> {
    const results: BatchCheckResult[] = [];

    for (const resourceKey of request.resourceKeys) {
      const allowed = await this.checkPermission(
        companyId,
        resourceKey,
        userRole,
        request.action
      );
      results.push({ resourceKey, allowed });
    }

    return results;
  }

  /**
   * Get audit log entries for a company (optionally filtered by policy).
   */
  async getAuditLog(
    companyId: string,
    opts?: { policyId?: string; limit?: number }
  ) {
    return this.prisma.fieldSecurityAuditLog.findMany({
      where: {
        companyId,
        policyId: opts?.policyId ?? undefined,
      },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 100,
    });
  }
}
