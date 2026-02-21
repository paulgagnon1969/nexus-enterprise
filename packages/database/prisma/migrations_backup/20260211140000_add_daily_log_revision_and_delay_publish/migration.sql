-- Add delay publish fields to DailyLog
ALTER TABLE "DailyLog" ADD COLUMN "isDelayedPublish" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyLog" ADD COLUMN "delayedById" TEXT;
ALTER TABLE "DailyLog" ADD COLUMN "delayedAt" TIMESTAMP(3);
ALTER TABLE "DailyLog" ADD COLUMN "publishedById" TEXT;
ALTER TABLE "DailyLog" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Create DailyLogRevision table
CREATE TABLE "DailyLogRevision" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changesJson" TEXT NOT NULL,
    "previousValuesJson" TEXT NOT NULL,

    CONSTRAINT "DailyLogRevision_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "DailyLog_delayed_idx" ON "DailyLog"("isDelayedPublish");
CREATE INDEX "DailyLogRevision_log_idx" ON "DailyLogRevision"("dailyLogId");
CREATE UNIQUE INDEX "DailyLogRevision_log_revision_key" ON "DailyLogRevision"("dailyLogId", "revisionNumber");

-- Add foreign keys
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_delayedById_fkey" FOREIGN KEY ("delayedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyLogRevision" ADD CONSTRAINT "DailyLogRevision_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyLogRevision" ADD CONSTRAINT "DailyLogRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
