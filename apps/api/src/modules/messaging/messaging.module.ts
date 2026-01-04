import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { MessagingService } from "./messaging.service";
import { MessagingController } from "./messaging.controller";
import { EmailService } from "../../common/email.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { RecipientGroupsController } from "./recipient-groups.controller";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [MessagingService, EmailService],
  controllers: [MessagingController, RecipientGroupsController],
})
export class MessagingModule {}
