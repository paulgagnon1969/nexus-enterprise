-- CreateEnum
CREATE TYPE "NttSubjectType" AS ENUM ('APPLICATION_QUESTION', 'APPLICATION_FAILURE', 'UI_IMPROVEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "NttStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED', 'DEFERRED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "relatedEntityId" TEXT,
ADD COLUMN     "relatedEntityType" TEXT,
ADD COLUMN     "reminderIntervalMinutes" INTEGER;

-- CreateTable
CREATE TABLE "NttTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "initiatorUserId" TEXT NOT NULL,
    "subjectType" "NttSubjectType" NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "NttStatus" NOT NULL DEFAULT 'NEW',
    "severity" "TaskPriority",
    "pagePath" TEXT,
    "pageLabel" TEXT,
    "contextJson" JSONB,
    "noteThreadId" TEXT,
    "primaryFaqId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "NttTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimecardEditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timecardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "oldWorkerId" TEXT NOT NULL,
    "newWorkerId" TEXT NOT NULL,
    "locationCode" TEXT,
    "oldStHours" DOUBLE PRECISION NOT NULL,
    "oldOtHours" DOUBLE PRECISION NOT NULL,
    "oldDtHours" DOUBLE PRECISION NOT NULL,
    "newStHours" DOUBLE PRECISION NOT NULL,
    "newOtHours" DOUBLE PRECISION NOT NULL,
    "newDtHours" DOUBLE PRECISION NOT NULL,
    "editedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimecardEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NttTicket_company_status_created_idx" ON "NttTicket"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NttTicket_initiator_created_idx" ON "NttTicket"("initiatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TimecardEditLog_company_project_date_idx" ON "TimecardEditLog"("companyId", "projectId", "date");

-- CreateIndex
CREATE INDEX "Task_related_entity_idx" ON "Task"("companyId", "relatedEntityType", "relatedEntityId");

-- AddForeignKey
ALTER TABLE "NttTicket" ADD CONSTRAINT "NttTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NttTicket" ADD CONSTRAINT "NttTicket_initiatorUserId_fkey" FOREIGN KEY ("initiatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NttTicket" ADD CONSTRAINT "NttTicket_noteThreadId_fkey" FOREIGN KEY ("noteThreadId") REFERENCES "MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimecardEditLog" ADD CONSTRAINT "TimecardEditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimecardEditLog" ADD CONSTRAINT "TimecardEditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimecardEditLog" ADD CONSTRAINT "TimecardEditLog_timecardId_fkey" FOREIGN KEY ("timecardId") REFERENCES "DailyTimecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
