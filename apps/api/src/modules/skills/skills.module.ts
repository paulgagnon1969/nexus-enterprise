import { Module } from "@nestjs/common";
import { SkillsService } from "./skills.service";
import { SkillsController } from "./skills.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [SkillsService],
  controllers: [SkillsController],
})
export class SkillsModule {}
