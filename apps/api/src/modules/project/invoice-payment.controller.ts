import { Controller, Get, Post, Param, Body, BadRequestException, Req } from "@nestjs/common";
import { Public } from "../auth/auth.guards";
import { InvoicePaymentService } from "./invoice-payment.service";

/**
 * Public (unauthenticated) endpoints for invoice payment via token.
 * These are used by the /pay/[token] page linked from invoice emails.
 *
 * All endpoints are prefixed with /invoices/pay/:token.
 */
@Public()
@Controller("invoices/pay")
export class InvoicePaymentController {
  constructor(private readonly invoicePayment: InvoicePaymentService) {}

  /** GET /invoices/pay/:token — Get invoice details by payment token */
  @Get(":token")
  getInvoiceByToken(@Param("token") token: string) {
    return this.invoicePayment.getInvoiceByPaymentToken(token);
  }

  /** POST /invoices/pay/:token/intent — Create Stripe PaymentIntent for card payment */
  @Post(":token/intent")
  async createPaymentIntent(
    @Param("token") token: string,
    @Body() body: { payerEmail?: string; payerName?: string },
  ) {
    const invoice = await this.invoicePayment.getInvoiceByPaymentToken(token);
    return this.invoicePayment.createCardPaymentIntent(invoice.id, {
      payerEmail: body.payerEmail,
      payerName: body.payerName,
    });
  }

  /** POST /invoices/pay/:token/plaid-link — Get Plaid Link token for ACH */
  @Post(":token/plaid-link")
  async getPlaidLinkToken(@Param("token") token: string) {
    const invoice = await this.invoicePayment.getInvoiceByPaymentToken(token);
    return this.invoicePayment.createPlaidLinkTokenForInvoice(invoice.id);
  }

  /** POST /invoices/pay/:token/plaid-exchange — Exchange Plaid token and pay via ACH */
  @Post(":token/plaid-exchange")
  async exchangePlaidAndPay(
    @Req() req: any,
    @Param("token") token: string,
    @Body() body: { publicToken: string; accountId: string; payerEmail?: string; payerName?: string },
  ) {
    if (!body.publicToken || !body.accountId) {
      throw new BadRequestException("publicToken and accountId are required");
    }
    const invoice = await this.invoicePayment.getInvoiceByPaymentToken(token);
    return this.invoicePayment.exchangePlaidAndPay(invoice.id, body.publicToken, body.accountId, {
      payerEmail: body.payerEmail,
      payerName: body.payerName,
      ipAddress: String(req?.headers?.["x-forwarded-for"] ?? req?.ip ?? ""),
      userAgent: String(req?.headers?.["user-agent"] ?? ""),
    });
  }
}
