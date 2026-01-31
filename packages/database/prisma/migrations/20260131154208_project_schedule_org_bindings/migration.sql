-- AlterTable
ALTER TABLE "ProjectInvoicePetlLine" ADD COLUMN     "sourceLineNoSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "SowItem" ADD COLUMN     "sourceLineNo" INTEGER;

-- CreateTable
CREATE TABLE "ProjectScheduleTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "syntheticId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "room" TEXT,
    "trade" TEXT NOT NULL,
    "phaseCode" INTEGER NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" DOUBLE PRECISION NOT NULL,
    "totalLaborHours" DOUBLE PRECISION,
    "crewSize" INTEGER,
    "predecessorIds" JSONB,
    "projectUnitId" TEXT,
    "projectParticleId" TEXT,
    "orgGroupCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectScheduleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectScheduleChangeLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "scheduleTaskId" TEXT NOT NULL,
    "taskSyntheticId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousStartDate" TIMESTAMP(3),
    "previousEndDate" TIMESTAMP(3),
    "previousDurationDays" DOUBLE PRECISION,
    "newStartDate" TIMESTAMP(3),
    "newEndDate" TIMESTAMP(3),
    "newDurationDays" DOUBLE PRECISION,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectScheduleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_estimate_idx" ON "ProjectScheduleTask"("projectId", "estimateVersionId");

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_unit_idx" ON "ProjectScheduleTask"("projectId", "projectUnitId");

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_particle_idx" ON "ProjectScheduleTask"("projectId", "projectParticleId");

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_orggroup_idx" ON "ProjectScheduleTask"("projectId", "orgGroupCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScheduleTask_project_estimate_synth_idx" ON "ProjectScheduleTask"("projectId", "estimateVersionId", "syntheticId");

-- CreateIndex
CREATE INDEX "ProjectScheduleChangeLog_project_estimate_created_idx" ON "ProjectScheduleChangeLog"("projectId", "estimateVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectScheduleChangeLog_task_created_idx" ON "ProjectScheduleChangeLog"("scheduleTaskId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectScheduleTask" ADD CONSTRAINT "ProjectScheduleTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleTask" ADD CONSTRAINT "ProjectScheduleTask_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ProjectScheduleTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
