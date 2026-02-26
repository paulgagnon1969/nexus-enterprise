import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EntitlementService } from "./entitlement.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

const REQUIRED_MODULE_KEY = "requiredModule";

/**
 * Decorator: mark a controller method as requiring a specific NCC module.
 *
 * Usage:
 *   @RequiresModule('ESTIMATING')
 *   @UseGuards(JwtAuthGuard, ModuleGuard)
 *   @Get('estimates')
 *   listEstimates() { ... }
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
    const requiredModule = this.reflector.get<string>(
      REQUIRED_MODULE_KEY,
      context.getHandler(),
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
