import { Module } from "@nestjs/common";
import { SystemDocsController } from "./system-docs.controller";

@Module({
  controllers: [SystemDocsController],
})
export class SystemDocsModule {}
