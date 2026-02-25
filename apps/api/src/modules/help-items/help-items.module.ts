import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { HelpItemsController } from "./help-items.controller";
import { HelpItemsService } from "./help-items.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HelpItemsController],
  providers: [HelpItemsService],
  exports: [HelpItemsService],
})
export class HelpItemsModule {}
