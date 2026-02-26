import { Module } from "@nestjs/common";
import { BidPackageService } from "./bid-package.service";
import { BidPackageController } from "./bid-package.controller";
import { SupplierPortalController } from "./supplier-portal.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [BidPackageService],
  controllers: [BidPackageController, SupplierPortalController],
  exports: [BidPackageService],
})
export class SupplierBiddingModule {}
