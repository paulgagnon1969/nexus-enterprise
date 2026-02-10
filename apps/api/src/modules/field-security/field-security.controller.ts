import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard, Role, Roles, RolesGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  FieldSecurityService,
  FieldSecurityRoleCode,
  PolicyUpdateInput,
  BatchCheckRequest,
  FIELD_SECURITY_ROLE_HIERARCHY,
} from "./field-security.service";

interface UpdatePolicyDto {
  description?: string;
  permissions: Array<{
    roleCode: string;
    canView?: boolean;
    canEdit?: boolean;
    canExport?: boolean;
  }>;
}

interface BatchCheckDto {
  resourceKeys: string[];
  action: "view" | "edit" | "export";
}

@Controller("field-security")
export class FieldSecurityController {
  constructor(private readonly fieldSecurity: FieldSecurityService) {}

  /**
   * List all field security policies for the current company.
   * Requires at least MEMBER role.
   */
  @UseGuards(JwtAuthGuard)
  @Get("policies")
  async listPolicies(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.fieldSecurity.listPolicies(user.companyId);
  }

  /**
   * Get a specific policy by resource key.
   * Returns null/404-like empty if not found.
   */
  @UseGuards(JwtAuthGuard)
  @Get("policies/:resourceKey")
  async getPolicy(@Req() req: any, @Param("resourceKey") resourceKey: string) {
    const user = req.user as AuthenticatedUser;
    const policy = await this.fieldSecurity.getPolicy(user.companyId, resourceKey);

    if (!policy) {
      // Return default permissions if no custom policy exists
      return {
        resourceKey,
        companyId: user.companyId,
        description: null,
        permissions: this.fieldSecurity.getDefaultPermissions(),
        isDefault: true,
      };
    }

    return { ...policy, isDefault: false };
  }

  /**
   * Create or update a field security policy.
   * Requires ADMIN+ role. Enforces hierarchy - users can only modify
   * permissions for roles at or below their level.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Put("policies/:resourceKey")
  async upsertPolicy(
    @Req() req: any,
    @Param("resourceKey") resourceKey: string,
    @Body() body: UpdatePolicyDto
  ) {
    const user = req.user as AuthenticatedUser;

    // Validate role codes in the request
    const validRoles = new Set(FIELD_SECURITY_ROLE_HIERARCHY);
    const invalidRoles = body.permissions.filter(
      (p) => !validRoles.has(p.roleCode as FieldSecurityRoleCode)
    );
    if (invalidRoles.length > 0) {
      throw new ForbiddenException(
        `Invalid role codes: ${invalidRoles.map((r) => r.roleCode).join(", ")}`
      );
    }

    const input: PolicyUpdateInput = {
      description: body.description,
      permissions: body.permissions.map((p) => ({
        roleCode: p.roleCode as FieldSecurityRoleCode,
        canView: p.canView,
        canEdit: p.canEdit,
        canExport: p.canExport,
      })),
    };

    const policy = await this.fieldSecurity.upsertPolicy(
      user.companyId,
      resourceKey,
      input,
      user
    );

    return policy;
  }

  /**
   * Batch check permissions for multiple resources.
   * Used by the UI to hydrate field permissions on page load.
   */
  @UseGuards(JwtAuthGuard)
  @Post("check")
  async batchCheck(@Req() req: any, @Body() body: BatchCheckDto) {
    const user = req.user as AuthenticatedUser;
    const userRole = this.fieldSecurity.getEffectiveRoleCode(user);

    if (!["view", "edit", "export"].includes(body.action)) {
      throw new ForbiddenException(
        `Invalid action: ${body.action}. Must be one of: view, edit, export`
      );
    }

    const request: BatchCheckRequest = {
      resourceKeys: body.resourceKeys,
      action: body.action,
    };

    const results = await this.fieldSecurity.batchCheckPermissions(
      user.companyId,
      userRole,
      request
    );

    return {
      userRole,
      results,
    };
  }

  /**
   * Check permission for a single resource (convenience endpoint).
   */
  @UseGuards(JwtAuthGuard)
  @Get("check/:resourceKey/:action")
  async checkSingle(
    @Req() req: any,
    @Param("resourceKey") resourceKey: string,
    @Param("action") action: string
  ) {
    const user = req.user as AuthenticatedUser;
    const userRole = this.fieldSecurity.getEffectiveRoleCode(user);

    if (!["view", "edit", "export"].includes(action)) {
      throw new ForbiddenException(
        `Invalid action: ${action}. Must be one of: view, edit, export`
      );
    }

    const allowed = await this.fieldSecurity.checkPermission(
      user.companyId,
      resourceKey,
      userRole,
      action as "view" | "edit" | "export"
    );

    return {
      resourceKey,
      action,
      userRole,
      allowed,
    };
  }

  /**
   * Get the role hierarchy and user's effective role.
   * Useful for the UI to understand what roles the user can modify.
   */
  @UseGuards(JwtAuthGuard)
  @Get("roles")
  async getRoleInfo(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    const userRole = this.fieldSecurity.getEffectiveRoleCode(user);
    const maxModifiableIndex = this.fieldSecurity.getMaxModifiableRoleIndex(userRole);

    return {
      hierarchy: FIELD_SECURITY_ROLE_HIERARCHY,
      userRole,
      canModify: FIELD_SECURITY_ROLE_HIERARCHY.filter((_, i) => i <= maxModifiableIndex),
    };
  }

  /**
   * Get audit log for field security policy changes.
   * Requires ADMIN+ role.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("audit-log")
  async getAuditLog(
    @Req() req: any,
    @Query("policyId") policyId?: string,
    @Query("limit") limitStr?: string
  ) {
    const user = req.user as AuthenticatedUser;
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    return this.fieldSecurity.getAuditLog(user.companyId, {
      policyId: policyId || undefined,
      limit: Number.isNaN(limit) ? 100 : Math.min(limit, 500),
    });
  }
}
