import { Global, Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadProxyController } from "./upload-proxy.controller";
import { UploadProxyService } from "./upload-proxy.service";
import { FileProxyController } from "./file-proxy.controller";

@Global()
@Module({
  controllers: [UploadsController, UploadProxyController, FileProxyController],
  providers: [UploadProxyService],
  exports: [UploadProxyService],
})
export class UploadsModule {}
