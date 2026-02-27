import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import { ReceiptOcrService } from './receipt-ocr.service';
import { OcrController } from './ocr.controller';
import { GcsService } from '../../infra/storage/gcs.service';
import { LocationsModule } from '../locations/locations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptInventoryBridgeService } from '../daily-log/receipt-inventory-bridge.service';
import { TaskService } from '../task/task.service';
import { AuditService } from '../../common/audit.service';

@Module({
  imports: [PrismaModule, ConfigModule, LocationsModule, NotificationsModule],
  controllers: [OcrController],
  providers: [OpenAiOcrProvider, ReceiptOcrService, GcsService, ReceiptInventoryBridgeService, TaskService, AuditService],
  exports: [ReceiptOcrService, OpenAiOcrProvider, ReceiptInventoryBridgeService],
})
export class OcrModule {}
