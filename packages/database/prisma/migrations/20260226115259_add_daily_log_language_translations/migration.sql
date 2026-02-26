-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "translationsJson" JSONB;
