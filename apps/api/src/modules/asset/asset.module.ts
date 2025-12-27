import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AssetRepository } from "../../infra/prisma-v1/asset.repository";
import { AssetController } from "./asset.controller";

@Module({
  imports: [PrismaModule],
  providers: [AssetRepository],
  controllers: [AssetController],
  exports: [AssetRepository]
})
export class AssetModule {}
