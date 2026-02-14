import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import { ReceiptOcrService } from './receipt-ocr.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [OpenAiOcrProvider, ReceiptOcrService],
  exports: [ReceiptOcrService],
})
export class OcrModule {}
