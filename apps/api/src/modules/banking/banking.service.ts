import { Inject, Injectable, BadRequestException, NotFoundException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PlaidApi, Products, CountryCode } from "plaid";
import { PLAID_CLIENT } from "../billing/plaid.provider";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

/** Filters for querying bank transactions. */
export interface TransactionFilters {
  startDate?: string;   // ISO date string YYYY-MM-DD
  endDate?: string;
  search?: string;      // name / merchantName substring
  category?: string;    // primaryCategory match
  minAmount?: number;
  maxAmount?: number;
  pending?: boolean;
  connectionId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);

  constructor(
    @Inject(PLAID_CLIENT) private readonly plaid: PlaidApi,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ───────────────────────────────────────────────
  // Plaid Link — Transactions product
  // ───────────────────────────────────────────────

  /** Create a Plaid Link token for connecting a bank with Transactions product. */
  async createTransactionsLinkToken(actor: AuthenticatedUser) {
    const redirectUri = this.config.get<string>("PLAID_REDIRECT_URI");

    const response = await this.plaid.linkTokenCreate({
      user: { client_user_id: actor.userId },
      client_name: "Nexus Connect",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });

    return { linkToken: response.data.link_token };
  }

  // ───────────────────────────────────────────────
  // Connect bank account
  // ───────────────────────────────────────────────

  /**
   * Exchange a Plaid public_token, store the access token + account info
   * as a BankConnection, and kick off the first sync.
   */
  async exchangeAndConnect(
    actor: AuthenticatedUser,
    publicToken: string,
    account: { id: string; name?: string; mask?: string; type?: string; subtype?: string },
    institution?: { institution_id?: string; name?: string },
  ) {
    // 1. Exchange public token → access token
    const exchangeResponse = await this.plaid.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // 2. Check for existing connection to same account
    const existing = await this.prisma.bankConnection.findUnique({
      where: {
        BankConnection_company_account_key: {
          companyId: actor.companyId,
          accountId: account.id,
        },
      },
    });

    if (existing) {
      // Re-activate if previously disconnected; update access token
      const updated = await this.prisma.bankConnection.update({
        where: { id: existing.id },
        data: {
          plaidAccessToken: accessToken,
          plaidItemId: itemId,
          status: "ACTIVE",
          syncCursor: null, // reset cursor for fresh sync
          institutionId: institution?.institution_id ?? existing.institutionId,
          institutionName: institution?.name ?? existing.institutionName,
        },
      });
      // Trigger initial sync
      await this.syncTransactions(updated.id);
      return updated;
    }

    // 3. Create new connection
    const connection = await this.prisma.bankConnection.create({
      data: {
        companyId: actor.companyId,
        plaidItemId: itemId,
        plaidAccessToken: accessToken,
        institutionId: institution?.institution_id ?? null,
        institutionName: institution?.name ?? null,
        accountId: account.id,
        accountName: account.name ?? null,
        accountMask: account.mask ?? null,
        accountType: account.type ?? null,
        accountSubtype: account.subtype ?? null,
        connectedByUserId: actor.userId,
      },
    });

    // 4. Trigger initial sync
    await this.syncTransactions(connection.id);
    return connection;
  }

  // ───────────────────────────────────────────────
  // Transaction Sync (cursor-based)
  // ───────────────────────────────────────────────

  /**
   * Sync transactions for a single connection using Plaid's transactions/sync
   * endpoint. Handles pagination (has_more) and upserts/deletes as needed.
   */
  async syncTransactions(connectionId: string): Promise<{ added: number; modified: number; removed: number }> {
    const connection = await this.prisma.bankConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });

    if (connection.status !== "ACTIVE") {
      throw new BadRequestException("Bank connection is not active");
    }

    let cursor = connection.syncCursor ?? "";
    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.plaid.transactionsSync({
        access_token: connection.plaidAccessToken,
        cursor: cursor || undefined,
        count: 500,
      });

      const { added, modified, removed, next_cursor, has_more } = response.data;

      // Upsert added transactions
      if (added.length > 0) {
        for (const txn of added) {
          await this.prisma.bankTransaction.upsert({
            where: { plaidTransactionId: txn.transaction_id },
            create: {
              companyId: connection.companyId,
              bankConnectionId: connection.id,
              plaidTransactionId: txn.transaction_id,
              accountId: txn.account_id,
              date: new Date(txn.date),
              datetime: txn.datetime ? new Date(txn.datetime) : null,
              name: txn.name,
              merchantName: txn.merchant_name ?? null,
              amount: txn.amount,
              isoCurrencyCode: txn.iso_currency_code ?? "USD",
              primaryCategory: txn.personal_finance_category?.primary ?? null,
              detailedCategory: txn.personal_finance_category?.detailed ?? null,
              pending: txn.pending,
              pendingTransactionId: txn.pending_transaction_id ?? null,
              paymentChannel: txn.payment_channel ?? null,
              transactionType: txn.transaction_type ?? null,
            },
            update: {
              date: new Date(txn.date),
              datetime: txn.datetime ? new Date(txn.datetime) : null,
              name: txn.name,
              merchantName: txn.merchant_name ?? null,
              amount: txn.amount,
              primaryCategory: txn.personal_finance_category?.primary ?? null,
              detailedCategory: txn.personal_finance_category?.detailed ?? null,
              pending: txn.pending,
              pendingTransactionId: txn.pending_transaction_id ?? null,
              paymentChannel: txn.payment_channel ?? null,
              transactionType: txn.transaction_type ?? null,
            },
          });
        }
        totalAdded += added.length;
      }

      // Upsert modified transactions
      if (modified.length > 0) {
        for (const txn of modified) {
          await this.prisma.bankTransaction.upsert({
            where: { plaidTransactionId: txn.transaction_id },
            create: {
              companyId: connection.companyId,
              bankConnectionId: connection.id,
              plaidTransactionId: txn.transaction_id,
              accountId: txn.account_id,
              date: new Date(txn.date),
              datetime: txn.datetime ? new Date(txn.datetime) : null,
              name: txn.name,
              merchantName: txn.merchant_name ?? null,
              amount: txn.amount,
              isoCurrencyCode: txn.iso_currency_code ?? "USD",
              primaryCategory: txn.personal_finance_category?.primary ?? null,
              detailedCategory: txn.personal_finance_category?.detailed ?? null,
              pending: txn.pending,
              pendingTransactionId: txn.pending_transaction_id ?? null,
              paymentChannel: txn.payment_channel ?? null,
              transactionType: txn.transaction_type ?? null,
            },
            update: {
              date: new Date(txn.date),
              datetime: txn.datetime ? new Date(txn.datetime) : null,
              name: txn.name,
              merchantName: txn.merchant_name ?? null,
              amount: txn.amount,
              primaryCategory: txn.personal_finance_category?.primary ?? null,
              detailedCategory: txn.personal_finance_category?.detailed ?? null,
              pending: txn.pending,
              pendingTransactionId: txn.pending_transaction_id ?? null,
              paymentChannel: txn.payment_channel ?? null,
              transactionType: txn.transaction_type ?? null,
            },
          });
        }
        totalModified += modified.length;
      }

      // Delete removed transactions
      if (removed.length > 0) {
        const removedIds = removed
          .map((r) => r.transaction_id)
          .filter((id): id is string => !!id);
        if (removedIds.length > 0) {
          await this.prisma.bankTransaction.deleteMany({
            where: { plaidTransactionId: { in: removedIds } },
          });
        }
        totalRemoved += removedIds.length;
      }

      cursor = next_cursor;
      hasMore = has_more;
    }

    // Update cursor + last synced timestamp
    await this.prisma.bankConnection.update({
      where: { id: connectionId },
      data: { syncCursor: cursor, lastSyncedAt: new Date() },
    });

    this.logger.log(
      `Synced connection ${connectionId}: +${totalAdded} ~${totalModified} -${totalRemoved}`,
    );

    return { added: totalAdded, modified: totalModified, removed: totalRemoved };
  }

  /** Sync all active connections for a tenant. */
  async syncAllConnections(companyId: string) {
    const connections = await this.prisma.bankConnection.findMany({
      where: { companyId, status: "ACTIVE" },
    });

    const results: Array<{ connectionId: string; added: number; modified: number; removed: number }> = [];
    for (const conn of connections) {
      try {
        const result = await this.syncTransactions(conn.id);
        results.push({ connectionId: conn.id, ...result });
      } catch (err: any) {
        this.logger.error(`Failed to sync connection ${conn.id}: ${err.message}`);
        // If Plaid returns ITEM_LOGIN_REQUIRED, mark for reauth
        if (err?.response?.data?.error_code === "ITEM_LOGIN_REQUIRED") {
          await this.prisma.bankConnection.update({
            where: { id: conn.id },
            data: { status: "REQUIRES_REAUTH" },
          });
        }
      }
    }

    return results;
  }

  // ───────────────────────────────────────────────
  // Query transactions
  // ───────────────────────────────────────────────

  /** Paginated, filterable transaction query. */
  async getTransactions(companyId: string, filters: TransactionFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const where: any = { companyId };

    if (filters.startDate) {
      where.date = { ...(where.date ?? {}), gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      where.date = { ...(where.date ?? {}), lte: new Date(filters.endDate) };
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { merchantName: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters.category) {
      where.primaryCategory = filters.category;
    }
    if (filters.minAmount !== undefined) {
      where.amount = { ...(where.amount ?? {}), gte: filters.minAmount };
    }
    if (filters.maxAmount !== undefined) {
      where.amount = { ...(where.amount ?? {}), lte: filters.maxAmount };
    }
    if (filters.pending !== undefined) {
      where.pending = filters.pending;
    }
    if (filters.connectionId) {
      where.bankConnectionId = filters.connectionId;
    }

    const [transactions, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      transactions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Aggregate summary: total inflow, outflow, net, by category. */
  async getTransactionSummary(companyId: string, startDate?: string, endDate?: string) {
    const where: any = { companyId, pending: false };
    if (startDate) where.date = { ...(where.date ?? {}), gte: new Date(startDate) };
    if (endDate) where.date = { ...(where.date ?? {}), lte: new Date(endDate) };

    const transactions = await this.prisma.bankTransaction.findMany({
      where,
      select: { amount: true, primaryCategory: true },
    });

    let totalInflow = 0;
    let totalOutflow = 0;
    const byCategory: Record<string, { inflow: number; outflow: number; count: number }> = {};

    for (const txn of transactions) {
      // Plaid: positive = money out (debit), negative = money in (credit)
      if (txn.amount < 0) {
        totalInflow += Math.abs(txn.amount);
      } else {
        totalOutflow += txn.amount;
      }

      const cat = txn.primaryCategory ?? "UNCATEGORIZED";
      if (!byCategory[cat]) byCategory[cat] = { inflow: 0, outflow: 0, count: 0 };
      byCategory[cat].count++;
      if (txn.amount < 0) {
        byCategory[cat].inflow += Math.abs(txn.amount);
      } else {
        byCategory[cat].outflow += txn.amount;
      }
    }

    return {
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      net: Math.round((totalInflow - totalOutflow) * 100) / 100,
      transactionCount: transactions.length,
      byCategory,
    };
  }

  // ───────────────────────────────────────────────
  // Connection management
  // ───────────────────────────────────────────────

  /** List all bank connections for a tenant. */
  async getConnections(companyId: string) {
    return this.prisma.bankConnection.findMany({
      where: { companyId },
      select: {
        id: true,
        institutionName: true,
        accountName: true,
        accountMask: true,
        accountType: true,
        accountSubtype: true,
        status: true,
        lastSyncedAt: true,
        createdAt: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Disconnect a bank connection and remove the Plaid item. */
  async disconnectBank(actor: AuthenticatedUser, connectionId: string) {
    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: connectionId, companyId: actor.companyId },
    });
    if (!connection) throw new NotFoundException("Bank connection not found");

    // Remove Plaid item (best-effort — may already be removed)
    try {
      await this.plaid.itemRemove({ access_token: connection.plaidAccessToken });
    } catch (err: any) {
      this.logger.warn(`Failed to remove Plaid item ${connection.plaidItemId}: ${err.message}`);
    }

    await this.prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: "DISCONNECTED" },
    });

    return { ok: true };
  }
}
