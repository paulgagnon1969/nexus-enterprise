import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EntitlementService } from "./entitlement.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

const REQUIRED_MODULE_KEY = "requiredModule";

/**
 * Decorator: mark a controller or handler as requiring a specific NCC module.
 *
 * Can be applied at the class level (gates the entire controller) or at
 * individual handler methods. Handler-level takes precedence over class-level.
 *
 * Usage:
 *   @RequiresModule('ESTIMATING')
 *   @Controller('estimates')
 *   export class EstimatesController { ... }
 */
export const RequiresModule = (moduleCode: string) =>
  SetMetadata(REQUIRED_MODULE_KEY, moduleCode);

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check handler first, then fall back to class-level decorator
    const requiredModule = this.reflector.getAllAndOverride<string>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @RequiresModule decorator, allow through
    if (!requiredModule) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new ForbiddenException("Authentication required");
    }

    const enabled = await this.entitlements.isModuleEnabled(
      user.companyId,
      requiredModule,
    );

    if (!enabled) {
      throw new ForbiddenException(
        `Module '${requiredModule}' is not included in your membership. Enable it from Settings → Membership.`,
      );
    }

    return true;
  }
}
