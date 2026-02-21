-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "defaultPayrollConfig" JSONB,
ADD COLUMN     "defaultTimeZone" TEXT;

-- AlterTable
ALTER TABLE "CompanyOffice" ADD COLUMN     "payrollConfig" JSONB;
