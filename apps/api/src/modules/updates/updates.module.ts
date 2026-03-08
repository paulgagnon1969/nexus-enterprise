import { Module } from "@nestjs/common";
import { StorageModule } from "../../infra/storage/storage.module";
import { UpdatesController } from "./updates.controller";
import { UpdatesService } from "./updates.service";

@Module({
  imports: [StorageModule],
  controllers: [UpdatesController],
  providers: [UpdatesService],
})
export class UpdatesModule {}
