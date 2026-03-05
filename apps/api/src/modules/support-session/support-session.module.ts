import { Module } from "@nestjs/common";
import { SupportSessionController } from "./support-session.controller";
import { SupportSessionService } from "./support-session.service";
import { SupportSessionGateway } from "./support-session.gateway";

@Module({
  controllers: [SupportSessionController],
  providers: [SupportSessionService, SupportSessionGateway],
  exports: [SupportSessionService],
})
export class SupportSessionModule {}
