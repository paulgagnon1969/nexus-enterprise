import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { MessagingService } from "./messaging.service";

/**
 * Lightweight inbound email webhook.
 *
 * This endpoint is intended to be called by a separate worker that reads
 * replies from Gmail (via IMAP/Gmail API) and posts them here. It is secured
 * via a shared secret header rather than JWT.
 */
@Controller("email-inbound")
export class InboundEmailController {
  constructor(private readonly messaging: MessagingService) {}

  @Post()
  @HttpCode(204)
  async handleInbound(
    @Headers("x-email-inbound-secret") secret: string | undefined,
    @Body()
    body: {
      subject?: string | null;
      fromEmail?: string | null;
      textBody?: string | null;
      htmlBody?: string | null;
      threadId?: string | null;
    },
  ) {
    const expected = process.env.EMAIL_INBOUND_SECRET;
    if (!expected || !secret || secret !== expected) {
      throw new UnauthorizedException("Invalid email inbound secret");
    }

    const fromEmail = (body.fromEmail || "").trim();
    if (!fromEmail) {
      // Nothing to do.
      return;
    }

    let threadId = body.threadId?.trim() || "";
    const subject = body.subject || "";

    // If caller didn't pass threadId explicitly, try to infer it from the
    // subject line token: [NCC-THREAD:<threadId>]
    if (!threadId && subject) {
      const match = subject.match(/\[NCC-THREAD:([^\]]+)\]/);
      if (match && match[1]) {
        threadId = match[1];
      }
    }

    if (!threadId) {
      // Cannot map this email back to a thread; ignore.
      return;
    }

    const bodyText = (body.textBody || body.htmlBody || "").trim();
    if (!bodyText) {
      return;
    }

    await this.messaging.addInboundEmailToThread({
      threadId,
      fromEmail,
      subject,
      body: bodyText,
    });
  }
}
