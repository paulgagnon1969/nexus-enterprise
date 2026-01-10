import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { RedisModule } from "./infra/redis/redis.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CompanyModule } from "./modules/company/company.module";
import { UserModule } from "./modules/user/user.module";
import { ProjectModule } from "./modules/project/project.module";
import { AdminModule } from "./modules/admin/admin.module";
import { CommonModule } from "./common/common.module";
import { TaskModule } from "./modules/task/task.module";
import { ParcelModule } from "./modules/parcel/parcel.module";
import { DevController } from "./modules/dev/dev.controller";
import { JobStatusModule } from "./modules/job-status/job-status.module";
import { TagModule } from "./modules/tag/tag.module";
import { RolesModule } from "./modules/roles/roles.module";
import { DailyLogModule } from "./modules/daily-log/daily-log.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { SkillsModule } from "./modules/skills/skills.module";
import { ReputationModule } from "./modules/reputation/reputation.module";
import { ImportJobsModule } from "./modules/import-jobs/import-jobs.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { AddressModule } from "./modules/address/address.module";
import { AssetModule } from "./modules/asset/asset.module";
import { ReferralsModule } from "./modules/referrals/referrals.module";
import { ProjectGroupModule } from "./modules/project-group/project-group.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { SystemDocsModule } from "./modules/system-docs/system-docs.module";
import { TimecardModule } from "./modules/timecard/timecard.module";
import { WorkerModule } from "./modules/worker/worker.module";
import { NttModule } from "./modules/ntt/ntt.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Look for env files both in the workspace root and this app directory
      // so DATABASE_URL / REDIS_URL are visible in dev regardless of cwd.
      envFilePath: [".env", "../../.env"]
    }),
    CommonModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    CompanyModule,
    UserModule,
    ProjectModule,
    TaskModule,
    ParcelModule,
    AdminModule,
    JobStatusModule,
    TagModule,
    RolesModule,
    DailyLogModule,
    OnboardingModule,
    SkillsModule,
    ReputationModule,
    ImportJobsModule,
    PricingModule,
    AddressModule,
    AssetModule,
    ReferralsModule,
    ProjectGroupModule,
    NotificationsModule,
    MessagingModule,
    SystemDocsModule,
    TimecardModule,
    WorkerModule,
    NttModule,
  ],
  controllers: [DevController]
})
export class AppModule {}
