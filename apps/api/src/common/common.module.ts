import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { EmailService } from "./email.service";
import { GcsService } from "../infra/storage/gcs.service";

@Global()
@Module({
  providers: [AuditService, EmailService, GcsService],
  exports: [AuditService, EmailService, GcsService]
})
export class CommonModule {}
