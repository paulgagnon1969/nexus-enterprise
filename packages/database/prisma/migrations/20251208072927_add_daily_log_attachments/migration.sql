-- CreateTable
CREATE TABLE "DailyLogAttachment" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyLogAttachment_log_idx" ON "DailyLogAttachment"("dailyLogId");

-- AddForeignKey
ALTER TABLE "DailyLogAttachment" ADD CONSTRAINT "DailyLogAttachment_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
