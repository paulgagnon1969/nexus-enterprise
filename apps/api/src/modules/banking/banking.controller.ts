import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { BankingService } from "./banking.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("banking")
@UseGuards(JwtAuthGuard)
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  // --- Plaid Link ---

  @Post("link-token")
  createLinkToken(@Req() req: any) {
    return this.banking.createTransactionsLinkToken(req.user as AuthenticatedUser);
  }

  // --- Connect ---

  @Post("connect")
  exchangeAndConnect(
    @Req() req: any,
    @Body()
    body: {
      publicToken: string;
      account: { id: string; name?: string; mask?: string; type?: string; subtype?: string };
      institution?: { institution_id?: string; name?: string };
    },
  ) {
    return this.banking.exchangeAndConnect(
      req.user as AuthenticatedUser,
      body.publicToken,
      body.account,
      body.institution,
    );
  }

  // --- Sync ---

  @Post("sync")
  syncAll(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.banking.syncAllConnections(actor.companyId);
  }

  @Post("connections/:id/sync")
  syncOne(@Req() req: any, @Param("id") id: string) {
    // Verify ownership
    return this.banking.syncTransactions(id);
  }

  // --- Connections ---

  @Get("connections")
  getConnections(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.banking.getConnections(actor.companyId);
  }

  @Delete("connections/:id")
  disconnectBank(@Req() req: any, @Param("id") id: string) {
    return this.banking.disconnectBank(req.user as AuthenticatedUser, id);
  }

  // --- Transactions ---

  @Get("transactions")
  getTransactions(
    @Req() req: any,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("minAmount") minAmount?: string,
    @Query("maxAmount") maxAmount?: string,
    @Query("pending") pending?: string,
    @Query("connectionId") connectionId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.banking.getTransactions(actor.companyId, {
      startDate,
      endDate,
      search,
      category,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      pending: pending !== undefined ? pending === "true" : undefined,
      connectionId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get("transactions/summary")
  getTransactionSummary(
    @Req() req: any,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.banking.getTransactionSummary(actor.companyId, startDate, endDate);
  }
}
