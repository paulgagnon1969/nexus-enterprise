import { Module } from "@nestjs/common";
import { VjnService } from "./vjn.service";
import { VjnController } from "./vjn.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { TranscriptionModule } from "../transcription/transcription.module";

@Module({
  imports: [PrismaModule, TranscriptionModule],
  providers: [VjnService],
  controllers: [VjnController],
  exports: [VjnService],
})
export class VjnModule {}
