-- CreateEnum
CREATE TYPE "ProjectInvoicePetlLineBillingTag" AS ENUM ('NONE', 'CHANGE_ORDER', 'SUPPLEMENT', 'WARRANTY');

-- AlterTable
ALTER TABLE "ProjectInvoicePetlLine" ADD COLUMN     "billingTag" "ProjectInvoicePetlLineBillingTag" NOT NULL DEFAULT 'NONE';
