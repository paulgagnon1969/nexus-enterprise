import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";

// Local canonical role enums for the API. These are no longer sourced from
// @prisma/client so that auth semantics are decoupled from the database schema.
export enum Role {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
  CLIENT = "CLIENT",
}

export enum GlobalRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  SUPPORT = "SUPPORT",
  NONE = "NONE",
}

export class JwtAuthGuard extends AuthGuard("jwt") {}

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const GLOBAL_ROLES_KEY = "globalRoles";
export const GlobalRoles = (...roles: GlobalRole[]) =>
  SetMetadata(GLOBAL_ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: Role } | undefined;

    if (!user?.role) return false;

    return requiredRoles.includes(user.role);
  }
}

@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<GlobalRole[]>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { globalRole?: GlobalRole } | undefined;

    if (!user?.globalRole) return false;

    return required.includes(user.globalRole);
  }
}

// --- Role hierarchy helper for app-level RBAC ---

// Higher numbers == more authority.
export const ROLE_LEVELS: Record<Role, number> = {
  [Role.OWNER]: 90,
  [Role.ADMIN]: 80,
  [Role.MEMBER]: 40,
  [Role.CLIENT]: 10,
};

export const GLOBAL_ROLE_LEVELS: Record<GlobalRole, number> = {
  [GlobalRole.SUPER_ADMIN]: 100,
  [GlobalRole.SUPPORT]: 85,
  [GlobalRole.NONE]: 0,
};

// Profile codes (when present) refine MEMBER-level authority.
export const PROFILE_LEVELS: Record<string, number> = {
  EXECUTIVE: 70,
  PM: 60,
  HR: 55,
  FINANCE: 55,
  FOREMAN: 50,
  CREW: 40,
  CLIENT_OWNER: 20,
  CLIENT_REP: 20,
};

export function getEffectiveRoleLevel(opts: {
  globalRole?: GlobalRole | null;
  role?: Role | null;
  profileCode?: string | null;
}): number {
  const { globalRole, role, profileCode } = opts;

  const globalLevel = globalRole ? GLOBAL_ROLE_LEVELS[globalRole] ?? 0 : 0;
  if (globalLevel >= GLOBAL_ROLE_LEVELS[GlobalRole.SUPER_ADMIN]) {
    // SUPER_ADMIN always wins.
    return globalLevel;
  }

  const baseLevel = role ? ROLE_LEVELS[role] ?? 0 : 0;

  const profileLevel = profileCode ? PROFILE_LEVELS[profileCode] ?? 0 : 0;

  return Math.max(globalLevel, baseLevel, profileLevel);
}
