import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import { ReceiptOcrService } from './receipt-ocr.service';
import { OcrController } from './ocr.controller';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { MinioStorageService } from '../../infra/storage/minio-storage.service';
import { LocationsModule } from '../locations/locations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptInventoryBridgeService } from '../daily-log/receipt-inventory-bridge.service';
import { TaskService } from '../task/task.service';
import { AuditService } from '../../common/audit.service';
import { NexfindModule } from '../nexfind/nexfind.module';
import { ProcurementModule } from '../procurement/procurement.module';

const StorageProvider = {
  provide: ObjectStorageService,
  useClass: MinioStorageService,
};

@Module({
  imports: [PrismaModule, ConfigModule, LocationsModule, NotificationsModule, NexfindModule, ProcurementModule],
  controllers: [OcrController],
  providers: [OpenAiOcrProvider, ReceiptOcrService, StorageProvider, ReceiptInventoryBridgeService, TaskService, AuditService],
  exports: [ReceiptOcrService, OpenAiOcrProvider, ReceiptInventoryBridgeService],
})
export class OcrModule {}
