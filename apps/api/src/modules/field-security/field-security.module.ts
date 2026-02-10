import { Module } from "@nestjs/common";
import { FieldSecurityService } from "./field-security.service";
import { FieldSecurityController } from "./field-security.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [FieldSecurityService],
  controllers: [FieldSecurityController],
  exports: [FieldSecurityService],
})
export class FieldSecurityModule {}
