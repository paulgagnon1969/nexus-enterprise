-- CreateEnum
CREATE TYPE "ProjectBillStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ProjectBillLineItemKind" AS ENUM ('MATERIALS', 'LABOR', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectBillLineItemAmountSource" AS ENUM ('MANUAL', 'TIMECARDS_DERIVED');

-- CreateTable
CREATE TABLE "ProjectBill" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "billNumber" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "ProjectBillStatus" NOT NULL DEFAULT 'DRAFT',
    "memo" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBillLineItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "kind" "ProjectBillLineItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amountSource" "ProjectBillLineItemAmountSource" NOT NULL DEFAULT 'MANUAL',
    "amount" DOUBLE PRECISION NOT NULL,
    "timecardStartDate" TIMESTAMP(3),
    "timecardEndDate" TIMESTAMP(3),
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBillLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBillAttachment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "projectFileId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBillAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBill_company_project_date_idx" ON "ProjectBill"("companyId", "projectId", "billDate");

-- CreateIndex
CREATE INDEX "ProjectBill_project_date_idx" ON "ProjectBill"("projectId", "billDate");

-- CreateIndex
CREATE INDEX "ProjectBillLineItem_bill_idx" ON "ProjectBillLineItem"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBillAttachment_bill_file_key" ON "ProjectBillAttachment"("billId", "projectFileId");

-- CreateIndex
CREATE INDEX "ProjectBillAttachment_bill_idx" ON "ProjectBillAttachment"("billId");

-- CreateIndex
CREATE INDEX "ProjectBillAttachment_project_file_idx" ON "ProjectBillAttachment"("projectFileId");

-- AddForeignKey
ALTER TABLE "ProjectBill" ADD CONSTRAINT "ProjectBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBill" ADD CONSTRAINT "ProjectBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBill" ADD CONSTRAINT "ProjectBill_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBillLineItem" ADD CONSTRAINT "ProjectBillLineItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBillAttachment" ADD CONSTRAINT "ProjectBillAttachment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBillAttachment" ADD CONSTRAINT "ProjectBillAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
