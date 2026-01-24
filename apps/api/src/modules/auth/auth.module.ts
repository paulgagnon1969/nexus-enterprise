import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { RolesGuard, GlobalRolesGuard } from "./auth.guards";
import { Reflector } from "@nestjs/core";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "change-me-access",
      // Use a fixed default TTL in seconds to satisfy strict typing
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL) || 86400 }
    })
  ],
  providers: [AuthService, JwtStrategy, RolesGuard, GlobalRolesGuard, Reflector],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
