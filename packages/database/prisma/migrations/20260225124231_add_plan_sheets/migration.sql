-- CreateEnum
CREATE TYPE "PlanSheetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "ImportJobType" ADD VALUE 'PLAN_SHEETS';

-- CreateTable
CREATE TABLE "PlanSheet" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "sheetId" TEXT,
    "title" TEXT,
    "section" TEXT,
    "status" "PlanSheetStatus" NOT NULL DEFAULT 'PENDING',
    "thumbPath" TEXT,
    "standardPath" TEXT,
    "masterPath" TEXT,
    "thumbBytes" INTEGER NOT NULL DEFAULT 0,
    "standardBytes" INTEGER NOT NULL DEFAULT 0,
    "masterBytes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanSheet_upload_sort_idx" ON "PlanSheet"("uploadId", "sortOrder");

-- AddForeignKey
ALTER TABLE "PlanSheet" ADD CONSTRAINT "PlanSheet_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "ProjectDrawingUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
