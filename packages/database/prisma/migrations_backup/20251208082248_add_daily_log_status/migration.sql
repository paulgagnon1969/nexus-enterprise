-- CreateEnum
CREATE TYPE "DailyLogStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "effectiveShareClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "DailyLogStatus" NOT NULL DEFAULT 'SUBMITTED';
