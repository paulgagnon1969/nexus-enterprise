import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { EmailService } from "./email.service";
import { ObjectStorageService } from "../infra/storage/object-storage.service";
import { GcsStorageService } from "../infra/storage/gcs-storage.service";
import { MinioStorageService } from "../infra/storage/minio-storage.service";
import { MessageBirdSmsClient } from "./messagebird-sms.client";

const StorageProvider = {
  provide: ObjectStorageService,
  useClass:
    process.env.STORAGE_PROVIDER === "minio"
      ? MinioStorageService
      : GcsStorageService,
};

@Global()
@Module({
  providers: [AuditService, EmailService, StorageProvider, MessageBirdSmsClient],
  exports: [AuditService, EmailService, ObjectStorageService, MessageBirdSmsClient]
})
export class CommonModule {}
