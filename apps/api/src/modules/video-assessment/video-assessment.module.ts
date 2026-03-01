import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { VideoAssessmentController } from './video-assessment.controller';
import { VideoAssessmentService } from './video-assessment.service';
import { GeminiService } from './gemini.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
  ],
  controllers: [VideoAssessmentController],
  providers: [VideoAssessmentService, GeminiService],
  exports: [VideoAssessmentService],
})
export class VideoAssessmentModule {}
