import { Inject, Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { PlaidApi, Products, CountryCode } from "plaid";
import { STRIPE_CLIENT } from "../billing/stripe.provider";
import { PLAID_CLIENT } from "../billing/plaid.provider";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ProjectInvoiceStatus, ProjectPaymentMethod, ProjectPaymentStatus } from "@prisma/client";
import crypto from "node:crypto";

// ── Payment Processing Fee Rates ──────────────────────────────────
const CC_FEE_RATE = 0.035; // 3.5% credit card surcharge
const ACH_FEE_RATE = 0.01; // 1% ACH fee

@Injectable()
export class InvoicePaymentService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    @Inject(PLAID_CLIENT) private readonly plaid: PlaidApi,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException("Stripe is not configured. Set STRIPE_SECRET_KEY to enable payments.");
    }
    return this.stripe;
  }

  // ───────────────────────────────────────────────
  // Payment Token Management
  // ───────────────────────────────────────────────

  /** Generate a secure payment token for an invoice (used in email pay links). */
  async generatePaymentToken(invoiceId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.projectInvoice.update({
      where: { id: invoiceId },
      data: { paymentToken: token, paymentTokenExpiresAt: expiresAt },
    });

    return token;
  }

  /** Resolve an invoice from a payment token (public/unauthenticated). */
  async getInvoiceByPaymentToken(token: string) {
    const invoice = await this.prisma.projectInvoice.findUnique({
      where: { paymentToken: token },
      include: {
        project: { select: { id: true, name: true, addressLine1: true, city: true, state: true, postalCode: true } },
        company: { select: { id: true, name: true, stripeCustomerId: true } },
        lineItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, description: true, qty: true, unitPrice: true, amount: true, unitCode: true, sortOrder: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found or link has expired");
    }

    if (invoice.paymentTokenExpiresAt && invoice.paymentTokenExpiresAt < new Date()) {
      throw new BadRequestException("This payment link has expired. Please request a new invoice email.");
    }

    if (invoice.status === ProjectInvoiceStatus.DRAFT || invoice.status === ProjectInvoiceStatus.VOID) {
      throw new BadRequestException("This invoice is not available for payment");
    }

    // Reconcile any pending Stripe payments before computing balance
    await this.reconcilePendingPayments(invoice.id);

    // Compute balance
    const paidAmount = await this.computePaidAmount(invoice.id);
    const balanceDue = Math.max(0, (invoice.totalAmount ?? 0) - paidAmount);

    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      paidAmount,
      balanceDue,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      memo: invoice.memo,
      billToName: invoice.billToName,
      billToEmail: invoice.billToEmail,
      project: invoice.project,
      company: { id: invoice.company.id, name: invoice.company.name },
      lineItems: invoice.lineItems,
    };
  }

  // ───────────────────────────────────────────────
  // Card Payment (Stripe PaymentIntent)
  // ───────────────────────────────────────────────

  /**
   * Create a Stripe PaymentIntent for a card payment on an invoice.
   * Can be called from authenticated portal or token-based public page.
   */
  async createCardPaymentIntent(invoiceId: string, opts?: { payerEmail?: string; payerName?: string }) {
    const invoice = await this.loadInvoiceForPayment(invoiceId);
    const balanceDueCents = await this.getBalanceDueCents(invoice);

    if (balanceDueCents <= 0) {
      throw new BadRequestException("This invoice has no balance due");
    }

    // Apply CC surcharge
    const feeCents = Math.round(balanceDueCents * CC_FEE_RATE);
    const totalCents = balanceDueCents + feeCents;

    const stripe = this.requireStripe();

    // Use the contractor's Stripe customer
    const customerId = invoice.company.stripeCustomerId;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      ...(customerId ? { customer: customerId } : {}),
      description: `Invoice ${invoice.invoiceNo ?? invoice.id} — ${invoice.project.name} (incl. 3.5% CC surcharge)`,
      metadata: {
        type: "invoice_payment",
        invoiceId: invoice.id,
        companyId: invoice.companyId,
        projectId: invoice.projectId,
        paymentMethod: "CARD",
        invoiceAmountCents: String(balanceDueCents),
        feeAmountCents: String(feeCents),
      },
      automatic_payment_methods: { enabled: true },
    });

    // Track locally
    await this.prisma.invoicePaymentIntent.create({
      data: {
        invoiceId: invoice.id,
        companyId: invoice.companyId,
        projectId: invoice.projectId,
        stripePaymentIntentId: paymentIntent.id,
        amount: totalCents,
        paymentMethod: "CARD",
        payerEmail: opts?.payerEmail ?? null,
        payerName: opts?.payerName ?? null,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      amount: totalCents,
      invoiceAmount: balanceDueCents,
      feeAmount: feeCents,
      feeRate: CC_FEE_RATE,
      formattedAmount: `$${(totalCents / 100).toFixed(2)}`,
      formattedInvoiceAmount: `$${(balanceDueCents / 100).toFixed(2)}`,
      formattedFee: `$${(feeCents / 100).toFixed(2)}`,
    };
  }

  // ───────────────────────────────────────────────
  // ACH Payment (Plaid → Stripe)
  // ───────────────────────────────────────────────

  /** Create a Plaid Link token for ACH bank selection on an invoice. */
  async createPlaidLinkTokenForInvoice(invoiceId: string, userId?: string) {
    const invoice = await this.loadInvoiceForPayment(invoiceId);
    const balanceDue = await this.getBalanceDueCents(invoice);

    if (balanceDue <= 0) {
      throw new BadRequestException("This invoice has no balance due");
    }

    // redirect_uri is only needed for OAuth redirect flows and must be HTTPS.
    // Plaid Link in modal mode doesn't need it.
    const redirectUri = this.config.get<string>("PLAID_REDIRECT_URI");
    const useRedirect = redirectUri?.startsWith("https://") ? redirectUri : undefined;

    try {
      const response = await this.plaid.linkTokenCreate({
        user: { client_user_id: userId || `invoice-${invoiceId}` },
        client_name: "Nexus Connect",
        products: [Products.Auth],
        country_codes: [CountryCode.Us],
        language: "en",
        ...(useRedirect ? { redirect_uri: useRedirect } : {}),
      });

      return { linkToken: response.data.link_token };
    } catch (err: any) {
      const plaidError = err?.response?.data;
      console.error("[invoice-payment] Plaid linkTokenCreate failed:", {
        status: err?.response?.status,
        error_type: plaidError?.error_type,
        error_code: plaidError?.error_code,
        error_message: plaidError?.error_message,
        display_message: plaidError?.display_message,
      });
      throw new BadRequestException(
        plaidError?.display_message || plaidError?.error_message || "Failed to initialize bank connection. Please try again.",
      );
    }
  }

  /**
   * Exchange Plaid public_token → access_token → Stripe bank account token,
   * then create and confirm a PaymentIntent for ACH.
   */
  async exchangePlaidAndPay(
    invoiceId: string,
    publicToken: string,
    accountId: string,
    opts?: { payerEmail?: string; payerName?: string },
  ) {
    const invoice = await this.loadInvoiceForPayment(invoiceId);
    const balanceDue = await this.getBalanceDueCents(invoice);

    if (balanceDue <= 0) {
      throw new BadRequestException("This invoice has no balance due");
    }

    // 1. Exchange public token → access token
    const exchangeResponse = await this.plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchangeResponse.data.access_token;

    // 2. Get a Stripe-compatible bank token.
    //    Try the Plaid→Stripe processor integration first (preferred).
    //    If the account doesn't have it enabled, fall back to Plaid Auth
    //    to get routing/account numbers and create a Stripe token directly.
    let bankAccountToken: string;
    try {
      const processorResponse = await this.plaid.processorStripeBankAccountTokenCreate({
        access_token: accessToken,
        account_id: accountId,
      });
      bankAccountToken = processorResponse.data.stripe_bank_account_token;
    } catch (processorErr: any) {
      const errCode = processorErr?.response?.data?.error_code;
      if (errCode !== "INVALID_PRODUCT") {
        throw processorErr; // unexpected error — re-throw
      }

      // Fallback: use Plaid Auth to get account/routing numbers
      console.log("[invoice-payment] Stripe processor not enabled, falling back to Plaid Auth");
      const authResponse = await this.plaid.authGet({ access_token: accessToken });
      const account = authResponse.data.accounts.find((a) => a.account_id === accountId);
      const numbers = authResponse.data.numbers.ach.find((n) => n.account_id === accountId);

      if (!numbers?.routing || !numbers?.account) {
        throw new BadRequestException("Could not retrieve bank account details. Please try again.");
      }

      // Create a Stripe bank account token from the raw numbers
      const stripe = this.requireStripe();
      const token = await stripe.tokens.create({
        bank_account: {
          country: "US",
          currency: "usd",
          routing_number: numbers.routing,
          account_number: numbers.account,
          account_holder_name: opts?.payerName || account?.name || "Account Holder",
          account_holder_type: "individual",
        },
      });
      bankAccountToken = token.id;
    }

    // Apply ACH fee
    const feeCents = Math.round(balanceDue * ACH_FEE_RATE);
    const totalCents = balanceDue + feeCents;

    // 3. Charge via Stripe.
    //    Plaid bank tokens are legacy "source" objects, which are incompatible
    //    with the new PaymentIntent `us_bank_account` method. Use charges API.
    const stripe = this.requireStripe();
    const customerId = invoice.company.stripeCustomerId;

    if (!customerId) {
      throw new BadRequestException("No Stripe customer on file for this company. Please contact support.");
    }

    // Attach bank account to customer
    const source = (await stripe.customers.createSource(customerId, {
      source: bankAccountToken,
    })) as Stripe.BankAccount;

    // Create the charge
    const charge = await stripe.charges.create({
      amount: totalCents,
      currency: "usd",
      customer: customerId,
      source: source.id,
      description: `ACH Payment — Invoice ${invoice.invoiceNo ?? invoice.id} — ${invoice.project.name} (incl. 1% ACH fee)`,
      metadata: {
        type: "invoice_payment",
        invoiceId: invoice.id,
        companyId: invoice.companyId,
        projectId: invoice.projectId,
        paymentMethod: "STRIPE_ACH",
        invoiceAmountCents: String(balanceDue),
        feeAmountCents: String(feeCents),
      },
    });

    // Track locally
    await this.prisma.invoicePaymentIntent.create({
      data: {
        invoiceId: invoice.id,
        companyId: invoice.companyId,
        projectId: invoice.projectId,
        stripePaymentIntentId: charge.id, // charge ID for reference
        amount: totalCents,
        paymentMethod: "STRIPE_ACH",
        payerEmail: opts?.payerEmail ?? null,
        payerName: opts?.payerName ?? null,
        status: charge.status === "succeeded" ? "SUCCEEDED" : "PENDING",
      },
    });

    // ACH charges are typically "pending" — funds settle in 1-3 business days
    const isPending = charge.status === "pending";

    // Record payment immediately (ACH pending means the bank accepted it)
    if (charge.status === "succeeded" || charge.status === "pending") {
      const amountDollars = totalCents / 100;
      await this.prisma.projectPayment.create({
        data: {
          companyId: invoice.companyId,
          projectId: invoice.projectId,
          invoiceId: invoice.id,
          status: ProjectPaymentStatus.RECORDED,
          method: ProjectPaymentMethod.STRIPE_ACH,
          paidAt: new Date(),
          amount: amountDollars,
          reference: charge.id,
          note: `ACH bank transfer${isPending ? " (pending settlement)" : ""}`,
        },
      });

      // Update invoice status
      const totalPaid = await this.computePaidAmount(invoice.id);
      let nextStatus: ProjectInvoiceStatus = invoice.status;
      if (totalPaid >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
        nextStatus = ProjectInvoiceStatus.PAID;
      } else if (totalPaid > 0) {
        nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
      }
      if (nextStatus !== invoice.status) {
        await this.prisma.projectInvoice.update({
          where: { id: invoice.id },
          data: { status: nextStatus },
        });
      }

      console.log(`[invoice-payment] Recorded ACH payment of $${amountDollars.toFixed(2)} for invoice ${invoice.invoiceNo ?? invoice.id} (charge ${charge.id}, status: ${charge.status})`);
    }

    return {
      ok: true,
      status: charge.status,
      isPending,
      message: isPending
        ? "ACH payment initiated! Funds typically settle in 1-3 business days."
        : "Payment confirmed.",
    };
  }

  // ───────────────────────────────────────────────
  // Webhook Handler — record payment on success
  // ───────────────────────────────────────────────

  /**
   * Called by the Stripe webhook when a payment_intent.succeeded event
   * has metadata.type === "invoice_payment".
   */
  async handleInvoicePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const { invoiceId, companyId, projectId, paymentMethod } = paymentIntent.metadata;

    if (!invoiceId || !companyId || !projectId) {
      console.error("[invoice-payment] Missing metadata on payment_intent.succeeded:", paymentIntent.metadata);
      return;
    }

    // Update InvoicePaymentIntent status
    await this.prisma.invoicePaymentIntent.updateMany({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: { status: "SUCCEEDED" },
    });

    // Check for duplicate payment recording
    const existingPayment = await this.prisma.projectPayment.findFirst({
      where: {
        invoiceId,
        reference: paymentIntent.id,
      },
    });
    if (existingPayment) {
      console.log(`[invoice-payment] Payment already recorded for PI ${paymentIntent.id}`);
      return;
    }

    const amountDollars = paymentIntent.amount / 100;
    const method = paymentMethod === "STRIPE_ACH"
      ? ProjectPaymentMethod.STRIPE_ACH
      : ProjectPaymentMethod.CARD;

    // Record the payment
    await this.prisma.projectPayment.create({
      data: {
        companyId,
        projectId,
        invoiceId,
        status: ProjectPaymentStatus.RECORDED,
        method,
        paidAt: new Date(),
        amount: amountDollars,
        reference: paymentIntent.id,
        note: `Online payment via ${method === ProjectPaymentMethod.CARD ? "credit card" : "ACH bank transfer"}`,
      },
    });

    // Update invoice status
    const invoice = await this.prisma.projectInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return;

    const totalPaid = await this.computePaidAmount(invoiceId);
    let nextStatus: ProjectInvoiceStatus = invoice.status;

    if (totalPaid >= (invoice.totalAmount ?? 0) && (invoice.totalAmount ?? 0) > 0) {
      nextStatus = ProjectInvoiceStatus.PAID;
    } else if (totalPaid > 0) {
      nextStatus = ProjectInvoiceStatus.PARTIALLY_PAID;
    }

    if (nextStatus !== invoice.status) {
      await this.prisma.projectInvoice.update({
        where: { id: invoiceId },
        data: { status: nextStatus },
      });
    }

    console.log(
      `[invoice-payment] Recorded ${method} payment of $${amountDollars.toFixed(2)} for invoice ${invoice.invoiceNo ?? invoiceId}`,
    );
  }

  /**
   * Called by the Stripe webhook when a payment_intent fails.
   */
  async handleInvoicePaymentFailed(paymentIntentId: string) {
    await this.prisma.invoicePaymentIntent.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: "FAILED" },
    });
  }

  // ───────────────────────────────────────────────
  // Payment Reconciliation (webhook safety net)
  // ───────────────────────────────────────────────

  /**
   * Check all PENDING InvoicePaymentIntents for a given invoice against Stripe.
   * If any have succeeded, record the payment. Called when an invoice is viewed
   * to catch payments that the webhook missed.
   */
  async reconcilePendingPayments(invoiceId: string): Promise<void> {
    if (!this.stripe) return;

    const pending = await this.prisma.invoicePaymentIntent.findMany({
      where: { invoiceId, status: "PENDING" },
    });

    if (pending.length === 0) return;

    for (const pi of pending) {
      try {
        const stripePI = await this.stripe.paymentIntents.retrieve(pi.stripePaymentIntentId);

        if (stripePI.status === "succeeded") {
          console.log(`[invoice-payment] Reconciling succeeded PI ${pi.stripePaymentIntentId}`);
          await this.handleInvoicePaymentSucceeded(stripePI);
        } else if (stripePI.status === "canceled" || stripePI.status === "requires_payment_method") {
          // Mark as failed so we don't keep checking
          await this.prisma.invoicePaymentIntent.update({
            where: { id: pi.id },
            data: { status: "FAILED" },
          });
        }
        // "processing", "requires_action", "requires_confirmation" — leave as PENDING
      } catch (err: any) {
        console.error(`[invoice-payment] Reconciliation error for PI ${pi.stripePaymentIntentId}:`, err.message);
      }
    }
  }

  // ───────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────

  private async loadInvoiceForPayment(invoiceId: string) {
    const invoice = await this.prisma.projectInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        project: { select: { id: true, name: true, addressLine1: true, city: true, state: true, postalCode: true } },
        company: { select: { id: true, name: true, stripeCustomerId: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }

    if (invoice.status === ProjectInvoiceStatus.DRAFT || invoice.status === ProjectInvoiceStatus.VOID) {
      throw new BadRequestException("This invoice is not available for payment");
    }

    return invoice;
  }

  /** Compute total paid in dollars for an invoice. */
  private async computePaidAmount(invoiceId: string): Promise<number> {
    const directPayments = await this.prisma.projectPayment.aggregate({
      where: { invoiceId, status: ProjectPaymentStatus.RECORDED },
      _sum: { amount: true },
    });
    let total = directPayments._sum.amount ?? 0;

    try {
      const appTotal = await (this.prisma as any).projectPaymentApplication.aggregate({
        where: { invoiceId },
        _sum: { amount: true },
      });
      total += appTotal?._sum?.amount ?? 0;
    } catch {
      // Payment application table may not exist
    }

    return total;
  }

  /** Get balance due in cents for Stripe. */
  private async getBalanceDueCents(invoice: { id: string; totalAmount: number }): Promise<number> {
    const paid = await this.computePaidAmount(invoice.id);
    const balanceDollars = Math.max(0, (invoice.totalAmount ?? 0) - paid);
    return Math.round(balanceDollars * 100);
  }
}
