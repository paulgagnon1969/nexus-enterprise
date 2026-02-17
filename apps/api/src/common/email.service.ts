import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private getTransport() {
    const host = process.env.EMAIL_SMTP_HOST;
    const port = Number(process.env.EMAIL_SMTP_PORT || "587");
    const user = process.env.EMAIL_SMTP_USER;
    const pass = process.env.EMAIL_SMTP_PASS;

    // If SMTP isn't configured, run in "no-op" mode.
    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  /**
   * Low-level helper to send via Resend if configured.
   * Returns null if Resend is not configured so callers can fall back to SMTP.
   */
  private async sendViaResend(params: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    html: string;
    text?: string;
    from: string;
  }): Promise<
    | null
    | {
        ok: boolean;
        provider: "resend";
        status?: number;
        body?: any;
        error?: string;
      }
  > {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: params.from,
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      const textBody = await response.text();
      let json: any = null;
      try {
        json = textBody ? JSON.parse(textBody) : null;
      } catch {
        // non-JSON body from Resend; ignore
      }

      if (!response.ok) {
        this.logger.error(
          `Resend email send failed (status ${response.status}) to ${params.to}: ${textBody}`,
        );
        return {
          ok: false,
          provider: "resend",
          status: response.status,
          body: json ?? textBody,
        };
      }

      this.logger.log(`Sent email via Resend to ${params.to}`);
      return { ok: true, provider: "resend", status: response.status, body: json ?? textBody };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.error(`Resend email send threw for ${params.to}: ${message}`);
      return { ok: false, provider: "resend", error: message };
    }
  }

  async sendMail(params: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    html: string;
    text?: string;
  }) {
    const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
    if (!from) {
      this.logger.warn(
        "RESEND_FROM_EMAIL/EMAIL_FROM is not set; skipping email send.",
      );
      return { ok: false, skipped: true };
    }

    const toList = Array.isArray(params.to) ? params.to : [params.to];
    const ccList = params.cc
      ? Array.isArray(params.cc)
        ? params.cc
        : [params.cc]
      : [];
    const bccList = params.bcc
      ? Array.isArray(params.bcc)
        ? params.bcc
        : [params.bcc]
      : [];

    // Prefer Resend when configured.
    const resendResult = await this.sendViaResend({
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
      from,
    });

    if (resendResult) {
      // If Resend is configured but failed, surface that result directly and
      // do not fall back silently to SMTP.
      if (!resendResult.ok) {
        return resendResult;
      }
      return resendResult;
    }

    // Fallback: classic SMTP via nodemailer.
    const transport = this.getTransport();
    if (!transport) {
      this.logger.warn(
        `SMTP not configured (EMAIL_SMTP_HOST/USER/PASS). Skipping email send to ${toList.join(",")}.`,
      );
      return { ok: false, skipped: true };
    }

    await transport.sendMail({
      from,
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    this.logger.log(`Sent email via SMTP to ${toList.join(",")}`);
    return { ok: true, provider: "smtp" as const };
  }

  async sendCompanyInvite(params: {
    toEmail: string;
    companyName: string;
    acceptUrl: string;
    roleLabel: string;
  }) {
    const subject = `You're invited to join ${params.companyName} on Nexus`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
        <h2 style="margin: 0 0 12px;">You're invited to join ${escapeHtml(params.companyName)}</h2>
        <p style="margin: 0 0 10px;">Role: <strong>${escapeHtml(params.roleLabel)}</strong></p>
        <p style="margin: 0 0 16px;">Click below to accept your invite and set your password:</p>
        <p style="margin: 0 0 18px;">
          <a href="${params.acceptUrl}" style="display: inline-block; background: #0f172a; color: #fff; padding: 10px 14px; border-radius: 6px; text-decoration: none;">
            Accept invite
          </a>
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 12px;">If you weren't expecting this invite, you can ignore this email.</p>
      </div>
    `.trim();

    const text = `You're invited to join ${params.companyName} on Nexus.\n\nRole: ${params.roleLabel}\n\nAccept invite: ${params.acceptUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send bid request invitation to a supplier
   */
  async sendBidRequestInvite(params: {
    toEmail: string;
    supplierName: string;
    companyName: string;
    bidTitle: string;
    projectAddress?: string;
    dueDate?: Date;
    portalUrl: string;
    accessPin: string;
  }) {
    const subject = `Bid Request from ${params.companyName}: ${params.bidTitle}`;
    const dueDateStr = params.dueDate
      ? new Date(params.dueDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Bid Request</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">from ${escapeHtml(params.companyName)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(params.supplierName)},</p>
          <p style="margin: 0 0 16px;">${escapeHtml(params.companyName)} has invited you to submit pricing for:</p>
          
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0 0 8px; font-size: 16px;">${escapeHtml(params.bidTitle)}</h2>
            ${params.projectAddress ? `<p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">📍 ${escapeHtml(params.projectAddress)}</p>` : ""}
            ${dueDateStr ? `<p style="margin: 0; color: #dc2626; font-size: 13px; font-weight: 600;">⏰ Due: ${dueDateStr}</p>` : ""}
          </div>

          <p style="margin: 0 0 12px;">To view and respond to this bid request:</p>
          <ol style="margin: 0 0 20px; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Click the button below to access the bid portal</li>
            <li style="margin-bottom: 8px;">Enter your PIN: <strong style="font-family: monospace; background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">${params.accessPin}</strong></li>
            <li>Review line items and enter your pricing</li>
          </ol>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Open Bid Portal
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.portalUrl}" style="color: #2563eb;">${params.portalUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This email was sent by NEXUS on behalf of ${escapeHtml(params.companyName)}. If you believe this was sent in error, please disregard.</p>
        </div>
      </div>
    `.trim();

    const text = `Bid Request from ${params.companyName}\n\n${params.bidTitle}\n${params.projectAddress ? `Location: ${params.projectAddress}\n` : ""}${dueDateStr ? `Due: ${dueDateStr}\n` : ""}\nAccess the bid portal: ${params.portalUrl}\nYour PIN: ${params.accessPin}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send reminder for pending bid request
   */
  async sendBidRequestReminder(params: {
    toEmail: string;
    supplierName: string;
    companyName: string;
    bidTitle: string;
    dueDate?: Date;
    portalUrl: string;
  }) {
    const subject = `Reminder: Bid Response Due Soon - ${params.bidTitle}`;
    const dueDateStr = params.dueDate
      ? new Date(params.dueDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: #f59e0b; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 18px;">⏰ Bid Response Reminder</h1>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(params.supplierName)},</p>
          <p style="margin: 0 0 16px;">This is a friendly reminder that ${escapeHtml(params.companyName)} is awaiting your response to:</p>
          
          <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0 0 8px; font-size: 16px;">${escapeHtml(params.bidTitle)}</h2>
            ${dueDateStr ? `<p style="margin: 0; color: #b45309; font-size: 14px; font-weight: 600;">Due: ${dueDateStr}</p>` : ""}
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.portalUrl}" style="display: inline-block; background: #f59e0b; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Submit Your Response
            </a>
          </p>

          <p style="margin: 0; color: #9ca3af; font-size: 11px;">Use your original PIN to access the portal. If you've lost your PIN, please contact ${escapeHtml(params.companyName)} directly.</p>
        </div>
      </div>
    `.trim();

    const text = `Reminder: Bid Response Due Soon\n\n${params.bidTitle}\n${dueDateStr ? `Due: ${dueDateStr}\n` : ""}\nSubmit your response: ${params.portalUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Notify requester when a supplier responds to a bid request
   */
  async sendBidResponseNotification(params: {
    toEmail: string;
    requesterName: string;
    supplierName: string;
    bidTitle: string;
    responseTotal: number;
    itemCount: number;
    viewUrl: string;
  }) {
    const subject = `Bid Response Received from ${params.supplierName}`;
    const totalFormatted = params.responseTotal.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: #10b981; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 18px;">✅ New Bid Response</h1>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hi ${escapeHtml(params.requesterName)},</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(params.supplierName)}</strong> has submitted a response to your bid request:</p>
          
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0 0 12px; font-size: 16px;">${escapeHtml(params.bidTitle)}</h2>
            <div style="display: flex; gap: 24px;">
              <div>
                <p style="margin: 0; color: #6b7280; font-size: 12px;">Total Bid</p>
                <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700; color: #059669;">${totalFormatted}</p>
              </div>
              <div>
                <p style="margin: 0; color: #6b7280; font-size: 12px;">Items Priced</p>
                <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700;">${params.itemCount}</p>
              </div>
            </div>
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.viewUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View Response
            </a>
          </p>
        </div>
      </div>
    `.trim();

    const text = `New Bid Response from ${params.supplierName}\n\n${params.bidTitle}\nTotal: ${totalFormatted}\nItems: ${params.itemCount}\n\nView response: ${params.viewUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
