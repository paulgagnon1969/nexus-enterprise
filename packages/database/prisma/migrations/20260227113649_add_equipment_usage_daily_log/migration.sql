-- AlterEnum
ALTER TYPE "DailyLogType" ADD VALUE 'EQUIPMENT_USAGE';

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "equipmentUsageJson" JSONB;
