import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AssetRepository, OwnershipFilter } from "../../infra/prisma-v1/asset.repository";
import { AssetDeploymentService } from "./asset-deployment.service";
import { AssetType, AssetOwnershipType, AssetSharingVisibility } from "@prisma/client";
import { RequiresModule } from "../billing/module.guard";

@RequiresModule('ASSETS')
@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetController {
  constructor(
    private readonly assets: AssetRepository,
    private readonly deployment: AssetDeploymentService,
  ) {}

  @Get()
  async listForCompany(
    @Req() req: any,
    @Query("assetType") assetType?: AssetType,
    @Query("isActive") isActive?: string,
    @Query("search") search?: string,
    @Query("ownershipFilter") ownershipFilter?: OwnershipFilter,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.assets.listAssetsForCompany(user.companyId, user.userId, {
      assetType,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
      search,
      ownershipFilter,
    });
  }

  @Get("my-assets")
  async myAssets(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.assets.listAssetsForCompany(user.companyId, user.userId, {
      ownershipFilter: "MY_ASSETS",
    });
  }

  @Get("project-summary")
  async projectSummary(
    @Req() req: any,
    @Query("projectId") projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.assets.getProjectEquipmentSummary(user.companyId, projectId);
  }

  @Get(":id")
  async getById(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.assets.getAssetById(user.companyId, id);
  }

  @Get(":id/cost-summary")
  async costSummary(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.assets.getCostSummary(user.companyId, id);
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: {
      name: string;
      code?: string | null;
      description?: string | null;
      assetType: AssetType;
      baseUnit?: string | null;
      baseRate?: string | null;
      costBreakdown?: any;
      manufacturer?: string | null;
      model?: string | null;
      serialNumberOrVin?: string | null;
      year?: number | null;
      isTrackable?: boolean;
      isConsumable?: boolean;
      currentLocationId?: string | null;
      ownershipType?: AssetOwnershipType;
      ownerId?: string | null;
      sharingVisibility?: AssetSharingVisibility;
      maintenanceAssigneeId?: string | null;
      maintenancePoolId?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    // If creating a personal asset without explicit ownerId, default to current user
    const ownerId = body.ownershipType === "PERSONAL" && !body.ownerId ? user.userId : body.ownerId;
    return this.assets.createAsset({
      companyId: user.companyId,
      ...body,
      ownerId,
    });
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: {
      name?: string;
      code?: string | null;
      description?: string | null;
      assetType?: AssetType;
      baseUnit?: string | null;
      baseRate?: string | null;
      costBreakdown?: any;
      attributes?: any;
      manufacturer?: string | null;
      model?: string | null;
      serialNumberOrVin?: string | null;
      year?: number | null;
      isTrackable?: boolean;
      isConsumable?: boolean;
      isActive?: boolean;
      currentLocationId?: string | null;
      ownershipType?: AssetOwnershipType;
      ownerId?: string | null;
      sharingVisibility?: AssetSharingVisibility;
      maintenanceAssigneeId?: string | null;
      maintenancePoolId?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.assets.updateAsset(user.companyId, id, body);
  }

  @Delete(":id")
  async deactivate(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.assets.deactivateAsset(user.companyId, id);
  }

  // ── Sharing ───────────────────────────────────────────────────────

  @Post(":id/share")
  async shareAsset(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { grantedToUserId: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.assets.shareAsset(user.companyId, id, user.userId, body.grantedToUserId);
  }

  @Delete(":id/share/:userId")
  async unshareAsset(
    @Req() req: any,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.assets.unshareAsset(user.companyId, id, user.userId, targetUserId);
  }

  @Patch(":id/visibility")
  async updateVisibility(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { sharingVisibility: AssetSharingVisibility },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.assets.updateSharingVisibility(user.companyId, id, user.userId, body.sharingVisibility);
  }

  // ── Deployment ─────────────────────────────────────────────────────

  @Post(":id/deploy")
  async deploy(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { projectId: string; locationId: string; billingMode?: string; overrideRate?: string; notes?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.deployment.deployToProject(
      user.companyId, user.userId, id, body.projectId, body.locationId,
      { billingMode: body.billingMode, overrideRate: body.overrideRate, notes: body.notes },
    );
  }

  @Post(":id/return")
  async returnAsset(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { usageId: string; returnLocationId: string; notes?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.deployment.returnFromProject(
      user.companyId, user.userId, id, body.usageId, body.returnLocationId,
      { notes: body.notes },
    );
  }
}

/**
 * Separate controller for usage-level actions (time punches).
 * Mounted at /asset-usages to keep REST semantics clean.
 */
@RequiresModule('ASSETS')
@UseGuards(JwtAuthGuard)
@Controller("asset-usages")
export class AssetUsageController {
  constructor(private readonly deployment: AssetDeploymentService) {}

  @Post(":id/time-punch")
  async timePunch(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { hours: number; date?: string; dailyLogId?: string; notes?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.deployment.recordTimePunch(
      user.companyId, user.userId, id, body.hours, body.date,
      { dailyLogId: body.dailyLogId, notes: body.notes },
    );
  }
}
