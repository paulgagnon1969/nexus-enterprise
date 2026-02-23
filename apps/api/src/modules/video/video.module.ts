import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { VideoService } from "./video.service";
import { VideoController } from "./video.controller";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [VideoService],
  controllers: [VideoController],
  exports: [VideoService],
})
export class VideoModule {}
