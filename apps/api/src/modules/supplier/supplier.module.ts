import { Module } from "@nestjs/common";
import { SupplierController } from "./supplier.controller";
import { SupplierService } from "./supplier.service";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Module({
  controllers: [SupplierController],
  providers: [SupplierService, PrismaService],
  exports: [SupplierService],
})
export class SupplierModule {}
