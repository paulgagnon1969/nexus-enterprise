import { Module } from "@nestjs/common";
import { CamAccessController } from "./cam-access.controller";
import { CamAccessService } from "./cam-access.service";
import { CamDigestService } from "./cam-digest.service";
import { CamDiscussionService } from "./cam-discussion.service";
import {
  CamDiscussionPublicController,
  CamDiscussionAdminController,
  CamSubscriptionPublicController,
} from "./cam-discussion.controller";
import { DocumentsModule } from "../documents/documents.module";
import { CommonModule } from "../../common/common.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [DocumentsModule, CommonModule, NotificationsModule],
  controllers: [
    CamAccessController,
    CamDiscussionPublicController,
    CamDiscussionAdminController,
    CamSubscriptionPublicController,
  ],
  providers: [CamAccessService, CamDigestService, CamDiscussionService],
})
export class CamAccessModule {}
