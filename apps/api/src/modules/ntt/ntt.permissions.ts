import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole } from "../auth/auth.guards";
import type { NttStatus, NttSubjectType } from "@prisma/client";

export function isNexusSystemPrivileged(user: AuthenticatedUser): boolean {
  return (
    user.globalRole === GlobalRole.SUPER_ADMIN ||
    user.globalRole === GlobalRole.SUPPORT
  );
}

export function canReadNttTicket(
  user: AuthenticatedUser,
  ticket: { initiatorUserId: string },
): boolean {
  if (ticket.initiatorUserId === user.userId) return true;
  if (isNexusSystemPrivileged(user)) return true;
  return false;
}

export function canManageNttTicket(user: AuthenticatedUser): boolean {
  return isNexusSystemPrivileged(user);
}

export function canPublishFaqFromNtt(user: AuthenticatedUser): boolean {
  return isNexusSystemPrivileged(user);
}
