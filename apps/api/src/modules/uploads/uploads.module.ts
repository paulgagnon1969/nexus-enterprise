import { Global, Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadProxyController } from "./upload-proxy.controller";
import { UploadProxyService } from "./upload-proxy.service";

@Global()
@Module({
  controllers: [UploadsController, UploadProxyController],
  providers: [UploadProxyService],
  exports: [UploadProxyService],
})
export class UploadsModule {}
