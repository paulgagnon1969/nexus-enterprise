import { Injectable, Logger } from "@nestjs/common";
// Use CommonJS-style require here because the TypeScript typings / module
// shape for `messagebird` vary between versions (function export vs default
// export vs initClient). We normalize it at runtime.
// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any
const messagebirdModule: any = require("messagebird");

// Thin wrapper around the MessageBird SMS API so the rest of the app does not
// depend on the SDK directly.
@Injectable()
export class MessageBirdSmsClient {
  private readonly logger = new Logger(MessageBirdSmsClient.name);
  // Keep the client typed as `any` to avoid friction with the upstream typings.
  // Our wrapper ensures a small, well-defined surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any | null;

  constructor() {
    const apiKey = process.env.MESSAGEBIRD_API_KEY;
    if (!apiKey) {
      this.logger.warn("MESSAGEBIRD_API_KEY is not set; SMS sending will be disabled.");
      this.client = null;
      return;
    }

    // Normalize possible shapes:
    //  - function export: require('messagebird')('KEY')
    //  - default export: require('messagebird').default('KEY')
    //  - initClient: require('messagebird').initClient('KEY')
    const mbAny = messagebirdModule;
    const mbFactory =
      typeof mbAny === "function"
        ? mbAny
        : typeof mbAny?.default === "function"
        ? mbAny.default
        : typeof mbAny?.initClient === "function"
        ? mbAny.initClient
        : null;

    if (!mbFactory) {
      this.logger.error("Could not resolve MessageBird client factory; check SDK version.");
      this.client = null;
      return;
    }

    this.client = mbFactory(apiKey);
  }

  async sendSms(to: string, body: string): Promise<{ id?: string }> {
    if (!this.client) {
      this.logger.warn("MessageBird client is not initialized; skipping SMS send.");
      throw new Error("MessageBird client not initialized (missing api key)");
    }

    const originator = process.env.MESSAGEBIRD_SMS_ORIGINATOR;
    if (!originator) {
      this.logger.error("MESSAGEBIRD_SMS_ORIGINATOR is not set; cannot send SMS.");
      throw new Error("SMS originator not configured");
    }

    if (!to) {
      throw new Error("Missing SMS recipient (to)");
    }

    const trimmedTo = to.trim();
    const trimmedBody = (body || "").trim();
    if (!trimmedBody) {
      throw new Error("Missing SMS body");
    }

    const params = {
      originator,
      recipients: [trimmedTo],
      body: trimmedBody,
    };

    return new Promise((resolve, reject) => {
      // `messages.create` has callback signature (err, response).
      this.client.messages.create(params, (err: any, response: any) => {
        if (err) {
          this.logger.error("MessageBird SMS send failed", err);
          return reject(err);
        }
        this.logger.log(`MessageBird SMS queued: id=${response?.id}`);
        resolve({ id: response?.id });
      });
    });
  }
}