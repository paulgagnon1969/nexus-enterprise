-- CreateEnum
CREATE TYPE "TaxRateSource" AS ENUM ('TAPOUT_BASELINE', 'MANUAL', 'AUTO_SUGGESTED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "taxJurisdictionId" TEXT;

-- CreateTable
CREATE TABLE "PayrollWeekRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectCode" TEXT,
    "workerId" TEXT,
    "employeeId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "ssn" TEXT,
    "classCode" TEXT,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "employmentType" TEXT NOT NULL,
    "baseHourlyRate" DOUBLE PRECISION,
    "dayRate" DOUBLE PRECISION,
    "dayRateBaseHours" DOUBLE PRECISION,
    "totalPay" DOUBLE PRECISION NOT NULL,
    "totalHoursSt" DOUBLE PRECISION,
    "totalHoursOt" DOUBLE PRECISION,
    "totalHoursDt" DOUBLE PRECISION,
    "dailyHoursJson" JSONB,

    CONSTRAINT "PayrollWeekRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxJurisdiction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "state" TEXT NOT NULL,
    "county" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "postalPrefix" TEXT,
    "fedRate" DOUBLE PRECISION NOT NULL,
    "ficaRate" DOUBLE PRECISION NOT NULL,
    "medicareRate" DOUBLE PRECISION NOT NULL,
    "stateRate" DOUBLE PRECISION NOT NULL,
    "localRate" DOUBLE PRECISION NOT NULL,
    "representational" BOOLEAN NOT NULL DEFAULT true,
    "source" "TaxRateSource" NOT NULL DEFAULT 'TAPOUT_BASELINE',
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxJurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollWeekRecord_company_week_idx" ON "PayrollWeekRecord"("companyId", "weekEndDate");

-- CreateIndex
CREATE INDEX "PayrollWeekRecord_company_projcode_week_idx" ON "PayrollWeekRecord"("companyId", "projectCode", "weekEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollWeekRecord_companyId_projectCode_weekEndDate_employe_key" ON "PayrollWeekRecord"("companyId", "projectCode", "weekEndDate", "employeeId");

-- CreateIndex
CREATE INDEX "TaxJurisdiction_companyId_state_postalCode_idx" ON "TaxJurisdiction"("companyId", "state", "postalCode");

-- CreateIndex
CREATE INDEX "TaxJurisdiction_companyId_state_postalPrefix_idx" ON "TaxJurisdiction"("companyId", "state", "postalPrefix");

-- CreateIndex
CREATE INDEX "TaxJurisdiction_companyId_state_county_idx" ON "TaxJurisdiction"("companyId", "state", "county");

-- AddForeignKey
ALTER TABLE "PayrollWeekRecord" ADD CONSTRAINT "PayrollWeekRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollWeekRecord" ADD CONSTRAINT "PayrollWeekRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_taxJurisdictionId_fkey" FOREIGN KEY ("taxJurisdictionId") REFERENCES "TaxJurisdiction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxJurisdiction" ADD CONSTRAINT "TaxJurisdiction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
