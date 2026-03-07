import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { SelectionsController } from './selections.controller';
import { SelectionsService } from './selections.service';
import { PlanningRoomService } from './planning-room.service';
import { VendorCatalogService } from './vendor-catalog.service';
import { SelectionSheetService } from './selection-sheet.service';
import { AiReviewService } from './ai-review.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SelectionsController],
  providers: [
    SelectionsService,
    PlanningRoomService,
    VendorCatalogService,
    SelectionSheetService,
    AiReviewService,
  ],
  exports: [SelectionsService, VendorCatalogService],
})
export class SelectionsModule {}
