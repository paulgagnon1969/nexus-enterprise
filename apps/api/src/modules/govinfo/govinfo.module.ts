import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { RedisModule } from "../../infra/redis/redis.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GovInfoController } from "./govinfo.controller";
import { GovInfoService } from "./govinfo.service";
import { FrMonitorService } from "./fr-monitor.service";
import { McpClientService } from "./mcp-client.service";
import { CfrHistoryService } from "./cfr-history.service";

@Module({
  imports: [PrismaModule, RedisModule, NotificationsModule],
  controllers: [GovInfoController],
  providers: [
    GovInfoService,
    FrMonitorService,
    McpClientService,
    CfrHistoryService,
  ],
  exports: [GovInfoService, McpClientService, CfrHistoryService],
})
export class GovInfoModule {}
