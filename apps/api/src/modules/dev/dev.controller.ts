import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { EmailService } from "../../common/email.service";
import { MessageBirdSmsClient } from "../../common/messagebird-sms.client";

interface CreateSnapshotDto {
  label?: string;
}

interface TestEmailDto {
  to?: string;
}

interface TestSmsDto {
  to?: string;
  body?: string;
}

@Controller("dev")
export class DevController {
  constructor(
    private readonly email: EmailService,
    private readonly sms: MessageBirdSmsClient,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post("snapshots")
  async createSnapshot(@Req() req: any, @Body() body: CreateSnapshotDto) {
    const user = req.user as AuthenticatedUser;
    // TODO: Wire this to a real CI/GitHub Action or server-side script that
    // creates a git tag / "dev snapshot" from the current repo state.
    // For now we just log and return a fake id.

    const label = body.label || "dev-snapshot";
    const ts = new Date().toISOString();

    console.log("[DevSnapshot] Requested by", {
      userId: user.userId,
      companyId: user.companyId,
      label,
      timestamp: ts,
    });

    return {
      ok: true,
      snapshotId: `${label}-${ts}`,
    };
  }

  // Dev-only helper to verify API -> Resend connectivity through the shared EmailService.
  // Requires a valid JWT (same as other /dev endpoints).
  @UseGuards(JwtAuthGuard)
  @Post("test-resend-email")
  async sendTestResendEmail(@Req() req: any, @Body() body: TestEmailDto) {
    const user = req.user as AuthenticatedUser;

    const to = body.to || process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
    if (!to) {
      return {
        ok: false,
        skipped: true,
        reason:
          "No recipient email specified and RESEND_FROM_EMAIL/EMAIL_FROM is not configured in this environment.",
      };
    }

    const subject = "Nexus dev test email";
    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">Nexus dev test email</h2>
        <p style="margin: 0 0 8px;">This is a test email sent from the Nexus API using the shared EmailService.</p>
        <p style="margin: 0 0 8px;">Triggered by user ID: <code>${user.userId}</code>.</p>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">If you did not expect this email, you can safely ignore it.</p>
      </div>
    `;

    const result = await this.email.sendMail({ to, subject, html });

    return {
      to,
      ok: !!result.ok,
      skipped: (result as any).skipped,
      reason: (result as any).reason,
      provider: (result as any).provider,
      status: (result as any).status,
      body: (result as any).body,
      error: (result as any).error,
    };
  }

  // Dev-only helper to verify API -> MessageBird SMS connectivity.
  // Requires a valid JWT (same as other /dev endpoints).
  @UseGuards(JwtAuthGuard)
  @Post("test-sms")
  async sendTestSms(@Req() req: any, @Body() body: TestSmsDto) {
    const user = req.user as AuthenticatedUser;

    const to = body.to || process.env.TEST_SMS_TO || "";
    const smsBody =
      body.body ||
      `Nexus dev test SMS from user ${user.userId} at ${new Date().toISOString()}`;

    if (!to) {
      return {
        ok: false,
        skipped: true,
        reason:
          "No recipient phone specified and TEST_SMS_TO is not configured in this environment.",
      };
    }

    try {
      const result = await this.sms.sendSms(to, smsBody);
      return {
        ok: true,
        to,
        id: result?.id,
      };
    } catch (err: any) {
      return {
        ok: false,
        to,
        error: err?.message ?? String(err),
      };
    }
  }
}
