import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReceiptEmailController } from "./receipt-email.controller";
import { ReceiptEmailService } from "./receipt-email.service";
import { ReceiptEmailConnectorController } from "./receipt-email-connector.controller";
import { ReceiptEmailConnectorService } from "./receipt-email-connector.service";
import { TaskService } from "../task/task.service";
import { AuditService } from "../../common/audit.service";

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ReceiptEmailController, ReceiptEmailConnectorController],
  providers: [ReceiptEmailService, ReceiptEmailConnectorService, TaskService, AuditService],
  exports: [ReceiptEmailService, ReceiptEmailConnectorService],
})
export class ReceiptEmailModule {}
