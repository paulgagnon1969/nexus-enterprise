import { Module } from "@nestjs/common";
import { ManualsController } from "./manuals.controller";
import { ManualsService } from "./manuals.service";
import { ManualRenderService } from "./manual-render.service";
import { ManualPdfService } from "./manual-pdf.service";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ManualsController],
  providers: [ManualsService, ManualRenderService, ManualPdfService],
  exports: [ManualsService, ManualRenderService, ManualPdfService],
})
export class ManualsModule {}
