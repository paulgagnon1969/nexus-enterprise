import { Module } from "@nestjs/common";
import { OnboardingService } from "./onboarding.service";
import { OnboardingController } from "./onboarding.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [OnboardingService],
  controllers: [OnboardingController]
})
export class OnboardingModule {}
