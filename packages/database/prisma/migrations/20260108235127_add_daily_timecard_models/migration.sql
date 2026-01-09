-- CreateTable
CREATE TABLE "DailyTimecard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTimeEntry" (
    "id" TEXT NOT NULL,
    "timecardId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "locationCode" TEXT,
    "stHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dtHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyTimecard_company_date_idx" ON "DailyTimecard"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTimecard_companyId_projectId_date_key" ON "DailyTimecard"("companyId", "projectId", "date");

-- CreateIndex
CREATE INDEX "DailyTimeEntry_timecard_worker_idx" ON "DailyTimeEntry"("timecardId", "workerId");

-- CreateIndex
CREATE INDEX "DailyTimeEntry_worker_idx" ON "DailyTimeEntry"("workerId");

-- AddForeignKey
ALTER TABLE "DailyTimecard" ADD CONSTRAINT "DailyTimecard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimecard" ADD CONSTRAINT "DailyTimecard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimecard" ADD CONSTRAINT "DailyTimecard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimeEntry" ADD CONSTRAINT "DailyTimeEntry_timecardId_fkey" FOREIGN KEY ("timecardId") REFERENCES "DailyTimecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimeEntry" ADD CONSTRAINT "DailyTimeEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
