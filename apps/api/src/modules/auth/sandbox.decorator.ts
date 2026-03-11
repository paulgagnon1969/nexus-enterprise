import { SetMetadata } from "@nestjs/common";

export const SANDBOX_RESTRICTED_KEY = "sandboxRestricted";

/**
 * Mark a controller or route handler as restricted in sandbox mode.
 *
 * When the current company is a sandbox tenant, endpoints decorated with
 * `@SandboxRestricted()` will return 403 Forbidden. SUPER_ADMIN bypasses.
 *
 * Usage:
 *   @SandboxRestricted("Projects cannot be deleted in the sandbox")
 *   @Delete(":id")
 *   deleteProject(...) { ... }
 */
export const SandboxRestricted = (reason?: string) =>
  SetMetadata(SANDBOX_RESTRICTED_KEY, reason || "This action is not available in the sandbox");
