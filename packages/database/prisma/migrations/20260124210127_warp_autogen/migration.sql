-- AlterTable
ALTER TABLE "CandidateInterest" ADD COLUMN     "baseHourlyRate" DOUBLE PRECISION,
ADD COLUMN     "cpFringeHourlyRate" DOUBLE PRECISION,
ADD COLUMN     "cpHourlyRate" DOUBLE PRECISION,
ADD COLUMN     "dayRate" DOUBLE PRECISION,
ADD COLUMN     "employmentEndDate" TIMESTAMP(3),
ADD COLUMN     "employmentStartDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Worker" ALTER COLUMN "defaultHoursPerDay" SET DEFAULT 10;
