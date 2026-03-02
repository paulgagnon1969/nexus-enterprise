export {
  RoleAuditProvider,
  useRoleAudit,
  useRoleAuditSafe,
  ROLE_HIERARCHY,
  ROLE_COLORS,
  ROLE_LABELS,
  CLIENT_ROLE,
  VIEW_ROLE_TO_VISIBILITY,
  canRoleSee,
  type VisibilityRole,
  type ClientRole,
  type AnyRole,
} from "./role-audit-context";

export { RoleAuditLegend } from "./role-audit-legend";
export { RoleVisible, useRoleAuditStyles } from "./role-visible";
