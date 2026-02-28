import { Module } from "@nestjs/common";
import { LocalSupplierService } from "./local-supplier.service";
import { LocalSupplierController } from "./local-supplier.controller";

@Module({
  providers: [LocalSupplierService],
  controllers: [LocalSupplierController],
  exports: [LocalSupplierService],
})
export class LocalSupplierModule {}
