-- AlterEnum
ALTER TYPE "DailyLogType" ADD VALUE 'TADL';

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "jsaMissing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "jsaSafetyJson" JSONB,
ADD COLUMN     "personnelOnsiteJson" JSONB,
ADD COLUMN     "sourceJsaId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jsaReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "jsaReminderSentDate" TIMESTAMP(3),
ADD COLUMN     "jsaReminderTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "personnelFavoritesJson" JSONB;

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "hoursWorked" DECIMAL(6,2),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntry_daily_log_idx" ON "TimeEntry"("dailyLogId");

-- CreateIndex
CREATE INDEX "TimeEntry_project_user_idx" ON "TimeEntry"("projectId", "userId");

-- CreateIndex
CREATE INDEX "TimeEntry_company_user_idx" ON "TimeEntry"("companyId", "userId");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_sourceJsaId_fkey" FOREIGN KEY ("sourceJsaId") REFERENCES "DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
