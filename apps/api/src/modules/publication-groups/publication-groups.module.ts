import { Module } from "@nestjs/common";
import { PublicationGroupsController } from "./publication-groups.controller";
import { PublicationGroupsService } from "./publication-groups.service";

@Module({
  controllers: [PublicationGroupsController],
  providers: [PublicationGroupsService],
  exports: [PublicationGroupsService],
})
export class PublicationGroupsModule {}
