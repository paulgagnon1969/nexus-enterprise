import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { WorkerService } from "./worker.service";
import { WorkerController } from "./worker.controller";

@Module({
  imports: [PrismaModule],
  providers: [WorkerService],
  controllers: [WorkerController],
})
export class WorkerModule {}
