import { Module } from "@nestjs/common";
import { DevSessionController } from "./dev-session.controller";
import { DevSessionService } from "./dev-session.service";
import { DevSessionGateway } from "./dev-session.gateway";
import { PushService } from "../notifications/push.service";

@Module({
  controllers: [DevSessionController],
  providers: [DevSessionService, DevSessionGateway, PushService],
  exports: [DevSessionService, DevSessionGateway],
})
export class DevSessionModule {}
