import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { RedisModule } from "../../infra/redis/redis.module";
import { SupplierCatalogController } from "./supplier-catalog.controller";
import { SupplierCatalogService } from "./supplier-catalog.service";
import { BigBoxProvider } from "./bigbox.provider";
import { SerpApiProvider } from "./serpapi.provider";
import { LowesProvider } from "./lowes.provider";

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [SupplierCatalogController],
  providers: [SupplierCatalogService, SerpApiProvider, BigBoxProvider, LowesProvider],
  exports: [SupplierCatalogService, BigBoxProvider, SerpApiProvider],
})
export class SupplierCatalogModule {}
