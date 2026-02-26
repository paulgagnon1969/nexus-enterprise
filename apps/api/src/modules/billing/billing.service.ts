import { Inject, Injectable, ForbiddenException, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PlaidApi, Products, CountryCode } from "plaid";
import { STRIPE_CLIENT } from "./stripe.provider";
import { PLAID_CLIENT } from "./plaid.provider";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { Role } from "../auth/auth.guards";
import { EntitlementService } from "./entitlement.service";

@Injectable()
export class BillingService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(PLAID_CLIENT) private readonly plaid: PlaidApi,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementService,
  ) {}

  // ───────────────────────────────────────────────
  // Stripe Customer
  // ───────────────────────────────────────────────

  /** Get or lazily create a Stripe customer for the tenant. */
  async ensureStripeCustomer(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, name: true, email: true, stripeCustomerId: true },
    });

    if (company.stripeCustomerId) return company.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      name: company.name,
      email: company.email || undefined,
      metadata: { nexusCompanyId: companyId },
    });

    await this.prisma.company.update({
      where: { id: companyId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  // ───────────────────────────────────────────────
  // Payment Methods
  // ───────────────────────────────────────────────

  /** Create a Stripe SetupIntent so the frontend can collect card details. */
  async createSetupIntent(actor: AuthenticatedUser) {
    this.ensureBillingPermission(actor);
    const customerId = await this.ensureStripeCustomer(actor.companyId);

    const intent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
    });

    return { clientSecret: intent.client_secret };
  }

  /** List payment methods on file for this tenant. */
  async listPaymentMethods(actor: AuthenticatedUser) {
    this.ensureBillingPermission(actor);
    return this.prisma.tenantPaymentMethod.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Set a payment method as default for the tenant. */
  async setDefaultPaymentMethod(actor: AuthenticatedUser, paymentMethodId: string) {
    this.ensureBillingPermission(actor);

    const pm = await this.prisma.tenantPaymentMethod.findFirst({
      where: { id: paymentMethodId, companyId: actor.companyId },
    });
    if (!pm) throw new NotFoundException("Payment method not found");

    // Update Stripe customer default
    const customerId = await this.ensureStripeCustomer(actor.companyId);
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.stripePaymentMethodId },
    });

    // Update local records
    await this.prisma.$transaction([
      this.prisma.tenantPaymentMethod.updateMany({
        where: { companyId: actor.companyId },
        data: { isDefault: false },
      }),
      this.prisma.tenantPaymentMethod.update({
        where: { id: paymentMethodId },
        data: { isDefault: true },
      }),
    ]);

    return { ok: true };
  }

  /** Detach a payment method. */
  async detachPaymentMethod(actor: AuthenticatedUser, paymentMethodId: string) {
    this.ensureBillingPermission(actor);

    const pm = await this.prisma.tenantPaymentMethod.findFirst({
      where: { id: paymentMethodId, companyId: actor.companyId },
    });
    if (!pm) throw new NotFoundException("Payment method not found");

    await this.stripe.paymentMethods.detach(pm.stripePaymentMethodId);
    await this.prisma.tenantPaymentMethod.delete({ where: { id: paymentMethodId } });

    return { ok: true };
  }

  // ───────────────────────────────────────────────
  // Plaid Link → Stripe ACH Bridge
  // ───────────────────────────────────────────────

  /** Create a Plaid Link token for the frontend. */
  async createPlaidLinkToken(actor: AuthenticatedUser) {
    this.ensureBillingPermission(actor);

    const redirectUri = this.config.get<string>("PLAID_REDIRECT_URI");

    const response = await this.plaid.linkTokenCreate({
      user: { client_user_id: actor.userId },
      client_name: "Nexus Connect",
      products: [Products.Auth],
      country_codes: [CountryCode.Us],
      language: "en",
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });

    return { linkToken: response.data.link_token };
  }

  /**
   * Exchange a Plaid public_token for an access_token, create a Stripe
   * processor token, and attach the bank account as a Stripe payment method.
   */
  async exchangePlaidToken(actor: AuthenticatedUser, publicToken: string, accountId: string) {
    this.ensureBillingPermission(actor);

    // 1. Exchange public token → access token
    const exchangeResponse = await this.plaid.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // 2. Create Stripe processor token from Plaid
    const processorResponse = await this.plaid.processorStripeBankAccountTokenCreate({
      access_token: accessToken,
      account_id: accountId,
    });
    const bankAccountToken = processorResponse.data.stripe_bank_account_token;

    // 3. Attach bank account to Stripe customer
    const customerId = await this.ensureStripeCustomer(actor.companyId);
    const source = await this.stripe.customers.createSource(customerId, {
      source: bankAccountToken,
    }) as Stripe.BankAccount;

    // 4. Store locally
    const pm = await this.prisma.tenantPaymentMethod.create({
      data: {
        companyId: actor.companyId,
        stripePaymentMethodId: source.id,
        type: "US_BANK_ACCOUNT",
        last4: source.last4 || null,
        brand: source.bank_name || null,
        plaidItemId: itemId,
      },
    });

    return pm;
  }

  // ───────────────────────────────────────────────
  // Subscription & Module Management
  // ───────────────────────────────────────────────

  /** Get the module catalog (all available modules with prices). */
  async getModuleCatalog() {
    return this.prisma.moduleCatalog.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** Get the current membership state for a tenant. */
  async getCurrentMembership(actor: AuthenticatedUser) {
    const [subscription, modules, catalog] = await Promise.all([
      this.prisma.tenantSubscription.findFirst({
        where: { companyId: actor.companyId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.tenantModuleSubscription.findMany({
        where: { companyId: actor.companyId, disabledAt: null },
      }),
      this.prisma.moduleCatalog.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const enabledCodes = new Set(modules.map(m => m.moduleCode));

    return {
      subscription,
      modules: catalog.map(c => ({
        ...c,
        enabled: enabledCodes.has(c.code),
      })),
    };
  }

  /** Enable a module for a tenant (adds Stripe subscription item, prorates). */
  async enableModule(actor: AuthenticatedUser, moduleCode: string) {
    this.ensureBillingPermission(actor);

    const catalogEntry = await this.prisma.moduleCatalog.findUnique({
      where: { code: moduleCode },
    });
    if (!catalogEntry || !catalogEntry.active) {
      throw new NotFoundException(`Module '${moduleCode}' not found`);
    }
    if (!catalogEntry.stripePriceId) {
      throw new BadRequestException(`Module '${moduleCode}' has no Stripe Price configured`);
    }

    // Check not already enabled
    const existing = await this.prisma.tenantModuleSubscription.findUnique({
      where: { TenantModuleSub_company_module_key: { companyId: actor.companyId, moduleCode } },
    });
    if (existing && !existing.disabledAt) {
      throw new BadRequestException(`Module '${moduleCode}' is already enabled`);
    }

    // Ensure subscription exists
    const sub = await this.ensureSubscription(actor.companyId);

    // Add subscription item to Stripe
    const item = await this.stripe.subscriptionItems.create({
      subscription: sub.stripeSubId,
      price: catalogEntry.stripePriceId,
      proration_behavior: "create_prorations",
    });

    // Upsert local record
    if (existing) {
      await this.prisma.tenantModuleSubscription.update({
        where: { id: existing.id },
        data: {
          stripeSubscriptionItemId: item.id,
          enabledAt: new Date(),
          disabledAt: null,
        },
      });
    } else {
      await this.prisma.tenantModuleSubscription.create({
        data: {
          companyId: actor.companyId,
          moduleCode,
          stripeSubscriptionItemId: item.id,
        },
      });
    }

    return this.getCurrentMembership(actor);
  }

  /** Disable a module for a tenant (removes Stripe subscription item, prorates credit). */
  async disableModule(actor: AuthenticatedUser, moduleCode: string) {
    this.ensureBillingPermission(actor);

    const catalogEntry = await this.prisma.moduleCatalog.findUnique({
      where: { code: moduleCode },
    });
    if (catalogEntry?.isCore) {
      throw new BadRequestException(`Core module '${moduleCode}' cannot be disabled`);
    }

    const existing = await this.prisma.tenantModuleSubscription.findUnique({
      where: { TenantModuleSub_company_module_key: { companyId: actor.companyId, moduleCode } },
    });
    if (!existing || existing.disabledAt) {
      throw new BadRequestException(`Module '${moduleCode}' is not currently enabled`);
    }

    // Remove subscription item from Stripe
    if (existing.stripeSubscriptionItemId) {
      await this.stripe.subscriptionItems.del(existing.stripeSubscriptionItemId, {
        proration_behavior: "create_prorations",
      });
    }

    // Mark disabled locally
    await this.prisma.tenantModuleSubscription.update({
      where: { id: existing.id },
      data: { disabledAt: new Date(), stripeSubscriptionItemId: null },
    });

    return this.getCurrentMembership(actor);
  }

  /** Preview the upcoming invoice (so tenant sees cost impact before toggling). */
  async getUpcomingInvoice(actor: AuthenticatedUser) {
    const customerId = await this.ensureStripeCustomer(actor.companyId);

    try {
      const invoice = await this.stripe.invoices.createPreview({
        customer: customerId,
      });

      return {
        subtotal: invoice.subtotal,
        total: invoice.total,
        currency: invoice.currency,
        periodEnd: invoice.period_end,
        lines: invoice.lines.data.map(line => ({
          description: line.description,
          amount: line.amount,
          proration:
            line.parent?.subscription_item_details?.proration ??
            line.parent?.invoice_item_details?.proration ??
            false,
        })),
      };
    } catch (err: any) {
      // No upcoming invoice if no subscription
      if (err.code === "invoice_upcoming_none") {
        return null;
      }
      throw err;
    }
  }

  /** List past invoices from Stripe. */
  async listInvoices(actor: AuthenticatedUser) {
    this.ensureBillingPermission(actor);

    const customerId = await this.ensureStripeCustomer(actor.companyId);

    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit: 24,
    });

    return invoices.data.map(inv => ({
      id: inv.id,
      status: inv.status,
      total: inv.total,
      subtotal: inv.subtotal,
      currency: inv.currency,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
      lines: inv.lines.data.map(line => ({
        description: line.description,
        amount: line.amount,
        proration:
          line.parent?.subscription_item_details?.proration ??
          line.parent?.invoice_item_details?.proration ??
          false,
      })),
    }));
  }

  /** Cancel membership at end of current period. */
  async cancelMembership(actor: AuthenticatedUser) {
    this.ensureBillingPermission(actor);

    const sub = await this.prisma.tenantSubscription.findFirst({
      where: { companyId: actor.companyId, status: { in: ["ACTIVE", "TRIALING"] } },
    });
    if (!sub) throw new NotFoundException("No active subscription found");

    await this.stripe.subscriptions.update(sub.stripeSubId, {
      cancel_at_period_end: true,
    });

    await this.prisma.tenantSubscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    return { ok: true, cancelAtPeriodEnd: true };
  }

  /** Reactivate a membership that was set to cancel at period end. */
  async reactivateMembership(actor: AuthenticatedUser) {
    this.ensureBillingPermission(actor);

    const sub = await this.prisma.tenantSubscription.findFirst({
      where: { companyId: actor.companyId, cancelAtPeriodEnd: true },
    });
    if (!sub) throw new NotFoundException("No pending cancellation found");

    await this.stripe.subscriptions.update(sub.stripeSubId, {
      cancel_at_period_end: false,
    });

    await this.prisma.tenantSubscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false },
    });

    return { ok: true, cancelAtPeriodEnd: false };
  }

  // ───────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────

  /** Ensure the tenant has a Stripe subscription. Create one if needed (starts with CORE module). */
  private async ensureSubscription(companyId: string) {
    const existing = await this.prisma.tenantSubscription.findFirst({
      where: { companyId, status: { in: ["ACTIVE", "TRIALING"] } },
    });
    if (existing) return existing;

    const customerId = await this.ensureStripeCustomer(companyId);

    // Find the CORE module price
    const core = await this.prisma.moduleCatalog.findFirst({
      where: { isCore: true, active: true },
    });

    const subParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: core?.stripePriceId ? [{ price: core.stripePriceId }] : [],
      payment_behavior: "default_incomplete",
      proration_behavior: "create_prorations",
    };

    const stripeSub = await this.stripe.subscriptions.create(subParams);

    // In Stripe v20 current_period_end was removed; derive from latest invoice
    const latestInv = stripeSub.latest_invoice;
    const periodEnd = typeof latestInv === "object" && latestInv?.period_end
      ? new Date(latestInv.period_end * 1000)
      : null;

    const sub = await this.prisma.tenantSubscription.create({
      data: {
        companyId,
        stripeSubId: stripeSub.id,
        status: stripeSub.status === "active" ? "ACTIVE" : "TRIALING",
        currentPeriodEnd: periodEnd,
      },
    });

    // Record CORE module subscription locally
    if (core) {
      const coreItem = stripeSub.items.data[0];
      await this.prisma.tenantModuleSubscription.create({
        data: {
          companyId,
          moduleCode: core.code,
          stripeSubscriptionItemId: coreItem?.id || null,
        },
      });
    }

    return sub;
  }

  // ───────────────────────────────────────────────
  // Per-Project Feature Unlocks
  // ───────────────────────────────────────────────

  /**
   * Unlock a PER_PROJECT feature on a specific project.
   * Charges a one-time Stripe PaymentIntent and creates a ProjectFeatureUnlock record.
   */
  async unlockProjectFeature(
    actor: AuthenticatedUser,
    projectId: string,
    featureCode: string,
  ) {
    this.ensureBillingPermission(actor);

    // Validate the feature exists and is PER_PROJECT
    const catalogEntry = await this.prisma.moduleCatalog.findUnique({
      where: { code: featureCode },
    });
    if (!catalogEntry || !catalogEntry.active) {
      throw new NotFoundException(`Feature '${featureCode}' not found`);
    }
    if (catalogEntry.pricingModel !== "PER_PROJECT") {
      throw new BadRequestException(
        `Feature '${featureCode}' is not a per-project feature. Use module subscription instead.`,
      );
    }
    if (!catalogEntry.projectUnlockPrice) {
      throw new BadRequestException(`Feature '${featureCode}' has no unlock price configured`);
    }

    // Validate project belongs to this company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: actor.companyId },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // Check not already unlocked
    const existing = await this.prisma.projectFeatureUnlock.findUnique({
      where: {
        ProjectFeatureUnlock_company_project_feature_key: {
          companyId: actor.companyId,
          projectId,
          featureCode,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Feature '${featureCode}' is already unlocked on this project`,
      );
    }

    // Charge via Stripe PaymentIntent (one-time)
    const customerId = await this.ensureStripeCustomer(actor.companyId);
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: catalogEntry.projectUnlockPrice,
      currency: "usd",
      customer: customerId,
      description: `${catalogEntry.label} — ${project.name}`,
      metadata: {
        nexusCompanyId: actor.companyId,
        projectId,
        featureCode,
        type: "project_feature_unlock",
      },
      // Auto-confirm using default payment method
      confirm: true,
      off_session: true,
    });

    // Create unlock record
    const unlock = await this.prisma.projectFeatureUnlock.create({
      data: {
        companyId: actor.companyId,
        projectId,
        featureCode,
        stripePaymentIntentId: paymentIntent.id,
        amountCents: catalogEntry.projectUnlockPrice,
        unlockedByUserId: actor.userId,
      },
    });

    // Invalidate cache so guard picks it up immediately
    await this.entitlements.invalidateProjectFeature(
      actor.companyId,
      projectId,
      featureCode,
    );

    return {
      ok: true,
      unlock,
      charged: catalogEntry.projectUnlockPrice,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * List all feature unlocks for a specific project.
   */
  async getProjectFeatureUnlocks(companyId: string, projectId: string) {
    return this.prisma.projectFeatureUnlock.findMany({
      where: { companyId, projectId },
      orderBy: { unlockedAt: "desc" },
    });
  }

  // ───────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────

  /** Only OWNER or ADMIN can manage billing. */
  private ensureBillingPermission(actor: AuthenticatedUser) {
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only OWNER or ADMIN can manage billing");
    }
  }
}
