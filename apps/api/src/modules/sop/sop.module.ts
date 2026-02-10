import { Module } from "@nestjs/common";
import { SopController } from "./sop.controller";
import { SopService } from "./sop.service";

@Module({
  controllers: [SopController],
  providers: [SopService],
  exports: [SopService],
})
export class SopModule {}
