import { Module } from "@nestjs/common";
import { FeaturesController } from "./features.controller";
import { FeaturesService } from "./features.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [NotificationsModule, CommonModule],
  controllers: [FeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
