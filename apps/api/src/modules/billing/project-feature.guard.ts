import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EntitlementService } from "./entitlement.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

const REQUIRED_PROJECT_FEATURE_KEY = "requiredProjectFeature";

/**
 * Decorator: mark a controller or handler as requiring a per-project feature unlock.
 *
 * The guard extracts `projectId` from the route params (`:projectId` or `:id`)
 * and checks if a `ProjectFeatureUnlock` record exists for the company+project.
 *
 * Usage:
 *   @RequiresProjectFeature('XACT_IMPORT')
 *   @Controller('projects/:projectId/import-jobs')
 *   export class ImportJobsController { ... }
 */
export const RequiresProjectFeature = (featureCode: string) =>
  SetMetadata(REQUIRED_PROJECT_FEATURE_KEY, featureCode);

@Injectable()
export class ProjectFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      REQUIRED_PROJECT_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @RequiresProjectFeature decorator, allow through
    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new ForbiddenException("Authentication required");
    }

    // Extract projectId from route params — supports :projectId or :id
    const projectId = request.params?.projectId || request.params?.id;
    if (!projectId) {
      throw new ForbiddenException("Project context required for this feature");
    }

    const unlocked = await this.entitlements.isProjectFeatureUnlocked(
      user.companyId,
      projectId,
      requiredFeature,
    );

    if (!unlocked) {
      throw new ForbiddenException(
        `Feature '${requiredFeature}' has not been unlocked for this project. ` +
        `Unlock it from Project Settings to continue.`,
      );
    }

    return true;
  }
}
