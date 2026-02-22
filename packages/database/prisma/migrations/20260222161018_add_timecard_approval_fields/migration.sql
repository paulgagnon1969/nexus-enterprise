-- AlterTable
ALTER TABLE "DailyTimecard" ADD COLUMN     "foremanApprovedAt" TIMESTAMP(3),
ADD COLUMN     "foremanNotes" TEXT,
ADD COLUMN     "foremanStatus" TEXT,
ADD COLUMN     "foremanUserId" TEXT,
ADD COLUMN     "payrollApprovedAt" TIMESTAMP(3),
ADD COLUMN     "payrollNotes" TEXT,
ADD COLUMN     "payrollStatus" TEXT,
ADD COLUMN     "payrollUserId" TEXT,
ADD COLUMN     "superApprovedAt" TIMESTAMP(3),
ADD COLUMN     "superNotes" TEXT,
ADD COLUMN     "superStatus" TEXT,
ADD COLUMN     "superUserId" TEXT;
