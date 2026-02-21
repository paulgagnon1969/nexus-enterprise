/*
  Warnings:

  - The values [MANUAL,AUTO_SUGGESTED] on the enum `TaxRateSource` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('GENERIC', 'REFERRAL', 'ONBOARDING', 'PROJECT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- AlterEnum
BEGIN;
CREATE TYPE "TaxRateSource_new" AS ENUM ('TAPOUT_BASELINE', 'COMPANY_OVERRIDE');
ALTER TABLE "public"."TaxJurisdiction" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "TaxJurisdiction" ALTER COLUMN "source" TYPE "TaxRateSource_new" USING ("source"::text::"TaxRateSource_new");
ALTER TYPE "TaxRateSource" RENAME TO "TaxRateSource_old";
ALTER TYPE "TaxRateSource_new" RENAME TO "TaxRateSource";
DROP TYPE "public"."TaxRateSource_old";
ALTER TABLE "TaxJurisdiction" ALTER COLUMN "source" SET DEFAULT 'TAPOUT_BASELINE';
COMMIT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT,
    "kind" "NotificationKind" NOT NULL DEFAULT 'GENERIC',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_user_read_created_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_company_created_idx" ON "Notification"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_project_created_idx" ON "Notification"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
