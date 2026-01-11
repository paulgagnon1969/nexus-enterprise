import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { EmailService } from "./email.service";
import { GcsService } from "../infra/storage/gcs.service";
import { MessageBirdSmsClient } from "./messagebird-sms.client";

@Global()
@Module({
  providers: [AuditService, EmailService, GcsService, MessageBirdSmsClient],
  exports: [AuditService, EmailService, GcsService, MessageBirdSmsClient]
})
export class CommonModule {}
