import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { DeviceSyncStrategy } from "./device-sync.strategy";
import { RolesGuard, GlobalRolesGuard } from "./auth.guards";
import { SandboxGuard } from "./sandbox.guard";
import { SandboxCleanupService } from "./sandbox-cleanup.service";
import { LicenseService } from "./license.service";
import { DeviceTrustService } from "./device-trust.service";
import { Reflector } from "@nestjs/core";
import { FeaturesModule } from "../features/features.module";

@Module({
  imports: [
    FeaturesModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "change-me-access",
      // Use a fixed default TTL in seconds to satisfy strict typing
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL) || 86400 }
    })
  ],
  providers: [
    AuthService,
    LicenseService,
    DeviceTrustService,
    JwtStrategy,
    DeviceSyncStrategy,
    RolesGuard,
    GlobalRolesGuard,
    SandboxGuard,
    SandboxCleanupService,
    Reflector,
  ],
  controllers: [AuthController],
  exports: [AuthService, LicenseService, DeviceTrustService, SandboxGuard]
})
export class AuthModule {}
