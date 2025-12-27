-- CreateEnum
CREATE TYPE "CompanyTrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialStatus" "CompanyTrialStatus";
