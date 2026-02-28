import { Module } from "@nestjs/common";
import { BankingService } from "./banking.service";
import { BankingController } from "./banking.controller";
import { CsvImportService } from "./csv-import.service";
import { CsvImportController } from "./csv-import.controller";

/**
 * Banking module — Plaid Transactions integration + CSV imports.
 *
 * Re-uses PLAID_CLIENT from the global BillingModule (which exports it).
 * PrismaModule is also global, so no explicit import needed.
 */
@Module({
  providers: [BankingService, CsvImportService],
  controllers: [BankingController, CsvImportController],
  exports: [BankingService, CsvImportService],
})
export class BankingModule {}
