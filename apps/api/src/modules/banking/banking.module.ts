import { Module } from "@nestjs/common";
import { BankingService } from "./banking.service";
import { BankingController } from "./banking.controller";
import { CsvImportService } from "./csv-import.service";
import { CsvImportController } from "./csv-import.controller";
import { PrescreenService } from "./prescreen.service";
import { PurchaseReconciliationService } from "./purchase-reconciliation.service";
import { PurchaseReconciliationController } from "./purchase-reconciliation.controller";
import { NexPriceService } from "./nexprice.service";

/**
 * Banking module — Plaid Transactions integration + CSV imports +
 * Purchase Reconciliation + NexPRICE regional pricing.
 *
 * Re-uses PLAID_CLIENT from the global BillingModule (which exports it).
 * PrismaModule is also global, so no explicit import needed.
 */
@Module({
  providers: [
    BankingService,
    CsvImportService,
    PrescreenService,
    PurchaseReconciliationService,
    NexPriceService,
  ],
  controllers: [BankingController, CsvImportController, PurchaseReconciliationController],
  exports: [
    BankingService,
    CsvImportService,
    PrescreenService,
    PurchaseReconciliationService,
    NexPriceService,
  ],
})
export class BankingModule {}
