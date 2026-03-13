import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { SupplierCatalogModule } from '../supplier-catalog/supplier-catalog.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { CbaEngineService } from './cba-engine.service';
import { SupplierOptimizerService } from './supplier-optimizer.service';

@Module({
  imports: [PrismaModule, SupplierCatalogModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, CbaEngineService, SupplierOptimizerService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
