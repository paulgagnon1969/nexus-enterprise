-- AlterEnum: Add new NotificationKind values
ALTER TYPE "NotificationKind" ADD VALUE 'DAILY_BRIEF';
ALTER TYPE "NotificationKind" ADD VALUE 'PETL_CHANGE';
ALTER TYPE "NotificationKind" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "NotificationKind" ADD VALUE 'TASK_DUE';
ALTER TYPE "NotificationKind" ADD VALUE 'SCHEDULE_ALERT';

-- AlterTable: Add Daily Brief and module toggle fields to NotificationPreference
ALTER TABLE "NotificationPreference" ADD COLUMN "dailyBriefTime" TEXT NOT NULL DEFAULT '06:00';
ALTER TABLE "NotificationPreference" ADD COLUMN "dailyBriefContent" JSONB;
ALTER TABLE "NotificationPreference" ADD COLUMN "dailyBriefSentDate" TIMESTAMP(3);
ALTER TABLE "NotificationPreference" ADD COLUMN "petlChangeAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "taskAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "scheduleAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "emailDigest" BOOLEAN NOT NULL DEFAULT false;
