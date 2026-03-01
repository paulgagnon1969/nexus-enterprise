import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { EmailReceiptConnectorStatus } from "@prisma/client";
import {
  encryptConnectorPassword,
  decryptConnectorPassword,
} from "../../common/crypto/connector.crypto";
import { ImapFlow } from "imapflow";

// ── DTOs ───────────────────────────────────────────────────────────────

export interface CreateConnectorDto {
  label: string;
  imapHost: string;
  imapPort?: number;
  imapUser: string;
  imapPassword: string; // plaintext — encrypted before storage
  imapMailbox?: string;
}

export interface UpdateConnectorDto {
  label?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPassword?: string; // only re-encrypted if provided
  imapMailbox?: string;
  status?: "ACTIVE" | "PAUSED";
}

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class ReceiptEmailConnectorService {
  constructor(private readonly prisma: PrismaService) {}

  /** List all connectors for the tenant (never returns the encrypted password). */
  async list(actor: AuthenticatedUser) {
    const connectors = await this.prisma.emailReceiptConnector.findMany({
      where: { companyId: actor.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        connectedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        _count: { select: { receipts: true } },
      },
    });

    // Strip encrypted password from response
    return connectors.map((c) => ({
      id: c.id,
      companyId: c.companyId,
      label: c.label,
      imapHost: c.imapHost,
      imapPort: c.imapPort,
      imapUser: c.imapUser,
      imapMailbox: c.imapMailbox,
      status: c.status,
      lastPolledAt: c.lastPolledAt,
      lastPollError: c.lastPollError,
      totalReceiptsIngested: c.totalReceiptsIngested,
      connectedBy: c.connectedBy,
      receiptsCount: c._count.receipts,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /** Get a single connector by ID. */
  async getById(actor: AuthenticatedUser, id: string) {
    const c = await this.prisma.emailReceiptConnector.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        connectedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        _count: { select: { receipts: true } },
      },
    });
    if (!c) throw new NotFoundException("Connector not found");

    return {
      id: c.id,
      companyId: c.companyId,
      label: c.label,
      imapHost: c.imapHost,
      imapPort: c.imapPort,
      imapUser: c.imapUser,
      imapMailbox: c.imapMailbox,
      status: c.status,
      lastPolledAt: c.lastPolledAt,
      lastPollError: c.lastPollError,
      totalReceiptsIngested: c.totalReceiptsIngested,
      connectedBy: c.connectedBy,
      receiptsCount: c._count.receipts,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /** Create a new connector (encrypts password). */
  async create(actor: AuthenticatedUser, dto: CreateConnectorDto) {
    // Check for duplicate
    const existing = await this.prisma.emailReceiptConnector.findFirst({
      where: {
        companyId: actor.companyId,
        imapUser: dto.imapUser,
        imapMailbox: dto.imapMailbox || "INBOX",
        status: { not: EmailReceiptConnectorStatus.DISCONNECTED },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A connector for ${dto.imapUser} / ${dto.imapMailbox || "INBOX"} already exists`,
      );
    }

    const encrypted = encryptConnectorPassword(dto.imapPassword);

    const connector = await this.prisma.emailReceiptConnector.create({
      data: {
        companyId: actor.companyId,
        label: dto.label,
        imapHost: dto.imapHost,
        imapPort: dto.imapPort ?? 993,
        imapUser: dto.imapUser,
        imapPasswordEncrypted: new Uint8Array(encrypted),
        imapMailbox: dto.imapMailbox || "INBOX",
        connectedByUserId: actor.userId,
      },
    });

    return {
      id: connector.id,
      label: connector.label,
      imapHost: connector.imapHost,
      imapPort: connector.imapPort,
      imapUser: connector.imapUser,
      imapMailbox: connector.imapMailbox,
      status: connector.status,
      createdAt: connector.createdAt,
    };
  }

  /** Update connector fields (re-encrypts password if changed). */
  async update(actor: AuthenticatedUser, id: string, dto: UpdateConnectorDto) {
    const existing = await this.prisma.emailReceiptConnector.findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!existing) throw new NotFoundException("Connector not found");

    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.imapHost !== undefined) data.imapHost = dto.imapHost;
    if (dto.imapPort !== undefined) data.imapPort = dto.imapPort;
    if (dto.imapUser !== undefined) data.imapUser = dto.imapUser;
    if (dto.imapMailbox !== undefined) data.imapMailbox = dto.imapMailbox;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.imapPassword) {
      data.imapPasswordEncrypted = new Uint8Array(encryptConnectorPassword(dto.imapPassword));
    }

    // If status set back to ACTIVE, clear last error
    if (dto.status === "ACTIVE") {
      data.lastPollError = null;
    }

    const updated = await this.prisma.emailReceiptConnector.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      label: updated.label,
      imapHost: updated.imapHost,
      imapPort: updated.imapPort,
      imapUser: updated.imapUser,
      imapMailbox: updated.imapMailbox,
      status: updated.status,
      lastPolledAt: updated.lastPolledAt,
      lastPollError: updated.lastPollError,
      totalReceiptsIngested: updated.totalReceiptsIngested,
      updatedAt: updated.updatedAt,
    };
  }

  /** Soft-delete: set status to DISCONNECTED. */
  async remove(actor: AuthenticatedUser, id: string) {
    const existing = await this.prisma.emailReceiptConnector.findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!existing) throw new NotFoundException("Connector not found");

    await this.prisma.emailReceiptConnector.update({
      where: { id },
      data: { status: EmailReceiptConnectorStatus.DISCONNECTED },
    });

    return { success: true };
  }

  /** Test IMAP connection — tries to connect and list mailboxes. */
  async testConnection(actor: AuthenticatedUser, id: string) {
    const connector = await this.prisma.emailReceiptConnector.findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!connector) throw new NotFoundException("Connector not found");

    let password: string;
    try {
      password = decryptConnectorPassword(
        Buffer.from(connector.imapPasswordEncrypted),
      );
    } catch {
      throw new BadRequestException("Failed to decrypt stored password");
    }

    const client = new ImapFlow({
      host: connector.imapHost,
      port: connector.imapPort,
      secure: connector.imapPort === 993,
      auth: { user: connector.imapUser, pass: password },
      logger: false as any,
    });

    try {
      await client.connect();
      const mailboxes = await client.list();
      await client.logout();

      // Update status to ACTIVE if it was in ERROR
      if (connector.status === EmailReceiptConnectorStatus.ERROR) {
        await this.prisma.emailReceiptConnector.update({
          where: { id },
          data: {
            status: EmailReceiptConnectorStatus.ACTIVE,
            lastPollError: null,
          },
        });
      }

      return {
        success: true,
        mailboxes: mailboxes.map((mb) => ({
          path: mb.path,
          name: mb.name,
        })),
      };
    } catch (err: any) {
      // Persist the error
      await this.prisma.emailReceiptConnector.update({
        where: { id },
        data: {
          status: EmailReceiptConnectorStatus.ERROR,
          lastPollError: err?.message || "Connection failed",
        },
      });

      return {
        success: false,
        error: err?.message || "Connection failed",
      };
    }
  }

  /** Trigger an immediate poll for a single connector (lightweight — just marks unseen count). */
  async triggerPoll(actor: AuthenticatedUser, id: string) {
    const connector = await this.prisma.emailReceiptConnector.findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!connector) throw new NotFoundException("Connector not found");

    if (connector.status === EmailReceiptConnectorStatus.DISCONNECTED) {
      throw new BadRequestException("Connector is disconnected");
    }

    let password: string;
    try {
      password = decryptConnectorPassword(
        Buffer.from(connector.imapPasswordEncrypted),
      );
    } catch {
      throw new BadRequestException("Failed to decrypt stored password");
    }

    // We import the poll function dynamically to avoid circular deps
    const { pollSingleConnector } = await import("../../receipt-email-poller");
    try {
      const result = await pollSingleConnector({
        connectorId: connector.id,
        companyId: connector.companyId,
        imapHost: connector.imapHost,
        imapPort: connector.imapPort,
        imapUser: connector.imapUser,
        imapPassword: password,
        imapMailbox: connector.imapMailbox,
      });
      return result;
    } catch (err: any) {
      throw new BadRequestException(err?.message || "Poll failed");
    }
  }
}
