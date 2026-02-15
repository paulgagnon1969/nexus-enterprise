import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import { ReceiptOcrService } from './receipt-ocr.service';
import { GcsService } from '../../infra/storage/gcs.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [OpenAiOcrProvider, ReceiptOcrService, GcsService],
  exports: [ReceiptOcrService],
})
export class OcrModule {}
