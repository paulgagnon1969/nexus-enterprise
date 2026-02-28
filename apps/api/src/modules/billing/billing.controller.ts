import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { EntitlementService } from "./entitlement.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly entitlement: EntitlementService,
    private readonly prisma: PrismaService,
  ) {}

  // --- Payment Methods ---

  @Post("setup-intent")
  createSetupIntent(@Req() req: any) {
    return this.billing.createSetupIntent(req.user as AuthenticatedUser);
  }

  @Get("payment-methods")
  listPaymentMethods(@Req() req: any) {
    return this.billing.listPaymentMethods(req.user as AuthenticatedUser);
  }

  @Post("payment-methods/:id/default")
  setDefaultPaymentMethod(@Req() req: any, @Param("id") id: string) {
    return this.billing.setDefaultPaymentMethod(req.user as AuthenticatedUser, id);
  }

  @Delete("payment-methods/:id")
  detachPaymentMethod(@Req() req: any, @Param("id") id: string) {
    return this.billing.detachPaymentMethod(req.user as AuthenticatedUser, id);
  }

  // --- Plaid (bank account linking) ---

  @Post("plaid/link-token")
  createPlaidLinkToken(@Req() req: any) {
    return this.billing.createPlaidLinkToken(req.user as AuthenticatedUser);
  }

  @Post("plaid/exchange")
  exchangePlaidToken(
    @Req() req: any,
    @Body() body: { publicToken: string; accountId: string },
  ) {
    return this.billing.exchangePlaidToken(
      req.user as AuthenticatedUser,
      body.publicToken,
      body.accountId,
    );
  }

  // --- Module Catalog & Entitlements ---

  /**
   * List all available premium modules for purchase.
   * GET /billing/modules/available
   */
  @Get("modules/available")
  async listAvailableModules() {
    const modules = await this.prisma.moduleCatalog.findMany({
      where: {
        pricingModel: "ONE_TIME_PURCHASE",
        active: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return modules.map(mod => ({
      code: mod.code,
      label: mod.label,
      description: mod.description,
      oneTimePurchasePrice: mod.oneTimePurchasePrice,
      formattedPrice: mod.oneTimePurchasePrice
        ? `$${(mod.oneTimePurchasePrice / 100).toFixed(2)}`
        : null,
    }));
  }

  /**
   * Get company's active module subscriptions.
   * GET /billing/modules/company
   */
  @Get("modules/company")
  async getCompanyModules(@Req() req: any) {
    const user = req.user as AuthenticatedUser;

    const subscriptions = await this.prisma.tenantModuleSubscription.findMany({
      where: {
        companyId: user.companyId,
        disabledAt: null,
      },
    });

    const moduleCodes = subscriptions.map(s => s.moduleCode);

    const modules = await this.prisma.moduleCatalog.findMany({
      where: {
        code: { in: moduleCodes },
      },
    });

    return modules.map(mod => ({
      code: mod.code,
      label: mod.label,
      description: mod.description,
      purchasedAt: subscriptions.find(s => s.moduleCode === mod.code)?.enabledAt,
    }));
  }

  /**
   * Check if company has access to a specific module.
   * GET /billing/modules/:code/check
   */
  @Get("modules/:code/check")
  async checkModuleAccess(@Req() req: any, @Param("code") moduleCode: string) {
    const user = req.user as AuthenticatedUser;
    const hasAccess = await this.entitlement.isModuleEnabled(user.companyId, moduleCode);

    return {
      moduleCode,
      hasAccess,
    };
  }

  /**
   * Grant access to a module (admin/dev only - in production this would be via Stripe webhook).
   * POST /billing/modules/:code/grant
   */
  @Post("modules/:code/grant")
  async grantModuleAccess(@Req() req: any, @Param("code") moduleCode: string) {
    const user = req.user as AuthenticatedUser;

    await this.prisma.tenantModuleSubscription.upsert({
      where: {
        TenantModuleSub_company_module_key: {
          companyId: user.companyId,
          moduleCode,
        },
      },
      update: {
        disabledAt: null, // Re-enable if was disabled
      },
      create: {
        companyId: user.companyId,
        moduleCode,
      },
    });

    // Invalidate cache
    await this.entitlement.invalidate(user.companyId);

    return {
      success: true,
      moduleCode,
      message: `Access granted to ${moduleCode}`,
    };
  }

  /**
   * Initiate purchase of a premium module.
   * POST /billing/modules/:code/purchase
   */
  @Post("modules/:code/purchase")
  async purchaseModule(@Req() req: any, @Param("code") moduleCode: string) {
    const user = req.user as AuthenticatedUser;
    return this.billing.createModulePurchaseIntent(user, moduleCode);
  }
}
