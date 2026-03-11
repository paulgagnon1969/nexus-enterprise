-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isSandbox" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CompanyMembership" ADD COLUMN     "sandbox_last_active_at" TIMESTAMP(3);
