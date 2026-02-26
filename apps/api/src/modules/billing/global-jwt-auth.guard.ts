import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../auth/auth.guards";

/**
 * Global JWT auth guard registered as APP_GUARD.
 *
 * - Skips routes/controllers decorated with @Public().
 * - For all other routes, validates the JWT and populates request.user.
 * - Runs BEFORE ModuleGuard / ProjectFeatureGuard so that request.user
 *   is available when entitlement checks execute.
 *
 * Controllers that previously used @UseGuards(JwtAuthGuard) can keep it
 * (it's a no-op if the global guard already authenticated), or remove it
 * over time.
 */
@Injectable()
export class GlobalJwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }
}
