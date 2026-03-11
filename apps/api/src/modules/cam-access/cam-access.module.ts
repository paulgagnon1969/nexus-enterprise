import { Module } from "@nestjs/common";
import { CamAccessController } from "./cam-access.controller";
import { CamAccessService } from "./cam-access.service";
import { DocumentsModule } from "../documents/documents.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [DocumentsModule, CommonModule],
  controllers: [CamAccessController],
  providers: [CamAccessService],
})
export class CamAccessModule {}
