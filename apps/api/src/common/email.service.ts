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

  /**
   * Send client portal invite/welcome email
   */
  async sendClientPortalInvite(params: {
    toEmail: string;
    clientName: string;
    companyName: string;
    projects: Array<{ name: string; address?: string }>;
    portalUrl: string;
    isNewUser: boolean;
    passwordResetUrl?: string;
  }) {
    const subject = `You've been invited to view your projects on ${params.companyName}'s portal`;

    const projectListHtml = params.projects
      .slice(0, 5) // Show max 5 projects
      .map(
        (p) =>
          `<li style="margin-bottom: 6px;">
            <strong>${escapeHtml(p.name)}</strong>
            ${p.address ? `<br /><span style="color: #6b7280; font-size: 12px;">${escapeHtml(p.address)}</span>` : ""}
          </li>`,
      )
      .join("");

    const moreProjectsNote =
      params.projects.length > 5
        ? `<p style="margin: 8px 0 0; color: #6b7280; font-size: 12px;">...and ${params.projects.length - 5} more project(s)</p>`
        : "";

    const loginInstructions = params.isNewUser
      ? `
        <p style="margin: 0 0 12px;">To get started, click below to set your password and access the portal:</p>
        <p style="margin: 0 0 24px; text-align: center;">
          <a href="${params.passwordResetUrl || params.portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Set Password & Access Portal
          </a>
        </p>
      `
      : `
        <p style="margin: 0 0 12px;">You can access the portal using your existing NEXUS account:</p>
        <p style="margin: 0 0 24px; text-align: center;">
          <a href="${params.portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Go to Client Portal
          </a>
        </p>
      `;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Welcome to Your Client Portal</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">from ${escapeHtml(params.companyName)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(params.clientName)},</p>
          <p style="margin: 0 0 16px;">
            ${escapeHtml(params.companyName)} has granted you access to view your project${params.projects.length > 1 ? "s" : ""} through their client portal.
          </p>
          
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0 0 12px; font-size: 15px; color: #374151;">Your Project${params.projects.length > 1 ? "s" : ""}</h2>
            <ul style="margin: 0; padding-left: 20px;">
              ${projectListHtml}
            </ul>
            ${moreProjectsNote}
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #1e40af;">What you can do in the portal:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
              <li style="margin-bottom: 4px;">View project status and progress</li>
              <li style="margin-bottom: 4px;">Access shared files and photos</li>
              <li style="margin-bottom: 4px;">Review project schedules</li>
              <li>Communicate with the ${escapeHtml(params.companyName)} team</li>
            </ul>
          </div>

          ${loginInstructions}

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This invitation was sent by NEXUS on behalf of ${escapeHtml(params.companyName)}. If you weren't expecting this email, please contact ${escapeHtml(params.companyName)} directly.</p>
        </div>
      </div>
    `.trim();

    const projectListText = params.projects
      .slice(0, 5)
      .map((p) => `  - ${p.name}${p.address ? ` (${p.address})` : ""}`)
      .join("\n");

    const text = `Welcome to Your Client Portal\n\nHello ${params.clientName},\n\n${params.companyName} has granted you access to view your project(s):\n\n${projectListText}${params.projects.length > 5 ? `\n  ...and ${params.projects.length - 5} more` : ""}\n\nAccess the portal: ${params.passwordResetUrl || params.portalUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }
  /**
   * Send invoice email with payment link.
   */
  async sendInvoiceEmail(params: {
    toEmail: string;
    clientName?: string;
    companyName: string;
    projectName: string;
    projectAddress?: string;
    invoiceNo: string;
    issuedAt: string;
    dueAt?: string;
    lineItems: Array<{ description: string; qty?: number; unitPrice?: number; amount: number }>;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    payUrl: string;
    portalUrl?: string;
  }) {
    const name = params.clientName || "there";
    const dueDateStr = params.dueAt
      ? new Date(params.dueAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : null;

    const issuedStr = new Date(params.issuedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

    // Show up to 5 line items in email
    const visibleItems = params.lineItems.slice(0, 5);
    const lineItemsHtml = visibleItems.map(li =>
      `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px;">${escapeHtml(li.description)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #0f172a; font-weight: 600; font-size: 13px; text-align: right;">${formatMoney(li.amount)}</td>
      </tr>`
    ).join("");
    const moreItemsNote = params.lineItems.length > 5
      ? `<tr><td colspan="2" style="padding: 8px 12px; color: #6b7280; font-size: 12px;">...and ${params.lineItems.length - 5} more item(s)</td></tr>`
      : "";

    const subject = `Invoice ${params.invoiceNo} from ${params.companyName}${params.balanceDue > 0 ? " — Payment Due" : ""}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Invoice ${escapeHtml(params.invoiceNo)}</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">from ${escapeHtml(params.companyName)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;">You have a new invoice from <strong>${escapeHtml(params.companyName)}</strong> for project <strong>${escapeHtml(params.projectName)}</strong>.</p>

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280; font-size: 12px;">Invoice</span>
              <span style="font-weight: 600; font-size: 14px;">${escapeHtml(params.invoiceNo)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #6b7280; font-size: 12px;">Issued</span>
              <span style="font-size: 13px;">${issuedStr}</span>
            </div>
            ${dueDateStr ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: #6b7280; font-size: 12px;">Due</span><span style="font-size: 13px; color: #dc2626; font-weight: 600;">${dueDateStr}</span></div>` : ""}
            ${params.projectAddress ? `<div style="display: flex; justify-content: space-between;"><span style="color: #6b7280; font-size: 12px;">Project</span><span style="font-size: 13px;">${escapeHtml(params.projectAddress)}</span></div>` : ""}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin: 0 0 16px;">
            <thead>
              <tr style="border-bottom: 2px solid #334155;">
                <th style="text-align: left; padding: 8px 12px; color: #6b7280; font-size: 11px; text-transform: uppercase;">Description</th>
                <th style="text-align: right; padding: 8px 12px; color: #6b7280; font-size: 11px; text-transform: uppercase;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
              ${moreItemsNote}
            </tbody>
          </table>

          <div style="border-top: 2px solid #d1d5db; padding-top: 12px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
              <span style="color: #6b7280;">Total</span>
              <span style="font-weight: 700;">${formatMoney(params.totalAmount)}</span>
            </div>
            ${params.paidAmount > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;"><span style="color: #16a34a;">Paid</span><span style="color: #16a34a; font-weight: 600;">-${formatMoney(params.paidAmount)}</span></div>` : ""}
            ${params.balanceDue > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 16px; margin-top: 8px;"><span style="font-weight: 700;">Balance Due</span><span style="font-weight: 700;">${formatMoney(params.balanceDue)}</span></div>` : ""}
          </div>

          ${params.balanceDue > 0 ? `
            <p style="margin: 0 0 24px; text-align: center;">
              <a href="${params.payUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Pay Now — ${formatMoney(params.balanceDue)}
              </a>
            </p>
            <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; text-align: center;">Pay securely with credit card or bank transfer (ACH)</p>
          ` : `
            <div style="background: rgba(34,197,94,0.1); border: 1px solid #22c55e; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px;">
              <span style="color: #16a34a; font-weight: 600;">✅ This invoice has been paid in full</span>
            </div>
          `}

          ${params.portalUrl ? `
            <p style="margin: 16px 0 0; text-align: center;">
              <a href="${params.portalUrl}" style="color: #2563eb; font-size: 13px;">View in Client Portal</a>
            </p>
          ` : ""}

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This invoice was sent by NEXUS on behalf of ${escapeHtml(params.companyName)}. If you believe this was sent in error, please contact ${escapeHtml(params.companyName)} directly.</p>
        </div>
      </div>
    `.trim();

    const text = `Invoice ${params.invoiceNo} from ${params.companyName}\n\nHello ${name},\n\nTotal: ${formatMoney(params.totalAmount)}\nBalance Due: ${formatMoney(params.balanceDue)}\n\nPay online: ${params.payUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send a video call invitation email with a "Join Call" button.
   */
  async sendCallInvite(params: {
    toEmail: string;
    callerName: string;
    projectName?: string;
    joinUrl: string;
  }) {
    const projectLabel = params.projectName
      ? ` for <strong>${escapeHtml(params.projectName)}</strong>`
      : "";

    const subject = `📹 ${params.callerName} is inviting you to a video call`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">📹 Video Call Invitation</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">from ${escapeHtml(params.callerName)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">${escapeHtml(params.callerName)} is inviting you to a video call${projectLabel}.</p>
          <p style="margin: 0 0 24px;">Click the button below to join directly from your browser — no account or app required.</p>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.joinUrl}" style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Join Call
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.joinUrl}" style="color: #2563eb;">${params.joinUrl}</a>
          </p>

          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This link expires in 1 hour. If the call has already ended, this link will no longer work.</p>
        </div>
      </div>
    `.trim();

    const text = `${params.callerName} is inviting you to a video call${params.projectName ? " for " + params.projectName : ""}.\n\nJoin here: ${params.joinUrl}\n\nThis link expires in 1 hour.`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send document share access link (Email 1 of 2).
   * Contains the share URL and instructions to use their email as login.
   * Password is sent separately in Email 2.
   */
  async sendDocumentShareAccess(params: {
    toEmail: string;
    recipientName?: string;
    documentTitle: string;
    shareUrl: string;
    senderName?: string;
    expiresAt?: Date;
  }) {
    const name = params.recipientName || "there";
    const sender = params.senderName || "NEXUS";
    const expiryNote = params.expiresAt
      ? `<p style="margin: 0 0 16px; color: #b45309; font-size: 13px;">⏰ This link expires on ${new Date(params.expiresAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>`
      : "";

    const subject = `${sender} has shared a document with you: ${params.documentTitle}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">📄 Document Shared With You</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">from ${escapeHtml(sender)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;">You have been granted access to view:</p>

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0; font-size: 16px;">${escapeHtml(params.documentTitle)}</h2>
          </div>

          ${expiryNote}

          <p style="margin: 0 0 12px;">To access this document:</p>
          <ol style="margin: 0 0 20px; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Click the button below to open the document</li>
            <li style="margin-bottom: 8px;">Enter your email address: <strong>${escapeHtml(params.toEmail)}</strong></li>
            <li>Enter the access password (sent to you in a separate email)</li>
          </ol>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              View Document
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.shareUrl}" style="color: #2563eb;">${params.shareUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This email was sent by NEXUS on behalf of ${escapeHtml(sender)}. If you weren't expecting this, please disregard.</p>
        </div>
      </div>
    `.trim();

    const text = `Document Shared With You\n\nHello ${name},\n\nYou have been granted access to: ${params.documentTitle}\n\n1. Open: ${params.shareUrl}\n2. Login with your email: ${params.toEmail}\n3. Enter the password from a separate email\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send document share password (Email 2 of 2).
   * Contains only the access password. Sent separately from the share URL.
   */
  async sendDocumentSharePassword(params: {
    toEmail: string;
    recipientName?: string;
    documentTitle: string;
    password: string;
  }) {
    const name = params.recipientName || "there";
    const subject = "Your document access code";

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: #374151; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 18px;">🔑 Your Access Code</h1>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;">Use the following password to access <strong>${escapeHtml(params.documentTitle)}</strong>:</p>

          <div style="background: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; margin: 0 0 20px; text-align: center;">
            <span style="font-family: monospace; font-size: 24px; font-weight: 700; letter-spacing: 2px; color: #111827;">${escapeHtml(params.password)}</span>
          </div>

          <p style="margin: 0 0 16px; color: #6b7280; font-size: 13px;">
            Use your email address (<strong>${escapeHtml(params.toEmail)}</strong>) along with the password above to log in.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated message from NEXUS. Do not share this password with anyone.</p>
        </div>
      </div>
    `.trim();

    const text = `Your Access Code\n\nHello ${name},\n\nYour password for "${params.documentTitle}":\n\n${params.password}\n\nUse your email (${params.toEmail}) and this password to log in.\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send a CAM Library invite email with branded CTA.
   */
  async sendCamInvite(params: {
    toEmail: string;
    recipientName?: string;
    inviterName: string;
    message?: string;
    shareUrl: string;
  }) {
    const name = params.recipientName || "there";
    const personalMessage = params.message
      ? `<div style="background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 12px 16px; margin: 0 0 20px; border-radius: 0 6px 6px 0; font-style: italic; color: #1e40af; font-size: 13px;">${escapeHtml(params.message)}</div>`
      : "";

    const subject = `${params.inviterName} has invited you to view the Nexus CAM Library`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">\uD83C\uDFC6 You're Invited</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">Nexus Competitive Advantage Modules</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(params.inviterName)}</strong> has invited you to review the <strong>Nexus CAM Library</strong> \u2014 a curated collection of competitive advantage modules that define how Nexus transforms construction operations.</p>

          ${personalMessage}

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #374151;">What to expect:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
              <li style="margin-bottom: 4px;">Review &amp; accept a brief confidentiality agreement (CNDA+)</li>
              <li style="margin-bottom: 4px;">Complete a 30-second assessment</li>
              <li>Access the full CAM Library with interactive discussion</li>
            </ol>
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View the CAM Library
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.shareUrl}" style="color: #2563eb;">${params.shareUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This invitation was sent by NEXUS on behalf of ${escapeHtml(params.inviterName)}. The CAM Library contains confidential and proprietary information protected under the CNDA+ agreement.</p>
        </div>
      </div>
    `.trim();

    const text = `${params.inviterName} has invited you to view the Nexus CAM Library.\n\n${params.message ? `"${params.message}"\n\n` : ""}View the CAM Library: ${params.shareUrl}\n\nYou'll need to accept a brief confidentiality agreement and complete a 30-second assessment before viewing.\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send a Master Class invite email with branded CTA.
   */
  async sendMasterClassInvite(params: {
    toEmail: string;
    recipientName?: string;
    inviterName: string;
    message?: string;
    shareUrl: string;
  }) {
    const name = params.recipientName || "there";
    const personalMessage = params.message
      ? `<div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px 16px; margin: 0 0 20px; border-radius: 0 6px 6px 0; font-style: italic; color: #92400e; font-size: 13px;">${escapeHtml(params.message)}</div>`
      : "";

    const subject = `${params.inviterName} has invited you to the Nexus Master Class`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f766e 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">\uD83C\uDF93 You're Invited</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">Nexus Master Class — Construction Operations Training</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(params.inviterName)}</strong> has invited you to the <strong>Nexus Master Class</strong> \u2014 a guided deep-dive into how Nexus transforms construction operations from estimation to close-out.</p>

          ${personalMessage}

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #374151;">What to expect:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
              <li style="margin-bottom: 4px;">Review &amp; accept a brief confidentiality agreement (CNDA+)</li>
              <li style="margin-bottom: 4px;">Complete a 30-second assessment</li>
              <li>Access the full Master Class with interactive modules</li>
            </ol>
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Start the Master Class
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.shareUrl}" style="color: #2563eb;">${params.shareUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This invitation was sent by NEXUS on behalf of ${escapeHtml(params.inviterName)}. The Master Class contains confidential and proprietary information protected under the CNDA+ agreement.</p>
        </div>
      </div>
    `.trim();

    const text = `${params.inviterName} has invited you to the Nexus Master Class.\n\n${params.message ? `"${params.message}"\n\n` : ""}Start the Master Class: ${params.shareUrl}\n\nYou'll need to accept a brief confidentiality agreement and complete a 30-second assessment before viewing.\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send a new module announcement email to admins.
   */
  async sendNewModuleAnnouncement(params: {
    toEmail: string;
    recipientName?: string;
    moduleName: string;
    summaryBullets: string[];
    ctaUrl: string;
    ctaLabel?: string;
  }) {
    const name = params.recipientName || "there";
    const cta = params.ctaLabel || "Explore the Module";

    const bulletsHtml = params.summaryBullets
      .map(
        (b) =>
          `<li style="margin-bottom: 6px; color: #374151; font-size: 13px;">${escapeHtml(b)}</li>`,
      )
      .join("");

    const subject = `New Module Available: ${params.moduleName}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">\uD83D\uDE80 New Module Available</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${escapeHtml(params.moduleName)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;">A powerful new module has been added to the Nexus platform:</p>

          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #059669;">${escapeHtml(params.moduleName)}</h2>
            <ul style="margin: 0; padding-left: 20px;">
              ${bulletsHtml}
            </ul>
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.ctaUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              ${escapeHtml(cta)}
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.ctaUrl}" style="color: #2563eb;">${params.ctaUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated notification from NEXUS. You received this because you are an administrator on the platform.</p>
        </div>
      </div>
    `.trim();

    const bulletsText = params.summaryBullets.map((b) => `  - ${b}`).join("\n");
    const text = `New Module Available: ${params.moduleName}\n\nHello ${name},\n\nA new module has been added to Nexus:\n\n${bulletsText}\n\n${cta}: ${params.ctaUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send a Secure Portal campaign invite email with branded CTA.
   */
  async sendPortalInvite(params: {
    toEmail: string;
    recipientName?: string;
    inviterName: string;
    campaignName: string;
    message?: string;
    shareUrl: string;
  }) {
    const name = params.recipientName || "there";
    const personalMessage = params.message
      ? `<div style="background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 12px 16px; margin: 0 0 20px; border-radius: 0 6px 6px 0; font-style: italic; color: #1e40af; font-size: 13px;">${escapeHtml(params.message)}</div>`
      : "";

    const subject = `${params.inviterName} has invited you to view: ${params.campaignName}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">\uD83D\uDD12 You're Invited</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${escapeHtml(params.campaignName)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(params.inviterName)}</strong> has invited you to securely view <strong>${escapeHtml(params.campaignName)}</strong>.</p>

          ${personalMessage}

          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #374151;">What to expect:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #374151; font-size: 13px;">
              <li style="margin-bottom: 4px;">Review &amp; accept a brief confidentiality agreement</li>
              <li style="margin-bottom: 4px;">Complete a quick assessment</li>
              <li>Access the secure documents</li>
            </ol>
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View Documents
            </a>
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
          <p style="margin: 0 0 20px; word-break: break-all; font-size: 12px; color: #2563eb;">
            <a href="${params.shareUrl}" style="color: #2563eb;">${params.shareUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This invitation was sent by NEXUS on behalf of ${escapeHtml(params.inviterName)}. The documents you are about to access contain confidential and proprietary information protected under the agreement you will accept.</p>
        </div>
      </div>
    `.trim();

    const text = `${params.inviterName} has invited you to view: ${params.campaignName}.\n\n${params.message ? `"${params.message}"\n\n` : ""}View Documents: ${params.shareUrl}\n\nYou'll need to accept a brief confidentiality agreement and complete a quick assessment before viewing.\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send a daily CAM digest email to PIP users summarizing new/updated CAMs.
   */
  async sendCamDigest(params: {
    toEmail: string;
    recipientName?: string;
    entries: Array<{
      camId: string;
      title: string;
      mode: string;
      modeLabel: string;
      category: string;
      score: number;
      isNew: boolean;
    }>;
    discussionEntries?: Array<{
      camSection: string;
      threadTitle: string;
      newMessageCount: number;
      authors: string[];
    }>;
    dateLabel: string;
    shareUrl: string;
  }) {
    const name = params.recipientName || "there";
    const newCount = params.entries.filter((e) => e.isNew).length;
    const updatedCount = params.entries.length - newCount;
    const discCount = params.discussionEntries?.length ?? 0;

    const subjectParts: string[] = [];
    if (newCount > 0) subjectParts.push(`${newCount} new`);
    if (updatedCount > 0) subjectParts.push(`${updatedCount} updated`);
    if (discCount > 0) subjectParts.push(`${discCount} discussion${discCount > 1 ? "s" : ""}`);
    const subject = subjectParts.length > 0
      ? `CAM Library Update — ${subjectParts.join(" \u00B7 ")}`
      : "CAM Library — Daily Digest";

    const entriesHtml = params.entries
      .map((e) => {
        const badge = e.isNew
          ? `<span style="display:inline-block;background:#059669;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:8px;">NEW</span>`
          : `<span style="display:inline-block;background:#2563eb;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:8px;">UPDATED</span>`;
        const scoreColor = e.score >= 35 ? "#059669" : e.score >= 30 ? "#0284c7" : "#b45309";
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
              <strong style="color:#0f172a;font-size:14px;">${escapeHtml(e.title)}</strong>${badge}
              <br/><span style="color:#6b7280;font-size:12px;">${escapeHtml(e.camId)} • ${escapeHtml(e.modeLabel)} • ${escapeHtml(e.category)}</span>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
              <span style="font-weight:700;font-size:16px;color:${scoreColor};">${e.score}/40</span>
            </td>
          </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">\uD83D\uDCCA CAM Library — Daily Update</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${params.dateLabel}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 20px;">
            ${newCount > 0 || updatedCount > 0 ? [
              newCount > 0 ? `<strong>${newCount}</strong> new module${newCount > 1 ? "s" : ""}` : "",
              newCount > 0 && updatedCount > 0 ? " and " : "",
              updatedCount > 0 ? `<strong>${updatedCount}</strong> updated module${updatedCount > 1 ? "s" : ""}` : "",
              " added to the Nexus CAM Library",
              discCount > 0 ? `, plus <strong>${discCount}</strong> new discussion${discCount > 1 ? "s" : ""} on modules you follow` : "",
              ":",
            ].join("") : `New discussion activity on <strong>${discCount}</strong> module${discCount > 1 ? "s" : ""} you follow:`}
          </p>

          ${params.entries.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Module</th>
                <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Score</th>
              </tr>
            </thead>
            <tbody>
              ${entriesHtml}
            </tbody>
          </table>` : ""}

          ${params.discussionEntries && params.discussionEntries.length > 0 ? `
          <h3 style="margin:${params.entries.length > 0 ? "24px" : "0"} 0 12px;font-size:15px;color:#0f172a;">\uD83D\uDCAC Discussion Activity</h3>
          <p style="margin:0 0 12px;font-size:13px;color:#4b5563;">New replies in discussions you're following:</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f0f9ff;">
                <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#0369a1;border-bottom:1px solid #bae6fd;">Thread</th>
                <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:#0369a1;border-bottom:1px solid #bae6fd;width:60px;">Replies</th>
              </tr>
            </thead>
            <tbody>
              ${params.discussionEntries.map((d) => `
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
                  <strong style="color:#0f172a;font-size:13px;">${escapeHtml(d.threadTitle)}</strong>
                  <br/><span style="color:#6b7280;font-size:11px;">${escapeHtml(d.camSection)} \u00B7 by ${escapeHtml(d.authors.join(", "))}</span>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
                  <span style="font-weight:700;font-size:14px;color:#2563eb;">${d.newMessageCount}</span>
                </td>
              </tr>`).join("")}
            </tbody>
          </table>` : ""}

          <p style="margin: 24px 0 24px; text-align: center;">
            <a href="${params.shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View in CAM Library
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated daily digest from NEXUS. You received this because you have active access to the CAM Library. The CAM Library contains confidential and proprietary information protected under the CNDA+ agreement.</p>
        </div>
      </div>
    `.trim();

    const entriesText = params.entries
      .map((e) => `  ${e.isNew ? "[NEW]" : "[UPD]"} ${e.camId} — ${e.title} (${e.score}/40)`)
      .join("\n");
    const discText = params.discussionEntries
      ? params.discussionEntries
          .map(
            (d) =>
              `  [DISC] ${d.camSection} — "${d.threadTitle}" (${d.newMessageCount} new reply${d.newMessageCount > 1 ? "s" : ""} by ${d.authors.join(", ")})`,
          )
          .join("\n")
      : "";
    const textParts = [entriesText, discText].filter(Boolean).join("\n\n");
    const text = `CAM Library Daily Update — ${params.dateLabel}\n\nHello ${name},\n\n${textParts}\n\nView in CAM Library: ${params.shareUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send device verification code for untrusted device login.
   */
  /**
   * Send a CAM discussion notification when someone posts a new message.
   * Includes thread context, message preview, view CTA, and mute link.
   */
  async sendDiscussionNotification(params: {
    toEmail: string;
    recipientName?: string;
    threadTitle: string;
    camSection: string;
    authorName: string;
    messagePreview: string;
    threadUrl: string;
    muteUrl: string;
  }) {
    const name = params.recipientName || "there";
    const subject = `New reply in "${params.threadTitle}" — ${params.camSection}`;

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 16px;">\uD83D\uDCAC New Discussion Reply</h1>
          <p style="margin: 6px 0 0; opacity: 0.85; font-size: 13px;">${escapeHtml(params.camSection)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 16px;"><strong>${escapeHtml(params.authorName)}</strong> replied in the discussion:</p>

          <div style="background: #f9fafb; border-left: 3px solid #3b82f6; padding: 12px 16px; margin: 0 0 20px; border-radius: 0 6px 6px 0;">
            <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #0f172a;">${escapeHtml(params.threadTitle)}</p>
            <p style="margin: 0; color: #4b5563; font-size: 13px;">${escapeHtml(params.messagePreview)}</p>
          </div>

          <p style="margin: 0 0 24px; text-align: center;">
            <a href="${params.threadUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              View Discussion
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">
            You received this because you're a participant in this discussion.
            <a href="${params.muteUrl}" style="color: #6b7280; text-decoration: underline;">Mute this thread</a>
          </p>
        </div>
      </div>
    `.trim();

    const text = `New reply in "${params.threadTitle}" (${params.camSection})\n\n${params.authorName} wrote:\n${params.messagePreview}\n\nView discussion: ${params.threadUrl}\nMute this thread: ${params.muteUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  /**
   * Send device verification code for untrusted device login.
   */
  /**
   * Send a NexAGG bulk procurement opportunity alert to admins/executives.
   */
  async sendBulkOpportunityAlert(params: {
    toEmail: string;
    recipientName?: string;
    opportunityTitle: string;
    clusterLabel: string;
    totalProjectCount: number;
    totalMaterialCount: number;
    estimatedTotalValue: number;
    estimatedSavingsPercent: number;
    topMaterials: Array<{
      description: string;
      totalQty: number;
      unit: string;
      avgUnitCost: number;
      projectCount: number;
    }>;
    reviewUrl: string;
    isUpdate: boolean;
  }) {
    const name = params.recipientName || "there";
    const prefix = params.isUpdate ? "Updated" : "New";
    const subject = `\uD83D\uDCE6 ${prefix} Bulk Procurement Opportunity — ${params.clusterLabel}`;
    const fmtVal = params.estimatedTotalValue >= 1000
      ? `$${(params.estimatedTotalValue / 1000).toFixed(1)}k`
      : `$${params.estimatedTotalValue.toFixed(0)}`;
    const fmtSavings = `$${((params.estimatedTotalValue * params.estimatedSavingsPercent) / 100).toFixed(0)}`;

    const materialsHtml = params.topMaterials
      .slice(0, 5)
      .map(
        (m) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(m.description.slice(0, 60))}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${m.totalQty.toFixed(1)} ${escapeHtml(m.unit)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${m.projectCount}</td>
          </tr>`,
      )
      .join("");

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">\uD83D\uDCE6 ${prefix} Bulk Buy Opportunity</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${escapeHtml(params.clusterLabel)}</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${escapeHtml(name)},</p>
          <p style="margin: 0 0 20px;">NexAGG has detected a consolidation opportunity across <strong>${params.totalProjectCount}</strong> projects in <strong>${escapeHtml(params.clusterLabel)}</strong>.</p>

          <div style="display:flex;gap:12px;margin:0 0 20px;">
            <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#059669;">${fmtVal}</div>
              <div style="font-size:11px;color:#6b7280;">Total Value</div>
            </div>
            <div style="flex:1;background:#f0f9ff;border-radius:8px;padding:12px 16px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#2563eb;">~${fmtSavings}</div>
              <div style="font-size:11px;color:#6b7280;">Est. Savings (~${params.estimatedSavingsPercent}%)</div>
            </div>
            <div style="flex:1;background:#faf5ff;border-radius:8px;padding:12px 16px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#7c3aed;">${params.totalMaterialCount}</div>
              <div style="font-size:11px;color:#6b7280;">Materials</div>
            </div>
          </div>

          <h3 style="margin:0 0 8px;font-size:14px;color:#374151;">Top Materials</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Material</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Total Qty</th>
                <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Projects</th>
              </tr>
            </thead>
            <tbody>${materialsHtml}</tbody>
          </table>

          <p style="margin: 24px 0; text-align: center;">
            <a href="${params.reviewUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Review Opportunity
            </a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated alert from NEXUS NexAGG. Bulk procurement opportunities are detected by scanning approved PETLs across your active projects.</p>
        </div>
      </div>
    `.trim();

    const matText = params.topMaterials
      .slice(0, 5)
      .map((m) => `  - ${m.description.slice(0, 60)} — ${m.totalQty} ${m.unit} across ${m.projectCount} projects`)
      .join("\n");
    const text = `${prefix} Bulk Buy Opportunity — ${params.clusterLabel}\n\nHello ${name},\n\n${params.totalProjectCount} projects · ${params.totalMaterialCount} materials · Est. value: ${fmtVal} · Est. savings: ~${params.estimatedSavingsPercent}%\n\nTop materials:\n${matText}\n\nReview: ${params.reviewUrl}\n`;

    return this.sendMail({ to: params.toEmail, subject, html, text });
  }

  async sendDeviceVerificationCode(params: {
    toEmail: string;
    code: string;
    devicePlatform: string;
    deviceName?: string;
  }) {
    const subject = "Nexus — Verify your device";
    const deviceLabel = params.deviceName
      ? `${escapeHtml(params.deviceName)} (${escapeHtml(params.devicePlatform)})`
      : escapeHtml(params.devicePlatform);

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">🔐 Device Verification Required</h1>
          <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">A sign-in attempt from an unrecognized device</p>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Someone is trying to sign in to your Nexus account from a new device:</p>

          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Device</p>
            <p style="margin: 0; font-weight: 600;">${deviceLabel}</p>
          </div>

          <p style="margin: 0 0 8px;">Enter this code to verify it's you:</p>

          <div style="background: #f9fafb; border: 2px dashed #d1d5db; border-radius: 12px; padding: 20px; margin: 0 0 20px; text-align: center;">
            <span style="font-family: 'SF Mono', SFMono-Regular, Menlo, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827;">${params.code}</span>
          </div>

          <p style="margin: 0 0 16px; color: #6b7280; font-size: 13px;">This code expires in <strong>10 minutes</strong>.</p>

          <div style="background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px 16px; margin: 0 0 20px; border-radius: 0 6px 6px 0;">
            <p style="margin: 0; color: #92400e; font-size: 13px;"><strong>Didn't try to sign in?</strong> Someone may have your password. Change it immediately in your Nexus settings.</p>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated security email from NEXUS. Do not share this code with anyone.</p>
        </div>
      </div>
    `.trim();

    const text = `Nexus Device Verification\n\nSomeone is trying to sign in from: ${params.deviceName || params.devicePlatform}\n\nYour verification code: ${params.code}\n\nThis code expires in 10 minutes.\n\nIf you didn't try to sign in, change your password immediately.\n`;

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
