-- CreateEnum
CREATE TYPE "ProjectInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ProjectPaymentMethod" AS ENUM ('WIRE', 'ACH', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectPaymentStatus" AS ENUM ('RECORDED', 'VOID');

-- CreateTable
CREATE TABLE "CompanyInvoiceCounter" (
    "companyId" TEXT NOT NULL,
    "lastInvoiceNo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyInvoiceCounter_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "ProjectInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceSequenceNo" INTEGER,
    "invoiceNo" TEXT,
    "billToName" TEXT,
    "billToEmail" TEXT,
    "memo" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" "ProjectPaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "method" "ProjectPaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectInvoice_company_project_status_idx" ON "ProjectInvoice"("companyId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoice_company_invoice_seq_key" ON "ProjectInvoice"("companyId", "invoiceSequenceNo");

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_invoice_sort_idx" ON "ProjectInvoiceLineItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectPayment_company_project_paid_idx" ON "ProjectPayment"("companyId", "projectId", "paidAt");

-- CreateIndex
CREATE INDEX "ProjectPayment_invoice_idx" ON "ProjectPayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "CompanyInvoiceCounter" ADD CONSTRAINT "CompanyInvoiceCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayment" ADD CONSTRAINT "ProjectPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayment" ADD CONSTRAINT "ProjectPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayment" ADD CONSTRAINT "ProjectPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPayment" ADD CONSTRAINT "ProjectPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
