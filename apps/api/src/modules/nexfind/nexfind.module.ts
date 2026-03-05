import { Module } from "@nestjs/common";
import { NexfindService } from "./nexfind.service";
import { NexfindController } from "./nexfind.controller";
import { MapboxPlacesProvider } from "./mapbox-places.provider";
import { NexfindGuardHelper } from "./nexfind-guard.helper";

@Module({
  providers: [NexfindService, MapboxPlacesProvider, NexfindGuardHelper],
  controllers: [NexfindController],
  exports: [NexfindService, NexfindGuardHelper],
})
export class NexfindModule {}
