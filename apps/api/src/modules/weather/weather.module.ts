import { Module } from "@nestjs/common";
import { WeatherService } from "./weather.service";
import { WeatherController } from "./weather.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [WeatherService],
  controllers: [WeatherController],
  exports: [WeatherService],
})
export class WeatherModule {}
