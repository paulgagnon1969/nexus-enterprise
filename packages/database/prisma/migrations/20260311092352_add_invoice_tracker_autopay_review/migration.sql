-- CreateEnum
CREATE TYPE "InvoiceActivityActor" AS ENUM ('CLIENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InvoiceActivityEvent" AS ENUM ('VIEW', 'PRINT', 'DOWNLOAD', 'PAYMENT_INITIATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "AutoPayReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'INVOICE_ACTIVITY';
ALTER TYPE "NotificationKind" ADD VALUE 'AUTO_PAY_UPDATE';

-- CreateTable
CREATE TABLE "InvoiceActivity" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorType" "InvoiceActivityActor" NOT NULL DEFAULT 'CLIENT',
    "actorId" TEXT,
    "eventType" "InvoiceActivityEvent" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoPayReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "AutoPayReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoPayReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceActivity_invoice_event_created_idx" ON "InvoiceActivity"("invoiceId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceActivity_company_project_idx" ON "InvoiceActivity"("companyId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoPayReview_paymentId_key" ON "AutoPayReview"("paymentId");

-- CreateIndex
CREATE INDEX "AutoPayReview_company_status_idx" ON "AutoPayReview"("companyId", "status");

-- CreateIndex
CREATE INDEX "AutoPayReview_project_status_idx" ON "AutoPayReview"("projectId", "status");

-- CreateIndex
CREATE INDEX "AutoPayReview_invoice_idx" ON "AutoPayReview"("invoiceId");

-- AddForeignKey
ALTER TABLE "InvoiceActivity" ADD CONSTRAINT "InvoiceActivity_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceActivity" ADD CONSTRAINT "InvoiceActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceActivity" ADD CONSTRAINT "InvoiceActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPayReview" ADD CONSTRAINT "AutoPayReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPayReview" ADD CONSTRAINT "AutoPayReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPayReview" ADD CONSTRAINT "AutoPayReview_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPayReview" ADD CONSTRAINT "AutoPayReview_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ProjectPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPayReview" ADD CONSTRAINT "AutoPayReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
