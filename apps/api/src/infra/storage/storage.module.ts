import { Module } from "@nestjs/common";
import { ObjectStorageService } from "./object-storage.service";
import { MinioStorageService } from "./minio-storage.service";

@Module({
  providers: [
    {
      provide: ObjectStorageService,
      useClass: MinioStorageService,
    },
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
