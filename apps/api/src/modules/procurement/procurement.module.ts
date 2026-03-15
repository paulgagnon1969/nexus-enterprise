import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { SupplierCatalogModule } from '../supplier-catalog/supplier-catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { CbaEngineService } from './cba-engine.service';
import { SupplierOptimizerService } from './supplier-optimizer.service';
import { ProductIntelligenceService } from './product-intelligence.service';
import { BulkDetectionService } from './bulk-detection.service';
import { EmailService } from '../../common/email.service';

@Module({
  imports: [PrismaModule, SupplierCatalogModule, NotificationsModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, CbaEngineService, SupplierOptimizerService, ProductIntelligenceService, BulkDetectionService, EmailService],
  exports: [ProcurementService, ProductIntelligenceService, BulkDetectionService],
})
export class ProcurementModule {}
