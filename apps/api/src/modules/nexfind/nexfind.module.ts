import { Module } from "@nestjs/common";
import { NexfindService } from "./nexfind.service";
import { NexfindController } from "./nexfind.controller";
import { GooglePlacesProvider } from "./google-places.provider";
import { NexfindGuardHelper } from "./nexfind-guard.helper";

@Module({
  providers: [NexfindService, GooglePlacesProvider, NexfindGuardHelper],
  controllers: [NexfindController],
  exports: [NexfindService, NexfindGuardHelper],
})
export class NexfindModule {}
