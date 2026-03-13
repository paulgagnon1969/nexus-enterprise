import { Module } from "@nestjs/common";
import { CndaTemplatesController } from "./cnda-templates.controller";
import { CndaTemplatesService } from "./cnda-templates.service";

@Module({
  controllers: [CndaTemplatesController],
  providers: [CndaTemplatesService],
  exports: [CndaTemplatesService],
})
export class CndaTemplatesModule {}
