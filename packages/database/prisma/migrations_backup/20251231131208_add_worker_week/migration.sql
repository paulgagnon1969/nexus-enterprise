-- CreateTable
CREATE TABLE "WorkerWeek" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "projectCode" TEXT NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "totalHoursSt" DOUBLE PRECISION,
    "totalHoursOt" DOUBLE PRECISION,
    "sourceFile" TEXT,

    CONSTRAINT "WorkerWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerWeek_week_scope_idx" ON "WorkerWeek"("weekEndDate", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerWeek_workerId_weekEndDate_projectCode_key" ON "WorkerWeek"("workerId", "weekEndDate", "projectCode");

-- AddForeignKey
ALTER TABLE "WorkerWeek" ADD CONSTRAINT "WorkerWeek_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
