import { Controller, Post, Req, Inject, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import Stripe from "stripe";
import { STRIPE_CLIENT } from "./stripe.provider";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EntitlementService } from "./entitlement.service";

/**
 * Stripe webhook endpoint. This controller does NOT use JwtAuthGuard because
 * Stripe signs the payload with a shared secret — we verify the signature
 * directly.
 *
 * IMPORTANT: Fastify must be configured to provide the raw body for this
 * route (see billing.module.ts or main.ts setup).
 */
@Controller("webhooks")
export class StripeWebhookController {
  private readonly webhookSecret: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly config: ConfigService,
  ) {
    this.webhookSecret = this.config.get<string>("STRIPE_WEBHOOK_SECRET") || "";
  }

  @Post("stripe")
  async handleWebhook(@Req() req: FastifyRequest) {
    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (this.webhookSecret) {
      const signature = req.headers["stripe-signature"] as string;
      const rawBody = (req as any).rawBody as Buffer;

      if (!signature || !rawBody) {
        throw new BadRequestException("Missing Stripe signature or raw body");
      }

      try {
        if (!this.stripe) throw new BadRequestException("Stripe is not configured");
        event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      } catch (err: any) {
        console.error("[stripe-webhook] Signature verification failed:", err.message);
        throw new BadRequestException("Invalid Stripe webhook signature");
      }
    } else {
      // In development without webhook secret, trust the payload
      event = req.body as Stripe.Event;
    }

    // Idempotency: skip if we've already processed this event
    const exists = await this.prisma.billingEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (exists) {
      return { received: true, duplicate: true };
    }

    // Route event to handler
    const companyId = await this.resolveCompanyId(event);

    await this.prisma.billingEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        payload: event.data as any,
        companyId,
      },
    });

    switch (event.type) {
      case "customer.subscription.updated":
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "payment_method.attached":
        await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;
      case "payment_method.detached":
        await this.handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
        break;
      default:
        // Log but don't fail on unhandled event types
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    // Invalidate entitlement cache if we know the company
    if (companyId) {
      await this.entitlements.invalidate(companyId);
    }

    return { received: true };
  }

  // ─── Event Handlers ─────────────────────────────────

  private async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const localSub = await this.prisma.tenantSubscription.findUnique({
      where: { stripeSubId: sub.id },
    });
    if (!localSub) return;

    // In Stripe v20 current_period_end was removed; derive from latest invoice
    const latestInv = sub.latest_invoice;
    const periodEnd = typeof latestInv === "object" && latestInv?.period_end
      ? new Date(latestInv.period_end * 1000)
      : undefined;

    await this.prisma.tenantSubscription.update({
      where: { id: localSub.id },
      data: {
        status: this.mapStripeStatus(sub.status),
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription) {
    const localSub = await this.prisma.tenantSubscription.findUnique({
      where: { stripeSubId: sub.id },
    });
    if (!localSub) return;

    await this.prisma.tenantSubscription.update({
      where: { id: localSub.id },
      data: { status: "CANCELED" },
    });

    // Disable all non-core modules
    await this.prisma.tenantModuleSubscription.updateMany({
      where: { companyId: localSub.companyId, disabledAt: null },
      data: { disabledAt: new Date(), stripeSubscriptionItemId: null },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    // In Stripe v20, subscription moved to invoice.parent.subscription_details
    const subRef = invoice.parent?.subscription_details?.subscription;
    if (!subRef) return;

    const subId = typeof subRef === "string" ? subRef : subRef.id;

    const localSub = await this.prisma.tenantSubscription.findUnique({
      where: { stripeSubId: subId },
    });
    if (!localSub) return;

    await this.prisma.tenantSubscription.update({
      where: { id: localSub.id },
      data: { status: "PAST_DUE" },
    });

    // TODO: Send notification to tenant admins about failed payment
  }

  private async handlePaymentMethodAttached(pm: Stripe.PaymentMethod) {
    if (!pm.customer) return;

    const customerId = typeof pm.customer === "string" ? pm.customer : pm.customer.id;
    const company = await this.prisma.company.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (!company) return;

    // Upsert local record
    await this.prisma.tenantPaymentMethod.upsert({
      where: { stripePaymentMethodId: pm.id },
      update: {},
      create: {
        companyId: company.id,
        stripePaymentMethodId: pm.id,
        type: pm.type === "card" ? "CARD" : "US_BANK_ACCOUNT",
        last4: pm.card?.last4 || pm.us_bank_account?.last4 || null,
        brand: pm.card?.brand || pm.us_bank_account?.bank_name || null,
      },
    });
  }

  private async handlePaymentMethodDetached(pm: Stripe.PaymentMethod) {
    await this.prisma.tenantPaymentMethod.deleteMany({
      where: { stripePaymentMethodId: pm.id },
    });
  }

  // ─── Helpers ────────────────────────────────────────

  private async resolveCompanyId(event: Stripe.Event): Promise<string | null> {
    const obj = event.data.object as any;
    const customerId = obj.customer
      ? typeof obj.customer === "string"
        ? obj.customer
        : obj.customer.id
      : null;

    if (!customerId) return null;

    const company = await this.prisma.company.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });

    return company?.id ?? null;
  }

  private mapStripeStatus(
    status: Stripe.Subscription.Status,
  ): "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "UNPAID" {
    const map: Record<string, "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "UNPAID"> = {
      active: "ACTIVE",
      trialing: "TRIALING",
      past_due: "PAST_DUE",
      canceled: "CANCELED",
      unpaid: "UNPAID",
    };
    return map[status] || "ACTIVE";
  }
}
