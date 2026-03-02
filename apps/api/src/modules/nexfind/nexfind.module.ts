import { Module } from "@nestjs/common";
import { NexfindService } from "./nexfind.service";
import { NexfindController } from "./nexfind.controller";
import { GooglePlacesProvider } from "./google-places.provider";

@Module({
  providers: [NexfindService, GooglePlacesProvider],
  controllers: [NexfindController],
  exports: [NexfindService],
})
export class NexfindModule {}
