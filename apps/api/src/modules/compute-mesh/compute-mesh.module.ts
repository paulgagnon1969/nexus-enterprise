import { Module } from "@nestjs/common";
import { RedisModule } from "../../infra/redis/redis.module";
import { ComputeMeshService } from "./compute-mesh.service";
import { ComputeMeshGateway } from "./compute-mesh.gateway";
import { MeshJobService } from "./mesh-job.service";
import { MeshSpeedController } from "./mesh-speed.controller";

@Module({
  imports: [RedisModule],
  controllers: [MeshSpeedController],
  providers: [ComputeMeshService, ComputeMeshGateway, MeshJobService],
  exports: [ComputeMeshService, MeshJobService],
})
export class ComputeMeshModule {}
