import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { SystemTagsService } from "./system-tags.service";
import { SystemTagsController, CompanyTagsController } from "./system-tags.controller";

@Module({
  imports: [PrismaModule],
  controllers: [SystemTagsController, CompanyTagsController],
  providers: [SystemTagsService],
  exports: [SystemTagsService],
})
export class SystemTagsModule {}
