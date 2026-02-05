import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { PnpController } from "./pnp.controller";
import { PnpAdminController } from "./pnp-admin.controller";
import { PnpService } from "./pnp.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PnpController, PnpAdminController],
  providers: [PnpService],
  exports: [PnpService],
})
export class PnpModule {}
