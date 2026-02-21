-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "completedChunks" INTEGER,
ADD COLUMN     "fileUri" TEXT,
ADD COLUMN     "metaJson" JSONB,
ADD COLUMN     "totalChunks" INTEGER;
