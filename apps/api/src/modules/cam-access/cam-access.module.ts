import { Module } from "@nestjs/common";
import { CamAccessController } from "./cam-access.controller";
import { CamAccessService } from "./cam-access.service";
import { DocumentsModule } from "../documents/documents.module";

@Module({
  imports: [DocumentsModule],
  controllers: [CamAccessController],
  providers: [CamAccessService],
})
export class CamAccessModule {}
