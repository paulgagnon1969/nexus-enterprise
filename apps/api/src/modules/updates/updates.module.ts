import { Module } from "@nestjs/common";
import { StorageModule } from "../../infra/storage/storage.module";
import { ComputeMeshModule } from "../compute-mesh/compute-mesh.module";
import { UpdatesController } from "./updates.controller";
import { UpdatesService } from "./updates.service";

@Module({
  imports: [StorageModule, ComputeMeshModule],
  controllers: [UpdatesController],
  providers: [UpdatesService],
})
export class UpdatesModule {}
