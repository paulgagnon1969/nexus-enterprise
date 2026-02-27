import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AssetMaintenanceService } from "./asset-maintenance.service";
import { RequiresModule } from "../billing/module.guard";
import { MaintenanceMeterType, MaintenanceTodoStatus } from "@prisma/client";

// ── Maintenance Templates ────────────────────────────────────────────

@RequiresModule("ASSETS")
@UseGuards(JwtAuthGuard)
@Controller("maintenance-templates")
export class MaintenanceTemplateController {
  constructor(private readonly maintenance: AssetMaintenanceService) {}

  @Get()
  list(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.listTemplates(user.companyId);
  }

  @Get(":id")
  get(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.getTemplate(user.companyId, id);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.createTemplate(user.companyId, body);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.updateTemplate(user.companyId, id, body);
  }
}

// ── Maintenance Todos ────────────────────────────────────────────────

@RequiresModule("ASSETS")
@UseGuards(JwtAuthGuard)
@Controller("maintenance-todos")
export class MaintenanceTodoController {
  constructor(private readonly maintenance: AssetMaintenanceService) {}

  @Get()
  list(
    @Req() req: any,
    @Query("assetId") assetId?: string,
    @Query("status") status?: MaintenanceTodoStatus,
    @Query("overdue") overdue?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.listTodos(user.companyId, {
      assetId,
      status,
      overdue: overdue === "true",
    });
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const user = req.user as AuthenticatedUser;
    // Auto-fill completedByUserId when completing
    if (body.status === "COMPLETED" && !body.completedByUserId) {
      body.completedByUserId = user.userId;
    }
    return this.maintenance.updateTodo(user.companyId, id, body);
  }
}

// ── Per-Asset Maintenance + Meter Readings ───────────────────────────
// These are nested under the existing /assets/:id routes.
// We use a separate controller to keep the asset controller focused.

@RequiresModule("ASSETS")
@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetMaintenanceController {
  constructor(private readonly maintenance: AssetMaintenanceService) {}

  @Post(":id/apply-template")
  applyTemplate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { templateId: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.applyTemplate(user.companyId, id, body.templateId);
  }

  @Get(":id/maintenance")
  getMaintenanceInfo(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.getAssetMaintenanceInfo(user.companyId, id);
  }

  @Post(":id/meter-reading")
  recordMeterReading(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { meterType: MaintenanceMeterType; value: number; source?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.recordMeterReading(
      user.companyId,
      id,
      body.meterType,
      body.value,
      body.source,
    );
  }

  @Get(":id/meter-history")
  getMeterHistory(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.maintenance.getMeterHistory(user.companyId, id);
  }
}
