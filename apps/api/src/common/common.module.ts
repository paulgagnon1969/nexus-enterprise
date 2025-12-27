import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { EmailService } from "./email.service";
import { CleanupService } from "./cleanup.service";

@Global()
@Module({
  providers: [AuditService, EmailService, CleanupService],
  exports: [AuditService, EmailService]
})
export class CommonModule {}
