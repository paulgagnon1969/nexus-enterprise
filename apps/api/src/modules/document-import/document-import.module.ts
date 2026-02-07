import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { DocumentImportController } from "./document-import.controller";
import { DocumentImportService } from "./document-import.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DocumentImportController],
  providers: [DocumentImportService],
  exports: [DocumentImportService],
})
export class DocumentImportModule {}
