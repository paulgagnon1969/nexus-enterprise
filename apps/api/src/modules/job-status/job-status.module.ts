import { Module } from "@nestjs/common";
import { JobStatusService } from "./job-status.service";
import { JobStatusController } from "./job-status.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [JobStatusService],
  controllers: [JobStatusController],
})
export class JobStatusModule {}
