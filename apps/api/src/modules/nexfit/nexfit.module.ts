import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NexfitController } from "./nexfit.controller";
import { NexfitService } from "./nexfit.service";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "change-me-access",
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL) || 86400 },
    }),
  ],
  controllers: [NexfitController],
  providers: [NexfitService],
})
export class NexfitModule {}
