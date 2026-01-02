import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { ProjectGroupController } from "./project-group.controller";
import { ProjectGroupService } from "./project-group.service";

@Module({
  imports: [PrismaModule],
  controllers: [ProjectGroupController],
  providers: [ProjectGroupService],
})
export class ProjectGroupModule {}
