-- CreateEnum
CREATE TYPE "ProjectInvoiceCategory" AS ENUM ('PETL', 'EXPENSE', 'HOURS');

-- AlterTable
ALTER TABLE "ProjectInvoice" ADD COLUMN "category" "ProjectInvoiceCategory" NOT NULL DEFAULT 'PETL';
