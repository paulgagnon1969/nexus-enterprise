import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { RedisModule } from "../../infra/redis/redis.module";
import { SupplierCatalogController } from "./supplier-catalog.controller";
import { CatalogController } from "./catalog.controller";
import { SupplierCatalogService } from "./supplier-catalog.service";
import { BigBoxProvider } from "./bigbox.provider";
import { SerpApiProvider } from "./serpapi.provider";
import { SerpApiLowesProvider } from "./serpapi-lowes.provider";
import { LowesProvider } from "./lowes.provider";
import { SerpApiAmazonProvider } from "./serpapi-amazon.provider";
import { VendorRegistryService } from "./vendor-registry.service";
import { ShopService } from "./shop.service";

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [SupplierCatalogController, CatalogController],
  providers: [
    SupplierCatalogService,
    SerpApiProvider,
    BigBoxProvider,
    SerpApiLowesProvider,
    LowesProvider,
    SerpApiAmazonProvider,
    VendorRegistryService,
    ShopService,
  ],
  exports: [
    SupplierCatalogService,
    BigBoxProvider,
    SerpApiProvider,
    SerpApiLowesProvider,
    SerpApiAmazonProvider,
    VendorRegistryService,
    ShopService,
  ],
})
export class SupplierCatalogModule {}
