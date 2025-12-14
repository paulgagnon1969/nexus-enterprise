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

  async sendMail(params: { to: string; subject: string; html: string; text?: string }) {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      this.logger.warn("EMAIL_FROM is not set; skipping email send.");
      return { ok: false, skipped: true };
    }

    const transport = this.getTransport();
    if (!transport) {
      this.logger.warn(
        `SMTP not configured (EMAIL_SMTP_HOST/USER/PASS). Skipping email send to ${params.to}.`,
      );
      return { ok: false, skipped: true };
    }

    await transport.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    return { ok: true };
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
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
