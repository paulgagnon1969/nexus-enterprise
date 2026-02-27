import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GeocodingService } from "./geocoding.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
