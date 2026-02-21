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
import { DocumentsModule } from "./modules/documents/documents.module";
import { TimecardModule } from "./modules/timecard/timecard.module";
import { NttModule } from "./modules/ntt/ntt.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { XactScheduleModule } from "./modules/xact-schedule/xact-schedule.module";
import { PnpModule } from "./modules/pnp/pnp.module";
import { DocumentImportModule } from "./modules/document-import/document-import.module";
import { SopModule } from "./modules/sop/sop.module";
import { ClaimJournalModule } from "./modules/claim-journal/claim-journal.module";
import { FieldSecurityModule } from "./modules/field-security/field-security.module";
import { SystemDocumentsModule } from "./modules/system-documents/system-documents.module";
import { SystemTagsModule } from "./modules/system-tags/system-tags.module";
import { ManualsModule } from "./modules/manuals/manuals.module";
import { TenantDocumentsModule } from "./modules/tenant-documents/tenant-documents.module";
import { PublicDocsModule } from "./modules/public-docs/public-docs.module";
import { PublicationGroupsModule } from "./modules/publication-groups/publication-groups.module";
import { SavedPhrasesModule } from "./modules/saved-phrases/saved-phrases.module";
import { SupplierModule } from "./modules/supplier/supplier.module";
import { BidRequestModule } from "./modules/bid-request/bid-request.module";
import { BidPortalModule } from "./modules/bid-portal/bid-portal.module";
import { OcrModule } from "./modules/ocr/ocr.module";
import { OshaSyncModule } from "./modules/osha-sync/osha-sync.module";

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
    XactScheduleModule,
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
    DocumentsModule,
    TimecardModule,
    NttModule,
    UploadsModule,
    PnpModule,
    DocumentImportModule,
    SopModule,
    ClaimJournalModule,
    FieldSecurityModule,
    SystemDocumentsModule,
    SystemTagsModule,
    ManualsModule,
    TenantDocumentsModule,
    PublicDocsModule,
    PublicationGroupsModule,
    SavedPhrasesModule,
    SupplierModule,
    BidRequestModule,
    BidPortalModule,
    OcrModule,
    OshaSyncModule,
  ],
  controllers: [DevController]
})
export class AppModule {}
