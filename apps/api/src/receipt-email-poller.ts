/**
 * Receipt Email Poller
 *
 * Connects to configured receipt-collection mailboxes via IMAP, reads unseen
 * messages, extracts image/PDF attachments, uploads them to GCS, creates
 * EmailReceipt records, and enqueues OCR jobs on the BullMQ import-jobs queue.
 *
 * Supports two modes:
 *   1. Connector-based — reads all ACTIVE EmailReceiptConnector records from DB
 *   2. Env-var fallback — uses RECEIPT_EMAIL_IMAP_* env vars (legacy)
 *
 * Run standalone:  ts-node src/receipt-email-poller.ts
 * Or schedule via Cloud Scheduler / cron.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail, Attachment } from "mailparser";
import {
  PrismaClient,
  EmailReceiptStatus,
  EmailReceiptConnectorStatus,
} from "@prisma/client";
import { ObjectStorageService } from "./infra/storage/object-storage.service";
import { GcsStorageService } from "./infra/storage/gcs-storage.service";
import { MinioStorageService } from "./infra/storage/minio-storage.service";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import path from "node:path";
import crypto from "node:crypto";
import { decryptConnectorPassword } from "./common/crypto/connector.crypto";

// ── Config ─────────────────────────────────────────────────────────────

const GCS_BUCKET = process.env.GCS_UPLOADS_BUCKET || "";
const GCS_PREFIX = "receipts/email/";

const REDIS_URL = process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || "";
const IMPORT_QUEUE_NAME = "import-jobs";

// Legacy env-var config (fallback when no connectors exist)
const IMAP_HOST = process.env.RECEIPT_EMAIL_IMAP_HOST || process.env.EMAIL_IMAP_HOST || "imap.gmail.com";
const IMAP_PORT = Number(process.env.RECEIPT_EMAIL_IMAP_PORT || process.env.EMAIL_IMAP_PORT || "993");
const IMAP_USER = process.env.RECEIPT_EMAIL_IMAP_USER || "";
const IMAP_PASS = process.env.RECEIPT_EMAIL_IMAP_PASS || "";
const IMAP_MAILBOX = process.env.RECEIPT_EMAIL_IMAP_MAILBOX || "INBOX";
const COMPANY_ID = process.env.RECEIPT_EMAIL_COMPANY_ID || "";

// ── Helpers ────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const storage: ObjectStorageService =
  process.env.STORAGE_PROVIDER === "minio"
    ? new MinioStorageService()
    : new GcsStorageService();

function log(msg: string, meta?: Record<string, unknown>) {
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  console.log(`[receipt-email-poller] ${line}`);
}

function warn(msg: string, meta?: Record<string, unknown>) {
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  console.warn(`[receipt-email-poller] ${line}`);
}

const RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function isReceiptAttachment(att: Attachment): boolean {
  if (!att.contentType) return false;
  return RECEIPT_MIME_TYPES.has(att.contentType.toLowerCase());
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const key = `${GCS_PREFIX}${Date.now()}-${crypto.randomBytes(4).toString("hex")}/${sanitizeFilename(filename)}`;

  return storage.uploadBuffer({
    bucket: GCS_BUCKET || undefined,
    key,
    buffer,
    contentType,
  });
}

// ── Connector poll config ──────────────────────────────────────────────

export interface ConnectorPollConfig {
  connectorId: string;
  companyId: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string; // already decrypted
  imapMailbox: string;
}

export interface PollResult {
  connectorId: string | null;
  messagesFound: number;
  receiptsCreated: number;
  errors: number;
}

// ── Core poll logic (shared by standalone + on-demand) ─────────────────

export async function pollSingleConnector(
  config: ConnectorPollConfig,
  queue?: Queue | null,
): Promise<PollResult> {
  const result: PollResult = {
    connectorId: config.connectorId,
    messagesFound: 0,
    receiptsCreated: 0,
    errors: 0,
  };

  if (!GCS_BUCKET) {
    throw new Error("GCS_UPLOADS_BUCKET must be set");
  }

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.imapUser, pass: config.imapPassword },
  });

  log("Connecting to IMAP", {
    host: config.imapHost,
    port: config.imapPort,
    user: config.imapUser,
    mailbox: config.imapMailbox,
    connectorId: config.connectorId,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.imapMailbox);

    try {
      const unseen = await client.search({ seen: false });
      if (!unseen || unseen.length === 0) {
        log("No unseen messages", { connectorId: config.connectorId });
        return result;
      }

      result.messagesFound = unseen.length;
      log(`Found ${unseen.length} unseen messages`, { connectorId: config.connectorId });

      for (const seq of unseen) {
        try {
          const message = await client.fetchOne(seq, { envelope: true, source: true });
          if (!message || !(message as any).source) {
            await client.messageFlagsAdd(seq, ["\\Seen"]);
            continue;
          }

          const parsed: ParsedMail = await simpleParser((message as any).source as Buffer);
          const fromAddr = parsed.from?.value?.[0]?.address || "";
          const subject = parsed.subject || "";
          const messageId = parsed.messageId || null;
          const receivedAt = parsed.date || new Date();

          if (!fromAddr) {
            warn("Skipping message without sender", { uid: (message as any).uid });
            await client.messageFlagsAdd(seq, ["\\Seen"]);
            continue;
          }

          // De-duplicate by Message-ID
          if (messageId) {
            const existing = await prisma.emailReceipt.findUnique({
              where: { messageId },
              select: { id: true },
            });
            if (existing) {
              log("Skipping duplicate message", { messageId });
              await client.messageFlagsAdd(seq, ["\\Seen"]);
              continue;
            }
          }

          // Extract receipt attachments
          const attachments = (parsed.attachments || []).filter(isReceiptAttachment);

          if (attachments.length === 0) {
            warn("No receipt attachments found; skipping", { from: fromAddr, subject });
            await client.messageFlagsAdd(seq, ["\\Seen"]);
            continue;
          }

          // Upload attachments to GCS
          const attachmentUrls: string[] = [];
          for (const att of attachments) {
            try {
              const url = await uploadToStorage(
                att.content,
                att.filename || `receipt-${Date.now()}.${att.contentType?.split("/")[1] || "bin"}`,
                att.contentType || "application/octet-stream",
              );
              attachmentUrls.push(url);
            } catch (err: any) {
              warn(`Failed to upload attachment: ${err?.message}`, {
                filename: att.filename,
              });
            }
          }

          if (attachmentUrls.length === 0) {
            warn("All attachment uploads failed; skipping", { from: fromAddr, subject });
            await client.messageFlagsAdd(seq, ["\\Seen"]);
            continue;
          }

          // Build raw email JSON (strip attachments content for storage)
          const toField = parsed.to;
          const toText = toField && !Array.isArray(toField) ? toField.text : "";
          const rawEmailJson = {
            from: fromAddr,
            to: toText || "",
            subject,
            date: receivedAt.toISOString(),
            messageId,
            textBody: (parsed.text || "").slice(0, 5000),
            attachmentCount: attachments.length,
          };

          // Create EmailReceipt record
          const receipt = await prisma.emailReceipt.create({
            data: {
              companyId: config.companyId,
              tenantEmailAddress: config.imapUser,
              senderEmail: fromAddr,
              subject,
              receivedAt,
              messageId,
              rawEmailJson,
              attachmentUrls: JSON.stringify(attachmentUrls),
              status: EmailReceiptStatus.PENDING_OCR,
              connectorId: config.connectorId || undefined,
            },
          });

          result.receiptsCreated++;
          log("Created EmailReceipt", {
            id: receipt.id,
            from: fromAddr,
            attachments: attachmentUrls.length,
            connectorId: config.connectorId,
          });

          // Enqueue OCR job
          if (queue) {
            await queue.add(
              "receipt-email-ocr",
              {
                emailReceiptId: receipt.id,
                companyId: config.companyId,
                attachmentUrls,
              },
              { removeOnComplete: 100, removeOnFail: 200 },
            );
            log("Enqueued OCR job", { emailReceiptId: receipt.id });
          }

          // Mark as seen in IMAP
          await client.messageFlagsAdd(seq, ["\\Seen"]);
        } catch (err: any) {
          result.errors++;
          warn(`Error processing message: ${err?.message ?? err}`);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    // Update connector status to ERROR if this is a DB connector
    if (config.connectorId) {
      await prisma.emailReceiptConnector.update({
        where: { id: config.connectorId },
        data: {
          status: EmailReceiptConnectorStatus.ERROR,
          lastPollError: err?.message || "Poll failed",
          lastPolledAt: new Date(),
        },
      }).catch(() => {}); // best-effort
    }
    throw err;
  }

  // Update connector tracking on success
  if (config.connectorId) {
    await prisma.emailReceiptConnector.update({
      where: { id: config.connectorId },
      data: {
        lastPolledAt: new Date(),
        lastPollError: null,
        status: EmailReceiptConnectorStatus.ACTIVE,
        totalReceiptsIngested: { increment: result.receiptsCreated },
      },
    }).catch(() => {}); // best-effort
  }

  return result;
}

// ── Standalone entry point ─────────────────────────────────────────────

async function run() {
  if (!GCS_BUCKET) {
    console.error("[receipt-email-poller] GCS_UPLOADS_BUCKET must be set");
    process.exit(1);
  }

  // Set up BullMQ queue (optional — if no Redis, we still create records)
  let queue: Queue | null = null;
  if (REDIS_URL) {
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(IMPORT_QUEUE_NAME, { connection: redis as any });
  } else {
    warn("No REDIS_URL — EmailReceipt records will be created but OCR jobs will NOT be enqueued");
  }

  // ── Mode 1: Poll all active connectors from DB ──
  const connectors = await prisma.emailReceiptConnector.findMany({
    where: { status: EmailReceiptConnectorStatus.ACTIVE },
  });

  if (connectors.length > 0) {
    log(`Found ${connectors.length} active connector(s); polling each`);

    for (const conn of connectors) {
      try {
        const password = decryptConnectorPassword(
          Buffer.from(conn.imapPasswordEncrypted),
        );

        const result = await pollSingleConnector(
          {
            connectorId: conn.id,
            companyId: conn.companyId,
            imapHost: conn.imapHost,
            imapPort: conn.imapPort,
            imapUser: conn.imapUser,
            imapPassword: password,
            imapMailbox: conn.imapMailbox,
          },
          queue,
        );

        log("Connector poll complete", {
          connectorId: conn.id,
          label: conn.label,
          messagesFound: result.messagesFound,
          receiptsCreated: result.receiptsCreated,
          errors: result.errors,
        });
      } catch (err: any) {
        warn(`Connector poll failed: ${err?.message ?? err}`, {
          connectorId: conn.id,
          label: conn.label,
        });
      }
    }
  } else {
    // ── Mode 2: Legacy env-var fallback ──
    if (!IMAP_USER || !IMAP_PASS) {
      log("No connectors found and no RECEIPT_EMAIL_IMAP_USER/PASS env vars; nothing to do");
      return;
    }
    if (!COMPANY_ID) {
      console.error("[receipt-email-poller] RECEIPT_EMAIL_COMPANY_ID must be set for env-var mode");
      process.exit(1);
    }

    log("No connectors in DB; using env-var config");
    await pollSingleConnector(
      {
        connectorId: "",
        companyId: COMPANY_ID,
        imapHost: IMAP_HOST,
        imapPort: IMAP_PORT,
        imapUser: IMAP_USER,
        imapPassword: IMAP_PASS,
        imapMailbox: IMAP_MAILBOX,
      },
      queue,
    );
  }

  // Cleanup
  await prisma.$disconnect();
  if (queue) await queue.close();
}

// Only auto-run when executed directly (not when imported by the API service)
if (require.main === module) {
  run().catch((err) => {
    console.error("[receipt-email-poller] Unhandled", err);
    process.exit(1);
  });
}
