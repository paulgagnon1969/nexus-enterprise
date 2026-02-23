import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, PushService],
  controllers: [NotificationsController],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
