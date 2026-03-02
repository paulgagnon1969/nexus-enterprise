import { Module } from "@nestjs/common";
import { ObjectStorageService } from "./object-storage.service";
import { GcsStorageService } from "./gcs-storage.service";
import { MinioStorageService } from "./minio-storage.service";

@Module({
  providers: [
    {
      provide: ObjectStorageService,
      useClass:
        process.env.STORAGE_PROVIDER === "minio"
          ? MinioStorageService
          : GcsStorageService,
    },
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
